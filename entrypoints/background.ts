// Background service worker: relays messages and handles captureVisibleTab calls

import type { CaptureRequest } from '@/lib/types';

let activeTabId: number | null = null;

async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) activeTabId = tabs[0].id;
  return tabs[0];
}

browser.runtime.onMessage.addListener(
  (message: unknown, sender: { tab?: { id?: number } }) => {
    const msg = message as Record<string, unknown>;
    const type = msg.type as string | undefined;

    if (type === 'startCapture') {
      void handleStartCapture(msg.data as CaptureRequest, sender);
      return undefined;
    }
    if (type === 'requestCapture') {
      return handleCaptureVisible(sender.tab?.id ?? activeTabId);
    }
    if (type === 'captureBlob') {
      void handleCaptureBlob(msg.data as { blob: Blob; filename: string });
      return undefined;
    }
    return undefined;
  },
);

async function handleStartCapture(
  data: CaptureRequest,
  sender: { tab?: { id?: number } },
): Promise<void> {
  const tabId = sender.tab?.id ?? (await getActiveTab()).id;
  if (!tabId) return;

  activeTabId = tabId;

  try {
    await browser.tabs.sendMessage(tabId, { type: 'startCapture', data });
  } catch {
    // Content script may not be injected yet
  }
}

async function handleCaptureVisible(
  tabId: number | null,
): Promise<{ dataUri: string } | { error: string }> {
  const id = tabId ?? activeTabId;
  if (!id) return { error: 'No active tab' };

  try {
    const dataUri = await browser.tabs.captureVisibleTab({ format: 'png' });
    return { dataUri };
  } catch (err) {
    return { error: String(err) };
  }
}

async function handleCaptureBlob(data: {
  blob: Blob;
  filename: string;
}): Promise<void> {
  try {
    const url = URL.createObjectURL(data.blob);
    await browser.downloads.download({
      url,
      filename: data.filename,
      saveAs: true,
    });
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    console.error('Download failed:', err);
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void getActiveTab();
  });
});
