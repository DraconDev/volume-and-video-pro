import { defineConfig } from "wxt";

export default defineConfig({
    manifest: {
        permissions: ["storage", "tabs", "activeTab"],
        host_permissions: ["<all_urls>"],
        name: "Volume & Video Master 1000%",
        version: "1.3.2",
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
                run_at: "document_start", // Inject early to catch all media elements
                all_frames: true, // Run in all frames to catch embedded media
            },
        ],
    },
    modules: ["@wxt-dev/module-react"],
});
