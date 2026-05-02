import path from "node:path";
import { collectImageReferences, replaceImagesWithInlineTags, stripHeading } from "./markdown.js";

export interface RunOptions {
  argv?: string[];
  now?: () => Date;
}

type ExecResult = { stdout: string; stderr: string; exitCode: number };

export interface CommandContext {
  exec: (cmd: string, args: string[], opts?: { cwd?: string }) => Promise<ExecResult>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  readFile: (filePath: string) => Promise<string>;
  mkdir: (dir: string) => Promise<void>;
  mkdtemp: (prefix: string) => Promise<string>;
}

interface LarkCreateResult {
  ok?: boolean;
  data?: { doc_id?: string; doc_url?: string };
}

interface MediaInsertResult {
  ok?: boolean;
  data?: { document_id?: string; file_token?: string };
}

interface LarkFetchResult {
  ok?: boolean;
  data?: { markdown?: string };
}

export function parseArgs(argv: string[]): {
  url: string;
  identity: string;
  asIdentity?: string;
} {
  const args = [...argv];
  let identity = "bot";
  let asIdentity: string | undefined;

  while (args.length && (args[0] ?? "").startsWith("--")) {
    const key = args.shift() as string;
    if (key === "--identity") {
      identity = args.shift() ?? "bot";
    } else if (key === "--as-identity") {
      asIdentity = args.shift();
    } else {
      throw new Error(`Unknown option: ${key}`);
    }
  }

  if (!args.length) {
    throw new Error("Missing required article URL");
  }

  return { url: args[0] as string, identity, asIdentity };
}

export async function fetchLocalMarkdown(ctx: CommandContext, url: string): Promise<{ workdir: string; markdownPath: string; markdown: string }> {
  const workdir = await ctx.mkdtemp("wechat2larkdoc-");
  const result = await ctx.exec("wechat2md", ["--download", "--output", "article.md", url], { cwd: workdir });
  if (result.exitCode !== 0) {
    throw new Error(`wechat2md failed: ${result.stderr || result.stdout}`);
  }
  const markdownPath = path.join(workdir, "article.md");
  const markdown = await ctx.readFile(markdownPath);
  return { workdir, markdownPath, markdown };
}

function normalizeInlineTag(tag: string): string {
  return tag.replace(/\u003c/g, "<").replace(/\u003e/g, ">").replace(/&amp;/g, "&");
}

export async function createEmptyLarkDoc(
  ctx: CommandContext,
  title: string,
  identity: string,
): Promise<{ docId: string; docUrl: string }> {
  const args = ["docs", "+create", "--as", identity, "--title", title, "--markdown", "placeholder"];
  const result = await ctx.exec("lark-cli", args);
  if (result.exitCode !== 0) {
    throw new Error(`lark-cli docs +create failed: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout) as LarkCreateResult;
  const docId = parsed.data?.doc_id;
  const docUrl = parsed.data?.doc_url;
  if (!docId || !docUrl) {
    throw new Error("lark-cli docs +create returned no doc_id/doc_url");
  }
  return { docId, docUrl };
}

export async function uploadLocalImages(
  ctx: CommandContext,
  docId: string,
  workdir: string,
  refs: string[],
  identity: string,
): Promise<void> {
  for (const ref of refs) {
    const args = ["docs", "+media-insert", "--as", identity, "--doc", docId, "--file", ref, "--align", "center"];
    const result = await ctx.exec("lark-cli", args, { cwd: workdir });
    if (result.exitCode !== 0) {
      throw new Error(`lark-cli docs +media-insert failed for ${ref}: ${result.stderr || result.stdout}`);
    }
    const parsed = JSON.parse(result.stdout) as MediaInsertResult;
    if (!parsed.ok || !parsed.data?.file_token) {
      throw new Error(`lark-cli docs +media-insert returned invalid payload for ${ref}`);
    }
  }
}

const IMAGE_TAG_RE = /<image\s+[^>]*token="[^"]+"[^>]*\/>/g;

export function extractInlineImageTags(fetchMarkdown: string): string[] {
  return [...fetchMarkdown.matchAll(IMAGE_TAG_RE)].map((m) => normalizeInlineTag(m[0].trim()));
}

export async function fetchInlineImageTags(ctx: CommandContext, docId: string, identity: string, expected: number): Promise<string[]> {
  const args = ["docs", "+fetch", "--as", identity, "--doc", docId];
  const result = await ctx.exec("lark-cli", args);
  if (result.exitCode !== 0) {
    throw new Error(`lark-cli docs +fetch failed: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout) as LarkFetchResult;
  const md = parsed.data?.markdown ?? "";
  const tags = extractInlineImageTags(md);
  if (tags.length !== expected) {
    throw new Error(`Expected ${expected} inline image tags but found ${tags.length}`);
  }
  return tags;
}

export async function overwriteDocWithInlineImages(
  ctx: CommandContext,
  docId: string,
  markdown: string,
  inlineTags: string[],
  identity: string,
): Promise<void> {
  const finalMarkdown = replaceImagesWithInlineTags(markdown, inlineTags);
  const args = ["docs", "+update", "--as", identity, "--doc", docId, "--mode", "overwrite", "--markdown", finalMarkdown];
  const result = await ctx.exec("lark-cli", args);
  if (result.exitCode !== 0) {
    throw new Error(`lark-cli docs +update failed: ${result.stderr || result.stdout}`);
  }
}

export async function grantEditAccess(
  ctx: CommandContext,
  docId: string,
  asIdentity: string,
  identity: string,
): Promise<void> {
  const [memberType, memberId] = asIdentity.split(":");
  if (!memberType || !memberId) {
    throw new Error(`Invalid --as-identity value: ${asIdentity}`);
  }
  const payload = JSON.stringify({
    member_id: memberId,
    member_type: memberType === "user" ? "openid" : memberType,
    perm: "edit",
    type: memberType === "user" ? "user" : "chat",
  });
  const args = [
    "drive",
    "permission.members",
    "create",
    "--as",
    identity,
    "--params",
    JSON.stringify({ token: docId, type: "docx", need_notification: false }),
    "--data",
    payload,
  ];
  const result = await ctx.exec("lark-cli", args);
  if (result.exitCode !== 0) {
    throw new Error(`lark-cli permission.members create failed: ${result.stderr || result.stdout}`);
  }
}

export async function run(argv: string[], ctx?: CommandContext): Promise<void> {
  const parsed = parseArgs(argv);
  // default ctx intentionally omitted for CLI bootstrap; integration happens later
  if (!ctx) {
    throw new Error("CLI runtime is not wired yet");
  }
  const { workdir, markdown } = await fetchLocalMarkdown(ctx, parsed.url);
  const title = markdown.split(`\n`)[0]?.replace(/^#\s+/, "").trim() || "WeChat Article";
  const refs = collectImageReferences(markdown);
  const { docId, docUrl } = await createEmptyLarkDoc(ctx, title, parsed.identity);
  await uploadLocalImages(ctx, docId, workdir, refs, parsed.identity);
  const inlineTags = await fetchInlineImageTags(ctx, docId, parsed.identity, refs.length);
  const cleanedMarkdown = stripHeading(markdown);
  await overwriteDocWithInlineImages(ctx, docId, cleanedMarkdown, inlineTags, parsed.identity);
  if (parsed.asIdentity) {
    await grantEditAccess(ctx, docId, parsed.asIdentity, parsed.identity);
  }
  console.log(JSON.stringify({ docId, docUrl, imageCount: refs.length, grantedTo: parsed.asIdentity ?? null }));
}
