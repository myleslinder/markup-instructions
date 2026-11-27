Here's what's left before 0.2 can go out, in rough order. :changed[nothing] this turn.

1. :open-ask[Confirm which issues block 0.2]. My proposal is that I5 and I6 block, I3 is optional and I4 waits for 0.3. The plan doesn't name any blockers yet.
2. **Fix I5.** Remove the rounding from `convert`, then update the two tests and the README example that expect whole numbers (15 and 473).
3. **Fix I6.** Put a space between the whole number and the fraction in `formatAmount` ("1 ½"), then update the tests that expect "1½" and "2¾".
4. **Run the tests.** :guess[The I1 and I2 fixes already in your working tree probably pass], but I haven't run them because `npm test` needs your approval here.
5. :open-ask[Decide whether the "Reading Claude's replies" section stays in the README]. :checked[That section is an uncommitted change in README.md]{src="git diff README.md"}. Since npm shows the README as the package's page, it would be published there.
6. **Commit** the I1 and I2 fixes, the plan update and whatever you decide for the README.
7. **Bump the version.** :checked[package.json still says 0.1.0]{src="package.json:3"}.
8. **Check the package name.** :guess[The npm name "pantry" may already be taken]. Run `npm view pantry` to see.
9. :open-default[Add a "files" field to package.json so only src/ is published]. :checked[package.json has no "files" field]{src="package.json"}, so docs/ and test/ would ship too. They're harmless, so I'll leave it unless you want it changed.
10. **Publish** with `npm publish`.

I can do steps 2 to 4 and 7 as soon as you confirm step 1.