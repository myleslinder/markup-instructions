// The side panel's Tags section as built: edits kept until Save,
// which is off until they're valid, Discard changes, New tag, renaming, Remove, Reset everything, and stored settings
// with problems.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Config } from "../../core/src/index.ts";
import { defaultsFrom } from "../src/config.ts";
import { SETTINGS_FORMAT, SETTINGS_KEY, type Settings } from "../src/settings.ts";
import { panel, wait } from "./panel-helpers.ts";

const DEFAULTS = defaultsFrom(readFileSync(new URL("../../rules/markup-rules-claude-ai.md", import.meta.url), "utf8"));

type Panel = Awaited<ReturnType<typeof panel>>;
const rowOf = (p: Panel, name: string) =>
	[...p.doc.querySelectorAll<HTMLDetailsElement>("#tags details.tag")].find((r) => r.querySelector<HTMLInputElement>(".name")!.value === name)!;
function type(el: Element, value: string): void {
	(el as HTMLInputElement).value = value;
	el.dispatchEvent(new el.ownerDocument.defaultView!.Event("input"));
}
const stored = (p: Panel) => p.sync[SETTINGS_KEY] as Settings | undefined;
/** Clicks Save and waits for the write. */
async function save(p: Panel): Promise<void> {
	p.$("save").click();
	await wait(0);
}
const saveOff = (p: Panel) => (p.$("save") as HTMLButtonElement).disabled;
const names = (p: Panel) => [...p.doc.querySelectorAll<HTMLInputElement>("#tags .name")].map((i) => i.value);

test("the default: one row per tag in order, the fallback's row, each line built from its fields, nothing stored", async () => {
	const p = await panel();
	assert.deepEqual(names(p), Object.keys(DEFAULTS.config.tags));
	assert.equal(p.doc.querySelectorAll("#fallback details").length, 1);
	assert.equal(
		rowOf(p, "checked").querySelector(".line-preview")!.textContent,
		':checked[claim]{src="doc or file"} verified against an internal source (not web results).',
	);
	assert.equal(rowOf(p, "checked").querySelector<HTMLDetailsElement>(".attr")!.open, true);
	assert.equal(p.doc.querySelectorAll("#tags .row-flag:not([hidden])").length, 0);
	assert.equal(p.$("stored-problems").hidden, true);
	assert.equal(p.$("reload").hidden, true);
	assert.equal(p.$("save-bar").hidden, true);
	assert.equal(stored(p), undefined);
});

test("each tag's Symbol field has a tip on how to type a symbol, and a name for screen readers", async () => {
	const p = await panel();
	p.$("new-tag").click();
	for (const row of p.doc.querySelectorAll("#tags details.tag")) {
		assert.equal(row.querySelector(".symbol")!.getAttribute("aria-label"), "Symbol");
		assert.match(row.querySelector(".tip")!.textContent!, /Ctrl\+Cmd\+Space.*Emoji & Symbols/s);
		assert.match(row.querySelector("button.info")!.getAttribute("aria-label")!, /^Typing a symbol: /);
	}
});

test("an edit is kept until Save, then saved with the note and the reload notice", async () => {
	const p = await panel();
	type(rowOf(p, "guess").querySelector(".hex-dark")!, "#ff0000");
	assert.equal(p.$("save-bar").hidden, false);
	assert.equal(p.$("unsaved").textContent, "Unsaved changes");
	assert.equal(saveOff(p), false);
	await wait(50);
	assert.equal(stored(p), undefined, "not before Save");
	await save(p);
	assert.deepEqual(stored(p)!.config.tags.guess!.colour, { dark: "#ff0000", light: "#d1193f" });
	assert.equal(stored(p)!.format, SETTINGS_FORMAT);
	assert.equal(stored(p)!.frame, undefined, "the frame is the default's");
	assert.equal(p.$("saved").textContent, "Saved");
	assert.equal(p.$("save-bar").hidden, true);
	assert.equal(p.$("reload").hidden, false);
	assert.equal(p.$("reload").textContent!.trim(), "Reload claude.ai to see your changes.");
});

