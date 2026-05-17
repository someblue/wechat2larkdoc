# 后续每次同步时的 Skill 处理过程

## 目标

每次同步执行一次 incremental sync：从 IMA knowledge base 发现新的微信公众号文章，转换为 Lark docs，插入摘要 callout，更新 Feishu Base、summary doc 和本地 state。单篇失败不阻塞整批，最终只报告统计和失败标题。

## 1. 读取配置与准备工作目录

读取 config file，推荐路径：

```bash
~/.hermes/state/ima-wechat-to-lark/config.json
```

需要字段：

- `knowledgeBaseName`
- `statePath`
- `baseToken`
- `tableId`
- `summaryDocId`
- `larkIdentity`
- `workDir`

展开 `~`，创建 `workDir`，但不要把 state 放在 `workDir` 或 `/tmp`。

## 2. 预检

检查 IMA credential 存在，但不要打印内容：

```bash
test -f ~/.config/ima/client_id && test -f ~/.config/ima/api_key
```

检查命令：

```bash
command -v node
command -v npx
command -v lark-cli
command -v wechat2md
```

检查飞书资源可读：

```bash
lark-cli base +field-list --as "$LARK_IDENTITY" --base-token "$BASE_TOKEN" --table-id "$TABLE_ID"
lark-cli docs +fetch --as "$LARK_IDENTITY" --doc "$SUMMARY_DOC_ID" --format markdown
```

如果 credential 缺失、Base 不可读、summary doc 不可读、`wechat2larkdoc` 依赖缺失，应暂停整批并向用户报告 setup 问题。

## 3. 读取 state 与 Base 记录

读取 `statePath`。如果 state 不存在，不要从 session log 恢复，优先从 Base 重建。

Base 是 authoritative source，state 是 cache。同步前必须读取 Base：

```bash
lark-cli base +record-list --as "$LARK_IDENTITY" \
  --base-token "$BASE_TOKEN" \
  --table-id "$TABLE_ID" \
  --limit 200 \
  > "$WORK_DIR/base_records.json"
```

归一化已同步集合：

- title
- source URL
- media ID
- doc URL
- status

注意：`+record-list` 输出 shape 可能随版本变化。可能是 JSON，也可能是 markdown table。标题包含 `|` 时不要 naive split table；应优先使用 JSON 输出，如果只能处理 table，要用 distinctive substring 做二次确认。

如果 Base 与 state 冲突，以 Base 为准，并在本轮结束时重写 state。

## 4. 发现 IMA knowledge items

先解析 knowledge base：

```bash
node skills/sync-ima-wechat-to-lark/scripts/ima_call.js \
  openapi/wiki/v1/search_knowledge_base \
  '{"query":"","cursor":"","limit":20}' \
  > "$WORK_DIR/kb.json"
```

字段规则：

- `search_knowledge_base` response path: `data.info_list`
- item fields: `kb_id`, `kb_name`

找到 `kb_name == knowledgeBaseName` 的唯一项。

再读取条目：

```bash
node skills/sync-ima-wechat-to-lark/scripts/ima_call.js \
  openapi/wiki/v1/get_knowledge_list \
  '{"knowledge_base_id":"<kb_id>","cursor":"","limit":100}' \
  > "$WORK_DIR/items.json"
```

字段规则：

- `get_knowledge_list` response path: `data.knowledge_list`
- item fields: `media_id`, `title`, `media_type`

只处理 `media_type=6` 的 WeChat article candidates。其他类型标记为 skipped，不写失败记录。

## 5. 识别 new articles

对每个 WeChat candidate，根据以下 key 判断是否已同步：

- title
- media ID
- source URL，如果已知

先与 Base 记录比较，再与 state 比较。Base 命中则认为已同步。

对 candidate new articles，继续解析完整 media ID 和 source URL。

## 6. 解析完整 media ID 与 source URL

`get_knowledge_list` 返回的 `media_id` 可能是截断的。对每篇新文章，使用 `search_knowledge` 通过标题重新查询完整 `media_id`：

```bash
node skills/sync-ima-wechat-to-lark/scripts/ima_call.js \
  openapi/wiki/v1/search_knowledge \
  '{"query":"<title_or_keyword>","knowledge_base_id":"<kb_id>","cursor":""}' \
  > "$WORK_DIR/search_one.json"
```

标题包含 smart quotes、中文标点或特殊符号时，完整标题可能查不到。fallback 策略：

1. 使用不含特殊标点的短关键词。
2. 使用 2–4 个有辨识度的中文片段。
3. 如果仍查不到，记录为单篇失败并继续下一篇。

拿到完整 `media_id` 后调用 `get_media_info`：

```bash
node skills/sync-ima-wechat-to-lark/scripts/ima_call.js \
  openapi/wiki/v1/get_media_info \
  '{"media_id":"<full_media_id>"}' \
  > "$WORK_DIR/media_info.json"
```

只接受：

- host: `mp.weixin.qq.com`
- path: `/s/...`

不符合则 skipped，不作为失败。

## 7. 转换文章为 Lark doc

对每篇新文章执行：

```bash
npx -y github:someblue/wechat2larkdoc --identity "$LARK_IDENTITY" "$URL" \
  > "$ARTICLE_DIR/convert_stdout.json" \
  2> "$ARTICLE_DIR/convert_stderr.log"
```

成功 stdout JSON 字段：

- `docId`
- `docUrl`
- `imageCount`

