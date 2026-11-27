// Checks the mod in .claude/skills/markup/ with Claude Code itself (`pnpm test:mod`).
// `claude plugin validate` type-checks the hooks module against the installed Claude Code's own API types, but reports
// type errors only as warnings, so this fails on any `error TS` line, then runs the mod's tests in the engine with
// `claude plugin test`. The plugin directory's own checks (licence, icon) are for publishing and are ignored.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MOD = fileURLToPath(new URL("../.claude/skills/markup", import.meta.url));

function run(args) {
	const result = spawnSync("claude", args, { encoding: "utf8" });
	if (result.error) throw result.error;
	return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const validate = run(["plugin", "validate", MOD]);
const typeErrors = validate.output.split("\n").filter((line) => /error TS\d+/.test(line));
if (validate.status !== 0 || typeErrors.length > 0) {
	process.stdout.write(validate.output);
	console.error(typeErrors.length ? `\n${typeErrors.length} type error(s) in the mod` : "\nclaude plugin validate failed");
	process.exit(1);
}
console.log("claude plugin validate: passed, no type errors");

const tests = run(["plugin", "test", MOD]);
process.stdout.write(tests.output);
process.exit(tests.status ?? 1);
