// The side panel's Markup instructions section as built: shown on
// request, made from the saved settings, a prompt to save in place of the text while the tags have unsaved changes, the
// flag, Copy, and the frame locked behind a warning, its edits saved and discarded like the tags'.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { rulesInFile, type Config } from "../../core/src/index.ts";
import { defaultsFrom } from "../src/config.ts";
import { instructionsText } from "../src/instructions-section.ts";
import { SETTINGS_FORMAT, SETTINGS_KEY, type Settings } from "../src/settings.ts";
import { panel, wait } from "./panel-helpers.ts";

const RULES_FILE = readFileSync(new URL("../../rules/markup-rules-claude-ai.md", import.meta.url), "utf8");
const DEFAULTS = defaultsFrom(RULES_FILE);

type Panel = Awaited<ReturnType<typeof panel>>;
const rowOf = (p: Panel, name: string) =>
	[...p.doc.querySelectorAll<HTMLDetailsElement>("#tags details.tag")].find((r) => r.querySelector<HTMLInputElement>(".name")!.value === name)!;
function type(el: Element, value: string): void {
	(el as HTMLInputElement | HTMLTextAreaElement).value = value;
	el.dispatchEvent(new el.ownerDocument.defaultView!.Event("input"));
}
const stored = (p: Panel) => p.sync[SETTINGS_KEY] as Settings | undefined;
const hidden = (p: Panel, id: string) => p.$(id).hidden;
const copyOff = (p: Panel) => (p.$("copy") as HTMLButtonElement).disabled;
async function copy(p: Panel): Promise<string> {
	p.$("copy").click();
	await wait(0);
	return p.copied.at(-1)!;
}
async function click(p: Panel, id: string): Promise<void> {
	p.$(id).click();
	await wait(0);
}
const textareas = (p: Panel) => [...p.doc.querySelectorAll<HTMLTextAreaElement>("#rules textarea")];

test("only the button until asked; then the text, and Copy gives the default as claude.ai's rules file holds it", async () => {
	const p = await panel();
	assert.equal(hidden(p, "show-row"), false);
	assert.equal(hidden(p, "instructions"), true);
	await click(p, "show-instructions");
	assert.equal(hidden(p, "show-row"), true);
	assert.equal(hidden(p, "instructions"), false);
	assert.equal(p.doc.querySelectorAll("#rules .tl").length, 6);
	assert.equal(textareas(p).length, 0, "the frame is locked");
	assert.equal(copyOff(p), false);
	assert.equal(await copy(p), `## Response markup\n\n${rulesInFile(RULES_FILE)}`);
	assert.equal(p.$("copied").textContent, "Copied");
});

test("asked with unsaved tag changes: a prompt to save first; Save and show saves them and shows the text with them", async () => {
	const p = await panel();
	type(rowOf(p, "guess").querySelector(".name")!, "hunch");
	await click(p, "show-instructions");
	assert.equal(hidden(p, "instructions-unsaved"), false);
	assert.equal(hidden(p, "instructions"), true);
	assert.match(p.$("instructions-unsaved-text").textContent!, /save them first, or discard them/);
	await click(p, "save-and-show");
	assert.ok("hunch" in stored(p)!.config.tags);
	assert.equal(hidden(p, "instructions-unsaved"), true);
	assert.equal(hidden(p, "instructions"), false);
	assert.match(p.$("rules").textContent!, /:hunch\[…\]/);
	assert.match(await copy(p), /\n:hunch\[…\] you filled a gap/);
});

