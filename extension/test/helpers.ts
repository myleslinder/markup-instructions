// Shared test helpers: a page on jsdom.

import { readdirSync, readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { ROW } from "../src/rows.ts";

const FIXTURES = new URL("../../fixtures/", import.meta.url);

/** The claude.ai fixture pairs: each has the page HTML (`.html`) and the copy button's markdown (`.md`). */
export const PAIRS = readdirSync(FIXTURES)
	.filter((f) => f.endsWith(".html"))
	.map((f) => f.slice(0, -".html".length));

/** A pair's assistant row, on a fresh page. */
export function pairRow(name: string): Element {
	const row = new JSDOM(readFileSync(new URL(`${name}.html`, FIXTURES), "utf8")).window.document.querySelector(ROW);
	if (!row) throw new Error(`${name}.html has no assistant row`);
	return row;
}

/** A document holding `body`, with claude.ai's mode attribute on a wrapper. */
export function page(body: string, mode = "light"): Document {
	return new JSDOM(`<!doctype html><html><body><div data-mode="${mode}">${body}</div></body></html>`).window.document;
}

/** An assistant row as the unified interface draws one (trimmed from a saved page). */
export function row(reply: string, { streaming = false, turnKey = "c1c20597-hub-reply" } = {}): string {
	return `<div data-cds="AssistantMessage" data-testid="assistant-message" data-turn-key="${turnKey}" data-is-streaming="${streaming}">
<h3 data-find-omitted="" class="sr-only">Claude responded: ${reply.replace(/<[^>]+>/g, "").slice(0, 40)}</h3>
<div><div data-perf-reply-text="" class="standard-markdown">${reply}</div></div>
<div><button type="button" aria-label="Copy"><svg></svg></button><button type="button" aria-label="Retry"></button></div>
</div>`;
}
