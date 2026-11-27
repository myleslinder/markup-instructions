// The Tags section's working copy: the config as
// rows the person edits, each tag's line as fields, the checks shown beside each field, and the config built back for
// saving. The line's syntax is built from the name (core/src/rules.ts), so a rename can't break the tag's own line.

import { colourFor, mentions, NAME, RESERVED_NAMES, type Colour, type Config, type TagLine } from "../../core/src/index.ts";
import { BACKGROUNDS } from "./config.ts";

export type Shades = { dark: string; light: string };

/** One tag as the panel edits it. */
export type Row = Shades & {
	/** Stays with the row through renames, for the DOM. */
	id: number;
	name: string;
	symbol: string;
	/** The tag's legend line. The panel doesn't show it; a new tag's follows what it's for, so the config checks pass. */
	legend: string;
	legendIsPurpose: boolean;
	brackets: string;
	attrName: string;
	attrExample: string;
	/** As typed; trimmed when the config is built. */
	purpose: string;
};

export type Rows = { tags: Row[]; fallback: Shades };

/** What's wrong with each of a row's fields, for the person: empty when it's fine. `flags` don't keep it from being saved. */
export type RowProblems = { name: string; symbol: string; colour: string; line: string; flags: string[] };

const HEX = /^#[0-9a-fA-F]{6}$/;

/** A new tag's colour on dark; its light colour is derived from it once, then it's the person's. */
export const NEW_TAG_DARK = "#a99bff";
export const NEW_TAG_SYMBOL = "•";

let ids = 0;

/** A colour as the two shades the panel shows: a single colour's other shade derived as the extension draws it. */
function shades(c: Colour): Shades {
	if (typeof c === "string" && !HEX.test(c)) return { dark: c, light: c };
	return { dark: colourFor(c, "dark", BACKGROUNDS), light: colourFor(c, "light", BACKGROUNDS) };
}

export function rowsFrom(config: Config): Rows {
	return {
		tags: Object.entries(config.tags).map(([name, s]) => ({
			id: ++ids,
			name,
			symbol: s.symbol,
			...shades(s.colour),
			legend: s.legend,
			legendIsPurpose: false,
			brackets: s.line?.brackets ?? "…",
			attrName: s.line?.attribute?.name ?? "",
			attrExample: s.line?.attribute?.example ?? "",
			purpose: s.line?.purpose ?? s.legend,
		})),
		fallback: shades(config.fallback),
	};
}

/** A new tag: a name and what it's for to fill in, `…` in the brackets, no attribute. */
export function newRow(): Row {
	return {
		id: ++ids,
		name: "",
		symbol: NEW_TAG_SYMBOL,
		dark: NEW_TAG_DARK,
		light: colourFor(NEW_TAG_DARK, "light", BACKGROUNDS),
		legend: "",
		legendIsPurpose: true,
		brackets: "…",
		attrName: "",
		attrExample: "",
		purpose: "",
	};
}

/** A row's line, as fields. */
export function lineOf(row: Row): TagLine {
	const purpose = row.purpose.trim();
	return row.attrName || row.attrExample
		? { brackets: row.brackets, attribute: { name: row.attrName, example: row.attrExample }, purpose }
		: { brackets: row.brackets, purpose };
}

/** The config the rows make, tags in the rows' order. */
export function configFrom(rows: Rows): Config {
	const tags: Config["tags"] = {};
	for (const row of rows.tags) {
		const line = lineOf(row);
		tags[row.name] = {
			symbol: row.symbol,
			colour: { dark: row.dark, light: row.light },
			legend: row.legendIsPurpose ? line.purpose : row.legend,
			line,
		};
	}
	return { tags, fallback: { ...rows.fallback } };
}

export function colourProblem(c: Shades): string {
	return HEX.test(c.dark) && HEX.test(c.light) ? "" : "A colour is # and six hex digits, like #d65fd6.";
}

export function rowProblems(row: Row, rows: Rows): RowProblems {
	const n = row.name;
	const name =
		n === ""
			? "Give the tag a name."
			: !NAME.test(n)
				? "A name is letters and digits, with - or _ only between them."
				: RESERVED_NAMES.includes(n)
					? `"${n}" is kept for the extension's own use.`
					: rows.tags.some((t) => t !== row && t.name === n)
						? `There's already a tag called ${n}.`
						: "";
	const symbol = [...row.symbol].length === 1 ? "" : "The symbol is one character.";
	const purpose = row.purpose.trim();
	const line =
		purpose === ""
			? "Say what the tag is for."
			: purpose.includes("\n")
				? "Keep what it's for to one paragraph."
				: /[\]\n]/.test(row.brackets)
					? "What goes in the brackets can't hold ]."
					: !row.attrName && row.attrExample
						? "Give the attribute a name, or clear its example."
						: row.attrName && !NAME.test(row.attrName)
							? "An attribute's name is letters and digits, with - or _ only between them."
							: /["\n]/.test(row.attrExample)
								? "An attribute's example can't hold a double quote."
								: "";
	const names = new Set(rows.tags.map((t) => t.name));
	const missing = mentions(purpose).filter((m) => m !== row.name && !names.has(m));
	const flags = missing.length
		? [`It names ${missing.map((m) => ":" + m).join(" and ")}, which ${missing.length > 1 ? "aren't" : "isn't"} in your tags.`]
		: [];
	return { name, symbol, colour: colourProblem(row), line, flags };
}

/** Whether a row has a problem that keeps the config from being saved. */
export function blocks(p: RowProblems): boolean {
	return Boolean(p.name || p.symbol || p.colour || p.line);
}

/** How many rows, the fallback's included, have a problem that keeps the config from being saved. */
export function problemCount(rows: Rows): number {
	return rows.tags.filter((t) => blocks(rowProblems(t, rows))).length + (colourProblem(rows.fallback) ? 1 : 0);
}
