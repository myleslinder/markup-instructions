# Markup Instructions

Claude marks the items you want to find in its replies with inline markdown directives, and a renderer draws each tag in its own colour and symbol. Which items get marked is up to you: a few hundred words of instructions name the tags and what each is for. It works in Claude Code, through a mod, and on claude.ai, through a Chrome extension.

What it is and why, with examples: [markupinstructions.com](https://markupinstructions.com).

## Start

You need Node 24 and pnpm, and a clone of this repo. The setup is fullest in Claude Code, in the terminal or the desktop app's Code tab; claude.ai, Cowork included, is supported through the Chrome extension.

**Claude Code:** start `claude` in the clone and trust the folder. The mod and the markup instructions load there, so you can try it on the repo itself. To use it in every session on your machine, run `pnpm install:user`: it adds the instructions as the "## Response markup" section of `~/.claude/CLAUDE.md` (replacing that section if it's there, and leaving the rest of the file alone) and the mod to `~/.claude/skills/markup/`. New sessions pick them up. `/legend` lists the tags.

**claude.ai:** run `pnpm install` and `pnpm build:ext`, load `extension/dist/` unpacked in Chrome, then copy the markup instructions from the extension's panel into your claude.ai preferences. `extension/INSTALL.md` has the steps.

## Make it yours

The included tags are the author's own set, in daily use, and a starting point. Change them with Claude: in Claude Code, ask in this repo, or run `/review-tags` to have Claude review your tags against your past sessions; on claude.ai, edit them in the extension's panel. `docs/customizing.md` has the how and the guidance on writing a tag's line, and `docs/how-it-works.md` the details of the markup and the renderers.

This is source to change with your own Claude, not a maintained product: nobody keeps it fitted to each person's preferences.

## Known bugs and limitations

Most of these were spotted and left for later rather than fixed. Where the markup shows as written instead of drawn, and why:

- **While a reply streams in the terminal.** Claude Code draws a streaming reply itself, so the markup shows as written until the reply finishes and the mod draws it, and the reply changes look at the end. The same mod draws markers as the reply streams in the desktop app's Code tab, so this may be a bug in Claude Code's terminal rather than in the mod; nobody has looked into it yet.
- **While a reply streams on claude.ai,** on purpose. claude.ai keeps rewriting a reply's text as it streams, and a marker can arrive split partway through its label, so the extension waits for the finished reply.
- **Tables in Claude Code.** To colour a marker in a table, the mod would have to draw the whole table itself instead of leaving it to Claude Code, so a table that holds a marker is left as written. On claude.ai, tables are drawn like the rest of the reply.
- **The Claude Code extension for VS Code, the phone app and `/btw`'s answer.** The mod leaves these to Claude Code's own drawing; drawing there hasn't been tried. A terminal inside VS Code is drawn like any terminal.
- **A marker in underscore emphasis,** `_:guess[x]_`. A directive straight after a letter, digit or underscore is read as text, so `10:30[x]` doesn't become one, and the underscore counts. With asterisks, `*:guess[x]*`, it's drawn.

Other limitations:

- **Claude decides what to mark.** The instructions steer its judgement rather than guarantee it, so Claude can miss an item or pick the wrong tag, and it marks less on some surfaces: with the same instructions, Cowork marked far fewer items than Claude Code. The renderers draw what Claude wrote and don't correct it.
- **The Code tab's look needs tuning.** In the desktop app, the mod draws each paragraph or list that holds a marker, and the app draws the rest, so the two can differ within one reply: the mod's text comes out slightly larger than the app's (about 7%), and a list's bullets change from the app's dots to the mod's dashes once a marker appears in it. Drawing every block of a marked reply in the mod, or finding a text size that matches the app's, would even it out.
- **The extension works in Chrome, on claude.ai's website only,** not in Claude's desktop or phone apps. It's loaded unpacked from your own build, so updating it means pulling and rebuilding. It reads claude.ai's page, so a change to that page can stop it drawing; its log counts any marker it failed to draw. The copy button copies a reply as Claude wrote it, markup included.

## Fixtures

The replies in `fixtures/` are Claude's own output, so the tests run on what Claude really writes, but what they're about is made up. The Claude Code ones come from a few sessions on a small project invented for the tests, and include the short notes Claude writes between tool calls, so some are a single line. In the claude.ai ones, names, links and project details are swapped for stand-ins. None of them is a record of anyone's real work.

## License

MIT.
