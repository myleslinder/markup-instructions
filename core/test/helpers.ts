// Shared test helpers.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import type { Nodes, Root } from "mdast";
import { parse as parseWith, type Block, type MarkerRun, type Run } from "../src/index.ts";
import { DEFAULT_TAGS } from "../../presets/default.ts";

/** Parse with the preset's tags, as the surfaces do with it. Tests of other tag lists call the core's `parse()`. */
export function parse(markdown: string): Block[] {
	return parseWith(markdown, { tags: DEFAULT_TAGS });
}

/** Every fixture's markdown (`fixtures/*.md` except the README), with their file names. */
export function loadFixtures(): { name: string; markdown: string }[] {
	const dir = new URL("../../fixtures/", import.meta.url);
	return readdirSync(dir)
		.filter((name) => name.endsWith(".md") && name !== "README.md")
		.map((name) => ({ name, markdown: readFileSync(new URL(name, dir), "utf8") }));
}

/** The block, checked to be of the given kind and narrowed to it. */
export function as<K extends Block["kind"]>(block: Block | undefined, kind: K): Extract<Block, { kind: K }> {
	assert.ok(block, "no block");
	assert.equal(block.kind, kind);
	return block as Extract<Block, { kind: K }>;
}

/** Every list of runs in the blocks, nested blocks included, in reply order. */
export function* runLists(blocks: Block[]): Generator<Run[]> {
	for (const block of blocks) {
		switch (block.kind) {
			case "paragraph":
			case "heading":
				yield block.runs;
				break;
			case "list":
				for (const item of block.items) yield* runLists(item.blocks);
				break;
			case "blockquote":
				yield* runLists(block.children);
				break;
			case "table":
				for (const row of block.rows) yield* row;
				break;
		}
	}
}

/** Every run in the blocks, including those inside formatting and labels, in reply order. */
export function* allRuns(blocks: Block[]): Generator<Run> {
	function* walk(runs: Run[]): Generator<Run> {
		for (const run of runs) {
			yield run;
			if (run.kind === "marker") yield* walk(run.label);
			else if ("runs" in run) yield* walk(run.runs);
		}
	}
	for (const runs of runLists(blocks)) yield* walk(runs);
}

export function markers(blocks: Block[]): MarkerRun[] {
	return [...allRuns(blocks)].filter((run) => run.kind === "marker");
}

/** Start and end offsets of every code span and code block, as `[start, end)`. */
export function codeRanges(tree: Root): [number, number][] {
	const ranges: [number, number][] = [];
	const walk = (node: Nodes): void => {
		if ((node.type === "inlineCode" || node.type === "code") && node.position) {
			ranges.push([node.position.start.offset!, node.position.end.offset!]);
		}
		if ("children" in node) for (const child of node.children) walk(child);
	};
	walk(tree);
	return ranges;
}

export function inCode(ranges: [number, number][], offset: number): boolean {
	return ranges.some(([start, end]) => offset >= start && offset < end);
}

/** The types of nodes in the tree that have no source offsets, which the core can't place. */
export function unplaced(tree: Root): string[] {
	const found: string[] = [];
	const walk = (node: Nodes): void => {
		if (node.position?.start.offset === undefined || node.position.end.offset === undefined) found.push(node.type);
		if ("children" in node) for (const child of node.children) walk(child);
	};
	walk(tree);
	return found;
}
