// The mod's state: one value, the desktop app's
// light or dark mode, posted by hooks/mode-reporter.tsx and read by every reply and the legend drawn on the desktop.

export type Mode = "dark" | "light";

declare module "claude-code" {
	interface PluginState {
		markup: { mode: Mode };
	}
}
