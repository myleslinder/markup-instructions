// The rules generator: a rules text read into a frame and tag lines as fields, and written back.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
	checkConfig,
	checkLine,
	mentions,
	readRules,
	rulesFor,
	rulesInFile,
	staleMentions,
	tagLine,
	withLines,
	writeRules,
	type Config,
	type TagLine,
} from "../src/index.ts";

const text = [
	"Mark key items.",
	":todo[…] something to do later.",
	':cite[claim]{src="doc or file"} checked against a source; see :todo.',
	"Only in replies.",
	"Never in files.",
].join("\n");

const config = (lines?: Record<string, TagLine>): Config => ({
	tags: {
		todo: { symbol: "•", colour: "#a99bff", legend: "to do", ...(lines?.todo && { line: lines.todo }) },
		cite: { symbol: "⌕", colour: "#f5b942", legend: "cited", ...(lines?.cite && { line: lines.cite }) },
	},
	fallback: "#d9b88c",
});

test("a rules text reads into its frame and tag lines, each as fields", () => {
	assert.deepEqual(readRules(text), {
		frame: { before: "Mark key items.", after: "Only in replies.\nNever in files." },
		tags: [
			{ name: "todo", line: { brackets: "…", purpose: "something to do later." } },
			{
				name: "cite",
				line: { brackets: "claim", attribute: { name: "src", example: "doc or file" }, purpose: "checked against a source; see :todo." },
			},
		],
	});
});

test("a rules text read and written comes back exactly", () => {
	assert.equal(writeRules(readRules(text)), text);
});

test("a tag's line is built from its name and fields", () => {
	assert.equal(tagLine("todo", { brackets: "…", purpose: "later." }), ":todo[…] later.");
	assert.equal(tagLine("cite", { brackets: "", attribute: { name: "src", example: "x" }, purpose: "p" }), ':cite[]{src="x"} p');
});

test("a renamed tag's line follows the name", () => {
	const rules = readRules(text);
	const renamed = { ...rules, tags: rules.tags.map((t) => (t.name === "cite" ? { ...t, name: "source" } : t)) };
	assert.match(writeRules(renamed), /^:source\[claim\]\{src="doc or file"\} checked/m);
});

test("a rules text that can't be read is an error, not a guess", () => {
	assert.throws(() => readRules("No tags here.\nAt all."), /no tag lines/);
	assert.throws(() => readRules("Before.\n:a[…] one.\nMiddle.\n:b[…] two.\nAfter."), /aren't all together/);
	assert.throws(() => readRules(":a[…] one.\nAfter."), /before and after/);
	assert.throws(() => readRules("Before.\n:a[…] one."), /before and after/);
	assert.throws(() => readRules("Before.\n:a[…]no space.\nAfter."), /Can't read this as a tag line/);
	assert.throws(() => readRules("Before.\n:a[…]{src=x} unquoted.\nAfter."), /Can't read this as a tag line/);
	assert.throws(() => readRules("Before.\n:-a[…] bad name.\nAfter."), /Can't read this as a tag line/);
	assert.throws(() => readRules("Before.\n:a[…] one.\n:a[…] two.\nAfter."), /two lines for a/);
});

test("a rules file's text is what follows its heading", () => {
	assert.equal(rulesInFile("\n## Response markup\n\nThe text.\nMore.\n"), "The text.\nMore.");
	assert.throws(() => rulesInFile("The text."), /starts with/);
});

test("a config takes each tag's line from a rules text with the same tags in the same order", () => {
	const rules = readRules(text);
	const joined = withLines(config(), rules);
	assert.deepEqual(joined.tags.cite!.line, rules.tags[1]!.line);
	assert.equal(joined.tags.cite!.colour, "#f5b942");
	assert.equal(rulesFor(joined, rules.frame), text);
	assert.throws(() => withLines(config(), { ...rules, tags: [...rules.tags].reverse() }), /aren't the rules text's/);
	assert.throws(() => withLines(config(), { ...rules, tags: rules.tags.slice(0, 1) }), /aren't the rules text's/);
});

test("a config's rules text needs a line for every tag", () => {
	assert.throws(() => rulesFor(config(), { before: "a", after: "b" }), /todo has no line/);
});

test("mentions: :name, and :name(a|b) as both kinds, but not a time or a URL", () => {
	assert.deepEqual(mentions("stay :guess until; use :open-(ask|default) if"), ["guess", "open-ask", "open-default"]);
	assert.deepEqual(mentions(":changed[nothing] is for the whole turn"), ["changed"]);
	assert.deepEqual(mentions("at 10:30, see https://x.test or a:b"), []);
});

test("the flag: a line that mentions a tag no longer in the config", () => {
	const lines = { todo: { brackets: "…", purpose: "later; not :cite or :gone." }, cite: { brackets: "…", purpose: "see :todo and :cite." } };
	assert.deepEqual(staleMentions(config(lines)), [{ tag: "todo", missing: ["gone"] }]);
	const { cite: _, ...rest } = config(lines).tags;
	assert.deepEqual(staleMentions({ ...config(), tags: rest }), [{ tag: "todo", missing: ["cite", "gone"] }]);
});

test("a tag's line with a field that can't be written as one line and read back is a problem", () => {
	assert.deepEqual(checkLine({ brackets: "…", purpose: "fine." }), []);
	assert.deepEqual(checkLine({ brackets: "…", purpose: " " }), [
		"no text for what the tag is for",
		"what the tag is for starts or ends with a space",
	]);
	assert.deepEqual(checkLine({ brackets: "…", purpose: "two\nparagraphs" }), ["what the tag is for is more than one paragraph"]);
	assert.deepEqual(checkLine({ brackets: "a]b", purpose: "p" }), ["what goes in the brackets holds ] or a line break"]);
	assert.deepEqual(checkLine({ brackets: "…", attribute: { name: "-x", example: 'a"b' }, purpose: "p" }), [
		"attribute \"-x\" can't be an attribute's name",
		"the attribute's example holds a double quote or a line break",
	]);
	assert.deepEqual(checkConfig(config({ todo: { brackets: "…", purpose: "" }, cite: { brackets: "…", purpose: "p" } })), [
		"todo: no text for what the tag is for",
	]);
});

test("every line checkLine passes reads back as written", () => {
	const lines: TagLine[] = [
		{ brackets: "", purpose: "p" },
		{ brackets: "verb …", purpose: "with :other and [brackets] and {braces}." },
		{ brackets: "claim", attribute: { name: "src", example: "" }, purpose: 'a "quoted" word.' },
	];
	for (const line of lines) {
		assert.deepEqual(checkLine(line), []);
		const rules = { frame: { before: "a", after: "b" }, tags: [{ name: "t", line }] };
		assert.deepEqual(readRules(writeRules(rules)), rules);
	}
});
