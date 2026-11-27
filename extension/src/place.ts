// Placement: where each of the core's markers is in the page's text.
// The core reads the converted markdown, so it says which markers there are; the page's text nodes say where they are.
// Each marker is matched, in order, to the next directive in the row's visible text with the same tag and a label that
// reads the same, with quotes folded (the page curls them) and whitespace collapsed.

import type { Block, MarkerRun, Run } from "../../core/src/index.ts";
import { replyRoots } from "./rows.ts";

/** Page parts that aren't on screen as reply text: screen-reader copies, the turn status, a code block's language name. */
const HIDDEN = ".sr-only, [data-find-omitted]";
/** Elements that start a new line of text. A directive never crosses one. */
const BLOCK = "p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, pre, div, table, tr";

/** One character of the row's visible text: the text node it's in, its offset there, and whether it's code. */
export type Pos = { node: Text; offset: number; code: boolean };

/** The row's visible text, with a break (`\n`, no position) at each block boundary and between reply containers. */
export type Scan = { text: string; map: (Pos | null)[] };

/** A directive in the scan: offsets into `text`. `open` is where `:tag[` starts; the label runs from `label` to `close`. */
export type Directive = {
	tag: string;
	open: number;
	label: number;
	/** The `]`. */
	close: number;
	/** The attribute block `{…}`, from its `{` to just after its `}`, if one follows the `]`. */
	attrs?: { start: number; end: number };
	/** Just after the directive. */
	end: number;
};

export type Placed = Directive & { marker: MarkerRun };

/** Where an element's text is skipped, and where it's code. Web search pills aren't in the reply's markdown. */
function classify(el: Element | null, stop: Element): "skip" | "code" | "text" {
	let code = false;
	for (let e = el; e && e !== stop; e = e.parentElement) {
		if (e.matches(HIDDEN)) return "skip";
		if (e.hasAttribute("data-not-prose")) {
			if (!e.querySelector("pre")) return "skip";
			code = true;
		}
		if (e.matches("code, pre")) code = true;
	}
	return code ? "code" : "text";
}

/** The visible text of a row's reply containers, with where each character lives. */
export function scan(row: Element): Scan {
	let text = "";
	const map: (Pos | null)[] = [];
	const doc = row.ownerDocument;
	for (const root of replyRoots(row)) {
		let block: Element | null = null;
		const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
		for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
			const kind = classify(n.parentElement, root);
			if (kind === "skip" || n.data === "") continue;
			const b = n.parentElement!.closest(BLOCK);
			if (b !== block || text === "") {
				text += "\n";
				map.push(null);
				block = b;
			}
			for (let i = 0; i < n.data.length; i++) {
				text += n.data[i];
				map.push({ node: n, offset: i, code: kind === "code" });
			}
		}
	}
	return { text, map };
}

const OPENING = /:([A-Za-z][\w-]*)\[/g;

/** True if the directive opening at `i` is real: not in code, and not straight after a word character (the colon rule). */
export function opensAt(s: Scan, i: number): boolean {
	return !s.map[i]!.code && !(i > 0 && /[A-Za-z0-9_]/.test(s.text[i - 1]!));
}

/** Every directive in the scan, outside code, in order. Brackets in code inside a label don't count. */
export function directives(s: Scan): Directive[] {
	const out: Directive[] = [];
	const { text, map } = s;
	OPENING.lastIndex = 0;
	for (let m: RegExpExecArray | null; (m = OPENING.exec(text));) {
		if (!opensAt(s, m.index)) continue;
		const label = OPENING.lastIndex;
		let depth = 1;
		let i = label;
		for (; i < text.length && map[i] !== null; i++) {
			if (map[i]!.code) continue;
			if (text[i] === "[") depth++;
			else if (text[i] === "]" && --depth === 0) break;
		}
		if (text[i] !== "]" || map[i] === null || i === label) continue;
		const d: Directive = { tag: m[1]!, open: m.index, label, close: i, end: i + 1 };
		if (text[i + 1] === "{" && map[i + 1] !== null) {
			let j = i + 2;
			while (j < text.length && map[j] !== null && text[j] !== "}") j++;
			if (text[j] === "}" && map[j] !== null) {
				d.attrs = { start: i + 1, end: j + 1 };
				d.end = j + 1;
			}
		}
		out.push(d);
		OPENING.lastIndex = d.end;
	}
	return out;
}

/** Quotes folded and whitespace collapsed, for comparing a label on the page with the core's. */
export function norm(s: string): string {
	return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

/** The core's markers in reply order. Markers inside a label are left out: placement draws the outer one. */
export function coreMarkers(blocks: Block[]): MarkerRun[] {
	const out: MarkerRun[] = [];
	const runs = (list: Run[]): void => {
		for (const run of list) {
			if (run.kind === "marker") out.push(run);
			else if ("runs" in run) runs(run.runs);
		}
	};
	const walk = (list: Block[]): void => {
		for (const b of list) {
			if (b.kind === "paragraph" || b.kind === "heading") runs(b.runs);
			else if (b.kind === "list") for (const item of b.items) walk(item.blocks);
			else if (b.kind === "blockquote") walk(b.children);
			else if (b.kind === "table") for (const r of b.rows) for (const cell of r) runs(cell);
		}
	};
	walk(blocks);
	return out;
}

/** Each marker matched to its directive, in order; `unplaced` holds those with no match, which aren't drawn. */
export function place(s: Scan, markers: MarkerRun[]): { placed: Placed[]; unplaced: MarkerRun[] } {
	const found = directives(s);
	const placed: Placed[] = [];
	const unplaced: MarkerRun[] = [];
	let from = 0;
	for (const marker of markers) {
		const want = norm(marker.labelText);
		const k = found.findIndex((d, i) => i >= from && d.tag === marker.tag && norm(s.text.slice(d.label, d.close)) === want);
		if (k < 0) {
			unplaced.push(marker);
			continue;
		}
		placed.push({ ...found[k]!, marker });
		from = k + 1;
	}
	return { placed, unplaced };
}
