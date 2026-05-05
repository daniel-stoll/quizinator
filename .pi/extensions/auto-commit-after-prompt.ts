import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const EXTENSION_NAME = "auto-commit-after-prompt";

function summarizePrompt(prompt: string): string {
	const firstLine = prompt.trim().split(/\r?\n/, 1)[0] ?? "";
	return firstLine.replace(/\s+/g, " ").slice(0, 72) || "user prompt";
}

export default function (pi: ExtensionAPI) {
	let lastPrompt = "user prompt";
	let committing = false;

	pi.on("before_agent_start", async (event) => {
		lastPrompt = summarizePrompt(event.prompt);
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (committing) return;
		committing = true;

		try {
			const inRepo = await pi.exec("git", ["rev-parse", "--is-inside-work-tree"], {
				cwd: ctx.cwd,
				timeout: 5_000,
			});
			if (inRepo.code !== 0 || inRepo.stdout.trim() !== "true") return;

			const status = await pi.exec("git", ["status", "--porcelain"], {
				cwd: ctx.cwd,
				timeout: 5_000,
			});
			if (status.code !== 0 || status.stdout.trim().length === 0) {
				ctx.ui.setStatus(EXTENSION_NAME, "auto-commit: no changes");
				return;
			}

			await pi.exec("git", ["add", "-A"], { cwd: ctx.cwd, timeout: 10_000 });
			const commit = await pi.exec(
				"git",
				["commit", "-m", `Auto-commit after prompt: ${lastPrompt}`],
				{ cwd: ctx.cwd, timeout: 30_000 },
			);

			if (commit.code === 0) {
				ctx.ui.notify("Auto-committed changes after your prompt.", "success");
				ctx.ui.setStatus(EXTENSION_NAME, "auto-commit: committed");
			} else {
				ctx.ui.notify(`Auto-commit failed: ${commit.stderr || commit.stdout}`, "error");
				ctx.ui.setStatus(EXTENSION_NAME, "auto-commit: failed");
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Auto-commit failed: ${message}`, "error");
			ctx.ui.setStatus(EXTENSION_NAME, "auto-commit: failed");
		} finally {
			committing = false;
		}
	});
}
