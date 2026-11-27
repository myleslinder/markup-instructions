import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS } from "../src/index.ts";
import { parseTree } from "../src/parse.ts";
import { parse, as, markers, unplaced } from "./helpers.ts";

const para = (input: string) => as(parse(input)[0], "paragraph");

test("a paragraph with a marker gets runs", () => {
	const block = para('I think :guess[this is **right**]{#A1 src="x.md" .note} for now.');
	assert.equal(block.hasMarkers, true);
	assert.deepEqual(block.runs, [
		{ kind: "text", text: "I think " },
		{
			kind: "marker",
			tag: "guess",
			known: true,
			label: [
				{ kind: "text", text: "this is " },
				{ kind: "strong", runs: [{ kind: "text", text: "right" }] },
			],
			labelText: "this is right",
			id: "A1",
			src: "x.md",
			attrs: { class: "note" },
			source: ':guess[this is **right**]{#A1 src="x.md" .note}',
			start: 8,
			end: 55,
		},
		{ kind: "text", text: " for now." },
	]);
});

test("a bare known tag is flagged and kept as written", () => {
	const block = para("so it gets :guess.");
	assert.equal(block.hasMarkers, false);
	assert.deepEqual(block.runs, [
		{ kind: "text", text: "so it gets " },
		{ kind: "bare", tag: "guess", text: ":guess", start: 11, end: 17 },
		{ kind: "text", text: "." },
	]);
});

test("a bare unknown name stays plain text and joins its neighbours", () => {
	for (const input of ["see :foo here", "see (:todo) here", "ratio :3 here"]) {
		assert.deepEqual(para(input).runs, [{ kind: "text", text: input }], input);
	}
});

test("a family's kind is a known tag under its full name; the rules text's union form is plain text", () => {
	const run = para(":open-ask[it holds]").runs[0]!;
	assert.equal(run.kind === "marker" && run.tag, "open-ask");
	assert.equal(run.kind === "marker" && run.known, true);
	for (const input of ["use :open-(ask|default) here", "stay :guess-(assumed|judged) until"]) {
		assert.ok(
			para(input).runs.every((r) => r.kind === "text"),
			input,
		);
	}
});

test("an empty label is still a marker", () => {
	const block = para(":open[] then");
	assert.equal(block.runs[0]!.kind, "marker");
});

test("an unknown tag with a label is a marker marked unknown", () => {
	const block = para(":todo[ship it]");
	const run = block.runs[0]!;
	assert.equal(run.kind === "marker" && run.known, false);
});

test("backticked syntax stays code", () => {
	const block = para("Use `:open[x]` here.");
	assert.equal(block.hasMarkers, false);
	assert.deepEqual(block.runs[1], { kind: "code", text: ":open[x]" });
});

test("leading blank lines and the trailing gap are kept", () => {
	const input = "\n\nOne.\n\n\n- two\n";
	const blocks = parse(input);
	assert.deepEqual(
		blocks.map((b) => [b.kind, b.source, b.gap]),
		[
			["paragraph", "\n\nOne.", "\n\n\n"],
			["list", "- two", "\n"],
		],
	);
});

test("whitespace-only input is kept as a gap", () => {
	assert.deepEqual(parse(""), []);
	assert.deepEqual(parse("\n\n"), [{ kind: "other", source: "", gap: "\n\n", hasMarkers: false }]);
});

test("a heading gets its depth and runs", () => {
	const block = as(parse("## Plan :open[pick one]")[0], "heading");
	assert.equal(block.depth, 2);
	assert.equal(block.hasMarkers, true);
	assert.equal(block.runs[1]!.kind, "marker");
});

