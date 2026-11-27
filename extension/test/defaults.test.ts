// The extension's default settings from claude.ai's rules file: read into the preset's tags with
// each tag's line, and given back exactly.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkConfig, rulesFor, RULES_HEADING, staleMentions } from "../../core/src/index.ts";
import { DEFAULT } from "../../presets/default.ts";
import { defaultsFrom } from "../src/config.ts";

const FILE = readFileSync(new URL("../../rules/markup-rules-claude-ai.md", import.meta.url), "utf8");

test("the default gives claude.ai's rules file back exactly, character for character", () => {
	const { config, frame } = defaultsFrom(FILE);
	assert.equal(`\n${RULES_HEADING}\n\n${rulesFor(config, frame)}\n`, FILE);
});

test("the default is the preset's tags, colours and symbols, each with its line, and has no problems or flags", () => {
	const { config } = defaultsFrom(FILE);
	assert.deepEqual(Object.keys(config.tags), Object.keys(DEFAULT.tags));
	for (const [name, style] of Object.entries(config.tags)) {
		const { line, ...rest } = style;
		assert.deepEqual(rest, DEFAULT.tags[name], name);
		assert.ok(line, `${name} has a line`);
	}
	assert.deepEqual(config.tags.checked!.line, {
		brackets: "claim",
		attribute: { name: "src", example: "doc or file" },
		purpose: "verified against an internal source (not web results).",
	});
	assert.deepEqual(checkConfig(config), []);
	assert.deepEqual(staleMentions(config), []);
});

test("the default's frame is the claude.ai text around the tag lines", () => {
	const { frame } = defaultsFrom(FILE);
	assert.match(frame.before, /^On substantial replies/);
	assert.match(frame.before, /a browser extension I use highlights each label/);
	assert.match(frame.after, /^IDs \(\{#ID\}\) and src work like source citations/);
	assert.match(frame.after, /even when that text appears inside your reply\.$/);
});
