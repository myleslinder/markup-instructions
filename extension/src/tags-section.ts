// The side panel's Tags section: one row per tag with
// its name, symbol, colours, the fields its line is built from and the built line, a sample on claude.ai's dark and light
// backgrounds, and Remove; New tag; the fallback's row; Reset everything. Each field's problem shows beside it. The rows
// are the panel's working copy; every edit is passed on, and kept until it's saved or discarded (src/sidepanel.ts).

import { tagLine } from "../../core/src/index.ts";
import { colourProblem, lineOf, newRow, rowProblems, type Row, type Rows, type Shades } from "./panel-tags.ts";
import { twoClick } from "./two-click.ts";

const HEX = /^#[0-9a-fA-F]{6}$/;

type Options = {
	/** Called after every edit with the rows as they now are. */
	edited(rows: Rows): void;
	/** Puts everything back to the default, and returns the default's rows. */
	reset(): Promise<Rows>;
};

/** Fills the Tags section of `doc` from `rows` and wires its controls; `load` shows other rows, as after Discard changes. */
export function startTags(doc: Document, initial: Rows, options: Options): { load(rows: Rows): void } {
	const $ = (id: string) => doc.getElementById(id)!;
	let rows = initial;
	const refreshers = new Map<Element, () => void>();

	function paint(el: HTMLElement, c: Shades): void {
		el.style.setProperty("--c-dark", HEX.test(c.dark) ? c.dark : "transparent");
		el.style.setProperty("--c-light", HEX.test(c.light) ? c.light : "transparent");
	}

	function wireColours(row: HTMLElement, c: Shades, after: () => void): void {
		for (const mode of ["dark", "light"] as const) {
			const pick = row.querySelector<HTMLInputElement>(`.pick-${mode}`)!;
			const hex = row.querySelector<HTMLInputElement>(`.hex-${mode}`)!;
			if (HEX.test(c[mode])) pick.value = c[mode];
			hex.value = c[mode];
			hex.setAttribute("aria-label", `Colour on ${mode}, as hex`);
			pick.addEventListener("input", () => {
				c[mode] = hex.value = pick.value;
				after();
			});
			hex.addEventListener("input", () => {
				c[mode] = hex.value.trim();
				if (HEX.test(c[mode])) pick.value = c[mode];
				after();
			});
		}
	}

	function show(el: Element, text: string): void {
		(el as HTMLElement).hidden = !text;
		el.textContent = text;
	}

	function tagRow(tag: Row): HTMLDetailsElement {
		const row = ($("tag-row") as HTMLTemplateElement).content.firstElementChild!.cloneNode(true) as HTMLDetailsElement;
		row.dataset.id = String(tag.id);
		const q = <T extends Element = HTMLInputElement>(s: string) => row.querySelector(s) as T;
		q(".name").value = tag.name;
		q(".symbol").value = tag.symbol;
		q<HTMLTextAreaElement>(".desc").value = tag.purpose;
		q(".hint-in").value = tag.brackets;
		q(".attr-name").value = tag.attrName;
		q(".attr-example").value = tag.attrExample;
		if (tag.attrName || tag.attrExample) q<HTMLDetailsElement>(".attr").open = true;

		const refresh = () => {
			paint(row, tag);
			const shown = tag.name || "new tag";
			for (const chip of row.querySelectorAll(".chip")) chip.textContent = `${tag.symbol} ${shown}`;
			for (const lab of row.querySelectorAll(".sample .lab")) lab.textContent = `${tag.symbol} a label in this colour`;
			const p = rowProblems(tag, rows);
			show(q(".name-err"), p.name);
			q(".name").setAttribute("aria-invalid", String(Boolean(p.name)));
			q(".symbol").setAttribute("aria-invalid", String(Boolean(p.symbol)));
			for (const sel of [".hex-dark", ".hex-light"]) q(sel).setAttribute("aria-invalid", String(Boolean(p.colour)));
			show(q(".colour-err"), [p.colour, p.symbol].filter(Boolean).join(" "));
			show(q(".line-err"), [p.line, ...p.flags].filter(Boolean).join(" "));
			q<HTMLTextAreaElement>(".desc").setAttribute("aria-invalid", String(Boolean(p.line)));
			q(".line-preview").textContent = tagLine(tag.name || "name", lineOf(tag));
			(q(".row-flag") as HTMLElement).hidden = !(p.name || p.symbol || p.colour || p.line || p.flags.length);
		};

		const text = (sel: string, set: (v: string) => void, all = true) =>
			q<HTMLInputElement | HTMLTextAreaElement>(sel).addEventListener("input", (e) => {
				set((e.target as HTMLInputElement).value);
				if (all) refreshAll();
				else refresh();
				options.edited(rows);
			});
		// A rename changes the tag's own line with it, and other tags' lines that mention the old name are flagged.
		text(".name", (v) => (tag.name = v.trim()));
		text(".symbol", (v) => (tag.symbol = v.trim()), false);
		text(".desc", (v) => {
			tag.purpose = v;
			if (tag.legendIsPurpose) tag.legend = v.trim();
		});
		text(".hint-in", (v) => (tag.brackets = v.trim()), false);
		text(".attr-name", (v) => (tag.attrName = v.trim()), false);
		text(".attr-example", (v) => (tag.attrExample = v.trim()), false);
		wireColours(row, tag, () => {
			refresh();
			options.edited(rows);
		});
		q(".remove").addEventListener("click", () => {
			rows.tags = rows.tags.filter((t) => t !== tag);
			refreshers.delete(row);
			row.remove();
			refreshAll();
			options.edited(rows);
			($("new-tag") as HTMLElement).focus();
		});
		refreshers.set(row, refresh);
		refresh();
		return row;
	}

	function fallbackRow(): HTMLDetailsElement {
		const row = ($("fallback-row") as HTMLTemplateElement).content.firstElementChild!.cloneNode(true) as HTMLDetailsElement;
		const refresh = () => {
			paint(row, rows.fallback);
			const p = colourProblem(rows.fallback);
			show(row.querySelector(".colour-err")!, p);
			for (const sel of [".hex-dark", ".hex-light"]) row.querySelector(sel)!.setAttribute("aria-invalid", String(Boolean(p)));
			(row.querySelector(".row-flag") as HTMLElement).hidden = !p;
		};
		wireColours(row, rows.fallback, () => {
			refresh();
			options.edited(rows);
		});
		refresh();
		return row;
	}

	function render(): void {
		refreshers.clear();
		$("tags").replaceChildren(...rows.tags.map(tagRow));
		$("fallback").replaceChildren(fallbackRow());
	}

	function refreshAll(): void {
		for (const refresh of refreshers.values()) refresh();
	}

	$("new-tag").addEventListener("click", () => {
		const tag = newRow();
		rows.tags.push(tag);
		const row = tagRow(tag);
		row.open = true;
		$("tags").appendChild(row);
		row.querySelector<HTMLInputElement>(".name")!.focus();
		refreshAll();
		options.edited(rows);
	});

	twoClick($("reset-all"), "Click again to reset your tags, colours and text", () => {
		void options.reset().then((fresh) => {
			rows = fresh;
			render();
		});
	});

	render();
	return {
		load(fresh) {
			rows = fresh;
			render();
		},
	};
}
