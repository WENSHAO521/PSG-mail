# PSG Mail 4.0 架构设计框架

> 状态:设计草案(RFC)  ·  基线版本:3.1.1  ·  目标版本:4.0.0
> 范围:`mail-worker`(Cloudflare Workers 后端)、`mail-vue`(Web / Electron / Android 客户端)、CI/发布流程

---

## 1. 背景与现状诊断

3.x 在功能上已经很完整(收发信、定时发送、标签、AI 助手、追踪器拦截、翻译、转发、Web Push、RBAC、开放 API、备份……),但随着功能叠加,出现以下结构性问题,这些就是 4.0 要解决的对象:

| # | 现状问题 | 证据 | 影响 |
|---|---|---|---|
| 1 | 业务按"技术层"平铺,没有模块边界 | `service/` 下 40+ 文件平级;`email-service.js` 1796 行;`user-service.js` 641 行 | 任何改动都可能波及全局,难以并行开发与测试 |
| 2 | 横切能力散落且重复 | AI(`ai-service` / `ai-mail-service` / `ai-assistant-service` / `ai-provider-service`)、通知(`notification` / `notification-event` / `web-push*` / `firebase-push` / `telegram` / `webhook`)、邮件发送(`resend` / `alibaba-directmail` / `s3`) | 新增一个渠道需要改多处,行为不一致 |
| 3 | 无统一的事件机制 | 收信后的垃圾检测、追踪器拦截、OTP 识别、转发、推送在 `email/email.js` 中顺序硬编码 | 流程不可插拔、失败互相影响、无法重试 |
| 4 | 后台任务靠 3 个 cron + 1 个 Durable Object 拼装 | `wrangler.toml` 的 `crons`、`ScheduledSendAlarm` | 无重试/死信,任务可观测性弱 |
| 5 | API 无版本、前后端契约靠约定 | `src/api/*-api.js` 直接挂根路径;前端 `request/*.js` 手写 | 破坏性变更无法灰度,第三方(Open API)被迫同步升级 |
| 6 | 后端纯 JS,实体/DTO/权限无类型约束 | `entity/*.js`、`model/result.js` | 重构风险高,依赖人工 review |
| 7 | 数据库迁移不完整 | `migrations/` 已有 0001–0015,但历史建表/加列仍在 `init/init.js`(121 处)及 8 个业务文件的请求期 DDL 中 | 升级路径不确定,难以回滚 |
| 8 | 三端(Web / Electron / Android)共用一个 Vue 工程但平台差异无抽象 | `electron/`、`android/`、`firebase-messaging-sw.js`、`psg-mail-sw.js` 与业务代码混在 `src/` | 平台特性(推送、通知、更新)与业务耦合 |
| 9 | 测试与质量门禁薄弱 | 后端仅 `vitest` 骨架;前端无测试、无 lint/typecheck | 回归靠手测 |
| 10 | 命名/品牌遗留 | `wrangler.toml` 中 `name = "cloud-mail"`、`dist` 绑定等 | 部署、监控中名称不一致 |

---

## 2. 4.0 目标与非目标

### 目标
1. **模块化**:后端按业务域拆分为自包含模块,模块间只通过公开接口与领域事件通信。
2. **可插拔**:邮件发送通道、AI 提供方、通知渠道、存储统一抽象为 Provider,新增渠道 = 新增一个适配器。
3. **事件驱动的邮件流水线**:收信/发信走显式的 Pipeline,各阶段可开关、可重试、可观测。
4. **契约优先**:`/api/v4` + 单一 schema 来源,前端 SDK 与 Open API 文档由 schema 生成。
5. **类型安全**:后端与共享层迁移到 TypeScript,渐进式落地。
6. **客户端分层**:`core`(业务) + `platform adapters`(Web / Electron / Android),业务代码不直接触碰平台 API。
7. **可升级、可回滚**:所有 schema 变更均为编号迁移;提供 3.x → 4.0 的自动迁移与回退方案。
8. **工程化**:统一 monorepo 工具链、lint、typecheck、单元/集成/E2E 测试、CI 门禁。

### 非目标
- 不更换运行平台(继续 Cloudflare Workers + D1 + KV + R2)。
- 不重写 UI 设计语言,沿用 3.x 当前设计系统,仅做组件归位。
- 不在 4.0 引入多租户 SaaS 计费;保持"机构自部署"定位。
- 不在 4.0 第一个版本里替换 Element Plus / Vue 3 / Hono / Drizzle。

