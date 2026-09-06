import { defineJuniorPlugins } from "@sentry/junior";
import { boltRuntimePlugin } from "./app/plugins/bolt-runtime.ts";

export const plugins = defineJuniorPlugins([boltRuntimePlugin()]);