test("a nested list keeps its items' blocks, and a marker deep inside marks the top list", () => {
	const input = "3. one\n4. two\n   - inner :guess[deep]\n   - [x] done\n";
	const list = as(parse(input)[0], "list");
	assert.equal(list.ordered, true);
	assert.equal(list.start, 3);
	assert.equal(list.hasMarkers, true);
	assert.equal(list.items.length, 2);
	const [two, sub] = list.items[1]!.blocks;
	assert.equal(two!.source, "two");
	assert.equal(two!.gap, "\n   ");
	const inner = as(sub, "list");
	assert.equal(inner.ordered, false);
	assert.equal(inner.start, undefined);
	assert.equal(inner.hasMarkers, true);
	assert.equal(inner.items[0]!.checked, undefined);
	assert.equal(inner.items[1]!.checked, true);
	assert.equal(inner.items[1]!.blocks[0]!.source, "done");
	assert.equal(list.items[0]!.blocks[0]!.hasMarkers, false);
});

test("a blockquote holds its blocks", () => {
	const quote = as(parse('> First.\n>\n> Then :checked[it holds]{src="a.md"}.')[0], "blockquote");
	assert.equal(quote.hasMarkers, true);
	assert.deepEqual(
		quote.children.map((b) => [b.kind, b.source, b.gap]),
		[
			["paragraph", "First.", "\n>\n> "],
			["paragraph", 'Then :checked[it holds]{src="a.md"}.', ""],
		],
	);
});

test("a table gets runs per cell, header row first", () => {
	const table = as(parse("| A | B |\n| - | - |\n| x | :open[y] |\n")[0], "table");
	assert.equal(table.hasMarkers, true);
	assert.deepEqual(table.rows[0], [[{ kind: "text", text: "A" }], [{ kind: "text", text: "B" }]]);
	assert.equal(table.rows[1]![1]![0]!.kind, "marker");
});

test("a code block keeps its language and content, and holds no markers", () => {
	const code = as(parse("```ts\n:open[x]\n```")[0], "code");
	assert.equal(code.lang, "ts");
	assert.equal(code.value, ":open[x]");
	assert.equal(code.hasMarkers, false);
});

test("a code block nested in a list item loses its indentation in value, not in source", () => {
	const list = as(parse("- step\n\n  ```\n  run\n  ```\n")[0], "list");
	const code = as(list.items[0]!.blocks[1], "code");
	assert.equal(code.value, "run");
	assert.equal(code.source, "```\n  run\n  ```");
});

test("leaf and container directives stay as their exact source", () => {
	const input = "::note[hi]\n\n:::box\n:open[inside]\n:::";
	const blocks = parse(input);
	assert.deepEqual(
		blocks.map((b) => [b.kind, b.source, b.hasMarkers]),
		[
			["other", "::note[hi]", false],
			["other", ":::box\n:open[inside]\n:::", false],
		],
	);
});

test("an ID written inside the label stays label text", () => {
	const block = para('Then :decided[Signup emails move to "hello@" (S12)].');
	const run = block.runs[1]!;
	assert.equal(run.kind, "marker");
	if (run.kind !== "marker") return;
	assert.equal(run.labelText, 'Signup emails move to "hello@" (S12)');
	assert.equal(run.id, undefined);
});

test("labelText folds soft and hard breaks into single spaces; the label runs keep them", () => {
	for (const input of [":open[one\ntwo]", ":open[one  \n  two]", ":open[one\\\ntwo]", "- :open[one\n  two]"]) {
		const marker = markers(parse(input))[0]!;
		assert.equal(marker.labelText, "one two", JSON.stringify(input));
		assert.ok(
			marker.label.some((run) => run.kind === "break" || (run.kind === "text" && run.text.includes("\n"))),
			JSON.stringify(input),
		);
	}
});

test("src with slashes, dots and spaces is kept whole", () => {
	const block = para(':checked[a]{src="notes/2026-10-14 draft plan.md"} and :checked[b]{#P3g src="9-join"}');
	const markers = block.runs.filter((run) => run.kind === "marker");
	assert.deepEqual(
		markers.map((m) => [m.id, m.src, m.attrs]),
		[
			[undefined, "notes/2026-10-14 draft plan.md", {}],
			["P3g", "9-join", {}],
		],
	);
});

test("other attributes stay in attrs, on unknown tags too", () => {
	const block = para(":todo[ship]{#T1 owner=sam .big}");
	const run = block.runs[0]!;
	assert.equal(run.kind, "marker");
	if (run.kind !== "marker") return;
	assert.equal(run.known, false);
	assert.equal(run.tag, "todo");
	assert.equal(run.id, "T1");
	assert.deepEqual(run.attrs, { owner: "sam", class: "big" });
});

