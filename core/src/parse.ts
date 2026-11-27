import { unified, type Processor } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import type { Nodes, PhrasingContent, Root, RootContent } from "mdast";
import type { TextDirective } from "mdast-util-directive";
import type { Block, BlockBase, ParseOptions, Run } from "./types.ts";

/**
 * Turn off the tree transforms that mdast extensions run after tokenizing. remark-gfm's autolink transform finds
 * bare URLs and emails the tokenizer left as text, such as one after an unclosed `[`, and adds them as nodes
 * without source positions, which the core can't place. The tokenizer still finds every other bare URL, `www.`
 * address and email. Only autolinks have a transform today; a test checks that every node keeps its position.
 */
function withoutTransforms(this: Processor) {
	for (const extension of (this.data("fromMarkdownExtensions") ?? []).flat()) delete extension.transforms;
}

const processor = unified().use(remarkParse).use(remarkGfm).use(withoutTransforms).use(remarkDirective);
const plainProcessor = unified().use(remarkParse).use(remarkGfm).use(withoutTransforms);

// Stand-ins for brackets inside code spans: one UTF-16 unit each, so every offset stays the same.
const SHIELD: Record<string, string> = { "[": "\uE000", "]": "\uE001" };
const UNSHIELD: Record<string, string> = { "\uE000": "[", "\uE001": "]" };

/**
 * Parse markdown into mdast with GFM and directives, as the core sees it.
 *
 * remark-directive counts brackets in a label without regard to code spans, so `:guess[a `]` b]` would end
 * the label inside the code. Brackets inside code spans are swapped for stand-ins before parsing and swapped
 * back in the tree, so a label's end is found the way CommonMark finds a link's.
 */
export function parseTree(markdown: string): Root {
	if (!needsShield(markdown)) return processor.parse(markdown);
	const tree = processor.parse(shieldCode(markdown));
	unshield(tree);
	return tree;
}

