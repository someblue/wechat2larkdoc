import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
export function createNodeCommandContext() {
    return {
        exec(cmd, args, opts) {
            return new Promise((resolve) => {
                execFile(cmd, args, {
                    cwd: opts?.cwd ?? process.cwd(),
                    maxBuffer: 50 * 1024 * 1024,
                    shell: false,
                    timeout: 120_000,
                }, (error, stdout, stderr) => {
                    resolve({
                        stdout: typeof stdout === 'string' ? stdout : String(stdout ?? ''),
                        stderr: typeof stderr === 'string' ? stderr : String(stderr ?? ''),
                        exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
                    });
                });
            });
        },
        async writeFile(filePath, content) {
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, content, 'utf-8');
        },
        async readFile(filePath) {
            return fs.readFile(filePath, "utf-8");
        },
        async mkdir(dir) {
            await fs.mkdir(dir, { recursive: true });
        },
        async mkdtemp(prefix) {
            return fs.mkdtemp(path.join(os.tmpdir(), prefix + randomUUID()));
        },
    };
}
//# sourceMappingURL=node-context.js.map