// Builds the Chrome extension into extension/dist/, the folder Chrome loads unpacked. It isn't committed.

import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const path = (p) => fileURLToPath(new URL(p, root));

/** claude.ai's rules text: the extension's default, and the rules.md the build ships. */
export const CLAUDE_AI_RULES = "rules/markup-rules-claude-ai.md";

/**
 * The extension's default settings, from claude.ai's rules file: the preset's tags with each tag's line, and the frame. The file
 * has to read into the extension's tags and give its text back exactly, and a default with problems isn't built.
 */
export async function buildDefaults() {
	const rulesFile = readFileSync(path(CLAUDE_AI_RULES), "utf8");
	const { defaultsFrom } = await import("../extension/src/config.ts");
	const { checkConfig, rulesFor, rulesInFile } = await import("../core/src/index.ts");
	const defaults = defaultsFrom(rulesFile);
	const problems = checkConfig(defaults.config);
	if (problems.length) throw new Error(`The extension's default has problems:\n${problems.join("\n")}`);
	if (rulesFor(defaults.config, defaults.frame) !== rulesInFile(rulesFile)) throw new Error(`${CLAUDE_AI_RULES} doesn't come back as written`);
	return { defaults, rulesFile };
}

/** Builds into `outdir` and returns it. */
export async function buildExtension({ outdir = path("extension/dist") } = {}) {
	rmSync(outdir, { recursive: true, force: true });
	mkdirSync(outdir, { recursive: true });
	const { defaults, rulesFile } = await buildDefaults();
	await build({
		entryPoints: {
			content: path("extension/src/content.ts"),
			background: path("extension/src/background.ts"),
			sidepanel: path("extension/src/sidepanel.ts"),
		},
		outdir,
		bundle: true,
		format: "iife",
		platform: "browser",
		target: "chrome120",
		minify: true,
		// The default goes in as data; the content script reads the person's settings at startup and falls back to it.
		define: { DEFAULTS: JSON.stringify(defaults) },
		logLevel: "warning",
	});
	const manifest = JSON.parse(readFileSync(path("extension/manifest.json"), "utf8"));
	writeFileSync(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
	copyFileSync(path("extension/sidepanel.html"), `${outdir}/sidepanel.html`);
	// The install note, and claude.ai's rules text to paste into its preferences.
	copyFileSync(path("extension/INSTALL.md"), `${outdir}/INSTALL.md`);
	writeFileSync(`${outdir}/rules.md`, rulesFile.trimStart());
	return outdir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const dir = await buildExtension();
	console.log(`Built ${dir}`);
}
