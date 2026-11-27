import assert from "node:assert/strict";
import { test } from "node:test";
import { finishedRows, replyRoots, turnKey } from "../src/rows.ts";
import { page, row } from "./helpers.ts";

test("finds finished rows only, in page order", () => {
	const doc = page(
		row("<p>one</p>", { turnKey: "a" }) + row("<p>two</p>", { streaming: true, turnKey: "b" }) + row("<p>three</p>", { turnKey: "c" }),
	);
	assert.deepEqual(finishedRows(doc).map(turnKey), ["a", "c"]);
});

test("a row's reply root is the outermost markdown container, not the screen-reader heading", () => {
	const doc = page(row("<p>one</p>"));
	const roots = replyRoots(finishedRows(doc)[0]!);
	assert.equal(roots.length, 1);
	assert.equal(roots[0]!.textContent, "one");
});

test("a row with text around tool calls has a root per text block", () => {
	const doc = page(
		`<div data-testid="assistant-message" data-is-streaming="false"><div class="standard-markdown"><p>a</p></div><div>tool</div><div class="standard-markdown"><p>b</p></div></div>`,
	);
	assert.deepEqual(
		replyRoots(finishedRows(doc)[0]!).map((r) => r.textContent),
		["a", "b"],
	);
});
