// Drawing never loses text and changes no structure, on every
// claude.ai pair; and the re-render cases, where the page undoes the edits, on jsdom.

import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS } from "../../core/src/index.ts";
import { parse } from "../../core/test/helpers.ts";
import { convertRow } from "../src/convert.ts";
import { drawRow, GUARD, newState } from "../src/draw.ts";
import { coreMarkers, place, scan } from "../src/place.ts";
import { finishedRows } from "../src/rows.ts";
import { PAIRS, pairRow, page, row } from "./helpers.ts";

/** Every node under the row, in order. */
function nodes(rowEl: Element): Node[] {
	const out: Node[] = [];
	const walker = rowEl.ownerDocument.createTreeWalker(rowEl, 0xffffffff);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
	return out;
}

/** The symbol and space, or `[name] `, written in place of each directive's opening. */
const LEAD = /(?:[¿～✓✎⌕]|\[[A-Za-z][\w-]*\]) /g;

/** A row's visible text with only the syntax taken out: each directive's opening and `]`, `{` as a space, and `}`. */
function withoutSyntax(rowEl: Element): string {
	const s = scan(rowEl);
	const { placed } = place(s, coreMarkers(parse(convertRow(rowEl))));
	const cut = new Map<number, string>();
	for (const p of placed) {
		for (let i = p.open; i < p.label; i++) cut.set(i, "");
		cut.set(p.close, "");
		if (p.attrs) cut.set(p.attrs.start, " ").set(p.attrs.end - 1, "");
	}
	return [...s.text].map((c, i) => cut.get(i) ?? c).join("");
}

for (const name of PAIRS) {
	test(`${name}: drawing loses no text and changes no structure`, () => {
		const expected = withoutSyntax(pairRow(name));
		const rowEl = pairRow(name);
		const before = nodes(rowEl);
		const report = drawRow(rowEl, newState());
		assert.equal(report.outcome, "drawn");

		const after = nodes(rowEl);
		assert.equal(after.length, before.length);
		assert.ok(
			after.every((n, i) => n === before[i]),
			"no node added, removed or moved",
		);
		const drawn = scan(rowEl).text;
		assert.equal(drawn.match(LEAD)?.length, report.markers, "one symbol or tag name per marker");
		assert.equal(drawn.replace(LEAD, ""), expected);
	});
}

/** A finished row on a fresh page, its state, and the first edited text node. */
function drawn(reply: string) {
	const rowEl = finishedRows(page(row(reply)))[0]!;
	const st = newState();
	const report = drawRow(rowEl, st, 0);
	return { rowEl, st, report, node: [...st.edits.keys()][0]! };
}

test("the highlights cover the symbol, the label and the note", () => {
	const { st } = drawn('<p>Yes: :checked[It <em>builds</em>]{#C1 src="b.log"} and :parked[later].</p>');
	assert.deepEqual(
		st.marks.map((m) => [m.name, m.range.toString()]),
		[
			["mk-t-checked", "⌕"],
			["mk-t-checked", "It builds"],
			["mk-n-checked", '#C1 src="b.log"'],
			["mk-fallback", "[parked]"],
			["mk-fallback", "later"],
		],
	);
});

test("the drawn text: syntax out, symbol in, the note after a space", () => {
	const { rowEl } = drawn('<p>Yes: :checked[It <em>builds</em>]{#C1 src="b.log"} and :parked[later].</p>');
	assert.equal(rowEl.querySelector("p")!.textContent, 'Yes: ⌕ It builds #C1 src="b.log" and [parked] later.');
});

test("a row drawn and still as drawn is left alone", () => {
	const { rowEl, st } = drawn("<p>:decided[one]</p>");
	assert.equal(drawRow(rowEl, st, 1).outcome, "unchanged");
	assert.equal(st.redraws, 0);
});

test("a row with no markers is drawn once and then left alone", () => {
	const { rowEl, st, report } = drawn("<p>Nothing here.</p>");
	assert.equal(report.markers, 0);
	assert.equal(drawRow(rowEl, st, 1).outcome, "unchanged");
});

