// The extension's palette from a config: a custom config's
// tags drawn with their own symbol and colours and the rest through the fallback; highlight names no tag can clash with;
// and colours derived for the other theme reading on claude.ai's own backgrounds.

import assert from "node:assert/strict";
import { test } from "node:test";
import { colourFor, contrast, CONTRAST_FLOOR, parse, type Config } from "../../core/src/index.ts";
import { DEFAULT } from "../../presets/default.ts";
import { BACKGROUNDS, CONFIG } from "../src/config.ts";
import { convertRow } from "../src/convert.ts";
import { layout } from "../src/draw.ts";
import { JSDOM } from "jsdom";
import { addHighlightStyles, highlightCss, KNOWN_TAGS, lead, palette, PALETTE, usePalette, type Palette } from "../src/palette.ts";
import { coreMarkers, place, scan } from "../src/place.ts";
import { finishedRows } from "../src/rows.ts";
import { page, row } from "./helpers.ts";

const style = (symbol: string, colour: Config["fallback"]) => ({ symbol, colour, legend: "a line" });

/** Each highlight's colour in a theme, by name, from the stylesheet. */
function colours(css: string, theme: "light" | "dark"): Map<string, string> {
	const out = new Map<string, string>();
	const prefix = theme === "dark" ? '\\[data-mode="dark"\\] ' : "";
	for (const m of css.matchAll(new RegExp(`^${prefix}::highlight\\(([^)]+)\\) \\{ color: ([^;]+); \\}$`, "gm"))) out.set(m[1]!, m[2]!);
	return out;
}

/** A reply drawn with a palette: each highlight's name and text, and the drawn text. */
function drawWith(reply: string, pal: Palette) {
	const rowEl = finishedRows(page(row(reply)))[0]!;
	const s = scan(rowEl);
	const { placed } = place(s, coreMarkers(parse(convertRow(rowEl), { tags: Object.keys(pal.tags) })));
	const { texts, marks } = layout(s, placed, pal);
	return {
		marks: marks.map((m) => [
			m.name,
			m.start.node.data === m.end.node.data ? (texts.get(m.start.node) ?? m.start.node.data).slice(m.start.offset, m.end.offset) : "?",
		]),
		text: [...texts.values()].join(""),
	};
}

test("the extension draws the preset, which passes the check", () => {
	assert.equal(CONFIG, DEFAULT);
	assert.deepEqual(PALETTE.problems, []);
});

test("the preset's colours are drawn as picked, in both themes", () => {
	for (const theme of ["light", "dark"] as const) {
		const css = colours(highlightCss(), theme);
		for (const [tag, s] of Object.entries(DEFAULT.tags)) {
			const picked = (s.colour as { light: string; dark: string })[theme];
			assert.equal(css.get(`mk-t-${tag}`), picked, `${tag}, ${theme}`);
			assert.equal(css.get(`mk-n-${tag}`), `${picked}a0`, `${tag}'s note, ${theme}`);
		}
		assert.equal(css.get("mk-fallback"), (DEFAULT.fallback as { light: string; dark: string })[theme]);
	}
});

