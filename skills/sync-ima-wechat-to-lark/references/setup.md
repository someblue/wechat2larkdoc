# 初次使用时的 setup 过程

## 目标

setup 流程用于把 IMA knowledge base → WeChat article → Lark docs 的同步链路初始化到可重复运行状态。完成后应得到：

- 一个可解析的 IMA knowledge base name。
- 一个 Feishu Base，用于存放文章索引。
- 一个 summary doc，用于维护同步摘要。
- 一个持久化 config file。
- 一个持久化 state file。
- 一套通过预检的 CLI / permission / scope 环境。
- 最后询问用户是否创建每日自动同步任务。

## 1. 前置 Skill 与工具

执行 setup 前，加载并遵循：

- `ima-skill`
- `wechat2larkdoc`
- `lark-base`
- `lark-doc`
- `lark-shared`

检查本地命令：

```bash
command -v node
command -v npm
command -v npx
command -v lark-cli
command -v wechat2md
```

检查 `lark-cli`：

```bash
lark-cli --version
lark-cli docs +fetch --help
lark-cli base +record-list --help
```

检查 IMA credential 是否存在，但不要打印内容：

```bash
test -f ~/.config/ima/client_id && test -f ~/.config/ima/api_key && echo "IMA credentials configured"
```

如果 credential 不存在，引导用户去 IMA OpenAPI 页面获取 Client ID / API Key，并写入：

```bash
mkdir -p ~/.config/ima
printf '%s' 'your_client_id' > ~/.config/ima/client_id
printf '%s' 'your_api_key' > ~/.config/ima/api_key
```

## 2. 创建配置文件

从模板复制配置文件到持久目录：

```bash
mkdir -p ~/.hermes/state/ima-wechat-to-lark
cp skills/sync-ima-wechat-to-lark/templates/config.example.json ~/.hermes/state/ima-wechat-to-lark/config.json
```

配置字段：

```json
{
  "knowledgeBaseName": "R的知识库",
  "statePath": "~/.hermes/state/ima-wechat-to-lark/state.json",
  "baseToken": "",
  "tableId": "",
  "summaryDocId": "",
  "larkIdentity": "bot",
  "workDir": "/tmp/ima-wechat-to-lark"
}
```

规则：

- `knowledgeBaseName` 是 IMA knowledge base 名称。
- `statePath` 必须是持久路径，不要放到 `/tmp`。
- `baseToken`、`tableId`、`summaryDocId` 可以先为空，在创建资源后回填。
- Credential 不进入配置文件。

## 3. 验证 IMA knowledge base

使用 `scripts/ima_call.js` 调用 IMA API。该脚本默认查找 `~/.hermes/skills/productivity/ima-skill/ima_api.cjs`，也可以用 `IMA_SKILL_DIR` 覆盖。

```bash
node skills/sync-ima-wechat-to-lark/scripts/ima_call.js \
  openapi/wiki/v1/search_knowledge_base \
  '{"query":"R的知识库","cursor":"","limit":20}' \
  > /tmp/ima_search_kb.json
```

解析规则：

- response path 是 `data.info_list`。
- item 字段是 `kb_id` 和 `kb_name`。
- 必须找到唯一匹配的 `kb_name`。
- 如果有多个候选，询问用户选择哪一个。

## 4. 创建或确认 Feishu Base

如果用户已有 Base 和 table，直接填入 config 的 `baseToken` 与 `tableId`，然后读取字段：

```bash
lark-cli base +field-list --as bot --base-token "$BASE_TOKEN" --table-id "$TABLE_ID"
```

如果需要新建 Base / table，字段至少包含：

| 字段名 | 用途 |
| --- | --- |
| 文章标题 | 文章标题，作为 upsert 识别字段之一 |
| IMA来源链接 | 原始 WeChat URL 或 IMA source URL，注意不要在最终报告展示 |
| 飞书文档 | Lark doc URL |
| 同步状态 | `已同步` / `失败` |
| 摘要 | 文章摘要 |
| 同步时间 | 当前同步时间 |
| 错误信息 | 单篇失败原因 |

创建完成后，立即用 `+field-list` 和一次 test record 写入 / 读取验证字段格式。中文 JSON 不要 inline 传给 shell，应写到文件后使用 `@./relative_path`。

```bash
cd /tmp/ima-wechat-to-lark && lark-cli base +record-upsert --as bot \
  --base-token "$BASE_TOKEN" \
  --table-id "$TABLE_ID" \
  --json @./record.json
```

## 5. 创建或确认 summary doc

如果用户已有 summary doc，填入 config 的 `summaryDocId` 并 fetch 验证：

```bash
lark-cli docs +fetch --as bot --doc "$SUMMARY_DOC_ID" --format markdown
```

如果需要新建 summary doc，建议初始结构：

```md
# IMA 微信文章同步汇总

## 当前状态

- 文档总数：0
- 已同步：0
- 失败：0

## 最近同步文章
```

后续同步时，新增文章应插入到第一篇已有文章 heading 前，而不是插到 `## 最近同步文章` heading 前。

## 6. 验证 media upload scope

`wechat2larkdoc` 需要 `lark-cli docs +media-insert` 成功。使用测试图片和测试文档验证：

```bash
lark-cli docs +media-insert --as bot --doc "$TEST_DOC_ID" --file ./test.png
```

如果失败并提示：

```text
App scope not enabled: required scope docs:document.media:upload
```

需要在 Feishu developer console 为当前 app 启用 `docs:document.media:upload` scope。这个是 bot-side scope，不能通过 `lark-cli auth login` 解决。

## 7. 初始化 state file

从模板复制 state：

```bash
cp skills/sync-ima-wechat-to-lark/templates/state.example.json ~/.hermes/state/ima-wechat-to-lark/state.json
```

回填：

- `knowledgeBaseName`
- `base.token`
- `base.tableId`
- `summaryDoc.docId`

如果 Base 已经有历史记录，setup 时应从 Base `+record-list` 重建 `results[]`，不要重新转换已存在文章。

## 8. 跑一次 dry run

setup 最后建议先执行 dry run 或小批量同步：

- 只列出 IMA knowledge items。
- 过滤出 `media_type=6` 的 WeChat candidates。
- 从 Base / state 判断哪些是 new articles。
- 不真正转换，先报告数量。

如果用户同意，再执行一次真实同步。

## 9. 询问是否创建每日自动同步任务

setup 完成后，必须询问用户是否创建每日自动同步任务。

推荐问题：

```text
Setup 已完成。是否要创建一个每日自动同步任务？如果需要，请告诉我希望每天几点运行；如果你没有偏好，我建议每天 09:00 运行，并把结果发送回当前会话。
```

如果用户确认，使用 Hermes cron job 创建任务。cron prompt 必须自包含，至少包括：

- 读取本 Skill。
- 读取 `references/sync.md`。
- 使用指定 config path。
- 执行 incremental sync。
- 最终只输出高层统计，不输出 credential、token、OpenID、raw URL。

示例 prompt 结构：

```text
Load the sync-ima-wechat-to-lark skill. Read references/sync.md. Use config path ~/.hermes/state/ima-wechat-to-lark/config.json. Run one incremental IMA WeChat to Lark sync. Report only high-level counts and failed article titles. Do not print credentials, tokens, OpenIDs, Base tokens, raw doc IDs, or raw WeChat URLs.
```

创建 cron job 后，报告 job name、schedule 和 deliver target。不要把 credential 或 token 写入 cron prompt。