---

## 3. 设计原则

1. **边界先于功能**:先划模块边界再迁移代码,不做"大爆炸重写"。
2. **依赖单向**:`api → application → domain ← infrastructure`,领域层不依赖 Hono、D1、Cloudflare 绑定。
3. **适配器隔离平台**:Cloudflare 绑定(D1/KV/R2/AI/DO/Queue)只出现在 `infra/`。
4. **失败隔离**:流水线任一副作用阶段(AI、转发、推送)失败不得影响邮件落库。
5. **默认安全**:权限声明与路由同处定义,未声明权限的路由在测试中直接失败。
6. **可观测是功能**:每个请求、事件、任务都有 trace id 与结构化日志。
7. **向后兼容窗口**:`/api/*`(3.x)路由保留一个大版本,通过适配层转发到 v4 实现。

---

## 4. 总体架构

```
┌──────────────────────────── Clients ─────────────────────────────┐
│  Web (Vue3)      Electron Desktop       Android (Capacitor)       │
│        └──────────── @psg/core (业务/状态/SDK) ────────────┘      │
│               platform adapters: push · notify · update · file    │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTPS  /api/v4  (+ /api 兼容层)
┌───────────────────────────────▼──────────────────────────────────┐
│                      mail-worker (Cloudflare Worker)              │
│  ┌──────────── Edge / Interface ────────────┐                     │
│  │ HTTP(Hono) · Email handler · Scheduled   │                     │
│  │ Queue consumer · Durable Object entry    │                     │
│  └───────────────────┬──────────────────────┘                     │
│  ┌───────────────────▼──────────────────────┐                     │
│  │ Application  (use-cases / 事务边界 / 权限) │                     │
│  └───────┬───────────────────────┬──────────┘                     │
│  ┌───────▼────────┐      ┌───────▼──────────────┐                 │
│  │ Domain Modules │◄────►│ Event Bus (domain    │                 │
│  │ mail · account │      │ events + Queue)      │                 │
│  │ contact · ...  │      └───────┬──────────────┘                 │
│  └───────┬────────┘              │                                │
│  ┌───────▼───────────────────────▼──────────┐                     │
│  │ Infrastructure / Providers               │                     │
│  │ D1(Drizzle) · KV · R2 · Workers AI · DO  │                     │
│  │ Mail transport · AI · Notify · Storage   │                     │
│  └──────────────────────────────────────────┘                     │
└───────────────────────────────────────────────────────────────────┘
```

### 4.1 运行时入口(统一为 5 类)
| 入口 | 职责 |
|---|---|
| `fetch` (Hono) | HTTP API、静态资源、Open API |
| `email` | Cloudflare Email Routing 入站,仅做解析并投递 `mail.received` 事件 |
| `scheduled` | 仅做"到点触发",具体工作发布为任务消息 |
| `queue` | 事件/任务的唯一消费入口(重试、死信) |
| Durable Object | 定时发送的精确闹钟、会话级并发控制 |

---

## 5. 后端设计(`mail-worker`)

### 5.1 目标目录结构

```
mail-worker/src
├── main.ts                      # 入口:装配 fetch/email/scheduled/queue
├── app/                         # 组合根(依赖注入、路由注册、中间件)
│   ├── container.ts
│   ├── routes.ts
│   └── middleware/              # auth · rbac · i18n · trace · error · rate-limit
├── modules/                     # 业务域(每个模块自包含)
│   ├── identity/                # 用户、登录、OAuth、注册码、API Key
│   ├── access/                  # 角色、权限(RBAC)、配额
│   ├── mailbox/                 # 账户/别名/文件夹/标签/星标/归档/垃圾箱
│   ├── message/                 # 邮件实体、收件、阅读、搜索、附件
│   ├── compose/                 # 草稿、发送、定时发送、撤回、模板、签名
│   ├── contact/                 # 联系人、群组、自动联系人
│   ├── automation/              # 规则、自动回复、转发(管理员/个人)
│   ├── intelligence/            # AI 助手、验证码识别、翻译、垃圾/追踪器检测
│   ├── notification/            # 通知事件、渠道订阅、推送
│   ├── system/                  # 系统设置、初始化、备份、统计分析
│   └── openapi/                 # 对外 Open API(Key 鉴权)
│       每个模块内部:
│       ├── api/                 # 路由 + 请求/响应 schema
│       ├── app/                 # use-case(应用服务)
│       ├── domain/              # 实体、值对象、领域事件、仓储接口
│       ├── infra/               # 仓储实现(Drizzle)、模块私有适配器
│       └── index.ts             # 模块公开接口(其它模块只能 import 这里)
├── providers/                   # 跨模块的可插拔能力(见 5.3)
│   ├── transport/               # resend · alibaba-directmail · smtp(预留) · s3-relay
│   ├── ai/                      # workers-ai · openai-compatible · …
│   ├── notify/                  # web-push · firebase · telegram · webhook · email
│   └── storage/                 # r2 · s3
├── platform/                    # Cloudflare 绑定封装(db/kv/r2/ai/queue/do)
├── shared/                      # result · error · i18n · id · time · logger · validation
└── db/
    ├── schema/                  # Drizzle schema(按模块分文件)
    └── migrations/              # 0001…(全部 schema 变更在此,取消 init.js 建表)
```

