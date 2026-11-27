// The built content script on a saved claude.ai row in jsdom: it draws a finished row, leaves a streaming one alone,
// registers the highlights, and draws again when the page undoes its edits. jsdom can't paint highlights, so the
// registry is checked as data.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { JSDOM } from "jsdom";
// @ts-expect-error: a plain .mjs script without types
import { buildExtension } from "../../scripts/build-extension.mjs";
import { PALETTE } from "../src/palette.ts";
import { PAIRS, row } from "./helpers.ts";

let script = "";
let manifest: { content_scripts: { css?: string[] }[] } = { content_scripts: [] };
before(async () => {
	const dir = await buildExtension({ outdir: join(mkdtempSync(join(tmpdir(), "mk-ext-")), "dist") });
	script = readFileSync(join(dir, "content.js"), "utf8");
	manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
});

/** A page with the content script running on it, and its highlight registry. `html` is a whole page or a body; `settings` is what's stored in `chrome.storage.sync`, if anything. */
function load(html: string, settings?: unknown) {
	const page = html.startsWith("<!") ? html : `<!doctype html><html><body><div data-mode="light">${html}</div></body></html>`;
	const dom = new JSDOM(page, { runScripts: "outside-only" });
	const w = dom.window as unknown as Record<string, unknown> & { eval(s: string): void; console: Console };
	const highlights = new Map<string, { ranges: Range[] }>();
	w.CSS = { highlights };
	w.Highlight = class {
		ranges: Range[];
		constructor(...ranges: Range[]) {
			this.ranges = ranges;
		}
	};
	const area = (store: Record<string, unknown>) => ({
		get: async (keys: string | string[]) =>
			Object.fromEntries(
				[keys]
					.flat()
					.filter((k) => k in store)
					.map((k) => [k, structuredClone(store[k])]),
			),
		set: async (items: Record<string, unknown>) => void Object.assign(store, structuredClone(items)),
	});
	const storage: Record<string, unknown> = {};
	const sync: Record<string, unknown> = settings === undefined ? {} : { settings: structuredClone(settings) };
	w.chrome = {
		runtime: { getManifest: () => ({ version: "0.0.0" }) },
		storage: { local: area(storage), sync: area(sync) },
	};
	const logged: string[] = [];
	w.console.warn = (m: string) => logged.push(m);
	w.console.error = (m: string) => logged.push(m);
	w.eval(script);
	return { doc: dom.window.document, highlights, logged, storage, sync, close: () => dom.window.close() };
}

/** The highlight rules the content script added to the page, as a constructed stylesheet or a `<style>`. */
function addedCss(doc: Document): string {
	const adopted = doc.adoptedStyleSheets?.flatMap((sheet) => [...sheet.cssRules].map((r) => r.cssText)).join("\n") ?? "";
	return adopted || (doc.querySelector("style[data-response-markup]")?.textContent ?? "");
}

const settle = () => sleep(250);
const texts = (h: Map<string, { ranges: Range[] }>, name: string) => h.get(name)?.ranges.map((r) => r.toString());

test("a finished row is drawn and its highlights registered; a streaming one is left alone", async () => {
	const { doc, highlights } = load(
		row("<p>Yes :decided[one]{#D1} and :open-ask[two]?</p>", { turnKey: "a" }) + row("<p>Still :guess[going</p>", { streaming: true, turnKey: "b" }),
	);
	await settle();
	const [done, streaming] = [...doc.querySelectorAll("[data-testid=assistant-message] p")];
	assert.equal(done!.textContent, "Yes ✓ one #D1 and ¿ two?");
	assert.equal(streaming!.textContent, "Still :guess[going");
	assert.deepEqual(texts(highlights, "mk-t-decided"), ["✓", "one"]);
	assert.deepEqual(texts(highlights, "mk-n-decided"), ["#D1"]);
	assert.deepEqual(texts(highlights, "mk-t-open-ask"), ["¿", "two"]);
});

test("a row that finishes streaming is drawn then", async () => {
	const { doc } = load(row("<p>:decided[later]</p>", { streaming: true }));
	await settle();
	const r = doc.querySelector("[data-testid=assistant-message]")!;
	assert.equal(r.querySelector("p")!.textContent, ":decided[later]");
	r.setAttribute("data-is-streaming", "false");
	await settle();
	assert.equal(r.querySelector("p")!.textContent, "✓ later");
});

test("new text the page writes into a drawn row is drawn", async () => {
	const { doc, highlights } = load(row("<p>A :decided[one] b</p>"));
	await settle();
	const p = doc.querySelector("p")!;
	p.firstChild!.nodeValue = "A :changed[two] b";
	await settle();
	assert.equal(p.textContent, "A ✎ two b");
	assert.deepEqual(texts(highlights, "mk-t-changed"), ["✎", "two"]);
	assert.equal(highlights.has("mk-t-decided"), false, "a name no row uses any more is removed");
});

test("a row removed from the page takes its highlights with it", async () => {
	const { doc, highlights } = load(row("<p>:decided[one]</p>"));
	await settle();
	doc.querySelector("[data-testid=assistant-message]")!.remove();
	doc.body.append(doc.createElement("div"));
	await settle();
	assert.equal(highlights.size, 0);
});

test("the build has no stylesheet: the highlight rules come from the settings", () => {
	assert.ok(manifest.content_scripts.every((script) => !script.css));
});

