import { defineConfig } from "wxt";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// Read version and description from package.json so manifest stays in sync automatically
const { version, description } = require("./package.json");

export default defineConfig({
  manifest: {
    permissions: ["storage", "tabs"],
    host_permissions: ["<all_urls>"],
    name: "Volume & Video Master 1000%",
    version,
    description: description || "Volume & Video Master",
    background: {
      service_worker: "entrypoints/background.ts",
      type: "module",
    },

    action: {
      default_icon: {
        16: "icon/16.png",
        32: "icon/32.png",
        48: "icon/48.png",
        128: "icon/128.png",
      },
    },

    web_accessible_resources: [
      {
        resources: ["assets/*"],
        matches: ["<all_urls>"],
      },
    ],
  },
  modules: ["@wxt-dev/module-react"],
});