test("the same text written whole again after drawing is drawn again and counted as a redraw", () => {
	const { rowEl, st, node } = drawn("<p>Before :decided[one] after</p>");
	// React writes a node's text whole when it re-renders it.
	node.data = "Before :decided[one] after";
	assert.equal(drawRow(rowEl, st, 1).outcome, "redrawn");
	assert.equal(st.redraws, 1);
	assert.equal(rowEl.querySelector("p")!.textContent, "Before ✓ one after");
});

test("new text in a drawn row is a new version of the reply: drawn, not a redraw, and not towards the guard", () => {
	// A regenerate reuses the row, as seen on claude.ai.
	const { rowEl, st, node } = drawn("<p>Before :decided[one] after</p>");
	for (let k = 1; k <= GUARD.redraws + 2; k++) {
		node.data = `Before :decided[version ${k}] after`;
		assert.equal(drawRow(rowEl, st, k).outcome, "drawn");
	}
	assert.equal(st.redraws, 0);
	assert.ok(!st.fallback);
	assert.equal(rowEl.querySelector("p")!.textContent, `Before ✓ version ${GUARD.redraws + 2} after`);
});

test("text rewritten again and again trips the guard: highlights only, syntax dimmed, nothing edited", () => {
	const { rowEl, st } = drawn("<p>Before :decided[one] after</p>");
	const p = rowEl.querySelector("p")!;
	const outcomes: string[] = [];
	for (let k = 1; k <= GUARD.redraws + 1; k++) {
		p.firstChild!.nodeValue = "Before :decided[one] after";
		outcomes.push(drawRow(rowEl, st, k * 100).outcome);
	}
	assert.deepEqual(outcomes, [...Array(GUARD.redraws).fill("redrawn"), "tripped"]);
	assert.ok(st.fallback);
	assert.equal(p.textContent, "Before :decided[one] after");
	assert.equal(st.edits.size, 0);
	assert.deepEqual(
		st.marks.map((m) => [m.name, m.range.toString()]),
		[
			["mk-syntax", ":decided["],
			["mk-t-decided", "one"],
			["mk-syntax", "]"],
		],
	);
	// Once fallen back, it stays fallen back, and isn't redrawn while the page leaves it alone.
	assert.equal(drawRow(rowEl, st, 10_000).outcome, "unchanged");
	p.firstChild!.nodeValue = "Before :decided[new] after";
	assert.equal(drawRow(rowEl, st, 10_100).outcome, "fallback");
	assert.equal(st.marks[1]!.range.toString(), "new");
});

test("redraws spread out over more than the window don't trip the guard", () => {
	const { rowEl, st } = drawn("<p>Before :decided[one] after</p>");
	const p = rowEl.querySelector("p")!;
	for (let k = 1; k <= GUARD.redraws * 2; k++) {
		p.firstChild!.nodeValue = "Before :decided[one] after";
		assert.equal(drawRow(rowEl, st, k * (GUARD.windowMs / GUARD.redraws + 1)).outcome, "redrawn");
	}
	assert.ok(!st.fallback);
	assert.equal(st.redraws, GUARD.redraws * 2);
});

test("a row past the core's limits is left as the page drew it", () => {
	const long = "x".repeat(LIMITS.chars);
	const { rowEl, report } = drawn(`<p>:decided[one] ${long}</p>`);
	assert.equal(report.outcome, "skipped");
	assert.ok(rowEl.querySelector("p")!.textContent!.startsWith(":decided[one]"));
});

test("an unplaced marker and a miss are reported, and the rest is drawn", () => {
	const { rowEl, report } = drawn("<p>:decided[one] and :guess[broken</p>");
	assert.equal(report.markers, 1);
	assert.deepEqual(
		report.misses.map((m) => m.tag),
		["guess"],
	);
	assert.equal(rowEl.querySelector("p")!.textContent, "✓ one and :guess[broken");
});
