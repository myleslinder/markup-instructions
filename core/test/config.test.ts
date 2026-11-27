// A config's tags in parse(), the config check and the colours derived for the other theme.

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConfig, colourFor, contrast, CONTRAST_FLOOR, distance, oklch, parse, type Config, type TagStyle } from "../src/index.ts";
import { DEFAULT, DEFAULT_TAGS } from "../../presets/default.ts";
import { as, markers } from "./helpers.ts";

const style = (colour: TagStyle["colour"] = "#d65fd6"): TagStyle => ({ symbol: "¿", colour, legend: "a line" });
const config = (tags: Record<string, TagStyle>, fallback: Config["fallback"] = "#d9b88c"): Config => ({ tags, fallback });

// Test 2: the known tags are the caller's.

test("a tag in the list is known, and one of the preset's left out of it is not", () => {
	const blocks = parse("Is :todo[ship it] and :guess[maybe].", { tags: ["todo"] });
	assert.deepEqual(
		markers(blocks).map((m) => [m.tag, m.known]),
		[
			["todo", true],
			["guess", false],
		],
	);
});

test("no tags: every labelled directive is still a marker, none known", () => {
	assert.deepEqual(
		markers(parse(":open[a] :checked[b]", { tags: [] })).map((m) => m.known),
		[false, false],
	);
});

test("a directive with no label is bare only when its tag is known", () => {
	const runs = (tags: string[]) => as(parse("Left :todo here.", { tags })[0], "paragraph").runs.map((r) => r.kind);
	assert.deepEqual(runs(["todo"]), ["text", "bare", "text"]);
	assert.deepEqual(runs(DEFAULT_TAGS), ["text"]);
});

test("streamed text ending on a tag name is incomplete only when the tag is known", () => {
	assert.equal(parse("So it gets :todo", { tags: ["todo"] })[0]!.incomplete, true);
	assert.equal(parse("So it gets :todo", { tags: DEFAULT_TAGS })[0]!.incomplete, undefined);
	assert.equal(parse("So it gets :open-ask", { tags: ["todo"] })[0]!.incomplete, undefined);
	assert.equal(parse("So it gets :open-ask", { tags: DEFAULT_TAGS })[0]!.incomplete, true);
});

test("a name that isn't ASCII still has the brackets in its label's code shielded", () => {
	const [marker] = markers(parse(":vérifié[a `]` b] after", { tags: ["vérifié"] }));
	assert.equal(marker?.tag, "vérifié");
	assert.equal(marker?.labelText, "a ] b");
	assert.equal(marker?.known, true);
});

// Test 4: the config check.

test("the preset passes the check", () => {
	assert.deepEqual(checkConfig(DEFAULT), []);
});

test("the check accepts exactly the names the parser reads as a marker's tag", () => {
	const names = ["todo", "open-ask", "a_b", "vérifié", "1st", "猜", "x", "", "-a", "a-", "_a", "a_", "a b", "a.b", "a:b", "a]b", "a$b", "a--b"];
	for (const name of names) {
		const parsed = markers(parse(`See :${name}[x] here.`, { tags: [name] })).some((m) => m.tag === name);
		const accepted = !checkConfig(config({ [name]: style() })).some((p) => p.includes("directive's name"));
		assert.equal(accepted, parsed, JSON.stringify(name));
	}
});

test("the check rejects a reserved name, a symbol of more than one character, a missing legend line and a bad colour", () => {
	assert.equal(checkConfig(config({ unknown: style(), code: style() })).length, 2);
	assert.equal(checkConfig(config({ todo: { ...style(), symbol: "¿¿" } })).length, 1);
	assert.equal(checkConfig(config({ todo: { ...style(), symbol: "" } })).length, 1);
	assert.equal(checkConfig(config({ todo: { ...style(), legend: " " } })).length, 1);
	assert.equal(checkConfig(config({ todo: style("red") })).length, 1);
	assert.equal(checkConfig(config({ todo: style({ dark: "#d65fd6", light: "#9c1f9" }) })).length, 1);
	assert.equal(checkConfig(config({}, "#fff")).length, 1);
	assert.deepEqual(checkConfig(config({ todo: style({ dark: "#D65FD6", light: "#9c1f9c" }) })), []);
});

// Test 7: one colour for both themes. Nominal backgrounds here; the extension checks claude.ai's own.

const BACKGROUNDS = { dark: "#1f1e1d", light: "#ffffff" };
const hueGap = (a: string, b: string) => {
	const d = Math.abs(oklch(a)[2] - oklch(b)[2]) % 360;
	return Math.min(d, 360 - d);
};
const dark = (tag: string) => (DEFAULT.tags[tag]!.colour as { dark: string; light: string }).dark;
const light = (tag: string) => (DEFAULT.tags[tag]!.colour as { dark: string; light: string }).light;

test("a colour set for each theme is drawn as written", () => {
	assert.equal(colourFor({ dark: "#d65fd6", light: "#123456" }, "light", BACKGROUNDS), "#123456");
	assert.equal(colourFor({ dark: "#d65fd6", light: "#123456" }, "dark", BACKGROUNDS), "#d65fd6");
});

test("a single colour is drawn as written in the theme it was written for", () => {
	assert.equal(colourFor("#d65fd6", "dark", BACKGROUNDS), "#d65fd6");
	assert.equal(colourFor("#9c1f9c", "light", BACKGROUNDS), "#9c1f9c");
});

test("derived for the other theme, a colour keeps its hue and reaches the contrast floor", () => {
	for (const tag of DEFAULT_TAGS) {
		for (const [from, theme] of [
			[dark(tag), "light"],
			[light(tag), "dark"],
		] as const) {
			const out = colourFor(from, theme, BACKGROUNDS);
			assert.ok(hueGap(out, from) <= 3, `${tag} ${from} → ${out}: hue moved ${hueGap(out, from).toFixed(1)}°`);
			const ratio = contrast(out, BACKGROUNDS[theme]);
			assert.ok(ratio >= CONTRAST_FLOOR, `${tag} ${from} → ${out}: contrast ${ratio.toFixed(2)}`);
		}
	}
});

test("the preset's dark colours, derived for light, land close to its hand-picked light shades", () => {
	for (const tag of DEFAULT_TAGS) {
		// The guess kinds' light colour is guess's, not a shade picked for them.
		if (tag.startsWith("guess-")) continue;
		const out = colourFor(dark(tag), "light", BACKGROUNDS);
		assert.ok(distance(out, light(tag)) <= 0.1, `${tag}: ${out} is ${distance(out, light(tag)).toFixed(3)} from ${light(tag)}`);
	}
});

test("a family's shades stay apart when derived for the other theme", () => {
	const kinds = ["open-ask", "open-default"];
	for (const theme of ["light", "dark"] as const) {
		const [a, b] = kinds.map((tag) => colourFor(theme === "light" ? dark(tag) : light(tag), theme, BACKGROUNDS)) as [string, string];
		assert.ok(distance(a, b) >= 0.05, `${theme}: ${a} and ${b} are ${distance(a, b).toFixed(3)} apart`);
	}
});
