import { expect, test, type Engine } from "claude-code/testing";

import { DEFAULT } from "../hooks/config.mjs";
import { noteColour, palette, shade } from "../hooks/style";

const { tags, fallback: UNKNOWN } = palette(DEFAULT);
const TAGS = tags as Record<"decided" | "checked" | "open-ask" | "guess", { symbol: string; colour: string }>;

// Reply blocks: a block with a marker is drawn by the mod, on the terminal, and the engine accepts the tree; anything
// else is Claude Code's own. The drawing itself is pinned for every fixture by the Node tests in mod/test/.

type Surface = "terminal" | "desktop" | "vscode" | "mobile";

const mount = ($: Engine, text: string, extra: object = {}, surface: Surface = "terminal") =>
	$.ui.mount({ plugin: "markup", component: "AssistantMessage", surface, props: { text, isFirstOfReply: true, ...extra } });

const exact = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

test("a marker is drawn as its symbol and label in its tag's colour, the syntax hidden, the note shaded", async ($) => {
	const ui = await mount($, "We :decided[ship on Friday]{#D7} and :checked[the bundle loads]{src=\"plan.md\"}, with `code`.");
	const tree = JSON.stringify(await ui.drawn());
	expect(tree).not.toContain(":decided[");
	expect(tree).not.toContain("{#D7}");

	const decided = await ui.find({ type: "Text", text: exact(`${TAGS.decided.symbol} ship on Friday #D7`) });
	expect(decided?.props.color).toBe(TAGS.decided.colour);
	expect((await ui.find({ type: "Text", text: exact(" #D7") }))?.props.color).toBe(shade(TAGS.decided.colour));
	expect((await ui.find({ type: "Text", text: exact(" src: plan.md") }))?.props.color).toBe(shade(TAGS.checked.colour));
	expect((await ui.find({ type: "Text", text: exact("code") }))?.props.color).toBe("permission");
	expect(await ui.find({ type: "Text", text: exact("⏺") })).toBeDefined();
	await ui.unmount();
});

test("markers in a list and a heading are drawn; a block without one goes to Claude Code's Markdown", async ($) => {
	const ui = await mount($, "## Plan :open-ask[pick a name]\n\n- one\n- two :guess[likely fine]\n  - nested\n\nNo markers here.");
	expect((await ui.find({ type: "Text", text: exact(`${TAGS["open-ask"].symbol} pick a name`) }))?.props.color).toBe(TAGS["open-ask"].colour);
	expect((await ui.find({ type: "Text", text: exact(`${TAGS.guess.symbol} likely fine`) }))?.props.color).toBe(TAGS.guess.colour);
	expect(await ui.find({ type: "Text", text: exact("- ") })).toBeDefined();
	expect(await ui.find({ type: "Markdown" })).toMatchObject({ props: { text: "No markers here." } });
	await ui.unmount();
});

test("a code block inside a drawn list goes to Claude Code's Markdown as a fence, so it keeps Claude Code's colours", async ($) => {
	const ui = await mount($, "- :guess[first draft]. To see it:\n  ```\n  ! echo hello\n  ```");
	expect((await ui.find({ type: "Text", text: exact(`${TAGS.guess.symbol} first draft`) }))?.props.color).toBe(TAGS.guess.colour);
	expect(await ui.find({ type: "Markdown" })).toMatchObject({ props: { text: "```\n! echo hello\n```" } });
	await ui.unmount();
});

test("an unknown tag shows its name in the fallback colour before the label", async ($) => {
	const ui = await mount($, "Worth a :flag[second look].");
	expect((await ui.find({ type: "Text", text: exact("[flag] second look") }))?.props.color).toBe(UNKNOWN);
	await ui.unmount();
});

test("Claude Code draws a block with no marker, a summary, a marker still being written, and other surfaces", async ($) => {
	const cases: [string, object, Surface][] = [
		["Plain reply, no markers.", {}, "terminal"],
		["A :open-ask[summary] block.", { isSummary: true }, "terminal"],
		["Still writing :open-ask[half a lab", {}, "terminal"],
		["Plain reply, no markers.", {}, "desktop"],
		["A :open-ask[marker] in VS Code.", {}, "vscode"],
		["A :open-ask[marker] on a phone.", {}, "mobile"],
	];
	for (const [text, extra, surface] of cases) {
		const ui = await mount($, text, extra, surface);
		expect(await ui.drawn()).toMatchObject({ type: "engine" });
		await ui.unmount();
	}
});

test("a finished block is styled while the next is still being written", async ($) => {
	const ui = await mount($, "Done :decided[first part].\n\nStill writing :open-ask[half");
	expect(await ui.find({ type: "Text", text: exact(`${TAGS.decided.symbol} first part`) })).toBeDefined();
	expect(await ui.find({ type: "Markdown" })).toMatchObject({ props: { text: "Still writing :open-ask[half" } });
	await ui.unmount();
});

// The desktop app's Code tab. The test kit has no
// matchMedia, so a block's reporter reads the app's mode as light and posts it: a block is first drawn in the dark
// colours (the mode until a report), then again in the light ones.

const DESKTOP = { dark: palette(DEFAULT, "desktop", "dark"), light: palette(DEFAULT, "desktop", "light") };

test("on desktop a marker is drawn without the bullet, list rows top-aligned, with a reporter that draws nothing", async ($) => {
	const ui = await mount($, "Plan :decided[ship Friday].\n\n- one\n- two :guess[likely]", {}, "desktop");
	const tree = JSON.stringify(await ui.drawn());
	expect(tree).not.toContain(":decided[");
	expect(await ui.find({ type: "Text", text: exact("⏺") })).toBeUndefined();
	expect(tree).toContain(`"flexDirection":"row","alignItems":"flex-start"`);
	expect(await ui.find({ type: "Client", key: "mode-reporter" })).toMatchObject({ props: { width: 0, height: 0 } });
	await ui.unmount();
});

test("on desktop the reporter's mode reaches the state, and the block redraws in that mode's colours, notes and code", async ($) => {
	const ui = await mount($, "We :decided[ship Friday]{#D7}, with `code`.", {}, "desktop");
	const light = DESKTOP.light.tags.decided!.colour;
	const label = await ui.find({ type: "Text", text: exact(`${TAGS.decided.symbol} ship Friday #D7`) });
	expect(label?.props.color).toBe(light);
	expect(light).not.toBe(DESKTOP.dark.tags.decided!.colour);
	expect((await ui.find({ type: "Text", text: exact(" #D7") }))?.props.color).toBe(noteColour(light, DESKTOP.light));
	expect(await ui.find({ type: "Text", text: exact("code") })).toMatchObject({ props: { mono: true, backgroundColor: DESKTOP.light.code.backgroundColor } });
	expect((await ui.find({ type: "Text", text: exact("code") }))?.props.color).toBeUndefined();
	expect(await ui.find({ type: "Client", key: "mode-reporter" })).toMatchObject({ props: { props: { mode: "light" } } });
	await ui.unmount();
});
