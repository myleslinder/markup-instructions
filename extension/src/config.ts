// The extension's config: the tags it draws, each with its symbol, colours and legend line. The default is the preset,
// bundled from presets/default.ts; the settings screen lets a person change it.

import { readRules, rulesInFile, withLines, type Backgrounds, type Config, type Frame } from "../../core/src/index.ts";
import { DEFAULT } from "../../presets/default.ts";

export const CONFIG: Config = DEFAULT;

/**
 * claude.ai's page background in each theme, which a colour derived for the other theme has to read on: the body's
 * `bg-surface-1`, as the saved claude.ai pages' stylesheets resolve it under `data-mode="light"` and `"dark"`.
 */
export const BACKGROUNDS: Backgrounds = { light: "#ffffff", dark: "#191919" };

/** The settings a person starts from, and goes back to on a reset: the config with each tag's line, and the frame. */
export type Defaults = { config: Config; frame: Frame };

/**
 * The default from claude.ai's rules file (`rules/markup-rules-claude-ai.md`): its frame, and each tag's line
 * joined with the colours and symbols in `CONFIG`.
 */
export function defaultsFrom(rulesFile: string): Defaults {
	const rules = readRules(rulesInFile(rulesFile));
	return { config: withLines(CONFIG, rules), frame: rules.frame };
}