test("an edit that leaves the config invalid can't be saved until it's fixed", async () => {
	const p = await panel();
	const guess = rowOf(p, "guess");
	type(guess.querySelector(".name")!, "my guess");
	assert.equal(guess.querySelector(".name-err")!.textContent, "A name is letters and digits, with - or _ only between them.");
	assert.equal(guess.querySelector(".name")!.getAttribute("aria-invalid"), "true");
	assert.equal(p.$("unsaved").textContent, "Not saved: fix the marked field");
	assert.equal(saveOff(p), true);
	await save(p);
	assert.equal(stored(p), undefined);
	type(guess.querySelector(".name")!, "hunch");
	assert.equal((guess.querySelector(".name-err") as HTMLElement).hidden, true);
	assert.equal(saveOff(p), false);
	await save(p);
	assert.deepEqual(Object.keys(stored(p)!.config.tags), ["open-ask", "open-default", "hunch", "decided", "changed", "checked"]);
});

test("a rename changes the tag's own line and flags the lines that mention the old name", async () => {
	const p = await panel();
	type(rowOf(p, "guess").querySelector(".name")!, "hunch");
	assert.match(rowOf(p, "hunch").querySelector(".line-preview")!.textContent!, /^:hunch\[…\] you filled a gap/);
	const decided = rowOf(p, "decided");
	assert.equal((decided.querySelector(".row-flag") as HTMLElement).hidden, false);
	assert.equal(decided.querySelector(".line-err")!.textContent, "It names :guess, which isn't in your tags.");
	assert.equal(saveOff(p), false, "a flag doesn't keep the change from being saved");
	await save(p);
	assert.equal(stored(p)!.config.tags.hunch!.line!.purpose, DEFAULTS.config.tags.guess!.line!.purpose);
});

test("New tag: a row at the end, open, with the name focused; saved once it has a name and what it's for", async () => {
	const p = await panel();
	p.$("new-tag").click();
	const rows = p.doc.querySelectorAll<HTMLDetailsElement>("#tags details.tag");
	const added = rows[rows.length - 1]!;
	assert.equal(added.open, true);
	assert.equal(p.doc.activeElement, added.querySelector(".name"));
	assert.equal(added.querySelector<HTMLInputElement>(".hint-in")!.value, "…");
	assert.equal(added.querySelector(".chip")!.textContent, "• new tag");
	assert.equal(p.$("unsaved").textContent, "Not saved: fix the marked field");
	type(added.querySelector(".name")!, "aside");
	type(added.querySelector(".desc")!, "a side note, not part of the answer.");
	assert.equal(added.querySelector(".line-preview")!.textContent, ":aside[…] a side note, not part of the answer.");
	await save(p);
	const tag = stored(p)!.config.tags.aside!;
	assert.equal(tag.legend, "a side note, not part of the answer.");
	assert.deepEqual(tag.line, { brackets: "…", purpose: "a side note, not part of the answer." });
	assert.deepEqual(Object.keys(stored(p)!.config.tags).at(-1), "aside");
});

