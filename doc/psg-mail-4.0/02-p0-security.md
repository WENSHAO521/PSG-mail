# P0 安全与身份认证：实施记录

本阶段对应审计清单 S-01 至 S-14。测试运行情况见本文末尾。

## 变更一览

| 项 | 实现 | 文件 |
|---|---|---|
| 密码存储 | PBKDF2-SHA256，默认 100,000 次迭代（workerd 的上限），存储格式 `pbkdf2_sha256$<iter>$<salt>$<hash>`；旧 SHA-256 哈希登录成功后透明升级（`UPDATE ... WHERE password = <旧值>` 防并发），**不重置任何密码** | `utils/crypto-utils.js`、`service/login-service.js` |
| 密码策略 | 只作用于**新设置**的密码：8–128 位；少于 16 位时至少包含 3 类字符；不能包含邮箱名。注册、改密码、管理员设置/新增用户、`/reset-admin` 都会执行 | `utils/password-policy.js` |
| 随机密码 | 用 CSPRNG 加拒绝采样替代 `Math.random`，长度 16 | `crypto-utils.genRandomPwd` |
| JWT | 增加 `exp`（30 天，与 KV 会话 TTL 一致）；校验 header `alg === HS256`；`jwt_secret` 为空时拒绝签发和验证 | `utils/jwt-utils.js` |
| 会话 | KV 会话增加 `sessions[]`（设备、IP、创建/最近活动时间），兼容 3.x 的 `tokens[]`；会话快照不再包含 `password/salt` | `security/session-service.js` |
| 登出 | 修复 S-05：原实现漏写 `await`，删掉的是其他设备的会话 | `login-service.logout` |
| 设备管理 | `GET /my/sessions`（只返回 8 位句柄，不返回会话 ID）、`DELETE /my/sessions/:handle`、`POST /my/sessions/revokeOthers`、`GET /my/securityLog`；前端在 设置 → 个人资料 → "已登录设备" | `api/my-api.js`、`mail-vue/src/views/setting/index.vue` |
| 管理员撤销 | `POST /user/revokeSessions {userId}`，需要 `user:set-status` 权限（与封禁同级）。管理员身份（JWT 会话）与资源授权（RBAC 路径权限）仍然分两步检查 | `api/user-api.js`、`security/security.js` |
| 改密码 | `/my/resetPassword` 需要提供 `currentPassword`，成功后退出其他设备；登录页改密码、管理员设置密码则会撤销该用户的全部会话 | `user-service.resetPassword/setPwd` |
| 登录限流 | 每邮箱 15 分钟内最多失败 10 次、每 IP 最多 50 次（KV 计数；如果绑定了 `RATE_LIMITER`，优先使用）；限流期间正确密码也会被拒绝；`/public/genToken` 每 IP 10 次，`/account/bind` 每用户+目标邮箱 5 次 | `security/rate-limit.js` |
| 防枚举 | 先校验密码，再报告"已注销/已封禁"；"用户不存在"和"密码错误"返回同一条消息 | `login-service.login` |
| 安全审计 | `security_audit_log` 表（迁移 0013），记录登录成功/失败/限流、密码升级/修改、会话撤销、附件拒绝、webhook 拒绝、OAuth 绑定等；不记录密码和 token；每日 cron 按 `SECURITY_LOG_RETENTION_DAYS`（默认 180 天）清理 | `service/security-audit-service.js` |
| 附件 | 见下文 | `security/attachment-access.js`、`api/r2-api.js`、`index.js` |
| Webhook | 见下文 | `security/webhook-verifier.js`、`api/resend-api.js`、`service/resend-service.js` |
| 凭据加密 | AES-256-GCM（`enc:v1:<kid>:...`），按字段设置 AAD；覆盖 S3 AK/SK、Telegram Bot Token、Turnstile Secret、Mailjet、阿里云 SMTP 密码、Resend Token，以及云盘备份的 OAuth access/refresh token | `utils/secret-box.js`、`setting-service.js`、`backup-service.js` |
| OAuth 绑定 | 修复 S-06：`/oauth/bindUser` 只接受 LinuxDo 登录时签发的一次性 `bindTicket`（10 分钟） | `oauth-service.js`、前端 `views/login/index.vue` |
| SQL 注入 | 修复 S-02：`/public/addUser` 改为参数绑定 | `public-service.addUser` |
| 路由白名单 | 改为按完整路径段匹配（`/login` 不再放行 `/loginX`）；去掉无用的 `/test` 前缀 | `security.js matchesPrefix` |
| 错误处理 | 只有 `BizError` 的消息返回给用户；其他异常返回"服务器内部错误 (ref xxxx)"，详情只写入 Worker 日志 | `hono/hono.js` |
| 安全头 | API 统一加 `nosniff`、`Referrer-Policy`、`X-Frame-Options: DENY`，JSON 响应加 `CSP default-src 'none'` | `hono/hono.js` |
| CORS | `CORS_ORIGINS` 白名单；没配置时保持 `*`（认证不使用 cookie，不构成 CSRF 面），兼容桌面端和 Android | `hono/hono.js` |

