# wechat2larkdoc

Convert a WeChat official account article into a Lark/Feishu doc, including inline images.

This tool is an orchestrator:

- it calls `wechat2md` to export article content and images
- it calls `lark-cli` to create and update the Lark doc
- it does **not** re-implement WeChat parsing or Feishu document APIs

## Prerequisites

- Node.js 18+
- `wechat2md` available on `PATH`
- `lark-cli` available on `PATH` and authenticated/configured

## Install `wechat2md`

```bash
git clone https://github.com/wanggch/wechat2md.git
cd wechat2md

go mod tidy
go build -o wechat2md

mkdir -p ~/.local/bin
cp ./wechat2md ~/.local/bin/wechat2md
chmod +x ~/.local/bin/wechat2md
```

Make sure `~/.local/bin` is on `PATH`:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Verify:

```bash
wechat2md --help
```

## Run with npx

From GitHub:

```bash
npx github:someblue/wechat2larkdoc 'https://mp.weixin.qq.com/s/xxx'
```

After npm publishing, the package form will be:

```bash
npx wechat2larkdoc 'https://mp.weixin.qq.com/s/xxx'
```

Grant edit access to a Feishu user after creating the document:

```bash
npx github:someblue/wechat2larkdoc \
  --identity bot \
  --as-identity user:ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  'https://mp.weixin.qq.com/s/xxx'
```

## Usage

```bash
wechat2larkdoc [--identity bot] [--as-identity user:<openid>|openchat:<chatid>] <wechat_article_url>
```

Options:

- `--identity <name>`: identity passed to `lark-cli --as`; defaults to `bot`
- `--as-identity <target>`: optional Feishu permission target
  - `user:<openid>` grants edit permission to a user
  - `openchat:<chatid>` grants edit permission to a chat
- `--help`: show usage

## Default behavior

1. Run `wechat2md --download --output article.md` in a temporary working directory.
2. Create a Lark doc with `lark-cli docs +create --as bot`.
3. Upload each local image with `lark-cli docs +media-insert`.
4. Fetch the uploaded image tokens with `lark-cli docs +fetch`.
5. Replace original local image paths with inline `<image token="..." />` tags.
6. Overwrite the Lark doc with `lark-cli docs +update --mode overwrite`.
7. Optionally grant edit permission to a target Feishu user/chat.

## Output

On success, the CLI prints JSON:

```json
{
  "docId": "docx_token",
  "docUrl": "https://www.feishu.cn/docx/docx_token",
  "imageCount": 7,
  "grantedTo": "user:ou_xxx"
}
```
