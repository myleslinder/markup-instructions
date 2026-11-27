// The included preset: the author's own tag set, in daily use, and a starting point for yours. The core holds no tag
// set; each surface reads a config like this one. See docs/customizing.md.
//
// Colours go by how costly it is to miss the item: red for a guess, since a guess read as settled is the biggest risk.
// The dark colours avoid the colours Claude Code already uses in a reply: periwinkle inline code, blue links. The light
// ones are the same hues darkened for claude.ai's light mode, picked by eye. Symbols are characters that don't otherwise
// appear in replies.
//
// A family's kinds (`open-ask`, `open-default`) share its symbol and take shades of its colour, so they read as one family
// and as different from every other. Tags no longer in the rules text are left out, so older replies show them as
// unknown tags.

import type { Config } from "../core/src/config.ts";

export const DEFAULT: Config = {
	tags: {
		"open-ask": { symbol: "¿", colour: { dark: "#d65fd6", light: "#9c1f9c" }, legend: "needs your input or an action before Claude goes on with it" },
		"open-default": {
			symbol: "¿",
			colour: { dark: "#eea6ee", light: "#b35ab3" },
			legend: "a check or call left to you, and the default Claude goes on with",
		},
		guess: {
			symbol: "～",
			colour: { dark: "#ff6b8b", light: "#d1193f" },
			legend: "Claude filled a gap or gave its own reading; you haven't agreed it",
		},
		decided: { symbol: "✓", colour: { dark: "#8bd450", light: "#3c7f12" }, legend: "you said it or explicitly agreed" },
		changed: { symbol: "✎", colour: { dark: "#4fd6be", light: "#0b7f6e" }, legend: "something Claude saved, edited, moved or deleted this turn" },
		checked: { symbol: "⌕", colour: { dark: "#f5b942", light: "#9a6400" }, legend: "verified against a source in the project" },
	},
	/**
	 * Sand, neutral but noticeable: grey read as Claude Code's status text and went unseen.
	 */
	fallback: { dark: "#d9b88c", light: "#86663a" },
};

/** The known tags' names, for `parse()`. */
export const DEFAULT_TAGS = Object.keys(DEFAULT.tags);
