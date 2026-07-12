import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Webshot',
    description:
      'Capture full page, selected sections, or viewport in PNG, JPG, WEBP, SVG, or PDF with custom resolution',
    permissions: [
      'activeTab',
      'scripting',
      'storage',
      'contextMenus',
      'debugger',
      'downloads',
    ],
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Capture page with Webshot',
    },
    commands: {
      capture_full_page: {
        suggested_key: {
          default: 'Ctrl+Shift+Y',
        },
        description: 'Capture full page screenshot with Webshot',
      },
      capture_viewport: {
        suggested_key: {
          default: 'Ctrl+Shift+U',
        },
        description: 'Capture viewport screenshot with Webshot',
      },
    },
  },
});