test("a bare known tag inside a label is flagged, and the label still holds it as text", () => {
	const block = para(":open[should this be :guess or not?]");
	const run = block.runs[0]!;
	assert.equal(run.kind, "marker");
	if (run.kind !== "marker") return;
	assert.equal(run.labelText, "should this be :guess or not?");
	assert.deepEqual(run.label[1], { kind: "bare", tag: "guess", text: ":guess", start: 21, end: 27 });
});

test("each bare known tag is flagged, whatever follows it", () => {
	const block = para("would be :guess or go unmarked. I kept it inside the :guess.");
	assert.deepEqual(
		block.runs.filter((run) => run.kind === "bare"),
		[
			{ kind: "bare", tag: "guess", text: ":guess", start: 9, end: 15 },
			{ kind: "bare", tag: "guess", text: ":guess", start: 53, end: 59 },
		],
	);
});

test("a directive straight after a letter, digit or underscore stays prose", () => {
	for (const input of ["at 10:30[x] ok", "x[1:len[a]]", "see word:open[x]", "Status:open", "café:guess[a]", "a_:open[b]"]) {
		const block = para(input);
		assert.equal(block.hasMarkers, false, input);
		assert.deepEqual(block.runs, [{ kind: "text", text: input }], input);
	}
});

test("a directive after punctuation or space is still a marker", () => {
	for (const input of ["(:open[x])", "a :open[x]", "**:open[x]**", "—:open[x]"]) {
		assert.equal(parse(input)[0]!.hasMarkers, true, input);
	}
});

// Underscore emphasis around a marker stays prose under the colon rule, since no real reply has
// used it. If replies start using it, the choice is worth revisiting; the fix here is WORD_CHAR in
// parse.ts, and this test then flips.
test("a directive inside underscore emphasis stays prose, inside asterisks it's a marker", () => {
	for (const input of ["_:open[x]_", "__:open[x]__", "a _:guess[b]_ c"]) {
		assert.equal(parse(input)[0]!.hasMarkers, false, input);
	}
	for (const input of ["*:open[x]*", "**:open[x]**"]) {
		assert.equal(parse(input)[0]!.hasMarkers, true, input);
	}
});

test("a URL containing a colon makes no marker", () => {
	for (const input of [
		"See https://example.com/a:open[x] now.",
		"See <https://x.io/:guess[y]> now.",
		"See http://a.b/c?d=:open[x] now.",
		"mailto:open[x]",
	]) {
		assert.equal(para(input).hasMarkers, false, input);
	}
});

test("a marker at the start of a line is a marker, at the top level, after a soft break and in a list item", () => {
	assert.equal(para(":open[x] at start").runs[0]!.kind, "marker");
	assert.deepEqual(
		para("first line\n:open[x] second").runs.map((run) => run.kind),
		["text", "marker", "text"],
	);
	const item = as(parse("- :open[x] in a list")[0], "list").items[0]!;
	assert.equal(as(item.blocks[0], "paragraph").runs[0]!.kind, "marker");
});

test("a plain ] ends a label, an escaped one stays in it, and balanced brackets stay in it", () => {
	for (const [input, label, after] of [
		[":open[a ] b] end", "a ", " b] end"],
		[":open[a \\] b] end", "a ] b", " end"],
		[":open[a [b] c] end", "a [b] c", " end"],
	] as const) {
		const [marker, rest] = para(input).runs;
		assert.equal(marker!.kind === "marker" && marker.labelText, label, input);
		assert.deepEqual(rest, { kind: "text", text: after }, input);
	}
});

test(":changed[nothing] followed by more text is one marker, and the text and later markers keep going", () => {
	const runs = para(":changed[nothing]; I also looked at :guess[more] here.").runs;
	assert.deepEqual(
		runs.map((run) => (run.kind === "marker" ? `${run.tag}:${run.labelText}` : run.kind === "text" ? run.text : run.kind)),
		["changed:nothing", "; I also looked at ", "guess:more", " here."],
	);
});

