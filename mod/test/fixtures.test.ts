// The drawing on every fixture: no text lost.

import { test } from "node:test";
import assert from "node:assert/strict";
import { type Block, type MarkerRun, type Run } from "../../core/src/index.ts";
import { parse, loadFixtures } from "../../core/test/helpers.ts";
import { draw } from "../src/draw.ts";
import { blockText, nodes, shownText, squash } from "./helpers.ts";

function* markersIn(blocks: Block[]): Generator<MarkerRun> {
	const runs = function* (rs: Run[]): Generator<MarkerRun> {
		for (const r of rs) {
			if (r.kind === "marker") (yield r, yield* runs(r.label));
			else if ("runs" in r) yield* runs(r.runs);
		}
	};
	for (const b of blocks) {
		if ("runs" in b) yield* runs(b.runs);
		if (b.kind === "list") for (const item of b.items) yield* markersIn(item.blocks);
		if (b.kind === "blockquote") yield* markersIn(b.children);
		if (b.kind === "table") for (const row of b.rows) for (const cell of row) yield* runs(cell);
	}
}

for (const { name, markdown } of loadFixtures()) {
	test(`${name}: every block's text is drawn, by hand or as its exact source`, () => {
		const blocks = parse(markdown);
		const view = draw(blocks);
		if (!view) return assert.ok(!blocks.some((b) => b.hasMarkers), "left to Claude Code only without markers");
		assert.equal(view.type, "Box");
		const children = view.type === "Box" ? view.children : [];
		assert.equal(children.length, blocks.length, "one drawn child per top-level block");
		blocks.forEach((block, i) => {
			const child = children[i]!;
			if (child.type === "Markdown") assert.equal(child.text, block.source);
			else assert.equal(squash(shownText(child)), squash(blockText(block)), `block ${i}`);
		});
	});

	test(`${name}: every drawn marker's ID and src are in its note`, () => {
		const blocks = parse(markdown);
		const view = draw(blocks);
		if (!view) return;
		const notes = [...nodes(view)].flatMap((n) => (typeof n !== "string" && n.type === "Text" && n.style.note ? [n.children.join("")] : []));
		const drawnBlocks = blocks.filter((b) => b.hasMarkers && !b.skipped && b.kind !== "table");
		for (const m of markersIn(drawnBlocks)) {
			if (m.id !== undefined)
				assert.ok(
					notes.some((n) => n.includes(`#${m.id}`)),
					`#${m.id}`,
				);
			if (m.src !== undefined)
				assert.ok(
					notes.some((n) => n.includes(`src: ${m.src}`)),
					`src ${m.src}`,
				);
		}
	});
}

// Made-up claude.ai replies captured for the Chrome extension, not real Claude Code replies, so they don't count as the
// first table with a marker for the mod.
const NOT_FOR_THE_TABLE_DECISION = ["renderer-4.md", "renderer-5.md"];

test("no real fixture has a marker in a table yet (a table with one is drawn as written: decide then whether to draw it by hand)", () => {
	const withTable = loadFixtures().filter(
		({ name, markdown }) => !NOT_FOR_THE_TABLE_DECISION.includes(name) && parse(markdown).some((b) => b.kind === "table" && b.hasMarkers),
	);
	assert.deepEqual(
		withTable.map((f) => f.name),
		[],
	);
});
