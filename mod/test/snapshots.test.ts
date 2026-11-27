// Render snapshots: what the drawing returns for each fixture, saved in mod/test/snapshots/<fixture>.json, null for a
// fixture with no markers. Colours and symbols are named by tag, so a palette change doesn't touch them.
//
// To write them: `pnpm snapshots` (UPDATE_SNAPSHOTS=1), which writes the core's too. Review the diff before committing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse, loadFixtures } from "../../core/test/helpers.ts";
import { draw } from "../src/draw.ts";

const dir = new URL("snapshots/", import.meta.url);
const update = process.env.UPDATE_SNAPSHOTS === "1";
const fixtures = loadFixtures();

if (update) mkdirSync(dir, { recursive: true });

for (const { name, markdown } of fixtures) {
	const file = new URL(name.replace(/\.md$/, ".json"), dir);

	test(`${name}: the drawing matches its snapshot`, () => {
		const json = JSON.stringify(draw(parse(markdown)), null, "\t") + "\n";
		if (update) writeFileSync(file, json);
		assert.ok(existsSync(file), `no snapshot for ${name}: run pnpm snapshots and review the new file`);
		assert.deepEqual(JSON.parse(json), JSON.parse(readFileSync(file, "utf8")));
	});
}

test("every render snapshot has a fixture", () => {
	const names = new Set(fixtures.map((f) => f.name.replace(/\.md$/, ".json")));
	const orphans = existsSync(dir) ? readdirSync(dir).filter((name) => !names.has(name)) : [];
	assert.deepEqual(orphans, [], "snapshots whose fixture is gone: delete them");
});