test("the highlight rules added at startup have every tag's and the fallback's, light and dark, and the dimmed syntax", async () => {
	const { doc, close } = load(row("<p>:decided[one]</p>"));
	await settle();
	const css = addedCss(doc);
	const names = [...Object.keys(PALETTE.tags).flatMap((tag) => [`mk-t-${tag}`, `mk-n-${tag}`]), "mk-fallback", "mk-fallback-note"];
	for (const name of names) {
		assert.match(css, new RegExp(`^::highlight\\(${name}\\) \\{`, "m"));
		assert.match(css, new RegExp(`^\\[data-mode="dark"\\] ::highlight\\(${name}\\) \\{`, "m"));
	}
	assert.match(css, /::highlight\(mk-syntax\)/);
	close();
});

const custom = {
	format: 1,
	config: {
		tags: { todo: { symbol: "☐", colour: { dark: "#66ccff", light: "#005a8c" }, legend: "to do", line: { brackets: "…", purpose: "later." } } },
		fallback: { dark: "#cccccc", light: "#555555" },
	},
};

test("stored settings are drawn: their tags with their symbols and colours, and any other tag through the fallback", async () => {
	const { doc, highlights, logged, close } = load(row("<p>:todo[ship it] and :decided[one]</p>"), custom);
	await settle();
	assert.equal(doc.querySelector("p")!.textContent, "☐ ship it and [decided] one");
	assert.deepEqual(texts(highlights, "mk-t-todo"), ["☐", "ship it"]);
	assert.deepEqual(texts(highlights, "mk-fallback"), ["[decided]", "one"]);
	const added = addedCss(doc);
	// jsdom writes colours back as rgb(): #005a8c and #66ccff.
	assert.match(added, /^::highlight\(mk-t-todo\) \{ color: rgb\(0, 90, 140\); \}$/m);
	assert.match(added, /^\[data-mode="dark"\] ::highlight\(mk-t-todo\) \{ color: rgb\(102, 204, 255\); \}$/m);
	assert.doesNotMatch(added, /mk-t-decided/);
	assert.deepEqual(logged, []);
	close();
});

for (const [what, settings] of [
	["a config with problems", { ...custom, config: { ...custom.config, tags: { "bad name!": custom.config.tags.todo } } }],
	["an unknown format", { ...custom, format: 2 }],
	["something that isn't settings", "not settings"],
] as const) {
	test(`stored settings with ${what} aren't drawn, and are left as stored`, async () => {
		const { doc, logged, sync, close } = load(row("<p>:decided[one]</p>"), settings);
		await settle();
		assert.equal(doc.querySelector("p")!.textContent, ":decided[one]");
		assert.equal(addedCss(doc), "");
		assert.equal(logged.length, 1);
		assert.match(logged[0]!, /the settings have problems, so replies aren't drawn/);
		assert.deepEqual(sync.settings, settings);
		close();
	});
}

for (const name of PAIRS) {
	test(`${name}: the built script draws every marker, with no errors`, async () => {
		const { doc, highlights, logged } = load(readFileSync(new URL(`../../fixtures/${name}.html`, import.meta.url), "utf8"));
		await settle();
		const symbols = [...highlights.entries()]
			.filter(([n]) => !n.endsWith("-note"))
			.flatMap(([, h]) => h.ranges)
			.filter((r) => /^(?:[¿～✓✎⌕]|\[[\w-]+\])$/.test(r.toString()));
		const expected = { "renderer-4": 10, "renderer-5": 6, "renderer-6": 3, "renderer-7": 4, "test-1": 20, "test-2": 7, "test-3": 10, "test-5": 8 }[
			name
		];
		assert.equal(symbols.length, expected);
		assert.deepEqual(logged, []);
		assert.ok(doc.querySelector("[data-testid=assistant-message]"));
	});
}

test("the stats log is saved a couple of seconds after drawing, with the reply counted once", async () => {
	const { storage, close } = load(row("<p>:decided[one] and :open-ask[two]</p>"));
	await sleep(2400);
	const log = storage.log as { days: Record<string, { replies: number; tags: Record<string, number>; modes: { light: number } }> };
	const day = Object.values(log.days)[0]!;
	assert.deepEqual([day.replies, day.tags, day.modes.light], [1, { decided: 1, "open-ask": 1 }, 1]);
	close();
});

test("a regenerate in the same row is counted as a second reply, not a redraw; an empty row in between isn't counted", async () => {
	const { doc, storage, close } = load(row("<p>:decided[one]</p>"));
	await settle();
	const r = doc.querySelector("[data-testid=assistant-message]")!;
	const md = r.querySelector(".standard-markdown")!;
	// As a regenerate starts: the reply text goes, then streams back in, then finishes.
	md.replaceChildren();
	await settle();
	r.setAttribute("data-is-streaming", "true");
	md.innerHTML = "<p>:checked[two] and :guess[three]</p>";
	await settle();
	r.setAttribute("data-is-streaming", "false");
	await sleep(2400);
	const log = storage.log as { days: Record<string, { replies: number; tags: Record<string, number>; health: { redraws: number } }> };
	const day = Object.values(log.days)[0]!;
	assert.deepEqual([day.replies, day.health.redraws, day.tags], [2, 0, { decided: 1, checked: 1, guess: 1 }]);
	assert.equal(md.textContent, "⌕ two and ～ three");
	close();
});
