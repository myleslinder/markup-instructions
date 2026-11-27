// A config: the tags a surface draws, each with its symbol, colour and legend line. The core holds no tag set of its own;
// the preset in presets/default.ts is one config among others.

/** A `#rrggbb` colour for both themes, or one for each. */
export type Colour = string | { dark: string; light: string };

/**
 * A tag's line in the rules text, as fields: the line's syntax is built from the tag's name (core/src/rules.ts), so no one
 * writes it, and a rename can't break it.
 */
export type TagLine = {
	/** What Claude writes in the label, such as `claim`; `…` for anything. */
	brackets: string;
	/** Something Claude adds after the label, such as `src`, with an example value. */
	attribute?: { name: string; example: string };
	/** What the tag is for and when Claude uses it, in the person's words. */
	purpose: string;
};

export type TagStyle = {
	/** One character drawn before the label. */
	symbol: string;
	colour: Colour;
	/** One line for a legend, written to the reader. */
	legend: string;
	/** Its line in the rules text, where the surface writes one. */
	line?: TagLine;
};

export type Config = {
	/** The known tags, in the order a legend lists them. */
	tags: Record<string, TagStyle>;
	/** Any tag not in `tags`. */
	fallback: Colour;
};

export type Theme = "dark" | "light";

/** The page's background in each theme: what a colour derived for a theme has to read on. */
export type Backgrounds = Record<Theme, string>;

/** Names the surfaces use for their own colours (the mod's fallback and inline code), so no tag can take them. */
export const RESERVED_NAMES: readonly string[] = ["unknown", "code"];

/**
 * A name remark-directive reads as a directive's: no whitespace, punctuation or symbol, except `-` and `_` after the
 * first character and not at the end (micromark-extension-directive's name rule).
 */
export const NAME = /^[^\s\p{P}\p{S}](?:(?:[^\s\p{P}\p{S}]|[-_])*[^\s\p{P}\p{S}])?$/u;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Everything wrong with a config, as sentences; empty when it can be drawn. */
export function checkConfig(config: Config): string[] {
	const problems: string[] = [];
	const checkColour = (colour: Colour, what: string) => {
		const values = typeof colour === "string" ? [colour] : [colour.dark, colour.light];
		for (const value of values) if (!HEX.test(value)) problems.push(`${what}: colour ${JSON.stringify(value)} isn't #rrggbb`);
	};
	for (const [name, style] of Object.entries(config.tags)) {
		if (!NAME.test(name)) problems.push(`${JSON.stringify(name)} can't be a directive's name`);
		if (RESERVED_NAMES.includes(name)) problems.push(`${JSON.stringify(name)} is reserved`);
		if ([...style.symbol].length !== 1) problems.push(`${name}: symbol ${JSON.stringify(style.symbol)} isn't one character`);
		if (style.legend.trim() === "") problems.push(`${name}: no legend line`);
		checkColour(style.colour, name);
		if (style.line) for (const problem of checkLine(style.line)) problems.push(`${name}: ${problem}`);
	}
	checkColour(config.fallback, "fallback");
	return problems;
}

/** What's wrong with a tag's line, as sentences: anything that would stop it being written as one line and read back. */
export function checkLine(line: TagLine): string[] {
	const problems: string[] = [];
	if (line.purpose.trim() === "") problems.push("no text for what the tag is for");
	if (line.purpose !== line.purpose.trim()) problems.push("what the tag is for starts or ends with a space");
	if (line.purpose.includes("\n")) problems.push("what the tag is for is more than one paragraph");
	if (/[\]\n]/.test(line.brackets)) problems.push("what goes in the brackets holds ] or a line break");
	if (line.attribute) {
		if (!NAME.test(line.attribute.name)) problems.push(`attribute ${JSON.stringify(line.attribute.name)} can't be an attribute's name`);
		if (/["\n]/.test(line.attribute.example)) problems.push("the attribute's example holds a double quote or a line break");
	}
	return problems;
}

// Colours for the other theme: one colour can serve both themes. A single colour is used as written in
// the theme it reads best in, and in the other it changes lightness only, in OKLCH, keeping its hue and chroma.

/**
 * How far a colour's OKLCH lightness moves for the other theme, before any further step for contrast. Of the steps tried
 * (0.12 to 0.24), it brings the preset's colours closest to its hand-picked shades in both directions, dark to light and back.
 */
export const LIGHTNESS_STEP = 0.2;
/** The least contrast a derived colour has on its background (WCAG's ratio for body text). */
export const CONTRAST_FLOOR = 4.5;

/** The colour to draw in a theme: as written for it, or derived from a single colour written for the other. */
export function colourFor(colour: Colour, theme: Theme, backgrounds: Backgrounds): string {
	if (typeof colour !== "string") return colour[theme];
	if (writtenFor(colour, backgrounds) === theme) return colour;
	const [l, c, h] = oklch(colour);
	const direction = theme === "light" ? -1 : 1;
	let lightness = clamp(l + direction * LIGHTNESS_STEP);
	let out = fromOklch(lightness, c, h);
	while (contrast(out, backgrounds[theme]) < CONTRAST_FLOOR && lightness > 0 && lightness < 1) {
		lightness = clamp(lightness + direction * 0.01);
		out = fromOklch(lightness, c, h);
	}
	return out;
}

/** The theme a single colour was written for: the one whose background it stands out from more. */
function writtenFor(colour: string, backgrounds: Backgrounds): Theme {
	return contrast(colour, backgrounds.dark) >= contrast(colour, backgrounds.light) ? "dark" : "light";
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** WCAG contrast ratio between two `#rrggbb` colours, 1 to 21. */
export function contrast(a: string, b: string): number {
	const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
	return (x + 0.05) / (y + 0.05);
}

function luminance(hex: string): number {
	const [r, g, b] = rgb(hex).map(toLinear) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A `#rrggbb` colour as OKLCH: lightness 0 to 1, chroma, hue in degrees. */
export function oklch(hex: string): [number, number, number] {
	const [l, a, b] = oklab(hex);
	return [l, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];
}

/** Distance between two colours in OKLab: about 0.02 is the least the eye notices. */
export function distance(x: string, y: string): number {
	const p = oklab(x);
	const q = oklab(y);
	return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function rgb(hex: string): [number, number, number] {
	return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function toLinear(channel: number): number {
	const c = channel / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function toGamma(c: number): number {
	return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

// Björn Ottosson's OKLab, from linear sRGB and back.
function oklab(hex: string): [number, number, number] {
	const [r, g, b] = rgb(hex).map(toLinear) as [number, number, number];
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}

function linearRgb(lightness: number, a: number, b: number): [number, number, number] {
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
}

/** An OKLCH colour as `#rrggbb`, its chroma reduced as far as needed to fit sRGB, so its hue and lightness stay. */
function fromOklch(lightness: number, chroma: number, hue: number): string {
	const rad = (hue * Math.PI) / 180;
	const at = (c: number) => linearRgb(lightness, c * Math.cos(rad), c * Math.sin(rad));
	const fits = (c: number) => at(c).every((v) => v >= -1e-6 && v <= 1 + 1e-6);
	let c = chroma;
	if (!fits(c)) {
		let [lo, hi] = [0, chroma];
		for (let i = 0; i < 24; i++) {
			const mid = (lo + hi) / 2;
			if (fits(mid)) lo = mid;
			else hi = mid;
		}
		c = lo;
	}
	return (
		"#" +
		at(c)
			.map((v) =>
				Math.round(clamp(toGamma(clamp(v))) * 255)
					.toString(16)
					.padStart(2, "0"),
			)
			.join("")
	);
}
