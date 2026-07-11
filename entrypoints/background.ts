// Background service worker coordinating captureVisibleTab actions and context menu interactions.

browser.runtime.onMessage.addListener(
  (
    message: unknown,
    sender: { tab?: { id?: number; windowId?: number } },
    sendResponse: (response?: unknown) => void,
  ): void => {
    const msg: Record<string, unknown> = message as Record<string, unknown>;
    const msgType: string | undefined = msg.type as string | undefined;

    if (msgType === 'requestCapture') {
      handleCaptureVisible(sender.tab?.windowId ?? null)
        .then(sendResponse)
        .catch((err: unknown): void => {
          sendResponse({ error: String(err) });
        });
      return true as never;
    }
  },
);

async function handleCaptureVisible(
  windowId: number | null,
): Promise<{ dataUri: string } | { error: string }> {
  try {
    const options = { format: 'png' as const };
    const dataUri: string =
      windowId != null
        ? await browser.tabs.captureVisibleTab(windowId, options)
        : await browser.tabs.captureVisibleTab(options);
    return { dataUri };
  } catch (err: unknown) {
    return { error: String(err) };
  }
}

function handleContextClick(info: { menuItemId: string | number }): void {
  if (info.menuItemId === 'webshot-settings') {
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
  });

  browser.contextMenus.onClicked.addListener(handleContextClick);
});
