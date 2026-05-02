export interface RunOptions {
    argv?: string[];
    now?: () => Date;
}
type ExecResult = {
    stdout: string;
    stderr: string;
    exitCode: number;
};
export interface CommandContext {
    exec: (cmd: string, args: string[], opts?: {
        cwd?: string;
    }) => Promise<ExecResult>;
    writeFile: (filePath: string, content: string) => Promise<void>;
    readFile: (filePath: string) => Promise<string>;
    mkdir: (dir: string) => Promise<void>;
    mkdtemp: (prefix: string) => Promise<string>;
}
export declare function parseArgs(argv: string[]): {
    url: string;
    identity: string;
    asIdentity?: string;
};
export declare function fetchLocalMarkdown(ctx: CommandContext, url: string): Promise<{
    workdir: string;
    markdownPath: string;
    markdown: string;
}>;
export declare function createEmptyLarkDoc(ctx: CommandContext, title: string, identity: string): Promise<{
    docId: string;
    docUrl: string;
}>;
export declare function uploadLocalImages(ctx: CommandContext, docId: string, workdir: string, refs: string[], identity: string): Promise<void>;
export declare function extractInlineImageTags(fetchMarkdown: string): string[];
export declare function fetchInlineImageTags(ctx: CommandContext, docId: string, identity: string, expected: number): Promise<string[]>;
export declare function overwriteDocWithInlineImages(ctx: CommandContext, docId: string, markdown: string, inlineTags: string[], identity: string): Promise<void>;
export declare function grantEditAccess(ctx: CommandContext, docId: string, asIdentity: string, identity: string): Promise<void>;
export declare function run(argv: string[], ctx?: CommandContext): Promise<void>;
export {};
//# sourceMappingURL=commands.d.ts.map