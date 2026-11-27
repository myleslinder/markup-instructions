// Prints a fixture's render snapshot in colour in the terminal, close to what the mod draws (`pnpm preview <fixture>...`),
// so a snapshot can be reviewed without reading its JSON.
//
// It reads mod/test/snapshots/<fixture>.json and takes the colours, symbols and note shade the way the mod does: from
// the preset (presets/default.ts) through palette() and colourOf() in the mod's own style.ts, so it can't drift from
// the mod. A block handed to Claude Code's Markdown is shown as its source, dimmed, behind a dotted bar. Layout follows
// the tree's boxes: rows with fixed-width bullet columns, column gaps as blank lines, text wrapped at word boundaries.
//
// Options: --width <columns> (default: the terminal's width, or 100 when not a terminal).

import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { DEFAULT } from "../presets/default.ts";
import { colourOf, palette, symbolOf } from "../.claude/skills/markup/hooks/style.ts";

const SNAPSHOTS = new URL("../mod/test/snapshots/", import.meta.url);
const PALETTE = palette(DEFAULT);

/** Claude Code's colours for what isn't a tag, read from a reply. */
const NAMED = { permission: "#b1b9f9", text: "#ffffff", dim: "#999999" };
/** The terminal's bright blue, which Claude Code uses for links. */
const LINK = "ansi94";
/** The bar before a block handed to Claude Code's Markdown. */
const HANDED = "┆ ";

// --- Text width -----------------------------------------------------------------------------------------------------

function charWidth(cp) {
	if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
	if (
		(cp >= 0x1100 && cp <= 0x115f) ||
		(cp >= 0x2e80 && cp <= 0xa4cf) ||
		(cp >= 0xac00 && cp <= 0xd7a3) ||
		(cp >= 0xf900 && cp <= 0xfaff) ||
		(cp >= 0xfe30 && cp <= 0xfe4f) ||
		(cp >= 0xff00 && cp <= 0xff60) ||
		(cp >= 0xffe0 && cp <= 0xffe6) ||
		(cp >= 0x1f300 && cp <= 0x1faff)
	)
		return 2;
	return 1;
}

const width = (text) => [...text].reduce((w, ch) => w + charWidth(ch.codePointAt(0)), 0);

// --- Styled pieces --------------------------------------------------------------------------------------------------

/** A style as the terminal shows it: colour (`#rrggbb` or `ansiNN`), attributes, a link target. */
function sgr(style) {
	const codes = [];
	if (style.bold) codes.push(1);
	if (style.dim) codes.push(2);
	if (style.italic) codes.push(3);
	if (style.underline) codes.push(4);
	if (style.strikethrough) codes.push(9);
	const colour = style.colour && (NAMED[style.colour] ?? style.colour);
	if (colour?.startsWith("#"))
		codes.push(38, 2, parseInt(colour.slice(1, 3), 16), parseInt(colour.slice(3, 5), 16), parseInt(colour.slice(5, 7), 16));
	else if (colour?.startsWith("ansi")) codes.push(Number(colour.slice(4)));
	return codes.length ? `\x1b[${codes.join(";")}m` : "";
}

function paint(text, style) {
	const open = sgr(style);
	const body = open ? `${open}${text}\x1b[0m` : text;
	return style.href ? `\x1b]8;;${style.href}\x1b\\${body}\x1b]8;;\x1b\\` : body;
}

/** A drawn Text node's own style over the one it sits in, as Ink nests them. */
function nest(inherited, style) {
	const colour = colourOf(style, PALETTE);
	return {
		...inherited,
		...(colour ? { colour } : {}),
		...(style.bold ? { bold: true } : {}),
		...(style.italic ? { italic: true } : {}),
		...(style.underline ? { underline: true } : {}),
		...(style.strikethrough ? { strikethrough: true } : {}),
		...(style.dim ? { dim: true } : {}),
	};
}