test("a code span with an unbalanced bracket inside a label stays code, and the label ends after it", () => {
	for (const [input, code] of [
		[":guess[a `]` b] end", "]"],
		[":guess[a `[` b] end", "["],
		[":open[the `:open[` syntax] end", ":open["],
	] as const) {
		const runs = para(input).runs;
		const marker = runs[0]!;
		assert.equal(marker.kind, "marker", input);
		if (marker.kind !== "marker") continue;
		assert.deepEqual(marker.label[1], { kind: "code", text: code }, input);
		assert.equal(marker.source, input.slice(0, -" end".length), input);
		assert.deepEqual(runs[1], { kind: "text", text: " end" }, input);
	}
});

test("brackets in code spans outside labels are untouched", () => {
	const runs = para("Use `a[0]` and `]` with :open[x].").runs;
	assert.deepEqual(
		runs.filter((run) => run.kind === "code"),
		[
			{ kind: "code", text: "a[0]" },
			{ kind: "code", text: "]" },
		],
	);
});

test("an ID with dots is kept whole, and only its own parts leave the classes", () => {
	const ids = para(":open[a]{#4.2} :open[b]{#v0.20 .big} :open[c]{#Q1 .x}").runs.flatMap((run) =>
		run.kind === "marker" ? [[run.id, run.attrs]] : [],
	);
	assert.deepEqual(ids, [
		["4.2", {}],
		["v0.20", { class: "big" }],
		["Q1", { class: "x" }],
	]);
});

test("input nested past the limit comes back whole, as one skipped block", () => {
	for (const input of [
		"> ".repeat(5000) + "x",
		Array.from({ length: 60 }, (_, i) => "  ".repeat(i) + "- a").join("\n"),
		"- ".repeat(60) + ":open[x]",
	]) {
		assert.deepEqual(parse(input), [{ kind: "other", source: input, gap: "", hasMarkers: false, skipped: "depth" }]);
	}
});

test("input over the size limit comes back whole, as one skipped block", () => {
	const input = ":open[x] ".repeat(LIMITS.chars / 9 + 1);
	assert.deepEqual(parse(input), [{ kind: "other", source: input, gap: "", hasMarkers: false, skipped: "size" }]);
});

test("deep indentation inside fenced code doesn't count toward the limit", () => {
	const input = ":open[x]\n\n```\n" + " ".repeat(200) + "deep\n```\n\n- in a list\n\n  ~~~~\n" + " ".repeat(200) + "deep\n  ~~~~\n";
	const blocks = parse(input);
	assert.equal(blocks[0]!.hasMarkers, true);
	assert.ok(blocks.every((b) => b.skipped === undefined));
});

test("nesting inside the limit still parses", () => {
	const quote = as(parse("> ".repeat(40) + ":open[x]")[0], "blockquote");
	assert.equal(quote.hasMarkers, true);
});

test("a table keeps its column alignment", () => {
	const table = as(parse("| a | b | c | d |\n| :- | :-: | -: | - |\n| 1 | 2 | 3 | 4 |")[0], "table");
	assert.deepEqual(table.align, ["left", "center", "right", null]);
});

test("a list says whether its items have blank lines between them", () => {
	assert.equal(as(parse("- a\n- b")[0], "list").spread, false);
	assert.equal(as(parse("- a\n\n- b")[0], "list").spread, true);
});

test("a marker's and a bare tag's offsets point into the whole input, nested blocks included", () => {
	const input = "Intro.\n\n- one\n  > see :open[x]{#Q1} and :guess.\n";
	const quote = as(as(parse(input)[1], "list").items[0]!.blocks[1], "blockquote");
	const runs = as(quote.children[0], "paragraph").runs;
	for (const run of runs) {
		if (run.kind === "marker") assert.equal(input.slice(run.start, run.end), ":open[x]{#Q1}");
		if (run.kind === "bare") assert.equal(input.slice(run.start, run.end), ":guess");
	}
	assert.equal(runs.filter((run) => run.kind === "marker" || run.kind === "bare").length, 2);
});

