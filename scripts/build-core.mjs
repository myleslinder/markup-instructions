// Bundles the shared core, the mod's drawing and the mod's config, each into one minified ESM file in the mod's folder. A mod
// can import only its own files, so the code and its dependencies go into the mod, committed so the mod works on a fresh checkout. `pnpm build` runs this;
// core/test/bundle.test.ts and mod/test/bundle.test.ts build with the same options into a temporary folder and check
// the committed files match.

import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);

/** Where the mod imports the bundle from. */
export const BUNDLE = fileURLToPath(new URL(".claude/skills/markup/hooks/core.mjs", root));

/** Where the mod imports the drawing from. */
export const DRAW_BUNDLE = fileURLToPath(new URL(".claude/skills/markup/hooks/draw.mjs", root));

/** Where the mod imports its config from: the preset, bundled from presets/default.ts. */
export const CONFIG_BUNDLE = fileURLToPath(new URL(".claude/skills/markup/hooks/config.mjs", root));

/** Builds the core into `outfile`. */
export async function buildCore(outfile = BUNDLE) {
	await bundle("core/src/index.ts", outfile);
}

/** Builds the mod's drawing into `outfile`. */
export async function buildDraw(outfile = DRAW_BUNDLE) {
	await bundle("mod/src/draw.ts", outfile);
}

/** Builds the mod's config into `outfile`. */
export async function buildConfig(outfile = CONFIG_BUNDLE) {
	await bundle("presets/default.ts", outfile);
}

async function bundle(entry, outfile) {
	await build({
		entryPoints: [fileURLToPath(new URL(entry, root))],
		outfile,
		bundle: true,
		format: "esm",
		platform: "neutral",
		mainFields: ["module", "main"],
		minify: true,
		logLevel: "warning",
	});
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await Promise.all([buildCore(), buildDraw(), buildConfig()]);