/** Inline nodes to a flat list of styled pieces. */
function pieces(nodes, style, out = []) {
	for (const node of nodes) {
		if (typeof node === "string") out.push({ text: node, style });
		else if (node.type === "Symbol") out.push({ text: symbolOf(node.tag, PALETTE), style });
		else if (node.type === "Link") pieces(node.children, { ...style, colour: LINK, href: node.href }, out);
		else pieces(node.children, nest(style, node.style), out);
	}
	return out;
}

// --- Wrapping -------------------------------------------------------------------------------------------------------

/** A drawn line: its text with escapes, and how many columns it takes. */
const line = (s = "", w = 0) => ({ s, w });

/**
 * Styled pieces wrapped to `columns`: at spaces where it can, mid-word where a word is wider than the line. Spaces where
 * a line wraps are dropped; spaces at the start of the text or after a line break are kept.
 */
function wrap(list, columns) {
	const tokens = [];
	for (const { text, style } of list)
		for (const part of text.split(/(\n|[ \t]+)/)) {
			if (part === "") continue;
			const kind = part === "\n" ? "break" : /^[ \t]+$/.test(part) ? "space" : "word";
			const last = tokens.at(-1);
			if (kind === "word" && last?.kind === "word") last.parts.push({ text: part, style });
			else tokens.push({ kind, parts: [{ text: part, style }] });
		}

	const lines = [];
	let cur = [];
	let curW = 0;
	let pending = [];
	let fresh = true; // at the start of the text or after a break, where spaces are kept
	const flush = () => {
		// Neighbouring pieces in the same style are painted as one.
		const runs = [];
		for (const p of cur)
			if (runs.length && runs.at(-1).style === p.style) runs.at(-1).text += p.text;
			else runs.push({ ...p });
		lines.push(line(runs.map((p) => paint(p.text, p.style)).join(""), curW));
		cur = [];
		curW = 0;
		pending = [];
	};
	const put = (parts) => {
		for (const p of parts) {
			cur.push(p);
			curW += width(p.text);
		}
	};
	for (const token of tokens) {
		if (token.kind === "break") {
			flush();
			fresh = true;
		} else if (token.kind === "space") {
			if (fresh) put(token.parts);
			else if (curW > 0) pending = token.parts;
		} else {
			const w = token.parts.reduce((n, p) => n + width(p.text), 0);
			const gap = pending.reduce((n, p) => n + width(p.text), 0);
			if (curW > 0 && curW + gap + w > columns) flush();
			else put(pending);
			pending = [];
			fresh = false;
			if (w <= columns - curW) put(token.parts);
			else
				for (const p of token.parts)
					for (const ch of p.text) {
						if (curW + width(ch) > columns && curW > 0) flush();
						put([{ text: ch, style: p.style }]);
					}
		}
	}
	if (cur.length || lines.length === 0) flush();
	return lines;
}

// --- Layout ---------------------------------------------------------------------------------------------------------

const pad = (l, columns) => l.s + " ".repeat(Math.max(0, columns - l.w));

/** A drawn tree's node as lines, `columns` wide at most. */
function render(node, columns, style = {}) {
	switch (node.type) {
		case "Markdown":
			// Claude Code draws this block itself; shown as its source, so the review sees where the mod hands over.
			return node.text
				.split("\n")
				.flatMap((source) => wrap([{ text: source, style: { colour: "dim" } }], columns - width(HANDED)))
				.map((l) => line(paint(HANDED, { colour: "dim" }) + l.s, width(HANDED) + l.w));
		case "Text":
			return wrap(pieces(node.children, nest(style, node.style)), columns);
		case "Box":
			return box(node, columns, style);
	}
	throw new Error(`unknown node type ${JSON.stringify(node.type)}`);
}

