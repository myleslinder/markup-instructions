# Markup Instructions for claude.ai

This extension makes Claude's replies on claude.ai easier to scan. With the markup instructions in your preferences, Claude marks the items you want to find at a glance, each with a tag. The extension draws each marked item in its tag's colour, with a symbol in front, and hides the markup syntax. The included tags are a starting point: you can change them, their colours and their instructions in the extension's panel.

It works in Chrome 116 or later on claude.ai, in chats and in Cowork. It doesn't work in the desktop app.

## What it does and doesn't do

- It reads only the page you're on, after each reply finishes. It makes no network requests and doesn't read claude.ai's own traffic.
- It changes only how replies look. The copy button still copies the reply as Claude wrote it.
- It never writes into your claude.ai settings. You copy the markup instructions from its panel and paste them in yourself.
- It keeps your settings and a small log of counts in Chrome, which never leaves your machine unless you export it. The log shows how the markup is used: how many replies had markers, how often each tag appears, and whether anything failed to draw. It holds no text from your chats, except a short snippet around any marker that failed to draw. You can turn the snippets off in the panel.

## Install

1. Build it from the repo, with Node 24 and pnpm: `pnpm install`, then `pnpm build:ext`. The extension is built into `extension/dist/`.
2. In Chrome, go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `extension/dist/` folder.
5. Optionally, pin the extension from Chrome's puzzle-piece menu so its panel is one click away.

Reload any claude.ai tabs you already had open.

Clicking the extension's icon opens its panel at the side of the window. It has three sections: **Tags**, **Markup instructions** and **Log**.

## Add the markup instructions to claude.ai

The extension only draws the markup; Claude writes it only if the instructions are in your preferences.

1. Click the extension's icon. Under **Markup instructions**, click **Show markup instructions**, then **Copy**.
2. On claude.ai, open **Settings**, then **Your Claude**, and find the **Instructions** box. Paste the text in. If you already have instructions there, add it after them.
3. Save. New replies will use the markup; older ones won't change.

You can also paste the instructions into a project's instructions instead, so the markup is used only in that project. To use only some of the tags somewhere, delete the other tags' lines after pasting. The extension draws every tag in its list wherever Claude writes it.

`rules.md` in the built folder holds the default instructions, the same text the panel gives before you change anything.

## Reading the markup

By default, each marked item has a symbol in front and its own colour:

- `¿` something Claude needs from you, or a default it will go with unless you say otherwise
- `～` a guess: Claude filled a gap or gave its own reading, and you haven't agreed it
- `✓` something you decided or agreed
- `✎` something Claude changed
- `⌕` something Claude checked against a source

A name in brackets, like `[parked]`, is a tag that isn't in the extension's list, drawn in the colour for any other tag. Dim text after an item, like `#Q2` or a file name, is an ID or the source Claude checked.

## Changing the tags

Under **Tags**, each tag has its name, symbol, a colour for claude.ai's dark mode and one for light mode, and the fields its line in the markup instructions is built from, with samples of how it looks. **New tag** adds one at the end; **Remove this tag** takes one out. The last row sets the colour for any other tag.

- Your edits stay in the panel until you click **Save** at the bottom. **Discard changes** puts back what was saved. Edits you haven't saved are lost if you close the panel.
- After saving, reload your claude.ai tabs to see the changes.
- If you changed a tag's name or its line, copy the markup instructions again and replace the old ones in claude.ai, or Claude will keep writing the old tags. A line that mentions a tag no longer in your list is flagged.
- The text around the tags' lines is locked. It decides how often and where Claude marks at all, and a few words changed there have changed how much Claude marks by two to five times. You can unlock it after a warning; once changed, it has a way to reset it.
- **Reset everything to the default** puts back the default tags, colours and instructions (click it twice).

## The log

Click the extension's icon to open its panel. The **Log** section shows the dates covered, a few totals and how many times each tag was used, most used first, which helps when deciding which tags earn their place. **Copy log** and **Save as file** export the whole log as JSON, by day. **Clear** starts the log again (click it twice).

## Updates and removing it

To update, pull the repo and run `pnpm build:ext` again, then click the reload icon on the extension's card in `chrome://extensions`, and reload your claude.ai tabs. Your settings are kept: if you've saved changes to the tags, they stay as you saved them. If you haven't, you get the new default. The text around the tags' lines follows the new default unless you changed it.

To stop using it, remove the extension in `chrome://extensions` and take the markup instructions out of your claude.ai settings (and any project's instructions you pasted them into).
