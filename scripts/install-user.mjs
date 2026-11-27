// Installs the markup at user level, so it reaches every Claude Code session on this machine:
// - the rules text from rules/markup-rules.md, as the "## Response markup" section of ~/.claude/CLAUDE.md,
//   replacing that section if it's there and leaving the rest of the file as it is;
// - the mod (.claude/skills/markup/: .claude-plugin/plugin.json, hooks/ and the state contract in types/) into
//   ~/.claude/skills/markup/, replacing it.
// Copies rather than links, so switching branches here doesn't change the rules or the mod elsewhere.
// Installs only from a clean `main`, so a draft doesn't go out by mistake; `--force` skips that check.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const rulesFile = join(root, "rules/markup-rules.md");
const modDir = join(root, ".claude/skills/markup");
const userClaudeMd = join(homedir(), ".claude/CLAUDE.md");
const userModDir = join(homedir(), ".claude/skills/markup");
const heading = "## Response markup";

if (!process.argv.includes("--force")) {
	const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
	const branch = git("rev-parse", "--abbrev-ref", "HEAD");
	const dirty = git("status", "--porcelain", "--", rulesFile, modDir);
	if (branch !== "main" || dirty) {
		console.error(
			`Not installing: ${branch !== "main" ? `on branch ${branch}, not main` : "uncommitted changes to the rules or the mod"}.` +
				" Run with --force to install anyway.",
		);
		process.exit(1);
	}
}

// The rules text: replace the section from its heading to the next "## " heading (or the end of the file).
const rules = readFileSync(rulesFile, "utf8").trim();
if (!rules.startsWith(heading)) throw new Error(`${rulesFile} doesn't start with "${heading}"`);
const current = existsSync(userClaudeMd) ? readFileSync(userClaudeMd, "utf8") : "";
const start = current.indexOf(heading);
let next;
if (start === -1) {
	next = current.trim() ? `${current.trimEnd()}\n\n${rules}\n` : `${rules}\n`;
} else {
	const after = current.indexOf("\n## ", start + heading.length);
	const before = current.slice(0, start).trim() ? current.slice(0, start) : "";
	const rest = after === -1 ? "" : current.slice(after + 1);
	next = `${before}${rules}\n${rest ? `\n${rest}` : ""}`;
}
mkdirSync(join(homedir(), ".claude"), { recursive: true });
writeFileSync(userClaudeMd, next);

// The mod: the manifest, the hooks and its state contract, as they load. Its tests and the engine's API types stay in the repo.
rmSync(userModDir, { recursive: true, force: true });
cpSync(join(modDir, ".claude-plugin/plugin.json"), join(userModDir, ".claude-plugin/plugin.json"));
cpSync(join(modDir, "hooks"), join(userModDir, "hooks"), { recursive: true });
cpSync(join(modDir, "types"), join(userModDir, "types"), { recursive: true });

const { version } = JSON.parse(readFileSync(join(modDir, ".claude-plugin/plugin.json"), "utf8"));
console.log(`Installed the rules text in ${userClaudeMd}`);
console.log(`Installed the mod ${version} in ${userModDir}`);
console.log("New Claude Code sessions pick them up; sessions already open don't.");
