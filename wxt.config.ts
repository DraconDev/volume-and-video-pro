import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
    manifest: {
        permissions: ["storage", "tabs"],
        host_permissions: ["<all_urls>"],
        name: "True Volume Master",
        version: "1.1.5",
        description: "True Volume Master",
        background: {
            service_worker: "entrypoints/background.js",
            type: "module",
        },
        // entrypoints: {
        //     popup: "entrypoints/popup/main.tsx",
        //     background: "entrypoints/background.ts",
        //     content: "entrypoints/content.ts",
        // },
        action: {
            default_icon: {
                16: "icon/16.png",
                32: "icon/32.png",
                48: "icon/48.png",
                96: "icon/96.png",
                128: "icon/128.png",
            },
        },
        // icons: {
        //     16: "icon/16.png",
        //     32: "icon/32.png",
        //     48: "icon/48.png",
        //     96: "icon/96.png",
        //     128: "icon/128.png",
        // },
    },
    extensionApi: "chrome",
    modules: ["@wxt-dev/module-react"],
});
