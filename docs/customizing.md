# Customizing

The included tags are one person's set, tuned in daily use. They're a starting point: the markup is meant to carry whatever you want to find at a glance in Claude's replies. Claude already knows the directive syntax, so your markup instructions only have to say what to mark and why, and how each mark looks is up to you.

## What you can change

Two things are settings, which most people change first:

- **Your markup instructions:** the text that tells Claude what to mark. One line per tag, inside a surrounding text that says when and how to mark at all (`docs/how-it-works.md`, "The markup instructions").
- **How each tag looks:** its symbol, its colours on dark and light, and its line in `/legend`. Any tag not in your config is still drawn, in the fallback colour with its name before it, so a tag you're trying out shows up even before you've styled it.

Everything else is source, yours to change with your own Claude. None of these is built; they're the kind of change the code is open to:

- **How a mark is drawn:** a tint behind the label like a highlighter, an underline, colour without a symbol, or a look that differs by tag. The drawing is in `mod/src/draw.ts` for Claude Code and `extension/src/draw.ts` for claude.ai.
- **What the renderer does with the marks:** the core hands each renderer every marker's tag, label, ID and source, so a renderer can do more than colour them: a line at the end of a reply listing what needs you, everything else dimmed while you look for one kind, or a list of the open items across a session.
- **Finer tags drawn as one:** tags that give Claude a finer distinction while you see one family, in shades of one colour. The two `open` tags already work this way.
- **Attributes of your own:** the parser keeps every attribute on a marker, not only `#id` and `src`, so you can ask Claude for one, such as a confidence or an owner, and have a renderer use it.
- **Where replies are drawn:** the core holds no tag set and isn't tied to Claude Code or claude.ai, so another surface, such as another browser or an editor, is a new renderer on the same core.

## Edit the tags freely, the surrounding text with care

Add, rename, reword or drop tags as you like, and change their colours and symbols.

The surrounding text is different. It decides how often and where Claude marks at all, and small changes there have large effects: in one test, a few words added to it changed how much Claude marked by two to five times. It holds what testing taught about labels, citations and keeping markup out of anything saved or sent. Change it if you have a reason, and compare a few replies before and after.

## Where each part lives

**On claude.ai,** everything is in the extension's side panel (click its icon). **Tags** holds each tag's look and the fields its line is built from; **Markup instructions** gives the full text to copy, and the surrounding text is locked behind a warning there. The extension never writes into claude.ai's settings: you paste the instructions into your preferences, or into a project's instructions, yourself. `extension/INSTALL.md` walks through it.

**In Claude Code,** they're files in this repo:

- `rules/markup-rules.md`: your markup instructions, the surrounding text with each tag's line in it.
- `presets/default.ts`: each tag's symbol, colours and legend line.

After a change, `pnpm build` bundles the preset into the mod, and `pnpm install:user` puts the rules text and the mod where every Claude Code session on your machine finds them. Claude Code working in this repo knows the steps (`CLAUDE.md`), so you can ask it to make the change.

Instructions are read when a session or chat starts, so a change shows only in a new one.

## A subset, or tags for one project

You don't have to put every tag everywhere. Markup instructions put only in a project's instructions give markers only in that project, and different projects can have different subsets. The renderer draws every tag in its config wherever Claude writes it, so the config holds every tag you use anywhere, while each place's instructions hold only the lines it needs.

## Writing a tag's line

A tag's line says what the tag is for. These points come from testing markup instructions on real replies:

- **Give the reason, not an example.** Say what the tag is for and let Claude judge the cases; naming one case narrows the tag to that case.
- **Say each thing once.** A second wording either narrows the first or leaves Claude two versions to reconcile.
- **Leave out words about amount,** such as "only", "always" or "a few", unless the amount is the point; they steer how much gets marked.
- **Say what the tag covers** rather than what it doesn't.
- **Read each phrase for a second meaning,** and check each concrete word against the idea it stands for.
- **Write it as you speaking to Claude** ("my input", "your reading"), since the line sits in your instructions.

Markup instructions are for consistent judgement, not strict compliance: you want Claude to recognise the kind of item you'd want to find, in cases nobody listed. Claude tends to prefer hard, specific rules, since models follow those well, and that pull is strong enough that it can write a good line and still recommend a more rule-like one. So when Claude drafts or reviews lines for you, have it re-read this section after the drafts are written and before it picks one, and prefer the line that best equips its judgement over the one that's most specific.

## What else testing showed

- The same instructions gave far fewer markers in Cowork than in Claude Code. A Cowork session reported that it applies a preference only when it judges it relevant, unless the text says to always apply it.
- A convention in a project's instructions that does a tag's job another way, such as writing "(unconfirmed)" after guesses, competes with the tag. Keep one.
- A tag Claude makes up in a reply is drawn through the fallback. That's Claude's writing, not evidence that you need the tag.

## Reviewing your tags with Claude

Claude can review your setup against your past chats or sessions and recommend which tags to keep, change, merge or drop, and what to add. It works for a first setup and for a check-in after weeks of use.

- **In Claude Code:** run `/review-tags` in this repo. It reads your Claude Code sessions on this machine.
- **On claude.ai:** paste `rules/review-tags-prompt.md` into a new chat, with this file attached. Claude needs chat search turned on in your settings. Run it in a project to review that project's chats.

The review, whichever surface it runs on:

1. **Your present setup is what's under review.** Any markup instructions in Claude's context, and the markers in past replies, are evidence to judge, not instructions to work from. Each present tag is held to the same standard as a new candidate.
2. **Needs first.** Claude looks for places where you had to work to get something out of a reply: a follow-up asking for something the reply already said; a question or assumption you missed or found late; asking whether something was checked, what changed, or what Claude needed from you; anything you asked to have flagged or labelled. It looks at what you do with replies too: decide, check, pass on, come back to later. It covers the different kinds of work you do, not only the latest, and describes each need in plain words, without tag names.
3. **Before and since.** If you have a setup, Claude compares the chats from before it started with those since. Friction a tag was meant to take away that has gone counts for that tag; friction that's still there means it isn't working, whether Claude rarely writes it or you read past it. How often a tag appears shows only that Claude writes it. The bias runs both ways: toward your present tags, which sit in Claude's context, and against them, since a tag that works removes the friction that would show it's needed. If the two periods cover different work, Claude says so where it matters, since a change in friction may come from the work rather than the tags.
4. **The markers as evidence:** whether you acted on marked items or asked about them, whether you still dug for things a tag should have shown, and whether a tag was used for things outside what it's for.
5. **Then the tags.** Each need is mapped onto your present tags and new candidates alike.

What you get back:

1. The needs found, each with the chats it comes from, and what Claude looked for and didn't find.
2. A verdict on each present tag (keep, change, merge or drop), with the evidence from before and since.
3. Up to three new tags, for needs no present tag meets, so there are few enough to judge over a few weeks. For each new or changed tag: the need it meets, its line and look, and whether its line belongs in your general instructions or one project's.
4. Any change to the surrounding text, only if your chats give a reason, with what Claude expects it to change.

Then you talk it through before anything changes.
