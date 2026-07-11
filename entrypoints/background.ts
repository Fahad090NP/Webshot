// Background service worker: context menus, message relay, captureVisibleTab, download

import type { CaptureRequest } from '@/lib/types';

let activeTabId: number | null = null;

async function getActiveTabId(): Promise<number> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs.length === 0 || tabs[0].id == null) {
    throw new Error('No active tab found');
  }
  activeTabId = tabs[0].id;
  return tabs[0].id;
}

browser.runtime.onMessage.addListener(
  (message: unknown, sender: { tab?: { id?: number } }): undefined => {
    const msg: Record<string, unknown> = message as Record<string, unknown>;
    const msgType: string | undefined = msg.type as string | undefined;

    if (msgType === 'requestCapture') {
      handleCaptureVisible(sender.tab?.id ?? activeTabId)
        .then((result: { dataUri: string } | { error: string }): void => {
          browser.runtime.sendMessage(result).catch((): void => {});
        })
        .catch((): void => {});
    } else if (msgType === 'startCapture') {
      handleStartCapture(msg.data as CaptureRequest, sender);
    } else if (msgType === 'captureBlob') {
      handleCaptureBlob(msg.data as { blob: Blob; filename: string });
    }

    return undefined;
  },
);

function handleStartCapture(
  data: CaptureRequest,
  sender: { tab?: { id?: number } },
): void {
  const tabId: number | undefined = sender.tab?.id;
  if (tabId != null) {
    activeTabId = tabId;
    browser.tabs
      .sendMessage(tabId, { type: 'startCapture', data })
      .catch((): void => {});
  }
}

async function handleCaptureVisible(
  tabId: number | null,
): Promise<{ dataUri: string } | { error: string }> {
  const id: number | null = tabId ?? activeTabId;
  if (id == null) {
    return { error: 'No active tab' };
  }

  try {
    const dataUri: string = await browser.tabs.captureVisibleTab({
      format: 'png',
    });
    return { dataUri };
  } catch (err: unknown) {
    return { error: String(err) };
  }
}

function handleCaptureBlob(data: { blob: Blob; filename: string }): void {
  const url: string = URL.createObjectURL(data.blob);
  browser.downloads
    .download({ url, filename: data.filename, saveAs: true })
    .then((): void => {
      setTimeout((): void => {
        URL.revokeObjectURL(url);
      }, 60_000);
    })
    .catch((): void => {
      URL.revokeObjectURL(url);
    });
}

function handleContextClick(
  info: { menuItemId: string | number },
  tab?: { id?: number },
): void {
  if (info.menuItemId === 'webshot-settings') {
    if (tab?.id != null) {
      activeTabId = tab.id;
    }
    browser.runtime.openOptionsPage().catch((): void => {});
  }
}

export default defineBackground((): void => {
  browser.runtime.onInstalled.addListener((): void => {
    browser.contextMenus.create({
      id: 'webshot-settings',
      title: 'Webshot Settings',
      contexts: ['action'],
    });

    getActiveTabId().catch((): void => {});
  });

  browser.contextMenus.onClicked.addListener(handleContextClick);
});
