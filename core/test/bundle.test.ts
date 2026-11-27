// The bundle: the file the mod actually loads.
// Every other test imports core/src, so this one checks the committed bundle: that it is current, that the mod runtime
// can load it (small, no dynamic import, no Node built-ins), and that it parses every fixture exactly as its snapshot says,
// so minifying or esbuild's choices can't change the output unnoticed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
// @ts-expect-error: a plain .mjs script with no type declarations
import { BUNDLE, buildCore } from "../../scripts/build-core.mjs";
import type { Block, ParseOptions } from "../src/index.ts";
import { DEFAULT_TAGS } from "../../presets/default.ts";
import { loadFixtures } from "./helpers.ts";

const bundle: string = readFileSync(BUNDLE, "utf8");

test("the committed bundle matches a fresh build: run pnpm build and commit it", async () => {
	const dir = mkdtempSync(join(tmpdir(), "core-bundle-"));
	try {
		const fresh = join(dir, "core.mjs");
		await buildCore(fresh);
		assert.ok(readFileSync(fresh, "utf8") === bundle, "the bundle is out of date");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("the bundle is under 1 MiB", () => {
	assert.ok(Buffer.byteLength(bundle) < 1024 * 1024, `${Buffer.byteLength(bundle)} bytes`);
});

test("the bundle has no dynamic import and no node: imports", () => {
	// A mod module containing import() doesn't load, and the mod runtime has no Node. Match the quoted specifier, not the
	// bare word, since "node:" turns up in comments and minified object keys.
	assert.ok(!bundle.includes("import("), "dynamic import(");
	assert.ok(!bundle.includes('"node:') && !bundle.includes("'node:"), "node: import specifier");
});

test("the bundle parses every fixture as its snapshot says", async () => {
	const { parse } = (await import(pathToFileURL(BUNDLE).href)) as { parse: (markdown: string, options: ParseOptions) => Block[] };
	const snapshots = new URL("snapshots/", import.meta.url);
	for (const { name, markdown } of loadFixtures()) {
		const snapshot = JSON.parse(readFileSync(new URL(name.replace(/\.md$/, ".json"), snapshots), "utf8"));
		// The same round trip as the snapshot test, which drops undefined fields.
		assert.deepEqual(JSON.parse(JSON.stringify(parse(markdown, { tags: DEFAULT_TAGS }))), snapshot, name);
	}
});
