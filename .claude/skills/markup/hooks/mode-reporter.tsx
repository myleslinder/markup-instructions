import type { ClientModule } from "claude-code";

import type { Mode } from "../types";

// The desktop app's mode, for the hooks module, which can't read it. This module runs in the app itself, where the system's colour scheme can be read. Each block the
// mod draws on the desktop carries one, handed the mode the block was drawn in. It posts the app's mode when that
// differs, once when it starts and again whenever the system's appearance changes, and draws nothing.

type Props = { mode: Mode };
type State = { seen: Mode };

const QUERY = "(prefers-color-scheme: dark)";

type MediaQuery = { matches: boolean; addEventListener?: (type: "change", listener: () => void) => void };

function query(): MediaQuery | undefined {
	const g = globalThis as { matchMedia?: (q: string) => MediaQuery };
	try {
		return typeof g.matchMedia === "function" ? g.matchMedia(QUERY) : undefined;
	} catch {
		return undefined;
	}
}

/** The app's mode: light where the colour scheme can't be read (no such place has been seen). */
const appMode = (): Mode => (query()?.matches ? "dark" : "light");

const ModeReporter: ClientModule<Props, State> = (props, surface) => {
	const { Text } = surface.elements;
	if (surface.state === undefined) {
		const seen = appMode();
		const check = () => {
			const mode = appMode();
			if (mode === surface.state?.seen) return;
			surface.post({ mode });
			surface.setState({ seen: mode });
		};
		// The change event where the app fires it; the poll in case it doesn't.
		query()?.addEventListener?.("change", check);
		surface.every(1000, check);
		if (seen !== props.mode) surface.post({ mode: seen });
		surface.setState({ seen });
	}
	return <Text>{""}</Text>;
};

export default ModeReporter;
