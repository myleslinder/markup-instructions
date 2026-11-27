// The markup instructions (the rules text) as a frame around one line per tag, read from a rules file and written back.
// Each tag's line is kept as fields, and its syntax is built from the tag's name, so no one writes directive syntax and a
// rename can't break the tag's own line.

import { NAME, type Config, type TagLine } from "./config.ts";

/** The text around the tag lines: everything before the first and after the last, without the line breaks that join them. */
export type Frame = { before: string; after: string };

/** A rules text read into its parts: the frame, and each tag's line in order. */
export type Rules = { frame: Frame; tags: { name: string; line: TagLine }[] };

/** The heading a rules file puts its text under, as `rules/markup-rules.md` and `~/.claude/CLAUDE.md` do. */
export const RULES_HEADING = "## Response markup";

/** A line that starts like a tag line: a colon, a name and `[`. */
const STARTS_LIKE_TAG = /^:[^\s[\]]+\[/;
/** A tag line: `:name[brackets]{attribute="example"} what it's for`, the attribute optional. */
const TAG_LINE = /^:([^\s[\]{}]+)\[([^\]\n]*)\](?:\{([^\s="{}]+)="([^"\n]*)"\})? (\S[^\n]*)$/;

/** A tag's line as it's written in the rules text. */
export function tagLine(name: string, line: TagLine): string {
	const attribute = line.attribute ? `{${line.attribute.name}="${line.attribute.example}"}` : "";
	return `:${name}[${line.brackets}]${attribute} ${line.purpose}`;
}

/** The rules text from a frame and tag lines, in order. */
export function writeRules(rules: Rules): string {
	return [rules.frame.before, ...rules.tags.map((t) => tagLine(t.name, t.line)), rules.frame.after].join("\n");
}

/** A config's rules text: its tags' lines, in the config's order, inside the frame. Every tag needs a line. */
export function rulesFor(config: Config, frame: Frame): string {
	const tags = Object.entries(config.tags).map(([name, style]) => {
		if (!style.line) throw new Error(`${name} has no line in the rules text`);
		return { name, line: style.line };
	});
	return writeRules({ frame, tags });
}

/**
 * A rules text read into its parts. A line that starts with `:name[` is a tag line and the rest is frame. The tag lines
 * have to be together, with frame before and after them, and each has to read as a tag line; anything else is an error.
 */
export function readRules(text: string): Rules {
	const lines = text.split("\n");
	const at = lines.flatMap((line, i) => (STARTS_LIKE_TAG.test(line) ? [i] : []));
	if (at.length === 0) throw new Error("The rules text has no tag lines");
	const first = at[0]!;
	const last = at.at(-1)!;
	if (last - first + 1 !== at.length) throw new Error("The rules text's tag lines aren't all together");
	if (first === 0 || last === lines.length - 1) throw new Error("The rules text needs text before and after its tag lines");
	const tags = lines.slice(first, last + 1).map((line) => {
		const m = TAG_LINE.exec(line);
		if (!m || !NAME.test(m[1]!)) throw new Error(`Can't read this as a tag line: ${line}`);
		const tagLineRead: TagLine = { brackets: m[2]!, purpose: m[5]! };
		if (m[3] !== undefined) tagLineRead.attribute = { name: m[3], example: m[4]! };
		return { name: m[1]!, line: tagLineRead };
	});
	const names = tags.map((t) => t.name);
	const twice = names.find((n, i) => names.indexOf(n) !== i);
	if (twice) throw new Error(`The rules text has two lines for ${twice}`);
	return { frame: { before: lines.slice(0, first).join("\n"), after: lines.slice(last + 1).join("\n") }, tags };
}

/** The rules text in a rules file: what follows its `## Response markup` heading, with the file's outer blank lines dropped. */
export function rulesInFile(file: string): string {
	const text = file.trim();
	if (!text.startsWith(RULES_HEADING + "\n\n")) throw new Error(`A rules file starts with "${RULES_HEADING}" and a blank line`);
	return text.slice(RULES_HEADING.length + 2);
}

/** A config with each tag's line from a rules text, which has to have a line for each of its tags, in the same order. */
export function withLines(config: Config, rules: Rules): Config {
	const ours = Object.keys(config.tags);
	const theirs = rules.tags.map((t) => t.name);
	if (ours.join() !== theirs.join()) throw new Error(`The config's tags (${ours.join(", ")}) aren't the rules text's (${theirs.join(", ")})`);
	const tags: Config["tags"] = {};
	for (const { name, line } of rules.tags) tags[name] = { ...config.tags[name]!, line };
	return { ...config, tags };
}

/**
 * The tags a tag's line mentions in what it's for, as `:name`: `:open-(ask|default)` is read as both kinds. A colon
 * after a letter or digit (a time, a URL's scheme) isn't a mention.
 */
export function mentions(purpose: string): string[] {
	const out = new Set<string>();
	for (const m of purpose.matchAll(/(?<![\p{L}\p{N}]):([\p{L}\p{N}][\p{L}\p{N}_-]*)(?:\(([^)\s]*)\))?/gu)) {
		if (m[2]) for (const kind of m[2].split("|")) out.add(m[1]! + kind);
		else out.add(m[1]!);
	}
	return [...out];
}

/**
 * The flag on a config's lines: each tag whose line mentions a tag that isn't in the config, because it was removed or
 * renamed, with the tags it mentions. Shown beside the line, never fixed for the person.
 */
export function staleMentions(config: Config): { tag: string; missing: string[] }[] {
	const out: { tag: string; missing: string[] }[] = [];
	for (const [name, style] of Object.entries(config.tags)) {
		if (!style.line) continue;
		const missing = mentions(style.line.purpose).filter((m) => m !== name && !Object.hasOwn(config.tags, m));
		if (missing.length) out.push({ tag: name, missing });
	}
	return out;
}
