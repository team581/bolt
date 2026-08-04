// The `'use agent'` directive marks the Assistant() function below as a Flue agent.
"use agent";
import { useModel } from "@flue/runtime";

// This is your first agent: `Assistant`.
// It's return value is your agent's instructions, which become the agent's "system" instructions.
// Flue Hooks like `useModel()` allow you to customize and modify your agent abilities.
export function Assistant() {
	// TODO: Use Vercel AI Gateway
	useModel("anthropic/claude-haiku-4-5");
	return "You are a helpful assistant. Keep replies short.";
}