**模块边界规则(用 lint 强制)**
- 模块只能 import 其他模块的 `index.ts`,禁止跨模块访问 `domain/`、`infra/`。
- `domain/` 禁止 import `hono`、`drizzle-orm`、`platform/`。
- 数据库表归属唯一模块;跨模块读取走公开查询接口,不直接 join 他人的表(只读报表模块 `system/analysis` 例外,走显式的只读视图)。

### 5.2 现有代码 → 4.0 模块映射

| 3.x service / api | 4.0 模块 |
|---|---|
| `login` `user` `oauth` `reg-key` `external-api-key` `verify-record` `turnstile` `firebase-auth` | `identity` |
| `role` `perm` | `access` |
| `account` `label` `star` | `mailbox` |
| `email-service`(拆分) `att` `search` `all-email` | `message`(收/读/搜)+ `compose`(发) |
| `scheduled-email` + `durable/scheduled-send-alarm` `template` | `compose` |
| `contact` `contact-group` | `contact` |
| `forwarding` `auto-reply` + 规则 | `automation` |
| `ai-*` `translate` `spam` `tracker` | `intelligence` |
| `notification*` `web-push*` `firebase-push` `telegram` `webhook` | `notification` + `providers/notify` |
| `setting` `backup` `analysis` `init` `reset-admin` `r2` `s3` | `system` + `providers/storage` |
| `public` `external-api` | `openapi` |
| `resend` `alibaba-directmail` | `providers/transport` |

> `email-service.js`(1796 行)是拆分重点:按"收件落库 / 列表查询 / 详情与标记 / 删除与恢复 / 发送编排"拆为 `message` 与 `compose` 的独立 use-case。

### 5.3 Provider 抽象(解决问题 #2)

统一接口 + 注册表 + 配置驱动,示例:

```ts
interface MailTransport {
  readonly id: string                       // 'resend' | 'alibaba-dm' | ...
  capabilities: { attachments: boolean; quotaTracking: boolean }
  send(msg: OutboundMessage, ctx: SendContext): Promise<SendReceipt>
  quota?(): Promise<QuotaInfo>
}
interface AIProvider   { complete(req): Promise<AIResult>; stream?(req): AsyncIterable<AIChunk> }
interface NotifyChannel{ readonly id: string; deliver(event: NotificationEvent, target: Subscription): Promise<void> }
interface ObjectStorage{ put/get/delete/presign }
```

- Provider 在 `app/container.ts` 中按系统设置装配,支持**多提供方 + 优先级 + 失败回退**(例如 Resend 失败回退 DirectMail)。
- 新增渠道只需:实现接口 → 在注册表登记 → 在设置页添加配置表单(由 provider 提供配置 schema 驱动表单,减少前端重复)。

### 5.4 事件驱动的邮件流水线(解决问题 #3 #4)

**领域事件**(命名 `<域>.<过去式>`):
`mail.received` · `mail.stored` · `mail.classified` · `mail.sent` · `mail.send_failed` · `mail.scheduled` · `mail.read` · `account.created` · `user.registered` · `quota.exceeded` ……

**收信流水线**:

