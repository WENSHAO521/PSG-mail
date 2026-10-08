# PSG Mail 4.0：代码审计、风险清单与实施计划

> 审计基线：`main` @ `2fe0fad`（2026-10），工作分支 `claude/busy-fermat-8ow2yh`。
> 所有结论都对照最新代码逐条核实，引用写成 `文件:行号`。没能在本地复现的标为**待验证**。
> 基线测试：`mail-worker` 下 `pnpm test`，16 个测试文件、98 个用例全部通过（审计开始前实际运行）。

## 1. 代码结构概览

| 模块 | 技术 | 说明 |
|---|---|---|
| `mail-worker/` | Cloudflare Workers + Hono 4 + Drizzle(D1) | API（`/api/*`）、收信 `email()`、Cron、Durable Object `ScheduledSendAlarm` |
| `mail-worker/src/security/security.js` | 自研中间件 | JWT + KV 会话白名单、路径前缀 RBAC（`requirePerms`/`premKey`） |
| `mail-worker/src/init/init.js` | 自研 | `POST /init` 依次执行 v1→v4_4 的 `ALTER TABLE ... catch{}` 升级链 |
| `mail-worker/migrations/` | Wrangler D1 migrations | 0001–0012，部署时 `wrangler d1 migrations apply` |
| 对象存储 | KV / R2 / S3 三选一（`r2-service.storageType`） | 附件 key = `attachments/<sha256(内容)>.<ext>`，按内容寻址 |
| 发信 | Cloudflare `send_email` / Resend / Mailjet / 阿里云 DirectMail | `email-service.send` 内按优先级选择 |
| AI | Workers AI（`ai-assistant-service` 工具循环 + `ai-mail-service` 摘要/回复建议） | 会话历史只保存在客户端 |
| `mail-vue/` | Vue 3 + Element Plus + Pinia + Dexie | Web/PWA、Electron（`electron/`）、Android（Capacitor） |

## 2. 功能现状标记

| 能力 | 状态 | 依据 |
|---|---|---|
| 用户/邮箱级授权（自有 + `account_share` 共享） | 已具备 | `email-service.js:34` `getSharedAccountIds` 在 list/detail/delete 等处统一使用 |
| 密码存储 | **需要增强** | `crypto-utils.js:18` 单轮 `SHA-256(salt+pwd)` |
| JWT 到期 | **需要增强** | `login-service.js:242` 签发时不带 `exp`，只靠 KV TTL |
| 会话撤销/设备管理 | 部分具备 | KV `auth-uid:<id>.tokens` 白名单；无设备列表、无"退出其他设备" |
| 登录限流 | 尚未实现 | `/login`、`/public/genToken`、`/account/bind` 都没有尝试次数限制 |
| 安全审计日志 | 尚未实现 | 没有相关表 |
| 附件访问控制 | **需要增强** | `/oss/*`、`/attachments/*` 无鉴权 |
| Resend Webhook 签名 | 尚未实现 | `resend-api.js:3` 直接信任请求体 |
| 凭据静态加密 | 尚未实现 | S3/Mailjet/Resend/OAuth token 在 D1 + KV 中都是明文 |
| D1 版本化迁移 | 部分具备 | `migrations/` 已有；`init.js` 和热路径的 `ALTER TABLE` 仍然并存 |
| 收信幂等 | 尚未实现 | `email.js` 没有任何去重 |
| 多发信渠道 | 已具备 | CF/Resend/Mailjet/DirectMail |
| 投递审计/重试队列 | 尚未实现 | 只有 `email.status` 单字段 |
| EML 导出 | 已具备（两份实现） | `email-service.buildEml`、`backup-service` |
| EML 导入/恢复 | 尚未实现 | — |
| AI 助手工具调用 + 发送/删除需确认 | 已具备 | `ai-assistant-service.js:255` KV 待确认动作 |
| AI 会话服务端持久化 | 尚未实现 | `history` 由客户端整段上传 |
| MCP Server | 尚未实现 | — |
| 外部 API Key | 已具备 | `external-api-key-service.js`：只存 SHA-256，可撤销 |
| 线程视图（RFC 5322 头） | 需要增强 | 回复时 `References` 只写父邮件 ID（`email-service.js:944`） |

## 3. 风险清单

### 3.1 已确认（按风险评级）

