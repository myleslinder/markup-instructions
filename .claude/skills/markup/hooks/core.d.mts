// Types for the bundled core (core.mjs, built from core/src by pnpm build), as far as the hook uses it.
export type Colour = string | { dark: string; light: string };
export type TagStyle = { symbol: string; colour: Colour; legend: string };
export type Config = { tags: Record<string, TagStyle>; fallback: Colour };
export function parse(markdown: string, options: { tags: readonly string[] }): unknown[];
export function checkConfig(config: Config): string[];
export function colourFor(colour: Colour, theme: "dark" | "light", backgrounds: { dark: string; light: string }): string;
