---
name: review-tags
description: Review the person's markup tags against their past Claude Code sessions and recommend which to keep, change, merge or drop, and what to add.
disable-model-invocation: true
---

You're running in the person's clone of this repo, where their tags are changed. The review covers their Claude Code sessions from every project on this machine. Its method and what to hand back are in `docs/customizing.md`, "Reviewing your tags with Claude". Read that file and `docs/how-it-works.md` before anything else.

What to know going in:

- **The setup under review** is the one the sessions ran under: the "## Response markup" section of `~/.claude/CLAUDE.md`, which `pnpm install:user` writes, and any markup lines in a project's own instructions. The clone's `rules/markup-rules.md` and `presets/default.ts` are where changes go; if they differ from what's installed, say so. If nothing is installed, the person hasn't used the markup outside this clone yet: the clone's tags are the starting point, and the review is a first setup.
- **The sessions** are in `~/.claude/projects/`, one folder per project and one `.jsonl` file per session. Most of each file is tool output, so pull out the person's messages and Claude's replies with a script in a temporary folder rather than reading the files whole. Claude Code deletes old transcripts after a while, so say how far back they reach. If the person named projects or a period, keep to those; otherwise say which you're reading as you start, so they can narrow it.
- **The setup's start**, for comparing before and since, is when markers first appear in the replies, unless the person says otherwise. If there are few sessions since, or none, say there's not yet much to compare, and judge the tags against the needs found.

Always:

- Leave the transcripts as they are, and keep quotes from them in your reply, not in files: the clone may be pushed.
- Once your drafts are written, re-read "Writing a tag's line" in `docs/customizing.md` and check each draft against it before recommending any.
- When the person agrees a change, make it as `CLAUDE.md` describes for a tag change.
