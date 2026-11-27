// Shared helpers for the mod's drawing tests.

import type { Block } from "../../core/src/index.ts";
import { plainText } from "../../core/src/index.ts";
import type { Inline, View } from "../../.claude/skills/markup/hooks/view.ts";
import { fence } from "../src/draw.ts";

/** The reply text a drawn tree shows, without what the mod adds (symbols, bullets, task boxes, tag names, notes). */
export function shownText(node: View | Inline): string {
	if (typeof node === "string") return node;
	switch (node.type) {
		case "Symbol":
			return "";
		case "Markdown":
			return node.text;
		case "Link":
			return node.children.map(shownText).join("");
		case "Text":
			return node.style.added ? "" : node.children.map(shownText).join("");
		case "Box":
			return node.children.map(shownText).join("");
	}
}

/**
 * The text the core reads in a block drawn by hand: leaves' plain text, any other block's source, and for code, its
 * value in the fence the drawing hands to Markdown (draw.test.ts checks the fence gives back the value).
 */
export function blockText(block: Block): string {
	switch (block.kind) {
		case "paragraph":
		case "heading":
			return plainText(block.runs);
		case "list":
			return block.items.flatMap((item) => item.blocks.map(blockText)).join("");
		case "blockquote":
			return block.children.map(blockText).join("");
		case "code":
			return fence(block.value, block.lang);
		default:
			return block.source;
	}
}

/** Every element of a drawn tree, depth first. */
export function* nodes(node: View | Inline): Generator<View | Inline> {
	yield node;
	if (typeof node !== "string" && "children" in node) for (const child of node.children) yield* nodes(child);
}

/** Text with all whitespace removed, so layout (indents, gaps, line breaks) doesn't count. */
export const squash = (text: string) => text.replace(/\s+/g, "");
