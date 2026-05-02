---
name: wechat2larkdoc
version: 0.1.0
description: Use this skill when the user wants to convert a WeChat Official Account article into a Lark/Feishu document, preserve inline images, run or troubleshoot the wechat2larkdoc CLI, or set up its dependencies wechat2md and lark-cli.
metadata:
  requires:
    bins:
      - node
      - npm
      - npx
      - wechat2md
      - lark-cli
---

# wechat2larkdoc

This skill guides agents to use `wechat2larkdoc`, a TypeScript CLI that converts a WeChat Official Account article URL into a Lark/Feishu document with images placed inline at their original positions.

Use this skill when the user asks to:

- convert a `mp.weixin.qq.com/s/...` article into a Lark/Feishu doc
- save a WeChat Official Account article as a Feishu document
- preserve article images inline rather than appending them at the end
- install, verify, or troubleshoot `wechat2larkdoc`
- chain `wechat2md` with `lark-cli`

## What the tool does

`wechat2larkdoc` is an orchestrator. It does not re-implement WeChat parsing or Feishu OpenAPI calls.

Pipeline:

1. Runs `wechat2md --download --output article.md <url>` in a temporary directory.
2. Reads the generated Markdown and local images under `assets/`.
3. Creates a Lark doc with `lark-cli docs +create`.
4. Uploads each local image with `lark-cli docs +media-insert`.
5. Fetches the document with `lark-cli docs +fetch` to obtain Feishu inline image tags.
6. Replaces local Markdown image references with those inline image tags.
7. Overwrites the document with `lark-cli docs +update --mode overwrite`.
8. Optionally grants edit access with `lark-cli drive permission.members create`.

## Prerequisites

Before running the tool, verify these commands are available:

```bash
command -v node
command -v npm
command -v npx
command -v wechat2md
command -v lark-cli
```

Also verify `lark-cli` is configured and authenticated for the desired Feishu/Lark workspace:

```bash
lark-cli --version
lark-cli docs +fetch --help
```

If `wechat2md` is missing, install it from source:

```bash
git clone https://github.com/wanggch/wechat2md.git
cd wechat2md

go mod tidy
go build -o wechat2md

mkdir -p ~/.local/bin
cp ./wechat2md ~/.local/bin/wechat2md
chmod +x ~/.local/bin/wechat2md
```

If dependency downloads from the default Go proxy fail, retry with an explicit proxy:

```bash
GOPROXY=https://goproxy.cn,direct go mod tidy
GOPROXY=https://goproxy.cn,direct go build -o wechat2md
```

Ensure `~/.local/bin` is on `PATH`.

## Basic usage

Run directly from GitHub:

```bash
npx github:someblue/wechat2larkdoc 'https://mp.weixin.qq.com/s/ARTICLE_ID'
```

Grant edit access to a Feishu user after document creation:

```bash
npx github:someblue/wechat2larkdoc \
  --identity bot \
  --as-identity user:ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  'https://mp.weixin.qq.com/s/ARTICLE_ID'
```

Grant edit access to a Feishu chat:

```bash
npx github:someblue/wechat2larkdoc \
  --identity bot \
  --as-identity openchat:oc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  'https://mp.weixin.qq.com/s/ARTICLE_ID'
```

The command prints JSON on success:

```json
{
  "docId": "docx_token",
  "docUrl": "https://www.feishu.cn/docx/docx_token",
  "imageCount": 7,
  "grantedTo": "user:ou_xxx"
}
```

## Recommended agent workflow

1. Confirm the input URL is a WeChat Official Account article URL.
2. Check prerequisites with `command -v` before running the conversion.
3. Run `npx github:someblue/wechat2larkdoc --help` if unsure about flags.
4. Run the conversion command.
5. Parse the JSON output and report the `docUrl` to the user.
6. If the user needs access, prefer `--as-identity user:<openid>` or `--as-identity openchat:<chatid>` during the first run.
7. Verify the result with `lark-cli docs +fetch --as <identity> --doc <docId>` when correctness matters.

## Verification checklist

After conversion, validate these conditions when possible:

```bash
lark-cli docs +fetch --as bot --doc <docId>
```

Expected result:

- the document is readable
- the number of inline `<image ... />` tags equals the reported `imageCount`
- there are no remaining local image references such as `./assets/...`
- there are no placeholder messages indicating that images were appended elsewhere

## Troubleshooting

### `wechat2md` not found

Root cause: `wechat2md` is not on `PATH` for the agent process.

Fix:

```bash
command -v wechat2md
export PATH="$HOME/.local/bin:$PATH"
```

If necessary, rebuild and reinstall `wechat2md` from source.

### `lark-cli` not found

Root cause: Node or shell initialization differs between interactive shells and agent subprocesses.

Fix: locate the binary and ensure its directory is on `PATH` for the process running `wechat2larkdoc`.

```bash
command -v lark-cli
lark-cli --version
```

### `wechat2md failed`

Common causes:

- the URL is not a `mp.weixin.qq.com/s/...` article
- WeChat blocks or rate-limits the request
- network/proxy settings are missing
- the article requires additional access checks

Run `wechat2md` directly in a temporary directory to isolate the issue:

```bash
mkdir -p /tmp/wechat2md-debug
cd /tmp/wechat2md-debug
wechat2md --download --output article.md 'https://mp.weixin.qq.com/s/ARTICLE_ID'
```

### Images are missing or not inline

Check whether `wechat2md` produced local image files and whether `lark-cli docs +media-insert` succeeded. The tool relies on matching image order: Markdown image references are uploaded in order, then fetched inline image tags are substituted back in the same order.

### Permission problems

Documents are usually created as the configured `lark-cli` identity, often `bot`. If the user cannot open the document, rerun with an access target or grant permission manually.

Use:

```bash
npx github:someblue/wechat2larkdoc \
  --identity bot \
  --as-identity user:ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  'https://mp.weixin.qq.com/s/ARTICLE_ID'
```

## Safety notes

- Do not print or store app secrets, tokens, cookies, or credential files.
- Treat Feishu open IDs and chat IDs as sensitive when sharing logs publicly.
- Prefer reporting only the final document URL and high-level verification results to the user.
- Do not rewrite the article parser or Feishu API workflow inside the agent; use `wechat2md` and `lark-cli` as the source of truth.
