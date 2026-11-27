import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
// @ts-expect-error: a plain .mjs script without types
import { buildExtension } from "../../scripts/build-extension.mjs";

test("the build asks only for storage and the side panel, and has no dynamic import", async () => {
	const dir = await buildExtension({ outdir: join(mkdtempSync(join(tmpdir(), "mk-ext-")), "dist") });
	const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
	assert.deepEqual(manifest.permissions, ["storage", "sidePanel"]);
	assert.equal(manifest.host_permissions, undefined);
	const content = readFileSync(join(dir, "content.js"), "utf8");
	assert.ok(!/\bimport\(/.test(content));
	assert.ok(readFileSync(join(dir, "INSTALL.md"), "utf8").includes("rules.md"));
	const rules = readFileSync(new URL("../../rules/markup-rules-claude-ai.md", import.meta.url), "utf8");
	assert.equal(readFileSync(join(dir, "rules.md"), "utf8"), rules.trimStart(), "claude.ai's rules text");
});

test("the toolbar button opens the side panel: a background worker that sets it, the panel's page, no popup", async () => {
	const dir = await buildExtension({ outdir: join(mkdtempSync(join(tmpdir(), "mk-ext-")), "dist") });
	const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
	assert.equal(manifest.action.default_popup, undefined);
	assert.ok(!existsSync(join(dir, "popup.html")));
	assert.equal(manifest.side_panel.default_path, "sidepanel.html");
	assert.match(readFileSync(join(dir, manifest.background.service_worker), "utf8"), /setPanelBehavior\(\{\s*openPanelOnActionClick:\s*!0\s*\}\)/);
	const panel = readFileSync(join(dir, "sidepanel.html"), "utf8");
	assert.ok(panel.includes('<script src="sidepanel.js"></script>'));
	assert.ok(existsSync(join(dir, "sidepanel.js")));
	assert.ok(!existsSync(join(dir, "sidepanel-mock.js")));
});