| ID | 级别 | 问题 | 位置 | 处理阶段 |
|---|---|---|---|---|
| S-01 | **严重** | `/oss/*` 与根路径 `/attachments/*` 不鉴权，任何人知道 key 就能下载任意用户的附件；对象按原始 `Content-Type` 从应用同源返回，上传的 `text/html`/SVG 附件可以造成存储型 XSS（token 存在 localStorage） | `r2-api.js:4`、`index.js:30`、`security.js:16` | P0 |
| S-02 | **严重** | `POST /public/addUser` 把 `User-Agent` 解析出的 os/browser/device 以及 IP 直接拼进 SQL（需要 public token） | `public-service.js:136` | P0 |
| S-03 | **高** | `/webhooks` 无签名校验，任何人都能伪造 Resend 投递状态（delivered/bounced 等） | `resend-api.js:3`、`resend-service.js` | P0 |
| S-04 | **高** | 密码采用单轮 SHA-256，泄库后可以高速离线破解 | `crypto-utils.js:18` | P0 |
| S-05 | **高** | `logout` 中 `getToken()` 漏写 `await`，`findIndex` 返回 -1，`splice(-1,1)` 删掉的是**最后一个设备**的会话，当前 token 仍然有效 | `login-service.js:316` | P0 |
| S-06 | **高** | `PUT /oauth/bindUser` 不需要任何凭据：只凭公开可知的 `oauthUserId` 就能给他人未绑定的 LinuxDo 身份抢先绑定邮箱，并拿到该账号的 JWT；`oauthRow` 为空时还会抛异常 | `oauth-service.js:13`、`security.js` exclude `/oauth` | P0 |
| S-07 | **高** | 登录、`/public/genToken`、`/account/bind` 都会校验密码，但没有限流，可以在线爆破；登录区分"用户不存在/密码错误"，可以枚举账号 | `login-service.js:213`、`public-service.js:172`、`account-service.js:117` | P0 |
| S-08 | 中 | 发信时正文里的 `attachments/<key>` 图片会被嵌入成 cid 附件，而查询 key 时**不校验归属**：只要拿到他人附件 key，就能把对方的文件以附件形式发到外部 | `att-service.js:105`、`selectOneByKeys` | P0 |
| S-09 | 中 | JWT 不带 `exp`；会话只存 token 列表，没有设备、IP、时间，不能有选择地撤销；`/my/resetPassword` 只要会话有效就能改密码，不需要原密码，改完也不撤销其他会话 | `jwt-utils.js`、`my-api.js:11` | P0 |
| S-10 | 中 | 鉴权白名单按 `startsWith` 匹配：`/test`、`/oauth`、`/login` 这类前缀会顺带放行同前缀的未来路由 | `security.js:117` | P0 |
| S-11 | 中 | 非业务异常把 `err.message` 原样返回客户端（可能包含 SQL/内部信息）；没有安全响应头；CORS 全开 | `hono.js:7-31` | P0 |
| S-12 | 中 | S3 Secret、Mailjet、Resend token、阿里云 SMTP 密码、云盘 OAuth refresh token 在 D1 中明文保存，并整份缓存进 KV `setting:` | `setting-service.js`、`backup-service.js:124` | P0 |
| S-13 | 低 | `genRandomPwd` 用 `Math.random()`，生成的初始密码可以被预测 | `crypto-utils.js:30` | P0 |
| S-14 | 低 | `/public/*` token 比较不是常量时间 | `security.js:129` | P0 |
| R-01 | **高** | 收信时把原始流逐块 `new TextDecoder().decode(chunk)`：块边界上的多字节 UTF-8 字符会损坏，8bit/二进制正文和附件会被按 UTF-8 解码而失真 | `email.js:56-62` | P1 |
| R-02 | **高** | 自动回复没有防环：会回复 `Auto-Submitted`、`Precedence: bulk/list`、`MAILER-DAEMON`、退信，也不按发件人限频，可能形成邮件循环 | `email.js:262` | P1 |
| R-03 | 中 | 收信不幂等：Email Routing 在异常后重投，或者对端重发，都会产生重复邮件 | `email.js` | P1 |
| R-04 | 中 | 业务热路径里每次请求都会执行 `ALTER TABLE`（归档、垃圾邮件、删除、头像、签名），出错后再被 `catch` 吞掉 | `email-service.js:268,314,425,1448`、`user-service.js:55,184`、`spam-service.js:146` | P1 |
| R-05 | 中 | 回复邮件的 `References` 只包含父邮件 Message-ID，不是完整链路，其他客户端里的线程会断开 | `email-service.js:944,977,1020` | P1/AI |
| R-06 | 低 | 附件对象删除失败只记日志（`att-service.js:233`），之后没有任何重试或审计，会留下孤立对象 | `att-service.js` | P1 |

