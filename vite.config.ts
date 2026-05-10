import { defineConfig } from "vite-plus";
import { nitro } from "nitro/vite";

export default defineConfig({
	staged: {
		"*": "vp check --fix",
	},
	fmt: { useTabs: true, printWidth: 120 },
	lint: { options: { typeAware: true, typeCheck: true } },
	server: {
		allowedHosts: true,
	},
	plugins: [nitro()],
});
