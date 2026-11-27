// A config's tags as the mod draws them: each tag's symbol, colour and legend line, the fallback's colour, and inline
// code. The terminal draws the dark colours only; the desktop app's Code tab draws the colours of the app's light or
// dark mode.

import { checkConfig, colourFor, type Config } from "./core.mjs";

export type Mode = "dark" | "light";
export type Surface = "terminal" | "desktop";

/**
 * The backgrounds each surface draws on. The terminal's is the person's own, so these stand in for a dark one and a light
 * one. The desktop app's were read from it with Digital Color Meter.
 */
export const BACKGROUNDS: Record<Surface, { dark: string; light: string }> = {
	terminal: { dark: "#1e1e1e", light: "#ffffff" },
	desktop: { dark: "#191919", light: "#ffffff" },
};

/**
 * How bright an ID or `src` note is next to its label on a dark background: each channel of the tag's colour times this.
 * Claude Code's own dim would draw the note grey, and the note should read as its label's.
 */
export const NOTE_SHADE = 0.6;

/**
 * How much of its label's colour a note keeps on a light background, the rest being the background, as the extension's
 * alpha does on claude.ai. Scaling the channels down, as on dark, would make the note stand out more than its label.
 */
export const LIGHT_NOTE_ALPHA = 0xa0 / 0xff;

/**
 * Inline code. On the terminal, Claude Code's inline-code colour (the theme's `permission`, periwinkle in the dark theme).
 * On the desktop, the app's own look: mono, the text colour, on a chip measured from the app.
 */
const CODE: Record<Surface, Record<Mode, CodeStyle>> = {
	terminal: { dark: { color: "permission" }, light: { color: "permission" } },
	desktop: { dark: { mono: true, backgroundColor: "#2a2a2a" }, light: { mono: true, backgroundColor: "#f2f2f2" } },
};

export type CodeStyle = { color?: string; backgroundColor?: string; mono?: true };

export type Palette = {
	/** The mode the colours are for, and the background they're drawn on. */
	mode: Mode;
	background: string;
	/** The known tags, in the config's order. */
	tags: Record<string, { symbol: string; colour: string; legend: string }>;
	/** Any other tag. */
	fallback: string;
	/** Inline code outside a label. */
	code: CodeStyle;
	/** What's wrong with the config, if anything. A config with problems isn't drawn. */
	problems: string[];
};

/** The config's colours for a surface in a mode; the terminal's dark colours by default. */
export function palette(config: Config, surface: Surface = "terminal", mode: Mode = "dark"): Palette {
	const backgrounds = BACKGROUNDS[surface];
	const tags: Palette["tags"] = {};
	for (const [tag, s] of Object.entries(config.tags)) tags[tag] = { symbol: s.symbol, colour: colourFor(s.colour, mode, backgrounds), legend: s.legend };
	return {
		mode,
		background: backgrounds[mode],
		tags,
		fallback: colourFor(config.fallback, mode, backgrounds),
		code: CODE[surface][mode],
		problems: checkConfig(config),
	};
}

/** A `#rrggbb` colour with each channel scaled by `NOTE_SHADE`. */
export function shade(hex: string): string {
	return mix(hex, "#000000", NOTE_SHADE);
}

/** `hex` laid over `onto` with the given opacity. */
export function mix(hex: string, onto: string, alpha: number): string {
	const channel = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
	const out = [1, 3, 5].map((i) =>
		Math.round(channel(hex, i) * alpha + channel(onto, i) * (1 - alpha))
			.toString(16)
			.padStart(2, "0"),
	);
	return `#${out.join("")}`;
}

/** An ID or `src` note's colour next to a label in `colour`: dimmer than the label on the palette's background. */
export function noteColour(colour: string, p: Palette): string {
	return p.mode === "dark" ? shade(colour) : mix(colour, p.background, LIGHT_NOTE_ALPHA);
}

/** The colour of a piece of drawn text, if it has one, from its tone and whether it's a note (view.ts, `TextStyle`). */
export function colourOf(style: { tone?: string; note?: true }, p: Palette): string | undefined {
	if (!style.tone) return undefined;
	if (style.tone === "code") return p.code.color;
	const colour = p.tags[style.tone]?.colour ?? p.fallback;
	return style.note ? noteColour(colour, p) : colour;
}

/** A known tag's symbol. */
export function symbolOf(tag: string, p: Palette): string {
	return p.tags[tag]?.symbol ?? "";
}