### 3.2 待验证（本地无法确认）

| ID | 问题 | 原因 |
|---|---|---|
| V-01 | 存储使用 R2、但没配置 `r2Domain` 时，正文内嵌图片会被替换成 `/attachments/<key>`，而根路由 `index.js:30` 只从 **KV** 读，可能显示不出来 | 需要真实 R2 部署验证；本次统一改由带签名的 `/api/oss` 路由兼容 |
| V-02 | S3 `DeleteObjects` 手工计算 `Content-MD5` 的中间件在 R2 S3 兼容层、MinIO 上的兼容性 | 需要真实 S3 端点 |
| V-03 | Electron/Android 打包版本是否直接加载远程 Web 资源；如果是内置资源，旧客户端在附件签名强制模式下会受影响 | 需要检查各平台发布配置和实际安装包；因此附件签名默认采用 `compat` 模式 |
| V-04 | Resend 账户是否已开通 webhook 并拿到 `whsec_` 签名密钥 | 生产配置不可见 |

### 3.3 无需修改

- `/init`、`/reset-admin` 已经使用独立的 `maintenance_secret`，并做常量时间比较。
- 外部 API Key 只存哈希、可撤销（`external-api-key-service.js`）。
- 云盘备份 OAuth 的 `state` 已绑定 userId，并一次性写入 KV（`backup-service.js:44-95`）。
- AI 助手的发送/删除已经在服务端 KV 中暂存参数，确认时校验 userId（`ai-assistant-service.js:255`）。
- EML 导出已对头部值做 CRLF 注入过滤（`email-service.js:86`）。

## 4. 分阶段技术方案与受影响文件

### P0 安全与身份认证（本次实施）

| 项 | 方案 | 文件 |
|---|---|---|
| B 密码 | PBKDF2-SHA256，迭代 100,000 次（workerd 对 PBKDF2 的上限；workerd 不提供 Argon2id，用 WASM 实现又会增加 CPU 时间和审计面）。存储格式为 `pbkdf2_sha256$100000$<salt>$<hash>`，旧 SHA-256 记录不带前缀，用户登录成功后再透明重算哈希。新策略：8–128 位，且至少包含 3 类字符（长度 ≥ 16 时不要求）。**不重置任何已有密码。** | `utils/crypto-utils.js`、`utils/password-policy.js`（新）、`login-service.js`、`user-service.js`、`public-service.js`、`account-service.js` |
| C 会话 | JWT 加入 `exp`/`jti`；KV 会话结构增加 `sessions[]`（设备、IP、创建/最近活动时间），同时保留 `tokens[]` 兼容旧数据；修复 logout；新增 `GET /my/sessions`、`DELETE /my/sessions/:id`、`POST /my/sessions/revokeOthers`、`POST /user/revokeSessions`（需要 `user:set-status` 权限）；修改密码后撤销其他会话；登录按 IP+邮箱限流；`security_audit_log` 记录安全事件 | `security/session-service.js`（新）、`security.js`、`jwt-utils.js`、`login-service.js`、`my-api.js`、`user-api.js`、`service/security-audit-service.js`（新） |
| C MFA/Passkey | 本阶段**只做评估**，详见 `02-p0-security.md`，计划作为 4.1 的可选功能，默认关闭 | 文档 |
| D 附件 | `/oss/*` 改为必须带短期 HMAC 签名（`?exp&sig`）或有效 JWT；签名在服务端按"用户能访问该邮件"的规则签发；按 `ATTACHMENT_ACCESS_MODE`（`compat`/`enforce`）灰度切换；所有对象响应强制 `nosniff` + `CSP: sandbox`，非图片一律 `attachment`；发信嵌图只接受本人可访问的 key | `security/attachment-access.js`（新）、`r2-api.js`、`index.js`、`email-api.js`、`att-service.js`、前端 `utils/convert.js`、`views/content/index.vue` |
| E Webhook | Svix/Standard Webhooks 签名（`svix-id/timestamp/signature`），±5 分钟时间窗，KV 记录 `svix-id` 防重放；通用 `webhook-verifier` 接口；默认**拒绝**未签名请求，可用 `WEBHOOK_ALLOW_UNSIGNED=true` 临时兼容 | `security/webhook-verifier.js`（新）、`resend-api.js` |
| F 凭据 | AES-256-GCM 应用层加密（`enc:v1:<kid>:<iv>:<ct>`），密钥来自 Worker Secret `DATA_ENCRYPTION_KEYS`（JSON，带 kid，可以轮换）；没有配置时保持明文，并写入启动告警；读取时两种格式都兼容。本阶段先覆盖云盘 OAuth token 和 S3 Secret | `utils/secret-box.js`（新）、`backup-service.js`、`setting-service.js` |
| G 加固 | 白名单改为整段路径匹配；`/public` 常量时间比较；未知异常返回通用信息；安全响应头；可配置的 CORS 白名单（`CORS_ORIGINS`，没配置时保持 `*`，因为认证不依赖 cookie）；`/oauth/bindUser` 必须使用 LinuxDo 登录时签发的一次性 bind ticket；`addUser` 改为参数绑定 | `hono.js`、`security.js`、`oauth-service.js`、`public-service.js` |
| H 测试 | 越权访问附件、路径绕过、伪造 webhook、弱密码迁移、会话撤销、登录限流 | `test/p0-*.spec.js` |