```
email handler ─► parse(postal-mime) ─► [同步] 落库 + 附件存储 ─► emit mail.stored
                                                       │ (Queue)
   ┌───────────────┬──────────────┬─────────────────┬───┴────────────┐
   ▼               ▼              ▼                 ▼                ▼
 spam 检测     追踪器拦截      OTP 识别          规则/自动回复     转发(管理员/个人)
   └──────────────┴──────────────┴────► emit mail.classified ──► 通知推送(Web Push/FCM/TG/Webhook)
```

- **同步段只做"不可丢"的事**:解析、落库、附件。其余全部异步订阅 `mail.stored`。
- 每个订阅者独立重试(指数退避)、独立死信、独立开关(系统设置 → 流水线阶段开关)。
- 订阅者幂等:以 `eventId + handler` 去重(KV/D1 `event_log`)。

**后台任务统一走 Queue**(Cloudflare Queues):
- `scheduled` 触发器只发布 `task.tick.*`,由 consumer 执行(分析缓存刷新、每日任务、清理)。
- 定时发送:保留 Durable Object 作为精确闹钟,到点后发布 `mail.send_due`,统一经 `compose` 发送并复用 transport 回退与重试。
- 兜底:对未启用 Queues 的部署,提供 `InlineBus` 实现(同进程 `waitUntil` 执行),保证"一键部署"体验不变。

### 5.5 数据层(解决问题 #7)

- Drizzle schema 按模块拆文件;**全部**表结构变更进入 `db/migrations`,移除运行时建表。
- 迁移规范:`NNNN_<module>_<change>.sql`,只增不改历史;破坏性变更采用 expand → migrate → contract 三步,跨两个小版本完成。
- 启动检查:Worker 读取 `schema_version`,版本不匹配时返回 503 + 明确提示(而非隐式半运行)。
- 索引与查询:为列表/搜索热路径(`account_id + folder + created_at`、标签关联、全文搜索)补索引;消息正文与大字段评估迁移到 R2,D1 仅存元数据与摘要(4.1 里程碑,非 4.0 阻塞项)。
- KV 用途收敛并文档化 key 命名空间(`session:` `ratelimit:` `cache:` `event:`),统一 TTL 策略,`kv-const.js` 迁移为 `platform/kv-keys.ts`。

### 5.6 API 与契约(解决问题 #5)

- 新路由前缀 `/api/v4/<module>/...`,统一响应体 `{ code, message, data, traceId }`。
- **schema 单一来源**:每个路由用 Zod 声明请求/响应 → 自动生成 OpenAPI 3.1 → 生成前端 TS SDK(`@psg/sdk`)与 Open API 文档。
- 旧 `/api/*` 保留一个大版本:`compat/v3` 适配层把旧路径/字段映射到 v4 use-case,响应头加 `Deprecation` 与 `Sunset`。
- Open API(API Key)独立限流与审计,版本在 URL 中显式固定,不随主版本漂移。
- 统一错误码表(业务码分段按模块),i18n 文案 key 化(现有 `zh.js`/`en.js` 保留结构,迁移为 key 表)。

### 5.7 安全与权限

- 路由声明即权限:`route({ perm: 'mail:send', schema, handler })`;缺少 `perm` 字段则构建期报错;CI 里的"路由权限覆盖测试"枚举所有路由并断言。
- 权限点命名规范 `<module>:<action>`,与 `access` 模块的角色权限表一一对应,迁移脚本把 3.x 权限点映射到新命名。
- 认证:JWT 短期访问令牌 + 刷新令牌(KV 存撤销表),支持"退出所有设备"。
- 速率限制:登录、注册、发信、AI 调用、Open API 分别配置(基于 KV 滑动窗口或 DO)。
- 内容安全:邮件 HTML 保持 shadow DOM 渲染 + 服务端净化;追踪器拦截与远程图片代理在 `intelligence` 中统一策略。
- 密钥与敏感配置(Provider Key、推送私钥)加密存储(使用 Worker secret 派生密钥做信封加密),备份导出默认脱敏。
- 审计日志:登录、权限变更、管理员操作、Open API 调用写入 `audit_log`。

### 5.8 可观测性

- 请求入口生成 `traceId`,贯穿 HTTP → 事件 → Queue 任务 → Provider 调用。
- 结构化日志(JSON):`level, module, event, traceId, userId, durationMs`。
- 指标(Workers Analytics Engine):收信量、发送成功率、各 Provider 延迟/失败率、队列积压、AI 耗时。
- 管理端"系统健康"页:流水线阶段成功率、死信列表(可手动重放)、Provider 状态。

