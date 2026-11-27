# Markup Instructions

Markup Instructions: inline markdown directives Claude writes in its replies so the items a person wants to find stand out, and two renderers that draw them, a Claude Code mod and a Chrome extension for claude.ai. People clone this repo to use the markup and change it to suit them, usually with you. `docs/how-it-works.md` covers the markup, the renderers and where the code is; `docs/customizing.md` covers changing it.

The markup rules load through the import below, so your replies here use the markup.

@rules/markup-rules.md

## Changing a tag

- A tag lives in three places that change together: its line in `rules/markup-rules.md`, the same line in `rules/markup-rules-claude-ai.md` (the extension's default), and its entry in `presets/default.ts`. The tests hold them together; if the person uses only one surface, add the difference to `core/test/rules-files.test.ts`'s list rather than skipping the test.
- Read `docs/customizing.md`, "Writing a tag's line", before proposing a line, and again once your drafts are written, before you pick one.
- The surrounding text in the rules files has large effects on how much Claude marks. Change it only for a reason the person agrees, and say what you expect the change to do.
- For a review of the person's tags against their past sessions, use `/review-tags`.

## Building and installing

Needs Node 24 and pnpm. `pnpm test` and `pnpm typecheck` check everything. After a change to the core, the mod or the preset, run `pnpm build` and commit the bundles it writes to `.claude/skills/markup/hooks/`; `pnpm test:mod` checks the mod in Claude Code itself, and `pnpm snapshots` rewrites the snapshots (review the diff). `pnpm build:ext` builds the extension into `extension/dist/`; the person reloads it in `chrome://extensions` and reloads their claude.ai tabs.

`pnpm install:user` replaces the "## Response markup" section of `~/.claude/CLAUDE.md` and `~/.claude/skills/markup/`, from a clean `main` only. Tell the person what it will change before running it. Once installed, the user-level mod shadows this repo's copy, so `/reload-plugins` here reports one error during load; that's expected.

Never write or edit a file in `fixtures/` by hand: they're Claude's real output.
