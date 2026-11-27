// The extension's background worker: it only sets the toolbar
// button to open the side panel. Chrome keeps the setting, so setting it each time the worker starts is harmless.

chrome.sidePanel
	.setPanelBehavior({ openPanelOnActionClick: true })
	.catch((e: unknown) => console.error("Markup Instructions: couldn't set the side panel to open from the toolbar button", e));