---

## 6. 前端设计(`mail-vue`)

### 6.1 Monorepo 化与分包

```
/
├── apps/
│   ├── web/            # Vue3 SPA(现 mail-vue 主体)
│   ├── desktop/        # Electron 壳(main / preload / updater)
│   └── android/        # Capacitor 工程
├── packages/
│   ├── core/           # 业务逻辑:stores、composables、领域模型、离线缓存(Dexie)
│   ├── sdk/            # 由 OpenAPI 生成的 API 客户端 + axios 拦截器
│   ├── ui/             # 设计系统:tokens、基础组件、Element Plus 主题封装
│   ├── platform/       # 平台适配接口 + web/electron/android 三套实现
│   ├── i18n/           # 文案与语言包(前后端可共用 key)
│   └── config/         # eslint / tsconfig / vite 预设
└── mail-worker/
```

- 包管理统一为 **pnpm workspace**(后端已使用 pnpm,前端当前为 npm,统一后减少 CI 与依赖覆盖差异)。
- 迁移顺序:先抽 `platform` 与 `sdk`,再抽 `core`,最后整理 `ui`;每一步都保持主干可发布。

### 6.2 平台适配层(解决问题 #8)

业务代码**只依赖接口**,不直接调用 Electron/Capacitor/ServiceWorker:

```ts
interface PlatformAdapter {
  push:    { register(): Promise<PushToken>; onMessage(cb): Unsub }   // WebPush / FCM / Electron
  notify:  { show(n: LocalNotification): void }
  updater: { check(): Promise<UpdateInfo>; apply(): void }            // electron-updater / PWA SW / Play
  files:   { save(blob, name): Promise<void>; pick(accept): Promise<File[]> }
  window:  { setBadge(n: number): void; openExternal(url: string): void }
  storage: { secure: KeyValue }                                       // Keychain / Keystore / IndexedDB
}
```
`firebase-messaging-sw.js`、`psg-mail-sw.js`、`electron/*.cjs` 随之归入对应平台包。

### 6.3 前端分层与目录

```
packages/core/src
├── domain/        # Message / Account / Label / Contact … 类型与纯函数
├── stores/        # Pinia(按领域拆分,取代当前 store/*.js 的杂糅)
├── services/      # 用例编排(调用 sdk + 本地缓存 + 平台适配)
├── sync/          # 增量同步、离线队列(Dexie)、冲突策略
└── composables/
apps/web/src
├── app/           # 启动、路由、守卫、布局壳(sidebar / topbar / mobile-tabbar)
├── features/      # 按功能垂直切片:inbox · reader · compose · search · labels · contacts
│                  # · automation · assistant · notifications · settings · admin
└── pages/         # 路由页(薄,只组合 features)
```
- `views/*` 现有页面按 feature 归并;`sys-setting` / `access-management` 归入 `features/admin`,按权限懒加载,缩小普通用户首包。
- 设置页使用 **Provider 配置 schema 驱动的表单渲染器**,替代 `MailProviderCard` 等手写卡片重复。

### 6.4 数据同步与性能

- 引入**增量同步**:服务端提供 `GET /api/v4/sync?since=<cursor>`(变更流:新增/更新/删除),客户端落 Dexie,列表读本地、后台对账——改善弱网与移动端体验,同时支撑已有的"同步删除(0006)"。
- 列表虚拟滚动(现有 `email-scroll`)沿用,统一数据源为本地缓存。
- 路由级与 admin 模块拆包;ECharts 按需引入(当前仅分析页使用)。
- 实时:Web Push / FCM 为主,可选 WebSocket(Durable Object 房间)用于在线时的即时刷新,4.0 仅预留接口。

### 6.5 设计系统

- 把当前样式 token(颜色、字体 DM Sans / IBM Plex / Noto Sans SC、间距、圆角、深浅色)沉淀为 `packages/ui/tokens`,以 CSS 变量输出;组件统一从 `@psg/ui` 引入。
- 沿用 3.x 已统一的设置页、对话框视觉规范,仅做组件抽象,不做视觉重做。

---

## 7. 工程化与质量门禁(解决问题 #9)

