// The mod's config, as it draws it. The preset: every tag has a style, and the dark colours stay apart from each other
// and from the colours Claude Code already uses in a reply. Any config: its own tags are drawn in its own colours, and a
// config with problems isn't drawn.

import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT, DEFAULT_TAGS } from "../../presets/default.ts";
import { CONTRAST_FLOOR, contrast, parse, type Config } from "../../core/src/index.ts";
import type { Config as ModConfig } from "../../.claude/skills/markup/hooks/core.mjs";
import { NOTE_SHADE, colourOf, noteColour, palette, symbolOf } from "../../.claude/skills/markup/hooks/style.ts";
import { draw } from "../src/draw.ts";
import { markers } from "../../core/test/helpers.ts";

const { tags: TAGS, fallback: UNKNOWN } = palette(DEFAULT);

/** Colours in Claude Code's reply drawing (dark theme), read from a reply. Links use the terminal's bright blue;
 * VS Code's default stands in for it. */
const CLAUDE_CODE = {
	"inline code": "#b1b9f9",
	"reply bullet": "#ffffff",
	"link (VS Code's bright blue)": "#3b8eea",
	"Claude's orange": "#d77757",
	"dim text": "#999999",
};

/** How far apart two colours must be, as straight-line distance in RGB (0 to 441). */
const MIN_DISTANCE = 60;
/** How far apart two shades in one family must be: close enough to read as one family, far enough to tell apart. */
const MIN_SHADE_DISTANCE = 25;

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const distance = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]!));
const styles = Object.entries(TAGS);
/** A kind's family is the part of its name before the hyphen (`open-ask` is an open); a family's own name is itself. */
const family = (tag: string) => tag.split("-")[0]!;

test("the mod draws exactly the tags in the preset, and the preset has no problems", () => {
	assert.deepEqual(Object.keys(TAGS), DEFAULT_TAGS);
	assert.deepEqual(palette(DEFAULT).problems, []);
});

test("each tag has one symbol character, a #rrggbb colour and a legend line; a family shares one symbol, families differ", () => {
	for (const [tag, s] of styles) {
		assert.equal([...s.symbol].length, 1, `${tag}: symbol is one character`);
		assert.match(s.colour, /^#[0-9a-f]{6}$/, `${tag}: colour`);
		assert.ok(s.legend.length > 0, `${tag}: legend line`);
	}
	const symbols = new Map<string, string>();
	for (const [tag, s] of styles) {
		const f = family(tag);
		if (symbols.has(f)) assert.equal(s.symbol, symbols.get(f), `${tag}: its family's symbol`);
		else symbols.set(f, s.symbol);
	}
	assert.equal(new Set(symbols.values()).size, symbols.size, "each family has its own symbol");
	assert.match(UNKNOWN, /^#[0-9a-f]{6}$/);
	assert.ok(NOTE_SHADE > 0 && NOTE_SHADE < 1);
});

test("tag colours are apart from other families, the unknown tag's colour and Claude Code's reply colours", () => {
	const others = { ...CLAUDE_CODE, unknown: UNKNOWN, ...Object.fromEntries(styles.map(([tag, s]) => [tag, s.colour])) };
	for (const [tag, s] of styles)
		for (const [name, colour] of Object.entries(others))
			if (family(name) !== family(tag)) assert.ok(distance(s.colour, colour) >= MIN_DISTANCE, `${tag} ${s.colour} is too close to ${name} ${colour}`);
});

test("the kinds in one family can be told apart", () => {
	// A bare family name is only in replies written before the kinds, never beside them, so it may sit close to one.
	const kinds = styles.filter(([tag]) => tag.includes("-"));
	for (const [tag, s] of kinds)
		for (const [other, o] of kinds)
			if (other !== tag && family(other) === family(tag))
				assert.ok(distance(s.colour, o.colour) >= MIN_SHADE_DISTANCE, `${tag} ${s.colour} is too close to ${other} ${o.colour}`);
});

// Any config.

/** The mod's copy of the core's config types (core.d.mts) still takes the core's configs. */
const typesAgree: ModConfig = DEFAULT;
void typesAgree;

const CUSTOM: Config = {
	tags: {
		todo: { symbol: "☐", colour: "#5fa8ff", legend: "something to do" },
		open: { symbol: "?", colour: { dark: "#e07ce0", light: "#a937a9" }, legend: "a question" },
	},
	fallback: "#cccccc",
};

test("a custom config's tags are drawn in its own symbols and colours, and a tag it leaves out through the fallback", () => {
	const p = palette(CUSTOM);
	assert.deepEqual(p.problems, []);
	const blocks = parse(":todo[ship it] and :guess[maybe]", { tags: Object.keys(p.tags) });
	assert.deepEqual(
		markers(blocks).map((m) => [m.tag, m.known]),
		[
			["todo", true],
			["guess", false],
		],
	);
	const drawn = JSON.stringify(draw(blocks));
	assert.ok(drawn.includes('"tone":"todo"') && drawn.includes('{"type":"Symbol","tag":"todo"}'), drawn);
	assert.ok(drawn.includes('"tone":"unknown"') && drawn.includes("[guess] "), drawn);
	assert.equal(symbolOf("todo", p), "☐");
	assert.equal(colourOf({ tone: "todo" }, p), "#5fa8ff");
	assert.equal(colourOf({ tone: "open" }, p), "#e07ce0");
	assert.equal(colourOf({ tone: "unknown" }, p), "#cccccc");
	assert.equal(colourOf({ tone: "code" }, p), "permission");
});

test("a single colour written for light is drawn in a dark shade of it", () => {
	const p = palette({ tags: { todo: { symbol: "☐", colour: "#9c1f9c", legend: "something to do" } }, fallback: "#86663a" });
	assert.notEqual(p.tags.todo!.colour, "#9c1f9c");
	assert.notEqual(p.fallback, "#86663a");
});

test("a config with problems has them listed", () => {
	const p = palette({ tags: { code: { symbol: "¿¿", colour: "red", legend: "" } }, fallback: "#cccccc" });
	assert.equal(p.problems.length, 4);
});

// The desktop app's Code tab: its colours in each mode, on the
// app's background in that mode.

/** Hand-picked shades kept as written below the floor. */
const BELOW_FLOOR_AS_WRITTEN = { light: ["open-default"], dark: [] as string[] };

test("on the desktop each tag reaches the contrast floor on the app's background in each mode, and a note reads dimmer", () => {
	for (const mode of ["dark", "light"] as const) {
		const p = palette(DEFAULT, "desktop", mode);
		for (const [tag, s] of [...Object.entries(p.tags), ["unknown", { colour: p.fallback }] as const]) {
			const label = contrast(s.colour, p.background);
			if (!BELOW_FLOOR_AS_WRITTEN[mode].includes(tag)) assert.ok(label >= CONTRAST_FLOOR, `${mode} ${tag}: ${label.toFixed(2)}:1`);
			assert.ok(contrast(noteColour(s.colour, p), p.background) < label, `${mode} ${tag}: the note reads dimmer than its label`);
		}
		assert.equal(colourOf({ tone: "code" }, p), undefined, `${mode}: inline code takes the text colour`);
		assert.notEqual(p.code.backgroundColor, p.background, `${mode}: inline code sits on a chip`);
	}
	// The desktop's dark colours are the terminal's; its light ones are the config's light shades.
	assert.deepEqual(palette(DEFAULT, "desktop", "dark").tags, TAGS);
	assert.notEqual(palette(DEFAULT, "desktop", "light").tags.decided?.colour, TAGS.decided?.colour);
});
