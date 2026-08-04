"use agent";
import { useModel } from "@flue/runtime";

export function Bolt() {
	useModel("vercel-ai-gateway/openai/gpt-5.6-terra", { thinkingLevel: "medium" });
	return "You are a helpful assistant. Keep replies short.";
}
