// On every claude.ai pair, every marker is placed and the self-check
// finds no misses. Plus the cases the pairs don't cover.

import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "../../core/test/helpers.ts";
import { convertRow } from "../src/convert.ts";
import { coreMarkers, place, scan, type Placed } from "../src/place.ts";
import { finishedRows } from "../src/rows.ts";
import { misses } from "../src/selfcheck.ts";
import { PAIRS, pairRow, page, row } from "./helpers.ts";

/** A row's placement and self-check, from its converted HTML as the content script does it. */
function check(rowEl: Element) {
	const s = scan(rowEl);
	const markers = coreMarkers(parse(convertRow(rowEl)));
	const { placed, unplaced } = place(s, markers);
	return { s, markers, placed, unplaced, misses: misses(s, placed) };
}

const labels = (s: ReturnType<typeof scan>, placed: Placed[]) => placed.map((p) => s.text.slice(p.label, p.close));
const one = (reply: string) => check(finishedRows(page(row(reply)))[0]!);

for (const name of PAIRS) {
	test(`${name}: every marker is placed, and the self-check finds no misses`, () => {
		const r = check(pairRow(name));
		assert.ok(r.markers.length > 0);
		assert.deepEqual(r.unplaced, []);
		assert.equal(r.placed.length, r.markers.length);
		assert.deepEqual(r.misses, []);
	});
}

test("renderer-7: the directive syntax in a code block is neither placed nor a miss", () => {
	const r = check(pairRow("renderer-7"));
	assert.ok(r.s.text.includes(":open-ask["), "the code block's text is in the scan");
	assert.equal(r.placed.length, 4);
	assert.deepEqual(r.misses, []);
});

test("a label across text nodes, with inline code in it, is placed whole", () => {
	const r = one("<p>Then :open-ask[Run <code>npx a</code> <strong>first</strong>] please.</p>");
	assert.deepEqual(labels(r.s, r.placed), ["Run npx a first"]);
});

test("brackets in inline code inside a label don't end it", () => {
	const r = one("<p>:guess[Use <code>a[0]]</code> here] ok</p>");
	assert.deepEqual(labels(r.s, r.placed), ["Use a[0]] here"]);
	assert.deepEqual(r.misses, []);
});

test("curled quotes on the page match straight ones in the markdown", () => {
	// From the converted page both sides are curled; this is for markers read from the copy button's markdown.
	const s = scan(finishedRows(page(row("<p>:decided[It’s “done”] now.</p>")))[0]!);
	const { placed } = place(s, coreMarkers(parse(':decided[It\'s "done"] now.')));
	assert.equal(placed.length, 1);
});

test("a marker at the start of a table cell is placed", () => {
	const r = one("<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>x</td><td>:open-default[Keep it]</td></tr></tbody></table>");
	assert.deepEqual(labels(r.s, r.placed), ["Keep it"]);
	assert.deepEqual(r.misses, []);
});

test("two markers with the same label are placed one each, in order", () => {
	const r = one("<p>:guess[same] and :guess[same].</p>");
	assert.equal(r.placed.length, 2);
	assert.notEqual(r.placed[0]!.open, r.placed[1]!.open);
});

test("an ID and a src are placed as the attribute block", () => {
	const r = one('<p>:checked[It builds]{#C1 src="build.log"} then.</p>');
	const p = r.placed[0]!;
	assert.equal(r.s.text.slice(p.attrs!.start, p.attrs!.end), '{#C1 src="build.log"}');
});

test("the screen-reader copy and the row's buttons aren't scanned", () => {
	const r = one("<p>:decided[one]</p>");
	assert.equal(r.s.text, "\n:decided[one]");
});

test("a web search pill isn't scanned", () => {
	const r = one('<p>:decided[one] <span data-not-prose=""><a href="https://x.test">:guess[pill]</a></span></p>');
	assert.equal(r.placed.length, 1);
	assert.ok(!r.s.text.includes("pill"));
});

test("a directive in a code block or inline code is left alone", () => {
	const r = one("<p>Write <code>:guess[x]</code>.</p><pre><code>:open-ask[y]\n</code></pre>");
	assert.deepEqual(r.markers, []);
	assert.deepEqual(r.placed, []);
	assert.deepEqual(r.misses, []);
});

test("the colon rule: a directive straight after a word character isn't one", () => {
	const r = one("<p>See http:guess[x] here.</p>");
	assert.deepEqual(r.misses, []);
});

test("a broken marker is reported as a miss, with a snippet", () => {
	const r = one("<p>Fine :decided[one]. Broken :guess[never closed.</p>");
	assert.equal(r.placed.length, 1);
	assert.deepEqual(r.misses, [{ tag: "guess", snippet: "Fine :decided[one]. Broken :guess[never closed." }]);
});

test("a directive the core didn't find is a miss, not placed", () => {
	const s = scan(finishedRows(page(row("<p>:decided[one] :guess[two]</p>")))[0]!);
	const { placed, unplaced } = place(s, []);
	assert.deepEqual([placed, unplaced], [[], []]);
	assert.deepEqual(
		misses(s, placed).map((m) => m.tag),
		["decided", "guess"],
	);
});

test("a marker the core found that isn't on the page is unplaced", () => {
	const markers = coreMarkers(parse(":decided[elsewhere]"));
	const { placed, unplaced } = place(scan(finishedRows(page(row("<p>:decided[here]</p>")))[0]!), markers);
	assert.equal(placed.length, 0);
	assert.equal(unplaced.length, 1);
});