test("an input that ends inside a marker is incomplete, and the unfinished directive stays text", () => {
	for (const [input, tail] of [
		["Done :checked[a]. Next :open-ask[pick", ":open-ask[pick"],
		["Next :open-ask[a [b] c", ":open-ask[a [b] c"],
		["Next :open-ask[line one\nline two", ":open-ask[line one\nline two"],
		["Next :open-ask[x]{#Q1 src=", ":open-ask[x]{#Q1 src="],
		["Next :open-ask[x]{", ":open-ask[x]{"],
		["Next :open-ask", ":open-ask"],
		["Next :todo[ship", ":todo[ship"],
		["Next :open-ask[a :guess[b]", ":open-ask[a :guess[b]"],
		["Next :open-ask[a :guess[b", ":open-ask[a :guess[b"],
	] as const) {
		const blocks = parse(input);
		assert.equal(blocks.at(-1)!.incomplete, true, input);
		const last = as(blocks.at(-1), "paragraph").runs.at(-1);
		assert.ok(last?.kind === "text" && last.text.endsWith("Next " + tail), input);
	}
});

test("a directive whose label never closes is a bare tag, not an empty marker", () => {
	const runs = para(":open-ask[pick\n\nMore.").runs;
	assert.deepEqual(runs, [
		{ kind: "bare", tag: "open-ask", text: ":open-ask", start: 0, end: 9 },
		{ kind: "text", text: "[pick" },
	]);
});

test("an earlier closed marker still counts when the input ends inside a later one", () => {
	const [block] = parse("Done :checked[a]. Next :open-ask[pick");
	assert.equal(block!.hasMarkers, true);
});

test("a marker that has closed, or a directive that can't become one, isn't incomplete", () => {
	for (const input of [
		"Next :open[pick]",
		"Next :open[pick] then",
		"Next :open[x]{#Q1}",
		"Next :open then",
		"Next :open.",
		"Next :open ",
		"Next :ope",
		"at 10:30[x",
		"Use `:open[x` here",
		"Next :open[pick\n\nNew paragraph.",
		"Next :open[x]{a} b {c",
	]) {
		assert.ok(
			parse(input).every((b) => b.incomplete === undefined),
			input,
		);
	}
});

test("incomplete goes on the top-level block that holds the unfinished directive", () => {
	for (const input of [
		"Intro.\n\n- a\n- b :open[pick",
		"Intro.\n\n> quote :open[pick\n> ",
		"Intro.\n\n| a |\n| - |\n| :open[x",
		"Intro.\n\n## Heading :open[x",
	]) {
		assert.deepEqual(
			parse(input).map((b) => b.incomplete),
			[undefined, true],
			input,
		);
	}
});

test("a table cell's pipe ends an open label", () => {
	assert.ok(parse("| a |\n| - |\n| :open[x |").every((b) => b.incomplete === undefined));
});

test("a link keeps its URL and its text as runs", () => {
	assert.deepEqual(para("See [the spec](docs/spec.md) now.").runs[1], {
		kind: "link",
		url: "docs/spec.md",
		runs: [{ kind: "text", text: "the spec" }],
	});
});

test("emphasis and strong stay apart, whichever character writes them", () => {
	const kinds = para("*a* **b** _c_ __d__ ~~e~~")
		.runs.filter((run) => run.kind !== "text")
		.map((run) => run.kind);
	assert.deepEqual(kinds, ["emphasis", "strong", "emphasis", "strong", "delete"]);
});

test("hard breaks become break runs, soft breaks stay in the text", () => {
	assert.deepEqual(para("a  \nb\\\nc\nd").runs, [
		{ kind: "text", text: "a" },
		{ kind: "break" },
		{ kind: "text", text: "b" },
		{ kind: "break" },
		{ kind: "text", text: "c\nd" },
	]);
});

test("a marker inside bold, a link or a heading's emphasis marks its block", () => {
	for (const input of ["**:open[x]**", "[see :open[x]](a.md)", "# A *:guess[b]*", "- ~~:changed[c]~~", "> *:checked[d]*"]) {
		assert.equal(parse(input)[0]!.hasMarkers, true, input);
	}
});

