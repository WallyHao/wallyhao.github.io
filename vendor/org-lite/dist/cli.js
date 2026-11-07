#!/usr/bin/env node
import { runCommand } from "./cli/command.js";
runCommand(process.argv.slice(2), {
    stdout: text => { process.stdout.write(text); },
    stderr: text => { process.stderr.write(text); },
}).then(status => { process.exitCode = status; }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map