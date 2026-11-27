// Drawing: the syntax is cut out of the
// page's own text nodes and the symbol written in, by rewriting their `nodeValue`; no node is added, moved or removed.
// Colours come from the CSS Custom Highlight API, over ranges this module works out and the content script registers.
// `drawRow` keeps each row's edits so it can tell when the page undid them, draw again, and fall back to highlights
// only (syntax dimmed, nothing edited) if that happens too often.

import { parse, type Block } from "../../core/src/index.ts";
import { convertRowCached } from "./convert.ts";
import { KNOWN_TAGS, labelName, lead, noteName, PALETTE, SYNTAX_NAME, type Palette } from "./palette.ts";
import { coreMarkers, place, scan, type Placed, type Scan } from "./place.ts";
import { misses, type Miss } from "./selfcheck.ts";

/** A highlight's range by name (palette.ts): one for a tag's symbol and label, one for its ID or `src` note, and the dimmed syntax. */
export type Mark = { name: string; range: Range };

/** One end of a range: a text node and an offset in its text (as drawn, for edits; as written, for the fallback). */
type End = { node: Text; offset: number };

export type Layout = {
	/** Each text node's new text. Only nodes whose text changes. */
	texts: Map<Text, string>;
	marks: { name: string; start: End; end: End }[];
};

/** The new text of each affected node, and the highlight ranges in it. Pure: nothing on the page changes. */
export function layout(s: Scan, placed: Placed[], pal: Palette = PALETTE): Layout {
	const replace = new Map<number, string>();
	for (const p of placed) {
		for (let i = p.open; i < p.label - 1; i++) replace.set(i, "");
		replace.set(p.label - 1, lead(p.marker, pal));
		replace.set(p.close, "");
		if (p.attrs) {
			replace.set(p.attrs.start, " ");
			replace.set(p.attrs.end - 1, "");
		}
	}
	const built = new Map<Text, string>();
	/** Where each character's output starts in its node's new text. */
	const at: number[] = [];
	for (let i = 0; i < s.map.length; i++) {
		const pos = s.map[i];
		if (!pos) continue;
		const sofar = built.get(pos.node) ?? "";
		at[i] = sofar.length;
		built.set(pos.node, sofar + (replace.get(i) ?? pos.node.data[pos.offset]));
	}
	const texts = new Map<Text, string>();
	for (const [node, text] of built) if (text !== node.data) texts.set(node, text);

	const end = (i: number, after = 0): End => ({ node: s.map[i]!.node, offset: at[i]! + after });
	const marks: Layout["marks"] = [];
	for (const p of placed) {
		const label = labelName(p.marker, pal);
		const symbol = lead(p.marker, pal).length - 1;
		marks.push({ name: label, start: end(p.label - 1), end: end(p.label - 1, symbol) });
		marks.push({ name: label, start: end(p.label), end: end(p.close - 1, 1) });
		if (p.attrs && p.attrs.end - p.attrs.start > 2) {
			marks.push({ name: noteName(p.marker, pal), start: end(p.attrs.start + 1), end: end(p.attrs.end - 2, 1) });
		}
	}
	return { texts, marks };
}

/** The guard's fallback: ranges over the text as written, with the syntax dimmed. Nothing is edited. */
export function highlightsOnly(s: Scan, placed: Placed[], pal: Palette = PALETTE): Layout["marks"] {
	const end = (i: number, after = 0): End => ({ node: s.map[i]!.node, offset: s.map[i]!.offset + after });
	const span = (name: string, from: number, to: number) => ({ name, start: end(from), end: end(to - 1, 1) });
	const marks: Layout["marks"] = [];
	for (const p of placed) {
		const label = labelName(p.marker, pal);
		marks.push(span(SYNTAX_NAME, p.open, p.label), span(label, p.label, p.close), span(SYNTAX_NAME, p.close, p.close + 1));
		if (p.attrs) {
			marks.push(span(SYNTAX_NAME, p.attrs.start, p.attrs.start + 1), span(SYNTAX_NAME, p.attrs.end - 1, p.attrs.end));
			if (p.attrs.end - p.attrs.start > 2) marks.push(span(noteName(p.marker, pal), p.attrs.start + 1, p.attrs.end - 1));
		}
	}
	return marks;
}

