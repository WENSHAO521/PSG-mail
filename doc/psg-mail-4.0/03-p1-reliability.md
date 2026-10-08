# P1 数据库与邮件可靠性：实施记录

对应审计 R-01 至 R-06。提交 `6274f70`。

| 项 | 实现 | 文件 |
|---|---|---|
| 迁移治理 | 热路径里的 `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS` 改为 `schema-guard`：用 `PRAGMA table_info` 检查，只补缺失项，每个 isolate 最多执行一次，`POST /init` 也会执行。没有写成编号迁移，因为生产库状态不一（有的已被热路径补过列），`ADD COLUMN` 迁移会报重复列而中断部署 | `init/schema-guard.js` |
| 索引 | 用 `EXPLAIN QUERY PLAN` 实测，发现 `attachments.key`、`email.resend_email_id` 为全表扫描，迁移 0018 补索引；列表、标签、共享邮箱查询已走索引，未改动 | `migrations/0018` |
| 收信 | 按字节读取（原先逐块 UTF-8 解码，跨块的中文会乱码，已用旧代码复现）；按「收件邮箱 + Message-ID」幂等，无 Message-ID 则用原文哈希；同一 Message-ID 发给不同本地收件人各存一份；失败时放行，宁可重复不丢信 | `service/receive-guard-service.js`、`email/email.js`、`migrations/0015` |
| 自动回复 | RFC 3834 防环（`Auto-Submitted`、`Precedence`、`List-*`、`multipart/report`、空 Return-Path、no-reply/mailer-daemon 等）；同一发件人 24 小时内最多回复一次 | 同上 |
| 发信 | 统一 `dispatchToProvider`，保持 Cloudflare > Resend > Mailjet 的优先级；失败写入 `email_delivery_event`；Resend 带幂等键，瞬时错误最多重试 3 次；附件数量改为发送前校验（原先发出去后才报错）；回复的 `References` 为完整链路 | `service/email-service.js`、`delivery-event-service.js`、`migrations/0014` |
| Webhook 状态 | 未知事件（opened/clicked）不再把 DELIVERED 降级成 SENT；终态不被瞬态事件覆盖 | `service/resend-service.js` |
| 存储一致性 | 对象删除失败进入重试队列（指数退避，5 次后标记 failed 并输出 `[ALERT]` 日志）；重试前再次确认没有 `attachments` 行引用该 key；`GET /admin/storage/audit` 只读报告孤立对象（KV、R2；S3 列举未实现） | `service/storage-consistency-service.js`、`migrations/0016` |
| EML | 导出与云备份合并为同一份实现：Cc、In-Reply-To、References、multipart/related 内嵌图片、附件、RFC 2047 编码；新增 `POST /email/import` 恢复（按邮箱+Message-ID 幂等，仅限本人或共享邮箱） | `service/eml-service.js` |
| 保留策略 | 默认关闭、草稿状态。需要：管理员启用 → 预览 → 审批（保存策略快照哈希，之后任何修改都会使审批失效）→ 部署变量 `RETENTION_EXECUTION=true`，三道门全部打开才执行。支持时区、工作日、节假日、邮箱例外、法定保存、保留星标；只移入回收站，由已有的回收站清理最终删除 | `service/retention-policy-service.js`、`migrations/0017` |

## 未实现 / 待确认
- **附件 7 天删除未实现**，只在预览里报告「仍保留的邮件里有多少会丢附件」。附件对象按内容寻址、可能被多封邮件共用，直接按天删会破坏保留中的邮件，需要你先确认业务规则。
- 保留策略和孤立对象审计的管理界面：系统设置 →「数据治理」（仅管理员）。界面只做过构建验证，没有在浏览器里实际点过。
- S3 存储的孤立对象列举、`DeleteObjects` 的 Content-MD5 在 R2/MinIO 上的兼容性：待用真实端点验证（V-02）。
- 退信/投诉：Resend 事件已记录并更新状态；Mailjet、阿里云的回调尚未接入（`webhook-verifier` 已留好接口）。
- `POST /email/import` 没有前端界面。
- 发信失败队列：目前只做了失败审计和 Resend 重试，没有做「失败后自动排队稍后重发」，因为对 Cloudflare/Mailjet 自动重发可能造成重复投递。

## 回滚
新增迁移 0014–0018 只增表和索引，可保留。`schema-guard` 只补列，不删除。保留策略默认不执行，回滚无需处理数据。
