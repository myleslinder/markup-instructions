// The self-check: anything in the row's visible text outside code that
// looks like a directive and wasn't placed is a miss. It makes a change to the page, or a marker the core didn't find,
// visible in the log instead of leaving syntax on screen unnoticed.

import { opensAt, type Placed, type Scan } from "./place.ts";

export type Miss = {
	/** The name after the colon. */
	tag: string;
	/** Up to 30 characters either side, on one line; logged only if snippets are on. */
	snippet: string;
};

const OPENING = /:([A-Za-z][\w-]*)\[/g;
const AROUND = 30;

export function misses(s: Scan, placed: Placed[]): Miss[] {
	const out: Miss[] = [];
	OPENING.lastIndex = 0;
	for (let m: RegExpExecArray | null; (m = OPENING.exec(s.text));) {
		const i = m.index;
		if (!opensAt(s, i)) continue;
		if (placed.some((p) => i >= p.open && i < p.end)) continue;
		const snippet = s.text
			.slice(Math.max(0, i - AROUND), i + m[0].length + AROUND)
			.replace(/\s+/g, " ")
			.trim();
		out.push({ tag: m[1]!, snippet });
	}
	return out;
}
