// The drawing, case by case. Each fixture's whole drawing is pinned by the render snapshots; these name the rules.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../../core/test/helpers.ts";
import { draw, fence } from "../src/draw.ts";
import type { Inline, View } from "../../.claude/skills/markup/hooks/view.ts";
import { nodes, shownText } from "./helpers.ts";

/** The drawn column's children, one per top-level block. */
function blocks(markdown: string): View[] {
	const view = draw(parse(markdown));
	assert.ok(view && view.type === "Box", "drawn by hand");
	return view.children;
}

const all = (markdown: string) => [...nodes(draw(parse(markdown))!)];
const texts = (markdown: string) => all(markdown).filter((n): n is Extract<Inline, { type: "Text" }> => typeof n !== "string" && n.type === "Text");
/** The innermost Text showing exactly `shown` (symbols as `<tag>`). */
const find = (markdown: string, shown: string) =>
	texts(markdown)
		.filter((t) => t.children.map(flat).join("") === shown)
		.at(-1);
const flat = (n: Inline): string => (typeof n === "string" ? n : n.type === "Symbol" ? `<${n.tag}>` : n.children.map(flat).join(""));

test("a reply block with no marker is left to Claude Code", () => {
	assert.equal(draw(parse("Plain **text** and `code`.\n\n- a list")), null);
	assert.equal(draw(parse("")), null);
});

test("blocks without a closed marker, past the limits, or tables with a marker go to Markdown with their source", () => {
	const [marked, plain, writing] = blocks("A :open[x].\n\nPlain para.\n\nStill :guess[writ");
	assert.equal(marked!.type, "Text");
	assert.deepEqual(plain, { type: "Markdown", text: "Plain para." });
	assert.deepEqual(writing, { type: "Markdown", text: "Still :guess[writ" });
	const table = "| a | b |\n|---|---|\n| :open[x] | y |";
	assert.deepEqual(blocks(`A :open[x].\n\n${table}`)[1], { type: "Markdown", text: table });
});

test("a known marker: symbol in bold, a space, the label, all in the tag's tone; the syntax is gone", () => {
	const marker = find("We :decided[ship it] now.", "<decided> ship it");
	assert.deepEqual(marker?.style, { tone: "decided" });
	assert.deepEqual(marker?.children[0], { type: "Text", style: { bold: true }, children: [{ type: "Symbol", tag: "decided" }] });
	assert.ok(!JSON.stringify(blocks("We :decided[ship it] now.")).includes(":decided"));
});

test("an ID and src make one shaded note after the label, ID first", () => {
	const marker = find(':checked[it loads]{#C2 src="plan.md"}', "<checked> it loads #C2 · src: plan.md");
	assert.deepEqual(marker?.children.at(-1), { type: "Text", style: { tone: "checked", note: true, added: true }, children: [" #C2 · src: plan.md"] });
});

test("an unknown tag: its name in brackets, then the label, in the unknown tone", () => {
	const marker = find("A :flag[second look].", "[flag] second look");
	assert.equal(marker?.style.tone, "unknown");
	assert.deepEqual(marker?.children[0], { type: "Text", style: { added: true }, children: ["[flag] "] });
});

test("a family's kind is a known tag, drawn in its own tone with its own symbol node", () => {
	for (const tag of ["open-ask", "open-default"] as const) {
		const marker = find(`A :${tag}[x].`, `<${tag}> x`);
		assert.deepEqual(marker?.style, { tone: tag }, tag);
	}
	assert.equal(find("A :guess-maybe[x].", "[guess-maybe] x")?.style.tone, "unknown", "any other kind name is unknown");
	assert.equal(find("A :guess-judged[x].", "[guess-judged] x")?.style.tone, "unknown", "a kind dropped from the rules is unknown");
	assert.equal(find("An :open[x].", "[open] x")?.style.tone, "unknown", "bare open, which the kinds replaced, is unknown");
});

test("a bare tag stays plain text", () => {
	assert.ok(shownText(blocks("So it gets :guess. And :open[x].")[0]!).startsWith("So it gets :guess. And "));
	assert.ok(texts("So it gets :guess. And :open-ask[x].").every((t) => t.style.tone !== "guess"));
});

