// The side panel's Log section: the dates covered, redraws and guard trips at the top so they're seen without exporting,
// a few totals with the markers per tag, Export (copy or save the log as JSON), the snippets switch, Clear.

import { emptyLog, exported, KEYS, totals, type Log } from "./stats.ts";
import { twoClick } from "./two-click.ts";

/** Fills the Log section of `doc` from `chrome.storage.local` and keeps it up to date while the panel is open. */
export function startLog(doc: Document, version: string): void {
	const $ = (id: string) => doc.getElementById(id)!;
	const win = doc.defaultView!;
	let current: Log = emptyLog(version);

	function show(log: Log): void {
		current = log;
		const t = totals(log);
		$("dates").textContent = log.from ? (log.from === log.to ? log.from : `${log.from} to ${log.to}`) : "Nothing counted yet";
		const health = $("health");
		health.textContent = `Redraws: ${t.redraws} (most for one reply: ${t.maxRedrawsOneReply}) · Guard trips: ${t.guardTrips}`;
		health.toggleAttribute("data-alert", t.guardTrips > 0 || t.errors > 0);
		// Each tag's count under Markers, most used first; tags the config doesn't know as one count.
		const perTag: [string, number, boolean][] = Object.entries(t.tags)
			.filter(([, n]) => n > 0)
			.sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
			.map(([tag, n]) => [tag, n, true]);
		if (t.unknownTags > 0) perTag.push(["Unknown tags", t.unknownTags, true]);
		const rows: [string, number, boolean][] = [
			["Replies seen", t.replies, false],
			["With markers", t.withMarkers, false],
			["Markers", t.markers, false],
			...perTag,
			["Missed markers", t.misses, false],
			["Markers not placed", t.unplaced, false],
			["Errors", t.errors, false],
		];
		$("totals").replaceChildren(
			...rows.map(([label, n, sub]) => {
				const tr = doc.createElement("tr");
				if (sub) tr.className = "sub";
				for (const text of [label, String(n)]) tr.appendChild(doc.createElement("td")).textContent = text;
				return tr;
			}),
		);
	}

	function status(text: string): void {
		$("log-status").textContent = text;
		win.setTimeout(() => ($("log-status").textContent = ""), 2500);
	}

	$("snippets").addEventListener("change", (e) => {
		void chrome.storage.local.set({ [KEYS.snippets]: (e.target as HTMLInputElement).checked });
	});

	$("log-copy").addEventListener("click", () => {
		win.navigator.clipboard.writeText(exported(current)).then(
			() => status("Log copied"),
			() => status("Couldn't copy; try Save as file"),
		);
	});

	$("log-download").addEventListener("click", () => {
		const url = win.URL.createObjectURL(new win.Blob([exported(current)], { type: "application/json" }));
		const a = doc.createElement("a");
		a.href = url;
		a.download = `markup-instructions-log-${new Date().toISOString().slice(0, 10)}.json`;
		a.click();
		win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
	});

	// Clear takes a second click within a few seconds, since it can't be undone.
	twoClick($("log-clear"), "Click again to clear", () => {
		void chrome.storage.local.remove(KEYS.log).then(() => {
			show(emptyLog(version));
			status("Log cleared");
		});
	});

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === "local" && KEYS.log in changes) show((changes[KEYS.log]!.newValue as Log | undefined) ?? emptyLog(version));
	});

	show(current);
	void chrome.storage.local.get([KEYS.log, KEYS.snippets]).then((got) => {
		const log = got[KEYS.log] as Log | undefined;
		show(log?.format === 1 ? log : emptyLog(version));
		($("snippets") as HTMLInputElement).checked = got[KEYS.snippets] !== false;
	});
}