/** A directive's name and its label's `[`, by the name rule in config.ts: any name, not only ASCII ones. */
const DIRECTIVE_OPEN = /:[^\s\p{P}\p{S}](?:[^\s\p{P}\p{S}]|[-_])*\[/u;

function needsShield(markdown: string): boolean {
	return markdown.includes("`") && DIRECTIVE_OPEN.test(markdown) && !/[\uE000\uE001]/.test(markdown);
}

/** The input with brackets inside code spans swapped for stand-ins. Code spans are found without directives. */
function shieldCode(markdown: string): string {
	const chars = markdown.split("");
	const visit = (node: Nodes) => {
		if (node.type === "inlineCode") {
			for (let i = startOf(node); i < endOf(node); i++) chars[i] = SHIELD[chars[i]!] ?? chars[i]!;
		} else if ("children" in node) node.children.forEach(visit);
	};
	visit(plainProcessor.parse(markdown));
	return chars.join("");
}

function unshield(node: Nodes): void {
	const restore = (text: string) => text.replace(/[\uE000\uE001]/g, (c) => UNSHIELD[c]!);
	if ("value" in node && typeof node.value === "string") node.value = restore(node.value);
	if (node.type === "link" || node.type === "image" || node.type === "definition") node.url = restore(node.url);
	if (node.type === "textDirective" || node.type === "leafDirective" || node.type === "containerDirective") {
		for (const [key, value] of Object.entries(node.attributes ?? {})) if (value != null) node.attributes![key] = restore(value);
	}
	if ("children" in node) node.children.forEach(unshield);
}

/** What run conversion needs besides the nodes: the input, where an unfinished directive starts, and the known tags. */
type Context = { markdown: string; cut: number; known: ReadonlySet<string> };

/** Split a markdown string into top-level blocks, with runs for paragraphs, headings and table cells. */
export function parse(markdown: string, options: ParseOptions): Block[] {
	const skipped = overLimit(markdown);
	if (skipped) return [{ kind: "other", source: markdown, gap: "", hasMarkers: false, skipped }];
	const tree = parseTree(markdown);
	const nodes = tree.children;
	// Whitespace-only input has no nodes; keep it as the gap of an empty block so nothing is lost.
	if (nodes.length === 0) return markdown === "" ? [] : [{ kind: "other", source: "", gap: markdown, hasMarkers: false }];
	const known = new Set(options.tags);
	const cut = unfinishedAt(tree, markdown, known);
	const blocks = toBlocks(nodes, { markdown, cut: cut ?? Infinity, known }, 0, markdown.length);
	if (cut !== undefined) blocks[nodes.findLastIndex((node) => startOf(node) <= cut)]!.incomplete = true;
	return blocks;
}

/**
 * Where the input ends inside a directive that could still become a marker, if it does: the directive's start.
 * That is a directive in the last leaf block whose label `[` or attribute `{` is still open, or a known tag with
 * nothing after it (its `[` may be next). The first such directive counts, since any later one sits in its label.
 */
function unfinishedAt(tree: Root, markdown: string, knownTags: ReadonlySet<string>): number | undefined {
	let found: number | undefined;
	const visit = (node: Nodes, leafEnd: number) => {
		if (found !== undefined) return;
		if (node.type === "paragraph" || node.type === "heading" || node.type === "tableCell") {
			// Only the leaf whose content has nothing but whitespace or `>` prefixes after it can still grow.
			// Its content ends at its last child, not at the node: a table cell includes its closing pipe.
			const last = node.children.at(-1);
			if (!last || !/^[\s>]*$/.test(markdown.slice(endOf(last)))) return;
			leafEnd = endOf(last);
		}
		if (node.type === "textDirective" && leafEnd >= 0 && !afterWordChar(node, markdown)) {
			const end = endOf(node);
			const next = markdown.charAt(end);
			const labelled = hasLabel(node, markdown);
			const known = knownTags.has(node.name);
			if (
				(!labelled && next === "[") ||
				(next === "{" && !markdown.slice(end, leafEnd).includes("}")) ||
				(!labelled && known && end === markdown.length)
			) {
				found = startOf(node);
				return;
			}
		}
		if ("children" in node) for (const child of node.children) visit(child, leafEnd);
	};
	visit(tree, -1);
	return found;
}

/**
 * Inputs past these limits aren't parsed: remark crashes on a blockquote nested a few thousand deep and slows
 * sharply on deeply nested lists, and a renderer has to stay responsive. Real replies are far inside them.
 */
export const LIMITS = {
	/** Characters in one input. */
	chars: 100_000,
	/** Columns of a line's leading container prefix (indentation, `>`, list markers), outside fenced code. */
	prefix: 100,
};

const PREFIX = /^(?:[ \t]|>|[*+-][ \t]|\d{1,9}[.)][ \t])*/;
const FENCE = /^[ \t>*+\-\d.)]*?(`{3,}|~{3,})/;

/** Which limit the input is over, if any. A cheap scan, so it runs before remark does. */
function overLimit(markdown: string): Block["skipped"] {
	if (markdown.length > LIMITS.chars) return "size";
	let fence = "";
	for (const line of markdown.split("\n")) {
		const marker = FENCE.exec(line)?.[1];
		if (fence) {
			if (marker?.[0] === fence[0] && marker.length >= fence.length) fence = "";
			continue;
		}
		if (marker) {
			fence = marker;
			continue;
		}
		const prefix = PREFIX.exec(line)![0];
		if (prefix.replaceAll("\t", "    ").length > LIMITS.prefix) return "depth";
	}
	return undefined;
}

/** Blocks for sibling nodes. The first block's source starts at `from`; the last block's gap ends at `to`. */
function toBlocks(nodes: RootContent[], ctx: Context, from: number, to: number): Block[] {
	const { markdown } = ctx;
	return nodes.map((node, i) => {
		const start = i === 0 ? from : startOf(node);
		const end = endOf(node);
		const next = i + 1 < nodes.length ? startOf(nodes[i + 1]!) : to;
		return toBlock(node, ctx, { source: markdown.slice(start, end), gap: markdown.slice(end, next), hasMarkers: false });
	});
}

function toBlock(node: RootContent, ctx: Context, base: BlockBase): Block {
	switch (node.type) {
		case "paragraph": {
			const runs = toRuns(node.children, ctx);
			return { ...base, kind: "paragraph", runs, hasMarkers: containsMarker(runs) };
		}
		case "heading": {
			const runs = toRuns(node.children, ctx);
			return { ...base, kind: "heading", depth: node.depth, runs, hasMarkers: containsMarker(runs) };
		}
		case "list": {
			const items = node.children.map((item) => {
				const blocks = childBlocks(item.children, ctx, endOf(item));
				return { ...(item.checked != null && { checked: item.checked }), blocks };
			});
			return {
				...base,
				kind: "list",
				ordered: node.ordered ?? false,
				...(node.ordered && { start: node.start ?? 1 }),
				spread: node.spread ?? false,
				items,
				hasMarkers: items.some((item) => item.blocks.some((b) => b.hasMarkers)),
			};
		}
		case "blockquote": {
			const children = childBlocks(node.children, ctx, endOf(node));
			return { ...base, kind: "blockquote", children, hasMarkers: children.some((b) => b.hasMarkers) };
		}
		case "table": {
			const rows = node.children.map((row) => row.children.map((cell) => toRuns(cell.children, ctx)));
			return { ...base, kind: "table", align: node.align ?? [], rows, hasMarkers: rows.some((row) => row.some(containsMarker)) };
		}
		case "code":
			return { ...base, kind: "code", ...(node.lang != null && { lang: node.lang }), value: node.value };
		case "thematicBreak":
		case "html":
			return { ...base, kind: node.type };
		default:
			return { ...base, kind: "other" };
	}
}

function childBlocks(nodes: RootContent[], ctx: Context, parentEnd: number): Block[] {
	if (nodes.length === 0) return [];
	return toBlocks(nodes, ctx, startOf(nodes[0]!), parentEnd);
}

function startOf(node: Nodes): number {
	const offset = node.position?.start.offset;
	if (offset === undefined) throw new Error(`${node.type} node has no start offset`);
	return offset;
}

function endOf(node: Nodes): number {
	const offset = node.position?.end.offset;
	if (offset === undefined) throw new Error(`${node.type} node has no end offset`);
	return offset;
}

function sourceOf(node: Nodes, markdown: string): string {
	return markdown.slice(startOf(node), endOf(node));
}

function toRuns(nodes: PhrasingContent[], ctx: Context): Run[] {
	const runs: Run[] = [];
	for (const node of nodes) {
		const run = toRun(node, ctx);
		if (Array.isArray(run)) runs.push(...run);
		else runs.push(run);
	}
	return mergeText(runs);
}

function toRun(node: PhrasingContent, ctx: Context): Run | Run[] {
	switch (node.type) {
		case "text":
			return { kind: "text", text: node.value };
		case "inlineCode":
			return { kind: "code", text: node.value };
		case "emphasis":
		case "strong":
		case "delete":
			return { kind: node.type, runs: toRuns(node.children, ctx) };
		case "link":
			return { kind: "link", url: node.url, runs: toRuns(node.children, ctx) };
		case "break":
			return { kind: "break" };
		case "textDirective":
			return directiveRun(node, ctx);
		default:
			// Anything not modelled yet (images, references, inline HTML, footnotes) stays as its exact source.
			return { kind: "text", text: sourceOf(node, ctx.markdown) };
	}
}

/** A letter, digit or underscore straight before the colon makes a directive prose (docs/how-it-works.md, "The colon rule"). */
const WORD_CHAR = /[\p{L}\p{N}_]/u;

function afterWordChar(node: TextDirective, markdown: string): boolean {
	return WORD_CHAR.test(markdown.charAt(startOf(node) - 1));
}

/** remark gives `:open[]` and `:open` the same empty children, so read the source for the bracket. */
function hasLabel(node: TextDirective, markdown: string): boolean {
	const at = startOf(node) + 1 + node.name.length;
	return at < endOf(node) && markdown.charAt(at) === "[";
}

function directiveRun(node: TextDirective, ctx: Context): Run {
	const { markdown } = ctx;
	const source = sourceOf(node, markdown);
	const start = startOf(node);
	const end = endOf(node);
	// Prose, or an unfinished directive at the end of a streaming input (and anything inside its open label).
	if (start >= ctx.cut || afterWordChar(node, markdown)) return { kind: "text", text: source };
	const known = ctx.known.has(node.name);
	if (!hasLabel(node, markdown)) return known ? { kind: "bare", tag: node.name, text: source, start, end } : { kind: "text", text: source };

	const { src, ...rest } = node.attributes ?? {};
	let { id } = node.attributes ?? {};
	delete rest.id;
	// remark reads `{#4.2}` as ID "4" plus class "2". IDs are opaque, so take the whole token from the source.
	const rawId = id != null ? [...source.slice(source.lastIndexOf("{")).matchAll(/#([^\s}]+)/g)].at(-1)?.[1] : undefined;
	if (id != null && rawId?.startsWith(id + ".")) {
		const parts = new Set(rawId.slice(id.length + 1).split("."));
		const classes = (rest.class ?? "").split(" ").filter((c) => c !== "" && !parts.has(c));
		if (classes.length > 0) rest.class = classes.join(" ");
		else delete rest.class;
		id = rawId;
	}
	const attrs: Record<string, string> = {};
	for (const [key, value] of Object.entries(rest)) if (value != null) attrs[key] = value;
	const label = toRuns(node.children, ctx);
	return {
		kind: "marker",
		tag: node.name,
		known,
		label,
		// One line, for summaries: soft and hard breaks become single spaces.
		labelText: plainText(label).replace(/[ \t]*\r?\n[ \t]*/g, " "),
		...(id != null && { id }),
		...(src != null && { src }),
		attrs,
		source,
		start,
		end,
	};
}

/** Join neighbouring text runs, which appear when a directive turns back into text. */
function mergeText(runs: Run[]): Run[] {
	const out: Run[] = [];
	for (const run of runs) {
		const last = out.at(-1);
		if (run.kind === "text" && last?.kind === "text") out[out.length - 1] = { kind: "text", text: last.text + run.text };
		else out.push(run);
	}
	return out;
}

/** The text a reader sees, without markdown or directive syntax. Markers give their label only. */
export function plainText(runs: Run[]): string {
	return runs.map(runText).join("");
}

function runText(run: Run): string {
	switch (run.kind) {
		case "text":
		case "code":
		case "bare":
			return run.text;
		case "break":
			return "\n";
		case "marker":
			return plainText(run.label);
		default:
			return plainText(run.runs);
	}
}

function containsMarker(runs: Run[]): boolean {
	return runs.some((run) => {
		if (run.kind === "marker") return true;
		if ("runs" in run) return containsMarker(run.runs);
		return false;
	});
}