test("Remove takes the tag out and flags lines that mention it", async () => {
	const p = await panel();
	rowOf(p, "checked").querySelector<HTMLButtonElement>(".remove")!.click();
	assert.ok(!names(p).includes("checked"));
	assert.match(rowOf(p, "decided").querySelector(".line-err")!.textContent!, /It names :checked, which isn't in your tags\./);
	await save(p);
	assert.ok(!("checked" in stored(p)!.config.tags));
});

test("the fallback's colours are edited and saved like a tag's", async () => {
	const p = await panel();
	const fallback = p.doc.querySelector("#fallback details")!;
	type(fallback.querySelector(".hex-light")!, "sand");
	assert.equal(fallback.querySelector(".colour-err")!.textContent, "A colour is # and six hex digits, like #d65fd6.");
	type(fallback.querySelector(".hex-light")!, "#555555");
	await save(p);
	assert.deepEqual(stored(p)!.config.fallback, { dark: "#d9b88c", light: "#555555" });
});

test("Discard changes puts back the saved settings: a removed tag and an edit undone, nothing written", async () => {
	const config: Config = structuredClone(DEFAULTS.config);
	config.tags.guess!.symbol = "?";
	const p = await panel({}, { [SETTINGS_KEY]: { format: SETTINGS_FORMAT, config } });
	rowOf(p, "checked").querySelector<HTMLButtonElement>(".remove")!.click();
	type(rowOf(p, "guess").querySelector(".symbol")!, "!");
	p.$("discard").click();
	assert.deepEqual(names(p), Object.keys(DEFAULTS.config.tags));
	assert.equal(rowOf(p, "guess").querySelector<HTMLInputElement>(".symbol")!.value, "?", "the saved symbol, not the default's");
	assert.equal(p.$("save-bar").hidden, true);
	assert.equal(p.$("saved").textContent, "Changes discarded");
	await wait(50);
	assert.deepEqual(stored(p)!.config, config);
	type(rowOf(p, "guess").querySelector(".symbol")!, "¡");
	await save(p);
	assert.equal(stored(p)!.config.tags.guess!.symbol, "¡", "the rows after Discard are the ones saved");
});

test("Reset everything also drops unsaved changes", async () => {
	const p = await panel();
	type(rowOf(p, "guess").querySelector(".hex-dark")!, "#ff0000");
	p.$("reset-all").click();
	p.$("reset-all").click();
	await wait(0);
	assert.equal(p.$("save-bar").hidden, true);
	assert.equal(rowOf(p, "guess").querySelector<HTMLInputElement>(".hex-dark")!.value, "#ff6b8b");
});

test("Reset everything takes a second click, removes what's stored and shows the default again", async () => {
	const config: Config = structuredClone(DEFAULTS.config);
	delete config.tags.checked;
	const p = await panel({}, { [SETTINGS_KEY]: { format: SETTINGS_FORMAT, config } });
	assert.ok(!names(p).includes("checked"));
	p.$("reset-all").click();
	assert.equal(p.$("reset-all").textContent, "Click again to reset your tags, colours and text");
	assert.ok(stored(p));
	p.$("reset-all").click();
	await wait(0);
	assert.equal(stored(p), undefined);
	assert.deepEqual(names(p), Object.keys(DEFAULTS.config.tags));
	assert.equal(p.$("reload").hidden, false);
});

test("stored settings that can't be read: a notice with the problems, and only Reset everything", async () => {
	const p = await panel({}, { [SETTINGS_KEY]: { format: 2, config: DEFAULTS.config } });
	assert.equal(p.$("stored-problems").hidden, false);
	assert.match(p.$("stored-problems-text").textContent!, /can't be read/);
	assert.match(p.$("stored-problems-list").textContent!, /format 2; this version reads 1/);
	for (const id of ["tags", "new-tag", "fallback-h", "fallback"]) assert.equal(p.$(id).hidden, true, id);
	assert.equal(p.$("reset-all").closest<HTMLElement>("[hidden]"), null);
	p.$("reset-all").click();
	p.$("reset-all").click();
	await wait(0);
	assert.equal(stored(p), undefined);
	assert.equal(p.$("stored-problems").hidden, true);
	assert.equal(p.$("tags").hidden, false);
});

test("stored settings with problems: a notice, the problems marked in the rows, and gone once fixed and saved", async () => {
	const config: Config = structuredClone(DEFAULTS.config);
	config.tags.guess!.symbol = "two";
	const p = await panel({}, { [SETTINGS_KEY]: { format: SETTINGS_FORMAT, config } });
	assert.equal(p.$("stored-problems").hidden, false);
	assert.match(p.$("stored-problems-text").textContent!, /have problems/);
	const guess = rowOf(p, "guess");
	assert.equal((guess.querySelector(".row-flag") as HTMLElement).hidden, false);
	assert.equal(guess.querySelector(".colour-err")!.textContent, "The symbol is one character.");
	type(guess.querySelector(".symbol")!, "～");
	await save(p);
	assert.equal(stored(p)!.config.tags.guess!.symbol, "～");
	assert.equal(p.$("stored-problems").hidden, true);
});
