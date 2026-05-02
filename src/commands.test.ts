import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractInlineImageTags, parseArgs, run } from "./commands.js";
import path from "node:path";
import type { CommandContext } from "./commands.js";

describe("parseArgs", () => {
  it("should parse default args", () => {
    const result = parseArgs(["https://example.com"]);
    expect(result).toEqual({
      url: "https://example.com",
      identity: "bot",
      asIdentity: undefined,
    });
  });

  it("should parse optional flags", () => {
    const result = parseArgs([
      "--identity",
      "user",
      "--as-identity",
      "openchat:oc_x",
      "https://example.com",
    ]);
    expect(result).toEqual({
      url: "https://example.com",
      identity: "user",
      asIdentity: "openchat:oc_x",
    });
  });

  it("should throw when url missing", () => {
    expect(() => parseArgs([])).toThrow(/Missing required article URL/);
  });
});

describe("extractInlineImageTags", () => {
  it("should extract normalized image tags", () => {
    const md = `prefix\n<image token="abc" width="100" height="200" align="center"/>\nmid\n<image token="def" width="300" height="400" align="left"/>\n`; 
    expect(extractInlineImageTags(md)).toEqual([
      `<image token="abc" width="100" height="200" align="center"/>`,
      `<image token="def" width="300" height="400" align="left"/>`,
    ]);
  });
});

function fakeMarkdownWithTwoImages(): string {
  return `# Title\n\nAuthor\n\n![](./assets/article/a.png)\n\nPara 2\n\n![](./assets/article/b.jpg)\n\nEnd\n`;
}

function createTestContext(): CommandContext & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    mkdir: vi.fn(async () => undefined),
    readFile: vi.fn(async () => fakeMarkdownWithTwoImages()),
    writeFile: vi.fn(async () => undefined),
    mkdtemp: vi.fn(async () => "/tmp/wechat2larkdoc-test"),
    exec: vi.fn(async (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      if (cmd === "wechat2md") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }
      if (cmd === "lark-cli" && args[0] === "docs" && args[1] === "+create") {
        return { stdout: JSON.stringify({ ok: true, data: { doc_id: "DOC_ID", doc_url: "https://www.feishu.cn/docx/DOC_ID" } }), stderr: "", exitCode: 0 };
      }
      if (cmd === "lark-cli" && args[0] === "docs" && args[1] === "+media-insert") {
        return { stdout: JSON.stringify({ ok: true, data: { file_token: "FILE_TOKEN" } }), stderr: "", exitCode: 0 };
      }
      if (cmd === "lark-cli" && args[0] === "docs" && args[1] === "+fetch") {
        return {
          stdout: JSON.stringify({
            ok: true,
            data: {
              markdown: `prefix\n<image token="tok_a" width="1" height="1" align="center"/>\nmid\n<image token="tok_b" width="2" height="2" align="center"/>\n`,
            },
          }),
          stderr: "",
          exitCode: 0,
        };
      }
      if (cmd === "lark-cli" && args[0] === "docs" && args[1] === "+update") {
        return { stdout: JSON.stringify({ ok: true }), stderr: "", exitCode: 0 };
      }
      if (cmd === "lark-cli" && args[0] === "drive") {
        return { stdout: JSON.stringify({ ok: true }), stderr: "", exitCode: 0 };
      }
      return { stdout: "", stderr: "", exitCode: 0 };
    }),
  };
}

describe("run", () => {
  it("should orchestrate wechat2md and lark-cli", async () => {
    const ctx = createTestContext();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await run(["--as-identity", "user:ou_x", "https://example.com"], ctx);

      const commands = ctx.calls.map((c) => c.join(" "));
      expect(commands[0]).toBe("wechat2md --download --output article.md https://example.com");
      expect(commands[1]).toBe("lark-cli docs +create --as bot --title Title --markdown placeholder");
      expect(commands[2]).toBe("lark-cli docs +media-insert --as bot --doc DOC_ID --file ./assets/article/a.png --align center");
      expect(commands[3]).toBe("lark-cli docs +media-insert --as bot --doc DOC_ID --file ./assets/article/b.jpg --align center");
      expect(commands[4]).toBe("lark-cli docs +fetch --as bot --doc DOC_ID");
      expect((commands[5] ?? "").startsWith("lark-cli docs +update --as bot --doc DOC_ID --mode overwrite --markdown ")).toBe(true);

      const permissionCmd = commands[6] as string;
      const paramsIndex = permissionCmd.indexOf("--params ");
      const dataIndex = permissionCmd.indexOf(" --data ");
      expect(paramsIndex).toBeGreaterThan(-1);
      expect(dataIndex).toBeGreaterThan(paramsIndex);
      const paramsJson = permissionCmd.slice(paramsIndex + "--params ".length, dataIndex);
      const dataJson = permissionCmd.slice(dataIndex + " --data ".length);
      expect(JSON.parse(paramsJson)).toEqual({ token: "DOC_ID", type: "docx", need_notification: false });
      expect(JSON.parse(dataJson)).toEqual({ member_id: "ou_x", member_type: "openid", perm: "edit", type: "user" });

      const finalMarkdown = (commands[5] ?? "").replace("lark-cli docs +update --as bot --doc DOC_ID --mode overwrite --markdown ", "");
      expect(finalMarkdown).toContain("<image token=\"tok_a\" width=\"1\" height=\"1\" align=\"center\"/>");
      expect(finalMarkdown).toContain("<image token=\"tok_b\" width=\"2\" height=\"2\" align=\"center\"/>");
      expect(finalMarkdown).not.toContain("./assets/article/a.png");

      const logged = JSON.parse((log.mock.calls[0] as unknown[])[0] as string);
      expect(logged.docId).toBe("DOC_ID");
      expect(logged.imageCount).toBe(2);
      expect(logged.grantedTo).toBe("user:ou_x");
    } finally {
      log.mockRestore();
    }
  });
});
