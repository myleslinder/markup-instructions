// The core's data model.

/** A directive's name. Which names are known is the caller's, passed to `parse()` from its config. */
export type Tag = string;

export type ParseOptions = {
	/** The known tags' names: a directive with one of them and no label is flagged as bare, and one at the very end of a
	 * streaming input may still become a marker. Any other name is still a marker when it has a label, with `known` false. */
	tags: readonly string[];
};

/** Offsets into the input that `parse()` was given: `input.slice(start, end)` is the run's source. */
export type Span = { start: number; end: number };

export type MarkerRun = Span & {
	kind: "marker";
	tag: Tag;
	known: boolean;
	label: Run[];
	labelText: string;
	id?: string;
	src?: string;
	attrs: Record<string, string>;
	source: string;
};

export type BareRun = Span & { kind: "bare"; tag: Tag; text: string };

export type Run =
	| { kind: "text"; text: string }
	| { kind: "code"; text: string }
	| { kind: "emphasis" | "strong" | "delete"; runs: Run[] }
	| { kind: "link"; url: string; runs: Run[] }
	| { kind: "break" }
	| MarkerRun
	| BareRun;

export type ListItem = {
	/** GFM task list state; absent on ordinary items. */
	checked?: boolean;
	blocks: Block[];
};

export type Align = "left" | "right" | "center" | null;

export type BlockBase = {
	/**
	 * Exact slice of the input. Drawn as-is when hasMarkers is false. On a block nested in a list or
	 * blockquote it still includes continuation lines' indentation and `>` prefixes.
	 */
	source: string;
	/**
	 * Text between this block and the next sibling, or the end of its parent (the input, at the top level).
	 * Whitespace at the top level; nested, it can also hold indentation and `>` prefixes.
	 */
	gap: string;
	/** True when the block or anything inside it holds a marker. */
	hasMarkers: boolean;
	/** Set when the input was over a limit (`LIMITS` in parse.ts) and wasn't parsed: the whole input is this one block. */
	skipped?: "size" | "depth";
	/**
	 * Set on the last top-level block when the input ends inside a directive that could still become a marker:
	 * its `[` or `{` is open, or it is a known tag with nothing after it yet. That directive is kept as text.
	 */
	incomplete?: true;
};

export type Block = BlockBase &
	(
		| { kind: "paragraph"; runs: Run[] }
		/** depth: heading level, 1 to 6. */
		| { kind: "heading"; depth: number; runs: Run[] }
		/** start: the first number of an ordered list. spread: blank lines between items. */
		| { kind: "list"; ordered: boolean; start?: number; spread: boolean; items: ListItem[] }
		| { kind: "blockquote"; children: Block[] }
		/** rows: each cell a list of runs; the first row is the header. align: one entry per column. */
		| { kind: "table"; align: Align[]; rows: Run[][][] }
		/** value: content without fences or indentation. */
		| { kind: "code"; lang?: string; value: string }
		| { kind: "thematicBreak" | "html" | "other" }
	);

export type BlockKind = Block["kind"];