test("unsaved changes that can't be saved: the prompt says so and Save and show is off", async () => {
	const p = await panel();
	type(rowOf(p, "guess").querySelector(".name")!, "my guess");
	await click(p, "show-instructions");
	assert.match(p.$("instructions-unsaved-text").textContent!, /can't be saved yet \(fix the marked field\)/);
	assert.equal((p.$("save-and-show") as HTMLButtonElement).disabled, true);
});

test("a tag edit after the text is shown replaces it with the prompt; Discard changes brings it back", async () => {
	const p = await panel();
	await click(p, "show-instructions");
	type(rowOf(p, "guess").querySelector(".hex-dark")!, "#ff0000");
	assert.equal(hidden(p, "instructions"), true);
	assert.equal(hidden(p, "instructions-unsaved"), false);
	await click(p, "discard");
	assert.equal(hidden(p, "instructions"), false);
	assert.equal(hidden(p, "instructions-unsaved"), true);
});

test("a saved line that mentions a tag no longer in the list is flagged beside it, never fixed", async () => {
	const config: Config = structuredClone(DEFAULTS.config);
	delete config.tags.checked;
	const p = await panel({}, { [SETTINGS_KEY]: { format: SETTINGS_FORMAT, config } });
	await click(p, "show-instructions");
	const decided = [...p.doc.querySelectorAll("#rules .tl")].find((l) => l.textContent!.startsWith(":decided"))!;
	assert.equal(decided.querySelector(".err")!.textContent, "It names :checked, which isn't in your tags.");
	assert.match(await copy(p), /:checked \(a fact\)/);
	assert.ok(!(await copy(p)).includes("which isn't in your tags"), "the flag isn't copied");
});

test("the frame: unlocked only after the warning, its edits unsaved until Save, Copy off meanwhile", async () => {
	const p = await panel();
	await click(p, "show-instructions");
	await click(p, "unlock");
	assert.equal(hidden(p, "warning"), false);
	await click(p, "unlock-no");
	assert.equal(hidden(p, "warning"), true);
	assert.equal(textareas(p).length, 0);
	await click(p, "unlock");
	await click(p, "unlock-yes");
	assert.equal(textareas(p).length, 2);
	const [before] = textareas(p);
	assert.equal(before!.value, DEFAULTS.frame.before);
	type(before!, "Mark things in replies.");
	assert.equal(hidden(p, "save-bar"), false);
	assert.equal(copyOff(p), true);
	assert.equal(p.$("copied").textContent, "Save your changes to copy.");
	assert.equal(hidden(p, "differs"), false);
	assert.equal(stored(p), undefined);
	await click(p, "save");
	assert.deepEqual(stored(p)!.frame, { before: "Mark things in replies.", after: DEFAULTS.frame.after });
	assert.equal(copyOff(p), false);
	assert.match(await copy(p), /^## Response markup\n\nMark things in replies\.\n:open-ask\[/);
});

test("typing the frame back to what's saved leaves nothing unsaved", async () => {
	const p = await panel();
	await click(p, "show-instructions");
	await click(p, "unlock");
	await click(p, "unlock-yes");
	const [before] = textareas(p);
	type(before!, "x");
	type(before!, DEFAULTS.frame.before);
	assert.equal(hidden(p, "save-bar"), true);
	assert.equal(copyOff(p), false);
});

test("locking keeps the frame's edits, and unlocking again shows the warning again", async () => {
	const p = await panel();
	await click(p, "show-instructions");
	await click(p, "unlock");
	await click(p, "unlock-yes");
	type(textareas(p)[1]!, "Only in replies.");
	await click(p, "lock");
	assert.equal(textareas(p).length, 0);
	assert.match(p.$("rules").textContent!, /Only in replies\./);
	assert.equal(hidden(p, "save-bar"), false);
	await click(p, "unlock");
	assert.equal(hidden(p, "warning"), false);
});

test("the frame's reset puts back the default as an unsaved change; saved, nothing is stored for the frame", async () => {
	const p = await panel({}, { [SETTINGS_KEY]: { format: SETTINGS_FORMAT, config: DEFAULTS.config, frame: { before: "Mark.", after: "Done." } } });
	await click(p, "show-instructions");
	assert.equal(hidden(p, "differs"), false);
	await click(p, "reset-frame");
	assert.equal(hidden(p, "differs"), true);
	assert.equal(hidden(p, "save-bar"), false);
	assert.equal(stored(p)!.frame!.before, "Mark.", "not until Save");
	await click(p, "save");
	assert.equal(stored(p)!.frame, undefined);
});

test("Discard changes puts back the saved frame and locks it", async () => {
	const p = await panel();
	await click(p, "show-instructions");
	await click(p, "unlock");
	await click(p, "unlock-yes");
	type(textareas(p)[0]!, "Mark.");
	await click(p, "discard");
	assert.equal(textareas(p).length, 0);
	assert.equal(hidden(p, "save-bar"), true);
	assert.ok(p.$("rules").textContent!.includes(DEFAULTS.frame.before));
});

test("Reset everything puts back the default frame", async () => {
	const p = await panel({}, { [SETTINGS_KEY]: { format: SETTINGS_FORMAT, config: DEFAULTS.config, frame: { before: "Mark.", after: "Done." } } });
	await click(p, "show-instructions");
	await click(p, "reset-all");
	await click(p, "reset-all");
	assert.equal(stored(p), undefined);
	assert.equal(await copy(p), instructionsText(DEFAULTS.config, DEFAULTS.frame));
});

test("stored settings that can't be read: no instructions section", async () => {
	const p = await panel({}, { [SETTINGS_KEY]: { format: 2, config: DEFAULTS.config } });
	assert.equal(hidden(p, "instructions-section"), true);
});
