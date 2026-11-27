// The Tags section's working copy: the default read into rows and built back unchanged, a new tag's defaults, each
// field's checks, and a renamed tag's line.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkConfig, colourFor, rulesFor, tagLine } from "../../core/src/index.ts";
import { BACKGROUNDS, defaultsFrom } from "../src/config.ts";
import { configFrom, lineOf, newRow, NEW_TAG_DARK, problemCount, rowProblems, rowsFrom, type Rows } from "../src/panel-tags.ts";

const DEFAULTS = defaultsFrom(readFileSync(new URL("../../rules/markup-rules-claude-ai.md", import.meta.url), "utf8"));
const fresh = (): Rows => rowsFrom(DEFAULTS.config);
const row = (rows: Rows, name: string) => rows.tags.find((t) => t.name === name)!;

test("the default read into rows and built back is the same config, with no problems", () => {
	const rows = fresh();
	assert.deepEqual(configFrom(rows), DEFAULTS.config);
	assert.equal(problemCount(rows), 0);
	assert.deepEqual(rows.tags.map((t) => rowProblems(t, rows).flags).flat(), []);
});

test("a single colour is shown as its two shades, as the extension draws it", () => {
	const rows = rowsFrom({ tags: { a: { symbol: "*", colour: "#d65fd6", legend: "x" } }, fallback: "#d9b88c" });
	assert.equal(rows.tags[0]!.light, colourFor("#d65fd6", "light", BACKGROUNDS));
	assert.equal(rows.fallback.dark, "#d9b88c");
});

test("a new tag: a name and what it's for to fill in, … in the brackets, no attribute, its light colour derived", () => {
	const tag = newRow();
	assert.equal(tag.name, "");
	assert.equal(tag.brackets, "…");
	assert.equal(tag.light, colourFor(NEW_TAG_DARK, "light", BACKGROUNDS));
	assert.deepEqual(lineOf(tag), { brackets: "…", purpose: "" });
	const rows = fresh();
	rows.tags.push(tag);
	const p = rowProblems(tag, rows);
	assert.equal(p.name, "Give the tag a name.");
	assert.equal(p.line, "Say what the tag is for.");
	assert.equal(problemCount(rows), 1);
	tag.name = "aside";
	tag.purpose = "a side note. ";
	tag.legend = tag.purpose.trim();
	assert.equal(problemCount(rows), 0);
	const config = configFrom(rows);
	assert.deepEqual(Object.keys(config.tags).at(-1), "aside");
	assert.deepEqual(config.tags.aside, {
		symbol: "•",
		colour: { dark: tag.dark, light: tag.light },
		legend: "a side note.",
		line: { brackets: "…", purpose: "a side note." },
	});
	assert.deepEqual(checkConfig(config), []);
});

test("the name's checks: the directive name rule, reserved names, and names already used", () => {
	const rows = fresh();
	const guess = row(rows, "guess");
	const nameProblem = (name: string) => ((guess.name = name), rowProblems(guess, rows).name);
	assert.equal(nameProblem("-guess"), "A name is letters and digits, with - or _ only between them.");
	assert.equal(nameProblem("my guess"), "A name is letters and digits, with - or _ only between them.");
	assert.equal(nameProblem("unknown"), '"unknown" is kept for the extension\'s own use.');
	assert.equal(nameProblem("checked"), "There's already a tag called checked.");
	assert.equal(nameProblem("hunch"), "");
});

test("each field's checks: symbol, colour, what it's for, the brackets and the attribute", () => {
	const rows = fresh();
	const t = row(rows, "checked");
	const p = () => rowProblems(t, rows);
	t.symbol = "ab";
	assert.equal(p().symbol, "The symbol is one character.");
	t.symbol = "⌕";
	t.dark = "#f5b94";
	assert.equal(p().colour, "A colour is # and six hex digits, like #d65fd6.");
	t.dark = "#f5b942";
	t.purpose = "one.\ntwo.";
	assert.equal(p().line, "Keep what it's for to one paragraph.");
	t.purpose = "verified.";
	t.brackets = "a]b";
	assert.equal(p().line, "What goes in the brackets can't hold ].");
	t.brackets = "claim";
	t.attrName = "";
	assert.equal(p().line, "Give the attribute a name, or clear its example.");
	t.attrName = "src file";
	assert.equal(p().line, "An attribute's name is letters and digits, with - or _ only between them.");
	t.attrName = "src";
	t.attrExample = 'a "file"';
	assert.equal(p().line, "An attribute's example can't hold a double quote.");
	t.attrExample = "";
	assert.equal(p().line, "");
	assert.deepEqual(lineOf(t), { brackets: "claim", attribute: { name: "src", example: "" }, purpose: "verified." });
	t.attrExample = "doc or file";
	assert.equal(problemCount(rows), 0);
	rows.fallback.light = "sand";
	assert.equal(problemCount(rows), 1);
});

test("a rename changes the tag's own line and flags other lines that mention the old name, never fixing them", () => {
	const rows = fresh();
	row(rows, "guess").name = "hunch";
	assert.match(tagLine("hunch", lineOf(row(rows, "hunch"))), /^:hunch\[…\] you filled a gap/);
	assert.deepEqual(rowProblems(row(rows, "decided"), rows).flags, ["It names :guess, which isn't in your tags."]);
	assert.equal(problemCount(rows), 0, "a flag doesn't keep the config from being saved");
	const config = configFrom(rows);
	assert.deepEqual(
		Object.keys(config.tags),
		["open-ask", "open-default", "hunch", "decided", "changed", "checked"],
		"the renamed tag keeps its place",
	);
	assert.match(rulesFor(config, DEFAULTS.frame), /:decided\[…\].*:guess/);
	rows.tags = rows.tags.filter((t) => t.name !== "open-ask");
	assert.deepEqual(rowProblems(row(rows, "changed"), rows).flags, ["It names :open-ask, which isn't in your tags."]);
});