### P1 数据库与邮件可靠性

- 迁移治理：新增 `0013_security_*`、`0014_reliability_*`；把热路径 `ALTER TABLE` 改成"迁移内建列 + 进程内一次性 schema 探测"，`init.js` 冻结（只保留，不再新增）。
- 收信：改为按字节流读取，再交给 PostalMime 解析；幂等键 = `sha256(收件邮箱 + Message-ID)`，没有 Message-ID 时退回原文哈希，保存在 `email_receive_dedup` 中；同一 Message-ID 投递给不同收件人时各自保留一份。
- 自动回复防环（RFC 3834）。
- `email_delivery_event`：投递事件审计（webhook 与发送结果都写入）。
- `attachment_cleanup_job`：删除失败后重试，以及孤立对象审计。
- 生命周期策略只提供**配置与预览**，默认关闭，必须管理员审批后才执行（详见 P1 文档）。

### P1 AI Agent 2.0 / P2 MCP / P2 客户端 / P3 学术工作流

先建立共享的 `mail-tools` 业务层（内置 Agent 与 MCP 共用），再加上服务端会话持久化（`ai_conversation`/`ai_message`）、`ai_action_approval`（防重放的确认令牌）、`mcp_client`（独立凭据 + scope + 过期 + 撤销）、`mcp_audit_log`。全部由 feature flag 控制，**默认关闭**。各阶段的范围和完成度见各阶段文档与 CHANGELOG。

## 5. 数据库迁移、数据保护与回滚策略

1. **只增不删**：新迁移只包含 `CREATE TABLE/INDEX IF NOT EXISTS` 和 `ADD COLUMN`，不包含 DROP/TRUNCATE/全量回填。
2. **先备份再迁移**：生产执行前先跑 `wrangler d1 export db --remote --output backup-<date>.sql`（写入部署检查清单，不会自动执行）。
3. **前向兼容**：新代码在新表不存在时也能降级运行（`try/catch` 只出现在读取审计、会话元数据这类非关键路径）；旧代码遇到新增列/表不受影响。
4. **回滚**：代码回滚可以直接部署上一个版本；新表保留不删（旧代码不读）；密码哈希回滚问题见下文，必须注意。
5. **密码哈希回滚注意**：已经迁移到 PBKDF2 的账号，在旧代码下无法登录。回滚方案是：保留 `crypto-utils.verifyPassword` 的格式识别逻辑，以热修复形式回滚其余部分；不建议整体回退到 3.x，必要时用 `/reset-admin` 重置管理员密码。已写入部署清单。
6. **测试隔离**：所有迁移都在 vitest-pool-workers 的 Miniflare 本地 D1 中验证（`test/migrations.spec.js` 按顺序执行 0001–最新的全部迁移文件）。
