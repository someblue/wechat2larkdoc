import { run } from "./commands.js";
import { createNodeCommandContext } from "./node-context.js";

const usage = `Usage: wechat2larkdoc [options] <wechat_article_url>

Options:
  --identity <name>             lark-cli identity passed via --as, defaults to bot
  --as-identity user:<openid>   grant edit access to a Feishu user
  --as-identity openchat:<id>   grant edit access to a Feishu chat
  --help                        show this help message
`;

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(usage);
  process.exit(0);
}

run(args, createNodeCommandContext()).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
