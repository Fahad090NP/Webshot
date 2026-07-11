import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Webshot',
    description:
      'Capture full page, selected sections, or viewport in PNG, JPG, WEBP, SVG, or PDF with custom resolution',
    permissions: ['activeTab', 'scripting', 'storage', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Capture page with Webshot',
    },
  },
});
