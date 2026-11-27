// A log from drawing every claude.ai pair holds no reply text with
// snippets off, and only the snippets with them on; a reply drawn twice is counted once. Plus the counts themselves.

import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "../../core/test/helpers.ts";
import { drawRow, newState, type Report } from "../src/draw.ts";
import { coreMarkers } from "../src/place.ts";
import { finishedRows, turnKey } from "../src/rows.ts";
import { emptyLog, exported, LONG_LABEL_WORDS, record, SEEN, tally, totals } from "../src/stats.ts";
import { PAIRS, pairRow, page, row } from "./helpers.ts";

const NOW = new Date(2026, 10, 24, 12);

/** Draws a row and records it, as the content script does. */
function drawAndRecord(log: ReturnType<typeof emptyLog>, rowEl: Element, snippets: boolean) {
	const report = drawRow(rowEl, newState());
	record(log, { kind: "reply", key: turnKey(rowEl)!, report, mode: "light" }, { now: NOW, snippets });
	return report;
}

/** Each pair's labels, and a reply with a miss in it, as text that mustn't reach the log. */
function replyTexts(): string[] {
	const texts: string[] = [];
	for (const name of PAIRS) {
		const rowEl = pairRow(name);
		for (const m of coreMarkers(drawRow(rowEl, newState()).blocks)) texts.push(m.labelText);
	}
	return texts.filter((t) => t.length >= 6);
}

const MISS = "<p>Private words here :decided[fine] and :guess[left open by mistake</p>";

for (const snippets of [false, true]) {
	test(`a log from every pair and a miss holds ${snippets ? "only the snippets" : "no reply text"} with snippets ${snippets ? "on" : "off"}`, () => {
		const log = emptyLog("0.1.0");
		for (const name of PAIRS) drawAndRecord(log, pairRow(name), snippets);
		drawAndRecord(log, finishedRows(page(row(MISS, { turnKey: "miss-1" })))[0]!, snippets);
		const day = log.days["2026-11-24"]!;
		assert.equal(day.snippets.length, snippets ? 1 : 0);
		if (snippets) assert.match(day.snippets[0]!, /:guess\[left open/);
		day.snippets = [];
		const json = exported(log);
		for (const text of [...replyTexts(), "Private words", "left open by mistake"]) assert.ok(!json.includes(text), `log holds "${text}"`);
		assert.ok(!json.includes("hub-reply"), "no turn keys");
	});
}

test("every pair's markers are counted by tag, and the replies with them", () => {
	const log = emptyLog();
	let markers = 0;
	for (const name of PAIRS) markers += drawAndRecord(log, pairRow(name), true).markers;
	const t = totals(log);
	assert.equal(t.replies, PAIRS.length);
	assert.equal(t.withMarkers, PAIRS.length);
	assert.equal(t.markers, markers);
	assert.equal(t.misses + t.unplaced + t.errors, 0);
});

test("a reply drawn twice is counted once", () => {
	const log = emptyLog();
	drawAndRecord(log, pairRow("test-2"), true);
	drawAndRecord(log, pairRow("test-2"), true);
	assert.equal(totals(log).replies, 1);
	assert.equal(log.seen.length, 1);
});

test("only the latest replies are remembered as counted", () => {
	const log = emptyLog();
	const report: Report = { outcome: "drawn", markers: 0, unplaced: [], misses: [], blocks: [] };
	for (let i = 0; i < SEEN + 5; i++) record(log, { kind: "reply", key: `k${i}`, report, mode: null }, { now: NOW });
	assert.equal(log.seen.length, SEEN);
	assert.equal(totals(log).replies, SEEN + 5);
});

test("rule slips: an unknown tag, a bare tag, a marker in bold, a very long label", () => {
	const long = Array(LONG_LABEL_WORDS + 1)
		.fill("word")
		.join(" ");
	const { tags, slips } = tally(parse(`:parked[later] and :guess and **:decided[bold]** and :checked[${long}] and :decided[ok]`));
	assert.deepEqual(tags, { decided: 2, checked: 1 });
	assert.deepEqual(slips, { unknownTags: 1, bareTags: 1, inBold: 1, longLabels: 1 });
});

test("redraws, the most for one reply, guard trips and errors are counted by day", () => {
	const log = emptyLog();
	record(log, { kind: "redraw", redraws: 1 }, { now: NOW });
	record(log, { kind: "redraw", redraws: 3 }, { now: NOW });
	record(log, { kind: "trip" }, { now: NOW });
	record(log, { kind: "error" }, { now: new Date(2026, 10, 25, 9) });
	assert.deepEqual([log.from, log.to], ["2026-11-24", "2026-11-25"]);
	const t = totals(log);
	assert.deepEqual([t.redraws, t.maxRedrawsOneReply, t.guardTrips, t.errors], [2, 3, 1, 1]);
});

test("a reply past the core's limits is counted, and not as having markers", () => {
	const log = emptyLog();
	const report: Report = { outcome: "skipped", markers: 0, unplaced: [], misses: [], blocks: [] };
	record(log, { kind: "reply", key: "big", report, mode: "dark" }, { now: NOW });
	const day = log.days["2026-11-24"]!;
	assert.deepEqual([day.replies, day.withMarkers, day.health.pastLimits, day.modes.dark], [1, 0, 1, 1]);
});

test("the export leaves out the hashes of replies counted", () => {
	const log = emptyLog("0.1.0");
	drawAndRecord(log, pairRow("test-2"), true);
	const out = JSON.parse(exported(log, NOW));
	assert.equal(out.seen, undefined);
	assert.equal(out.version, "0.1.0");
	assert.ok(out.exportedAt);
});