## 附件访问控制（S-01、S-08）

- `/api/oss/<key>`、`/attachments/<key>`、`/static/<key>` 全部走同一个处理器。`static/` 下的背景图等仍然公开；`attachments/` 下的对象需要满足以下任一条件：
  1. 服务端签发的 HMAC 签名 `?exp=&sig=`（默认 24 小时，向上取整到整点，方便缓存；密钥由 `ATTACHMENT_URL_SECRET` 或 `jwt_secret` 派生，与 JWT 签名做了域分离）；
  2. 有效的会话 JWT，且该用户能读到引用这个 key 的邮件（自己的邮件，或通过 `account_share` 共享的邮箱；部署管理员可以读取全部）。
- 所有邮件列表/详情接口（都经过 `emailAddAtt`）会给 `attList[].url` 签名，并给正文里的 `{{domain}}attachments/<key>` 加上签名参数。前端优先使用 `att.url`。
- `ATTACHMENT_ACCESS_MODE=compat`（默认）：未签名请求仍然放行，但会记录日志，作为灰度期，保证旧桌面端/Android 包和本地缓存的旧邮件还能显示。`enforce`：未授权请求返回 403，并写入审计。**建议所有客户端更新后切换到 `enforce`。**
- 不论哪种模式，对象响应都会强制 `X-Content-Type-Options: nosniff` 和 `CSP: sandbox`；非栅格图片（包括 SVG、HTML）一律以 `attachment` 下载，杜绝同源存储型 XSS。
- 发信内嵌图片：只接受发件人本人能访问的 key（修复 S-08）。顺带修复了一个旧缺陷：没配置 `r2Domain` 时，所有外链图片都会被改写成悬空的 `cid:`。
- 注意：配置了公开桶域名（`r2Domain`）时，客户端会直接从桶读取，绕过 Worker，这种情况下上述控制**无效**。需要强制保护时，请清空 `r2Domain`。

## Webhook（S-03）

- `webhook-verifier` 提供统一接口：`verify(c, provider, rawBody)` 加 `markProcessed(c, provider, id)`。Resend 采用 Svix / Standard Webhooks 方案（`svix-id`、`svix-timestamp`、`svix-signature`），使用 `RESEND_WEBHOOK_SECRET`（`whsec_...`），时间窗 ±5 分钟，比较采用常量时间。
- 防重放：同一个 `svix-id` 处理成功后，在 KV 中记 24 小时；重放请求返回 200 `duplicate`，但不会再执行一次。处理失败（500）时不记录，因此 Resend 重试仍然有效。
- 默认安全：没配置密钥时一律返回 401。迁移期可以临时设置 `WEBHOOK_ALLOW_UNSIGNED=true`。
- 事件处理：未知事件（opened/clicked 等）直接确认并忽略（3.x 会把状态降级为 SENT）；终态不会被后到的瞬态事件覆盖；找不到对应邮件时返回 200，避免无限重试；每个事件写入 `email_delivery_event`（迁移 0014）。

## MFA / TOTP / Passkey 评估（分阶段，本次不实现）

