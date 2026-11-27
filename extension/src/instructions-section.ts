// The side panel's Markup instructions section, shown on request and made from the saved settings, so what's copied is what claude.ai draws. While the tags
// have unsaved changes it shows a prompt to save them in place of the text. The text around the tag lines (the frame) is
// locked until unlocked behind a warning; its edits are unsaved changes like the tags', and Copy is off until they're saved.

import { RULES_HEADING, rulesFor, staleMentions, tagLine, type Config, type Frame } from "../../core/src/index.ts";

/** What the section needs from the panel (src/sidepanel.ts). */
export type InstructionsHost = {
	/** The saved settings, or the default when nothing is saved. */
	saved(): { config: Config; frame: Frame };
	defaultFrame: Frame;
	/** The frame as edited, while it differs from the saved one. */
	frameDraft(): Frame | undefined;
	setFrameDraft(frame: Frame | undefined): void;
	tagsUnsaved(): boolean;
	/** Why the unsaved changes can't be saved, or "" when they can. */
	saveProblem(): string;
	/** Saves the unsaved changes; true when saved. */
	save(): Promise<boolean>;
};

/** The markup instructions as copied: the heading, then the frame around one line per tag, as in `rules.md`. */
export function instructionsText(config: Config, frame: Frame): string {
	return `${RULES_HEADING}\n\n${rulesFor(config, frame)}`;
}

const sameFrame = (a: Frame, b: Frame) => a.before === b.before && a.after === b.after;

/** Wires the section in `doc`; `refresh` redraws it after a change elsewhere in the panel, `lock` locks the frame again. */
export function startInstructions(doc: Document, host: InstructionsHost): { refresh(): void; lock(): void } {
	const $ = (id: string) => doc.getElementById(id)!;
	const win = doc.defaultView!;
	let requested = false;
	let unlocked = false;
	let copiedTimer: number | undefined;

	const frame = () => host.frameDraft() ?? host.saved().frame;

	/** Copy is on only when everything is saved; the frame's reset only when it differs from the default. */
	function controls(): void {
		const unsaved = host.tagsUnsaved() || host.frameDraft() !== undefined;
		const copy = $("copy") as HTMLButtonElement;
		copy.disabled = unsaved;
		if (unsaved) $("copied").textContent = "Save your changes to copy.";
		else if ($("copied").textContent === "Save your changes to copy.") $("copied").textContent = "";
		$("differs").hidden = sameFrame(frame(), host.defaultFrame);
		$("unlock-row").hidden = unlocked || !$("warning").hidden;
		$("lock-row").hidden = !unlocked;
	}

	function framePart(key: keyof Frame, label: string): HTMLElement {
		const div = doc.createElement("div");
		div.className = "part frame";
		const head = div.appendChild(doc.createElement("div"));
		head.className = "frame-label";
		if (!unlocked) head.appendChild(($("lock-icon") as HTMLTemplateElement).content.firstElementChild!.cloneNode(true));
		head.append(unlocked ? `${label}, editable` : `${label}, locked`);
		if (unlocked) {
			const ta = div.appendChild(doc.createElement("textarea"));
			ta.value = frame()[key];
			ta.rows = key === "before" ? 7 : 11;
			ta.setAttribute("aria-label", label);
			ta.addEventListener("input", () => {
				const edited = { ...frame(), [key]: ta.value };
				host.setFrameDraft(sameFrame(edited, host.saved().frame) ? undefined : edited);
				controls();
			});
		} else {
			div.append(frame()[key]);
		}
		return div;
	}

	function renderText(): void {
		const { config } = host.saved();
		const heading = doc.createElement("div");
		heading.className = "part heading";
		heading.textContent = RULES_HEADING;
		const stale = new Map(staleMentions(config).map((s) => [s.tag, s.missing]));
		const lines = Object.entries(config.tags).map(([name, style]) => {
			const p = doc.createElement("div");
			p.className = "part tl";
			p.textContent = style.line ? tagLine(name, style.line) : `:${name}[…] has no line.`;
			const missing = stale.get(name);
			if (missing) {
				const e = p.appendChild(doc.createElement("span"));
				e.className = "err";
				e.textContent = `It names ${missing.map((m) => ":" + m).join(" and ")}, which ${missing.length > 1 ? "aren't" : "isn't"} in your tags.`;
			}
			return p;
		});
		$("rules").replaceChildren(heading, framePart("before", "Before the tags"), ...lines, framePart("after", "After the tags"));
	}

	/** The section's state: the button until asked; then the prompt while the tags have unsaved changes, or the text. */
	function refresh(): void {
		$("show-row").hidden = requested;
		const prompt = requested && host.tagsUnsaved();
		$("instructions-unsaved").hidden = !prompt;
		$("instructions").hidden = !requested || prompt;
		if (prompt) {
			const problem = host.saveProblem();
			$("instructions-unsaved-text").textContent = problem
				? `Your tags have unsaved changes that can't be saved yet (${problem}). Fix them or discard them to see the instructions.`
				: "Your tags have unsaved changes. The instructions are made from your saved settings, so save them first, or discard them.";
			($("save-and-show") as HTMLButtonElement).disabled = Boolean(problem);
		}
		if (requested && !prompt) renderText();
		controls();
	}

	$("show-instructions").addEventListener("click", () => {
		requested = true;
		refresh();
	});
	$("save-and-show").addEventListener("click", () => void host.save());

	$("copy").addEventListener("click", () => {
		const say = (t: string) => {
			$("copied").textContent = t;
			win.clearTimeout(copiedTimer);
			copiedTimer = win.setTimeout(() => ($("copied").textContent = ""), 2500);
		};
		const { config, frame: saved } = host.saved();
		win.navigator.clipboard.writeText(instructionsText(config, saved)).then(
			() => say("Copied"),
			() => say("Couldn't copy"),
		);
	});

	// The frame unlocks only after the warning is confirmed; locking keeps the edits, and unlocking again warns again.
	$("unlock").addEventListener("click", () => {
		$("warning").hidden = false;
		controls();
		($("unlock-yes") as HTMLElement).focus();
	});
	$("unlock-no").addEventListener("click", () => {
		$("warning").hidden = true;
		controls();
		($("unlock") as HTMLElement).focus();
	});
	$("unlock-yes").addEventListener("click", () => {
		$("warning").hidden = true;
		unlocked = true;
		refresh();
		$("rules").querySelector("textarea")?.focus();
	});
	$("lock").addEventListener("click", () => {
		unlocked = false;
		refresh();
		($("unlock") as HTMLElement).focus();
	});
	$("reset-frame").addEventListener("click", () => {
		host.setFrameDraft(sameFrame(host.defaultFrame, host.saved().frame) ? undefined : { ...host.defaultFrame });
		unlocked = false;
		refresh();
	});

	refresh();
	return {
		refresh,
		lock() {
			unlocked = false;
			$("warning").hidden = true;
			refresh();
		},
	};
}
