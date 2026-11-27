// A button that acts only on a second click within a few seconds, for what can't be undone: the log's Clear and Reset
// everything. The first click changes its text to say so.

export function twoClick(button: HTMLElement, again: string, action: () => void): void {
	const win = button.ownerDocument.defaultView!;
	const label = button.textContent;
	let armed: number | undefined;
	button.addEventListener("click", () => {
		if (armed === undefined) {
			button.textContent = again;
			armed = win.setTimeout(() => {
				armed = undefined;
				button.textContent = label;
			}, 3000);
			return;
		}
		win.clearTimeout(armed);
		armed = undefined;
		button.textContent = label;
		action();
	});
}
