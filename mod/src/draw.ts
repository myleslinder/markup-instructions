// The mod's drawing: the core's blocks to a plain tree of elements, close to how Claude Code draws a reply.
//
// Pure, with no colours or symbols: a marker's style is named by its tag (a "tone") and its symbol by a Symbol node, so
// the hook fills them in from its config, and changing the config changes no snapshot. Only top-level blocks with
// markers are drawn by hand; every other block is a Markdown node holding its exact source, for Claude Code's own drawing.

import type { Block, ListItem, MarkerRun, Run } from "../../core/src/types.ts";
import type { BoxLayout, Inline, TextStyle, Tone, View } from "../../.claude/skills/markup/hooks/view.ts";

/**
 * Draws a reply block, or returns null when no block holds a marker, so Claude Code draws it as usual. The result is a
 * column with one child per top-level block, a blank line between them.
 */
export function draw(blocks: Block[]): View | null {
	if (!blocks.some((b) => b.hasMarkers)) return null;
	return box({ flexDirection: "column", gap: 1 }, blocks.map(drawTop));
}

/**
 * A top-level block: by hand only when it holds a closed marker. A block still being written (`incomplete`) is drawn by
 * hand too: the core keeps its unfinished directive as plain text, so each marker is styled as soon as it closes.
 */
export function drawTop(block: Block): View {
	if (!block.hasMarkers || block.skipped || block.kind === "table") return { type: "Markdown", text: block.source };
	return drawBlock(block, {});
}

function drawBlock(block: Block, inherited: TextStyle): View {
	switch (block.kind) {
		case "paragraph":
			return text(inherited, drawRuns(block.runs, false));
		case "heading":
			return text({ ...inherited, bold: true, ...(block.depth === 1 ? { italic: true, underline: true } : {}) }, drawRuns(block.runs, false));
		case "list":
			return box(
				{ flexDirection: "column", ...(block.spread ? { gap: 1 } : {}) },
				block.items.map((item, i) => drawItem(item, block.ordered ? `${(block.start ?? 1) + i}. ` : "- ", block.spread, inherited)),
			);
		case "blockquote":
			return box({ flexDirection: "row" }, [
				box({ width: 2, flexShrink: 0 }, [text({ dim: true, added: true }, ["▎"])]),
				column(
					block.children.map((child) => drawBlock(child, { ...inherited, italic: true })),
					1,
				),
			]);
		case "code":
			// Claude Code's own drawing, from a fence rebuilt from the block: its colours differ from the Code element's (a
			// block with no language is all in the inline-code colour, where Code draws it plain).
			return { type: "Markdown", text: fence(block.value, block.lang) };
		default:
			// Thematic breaks, HTML, tables and anything else inside a hand-drawn block: their source as written.
			return text(inherited, [block.source]);
	}
}

/**
 * A fenced code block holding `value` exactly: backticks, or tildes when the language holds a backtick, one longer than
 * the longest run of that character in the value, and at least three.
 */
export function fence(value: string, lang?: string): string {
	const mark = lang?.includes("`") ? "~" : "`";
	const longest = Math.max(0, ...(value.match(mark === "`" ? /`+/g : /~+/g) ?? []).map((run) => run.length));
	const marks = mark.repeat(Math.max(3, longest + 1));
	return `${marks}${lang ?? ""}\n${value}\n${marks}`;
}

function drawItem(item: ListItem, bullet: string, spread: boolean, inherited: TextStyle): View {
	const prefix = bullet + (item.checked === undefined ? "" : item.checked ? "[x] " : "[ ] ");
	return box({ flexDirection: "row" }, [
		box({ width: prefix.length, flexShrink: 0 }, [text({ added: true }, [prefix])]),
		column(
			item.blocks.map((b) => drawBlock(b, inherited)),
			spread ? 1 : 0,
		),
	]);
}

/** Runs to inline children. Inside a label, inline code takes the label's colour, so the whole claim reads as one. */
function drawRuns(runs: Run[], inLabel: boolean): Inline[] {
	return runs.map((run) => drawRun(run, inLabel));
}

function drawRun(run: Run, inLabel: boolean): Inline {
	switch (run.kind) {
		case "text":
		case "bare":
			return run.text;
		case "code":
			return inLabel ? run.text : span({ tone: "code" }, [run.text]);
		case "emphasis":
			return span({ italic: true }, drawRuns(run.runs, inLabel));
		case "strong":
			return span({ bold: true }, drawRuns(run.runs, inLabel));
		case "delete":
			return span({ strikethrough: true }, drawRuns(run.runs, inLabel));
		case "link":
			return { type: "Link", href: run.url, children: drawRuns(run.runs, inLabel) };
		case "break":
			return "\n";
		case "marker":
			return drawMarker(run);
	}
}

/** A known tag: its symbol, a space, the label, then any note, all in the tag's tone. An unknown tag: `[name] ` first. */
function drawMarker(marker: MarkerRun): Inline {
	const tone: Tone = marker.known ? marker.tag : "unknown";
	const lead: Inline[] =
		tone === "unknown" ? [span({ added: true }, [`[${marker.tag}] `])] : [span({ bold: true }, [{ type: "Symbol", tag: tone }]), " "];
	const notes = [marker.id === undefined ? "" : `#${marker.id}`, marker.src === undefined ? "" : `src: ${marker.src}`].filter(Boolean);
	const note: Inline[] = notes.length ? [span({ tone, note: true, added: true }, [" " + notes.join(" · ")])] : [];
	return span({ tone }, [...lead, ...drawRuns(marker.label, true), ...note]);
}

function text(style: TextStyle, children: Inline[]): View {
	return { type: "Text", style, children };
}

function span(style: TextStyle, children: Inline[]): Inline {
	return { type: "Text", style, children };
}

function box(layout: BoxLayout, children: View[]): View {
	return { type: "Box", layout, children };
}

function column(children: View[], gap: number): View {
	return box({ flexDirection: "column", flexShrink: 1, flexGrow: 1, ...(gap ? { gap } : {}) }, children);
}
