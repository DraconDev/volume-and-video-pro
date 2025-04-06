import { defineConfig } from "wxt";

export default defineConfig({
    manifest: {
        permissions: ["storage", "tabs"],
        host_permissions: ["<all_urls>"],
        name: "Volume & Video Master 1000%",
        version: "1.4.50",
        description: "Volume & Video Master",
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
        content_scripts: [
            {
                matches: ["<all_urls>"],
                js: ["entrypoints/content.ts"],
                all_frames: true, // Inject into all frames (including iframes)
                run_at: "document_start", // Inject as early as possible
            },
        ],
    },
    modules: ["@wxt-dev/module-react"],
});
