// The project's two rules files, one per surface, kept in sync: they may differ only as listed below. A deliberate
// difference, such as wording tuned for claude.ai, goes on the list in the same change, so a difference between the surfaces is always a decision,
// never drift.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readRules, rulesInFile } from "../src/index.ts";

const read = (file: string) => readFileSync(new URL(`../../rules/${file}`, import.meta.url), "utf8");
const CLAUDE_CODE = read("markup-rules.md");
const CLAUDE_AI = read("markup-rules-claude-ai.md");

/** The expected differences: claude.ai's wording, and Claude Code's in its place. */
const EXPECTED: { why: string; claudeAi: string; claudeCode: string }[] = [
	{
		why: "each surface's text names its own renderer",
		claudeAi: "a browser extension I use highlights each label",
		claudeCode: "a mod I use highlights each label",
	},
];

test("the two surfaces' rules files differ only as listed", () => {
	let claudeAi = CLAUDE_AI;
	for (const { why, claudeAi: from, claudeCode: to } of EXPECTED) {
		assert.equal(claudeAi.split(from).length, 2, `claude.ai's file has "${from}" once (${why})`);
		assert.equal(CLAUDE_CODE.split(to).length, 2, `Claude Code's file has "${to}" once (${why})`);
		claudeAi = claudeAi.replace(from, to);
	}
	assert.equal(claudeAi, CLAUDE_CODE);
});

test("both rules files read into a frame and the same tags", () => {
	const [ai, code] = [CLAUDE_AI, CLAUDE_CODE].map((f) => readRules(rulesInFile(f)));
	assert.deepEqual(
		ai!.tags.map((t) => t.name),
		code!.tags.map((t) => t.name),
	);
});
