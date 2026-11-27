// Snapshots: each fixture's parse() output, saved in core/test/snapshots/<fixture>.json.
// The invariants check that no text is lost; the snapshots pin everything else (kinds, formatting, URLs, tags, IDs, src),
// so any change to the output shows up as a diff to review.
//
// To write them: `pnpm snapshots` (UPDATE_SNAPSHOTS=1). A new fixture has no snapshot until then, so this test fails
// until its output has been looked at and saved on purpose.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { parse, loadFixtures } from "./helpers.ts";

const dir = new URL("snapshots/", import.meta.url);
const update = process.env.UPDATE_SNAPSHOTS === "1";
const fixtures = loadFixtures();

if (update) mkdirSync(dir, { recursive: true });

for (const { name, markdown } of fixtures) {
	const file = new URL(name.replace(/\.md$/, ".json"), dir);

	test(`${name}: parse() output matches its snapshot`, () => {
		const json = JSON.stringify(parse(markdown), null, "\t") + "\n";
		if (update) writeFileSync(file, json);
		assert.ok(existsSync(file), `no snapshot for ${name}: run pnpm snapshots and review the new file`);
		// Compared as data, not text, so a failure shows which field changed. The round trip drops undefined fields.
		assert.deepEqual(JSON.parse(json), JSON.parse(readFileSync(file, "utf8")));
	});
}

test("every snapshot has a fixture", () => {
	const names = new Set(fixtures.map((f) => f.name.replace(/\.md$/, ".json")));
	const orphans = existsSync(dir) ? readdirSync(dir).filter((name) => !names.has(name)) : [];
	assert.deepEqual(orphans, [], "snapshots whose fixture is gone: delete them");
});
