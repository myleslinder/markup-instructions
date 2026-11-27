// Streaming: each fixture cut short, as the mod sees a block while it's still being written. A finished fixture not being incomplete is checked in fixtures.test.ts.
//
// The guarantee is "never style a marker before it has closed, as the text stands so far" (docs/how-it-works.md, "Guarantees"). In
// Claude Code each marker is styled as soon as it closes, also in a block whose next marker is still being written. Like
// any streamed markdown, a cut can read differently from the finished text: a code span whose closing backtick hasn't
// arrived is still plain text. That flicker is accepted, so the tests skip a case when its cause is
// such a code span: the character the cut or the early marker ends on is inside code in the finished reply. Recognising
// the accepted cases by cause, not one by one, keeps any other kind showing up here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { type MarkerRun } from "../src/index.ts";
import { parseTree } from "../src/parse.ts";
import { parse, allRuns, codeRanges, inCode, markers, loadFixtures } from "./helpers.ts";

const fixtures = loadFixtures();

for (const { name, markdown } of fixtures) {
	const final = markers(parse(markdown));
	if (final.length === 0) continue;
	const starts = blockStarts(markdown);
	const code = codeRanges(parseTree(markdown));

	test(`${name}: a cut inside a marker is incomplete`, () => {
		const unflagged: string[] = [];
		for (const marker of final) {
			const from = starts.findLast((start) => start <= marker.start)!;
			for (const cut of cutsInside(marker)) {
				if (inCode(code, cut - 1)) continue;
				if (!parse(markdown.slice(from, cut)).some((b) => b.incomplete)) unflagged.push(`${cut}: ${markdown.slice(cut - 20, cut)}`);
			}
		}
		assert.deepEqual(unflagged, []);
	});

	test(`${name}: a marker styled mid-stream is the finished reply's marker`, () => {
		const byStart = new Map(final.map((m) => [m.start, m]));
		const early = new Set<string>();
		starts.forEach((from, i) => {
			const end = starts[i + 1] ?? markdown.length;
			// Only a cut past a directive-like colon can style a marker, and a marker first appears when its `]` or
			// `}` arrives, so later cuts only keep it or take it away. Cuts just after a `[` also land inside later
			// markers, where the block is incomplete and the markers before them are styled.
			const colon = markdown.slice(from, end).search(/:[A-Za-z]/);
			if (colon < 0) return;
			for (let cut = from + colon + 2; cut <= end; cut++) {
				if (cut < end && !"[]}".includes(markdown.charAt(cut - 1))) continue;
				for (const block of parse(markdown.slice(from, cut))) {
					for (const run of allRuns([block])) {
						if (run.kind !== "marker") continue;
						const start = from + run.start;
						if (inCode(code, from + run.end - 1)) continue;
						if (!sameMarker(run, byStart.get(start))) early.add(`${start}: ${run.source}`);
					}
				}
			}
		});
		assert.deepEqual([...early], []);
	});
}

/**
 * Where each top-level block starts. A cut is parsed from the start of its block rather than the input's, which is
 * far quicker and gives the same last block: the blocks before it have finished.
 */
function blockStarts(markdown: string): number[] {
	const starts: number[] = [];
	let offset = 0;
	for (const block of parse(markdown)) {
		starts.push(offset);
		offset += block.source.length + block.gap.length;
	}
	return starts;
}

/**
 * The cuts inside a marker where the rules flag the input incomplete: from the end of a known tag's name (its `[` may
 * come next) or an unknown tag's `[`, up to the marker's last character. A cut inside the name isn't flagged (`:ope`
 * could be prose), nor one just after the label's `]` (the marker has closed; its attributes haven't started).
 */
function* cutsInside(marker: MarkerRun): Generator<number> {
	const nameEnd = marker.start + 1 + marker.tag.length;
	const attrs = marker.source.endsWith("}") ? marker.start + marker.source.lastIndexOf("]{") + 1 : -1;
	for (let cut = marker.known ? nameEnd : nameEnd + 1; cut < marker.end; cut++) if (cut !== attrs) yield cut;
}

/** The same marker as far as it has been written: tag and label match, and its ID and `src` are missing or match. */
function sameMarker(run: MarkerRun, final: MarkerRun | undefined): boolean {
	if (!final || run.tag !== final.tag || run.labelText !== final.labelText) return false;
	return (run.id === undefined || run.id === final.id) && (run.src === undefined || run.src === final.src);
}