function box(node, columns, style) {
	const { flexDirection = "row", gap = 0, width: fixed } = node.layout;
	const inner = fixed ?? columns;
	if (flexDirection === "column") {
		const out = [];
		node.children.forEach((child, i) => {
			if (i > 0) for (let g = 0; g < gap; g++) out.push(line());
			out.push(...render(child, inner, style));
		});
		return out;
	}
	// A row: children with a width take it, the rest share what's left.
	const taken = node.children.reduce((n, c) => n + (c.type === "Box" && c.layout.width ? c.layout.width : 0), 0) + gap * (node.children.length - 1);
	const flexible = node.children.filter((c) => !(c.type === "Box" && c.layout.width)).length;
	const share = flexible ? Math.max(1, Math.floor((inner - taken) / flexible)) : 0;
	const widths = node.children.map((c) => (c.type === "Box" && c.layout.width ? c.layout.width : share));
	const columnsOf = node.children.map((c, i) => render(c, widths[i], style));
	const height = Math.max(0, ...columnsOf.map((c) => c.length));
	const out = [];
	for (let r = 0; r < height; r++) {
		let s = "";
		let w = 0;
		columnsOf.forEach((col, i) => {
			const last = i === columnsOf.length - 1;
			const l = col[r] ?? line();
			s += last ? l.s : pad(l, widths[i]) + " ".repeat(gap);
			w += last ? l.w : widths[i] + gap;
		});
		out.push(line(s, w));
	}
	return out;
}

/** The whole reply, as the hook draws it: the `⏺` on the first line, then two columns of indent. */
function reply(view, columns) {
	return render(view, columns - 2).map((l, i) => (i === 0 ? paint("⏺", { colour: "text" }) : " ") + " " + l.s);
}

// --- Command --------------------------------------------------------------------------------------------------------

function counts(view) {
	const top = view.type === "Box" && view.layout.gap === 1 ? view.children : [view];
	const handed = top.filter((c) => c.type === "Markdown").length;
	// A marker is the one span in its tag's tone that isn't a note (draw.ts, drawMarker); "code" is inline code's tone.
	let markers = 0;
	const walk = (n) => {
		if (typeof n !== "object") return;
		if (n.type === "Text" && n.style.tone && n.style.tone !== "code" && !n.style.note) markers++;
		n.children?.forEach(walk);
	};
	walk(view);
	return { blocks: top.length, handed, markers };
}

const args = process.argv.slice(2);
let columns = process.stdout.columns || 100;
const names = [];
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--width") columns = Number(args[++i]);
	else if (args[i].startsWith("--width=")) columns = Number(args[i].slice(8));
	else names.push(args[i]);
}
if (!names.length || !(columns >= 20)) {
	console.error("usage: pnpm preview [--width <columns>] <fixture>...   (a fixture's name, e.g. test-1, or its path)");
	process.exit(2);
}
if (PALETTE.problems.length) console.error(`The config has problems, so the mod draws nothing:\n- ${PALETTE.problems.join("\n- ")}\n`);

let failed = false;
names.forEach((arg, i) => {
	const name = basename(arg).replace(/\.(md|json)$/, "");
	const file = new URL(`${name}.json`, SNAPSHOTS);
	if (i > 0) console.log();
	if (!existsSync(file)) {
		console.error(`${name}: no render snapshot (mod/test/snapshots/${name}.json)`);
		failed = true;
		return;
	}
	const view = JSON.parse(readFileSync(file, "utf8"));
	console.log(paint(name, { bold: true }) + paint(`  fixtures/${name}.md`, { colour: "dim" }));
	if (view === null) {
		console.log(paint("Nothing drawn: no block has a marker, so the whole reply goes to Claude Code.", { colour: "dim" }));
		return;
	}
	const c = counts(view);
	console.log(
		paint(
			`${c.blocks} top-level blocks: ${c.blocks - c.handed} drawn by the mod, ${c.handed} handed to Claude Code (${HANDED.trim()} source shown dimmed); ${c.markers} markers`,
			{ colour: "dim" },
		),
	);
	console.log();
	for (const l of reply(view, columns)) console.log(l);
});
process.exit(failed ? 1 : 0);
