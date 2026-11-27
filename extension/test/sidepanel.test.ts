// The side panel as built: the built page and script run on jsdom, with chrome.storage stubbed. The header and the Log
// here; the Tags section in
// sidepanel-tags.test.ts and the Markup instructions in sidepanel-instructions.test.ts.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Report } from "../src/draw.ts";
import { emptyLog, KEYS, record, type Log } from "../src/stats.ts";
import { panel, wait } from "./panel-helpers.ts";

/** A log with one reply and one guard trip on one day. */
function sampleLog(): Log {
	const log = emptyLog("0.2");
	const now = new Date(2026, 10, 25, 12);
	const report: Report = { outcome: "drawn", markers: 0, unplaced: [], misses: [], blocks: [] };
	record(log, { kind: "reply", key: "k1", report, mode: "dark" }, { now });
	record(log, { kind: "trip" }, { now });
	return log;
}

const cells = (doc: Document) => [...doc.querySelectorAll("#totals tr")].map((tr) => [...tr.children].map((td) => td.textContent));

test("the header shows the name and version, and every section", async () => {
	const { doc, $ } = await panel();
	assert.equal(doc.querySelector("header h1")!.textContent, "Markup Instructions");
	assert.equal($("version").textContent, "0.2");
	assert.equal(($("tags-section") as HTMLElement).hidden, false);
	assert.equal(($("instructions-section") as HTMLElement).hidden, false);
	assert.equal(($("log-section") as HTMLElement).hidden, false);
});

test("nothing logged: says so, with zero totals and the snippets switch on", async () => {
	const { $, doc } = await panel();
	assert.equal($("dates").textContent, "Nothing counted yet");
	assert.equal($("health").textContent, "Redraws: 0 (most for one reply: 0) · Guard trips: 0");
	assert.equal($("health").hasAttribute("data-alert"), false);
	assert.deepEqual(cells(doc)[0], ["Replies seen", "0"]);
	assert.equal(($("snippets") as HTMLInputElement).checked, true);
});

test("a stored log: its dates, totals and a guard trip flagged; the snippets switch as stored", async () => {
	const { $, doc } = await panel({ [KEYS.log]: sampleLog(), [KEYS.snippets]: false });
	assert.equal($("dates").textContent, "2026-11-25");
	assert.equal($("health").textContent, "Redraws: 0 (most for one reply: 0) · Guard trips: 1");
	assert.equal($("health").hasAttribute("data-alert"), true);
	assert.deepEqual(cells(doc)[0], ["Replies seen", "1"]);
	assert.equal(($("snippets") as HTMLInputElement).checked, false);
});

test("the markers per tag show under Markers, most used first, with tags the config doesn't know as one count", async () => {
	const log = sampleLog();
	const day = Object.values(log.days)[0]!;
	day.tags = { decided: 2, guess: 3, checked: 0 };
	day.slips.unknownTags = 1;
	const { doc } = await panel({ [KEYS.log]: log });
	const rows = [...doc.querySelectorAll("#totals tr")];
	const at = rows.findIndex((tr) => tr.children[0]!.textContent === "Markers");
	assert.deepEqual(cells(doc).slice(at, at + 5), [
		["Markers", "6"],
		["guess", "3"],
		["decided", "2"],
		["Unknown tags", "1"],
		["Missed markers", "0"],
	]);
	assert.deepEqual(
		rows.slice(at, at + 5).map((tr) => tr.className),
		["", "sub", "sub", "sub", ""],
	);
});

test("the snippets switch is stored", async () => {
	const { $, doc, store } = await panel();
	const box = $("snippets") as HTMLInputElement;
	box.checked = false;
	box.dispatchEvent(new doc.defaultView!.Event("change"));
	await wait(0);
	assert.equal(store[KEYS.snippets], false);
});

test("Copy log writes the exported log, without the reply hashes", async () => {
	const { $, copied } = await panel({ [KEYS.log]: sampleLog() });
	$("log-copy").click();
	await wait(0);
	const out = JSON.parse(copied[0]!);
	assert.equal(out.days["2026-11-25"].replies, 1);
	assert.equal(out.seen, undefined);
	assert.equal($("log-status").textContent, "Log copied");
});

test("Clear takes a second click, then removes the log", async () => {
	const { $, store, doc } = await panel({ [KEYS.log]: sampleLog() });
	$("log-clear").click();
	assert.equal($("log-clear").textContent, "Click again to clear");
	assert.ok(KEYS.log in store);
	$("log-clear").click();
	await wait(0);
	assert.ok(!(KEYS.log in store));
	assert.deepEqual(cells(doc)[0], ["Replies seen", "0"]);
	assert.equal($("log-status").textContent, "Log cleared");
});

test("the log updates while the panel is open", async () => {
	const { $, listeners } = await panel();
	for (const f of listeners) f({ [KEYS.log]: { newValue: sampleLog() } }, "local");
	assert.equal($("dates").textContent, "2026-11-25");
	for (const f of listeners) f({ [KEYS.snippets]: { newValue: true } }, "sync");
	assert.equal($("dates").textContent, "2026-11-25");
});
