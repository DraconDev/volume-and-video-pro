import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    permissions: ['storage'],
    host_permissions: ['<all_urls>']
  },
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
});
