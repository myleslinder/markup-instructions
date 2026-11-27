import { atom, read, update } from "claude-code";
import type { Register, RenderChildren } from "claude-code";

import type { Mode } from "../types";
import { DEFAULT } from "./config.mjs";
import { parse } from "./core.mjs";
import { draw } from "./draw.mjs";
import { colourOf, palette, symbolOf, type Palette } from "./style";
import type { Inline, TextStyle, View } from "./view";

// The markup mod: draws markup directives in Claude's replies as coloured words.
//
// A reply block with a marker is parsed by the core and drawn by draw.mjs into a plain tree, which this module turns
// into elements, filling in the config's colours and symbols. Anything else, and any error, goes to Claude Code. It draws
// on the terminal and on the desktop app's Code tab; other surfaces get Claude Code's drawing.
//
// On the desktop the colours follow the app's light or dark mode. A hook can't read the mode, so each block drawn there
// carries a small Client (mode-reporter.tsx) that runs in the app, reads it and posts it when it changes; the mod keeps
// it as one value in `$.state`, and every block and the legend drawn from it redraw when it changes.

/**
 * The mod's config: the preset, bundled from presets/default.ts by pnpm build. To draw your own tags, edit the preset
 * and run pnpm build (docs/customizing.md).
 */
const TERMINAL = palette(DEFAULT);
const DESKTOP: Record<Mode, Palette> = { dark: palette(DEFAULT, "desktop", "dark"), light: palette(DEFAULT, "desktop", "light") };
const TAG_NAMES = Object.keys(TERMINAL.tags);

/** The desktop app's mode, as a block's reporter last posted it; dark until the first report. */
const MODE = atom({ plugin: "markup", key: "mode" } as const, "dark" as Mode);
const isMode = (value: unknown): value is Mode => value === "dark" || value === "light";

function textProps(style: TextStyle, p: Palette) {
	const colour = colourOf(style, p);
	return {
		...(colour ? { color: colour } : {}),
		...(style.tone === "code" && p.code.backgroundColor ? { backgroundColor: p.code.backgroundColor } : {}),
		...(style.tone === "code" && p.code.mono ? { mono: true } : {}),
		...(style.bold ? { bold: true } : {}),
		...(style.italic ? { italic: true } : {}),
		...(style.underline ? { underline: true } : {}),
		...(style.strikethrough ? { strikethrough: true } : {}),
		...(style.dim ? { dimColor: true } : {}),
	};
}

/** The /legend pane: opened by the command, holding the keyboard until Esc closes it. */
const LEGEND = {
	id: "legend",
	title: "Markup legend",
	focus: true,
	closeOnEscape: true,
	rows: TAG_NAMES.length + 3 + (TERMINAL.problems.length ? TERMINAL.problems.length + 1 : 0),
} as const;

export const register: Register = (on) => {
	on("session.start", async ($, e, next) => {
		await $.command.register({ name: "legend", description: "Show what each markup symbol and colour means" });
		return next(e);
	});

	// A block's reporter posting the desktop app's mode. Written only when it changes, since every block reports.
	on("ui.message", async ($, e, next) => {
		const mode = (e.data as { mode?: unknown } | null)?.mode;
		if (!e.module.endsWith("mode-reporter.tsx") || !isMode(mode)) return next(e);
		if ((await read($, MODE)) !== mode) await update($, MODE, () => mode);
		return {};
	});

	on("ui.render", { component: "AssistantMessage" }, async ($, e, next) => {
		// A config with problems isn't drawn: replies stay as written, and /legend lists the problems.
		if (e.props.isSummary || TERMINAL.problems.length) return next(e);
		if (e.surface !== "terminal" && e.surface !== "desktop") return next(e);
		let view: View | null;
		try {
			view = draw(parse(e.props.text, { tags: TAG_NAMES }));
		} catch {
			return next(e);
		}
		if (!view) return next(e);

		const desktop = e.surface === "desktop";
		const mode = desktop ? await read($, MODE) : "dark";
		const p = desktop ? DESKTOP[mode] : TERMINAL;
		const { Box, Text, Link, Markdown, Client } = $.ui.resolve(e);
		const inline = (node: Inline): RenderChildren => {
			if (typeof node === "string") return node;
			if (node.type === "Symbol") return symbolOf(node.tag, p);
			if (node.type === "Link") return <Link href={node.href}>{node.children.map(inline)}</Link>;
			return <Text {...textProps(node.style, p)}>{node.children.map(inline)}</Text>;
		};
		const element = (node: View): RenderChildren => {
			switch (node.type) {
				case "Markdown":
					return <Markdown text={node.text} />;
				case "Text":
					return <Text {...textProps(node.style, p)}>{node.children.map(inline)}</Text>;
				case "Box":
					// The desktop centres a row's children down its height, so a list item's bullet would sit halfway down
					// a wrapped or nested item; the terminal tops them.
					return (
						<Box {...node.layout} {...(desktop && node.layout.flexDirection === "row" ? { alignItems: "flex-start" as const } : {})}>
							{node.children.map(element)}
						</Box>
					);
			}
		};

		// The desktop: the app spaces and marks the reply itself, so no bullet or indent; the block's reporter, drawing nothing.
		if (desktop) {
			return (
				<Box flexDirection="column">
					{element(view)}
					<Client key="mode-reporter" module="./mode-reporter.tsx" props={{ mode }} width={0} height={0} />
				</Box>
			);
		}
		// The reply's bullet, as Claude Code draws it: on the block that opens the reply, then two columns of indent.
		return (
			<Box flexDirection="row">
				<Box width={2} flexShrink={0}>
					<Text color="text">{e.props.isFirstOfReply ? "⏺" : " "}</Text>
				</Box>
				<Box flexDirection="column" flexGrow={1} flexShrink={1}>
					{element(view)}
				</Box>
			</Box>
		);
	});

	on("command.run", { command: "legend" }, async ($) => {
		await $.ui.open(LEGEND);
		return {};
	});

	on("ui.render", { component: "Pane", requestId: LEGEND.id }, async ($, e) => {
		const { Box, Text } = $.ui.resolve(e);
		const p = e.surface === "desktop" ? DESKTOP[await read($, MODE)] : TERMINAL;
		return (
			<Box flexDirection="column">
				{p.problems.length ? <Text bold>The config has problems, so replies aren't drawn:</Text> : null}
				{p.problems.map((problem) => (
					<Text>- {problem}</Text>
				))}
				{Object.entries(p.tags).map(([tag, s]) => (
					<Text>
						<Text color={s.colour}>
							{s.symbol} {tag}
						</Text>
						<Text>: {s.legend}</Text>
					</Text>
				))}
				<Text>
					<Text color={p.fallback}>[name]</Text>
					<Text>: any other tag, with its name shown</Text>
				</Text>
				<Text dimColor>Esc to close</Text>
			</Box>
		);
	});
};