| 项 | 4.0 要求 |
|---|---|
| 语言 | 后端与共享包 TypeScript(`strict`);允许 `.js` 渐进迁移,新文件一律 TS |
| 代码规范 | ESLint + Prettier;模块边界用 `eslint-plugin-boundaries`/`dependency-cruiser` 强制 |
| 测试金字塔 | 单元(domain/use-case,Vitest)· 集成(`@cloudflare/vitest-pool-workers` + 内存 D1/KV)· 契约(OpenAPI 与实现对账)· E2E(Playwright 覆盖登录/收信/发信/搜索/设置) |
| 必测清单 | 路由权限覆盖、迁移升级/回滚、流水线幂等与重试、Provider 回退、3.x 兼容层 |
| CI | PR 必过:lint → typecheck → unit → integration → build;main:+ E2E + 三端构建;现有 `deploy-cloudflare.yml` / `release.yml` / `ui-cross-platform-build.yml` 保留并复用 |
| 发布 | 语义化版本;`changeset` 生成变更日志;Web/Worker 同版本号,桌面与 Android 随 GitHub Release 发布 |
| 预发 | 使用现有 `wrangler-test.toml` 作为 staging,迁移与兼容层先在 staging 演练 |

---

## 8. 3.x → 4.0 迁移方案

### 8.1 原则
- **绞杀者模式**:新旧并行,按模块逐个迁移,不停服。
- 每个里程碑可独立发布,主干始终可部署。

### 8.2 里程碑

| 阶段 | 版本 | 内容 | 退出标准 |
|---|---|---|---|
| M0 基础设施 | 3.2 | TS 配置、lint/typecheck/test 门禁、`traceId` 与结构化日志、DDL 棘轮(冻结 `init.js` 与请求期 DDL,新变更只能进 `migrations`)。**状态:后端部分已落地**(见 §11)。前端 pnpm workspace 与品牌命名统一顺延 | CI 门禁上线;运行期 DDL 数量只减不增 |
| M1 后端骨架 | 4.0-alpha.1 | `app/` 组合根、`platform/` 绑定封装、Provider 接口与 `transport`/`notify` 适配器;路由声明式权限 + Zod;`/api/v4` 与 `compat/v3` | 新增路由全部走声明式;权限覆盖测试通过 |
| M2 事件管道 | 4.0-alpha.2 | EventBus(Queue + Inline 实现)、收信流水线拆分、死信与重放、后台 cron 改为发布任务 | 收信副作用全部异步订阅;失败不影响落库 |
| M3 模块化迁移 | 4.0-beta.1 | 按映射表迁移 11 个模块,拆分 `email-service`;`message`/`compose` 先行 | `service/` 目录清空;边界 lint 零违规 |
| M4 客户端重构 | 4.0-beta.2 | `sdk`(OpenAPI 生成)、`platform` 适配层、`core` 抽取、`features/` 归并、admin 懒加载 | 三端共用 `core`;平台 API 仅出现在 `platform/` |
| M5 同步与体验 | 4.0-rc.1 | 增量同步 + 离线缓存、系统健康页、审计日志、设置页 schema 驱动 | 弱网/离线场景 E2E 通过 |
| M6 发布 | 4.0.0 | 迁移指南、兼容层公告(`Sunset` 日期)、性能与安全复核 | 全部必测清单通过;升级/回滚演练成功 |

### 8.3 数据与配置迁移
1. 先发布 3.2(含全部迁移脚本与 `schema_version`),升级时自动补齐建表。
2. 权限点重命名、设置项 key 变更通过编号迁移 + 兼容读取(旧 key 读取时回落,保留两个小版本)。
3. 备份格式升级版本号;4.0 可导入 3.x 备份,反向仅保证 4.0.x 之间兼容。
4. **回滚**:每个破坏性迁移前自动触发一次 `backup`;contract 步骤延后一个小版本,保证 N-1 可回退。

### 8.4 兼容性承诺
- Open API(API Key):v3 路径在 4.x 全程可用,4.x 末期发 `Sunset`。
- 桌面端/Android 旧客户端:服务端 `compat/v3` 保证旧客户端可登录并收发信;旧客户端启动时提示升级。
- 自部署配置:`wrangler.toml` 现有 `[vars]` 保持有效;新增 `[[queues]]` 为可选项,缺省使用 InlineBus。

