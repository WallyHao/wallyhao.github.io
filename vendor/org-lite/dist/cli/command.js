import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyze, parseUtf8 } from "../index.js";
const usage = "Usage: org-lite <parse|analyze> <file>\norg-lite v0.1 document parser and reference analyzer.\n";
/** Node-only adapter; intentionally absent from the public library export graph. */
export async function runCommand(args, output) {
    if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
        output.stdout(usage);
        return 0;
    }
    if (args.length !== 2 || (args[0] !== "parse" && args[0] !== "analyze") || !args[1]) {
        output.stderr(usage);
        return 2;
    }
    try {
        const path = resolve(args[1]);
        const parsed = parseUtf8(path, await readFile(path), path);
        if (!parsed.ok) {
            output.stderr(`${JSON.stringify(parsed.error)}\n`);
            return 1;
        }
        const result = args[0] === "analyze" ? analyze(parsed.value) : parsed;
        if (!result.ok) {
            output.stderr(`${JSON.stringify(result.error)}\n`);
            return 1;
        }
        const json = JSON.stringify(result.value, null, 2);
        output.stdout(`${json}\n`);
        return 0;
    }
    catch (error) {
        output.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
    }
}
//# sourceMappingURL=command.js.map