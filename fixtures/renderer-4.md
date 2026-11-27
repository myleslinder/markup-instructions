**Sample reply** (made-up scenario: moving a blog off WordPress)

---

The export is done and the new site builds locally. :decided[The new site uses Astro]{#D1}, and :decided[Old post URLs must keep working]{#D2}, so every post has a redirect.

:changed[Saved 142 posts as Markdown in content/posts and added redirects.json]. :changed[Deleted the old wp-uploads/thumbnails folder], because Astro creates new thumbnails when it builds the site.

:checked[All 142 posts from the WordPress export are in the new site]{src="wordpress-export.xml"}. :guess[The 9 posts without a featured image were meant to have none]. They're all short link posts, so I left them alone.

| Item | Status | Note |
|---|---|---|
| Post content | Migrated | Covered by D1 and D2 |
| Comments | :open-default[Comments are left out of the new site] | Tell me if you want them kept as a static archive |
| Domain | :open-ask[Point the domain's DNS at the new host] | This needs your registrar login |

:parked[A newsletter signup form waits until after launch]{#P1}. You mentioned it, but it isn't part of this move.

---

**The new tag: `:parked[…]`**

I took this one from your notes file. :checked[The notes file's entry statuses are open, done, dropped and parked]{src="notes/how-i-work.md"}. Your existing markers cover open questions, defaults, guesses and settled decisions. None of them marks something you chose to keep but put off. Without a marker, an item like that tends to read as either forgotten or waiting on you.

`:parked[…]` marks an item as kept but out of scope for now. With an ID like `{#P1}`, it works the way your log's `↳ builds on` links do: you can pick the item up later by name. That fits the idea from your 3 Oct planning note, where decision IDs work like citations instead of getting lost in the text.