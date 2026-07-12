// Background service worker coordinating captureVisibleTab actions, CDP debugger attachment, and context menus.

import { getFilename } from '@/lib/captureEngine';
import type { OutputFormat, DeviceProfile } from '@/lib/types';
import { saveHistoryItem } from '@/lib/captureHistory';

type DebugCommandResult = Record<string, unknown>;

async function sendCommand(
  tabId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<DebugCommandResult> {
  const result = (await browser.debugger.sendCommand(
    { tabId },
    method,
    params,
  )) as Record<string, unknown>;
  return result;
}

function getNestedNumber(obj: unknown, ...keys: string[]): number | undefined {
  let current: unknown = obj;
  for (const key of keys) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object'
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'number' ? current : undefined;
}

function getString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  return typeof obj[key] === 'string' ? obj[key] : undefined;
}

async function captureCDP(
  tabId: number,
  mode: 'viewport' | 'fullPage',
  scale: number,
  quality: number,
  format: OutputFormat,
  filenameTemplate: string,
  device: DeviceProfile | null,
  delayMs: number,
  maxHistoryItems = 50,
): Promise<{ success: boolean; filename?: string; error?: string }> {
  try {
    await browser.debugger.attach({ tabId }, '1.3');
  } catch (error: unknown) {
    return {
      success: false,
      error: `Failed to attach debugger: ${String(error)}`,
    };
  }

  try {
    const tab = await browser.tabs.get(tabId);
    const title = tab.title ?? 'Screenshot';
    const url = tab.url ?? '';

    if (device != null) {
      await sendCommand(tabId, 'Emulation.setDeviceMetricsOverride', {
        width: device.width,
        height: device.height,
        deviceScaleFactor: scale,
        mobile: device.mobile,
        screenOrientation: { angle: 0, type: 'portraitPrimary' },
      });
      if (device.userAgent !== '') {
        await sendCommand(tabId, 'Network.setUserAgentOverride', {
          userAgent: device.userAgent,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const captureWidth = device?.width ?? 1280;
    let captureHeight = device?.height ?? 800;

    if (mode === 'fullPage') {
      const metrics = await sendCommand(tabId, 'Page.getLayoutMetrics');
      const contentHeight = Math.ceil(
        getNestedNumber(metrics, 'cssContentSize', 'height') ?? captureHeight,
      );
      captureHeight = contentHeight;

      if (captureHeight > 16384) {
        captureHeight = 16384;
      }

      await sendCommand(tabId, 'Emulation.setDeviceMetricsOverride', {
        width: captureWidth,
        height: captureHeight,
        deviceScaleFactor: scale,
        mobile: device?.mobile ?? false,
        screenOrientation: { angle: 0, type: 'portraitPrimary' },
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    const screenshotParams: Record<string, unknown> = {
      format: format === 'jpeg' ? 'jpeg' : 'png',
    };
    if (format === 'jpeg') {
      screenshotParams.quality = Math.round(quality * 100);
    }
    if (mode === 'fullPage') {
      screenshotParams.captureBeyondViewport = true;
    }

    const result = await sendCommand(
      tabId,
      'Page.captureScreenshot',
      screenshotParams,
    );
    const screenshotBase64 = getString(result, 'data');
    if (screenshotBase64 == null || screenshotBase64 === '') {
      throw new Error('CDP returned empty screenshot data');
    }

    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const dataUrl = `data:${mime};base64,${screenshotBase64}`;
    const filename = getFilename(
      url,
      format,
      title,
      filenameTemplate,
      device?.name,
    );

    await browser.downloads.download({
      url: dataUrl,
      filename,
      saveAs: false,
    });

    await saveHistoryItem(
      {
        title,
        url,
        format,
        scale,
        size: Math.round((screenshotBase64.length * 3) / 4),
      },
      dataUrl,
      maxHistoryItems,
    );

    if (device != null) {
      await sendCommand(tabId, 'Emulation.clearDeviceMetricsOverride');
    }

    return { success: true, filename };
  } catch (err: unknown) {
    return { success: false, error: String(err) };
  } finally {
    try {
      await browser.debugger.detach({ tabId });
    } catch {
      // already detached
    }
  }
}

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
    } else if (msgType === 'startCDPCapture') {
      const data = msg.data as {
        tabId: number;
        mode: 'viewport' | 'fullPage';
        scale: number;
        quality: number;
        format: OutputFormat;
        filenameTemplate: string;
        device: DeviceProfile | null;
        delayMs: number;
        maxHistoryItems: number;
      };
      captureCDP(
        data.tabId,
        data.mode,
        data.scale,
        data.quality,
        data.format,
        data.filenameTemplate,
        data.device,
        data.delayMs,
        data.maxHistoryItems,
      )
        .then(sendResponse)
        .catch((err: unknown): void => {
          sendResponse({ error: String(err) });
        });
      return true as never;
    }
  },
);

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