function toRanges(marks: Layout["marks"]): Mark[] {
	return marks.map(({ name, start, end }) => {
		const range = start.node.ownerDocument.createRange();
		range.setStart(start.node, start.offset);
		range.setEnd(end.node, end.offset);
		return { name, range };
	});
}

/** The guard: more than this many redraws of one row within the window, and the row falls back to highlights only. */
export const GUARD = { redraws: 5, windowMs: 10_000 };

export type RowState = {
	/** Each node edited, with the page's text and ours. */
	edits: Map<Text, { page: string; ours: string }>;
	marks: Mark[];
	/** The row's text as the page drew it, when last drawn. */
	text: string | null;
	redraws: number;
	redrawTimes: number[];
	fallback: boolean;
};

export type Outcome =
	/** Drawn for the first time, or the row holds a new version of the reply (a regenerate reuses the row). */
	| "drawn"
	/** Already drawn and still as drawn: nothing done. */
	| "unchanged"
	/** The page undid the edits on the same text, and the row was drawn again. Counts towards the guard. */
	| "redrawn"
	/** The page undid the edits too often: the row is now highlights only. */
	| "tripped"
	/** Highlights only, drawn again. */
	| "fallback"
	/** Over the core's limits: left as the page drew it. */
	| "skipped";

export type Report = {
	outcome: Outcome;
	/** Markers placed and drawn. */
	markers: number;
	/** Markers the core found that couldn't be placed, by tag; nothing is drawn for them. */
	unplaced: string[];
	misses: Miss[];
	/** The core's reading of the reply, when it was parsed this pass: for the stats log's per-tag counts and rule slips. */
	blocks: Block[];
};

export function newState(): RowState {
	return { edits: new Map(), marks: [], text: null, redraws: 0, redrawTimes: [], fallback: false };
}

function intact(st: RowState): boolean {
	for (const [node, { ours }] of st.edits) if (!node.isConnected || node.data !== ours) return false;
	return true;
}

/** Puts the page's text back in nodes still holding ours. Nodes the page rewrote are left as the page wrote them. */
function restore(st: RowState): void {
	for (const [node, { page, ours }] of st.edits) if (node.isConnected && node.data === ours) node.data = page;
	st.edits.clear();
	st.marks = [];
}

/** Draws a finished row, or checks it's still drawn. `st` is the row's state from its last pass, kept by the caller. */
export function drawRow(row: Element, st: RowState, now = Date.now()): Report {
	let blocks: Block[] = [];
	const report = (outcome: Outcome, placed: Placed[] = [], unplaced: string[] = [], missed: Miss[] = []): Report => ({
		outcome,
		markers: placed.length,
		unplaced,
		misses: missed,
		blocks,
	});

	let undone = false;
	let tripped = false;
	if (st.fallback) {
		const live = st.marks.every((m) => m.range.startContainer.isConnected && m.range.endContainer.isConnected);
		if (live && row.textContent === st.text) return report("unchanged");
	} else if (st.edits.size > 0) {
		if (intact(st)) return report("unchanged");
		restore(st);
		// Only the same text drawn again is the page undoing the edits. New text is a new version of the reply.
		if (row.textContent === st.text) {
			undone = true;
			st.redraws++;
			st.redrawTimes = st.redrawTimes.filter((t) => now - t < GUARD.windowMs);
			st.redrawTimes.push(now);
			if (st.redrawTimes.length > GUARD.redraws) st.fallback = tripped = true;
		}
	} else if (st.text !== null && row.textContent === st.text) {
		return report("unchanged");
	}

	const text = row.textContent ?? "";
	st.text = text;
	st.marks = [];
	blocks = parse(convertRowCached(row, text), { tags: KNOWN_TAGS });
	if (blocks[0]?.skipped) return report("skipped");
	const s = scan(row);
	const { placed, unplaced } = place(s, coreMarkers(blocks));
	const missed = misses(s, placed);
	const lost = unplaced.map((m) => m.tag);

	if (st.fallback) {
		st.marks = toRanges(highlightsOnly(s, placed));
		return report(tripped ? "tripped" : "fallback", placed, lost, missed);
	}
	const { texts, marks } = layout(s, placed);
	// The ranges' offsets are into the new text, so they're set once it's written.
	for (const [node, ours] of texts) {
		st.edits.set(node, { page: node.data, ours });
		node.data = ours;
	}
	st.marks = toRanges(marks);
	return report(undone ? "redrawn" : "drawn", placed, lost, missed);
}
