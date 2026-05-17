---
name: sync-ima-wechat-to-lark
version: 0.1.0
description: Use this skill when syncing WeChat Official Account articles from an IMA knowledge base into Lark docs, with Feishu Base indexing, summary callouts, incremental state, recovery handling, and optional scheduled automation.
metadata:
  requires:
    bins:
      - node
      - npm
      - npx
      - lark-cli
      - wechat2md
    skills:
      - ima-skill
      - wechat2larkdoc
      - lark-base
      - lark-doc
---

# IMA 知识库微信公众号文章同步到飞书

## Overview

这个 Skill 用于把 IMA knowledge base 中收藏的微信公众号文章同步到 Lark / Feishu：读取 IMA 知识库条目，识别 `mp.weixin.qq.com/s/...` 文章，调用 `wechat2larkdoc` 转成飞书文档，生成中文摘要并插入文档顶部 callout，同时维护 Feishu Base 索引、汇总文档和本地 state，实现可恢复的 incremental sync。

这个 Skill 是 workflow orchestration，不替代底层工具：

- IMA API 调用遵循 `ima-skill`。
- 微信文章转换遵循 `wechat2larkdoc`。
- 飞书文档更新遵循 `lark-doc` / `lark-base`。
- 定时任务创建遵循 Hermes cron job 能力。

## When to Use

使用本 Skill，当用户想要：

- 把 IMA knowledge base 中的微信公众号文章批量归档到飞书文档。
- 对 IMA 收藏的 WeChat Official Account articles 做每日或定期 incremental sync。
- 建立或维护一个 Feishu Base 作为文章索引。
- 为同步后的文章自动插入摘要 callout。
- 修复同步 state 丢失、Base 记录不一致、单篇转换失败等问题。

不要使用本 Skill，当任务只是：

- 单篇微信公众号 URL 转飞书文档：使用 `wechat2larkdoc`。
- 搜索或读取 IMA 知识库内容：使用 `ima-skill`。
- 只操作飞书文档或 Base：使用 `lark-doc` / `lark-base`。
- 同步 PDF、docx、普通网页、Bilibili / YouTube 等非 WeChat article 内容。

## Workflow 分层

本 Skill 的逻辑拆成两个独立 reference：

1. 初次使用时的 setup 过程：读取 `references/setup.md`。
2. 后续每次同步时的处理过程：读取 `references/sync.md`。

执行前先判断当前场景：

| 场景 | 必读文件 |
| --- | --- |
| 第一次配置、创建 Base、创建 summary doc、初始化 state、准备定时任务 | `references/setup.md` |
| 已经配置好，手动跑一次同步或 cron job 跑同步 | `references/sync.md` |
| state 丢失、Base 与 state 不一致、需要恢复 | `references/sync.md` 的 recovery 章节 |

## Required Inputs

推荐使用 `templates/config.example.json` 作为配置起点，复制到持久位置后填写：

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

约束：

- 不要把 IMA credential、Feishu app secret、access token 写入 config。
- IMA credential 来自 `~/.config/ima/client_id` / `~/.config/ima/api_key` 或环境变量。
- Feishu credential 由 `lark-cli` 管理。
- `statePath` 必须使用持久目录，不要放在 `/tmp`。

## Supporting Files

本 Skill 附带以下支持文件：

- `references/setup.md`：初次配置流程。
- `references/sync.md`：每次同步流程。
- `scripts/ima_call.js`：可复用的 IMA API wrapper，避免重复处理 credential 和路径。
- `templates/config.example.json`：配置模板。
- `templates/state.example.json`：state schema 模板。

## Security Rules

- 不要打印 IMA Client ID、API Key、Feishu app secret、access token。
- 最终报告中不要包含 Base token、raw doc IDs、OpenIDs 或原始 WeChat URL。
- `sourceUrl` 可以保存在本地 state 中，但不要在用户可见报告里展示。
- 批量执行时只报告统计、失败标题和短错误原因。

## Final Report Format

同步完成后使用这种格式汇报：

```text
IMA WeChat → Lark sync completed.

- Knowledge base: <name>
- Found new WeChat articles: <n>
- Synced successfully: <n>
- Failed: <n>
- Skipped non-WeChat entries: <n>
- Base updated: yes/no
- Summary doc updated: yes/no

Failed articles:
- <title>: <short reason>
```

## Verification Checklist

- [ ] 已根据场景读取 `references/setup.md` 或 `references/sync.md`。
- [ ] IMA credential 和 `lark-cli` credential 已验证，但没有泄露。
- [ ] `statePath` 位于持久目录。
- [ ] 新文章转换后可以 fetch 到飞书文档。
- [ ] 每篇成功文档顶部 exactly one summary callout。
- [ ] Feishu Base record 可读，字段正确。
- [ ] Summary doc 包含新增文章并保持最新在前。
- [ ] State 已写入，可用于下一次 incremental sync。