失败时记录：

- title
- media ID
- short error
- status: `失败`

然后继续下一篇。

## 8. Fetch 文档并生成摘要

Fetch generated doc：

```bash
lark-cli docs +fetch --as "$LARK_IDENTITY" --doc "$DOC_ID" --format markdown \
  > "$ARTICLE_DIR/fetch_doc.json"
```

解析注意事项：

- `lark-cli` 可能先输出 warning，再输出 JSON；应从第一个 `{` 开始 parse。
- markdown 可能在 top-level `markdown`，不一定在 `data.markdown`。

摘要输入需要清理：

- existing top `<callout ...>...</callout>` blocks
- author/source/original-link metadata
- WeChat follow/star prompts
- separator lines
- `<image .../>` tags
- raw URLs and tokens

生成 80–180 字中文摘要，要求是 synthesis，不要复制正文首段。

## 9. 插入 summary callout

Callout 模板：

```md
<callout emoji="bulb" background-color="light-yellow">
**文章总结**
摘要文本
</callout>

---

```

写入文件后使用相对路径：

```bash
cd "$ARTICLE_DIR" && lark-cli docs +update --as "$LARK_IDENTITY" --doc "$DOC_ID" \
  --mode insert_before \
  --selection-with-ellipsis "作者：" \
  --markdown "@./callout.md"
```

规则：

- 优先 `insert_before`，避免 `overwrite`。
- `--markdown @file` 必须使用 relative path。
- `--selection-by-title` 只匹配 markdown heading，普通段落或 blockquote 不适用。
- 如果 locator 命中多个位置，换更长、更唯一的 `selection-with-ellipsis`。

插入后 refetch 验证：

- 文档顶部以 `<callout` 开始。
- exactly one `<callout`。
- 摘要不是正文前缀。
- `<image .../>` 数量与 `imageCount` 大致一致。

## 10. Upsert Feishu Base record

字段至少包括：

- `文章标题`
- `IMA来源链接`
- `飞书文档`
- `同步状态`
- `摘要`
- `同步时间`
- `错误信息`

中文 JSON 必须写入文件后传给 `lark-cli`：

```bash
cd "$ARTICLE_DIR" && lark-cli base +record-upsert --as "$LARK_IDENTITY" \
  --base-token "$BASE_TOKEN" \
  --table-id "$TABLE_ID" \
  --json @./record.json
```

规则：

- 不要 inline 传中文 JSON。
- `@file` 必须是 relative path。
- upsert 后，如果输出 shape 不明确，使用 `+record-list` 或 `+record-get` 验证。

## 11. 更新 summary doc

summary doc 保持最新文章在最前。

先 fetch 当前 summary doc，找到 `## 最近同步文章` 后面的第一篇文章 heading。如果已有文章，插入到第一篇文章 heading 前；如果没有文章，插入到 `## 最近同步文章` 后。

`--selection-by-title` 必须包含 markdown heading prefix：

```bash
lark-cli docs +update --as "$LARK_IDENTITY" --doc "$SUMMARY_DOC_ID" \
  --mode insert_before \
  --selection-by-title "## Existing First Article Title" \
  --markdown "@./summary_section.md"
```

更新计数时使用 `replace_all`，不要使用不存在的 `str_replace` mode：

```bash
lark-cli docs +update --as "$LARK_IDENTITY" --doc "$SUMMARY_DOC_ID" \
  --mode replace_all \
  --selection-with-ellipsis "文档总数：48" \
  --markdown "文档总数：50"
```

避免 `overwrite` 重建整个 summary doc，除非结构已经不可恢复。

## 12. 更新 state

每篇文章处理完成后立即 flush state。记录字段：

- title
- mediaId
- sourceUrl
- status
- docId
- docUrl
- imageCount
- summary
- error
- syncedAt

本轮结束后更新 `lastRun`：

- startedAt
- finishedAt
- foundWeChatCount
- successCount
- failureCount
- skippedNonWeChatTitles

如果 state 丢失，从 Base records 重建 `results[]`，不要搜索 Hermes session logs。

## 13. Error Handling

可跳过，不算失败：

- `media_type != 6`
- URL 不是 `mp.weixin.qq.com/s/...`
- PDF / docx / 普通网页等非 WeChat entries

单篇失败，继续下一篇：

- `search_knowledge` 找不到完整 media ID
- `get_media_info` 失败
- `wechat2larkdoc` 失败
- generated doc fetch 失败
- callout 插入失败
- Base upsert 失败

暂停整批：

- IMA credential 缺失
- `lark-cli` 未配置或不可用
- Base / table 不可读
- summary doc 不可读
- `wechat2md` / `wechat2larkdoc` 依赖缺失
- Feishu app 缺少关键 scope，导致所有图片上传都会失败

## 14. Verification Checklist

每篇成功文章：

- [ ] `wechat2larkdoc` 返回 `docId`、`docUrl`、`imageCount`。
- [ ] `docs +fetch` 成功。
- [ ] 顶部 exactly one callout。
- [ ] 摘要为 80–180 字 synthesis。
- [ ] 图片数量与 `imageCount` 大致一致。
- [ ] Base record 可读，字段正确。
- [ ] Summary doc 包含新增文章。
- [ ] State 已写入。

整批完成：

- [ ] success / failure / skipped 统计正确。
- [ ] final report 不包含 credential、token、OpenID、Base token、raw doc ID、raw WeChat URL。
