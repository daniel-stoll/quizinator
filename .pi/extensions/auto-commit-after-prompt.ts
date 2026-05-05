import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const EXTENSION_NAME = "auto-commit-after-prompt";
const MUTATING_TOOLS = new Set(["edit", "write"]);

function summarizePrompt(prompt: string): string {
	const firstLine = prompt.trim().split(/\r?\n/, 1)[0] ?? "";
	return firstLine.replace(/\s+/g, " ").slice(0, 72) || "user prompt";
}

async function isGitRepo(pi: ExtensionAPI, cwd: string): Promise<boolean> {
	const result = await pi.exec("git", ["rev-parse", "--is-inside-work-tree"], {
		cwd,
		timeout: 5_000,
	});
	return result.code === 0 && result.stdout.trim() === "true";
}

async function gitPull(pi: ExtensionAPI, ctx: ExtensionContext, reason: string): Promise<boolean> {
	if (!(await isGitRepo(pi, ctx.cwd))) return false;

	ctx.ui.setStatus(EXTENSION_NAME, `auto-commit: pulling before ${reason}`);
	const pull = await pi.exec("git", ["pull", "--ff-only"], {
		cwd: ctx.cwd,
		timeout: 60_000,
	});

	if (pull.code === 0) return true;

	ctx.ui.notify(`Git pull before ${reason} failed: ${pull.stderr || pull.stdout}`, "error");
	ctx.ui.setStatus(EXTENSION_NAME, "auto-commit: pull failed");
	return false;
}

async function gitPush(pi: ExtensionAPI, ctx: ExtensionContext): Promise<boolean> {
	if (!(await isGitRepo(pi, ctx.cwd))) return false;

	ctx.ui.setStatus(EXTENSION_NAME, "auto-commit: pushing");
	const push = await pi.exec("git", ["push"], {
		cwd: ctx.cwd,
		timeout: 60_000,
	});

	if (push.code === 0) return true;

	ctx.ui.notify(`Git push failed: ${push.stderr || push.stdout}`, "error");
	ctx.ui.setStatus(EXTENSION_NAME, "auto-commit: push failed");
	return false;
}

export default function (pi: ExtensionAPI) {
	let lastPrompt = "user prompt";
	let committing = false;

	pi.on("before_agent_start", async (event, ctx) => {
		lastPrompt = summarizePrompt(event.prompt);
		await gitPull(pi, ctx, "prompt");
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!MUTATING_TOOLS.has(event.toolName)) return;

		const ok = await gitPull(pi, ctx, `${event.toolName} change`);
		if (!ok) {
			return {
				block: true,
				reason: `Blocked ${event.toolName}: git pull failed before making changes.`,
			};
		}
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (committing) return;
		committing = true;

		try {
			if (!(await isGitRepo(pi, ctx.cwd))) return;

			const status = await pi.exec("git", ["status", "--porcelain"], {
				cwd: ctx.cwd,
				timeout: 5_000,
			});
			if (status.code !== 0) {
				ctx.ui.notify(`Git status failed: ${status.stderr || status.stdout}`, "error");
				ctx.ui.setStatus(EXTENSION_NAME, "auto-commit: status failed");
				return;
			}

			if (status.stdout.trim().length === 0) {
				await gitPush(pi, ctx);
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
				await gitPush(pi, ctx);
				ctx.ui.setStatus(EXTENSION_NAME, "auto-commit: committed and pushed");
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
