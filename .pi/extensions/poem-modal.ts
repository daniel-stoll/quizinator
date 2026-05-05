import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import {
	Input,
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
	type Focusable,
	type TUI,
} from "@mariozechner/pi-tui";

const SYSTEM_PROMPT = `Du bist ein großartiger deutschsprachiger Lyriker in einem Terminal-Modal.
Schreibe auf Anfrage kurze, funkelnde, originelle Gedichte.

Regeln:
- Antworte nur mit dem Gedicht und einem passenden Titel.
- 4 bis 12 Zeilen, außer der Nutzer fragt nach etwas anderem.
- Warm, verspielt, bildhaft, gerne mit Reim.
- Wenn der Nutzer eine Sprache vorgibt, nutze diese Sprache.`;

type GeneratePoem = (prompt: string, signal: AbortSignal) => Promise<string>;

class PoemModal implements Component, Focusable {
	private input = new Input();
	private poem = "Frag mich nach einem Thema, einer Stimmung oder einem Anlass — ich dichte für dich.";
	private loading = false;
	private error: string | undefined;
	private abortController: AbortController | undefined;
	private _focused = false;

	constructor(
		private tui: TUI,
		private theme: Theme,
		private generatePoem: GeneratePoem,
		private done: (result: string | null) => void,
	) {
		this.input.onSubmit = (value) => void this.submit(value);
		this.input.onEscape = () => this.close();
	}

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.close();
			return;
		}

		this.input.handleInput(data);
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const innerWidth = Math.max(20, width - 4);
		const border = "─".repeat(Math.max(0, width - 2));
		const lines: string[] = [
			this.theme.fg("accent", `╭${border}╮`),
			this.pad(this.theme.fg("accent", this.theme.bold("✦ Poem Modal ✦")), innerWidth),
			this.pad(this.theme.fg("dim", "Enter: dichten • Esc/Ctrl+C: schließen"), innerWidth),
			this.pad("", innerWidth),
			this.pad(this.theme.fg("muted", "Worüber soll ich dichten?"), innerWidth),
			this.pad(`❯ ${this.input.render(Math.max(1, innerWidth - 2))[0] ?? ""}`, innerWidth),
			this.pad("", innerWidth),
		];

		if (this.loading) {
			lines.push(this.pad(this.theme.fg("warning", "Ich sammle Sternenstaub und baue Reime ..."), innerWidth));
		} else if (this.error) {
			for (const line of wrapTextWithAnsi(this.theme.fg("error", this.error), innerWidth)) {
				lines.push(this.pad(line, innerWidth));
			}
		} else {
			for (const line of wrapTextWithAnsi(this.poem, innerWidth)) {
				lines.push(this.pad(line, innerWidth));
			}
		}

		lines.push(this.theme.fg("accent", `╰${border}╯`));
		return lines.map((line) => truncateToWidth(line, width, ""));
	}

	invalidate(): void {
		this.input.invalidate();
	}

	private async submit(rawPrompt: string): Promise<void> {
		const prompt = rawPrompt.trim();
		if (!prompt || this.loading) return;

		this.loading = true;
		this.error = undefined;
		this.abortController = new AbortController();
		this.tui.requestRender();

		try {
			this.poem = await this.generatePoem(prompt, this.abortController.signal);
			this.input.setValue("");
		} catch (error) {
			if (this.abortController.signal.aborted) return;
			this.error = error instanceof Error ? error.message : String(error);
		} finally {
			this.loading = false;
			this.abortController = undefined;
			this.tui.requestRender();
		}
	}

	private close(): void {
		if (this.loading) {
			this.abortController?.abort();
		}
		this.done(null);
	}

	private pad(text: string, innerWidth: number): string {
		const truncated = truncateToWidth(text, innerWidth, "");
		const padding = " ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)));
		return `${this.theme.fg("accent", "│")} ${truncated}${padding} ${this.theme.fg("accent", "│")}`;
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("poem", {
		description: "Öffnet ein modales Terminal-UI für tolle Gedichte",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/poem braucht den interaktiven Modus", "error");
				return;
			}

			if (!ctx.model) {
				ctx.ui.notify("Kein Modell ausgewählt", "error");
				return;
			}

			await ctx.ui.custom<string | null>(
				(tui, theme, _kb, done) => {
					const generatePoem: GeneratePoem = async (prompt, signal) => {
						const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
						if (!auth.ok || !auth.apiKey) {
							throw new Error(auth.ok ? `Kein API-Key für ${ctx.model!.provider}` : auth.error);
						}

						const message: UserMessage = {
							role: "user",
							content: [{ type: "text", text: prompt }],
							timestamp: Date.now(),
						};

						const response = await complete(
							ctx.model!,
							{ systemPrompt: SYSTEM_PROMPT, messages: [message] },
							{ apiKey: auth.apiKey, headers: auth.headers, signal },
						);

						if (response.stopReason === "aborted") return "";
						return response.content
							.filter((part): part is { type: "text"; text: string } => part.type === "text")
							.map((part) => part.text)
							.join("\n")
							.trim();
					};

					return new PoemModal(tui, theme, generatePoem, done);
				},
				{
					overlay: true,
					overlayOptions: {
						width: "70%",
						minWidth: 48,
						maxHeight: "80%",
						anchor: "center",
						margin: 2,
					},
				},
			);
		},
	});
}
