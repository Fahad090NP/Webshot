// Background service worker: captureVisibleTab, context menus

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
  (
    message: unknown,
    sender: { tab?: { id?: number } },
    sendResponse: (response?: unknown) => void,
  ): void => {
    const msg: Record<string, unknown> = message as Record<string, unknown>;
    const msgType: string | undefined = msg.type as string | undefined;

    if (msgType === 'requestCapture') {
      handleCaptureVisible(sender.tab?.id ?? activeTabId)
        .then(sendResponse)
        .catch((err: unknown): void => {
          sendResponse({ error: String(err) });
        });
      return true as never;
    }
  },
);

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