---

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| 重构范围过大导致长期不可发布 | 绞杀者模式 + 每阶段独立发布;每个模块迁移只做搬迁与接口收敛,不夹带功能变更 |
| Cloudflare Queues 要求付费计划,影响"一键部署" | 提供 `InlineBus` 兜底;Queue 为推荐项而非硬依赖 |
| D1 容量/并发限制 | 大字段迁 R2;热路径加索引;只读报表走缓存;容量监控纳入健康页 |
| TS 迁移拖慢进度 | 允许混合;新文件 TS、触碰即迁;先给 `shared`/`domain` 加类型 |
| 兼容层长期积累技术债 | 明确 `Sunset` 日期,兼容层只做映射、不含业务逻辑,有独立测试 |
| 三端发布节奏不一致 | 服务端兼容 N-1 客户端;客户端启动检查最低支持版本 |

---

## 10. 待决策事项

1. **是否强制依赖 Cloudflare Queues?**(建议:可选,缺省 InlineBus)
2. **邮件正文是否在 4.0 迁移到 R2?**(建议:放 4.1,4.0 仅预留 `body_ref` 字段)
3. **后端 TS 迁移策略**:全量一次性 vs 触碰即迁(建议:触碰即迁 + 新文件强制 TS)
4. **前端包管理统一为 pnpm**:是否接受 Electron/Capacitor 构建链路随之调整
5. **WebSocket 实时通道**是否纳入 4.0(建议:仅预留)
6. **兼容层 Sunset 时间**:建议 4.0 发布后 12 个月

---

## 附录 A:关键约定速查

- 路由:`/api/v4/<module>/<resource>`,动词用 HTTP 方法,动作用子资源(`POST /compose/messages/{id}/send`)。
- 事件名:`<module>.<event_past_tense>`;payload 必含 `eventId, occurredAt, traceId`。
- 权限点:`<module>:<action>`,如 `message:read`、`compose:send`、`system:setting.write`。
- 迁移文件:`NNNN_<module>_<change>.sql`。
- 提交范围:`feat(message): …` / `refactor(compose): …`,scope = 模块名。

## 附录 B:收信时序(目标态)

```
Email Routing ─► email() ─► MessageIngest.use-case
                              ├─ parse + persist (D1/R2)        [同步,必须成功]
                              └─ publish mail.stored            [Queue]
Queue consumer ─► handlers (并行、幂等、各自重试)
                   ├─ intelligence.classify  ─► publish mail.classified
                   ├─ automation.rules / auto-reply / forwarding
                   └─ notification.fanout (web-push · fcm · telegram · webhook)
```

---

## 11. M0 落地记录(mail-worker)

已完成:
- **结构化日志与 traceId**:`src/shared/{logger,trace}.ts`、`src/app/middleware/trace.ts`。每个 HTTP 请求带 `X-Trace-Id`(合法的入站 id 沿用,否则生成),响应头与错误响应体都带 `traceId`;请求完成记录一行 JSON(只记 path,不记 query,避免泄露 token);cron 任务记录 start/done/failed 与耗时。
- **门禁脚本** `pnpm check` = `check:migrations` + `lint` + `typecheck` + `test`,CI 见 `.github/workflows/ci.yml`。
  - `scripts/check-migrations.mjs`:迁移文件命名/连号检查;运行期 DDL 棘轮,基线在 `scripts/runtime-ddl-baseline.json`,新增 DDL 会使 CI 失败,删除 DDL 后用 `--update` 下调基线。
  - ESLint(flat config,仅正确性规则为 error,风格类问题为 warning)与 `tsc --noEmit`(新代码 `.ts` 走 strict,既有 `.js` 暂不检查)。TypeScript 固定在 6.x,因为 typescript-eslint 尚不支持 7.0。
- 顺手修复:`notification-event-service.js` 中超出 JS 精度的数字字面量(`9223372036854775807`)。

未做(及原因):
- **不删除 `init.js` 的历史 DDL**:`ALTER TABLE ADD COLUMN` 在 SQLite 里不可幂等,已升级过的线上库重复执行迁移会失败,需要先有 `schema_version` 检测再分步搬迁,留到 M1。
- **不改 wrangler `name`**:部署名由 CI 的 `NAME` secret 覆盖,改默认值只会让自部署用户的 Worker 被意外新建。
- **前端 pnpm workspace**:`wrangler.toml` 的 `[build]` 与多个工作流依赖 `npm --prefix ../mail-vue`,需单独评估后迁移。
