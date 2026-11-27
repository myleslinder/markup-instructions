// The person's settings: one object in `chrome.storage.sync`, so it follows them across their Chrome installs.
// It holds a format version, the config
// (tags with symbol, colours and the fields of each tag's line; the fallback) and the frame, left out while it's the
// default's. Nothing stored means the default. A stored config with problems isn't drawn, and isn't saved.

import { checkConfig, type Config, type Frame } from "../../core/src/index.ts";
import type { Defaults } from "./config.ts";

/** Where the settings are kept in `chrome.storage.sync`. */
export const SETTINGS_KEY = "settings";
/** The settings' format, raised when what's stored changes shape. */
export const SETTINGS_FORMAT = 1;

export type Settings = { format: typeof SETTINGS_FORMAT; config: Config; frame?: Frame };

/**
 * The settings a page or the panel works from: the stored ones or the default, and what's wrong with them. Stored
 * settings that are `unreadable` (the wrong shape or an unknown format) come with the default's config and frame.
 */
export type Current = { config: Config; frame: Frame; stored: boolean; unreadable: boolean; problems: string[] };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isColour = (x: unknown) => typeof x === "string" || (isObject(x) && typeof x.dark === "string" && typeof x.light === "string");

/** What's wrong with a stored value's shape, before its content can be checked. */
function shapeProblems(x: Record<string, unknown>): string[] {
	if (x.format !== SETTINGS_FORMAT) return [`the stored settings have format ${JSON.stringify(x.format)}; this version reads ${SETTINGS_FORMAT}`];
	const { config, frame } = x;
	if (!isObject(config) || !isObject(config.tags) || !isColour(config.fallback)) return ["the stored config isn't a config"];
	const problems: string[] = [];
	for (const [name, style] of Object.entries(config.tags)) {
		const ok =
			isObject(style) &&
			typeof style.symbol === "string" &&
			typeof style.legend === "string" &&
			isColour(style.colour) &&
			(style.line === undefined ||
				(isObject(style.line) &&
					typeof style.line.brackets === "string" &&
					typeof style.line.purpose === "string" &&
					(style.line.attribute === undefined ||
						(isObject(style.line.attribute) && typeof style.line.attribute.name === "string" && typeof style.line.attribute.example === "string"))));
		if (!ok) problems.push(`${name}: the stored tag isn't a tag`);
	}
	if (frame !== undefined && !(isObject(frame) && typeof frame.before === "string" && typeof frame.after === "string"))
		problems.push("the stored frame isn't a frame");
	return problems;
}

/** The settings to work from, given what's stored (or `undefined`) and the default. */
export function current(stored: unknown, defaults: Defaults): Current {
	if (stored === undefined) return { ...defaults, stored: false, unreadable: false, problems: [] };
	if (!isObject(stored)) return { ...defaults, stored: true, unreadable: true, problems: ["the stored settings aren't an object"] };
	const shape = shapeProblems(stored);
	if (shape.length) return { ...defaults, stored: true, unreadable: true, problems: shape };
	const settings = stored as Settings;
	const problems = checkConfig(settings.config);
	return { config: settings.config, frame: settings.frame ?? defaults.frame, stored: true, unreadable: false, problems };
}

/** What's stored for a config and frame: the frame left out while it's the default's. */
export function toStore(config: Config, frame: Frame, defaults: Defaults): Settings {
	const isDefault = frame.before === defaults.frame.before && frame.after === defaults.frame.after;
	return isDefault ? { format: SETTINGS_FORMAT, config } : { format: SETTINGS_FORMAT, config, frame };
}

/** The settings from `chrome.storage.sync`. */
export async function loadSettings(defaults: Defaults): Promise<Current> {
	const got = await chrome.storage.sync.get(SETTINGS_KEY);
	return current(got[SETTINGS_KEY], defaults);
}

/** Saves a config and frame, unless the config has problems; returns them, empty when saved. */
export async function saveSettings(config: Config, frame: Frame, defaults: Defaults): Promise<string[]> {
	const problems = checkConfig(config);
	if (problems.length === 0) await chrome.storage.sync.set({ [SETTINGS_KEY]: toStore(config, frame, defaults) });
	return problems;
}

/** Back to the default: nothing stored. */
export async function resetSettings(): Promise<void> {
	await chrome.storage.sync.remove(SETTINGS_KEY);
}
