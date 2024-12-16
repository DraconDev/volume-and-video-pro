import { defineConfig } from "wxt";

export default defineConfig({
    extensionApi: "chrome",
    manifest: {
        permissions: ["storage", "tabs"],
        host_permissions: ["<all_urls>"],
        name: "Volume & Video Master",
        version: "1.7.4",
        description: "Volume & Video Master",
        background: {
            service_worker: "entrypoints/background.js",
            type: "module",
        },
        action: {
            default_icon: {
                16: "icon/16.png",
                32: "icon/32.png",
                48: "icon/48.png",
                96: "icon/96.png",
                128: "icon/128.png",
            },
        },
    },
    modules: ["@wxt-dev/module-react"],
});
