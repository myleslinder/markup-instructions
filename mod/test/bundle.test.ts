// The drawing's bundle: the file the mod actually loads. It mirrors the core's bundle test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
// @ts-expect-error: a plain .mjs script with no type declarations
import { CONFIG_BUNDLE, DRAW_BUNDLE, buildConfig, buildDraw } from "../../scripts/build-core.mjs";
import { type Block } from "../../core/src/index.ts";
import { parse, loadFixtures } from "../../core/test/helpers.ts";
import { DEFAULT } from "../../presets/default.ts";

const bundle: string = readFileSync(DRAW_BUNDLE, "utf8");

test("the committed drawing bundle matches a fresh build: run pnpm build and commit it", async () => {
	const dir = mkdtempSync(join(tmpdir(), "draw-bundle-"));
	try {
		const fresh = join(dir, "draw.mjs");
		await buildDraw(fresh);
		assert.ok(readFileSync(fresh, "utf8") === bundle, "the bundle is out of date");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("the drawing bundle is small, with no dynamic import and no node: imports", () => {
	assert.ok(Buffer.byteLength(bundle) < 64 * 1024, `${Buffer.byteLength(bundle)} bytes`);
	assert.ok(!bundle.includes("import("), "dynamic import(");
	assert.ok(!bundle.includes('"node:') && !bundle.includes("'node:"), "node: import specifier");
});

test("the drawing bundle draws every fixture as its snapshot says", async () => {
	const { draw } = (await import(pathToFileURL(DRAW_BUNDLE).href)) as { draw: (blocks: Block[]) => unknown };
	const snapshots = new URL("snapshots/", import.meta.url);
	for (const { name, markdown } of loadFixtures()) {
		const snapshot = JSON.parse(readFileSync(new URL(name.replace(/\.md$/, ".json"), snapshots), "utf8"));
		assert.deepEqual(JSON.parse(JSON.stringify(draw(parse(markdown)))), snapshot, name);
	}
});

test("the committed config bundle matches a fresh build of presets/default.ts: run pnpm build and commit it", async () => {
	const dir = mkdtempSync(join(tmpdir(), "config-bundle-"));
	try {
		const fresh = join(dir, "config.mjs");
		await buildConfig(fresh);
		assert.ok(readFileSync(fresh, "utf8") === readFileSync(CONFIG_BUNDLE, "utf8"), "the bundle is out of date");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("the config bundle holds the preset and imports nothing", async () => {
	assert.ok(!/\bimport\b/.test(readFileSync(CONFIG_BUNDLE, "utf8")), "no imports");
	const loaded = (await import(pathToFileURL(CONFIG_BUNDLE).href)) as { DEFAULT: unknown };
	assert.deepEqual(loaded.DEFAULT, DEFAULT);
});
