import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
	buildCommand: "vp exec junior upgrade && vp run build:release",
	framework: "nitro",
};
