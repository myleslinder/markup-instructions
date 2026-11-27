// The side panel as built, for its tests: the build's page and script run on jsdom, with chrome.storage stubbed.

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JSDOM } from "jsdom";
// @ts-expect-error: a plain .mjs script without types
import { buildExtension } from "../../scripts/build-extension.mjs";

/** The built panel's page and script, built once per test file. */
const built = (async () => {
	const dir = await buildExtension({ outdir: join(mkdtempSync(join(tmpdir(), "mk-ext-")), "dist") });
	return { html: readFileSync(join(dir, "sidepanel.html"), "utf8"), script: readFileSync(join(dir, "sidepanel.js"), "utf8") };
})();

type Store = Record<string, unknown>;

/**
 * The panel with `local` in chrome.storage.local and `sync` in chrome.storage.sync; returns its document, both stores
 * and what was copied.
 */
export async function panel(local: Store = {}, sync: Store = {}) {
	const stores = { local: structuredClone(local), sync: structuredClone(sync) };
	const listeners: ((changes: Record<string, { newValue?: unknown }>, area: string) => void)[] = [];
	const copied: string[] = [];
	const dom = new JSDOM((await built).html, { runScripts: "outside-only" });
	const w = dom.window as unknown as Record<string, unknown> & { eval(s: string): void; navigator: Navigator };
	const area = (store: Store) => ({
		get: async (keys: string | string[]) =>
			Object.fromEntries(
				[keys]
					.flat()
					.filter((k) => k in store)
					.map((k) => [k, structuredClone(store[k])]),
			),
		set: async (items: Store) => void Object.assign(store, structuredClone(items)),
		remove: async (key: string) => void delete store[key],
	});
	w.chrome = {
		runtime: { getManifest: () => ({ name: "Markup Instructions", version: "0.2" }) },
		storage: {
			local: area(stores.local),
			sync: area(stores.sync),
			onChanged: { addListener: (f: (typeof listeners)[number]) => listeners.push(f) },
		},
	};
	Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async (t: string) => void copied.push(t) } });
	w.eval((await built).script);
	await wait(0);
	const doc = dom.window.document;
	return { doc, store: stores.local, sync: stores.sync, copied, listeners, $: (id: string) => doc.getElementById(id)! };
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