| 方案 | 风险/成本 | 建议 |
|---|---|---|
| TOTP（RFC 6238） | 实现简单（WebCrypto HMAC-SHA1）；密钥需要用 `secret-box` 加密存储；要提供恢复码；Electron/Android 无需改造 | **4.1 优先**：用户自愿开启、管理员可以对特定角色强制开启；登录改为两步（先返回短期 `mfa_ticket`，再提交 TOTP） |
| Passkey（WebAuthn） | 浏览器/PWA 体验最好；Electron 需要 `app://` 下的 RP ID 处理；Android WebView 需要 Credential Manager 插件；服务端要校验 attestation 和计数器 | 4.2：先只给 Web/PWA 开放，作为第二因素或免密登录，客户端兼容性验证后再推广 |
| 邮件验证码 | 和邮箱是同一个信任域（攻破邮箱就能拿到验证码），不构成真正的第二因素 | 不采用 |

前置条件已经由本阶段完成：会话元数据、安全审计、凭据加密、限流。

## 兼容性说明

- 3.x 签发的 JWT（没有 `exp`）在其 KV 会话有效期内仍然可用。
- 3.x 的 KV 会话结构可以直接读取；首次每日刷新时会去掉其中的 `password/salt`。
- `/my/resetPassword` 新增必填参数 `currentPassword`。旧客户端可以临时设置 `LEGACY_PASSWORD_RESET=true`。
- `/oauth/bindUser` 必须提供 `bindTicket`（Web 前端已经同步更新；旧客户端需要重新走一次 LinuxDo 登录）。
- `/login` 的错误消息统一为"邮箱或密码错误"，并新增 HTTP 429 风格的业务码。
- 前端密码最小长度从 6 位调整为 8 位，最大长度从 30 位调整为 128 位。

## 回滚

- 代码回滚之前，**必须**确认：已经升级到 PBKDF2 的用户在 3.x 代码下无法登录（3.x 只认识 SHA-256）。安全的回滚方式是保留 `utils/crypto-utils.js`（它能识别两种格式）并回滚其余代码；或者在回滚后通过 `/reset-admin` 恢复管理员，再由管理员重置受影响的用户。
- 开启 `DATA_ENCRYPTION_KEY` 之后再回滚到 3.x，加密的凭据会被当成明文使用，导致对应的发信渠道/云盘备份失效。回滚前请在设置页重新输入这些凭据，或者不要回滚 `setting-service.js` 和 `utils/secret-box.js`。
- 迁移 0013、0014 只新增表，可以保留不删。

## 剩余风险

- KV 计数限流在多个边缘节点之间是最终一致的，分布式攻击能够获得略多于阈值的尝试次数。如需严格限流，请绑定 Workers Rate Limiting（`RATE_LIMITER`）。
- 会话缓存在单个 isolate 内存中最多保留 30 秒，撤销会话在其他 isolate 上最多延迟 30 秒生效（与 3.x 相同）。
- `compat` 模式下附件仍然可以匿名访问，必须在客户端更新完成后切换到 `enforce`（V-03）。
- token 仍然存在 localStorage 中，XSS 一旦发生仍可窃取。本阶段已经消除了附件同源 XSS 这条路径；邮件正文渲染使用的是现有的 `shadow-html` 组件，CSP 收紧计划在 P2 客户端阶段完成。
- 免费版 Workers 的 CPU 时间限制下，100k 次 PBKDF2 可能超时（**待验证**），可以把 `PASSWORD_PBKDF2_ITERATIONS` 调低到不少于 10000。

## 测试

新增 `test/p0-auth-session.spec.js`（19 项）、`test/p0-access-webhook.spec.js`（26 项）、`test/migrations.spec.js`（5 项）。测试数据库通过真实的 `init.js` 升级链加上全部 D1 迁移构建（`test/helpers/schema.js`）。覆盖内容：弱密码迁移、防枚举、登录限流、`alg=none` 伪造、登出只撤销本会话、撤销其他设备、按句柄撤销、改密码撤销会话、跨用户附件越权、共享邮箱授权、签名篡改/过期、路径穿越、HTML 附件 XSS 头、伪造/过期/重放 webhook、事件降级、User-Agent SQL 注入、凭据加密的 AAD 绑定与密钥轮换、未知异常信息泄露、白名单前缀绕过、OAuth 绑定伪造。