test("a marker inside a link keeps the link's URL, and the link sits in the paragraph's runs", () => {
	const [link] = para("[see :open[x]](a.md) after").runs;
	assert.equal(link!.kind, "link");
	if (link!.kind !== "link") return;
	assert.equal(link.url, "a.md");
	assert.equal(link.runs[1]!.kind, "marker");
});

test("HTML blocks and thematic breaks get their own kinds, and no markers", () => {
	const blocks = parse("<div>\n:open[x]\n</div>\n\n---\n\n***\n\n___");
	assert.deepEqual(
		blocks.map((b) => [b.kind, b.hasMarkers]),
		[
			["html", false],
			["thematicBreak", false],
			["thematicBreak", false],
			["thematicBreak", false],
		],
	);
});

test("a setext heading gets its depth, and its source holds the underline", () => {
	const blocks = parse("Title :open[x]\n===\n\nSub\n---\n");
	const [h1, h2] = [as(blocks[0], "heading"), as(blocks[1], "heading")];
	assert.deepEqual([h1.depth, h1.hasMarkers, h1.source], [1, true, "Title :open[x]\n==="]);
	assert.deepEqual([h2.depth, h2.source], [2, "Sub\n---"]);
});

test("CRLF line endings survive in sources and gaps, and offsets still point at markers", () => {
	const input = "Title\r\n===\r\n\r\nOne :guess[a]\r\ntwo.\r\n\r\n- item :open[b]\r\n- next\r\n";
	const blocks = parse(input);
	assert.equal(blocks.map((b) => b.source + b.gap).join(""), input);
	assert.deepEqual(
		blocks.map((b) => b.kind),
		["heading", "paragraph", "list"],
	);
	const runs = [as(blocks[1], "paragraph").runs, as(as(blocks[2], "list").items[0]!.blocks[0], "paragraph").runs].flat();
	const found = runs.filter((run) => run.kind === "marker").map((run) => input.slice(run.start, run.end));
	assert.deepEqual(found, [":guess[a]", ":open[b]"]);
});

test("a nested container's last block keeps its trailing gap", () => {
	const list = as(parse("- a\n\n  > quote\n  >\n\n- b")[0], "list");
	const [para, quote] = list.items[0]!.blocks;
	assert.equal(para!.gap, "\n\n  ");
	assert.equal(quote!.source, "> quote\n  >");
	assert.equal(as(quote, "blockquote").children[0]!.gap, "\n  >");
});

// remark-gfm's autolink transform used to add these URLs as nodes without positions, and parse() threw. The transform is off, so the tokenizer's reading stands.
test("a bare URL, www. address or email after an unclosed [ parses, as text", () => {
	const unclosedLabel = [":changed[x https://claude.ai", "- :guess[see [https://x.io", "| a |\n|---|\n| :open[https://x.io"];
	const other = ["a [see https://x.io b", "see [https://x.io]", "a [see www.x.io b", "a [b user@x.io c", "| a |\n|---|\n| [https://x.io |"];
	for (const input of [...unclosedLabel, ...other]) {
		assert.deepEqual(unplaced(parseTree(input)), [], input);
		const blocks = parse(input);
		assert.equal(blocks.map((b) => b.source + b.gap).join(""), input, input);
		assert.equal(blocks.at(-1)!.incomplete, unclosedLabel.includes(input) || undefined, input);
	}
	assert.deepEqual(para("see [https://x.io]").runs, [{ kind: "text", text: "see [https://x.io]" }]);
});

test("bare URLs, www. addresses and emails elsewhere are still links", () => {
	for (const [input, url] of [
		["see https://x.io now", "https://x.io"],
		["go to www.x.io now", "http://www.x.io"],
		["mail user@x.io now", "mailto:user@x.io"],
		["(see https://x.io)", "https://x.io"],
		["a &amp; https://x.io", "https://x.io"],
		[":checked[see https://x.io]", "https://x.io"],
	] as const) {
		const links = [...JSON.stringify(parse(input)).matchAll(/"kind":"link","url":"([^"]+)"/g)].map((m) => m[1]);
		assert.deepEqual(links, [url], input);
	}
});
