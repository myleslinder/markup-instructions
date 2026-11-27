// On every claude.ai fixture pair, the core finds the same markers in
// the converted page HTML as in the copy button's markdown. Plus cases the pairs don't have yet.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { parse, markers } from "../../core/test/helpers.ts";
import { convert, convertRow, convertRowCached } from "../src/convert.ts";
import { finishedRows, ROW } from "../src/rows.ts";
import { page, row } from "./helpers.ts";

const FIXTURES = new URL("../../fixtures/", import.meta.url);
const PAIRS = readdirSync(FIXTURES)
	.filter((f) => f.endsWith(".html"))
	.map((f) => f.slice(0, -".html".length));

/** The page curls straight quotes in text; placement folds them the same way. */
const fold = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

const summary = (markdown: string) => markers(parse(markdown)).map((m) => ({ tag: m.tag, labelText: fold(m.labelText), id: m.id, src: m.src }));

test("there are claude.ai pairs to test on", () => {
	assert.ok(PAIRS.length >= 7, PAIRS.join(", "));
});

for (const name of PAIRS) {
	test(`${name}: the converted page HTML has the copy button's markers`, () => {
		const doc = new JSDOM(readFileSync(new URL(`${name}.html`, FIXTURES), "utf8")).window.document;
		const rowEl = doc.querySelector(ROW);
		assert.ok(rowEl);
		const want = summary(readFileSync(new URL(`${name}.md`, FIXTURES), "utf8"));
		assert.ok(want.length > 0);
		assert.deepEqual(summary(convertRow(rowEl)), want);
	});
}

const one = (html: string) => convert(page(`<div class="standard-markdown">${html}</div>`).querySelector(".standard-markdown")!);

test("directive syntax isn't escaped", () => {
	assert.equal(one('<p>:guess[a_b *c*]{#G1 src="x.md"} and \\ too</p>'), ':guess[a_b *c*]{#G1 src="x.md"} and \\ too');
});

test("inline code in a label comes back as backticks", () => {
	const md = one("<p>:open-ask[Run <code>npx a</code> first].</p>");
	assert.equal(md, ":open-ask[Run `npx a` first].");
	assert.equal(summary(md)[0]?.labelText, "Run npx a first");
});

test("a web search pill isn't converted", () => {
	assert.equal(one('<p>Astro 7 is out. <span data-not-prose=""><a href="https://x.test">x.test</a></span></p>'), "Astro 7 is out.");
});

test("a code block keeps its fences and language, and a directive in it isn't a marker", () => {
	// claude.ai's own code block markup isn't in any pair yet; this is the plain shape.
	const md = one('<p>Before.</p><pre><code class="language-bash">echo :guess[no]\n</code></pre>');
	assert.equal(md, "Before.\n\n```bash\necho :guess[no]\n```");
	assert.deepEqual(summary(md), []);
});

test("renderer-7: claude.ai's code blocks come through whole, with nothing from their header", () => {
	const doc = new JSDOM(readFileSync(new URL("renderer-7.html", FIXTURES), "utf8")).window.document;
	const md = convertRow(doc.querySelector(ROW)!);
	const copy = readFileSync(new URL("renderer-7.md", FIXTURES), "utf8");
	const blocks = (s: string) => [...s.matchAll(/```[\s\S]*?```/g)].map((m) => fold(m[0]));
	assert.equal(blocks(md).length, 2);
	assert.deepEqual(blocks(md), blocks(copy));
});

test("a code block holding backtick fences gets a longer fence", () => {
	assert.equal(one("<pre><code>```\nx\n```</code></pre>"), "````\n```\nx\n```\n````");
});

test("a table cell's marker survives the table", () => {
	const md = one("<table><thead><tr><th>Item</th></tr></thead><tbody><tr><td>:open-default[Keep it]</td></tr></tbody></table>");
	assert.deepEqual(summary(md), [{ tag: "open-default", labelText: "Keep it", id: undefined, src: undefined }]);
});

test("the row's screen-reader heading and copy buttons aren't converted", () => {
	const doc = page(row("<p>:decided[one]</p>"));
	assert.equal(convertRow(finishedRows(doc)[0]!), ":decided[one]");
});

test("a row is converted again only when its original text changes", () => {
	const doc = page(row("<p>:decided[one]</p>", { turnKey: "cache-1" }));
	const rowEl = finishedRows(doc)[0]!;
	const original = rowEl.textContent!;
	assert.equal(convertRowCached(rowEl, original), ":decided[one]");
	// Drawing changes the page text; with the original text the cached markdown is kept.
	rowEl.querySelector("p")!.textContent = "✓ one";
	assert.equal(convertRowCached(rowEl, original), ":decided[one]");
	// An edit or regenerate gives new original text, so it's converted again.
	assert.equal(convertRowCached(rowEl, rowEl.textContent!), "✓ one");
});