test("a custom config: a tag only it has gets its symbol and colours, and a tag it leaves out goes through the fallback", () => {
	const pal = palette({ tags: { todo: style("☐", { dark: "#66ccff", light: "#005a8c" }) }, fallback: { dark: "#cccccc", light: "#555555" } });
	assert.deepEqual(pal.problems, []);
	for (const theme of ["light", "dark"] as const) {
		const css = colours(highlightCss(pal), theme);
		assert.equal(css.get("mk-t-todo"), theme === "light" ? "#005a8c" : "#66ccff");
		assert.equal(css.get("mk-fallback"), theme === "light" ? "#555555" : "#cccccc");
		assert.equal(css.has("mk-t-open"), false, "no rule for one of the preset's tags the config leaves out");
	}
	const { marks, text } = drawWith("<p>Next: :todo[write it]{#T1} and :open-ask[which one?].</p>", pal);
	assert.deepEqual(marks, [
		["mk-t-todo", "☐"],
		["mk-t-todo", "write it"],
		["mk-n-todo", "#T1"],
		["mk-fallback", "[open-ask]"],
		["mk-fallback", "which one?"],
	]);
	assert.match(text, /☐ write it #T1 and \[open-ask\] which one\?/);
});

test("highlight names can't clash: a config with open and open-note draws each in its own colour", () => {
	const pal = palette({
		tags: { open: style("¿", { dark: "#e07ce0", light: "#a937a9" }), "open-note": style("※", { dark: "#66ccff", light: "#005a8c" }) },
		fallback: { dark: "#cccccc", light: "#555555" },
	});
	const css = colours(highlightCss(pal), "light");
	assert.equal(css.get("mk-t-open-note"), "#005a8c");
	assert.equal(css.get("mk-n-open"), "#a937a9a0");
	const { marks } = drawWith("<p>:open[one]{#Q1} and :open-note[two]</p>", pal);
	assert.deepEqual(marks, [
		["mk-t-open", "¿"],
		["mk-t-open", "one"],
		["mk-n-open", "#Q1"],
		["mk-t-open-note", "※"],
		["mk-t-open-note", "two"],
	]);
	// Nor with the extension's own names: a tag called `syntax` or `fallback` gets a name of its own.
	const own = palette({ tags: { syntax: style("§", "#66ccff"), fallback: style("†", "#66ccff") }, fallback: "#cccccc" });
	const names = [...colours(highlightCss(own), "light").keys()];
	assert.equal(new Set(names).size, names.length, `every rule has its own name: ${names.join(", ")}`);
});

test("a single colour is derived for the other theme against claude.ai's own backgrounds, and reaches the contrast floor", () => {
	const from = Object.entries(DEFAULT.tags).flatMap(([tag, s]) => {
		const c = s.colour as { light: string; dark: string };
		return [
			[tag, c.dark, "light"],
			[tag, c.light, "dark"],
		] as const;
	});
	for (const [tag, colour, theme] of from) {
		const pal = palette({ tags: { [tag]: style("•", colour) }, fallback: colour });
		const out = pal.tags[tag]![theme];
		assert.equal(out, colourFor(colour, theme, BACKGROUNDS));
		// A mid-tone colour can be taken as written for the other theme too, and then isn't held to the floor:
		// `open-default`'s light #b35ab3 is drawn as written on claude.ai's dark page. Whether it should be is an open
		// question, so only derived colours are checked here.
		if (out === colour) continue;
		const ratio = contrast(out, BACKGROUNDS[theme]);
		assert.ok(ratio >= CONTRAST_FLOOR, `${tag} ${colour} → ${out} on claude.ai ${theme}: contrast ${ratio.toFixed(2)}`);
	}
});

test("an unknown tag's lead is its name; a known one's is its symbol", () => {
	assert.equal(lead({ tag: "checked", known: true }), "⌕ ");
	assert.equal(lead({ tag: "parked", known: false }), "[parked] ");
	assert.equal(lead({ tag: "checked", known: false }), "[checked] ", "known only when the parser says so");
});

test("the palette is set once for the page: the drawing's known tags and symbols follow it", () => {
	const before = PALETTE;
	try {
		usePalette(palette({ tags: { todo: style("☐", "#66ccff") }, fallback: "#cccccc" }));
		assert.deepEqual(KNOWN_TAGS, ["todo"]);
		assert.equal(lead({ tag: "todo", known: true }), "☐ ");
		assert.equal(lead({ tag: "guess", known: true }), "[guess] ");
	} finally {
		usePalette(before);
	}
	assert.deepEqual(KNOWN_TAGS, Object.keys(DEFAULT.tags));
});

test("the highlight rules go in as a constructed stylesheet, or as a <style> where the page can't take one", () => {
	const css = "::highlight(mk-t-todo) { color: #005a8c; }";
	const page = () => new JSDOM("<!doctype html><html><head></head><body></body></html>").window;
	const adopting = page();
	assert.equal(addHighlightStyles(adopting.document, css), "adopted");
	assert.equal(adopting.document.adoptedStyleSheets.length, 1);
	assert.equal(adopting.document.querySelector("style"), null, "no element added");
	const plain = page();
	(plain as unknown as { CSSStyleSheet: unknown }).CSSStyleSheet = undefined;
	assert.equal(addHighlightStyles(plain.document, css), "style");
	assert.equal(plain.document.head.querySelector("style[data-response-markup]")!.textContent, css);
});
