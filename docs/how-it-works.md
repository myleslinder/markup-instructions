# How it works

Claude already writes its replies in markdown, and already knows markdown's syntax for custom tags, called directives. So a few hundred words of instructions are enough to give it a vocabulary of its own to write, the way HTML gives a page its structure, and a renderer draws each tag, the way CSS styles one. Each tag has two halves that go to different places: its meaning goes to Claude, as one line of the markup instructions, and its look goes to the renderer. Restyling a tag never changes what Claude reads, and where nothing draws the tags, a reply still reads as plain text.

## The syntax

The markup is markdown's generic directives proposal, in its inline form, as parsers such as remark-directive implement it:

```
:name[label]{#id key="value"}
```

- **The name** is the tag: what kind of item this is.
- **The label** is the item itself, and it's what gets highlighted. It's meant to be the whole claim, or a lead-in to the block it introduces, complete enough to read on its own.
- **The attributes** are optional. `{#ID}` cites an ID the project already uses, and `src` names what was checked. Both work like source citations: they say where to follow the item up, so they stay out of the label.

Building on an existing proposal means the syntax and its edge cases are already specified, parsers exist, and Claude already knows it. Any name is valid syntax: a renderer draws the tags it knows in their own style, and any other tag in a fallback style with its name shown.

Directives count only in plain text, never in inline code or code blocks, so backticks show the syntax literally.

### The colon rule

The parser needs nothing before the colon, so `10:30[x]` or `word:open[x]` would parse as directives. A directive straight after a letter, digit or underscore is treated as plain text, whatever its name. After a space, punctuation or the start of a line, it's a marker: `(:guess[x])` and `**:guess[x]**` are markers. One consequence: a marker in underscore emphasis, `_:guess[x]_`, stays prose. No real reply has used one so far; if replies start to, the rule is worth revisiting (a fixture test flags the first).

## The included tags

The preset (`presets/default.ts`, with its lines in `rules/`) is the author's own set, in daily use:

| Symbol | Tag | Marks |
| --- | --- | --- |
| `¿` | `open-ask` | something Claude needs from you before it goes on |
| `¿` | `open-default` | a check or call left to you, and the default Claude goes on with |
| `～` | `guess` | a gap Claude filled or its own reading, not yet agreed |
| `✓` | `decided` | something you said or explicitly agreed |
| `✎` | `changed` | something Claude saved, edited, moved or deleted this turn |
| `⌕` | `checked` | a claim verified against a source in the project, named in `src` |

The two `open` tags are a family: they share a symbol and take shades of one colour. Colours go by how costly it is to miss the item, so `guess` is red. The symbols are characters that don't otherwise appear in replies, so a reply reads without a legend.

## The markup instructions

The rules text in `rules/` has two parts:

- **The surrounding text** (the frame): when to mark, the framing of the markers as semantic highlighting, what makes a good label, IDs and `src` as citations, and that the markup goes only in replies, never in anything written to be saved or sent.
- **One line per tag**, saying what the tag is for.

Each surface has its own file: `rules/markup-rules.md` for Claude Code and `rules/markup-rules-claude-ai.md` for claude.ai, which is also the extension's default. Today they differ only where each names its own renderer, but they're kept apart so each surface can be tuned on its own: the same text marks differently from one surface to another (with the same instructions, Cowork marked far fewer items than Claude Code), so a surface may need its own wording. `core/test/rules-files.test.ts` lists every deliberate difference between the two, so they can differ by choice but never drift.

## The display

Both renderers draw a marker the same way, so switching between them costs nothing:

- each label in its tag's colour, with the tag's symbol before it;
- the directive syntax hidden;
- an ID or `src` as a dim note after the label, in the label's colour;
- a tag the renderer doesn't know in the fallback colour, with its name in brackets before the label.

**In Claude Code**, the mod draws replies in the terminal, including a terminal inside an editor, and in the desktop app's Code tab, where the colours follow the app's light or dark mode. The Claude Code extension for VS Code and the phone app get Claude Code's own drawing. `/legend` lists each tag with its symbol and meaning. A table that holds a marker is handed to Claude Code's own drawing, so its syntax shows as written.

**On claude.ai**, the Chrome extension reads only the page. Once a reply has finished, it converts the reply's HTML back to markdown, finds each marker in the page's text, and draws it by editing only the text inside the page's own text nodes, never the page's structure; colour comes from the CSS Custom Highlight API. It makes no network requests. A self-check scans each reply for anything that looks like a marker and wasn't drawn, and counts it in the log.

## Guarantees

These hold in both renderers, whatever Claude actually writes:

- **No text is lost.** Every label stays where Claude wrote it. Only the directive syntax is hidden.
- **Code is left alone.** Inline code and code blocks are never styled.
- **Any input stays responsive.** A reply past the core's limits on size or nesting is drawn as written, with no styling, and so is any reply the core fails on.
- **No marker is styled before it has closed.** Only the finished reply has to be drawn exactly right. While a reply streams, a marker can flicker, as any streamed markdown does: a code span whose closing backtick hasn't arrived reads as plain text until it does. On claude.ai, replies are drawn only once they finish.
- **A bare tag stays prose.** A tag name with no label (`so it gets :guess.`) is shown as written.
- **The rules are never assumed to be followed.** Bold around a marker, formatting inside a label or an ID in the label are drawn sensibly. The renderer doesn't correct them.

Where a parsing choice could go either way, the renderers lean toward styling, since a marker that's missed and reads as ordinary text can go unnoticed, while one styled by mistake is easy to spot.

## The code

- `rules/`: the markup instructions, one file per surface (`markup-rules.md` for Claude Code, `markup-rules-claude-ai.md` for claude.ai), and the prompt for a tag review on claude.ai.
- `core/`: parses a reply's markdown into blocks and runs (`parse()`), and checks configs and reads and writes rules text. It holds no tag set; each surface passes its own.
- `presets/default.ts`: the included preset, the config both renderers draw by default.
- `mod/` and `.claude/skills/markup/`: the Claude Code mod. `mod/src/draw.ts` turns the core's blocks into a tree of elements; `.claude/skills/markup/` is the mod as it loads, with bundles that `pnpm build` writes and that are committed.
- `extension/`: the Chrome extension, with its settings in Chrome's side panel.
- `fixtures/`: real replies the tests run on, from Claude Code and claude.ai, never edited by hand.
- `site/`: the explainer page at markupinstructions.com, served as static assets by a Cloudflare Worker that `wrangler.jsonc` configures.
