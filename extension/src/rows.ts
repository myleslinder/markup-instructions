// Finds Claude's replies on claude.ai's unified interface. Selectors are those of the page as it was built when this was
// written, and will change; the self-check makes a change visible.

export const ROW = '[data-testid="assistant-message"]';
/** The reply's markdown container inside a row; a row can hold several, around tool calls. */
export const REPLY_ROOT = ".standard-markdown, [data-perf-reply-text]";

export function isStreaming(row: Element): boolean {
	return row.getAttribute("data-is-streaming") === "true";
}

/** Rows whose reply has finished streaming, in page order. */
export function finishedRows(doc: ParentNode): Element[] {
	return [...doc.querySelectorAll(ROW)].filter((row) => !isStreaming(row));
}

/** The outermost reply containers in a row, in page order. */
export function replyRoots(row: Element): Element[] {
	return [...row.querySelectorAll(REPLY_ROOT)].filter((el) => !el.parentElement?.closest(REPLY_ROOT));
}

/** The row's turn key (`<parent uuid>-hub-reply`), or null. */
export function turnKey(row: Element): string | null {
	return row.getAttribute("data-turn-key");
}
