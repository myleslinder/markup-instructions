// The settings module: the
// default when nothing is stored, a stored config with problems or an unknown format reported rather than used, the
// frame stored only when it isn't the default's, and a config with problems never saved.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { defaultsFrom } from "../src/config.ts";
import { current, resetSettings, saveSettings, SETTINGS_FORMAT, SETTINGS_KEY, toStore } from "../src/settings.ts";

const DEFAULTS = defaultsFrom(readFileSync(new URL("../../rules/markup-rules-claude-ai.md", import.meta.url), "utf8"));
const config = structuredClone(DEFAULTS.config);
const frame = { before: "Mark things.", after: "Only in replies." };

test("nothing stored: the default, with no problems", () => {
	assert.deepEqual(current(undefined, DEFAULTS), { ...DEFAULTS, stored: false, unreadable: false, problems: [] });
});

test("stored settings: their config, and their frame or the default's", () => {
	assert.deepEqual(current({ format: SETTINGS_FORMAT, config }, DEFAULTS), {
		config,
		frame: DEFAULTS.frame,
		stored: true,
		unreadable: false,
		problems: [],
	});
	assert.deepEqual(current({ format: SETTINGS_FORMAT, config, frame }, DEFAULTS).frame, frame);
});

test("stored settings with problems are reported, not fixed", () => {
	const bad = structuredClone(config);
	bad.tags.guess!.symbol = "two";
	assert.deepEqual(current({ format: SETTINGS_FORMAT, config: bad }, DEFAULTS).problems, ['guess: symbol "two" isn\'t one character']);
	const badLine = structuredClone(config);
	badLine.tags.guess!.line!.purpose = "";
	assert.deepEqual(current({ format: SETTINGS_FORMAT, config: badLine }, DEFAULTS).problems, ["guess: no text for what the tag is for"]);
});

test("stored settings of the wrong shape or format are reported before their content is read", () => {
	const problems = (x: unknown) => current(x, DEFAULTS).problems;
	assert.match(problems({ format: 2, config })[0]!, /format 2; this version reads 1/);
	assert.equal(current({ format: 2, config }, DEFAULTS).unreadable, true);
	assert.equal(current({ format: 1, config: { ...config, fallback: "sand" } }, DEFAULTS).unreadable, false);
	assert.match(problems("settings")[0]!, /aren't an object/);
	assert.match(problems({ format: 1, config: { tags: [] } })[0]!, /isn't a config/);
	assert.match(problems({ format: 1, config: { tags: { a: { symbol: 1 } }, fallback: "#000000" } })[0]!, /a: the stored tag isn't a tag/);
	assert.match(problems({ format: 1, config, frame: { before: 1 } })[0]!, /isn't a frame/);
	const withBadLine = structuredClone(config) as unknown as { tags: { guess: { line: unknown } } };
	withBadLine.tags.guess.line = { brackets: "…" };
	assert.match(problems({ format: 1, config: withBadLine })[0]!, /guess: the stored tag isn't a tag/);
});

test("the frame is stored only when it isn't the default's", () => {
	assert.deepEqual(toStore(config, DEFAULTS.frame, DEFAULTS), { format: SETTINGS_FORMAT, config });
	assert.deepEqual(toStore(config, frame, DEFAULTS), { format: SETTINGS_FORMAT, config, frame });
});

test("saving: a config with problems isn't saved; a good one is, and reset removes it", async () => {
	const store: Record<string, unknown> = {};
	(globalThis as unknown as { chrome: unknown }).chrome = {
		storage: {
			sync: {
				get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
				set: async (items: Record<string, unknown>) => void Object.assign(store, structuredClone(items)),
				remove: async (key: string) => void delete store[key],
			},
		},
	};
	const bad = structuredClone(config);
	bad.tags.guess!.colour = "red";
	assert.deepEqual(await saveSettings(bad, frame, DEFAULTS), ['guess: colour "red" isn\'t #rrggbb']);
	assert.equal(SETTINGS_KEY in store, false);
	assert.deepEqual(await saveSettings(config, frame, DEFAULTS), []);
	assert.deepEqual(store[SETTINGS_KEY], { format: SETTINGS_FORMAT, config, frame });
	await resetSettings();
	assert.equal(SETTINGS_KEY in store, false);
});
