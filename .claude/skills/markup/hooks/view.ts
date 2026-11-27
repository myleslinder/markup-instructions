// The plain tree the mod's drawing (mod/src/draw.ts, bundled as draw.mjs) hands the hook. Types only: shared by the
// drawing and the hook, which fills in colours and symbols from the config.

/**
 * A colour by role: a known tag's name, "unknown" for any other tag, or "code" for Claude Code's inline-code colour.
 * Which tags are known is the config's; "unknown" and "code" are reserved as tag names (core/src/config.ts).
 */
export type Tone = string;

export type TextStyle = {
	tone?: Tone;
	/** An ID or `src` note: the tone's colour, shaded. */
	note?: true;
	bold?: true;
	italic?: true;
	underline?: true;
	strikethrough?: true;
	dim?: true;
	/** Text the mod adds that isn't in the reply (bullets, numbers, task boxes, an unknown tag's name, notes, the quote bar). */
	added?: true;
};

export type Inline =
	| string
	| { type: "Text"; style: TextStyle; children: Inline[] }
	| { type: "Symbol"; tag: string }
	| { type: "Link"; href: string; children: Inline[] };

export type BoxLayout = { flexDirection?: "row" | "column"; gap?: number; width?: number; flexShrink?: number; flexGrow?: number };

export type View =
	| { type: "Markdown"; text: string }
	| { type: "Text"; style: TextStyle; children: Inline[] }
	| { type: "Box"; layout: BoxLayout; children: View[] };
