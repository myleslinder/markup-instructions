// A config's tags as the extension draws them on claude.ai: each tag's symbol and its colour in each theme, the highlight names, and the
// stylesheet's `::highlight()` rules, which the build writes from the config. How the extension draws (the note's alpha,
// the dimmed syntax) is here; the vocabulary is the config's.

import { checkConfig, colourFor, type Colour, type Config, type MarkerRun } from "../../core/src/index.ts";
import { BACKGROUNDS, CONFIG } from "./config.ts";

type Shades = { light: string; dark: string };

export type Palette = {
	/** The known tags, in the config's order. */
	tags: Record<string, { symbol: string } & Shades>;
	/** Any other tag. */
	fallback: Shades;
	/** What's wrong with the config, if anything. A config with problems isn't drawn. */
	problems: string[];
};

export function palette(config: Config): Palette {
	const shades = (c: Colour): Shades => ({ light: colourFor(c, "light", BACKGROUNDS), dark: colourFor(c, "dark", BACKGROUNDS) });
	const tags: Palette["tags"] = {};
	for (const [tag, s] of Object.entries(config.tags)) tags[tag] = { symbol: s.symbol, ...shades(s.colour) };
	return { tags, fallback: shades(config.fallback), problems: checkConfig(config) };
}

/**
 * The palette the page is drawn with: the extension's config until the content script sets the person's, once, at
 * startup. Settings apply when claude.ai is reloaded, so it never changes while a page is open.
 */
export let PALETTE = palette(CONFIG);

/** The known tags' names, for `parse()`. */
export let KNOWN_TAGS = Object.keys(PALETTE.tags);

/** Sets the palette the page is drawn with. Called once, before the first pass. */
export function usePalette(p: Palette): void {
	PALETTE = p;
	KNOWN_TAGS = Object.keys(p.tags);
}

/** What a marker is drawn by: its tag, if known, or the fallback. */
type Drawn = Pick<MarkerRun, "tag" | "known">;
const isKnown = (m: Drawn, p: Palette) => m.known && Object.hasOwn(p.tags, m.tag);

// Highlight names: `mk-t-` and `mk-n-` before a tag's name for its label and its note, so no tag's name can land on
// another highlight (a tag called `open-note` on `open`'s notes, or `syntax` on the dimmed syntax).

/** The highlight for a marker's symbol and label. */
export function labelName(m: Drawn, p: Palette = PALETTE): string {
	return isKnown(m, p) ? `mk-t-${m.tag}` : "mk-fallback";
}

/** The highlight for a marker's ID or `src` note. */
export function noteName(m: Drawn, p: Palette = PALETTE): string {
	return isKnown(m, p) ? `mk-n-${m.tag}` : "mk-fallback-note";
}

/** The highlight for the dimmed syntax, when only highlights are drawn. */
export const SYNTAX_NAME = "mk-syntax";

/** What's written in place of the directive's opening: a known tag's symbol and a space, or an unknown tag's `[name] `. */
export function lead(m: Drawn, p: Palette = PALETTE): string {
	return isKnown(m, p) ? `${p.tags[m.tag]!.symbol} ` : `[${m.tag}] `;
}

/** An ID or `src` note: the label's colour, dimmed by this alpha. */
const NOTE_ALPHA = "a0";
/** The fallback's dimmed syntax, light and dark. */
const SYNTAX = { light: "rgba(40, 38, 34, 0.32)", dark: "rgba(240, 238, 230, 0.32)" };

/**
 * Adds the highlight rules to the page, at startup: as a constructed stylesheet in `document.adoptedStyleSheets`, which
 * touches no element, or, if that fails from the content script's isolated world, as a `<style>` in the head. Returns
 * which.
 */
export function addHighlightStyles(doc: Document, css: string): "adopted" | "style" {
	try {
		const sheet = new (doc.defaultView as typeof globalThis).CSSStyleSheet();
		sheet.replaceSync(css);
		doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
		if (doc.adoptedStyleSheets.includes(sheet)) return "adopted";
	} catch {
		// Not supported here: the fallback below.
	}
	const style = doc.createElement("style");
	style.dataset.responseMarkup = "";
	style.textContent = css;
	(doc.head ?? doc.documentElement).append(style);
	return "style";
}

/** The stylesheet's highlight rules: light by default, dark under claude.ai's `data-mode="dark"`. */
export function highlightCss(p: Palette = PALETTE): string {
	const lines: string[] = [];
	for (const [mode, prefix] of [
		["light", ""],
		["dark", '[data-mode="dark"] '],
	] as const) {
		const rule = (label: string, note: string, colour: string) => {
			lines.push(`${prefix}::highlight(${label}) { color: ${colour}; }`);
			lines.push(`${prefix}::highlight(${note}) { color: ${colour}${NOTE_ALPHA}; }`);
		};
		for (const [tag, s] of Object.entries(p.tags)) rule(labelName({ tag, known: true }, p), noteName({ tag, known: true }, p), s[mode]);
		rule("mk-fallback", "mk-fallback-note", p.fallback[mode]);
		lines.push(`${prefix}::highlight(${SYNTAX_NAME}) { color: ${SYNTAX[mode]}; }`);
	}
	return lines.join("\n") + "\n";
}
