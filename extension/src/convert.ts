// A reply's page HTML back to markdown, for the core to parse. The page gives HTML
// only; the copy button's markdown needs a click. The fixture pairs decide what's kept: the core must find
// the same markers in the converted text as in the copy button's markdown. The markdown as a whole needn't match.

import TurndownService from "turndown";
// @ts-expect-error: the plugin ships no types.
import { gfm } from "turndown-plugin-gfm";
import { replyRoots, turnKey } from "./rows.ts";

/**
 * Page parts that aren't in the reply's markdown: screen-reader copies, the turn status, a code block's language name,
 * web search pills. A code block is also wrapped in `[data-not-prose]` (`renderer-7`), so one holding a `pre` is kept:
 * its header's only text is the language name, in `[data-find-omitted]`.
 */
const NOT_IN_MARKDOWN = ".sr-only, [data-find-omitted], [data-not-prose]:not(:has(pre))";

function makeService(): TurndownService {
	const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", fence: "```", bulletListMarker: "-", hr: "---" });
	td.use(gfm);
	// Turndown escapes `[`, `]`, `_`, `*` and more by default, which would turn every directive into prose.
	td.escape = (text) => text;
	td.remove((node) => node.nodeType === 1 && (node as Element).matches(NOT_IN_MARKDOWN));
	// Any `pre` is a code block, whatever wraps its `code`: kept with its fences so the core leaves it alone.
	td.addRule("codeBlock", {
		filter: (node) => node.nodeName === "PRE",
		replacement: (_content, node) => {
			const code = (node as Element).querySelector("code") ?? node;
			const lang = /language-(\S+)/.exec((code as Element).className ?? "")?.[1] ?? "";
			const text = (code.textContent ?? "").replace(/\n$/, "");
			const fence = "`".repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)));
			return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
		},
	});
	return td;
}

let service: TurndownService | undefined;

/** One reply container's HTML as markdown. */
export function convert(root: Element): string {
	service ??= makeService();
	// Turndown takes a node; the cast is only for its types, which expect its own DOM.
	return service.turndown(root as unknown as HTMLElement);
}

/** A row's reply as markdown: its containers in page order, as paragraphs apart. */
export function convertRow(row: Element): string {
	return replyRoots(row)
		.map(convert)
		.filter((md) => md !== "")
		.join("\n\n");
}

const CACHE_SIZE = 200;
const cache = new Map<string, { text: string; markdown: string }>();

/**
 * `convertRow`, converted once per row: kept by the row's turn key and its original text, so a redraw after a page
 * change doesn't convert again, and a row whose text changed (an edit, a regenerate) does. `text` is the row's text as
 * the page drew it, before any drawing of ours: the caller keeps it, since drawing changes `row.textContent`.
 */
export function convertRowCached(row: Element, text: string = row.textContent ?? ""): string {
	const key = turnKey(row);
	if (key === null) return convertRow(row);
	const hit = cache.get(key);
	if (hit?.text === text) return hit.markdown;
	const markdown = convertRow(row);
	cache.delete(key);
	cache.set(key, { text, markdown });
	if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
	return markdown;
}
