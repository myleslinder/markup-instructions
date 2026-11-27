I'll read the project setup and both docs, then come back with suggestions.

I read the project instructions and both docs. The thinking is solid. Most of my suggestions are about separating the docs before the build starts, and about the three open questions that shape the architecture.

## Re-organisation

1. **Split the spec into three docs.** It's now spec, trial log, preference text, delivery notes, renderer brief and history all in one file. :guess[Move the trial log (tests 1–6) into its own doc, e.g. trial-log.md], and keep the spec to the markup, the writing rules, the preference text and the renderer's guarantees. The renderer work will mostly change the renderer sections, and the trials will mostly change the log. In one file, every edit bumps a version on things that didn't change.
2. **Freeze the research doc as a dated record.** Hybrid input, the hard parts and the open questions are currently written out in both docs, so they'll drift. :guess[The spec holds the current decisions; the dated research doc stays as written and is never updated], with the spec linking to it for the reasoning. That's what its date-stamped name already suggests.
3. **Add a code repo.** :open[Where should the extension code and fixtures/ live?] The project has no files yet, and project docs aren't a good fit for HTML fixtures or code. :guess[A GitHub repo holding the extension, fixtures/ and a test harness, with the docs staying in this project], and the instructions pointing to the repo.
4. **Separate the two tracks in "Next steps".** Test 6 tests the writing rules and doesn't block the renderer. :guess[Split "Next steps" into a rules track (test 6, the test 4 hypotheses) and a renderer track], so the build doesn't wait on trials.
5. **Trim Notes V2 background.** :guess[The Notes V2 link and "History" can shrink to a line or two] now that this is its own project.

## Project instructions

- Add the repo location and where the trial log lives once both exist.
- :checked[The instructions call the research doc's testing plan the plan, but the doc labels it "Claude's proposal" except for the self-check]{src="2026-10-14-renderer-approach-research.md"}. :open[Do you agree the testing plan (test pairs, invariant checks, edge cases, live-page checks, visual check)?] If you do, it becomes agreed in the spec.
- :guess[Say the research doc is a dated snapshot and isn't edited.]

## Decisions that shape the architecture

These are already open in the spec. I think they need answers before any code, because each one changes the design:

- :open[Syntax visibility: may the renderer hide the directive syntax and keep only the label?] This decides more than the check. :guess[The CSS Custom Highlight API can only change things like colour and underline; it can't hide text.] So hiding the syntax means editing the page itself, which brings back the clash with the page framework. Keeping the syntax visible lets the whole thing run on highlights.
- :open[Do you read most replies in Chrome or in the Mac app?] If it's the Mac app, a Chrome extension mostly helps colleagues, and the priorities change.
- :open[Have you checked the terms on passively reading the responses the page already receives?] If not, the network half of the hybrid input is at risk, and the page-only fallback becomes the main path.

## A first milestone that needs no Chrome

:guess[Start with an offline harness: run remark-directive over each fixture .md to get the expected markers, find each label in the paired .html's visible text, and report any misses.] That answers the spec's "To check" item (`10:30[`, URLs, characters before the colon). It also shows how often labels are split across page elements, and it becomes the regression suite for the extension later. It only needs fixtures. :open[Can you copy the replies from tests 1–5 (markdown from the copy button, plus saved page HTML) out of the iOS project?] This reply has markers too, so it could be test 7.

:changed[nothing]. If you agree, I can do the doc split and the instructions update in one pass.