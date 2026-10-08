# P1 AI Agent 2.0：实施记录

特性开关：`AI_AGENT_V2=true`（默认关闭，所有 `/ai-assistant/v2/*` 返回 404）。旧的 `/ai-assistant/chat` 与 `/confirm` **原样保留**，前端在服务器开启 v2 时自动改用 v2，否则走旧接口。

## 架构
```
抽屉 / SSE ──► ai-agent-service（循环、重试、回退、配额、任务日志）
                  │  只通过 ↓ 访问邮件
              mail-tools（共享工具层：授权、范围、风险分级）◄── P2 MCP 将复用同一层
                  │
   ai-approval-service（敏感操作：服务端存参数、单次使用）
   ai-conversation-service（会话、设置、保留期）   thread-service（RFC 线程）
   ai-safety（不可信内容隔离、注入检测、语言检测） ai-auto-draft-service（新邮件草稿）
```

## 工具（13 个 + 2 个辅助）
`listEmails searchEmails getEmail getThread createDraft updateDraft discardDraft markRead moveEmail manageLabels archiveEmail sendEmail deleteEmail`，另有 `getAttachmentText`、`listDrafts`。

| 风险 | 工具 | 规则 |
|---|---|---|
| read | list/search/get*/listDrafts | 仅限本人或共享邮箱，可再被 scope 收窄；结果按「不可信内容」包裹 |
| write | createDraft/updateDraft/discardDraft/markRead/manageLabels/archiveEmail(单封)/moveEmail(单封非回收站) | 批量里无权的 id 会被丢弃并在 `skipped` 中报告 |
| 需审批 | sendEmail、deleteEmail、moveEmail 到回收站、任何多封的 archive/move | 工具本身在未带 `approved` 时直接 403，即使绕过 Agent 直接调用也一样 |

没有单独的「转发」工具：转发就是带原文引用的 `sendEmail`，同样必须审批。

## 安全设计（H、G）
- **审批在服务端**：模型调用敏感工具时只会创建 `ai_action_approval`（参数、哈希、风险提示、5 分钟有效期）；客户端只能提交审批 ID，不能改参数。`pending → executing` 是条件 UPDATE，并发/重放只有一个赢家；过期、已拒绝、他人账号、参数被改（哈希不符）都不会执行。执行时重新走工具自己的授权，批准不会扩大权限。
- **风险提示**由服务端计算：`requested_after_reading_untrusted_content`、`injection_suspected`、`new_recipient:<地址>`（此前从未往来的收件人）、`deletes_mail`，在审批卡片上展示。
- **不可信输入**：邮件正文/主题/发件人/附件文本放进 `<untrusted_content>` 块，伪造的闭合标签、控制字符、零宽/双向字符、聊天模板标记会被清除；系统提示明确这些是数据不是指令。**注入检测只是提示用的启发式，不决定任何放行或拒绝**；真正的边界是授权和审批。
- **会话历史防投毒**：回放给模型的只有 user/assistant 文本，**不回放工具输出**，恶意邮件不能「持久化」到后续对话；客户端传来的 `system`/`tool` 角色被丢弃（旧接口接受任意角色，属于已知缺口，旧接口保持兼容未改）。
- 图片/外部链接：本阶段助手不抓取外部链接，也不读取图片；附件仅 text/csv/json 且 ≤50KB。

## 持久化与隐私（A、I）
`ai_conversation`、`ai_message`、`ai_agent_setting`、`ai_task_log`、`mail_draft`（迁移 0019）。
- 所有查询都带 `user_id`；他人会话 ID 无法读取、续写或删除。
- 用户可：关闭历史（完全不落库）、设置保留天数（1–365，默认 30，每日 cron 清理）、删除单个会话或全部。
- `ai_task_log` 只存模型/工具名、状态、是否回退、输入单位、耗时、标记，不存提示词和邮件内容，保留 90 天。
- 配额：沿用管理员设置的 `aiDailyQuota`（每次模型调用计 1 次）；另有每日工具调用上限；自动草稿单独计数，不占用交互额度。`GET /ai-assistant/v2/usage` 返回配额、近 30 天请求数/输入单位、任务统计。**费用以「单位」表示，没有编造货币金额**。

## 线程（C）
`thread-service`：以 Message-ID / In-Reply-To / References 双向遍历（祖先 + 后代），只在用户可读邮件里查找，所以别人收到的同 Message-ID 副本不会混入。主题仅作兜底：无任何头部关联时，才在同一邮箱、±30 天内、与种子邮件有**除邮箱主人以外**的共同参与者时合并（最多 20 封）。测试中发现并修复了一个缺陷：邮箱主人自己的地址会被当成共同参与者。

## 自动草稿（D、E）
每用户/每邮箱可开启（`autoDraftEnabled`，可选发件域名白名单），需 `AI_AGENT_V2`。读取完整往来，识别发件人语言（简体、繁体、英、韩、德、日；也可固定语言），保留称呼，按设置追加签名（签名由服务端追加，不由模型生成）。**只写草稿，代码里没有从自动草稿到发送的路径**；跳过自动邮件、群发、退信；失败不影响收信。

## 流式与可观测（F）
`POST /ai-assistant/v2/chat/stream`（SSE）：`progress`、`tool`、`approval`、`delta`、`done`、`error`。**工具步骤不是逐 token 流式，最终答案是切块推送**；真正的 token 级流式需要用真实 Workers AI 验证 `stream:true` 与工具调用的组合，待验证。模型调用失败自动重试一次（仅 503 类），主模型失败自动切换回退模型，并记录在任务日志中。

## 未完成 / 待验证
- 真实 Workers AI 的工具调用格式与回退行为只用脚本化模拟验证，未连接真实模型。
- 草稿与 Agent 设置界面：AI 助手抽屉右上角齿轮（仅 v2 开启时显示）→「偏好」和「草稿」两页。草稿页提供复制和丢弃，**没有「在写信窗口打开」**，需复制后自行粘贴。界面只做过构建验证，没有在浏览器里实际点过。
- 外部链接抓取、附件之外的写入类外部系统操作均未提供。
- 旧接口的伪造角色问题未修，建议所有客户端升级后关闭旧接口。

## 回滚
关闭 `AI_AGENT_V2` 即回到旧行为；新增表保留不删。
