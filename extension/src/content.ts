// The content script: runs on claude.ai in the extension's isolated world.
// A MutationObserver gathers changes; each pass draws the finished rows that are new or changed, and registers every
// drawn row's highlights. An error in a row leaves it as the page drew it.

import type { Defaults } from "./config.ts";
import { drawRow, newState, type Report, type RowState } from "./draw.ts";
import { addHighlightStyles, highlightCss, palette, usePalette } from "./palette.ts";
import { finishedRows, turnKey } from "./rows.ts";
import { loadSettings } from "./settings.ts";
import { emptyLog, KEYS, record, type Event, type Log } from "./stats.ts";

/** The default settings, read from claude.ai's rules file by the build (scripts/build-extension.mjs). */
declare const DEFAULTS: Defaults;

const version = chrome.runtime.getManifest().version;

/** Each row seen, with its state. Rows the page removed are dropped on the next pass. */
const rows = new Map<Element, RowState>();

/** Events not yet saved to the stats log. Saved a couple of seconds after the last, in one write. */
const pending: { ev: Event; at: Date }[] = [];
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function log(ev: Event): void {
	pending.push({ ev, at: new Date() });
	clearTimeout(saveTimer);
	saveTimer = setTimeout(save, 2000);
}

async function save(): Promise<void> {
	const events = pending.splice(0);
	if (events.length === 0) return;
	const got = await chrome.storage.local.get([KEYS.log, KEYS.snippets]);
	const stored = got[KEYS.log] as Log | undefined;
	const saved: Log = stored?.format === 1 ? stored : emptyLog(version);
	const snippets = got[KEYS.snippets] !== false;
	for (const { ev, at } of events) record(saved, ev, { now: at, snippets, version });
	await chrome.storage.local.set({ [KEYS.log]: saved });
}
addEventListener("pagehide", () => void save());

const mode = () => document.querySelector("[data-mode]")?.getAttribute("data-mode") ?? null;

function tally(row: Element, report: Report, st: RowState): void {
	switch (report.outcome) {
		case "drawn":
		case "skipped":
			// A regenerate reuses the row and its turn key, so a reply is told apart by its text too. A row with no
			// reply text yet (as a regenerate starts) isn't a reply.
			if (report.outcome === "drawn" && report.blocks.length === 0) break;
			log({ kind: "reply", key: `${turnKey(row) ?? ""}\n${st.text ?? ""}`, report, mode: mode() });
			break;
		case "redrawn":
			log({ kind: "redraw", redraws: st.redraws });
			break;
		case "tripped":
			log({ kind: "redraw", redraws: st.redraws });
			log({ kind: "trip" });
			console.warn(`[markup instructions] the page undid a reply's edits ${st.redraws} times; highlights only for it from now on`);
			break;
	}
}

/** Sets every drawn row's ranges as the page's highlights, one per name. Names no row uses any more are removed. */
function registerHighlights(): void {
	const byName = new Map<string, Range[]>();
	for (const [row, st] of rows) {
		if (!row.isConnected) {
			rows.delete(row);
			continue;
		}
		for (const { name, range } of st.marks) byName.set(name, [...(byName.get(name) ?? []), range]);
	}
	for (const name of [...CSS.highlights.keys()]) if (name.startsWith("mk-") && !byName.has(name)) CSS.highlights.delete(name);
	for (const [name, ranges] of byName) CSS.highlights.set(name, new Highlight(...ranges));
}

function pass(): void {
	for (const row of finishedRows(document)) {
		let st = rows.get(row);
		if (!st) rows.set(row, (st = newState()));
		try {
			tally(row, drawRow(row, st), st);
		} catch (e) {
			log({ kind: "error" });
			console.error("[markup instructions] a reply couldn't be drawn and is left as the page drew it", e);
			rows.set(row, { ...newState(), text: row.textContent });
		}
	}
	registerHighlights();
}

let timer: ReturnType<typeof setTimeout> | undefined;
function schedule(): void {
	clearTimeout(timer);
	timer = setTimeout(run, 150);
}

const observer = new MutationObserver(schedule);
const OPTIONS: MutationObserverInit = {
	childList: true,
	subtree: true,
	characterData: true,
	attributes: true,
	attributeFilter: ["data-is-streaming"],
};

function run(): void {
	pass();
	// Our own text writes aren't changes to draw.
	observer.takeRecords();
}

// The settings are read before the first pass, so a reply is never drawn in the default's colours and then the person's.
// They apply until the page is reloaded. A config with problems isn't drawn: replies stay as claude.ai drew them.
async function start(): Promise<void> {
	const settings = await loadSettings(DEFAULTS);
	const pal = palette(settings.config);
	const problems = [...settings.problems, ...pal.problems.filter((p) => !settings.problems.includes(p))];
	if (problems.length) {
		console.warn(`[markup instructions] the settings have problems, so replies aren't drawn:\n${problems.join("\n")}`);
		return;
	}
	usePalette(pal);
	addHighlightStyles(document, highlightCss(pal));
	observer.observe(document.documentElement, OPTIONS);
	schedule();
}
void start().catch((e) => console.error("[markup instructions] the settings couldn't be read, so replies aren't drawn", e));
