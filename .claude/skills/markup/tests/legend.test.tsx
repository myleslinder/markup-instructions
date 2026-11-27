import { expect, test } from "claude-code/testing";

import { DEFAULT } from "../hooks/config.mjs";
import { palette } from "../hooks/style";

const { tags: TAGS, fallback: UNKNOWN } = palette(DEFAULT);

// /legend: the command opens a pane that takes the keyboard and closes on Esc, listing each tag in its colour.

const PANE = {
	plugin: "markup",
	component: "Pane",
	requestId: "legend",
	props: { title: "Markup legend", isFocused: true, bodyColumns: 80, placement: "inline", scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const;

test("/legend opens a focused pane that Esc closes, and prints nothing in the transcript", async ($, on) => {
	const opened: unknown[] = [];
	on("ui.open", (_, e) => {
		opened.push(e);
		return { value: { isPlaced: true } };
	});
	const out = await $.command.run({
		command: "legend",
		args: "",
		origin: { kind: "composer" },
		presentation: { isFullscreen: false, columns: 100 },
	});
	expect(opened).toHaveLength(1);
	expect(opened[0]).toMatchObject({ id: "legend", focus: true, closeOnEscape: true });
	expect(out.text).toBeUndefined();
});

test("the legend pane shows each symbol and tag in its colour, the unknown tag's colour, and how to close it", async ($) => {
	// The terminal, and the desktop before any reply has reported the app's mode: the dark colours.
	for (const surface of ["terminal", "desktop"] as const) {
		const ui = await $.ui.mount({ ...PANE, surface });
		for (const [tag, s] of Object.entries(TAGS)) {
			const label = await ui.find({ type: "Text", text: new RegExp(`^${s.symbol} ${tag}$`) });
			expect(label?.props?.color).toBe(s.colour);
			expect(await ui.find({ type: "Text", text: `: ${s.legend}` })).toBeDefined();
		}
		expect((await ui.find({ type: "Text", text: /^\[name\]$/ }))?.props?.color).toBe(UNKNOWN);
		expect(await ui.find({ type: "Text", text: /^Esc to close$/ })).toBeDefined();
		await ui.unmount();
	}
});

test("on desktop the legend draws in the colours of the mode a reply reported", async ($) => {
	// The test kit has no matchMedia, so a reply's reporter posts light.
	const reply = await $.ui.mount({ plugin: "markup", component: "AssistantMessage", surface: "desktop", props: { text: "A :guess[marker].", isFirstOfReply: true } });
	await reply.drawn();
	const light = palette(DEFAULT, "desktop", "light");
	const ui = await $.ui.mount({ ...PANE, surface: "desktop" });
	for (const [tag, s] of Object.entries(light.tags)) {
		expect((await ui.find({ type: "Text", text: new RegExp(`^${s.symbol} ${tag}$`) }))?.props?.color).toBe(s.colour);
	}
	expect((await ui.find({ type: "Text", text: /^\[name\]$/ }))?.props?.color).toBe(light.fallback);
	await ui.unmount();
	await reply.unmount();
});
