// The stats log: counts per day, kept in the extension's own storage, so you can see how often each tag turns up and
// whether anything failed to draw. Each reply is counted once, by a hash of its turn key and text (a regenerate keeps
// the turn key). No reply or label text is kept, except a short snippet around each missed marker, which can be turned
// off. Pure: the content script loads the log, records into it and saves it.

import type { Block, Run } from "../../core/src/index.ts";
import type { Report } from "./draw.ts";

/** A label longer than this many words counts as a rule slip. Whole-claim labels of 20 to 25 words are intended. */
export const LONG_LABEL_WORDS = 40;
/** Replies remembered as counted. */
export const SEEN = 2000;
/** Snippets kept per day. */
export const SNIPPETS_PER_DAY = 50;

export type Day = {
	/** Replies seen, and how many had any marker. */
	replies: number;
	withMarkers: number;
	/** Markers per known tag. */
	tags: Record<string, number>;
	slips: { unknownTags: number; bareTags: number; inBold: number; longLabels: number };
	health: {
		/** Text that looks like a marker but wasn't drawn (the self-check). */
		misses: number;
		/** Markers the core found that couldn't be placed on the page. */
		unplaced: number;
		/** Replies that couldn't be converted or drawn. */
		errors: number;
		/** Replies past the core's limits, left as the page drew them. */
		pastLimits: number;
		/** Each time the page undid a reply's edits and it was drawn again. */
		redraws: number;
		maxRedrawsOneReply: number;
		/** Replies that fell back to highlights only. */
		guardTrips: number;
	};
	modes: { light: number; dark: number };
	/** Around each miss, if snippets are on. */
	snippets: string[];
};

export type Log = {
	format: 1;
	/** The extension's version at the last write. */
	version: string;
	/** The first and last day with anything counted, `YYYY-MM-DD`. */
	from: string | null;
	to: string | null;
	days: Record<string, Day>;
	/** Hashes of the replies counted, the latest last. */
	seen: string[];
};

/** Where the log and the snippets switch are kept in `chrome.storage.local`. */
export const KEYS = { log: "log", snippets: "snippets" } as const;

export type Event =
	{ kind: "reply"; key: string; report: Report; mode: string | null } | { kind: "redraw"; redraws: number } | { kind: "trip" } | { kind: "error" };

export function emptyLog(version = ""): Log {
	return { format: 1, version, from: null, to: null, days: {}, seen: [] };
}

function emptyDay(): Day {
	return {
		replies: 0,
		withMarkers: 0,
		tags: {},
		slips: { unknownTags: 0, bareTags: 0, inBold: 0, longLabels: 0 },
		health: { misses: 0, unplaced: 0, errors: 0, pastLimits: 0, redraws: 0, maxRedrawsOneReply: 0, guardTrips: 0 },
		modes: { light: 0, dark: 0 },
		snippets: [],
	};
}

/** The local date, `YYYY-MM-DD`. */
export function dayOf(now: Date): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** FNV-1a, 32 bits, as hex: enough to tell replies apart without keeping their keys. */
export function hash(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
	return (h >>> 0).toString(16).padStart(8, "0");
}

/** Per-tag counts and rule slips in a parsed reply. */
export function tally(blocks: Block[]): { tags: Record<string, number>; slips: Day["slips"] } {
	const tags: Record<string, number> = {};
	const slips = { unknownTags: 0, bareTags: 0, inBold: 0, longLabels: 0 };
	const runs = (list: Run[], bold: boolean): void => {
		for (const run of list) {
			if (run.kind === "bare") slips.bareTags++;
			else if (run.kind === "marker") {
				if (!run.known) slips.unknownTags++;
				else tags[run.tag] = (tags[run.tag] ?? 0) + 1;
				if (bold) slips.inBold++;
				if (run.labelText.trim().split(/\s+/).length > LONG_LABEL_WORDS) slips.longLabels++;
			} else if ("runs" in run) runs(run.runs, bold || run.kind === "strong");
		}
	};
	const walk = (list: Block[]): void => {
		for (const b of list) {
			if (b.kind === "paragraph" || b.kind === "heading") runs(b.runs, false);
			else if (b.kind === "list") for (const item of b.items) walk(item.blocks);
			else if (b.kind === "blockquote") walk(b.children);
			else if (b.kind === "table") for (const r of b.rows) for (const cell of r) runs(cell, false);
		}
	};
	walk(blocks);
	return { tags, slips };
}

/** Adds an event to the log. */
export function record(log: Log, ev: Event, { now = new Date(), snippets = true, version = log.version } = {}): void {
	const date = dayOf(now);
	const day = (log.days[date] ??= emptyDay());
	log.version = version;
	log.from = log.from === null || date < log.from ? date : log.from;
	log.to = log.to === null || date > log.to ? date : log.to;
	const h = day.health;
	switch (ev.kind) {
		case "redraw":
			h.redraws++;
			h.maxRedrawsOneReply = Math.max(h.maxRedrawsOneReply, ev.redraws);
			return;
		case "trip":
			h.guardTrips++;
			return;
		case "error":
			h.errors++;
			return;
		case "reply": {
			const id = hash(ev.key);
			if (log.seen.includes(id)) return;
			log.seen.push(id);
			if (log.seen.length > SEEN) log.seen.splice(0, log.seen.length - SEEN);
			const { report } = ev;
			day.replies++;
			if (ev.mode === "light" || ev.mode === "dark") day.modes[ev.mode]++;
			if (report.outcome === "skipped") {
				h.pastLimits++;
				return;
			}
			const { tags, slips } = tally(report.blocks);
			if (Object.keys(tags).length > 0 || slips.unknownTags > 0) day.withMarkers++;
			for (const [tag, n] of Object.entries(tags)) day.tags[tag] = (day.tags[tag] ?? 0) + n;
			for (const k of Object.keys(slips) as (keyof Day["slips"])[]) day.slips[k] += slips[k];
			h.misses += report.misses.length;
			h.unplaced += report.unplaced.length;
			if (snippets) for (const m of report.misses) if (day.snippets.length < SNIPPETS_PER_DAY) day.snippets.push(m.snippet);
			return;
		}
	}
}

/** Totals over every day, for the side panel's log. */
export function totals(log: Log) {
	const t = { replies: 0, withMarkers: 0, markers: 0, misses: 0, unplaced: 0, errors: 0, redraws: 0, maxRedrawsOneReply: 0, guardTrips: 0 };
	/** Markers per known tag, and of tags the config doesn't know. */
	const tags: Record<string, number> = {};
	let unknownTags = 0;
	for (const d of Object.values(log.days)) {
		for (const [tag, n] of Object.entries(d.tags)) tags[tag] = (tags[tag] ?? 0) + n;
		unknownTags += d.slips.unknownTags;
		t.replies += d.replies;
		t.withMarkers += d.withMarkers;
		t.markers += Object.values(d.tags).reduce((a, b) => a + b, 0) + d.slips.unknownTags;
		t.misses += d.health.misses;
		t.unplaced += d.health.unplaced;
		t.errors += d.health.errors;
		t.redraws += d.health.redraws;
		t.maxRedrawsOneReply = Math.max(t.maxRedrawsOneReply, d.health.maxRedrawsOneReply);
		t.guardTrips += d.health.guardTrips;
	}
	return { ...t, tags, unknownTags };
}

/** The log as exported, without the hashes of replies counted, which only stop a reply being counted twice. */
export function exported(log: Log, now = new Date()): string {
	const { seen: _seen, ...rest } = log;
	return JSON.stringify({ exportedAt: now.toISOString(), ...rest }, null, 2);
}
