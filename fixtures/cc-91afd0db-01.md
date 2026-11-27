I've read the plan, the issues and the code; here are my recommendations.

**In short:** leave both Q1 and Q2 out of 0.2. Of the remaining issues, I5 and I6 should block the release; I3 and I4 should not.

## Q1: Converting between weight and volume per ingredient

:guess[Recommendation: not in 0.2. Add weight units now and leave densities for 0.3.]

- **Why not now:** a density table is mostly a data job, not code. A cup of flour weighs anywhere from about 120 to 140 g depending on the source and on whether it's sifted. Brown sugar changes with packing. You'd also need to match ingredient names ("flour" vs "all-purpose flour"). That's a lot to pin down for a release whose main goal is publishing.
- **What's missing first:** :checked[UNITS has only volume units, with no g, kg, oz or lb]{src="src/convert.js:2-10"}. Adding weight units as a separate group is cheap and needs no data. Gram-to-ounce conversion works right away, and `convert` would throw a clear error on cup-to-gram until densities exist.
- **Adding it later won't break anything:** densities can come in later as an optional argument, such as `convert(1, "cup", "g", { ingredient: "flour" })`. That keeps existing calls working, so leaving it out now doesn't commit the API.
- **What you give up:** the meal-planning app will want this eventually, for example to add up shopping lists by weight. Until then, the app has to do it itself.

## Q2: A CLI, or a library only

:guess[Recommendation: library only for 0.2.]

- The plan says pantry is meant to sit under an app, so a CLI has no user yet.
- With no dependencies (D1), you'd write the argument parsing yourself and pick an input format for recipes. Once published, that becomes more public behaviour you have to support.
- **What you give up:** a CLI makes a nice demo and a quick manual test. `node -e` covers the manual testing for now, and a CLI can be added in any later version without breaking anything.

## Which remaining issues should block 0.2

| Issue | Block? | Why |
|---|---|---|
| I5: `convert` rounds to whole ml | **Yes** | It's worse than the issue says (see below). Fixing it changes what `convert` returns, so do it before people depend on the current output. |
| I6: "1½" read aloud wrongly | **Yes** | A small fix, but it changes what `formatAmount` outputs, which is public. |
| I3: error doesn't name the recipe | No | Just a better error message, safe to add anytime. Include it if you like, since it's about one line. |
| I4: convert units while scaling | No | A new feature, not a bug, so goal 1 ("fix the open bugs") doesn't cover it. It also overlaps Q1's API design, so it's better done in 0.3 alongside that. |

**I5 is more serious than reported.** :checked[convert rounds every result to a whole number, so converting to a larger unit gives 0: convert(1, "tsp", "tbsp") and convert(1, "tbsp", "cup") both return 0]{src="src/convert.js:15"}. I worked this out from the code rather than running it, because running the tests needs your approval here. Rounding inside `convert` also cuts against the idea behind D3, that only display rounds. :guess[The fix is to drop the rounding in convert and let formatAmount or the caller round.] That will break :checked[the tests expecting 15 and 473]{src="test/convert.test.js:6,10"} and :checked[the README example showing 473]{src="README.md:8"}. All three would need updating, to about 14.787 and 473.176.

**For I6,** :guess[put a narrow no-break space between the whole number and the fraction, like "1 ½"]. That keeps the two together on one line and lets screen readers read them separately. The tests expecting "1½" and "2¾" would need updating.

**Before you publish,** :guess[the npm name "pantry" may already be taken]. Check with `npm view pantry`. I didn't look it up, so the name didn't go to an outside service.

:changed[nothing]. I haven't edited any files.

:open-ask[Do you agree with both recommendations and the blocking list?] If so, I'll add Q1 and Q2 to `docs/plan.md` as decisions D4 and D5, and then fix I5 and I6.