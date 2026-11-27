// Invariants that must hold on every fixture.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Nodes, Root } from "mdast";
import { type Block, type Run } from "../src/index.ts";
import { parse, allRuns, as, codeRanges, inCode, markers, loadFixtures, unplaced } from "./helpers.ts";
import { parseTree } from "../src/parse.ts";

const fixtures = loadFixtures();

test("there are fixtures to test", () => {
	assert.ok(fixtures.length > 20);
});

// A tripwire, not an invariant: the colon rule makes a marker in underscore emphasis prose, which
// was chosen only because no reply had used it (docs/how-it-works.md, "The colon rule"). A new fixture that does
// fails here, so the choice gets revisited rather than missed. Syntax shown in code doesn't count.
test("no fixture has a directive inside underscore emphasis", () => {
	const pattern = /(?<![\p{L}\p{N}])_{1,2}:[A-Za-z][\w-]*\[/gu;
	const found = fixtures
		.filter(({ markdown }) => {
			const code = codeRanges(parseTree(markdown));
			return [...markdown.matchAll(pattern)].some((match) => !inCode(code, match.index));
		})
		.map((f) => f.name);
	assert.deepEqual(found, [], "a real reply put a marker in underscore emphasis: revisit the colon rule");
});

for (const { name, markdown } of fixtures) {
	const blocks = parse(markdown);
	const tree = parseTree(markdown);

	test(`${name}: blocks' source and gaps reproduce the input`, () => {
		assert.equal(blocks.map((b) => b.source + b.gap).join(""), markdown);
		for (const block of blocks) assert.match(block.gap, /^\s*$/, `gap after a ${block.kind} block holds more than whitespace`);
	});

	test(`${name}: each marker's and bare tag's offsets give back its source`, () => {
		for (const run of allRuns(blocks)) {
			if (run.kind === "marker") assert.equal(markdown.slice(run.start, run.end), run.source);
			if (run.kind === "bare") assert.equal(markdown.slice(run.start, run.end), run.text);
		}
	});

	test(`${name}: every node in the tree has source offsets`, () => {
		assert.deepEqual(unplaced(tree), []);
	});

	test(`${name}: a finished reply isn't incomplete`, () => {
		assert.ok(blocks.every((b) => b.incomplete === undefined));
	});

	test(`${name}: every block's visible text matches remark's`, () => {
		checkBlocks(blocks, tree.children, markdown);
	});

	test(`${name}: no marker or bare tag comes from inside code`, () => {
		const ranges = codeRanges(tree);
		for (const run of allRuns(blocks)) {
			if (run.kind !== "marker" && run.kind !== "bare") continue;
			// A label can hold code, so the test is where the directive starts.
			const inside = ranges.find(([start, end]) => run.start >= start && run.start < end);
			assert.equal(inside, undefined, `${run.kind} at ${run.start} starts inside code at ${inside}`);
		}
	});

	test(`${name}: hasMarkers is true exactly on blocks with a marker inside`, () => {
		const check = (block: Block) => {
			assert.equal(block.hasMarkers, markers([block]).length > 0, `${block.kind} block: ${block.source.slice(0, 40)}`);
			for (const child of childrenOf(block)) check(child);
		};
		blocks.forEach(check);
	});
}

/** The blocks directly inside a list or blockquote. */
function childrenOf(block: Block): Block[] {
	if (block.kind === "list") return block.items.flatMap((item) => item.blocks);
	if (block.kind === "blockquote") return block.children;
	return [];
}

const KIND: Partial<Record<Nodes["type"], Block["kind"]>> = {
	paragraph: "paragraph",
	heading: "heading",
	list: "list",
	blockquote: "blockquote",
	table: "table",
	code: "code",
	thematicBreak: "thematicBreak",
	html: "html",
};

/**
 * Walk blocks alongside remark's nodes: each block has the kind and (below the top level) the exact source of
 * its node, each container's children reproduce its content, and everything with runs has remark's text.
 */
function checkBlocks(blocks: Block[], nodes: Nodes[], markdown: string, nested = false) {
	assert.equal(blocks.length, nodes.length);
	const slice = (from: Nodes, to: Nodes = from) => markdown.slice(from.position!.start.offset, to.position!.end.offset);
	const joined = (children: Block[]) => children.map((b) => b.source + b.gap).join("");
	blocks.forEach((block, i) => {
		const node = nodes[i]!;
		assert.equal(block.kind, KIND[node.type] ?? "other", `${node.type} node`);
		// At the top level the first block's source also holds leading blank lines; the round-trip test covers it.
		if (nested) assert.equal(block.source, slice(node));
		switch (node.type) {
			case "paragraph":
			case "heading":
				assert.equal(visible(as(block, node.type).runs), expected(node, markdown));
				break;
			case "list": {
				const { items } = as(block, "list");
				assert.equal(items.length, node.children.length);
				items.forEach((item, j) => {
					const { children } = node.children[j]!;
					if (children.length > 0) assert.equal(joined(item.blocks), slice(children[0]!, node.children[j]!));
					checkBlocks(item.blocks, children, markdown, true);
				});
				break;
			}
			case "blockquote": {
				const { children } = as(block, "blockquote");
				if (node.children.length > 0) assert.equal(joined(children), slice(node.children[0]!, node));
				checkBlocks(children, node.children, markdown, true);
				break;
			}
			case "table": {
				const { rows } = as(block, "table");
				node.children.forEach((row, r) => row.children.forEach((cell, c) => assert.equal(visible(rows[r]![c]!), expected(cell, markdown))));
				break;
			}
			case "code":
				assert.equal(as(block, "code").value, node.value);
				break;
		}
	});
}

/** Flatten runs to text, counting each marker as its label plus ID and src. Independent of the core's plainText. */
function visible(runs: Run[]): string {
	return runs
		.map((run) => {
			switch (run.kind) {
				case "text":
				case "code":
				case "bare":
					return run.text;
				case "break":
					return "";
				case "marker":
					return visible(run.label) + (run.id ?? "") + (run.src ?? "");
				default:
					return visible(run.runs);
			}
		})
		.join("");
}

/** Node types the parser turns into runs (or, for cells and directives, holds runs); any other inline node stays its source. */
const MODELLED = new Set<Nodes["type"]>([
	"paragraph",
	"heading",
	"tableCell",
	"text",
	"inlineCode",
	"emphasis",
	"strong",
	"delete",
	"link",
	"break",
	"textDirective",
]);

/** remark's plain text (as mdast-util-to-string), except unmodelled nodes (images, references, inline HTML), which count as their source, and directives: a labelled one counts as label plus ID and src, any other (or one straight after a word character) as its source. */
function expected(node: Nodes, markdown: string): string {
	if (node.type === "textDirective") {
		const source = markdown.slice(node.position!.start.offset, node.position!.end.offset);
		if (/[\p{L}\p{N}_]/u.test(markdown.charAt(node.position!.start.offset! - 1))) return source;
		if (source.charAt(1 + node.name.length) !== "[") return source;
		return node.children.map((c) => expected(c, markdown)).join("") + (node.attributes?.id ?? "") + (node.attributes?.src ?? "");
	}
	if (!MODELLED.has(node.type)) return markdown.slice(node.position!.start.offset, node.position!.end.offset);
	if ("value" in node) return node.value;
	if ("children" in node) return node.children.map((c) => expected(c, markdown)).join("");
	return "";
}
