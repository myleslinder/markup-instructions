**Sample reply** (same made-up blog move)

---

:decided[Old post URLs must keep working]{#D2}. Here's the redirect config I'd add to the project:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';

export default defineConfig({
  redirects: {
    '/2019/03/hello-world/': '/posts/hello-world/',
    '/2020/07/moving-house/': '/posts/moving-house/',
  },
});
```

:guess[The old WordPress URLs all follow the /year/month/slug/ pattern]. I only looked at two of them, so it's worth spot-checking a few more.

:open-ask[Paste the config into astro.config.mjs and run the dev server]. After that I can check that the redirects resolve.

:changed[nothing]. The config exists only in this reply.

---

To test the edge case your preferences mention, this block shows the marker syntax literally. It should come through as plain text, not highlighted:

```markdown
:decided[Old post URLs must keep working]{#D2}
:open-ask[Point the domain's DNS at the new host]
```