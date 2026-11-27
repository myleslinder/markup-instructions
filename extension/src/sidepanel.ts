// The settings screen, in Chrome's side panel: the
// header, the Tags section, the Markup instructions section and the Log.
//
// Edits, to the tags or the text around their lines, are kept in the panel until Save, and Discard changes puts back the
// saved settings, so a mistake can be undone. A bar at the bottom shows while there are unsaved changes,
// with Save off until they're valid. Closing the panel loses unsaved changes. Every change applies when claude.ai is
// reloaded, which the panel says after a save.

import { checkConfig, type Frame } from "../../core/src/index.ts";
import type { Defaults } from "./config.ts";
import { startInstructions } from "./instructions-section.ts";
import { startLog } from "./log-section.ts";
import { configFrom, problemCount, rowsFrom, type Rows } from "./panel-tags.ts";
import { loadSettings, resetSettings, saveSettings, type Current } from "./settings.ts";
import { startTags } from "./tags-section.ts";

/** The default settings, read from claude.ai's rules file by the build (scripts/build-extension.mjs). */
declare const DEFAULTS: Defaults;

const $ = (id: string) => document.getElementById(id)!;
const { name, version } = chrome.runtime.getManifest();
document.querySelector("header h1")!.textContent = name;
$("version").textContent = version;
startLog(document, version);

/** The saved settings, or the default when nothing is saved. */
let settings: Current;
/** The rows as edited, while they differ from the saved settings. */
let unsavedRows: Rows | undefined;
/** The frame as edited, while it differs from the saved one. */
let unsavedFrame: Frame | undefined;
let noteTimer: number | undefined;

/** A short note in the header, such as "Saved". */
function note(text: string): void {
	window.clearTimeout(noteTimer);
	$("saved").textContent = text;
	if (text) noteTimer = window.setTimeout(() => ($("saved").textContent = ""), 2000);
}

/** What keeps the unsaved changes from being saved, if anything. */
function saveProblem(): string {
	if (unsavedRows && problemCount(unsavedRows)) return "fix the marked field";
	return checkConfig(unsavedRows ? configFrom(unsavedRows) : settings.config)[0] ?? "";
}

/** The bar at the bottom: shown while there are unsaved changes, with Save on only when they can be saved. */
function saveBar(): void {
	const unsaved = Boolean(unsavedRows || unsavedFrame);
	$("save-bar").hidden = !unsaved;
	const problem = unsaved ? saveProblem() : "";
	const status = $("unsaved");
	status.textContent = problem ? `Not saved: ${problem}` : "Unsaved changes";
	if (problem) status.dataset.state = "error";
	else delete status.dataset.state;
	($("save") as HTMLButtonElement).disabled = Boolean(problem);
}

/** The notice over the tags when the stored settings can't be drawn: unreadable ones can only be reset. */
function storedNotice(current: Current): void {
	const unreadable = current.unreadable;
	$("stored-problems").hidden = current.problems.length === 0;
	$("stored-problems-text").textContent = unreadable
		? "Your saved settings can't be read, so claude.ai is drawing nothing. Reset everything to start again from the default."
		: "Your saved settings have problems, so claude.ai is drawing nothing until they're fixed below.";
	$("stored-problems-list").replaceChildren(
		...current.problems.map((p) => {
			const li = document.createElement("li");
			li.textContent = p;
			return li;
		}),
	);
	for (const id of ["tags", "new-tag", "fallback-h", "fallback", "instructions-section"]) $(id).hidden = unreadable;
}

void loadSettings(DEFAULTS).then((loaded) => {
	settings = loaded;
	storedNotice(settings);

	async function save(): Promise<boolean> {
		if (!(unsavedRows || unsavedFrame) || saveProblem()) return false;
		const config = unsavedRows ? configFrom(unsavedRows) : settings.config;
		const frame = unsavedFrame ?? settings.frame;
		try {
			const left = await saveSettings(config, frame, DEFAULTS);
			if (left.length) throw new Error(left[0]);
		} catch (e) {
			const status = $("unsaved");
			status.textContent = `Not saved: ${e instanceof Error ? e.message : String(e)}`;
			status.dataset.state = "error";
			return false;
		}
		settings = { config, frame, stored: true, unreadable: false, problems: [] };
		unsavedRows = undefined;
		unsavedFrame = undefined;
		saveBar();
		storedNotice(settings);
		instructions.refresh();
		$("reload").hidden = false;
		note("Saved");
		return true;
	}

	const tags = startTags(document, rowsFrom(settings.config), {
		edited(rows) {
			unsavedRows = rows;
			saveBar();
			instructions.refresh();
		},
		async reset() {
			await resetSettings();
			settings = { ...DEFAULTS, stored: false, unreadable: false, problems: [] };
			unsavedRows = undefined;
			unsavedFrame = undefined;
			saveBar();
			storedNotice(settings);
			instructions.lock();
			$("reload").hidden = false;
			note("Reset to the default");
			return rowsFrom(DEFAULTS.config);
		},
	});

	const instructions = startInstructions(document, {
		saved: () => settings,
		defaultFrame: DEFAULTS.frame,
		frameDraft: () => unsavedFrame,
		setFrameDraft(frame) {
			unsavedFrame = frame;
			saveBar();
		},
		tagsUnsaved: () => unsavedRows !== undefined,
		saveProblem,
		save,
	});

	$("save").addEventListener("click", () => void save());

	$("discard").addEventListener("click", () => {
		unsavedRows = undefined;
		unsavedFrame = undefined;
		tags.load(rowsFrom(settings.config));
		saveBar();
		instructions.lock();
		note("Changes discarded");
	});
});