test("a block still being written is drawn by hand: closed markers styled, the unfinished one plain text", () => {
	const list = "- one :guess[a]\n- two :open-ask[b]{#Q1}\n- three :decided[c";
	const [drawnList] = blocks(list);
	assert.equal(drawnList!.type, "Box");
	assert.ok(find(list, "<guess> a"));
	assert.ok(find(list, "<open-ask> b #Q1"));
	assert.ok(shownText(drawnList!).endsWith("three :decided[c"));
	assert.ok(texts(list).every((t) => t.style.tone !== "decided"));

	const para = "Done :checked[x] and then :open-ask[still writ";
	const [drawnPara] = blocks(para);
	assert.equal(drawnPara!.type, "Text");
	assert.ok(find(para, "<checked> x"));
	assert.ok(shownText(drawnPara!).endsWith("x and then :open-ask[still writ"));
});

test("inline code takes Claude Code's code tone, except inside a label, where it takes the tag's", () => {
	assert.ok(find("Use `pnpm` and :open-ask[run `pnpm build`].", "pnpm")?.style.tone === "code");
	const label = find("Use `pnpm` and :open-ask[run `pnpm build`].", "<open-ask> run pnpm build");
	assert.ok(label?.children.includes("pnpm build"));
});

test("emphasis, strong, strikethrough, links and breaks inside a marked paragraph", () => {
	const [para] = blocks("*it* **bo** ~~st~~ [ln](https://x.io) a  \nb :open-ask[x]");
	const kids = (para as Extract<View, { type: "Text" }>).children;
	assert.deepEqual(kids.slice(0, 8), [
		{ type: "Text", style: { italic: true }, children: ["it"] },
		" ",
		{ type: "Text", style: { bold: true }, children: ["bo"] },
		" ",
		{ type: "Text", style: { strikethrough: true }, children: ["st"] },
		" ",
		{ type: "Link", href: "https://x.io", children: ["ln"] },
		" a",
	]);
	assert.ok(kids.includes("\n"));
});

test("headings: level 1 bold, italic and underlined, deeper levels bold", () => {
	assert.deepEqual((blocks("# T :open-ask[x]")[0] as { style: object }).style, { bold: true, italic: true, underline: true });
	assert.deepEqual((blocks("### T :open-ask[x]")[0] as { style: object }).style, { bold: true });
});

test("lists: a dash or number per item, task boxes, nested items drawn by hand, blank rows only when loose", () => {
	const shown = (md: string) =>
		texts(md)
			.filter((t) => t.style.added)
			.map((t) => t.children.join(""));
	assert.deepEqual(shown("- a :open-ask[x]\n- b\n  - c"), ["- ", "- ", "- "]);
	assert.deepEqual(shown("3. a :open-ask[x]\n4. b"), ["3. ", "4. "]);
	assert.deepEqual(shown("- [ ] a :open-ask[x]\n- [x] b"), ["- [ ] ", "- [x] "]);
	const [tight] = blocks("- a :open-ask[x]\n- b");
	const [loose] = blocks("- a :open-ask[x]\n\n- b");
	assert.equal((tight as { layout: { gap?: number } }).layout.gap, undefined);
	assert.equal((loose as { layout: { gap?: number } }).layout.gap, 1);
});

test("inside a hand-drawn list, a code block goes to Markdown as a fence and other blocks are their source", () => {
	const md = "- a :open[x]\n\n  ```js\n  const y = 1;\n  ```\n\n  ---";
	const nested = all(md).filter((n) => typeof n !== "string" && n.type === "Markdown");
	assert.deepEqual(nested, [{ type: "Markdown", text: "```js\nconst y = 1;\n```" }]);
	assert.ok(texts(md).some((t) => t.children[0] === "---"));
});

test("a code block's fence gives back its value and language, whatever backticks or tildes it holds", () => {
	const cases: [string, string | undefined][] = [
		["! echo hello", undefined],
		["const y = 1;", "js"],
		["a ``` inside\n````\nmore", "md"],
		["~~~ tildes\n```", "a`b"],
		["", undefined],
		["  indented\n\n\ttab", "sh"],
	];
	for (const [value, lang] of cases) {
		const [block] = parse(fence(value, lang));
		assert.equal(block?.kind, "code", JSON.stringify(value));
		assert.deepEqual([(block as { value: string }).value, (block as { lang?: string }).lang ?? undefined], [value, lang]);
	}
});

test("a blockquote: a dim bar, then its blocks in italic", () => {
	const quote = all("> a :open[x]");
	assert.ok(quote.some((n) => typeof n !== "string" && n.type === "Text" && n.style.dim && n.children[0] === "▎"));
	assert.ok(texts("> a :open[x]").some((t) => t.style.italic && t.children[0] === "a "));
});
