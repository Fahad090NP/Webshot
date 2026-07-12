// Popup interface for Webshot extension: handles mode selection, emulated device profiles, resolution scale, and orchestrates classic/CDP capture engine messaging.

import { useState, useCallback, useEffect } from 'react';
import {
  CAPTURE,
  loadSettings,
  saveSettings,
  PRESET_DEVICES,
} from '@/lib/captureConfig';
import type {
  CaptureMode,
  OutputFormat,
  WebShotSettings,
  DeviceProfile,
} from '@/lib/types';
import './App.css';

type CaptureState = 'ready' | 'capturing' | 'done' | 'error';

function renderStatus(
  state: CaptureState,
  error: string,
): React.ReactElement | null {
  if (state === 'error') return <p className="errorMsg">{error}</p>;
  if (state === 'done') return <p className="successMsg">Download complete.</p>;
  return null;
}

function renderAction(
  state: CaptureState,
  progress: number,
  onCapture: () => void,
): React.ReactElement {
  if (state === 'capturing') {
    return (
      <div className="actionArea">
        <div className="progressWrap">
          <div
            className="progressBar"
            style={{ width: `${progress * 100}%` }}
          />
          <span className="progressText">{Math.round(progress * 100)}%</span>
        </div>
      </div>
    );
  }
  return (
    <div className="actionArea">
      <button className="captureBtn" onClick={onCapture}>
        {state === 'ready' ? 'Capture' : 'Capture Another'}
      </button>
    </div>
  );
}

function App(): React.ReactElement {
  const [mode, setMode] = useState<CaptureMode>('fullPage');
  const [format, setFormat] = useState<OutputFormat>(CAPTURE.DEFAULT_FORMAT);
  const [scale, setScale] = useState<number>(CAPTURE.DEFAULT_SCALE);
  const [state, setState] = useState<CaptureState>('ready');
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const [settings, setSettings] = useState<WebShotSettings | null>(null);

  useEffect((): (() => void) => {
    loadSettings()
      .then((s: WebShotSettings): void => {
        setSettings(s);
        setFormat(s.defaultFormat);
        setScale(s.defaultScale);

        // If a device profile is emulated, selection mode is invalid
        if (s.activeDeviceId !== 'current') {
          setMode('fullPage');
        }
      })
      .catch((): void => {});

    return (): void => {};
  }, []);

  const handleOpenSettings = useCallback((): void => {
    browser.runtime.openOptionsPage().catch((): void => {});
  }, []);

  const updateEngineSettings = useCallback(
    (updates: Partial<WebShotSettings>): void => {
      setSettings((prev) => {
        if (prev == null) return null;
        const updated = { ...prev, ...updates };
        saveSettings(updated).catch((): void => {});
        return updated;
      });
    },
    [],
  );

  const handleCapture = useCallback((): void => {
    if (settings == null) return;
    let completed = false;

    setState('capturing');
    setProgress(0);
    setError('');

    browser.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs: unknown): void => {
        const tabList: Array<{ id?: number }> = tabs as Array<{ id?: number }>;
        if (tabList.length === 0 || tabList[0].id == null) {
          setError('No active tab found');
          setState('error');
          return;
        }

        const tabId = tabList[0].id;

        // Route between CDP Engine or Classic compositing engine
        const isCDP =
          settings.activeEngine === 'cdp' ||
          settings.activeDeviceId !== 'current';

        if (isCDP) {
          let selectedDevice: DeviceProfile | null = null;
          if (settings.activeDeviceId !== 'current') {
            selectedDevice =
              PRESET_DEVICES.find((d) => d.id === settings.activeDeviceId) ??
              settings.customDevices.find(
                (d) => d.id === settings.activeDeviceId,
              ) ??
              null;
          }

          browser.runtime
            .sendMessage({
              type: 'startCDPCapture',
              data: {
                tabId,
                mode: mode === 'fullPage' ? 'fullPage' : 'viewport',
                scale,
                quality: CAPTURE.DEFAULT_QUALITY,
                format,
                filenameTemplate: settings.filenameTemplate,
                device: selectedDevice,
                delayMs: settings.captureDelay,
                maxHistoryItems: settings.maxHistoryItems,
              },
            })
            .then((response: unknown): void => {
              const resp = response as
                { success: boolean; error?: string } | undefined;
              if (resp?.success === true) {
                setState('done');
                setTimeout((): void => {
                  window.close();
                }, 1500);
              } else {
                setError(resp?.error ?? 'CDP capture failed');
                setState('error');
              }
            })
            .catch((err: unknown): void => {
              setError(String(err));
              setState('error');
            });
        } else {
          // Classic Stitching Engine
          const listener: (message: unknown) => void = (
            message: unknown,
          ): void => {
            const msg: Record<string, unknown> = message as Record<
              string,
              unknown
            >;
            const msgType: string | undefined = msg.type as string | undefined;

            if (msgType === 'captureProgress') {
              const d: { complete: number } = msg.data as {
                complete: number;
              };
              setProgress(d.complete);
            } else if (msgType === 'captureBlob') {
              completed = true;
              setState('done');
              browser.runtime.onMessage.removeListener(listener);
              setTimeout((): void => {
                window.close();
              }, 1500);
            } else if (msgType === 'captureCancelled') {
              setState('ready');
              browser.runtime.onMessage.removeListener(listener);
            } else if (msgType === 'captureError') {
              completed = true;
              setError('Capture failed');
              setState('error');
              browser.runtime.onMessage.removeListener(listener);
            }
          };

          browser.runtime.onMessage.addListener(listener);

          const request: Record<string, unknown> = {
            type: 'startCapture',
            data: { mode, format, scale, quality: CAPTURE.DEFAULT_QUALITY },
          };

          browser.tabs
            .sendMessage(tabId, request)
            .then((): void => {
              setTimeout((): void => {
                if (!completed) {
                  browser.runtime.onMessage.removeListener(listener);
                  setError('Capture timed out');
                  setState('error');
                }
              }, 120000);
            })
            .catch((): void => {
              browser.runtime.onMessage.removeListener(listener);
              setError(
                'Failed to communicate with content script. Try reloading the page.',
              );
              setState('error');
            });
        }
      })
      .catch((): void => {
        setError('Failed to query tabs');
        setState('error');
      });
  }, [mode, format, scale, settings]);

  if (settings == null) {
    return (
      <div className="app">
        <p className="loading">Loading...</p>
      </div>
    );
  }

  const modes: CaptureMode[] = ['fullPage', 'viewport', 'selection'];
  const deviceList = [...PRESET_DEVICES, ...settings.customDevices];
  const isEmulationActive = settings.activeDeviceId !== 'current';

  return (
    <div className="app">
      <div className="header">
        <h1 className="title">Webshot</h1>
        <button
          className="settingsBtn"
          onClick={handleOpenSettings}
          title="Settings"
        >
          ⚙️
        </button>
      </div>

      <label className="label">Capture Engine</label>
      <div className="engineGroup">
        <button
          className={`engineBtn ${settings.activeEngine === 'classic' && !isEmulationActive ? 'active' : ''}`}
          onClick={(): void => {
            updateEngineSettings({
              activeEngine: 'classic',
              activeDeviceId: 'current',
            });
          }}
          disabled={state === 'capturing'}
        >
          Stitched (Classic)
        </button>
        <button
          className={`engineBtn ${settings.activeEngine === 'cdp' || isEmulationActive ? 'active' : ''}`}
          onClick={(): void => {
            updateEngineSettings({ activeEngine: 'cdp' });
          }}
          disabled={state === 'capturing'}
        >
          Debugger (CDP)
        </button>
      </div>

      <label className="label">Device Profile</label>
      <select
        className="select"
        value={settings.activeDeviceId}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => {
          const val = e.target.value;
          updateEngineSettings({
            activeDeviceId: val,
            // Enforce cdp if a device profile is selected
            activeEngine: val !== 'current' ? 'cdp' : settings.activeEngine,
          });
          if (val !== 'current' && mode === 'selection') {
            setMode('fullPage');
          }
        }}
        disabled={state === 'capturing'}
      >
        <option value="current">Current Tab (No Emulation)</option>
        {deviceList.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name} ({d.width}x{d.height})
          </option>
        ))}
      </select>

      <label className="label">Capture Mode</label>
      <div className="modeGroup">
        {modes.map((m: CaptureMode): React.ReactElement => {
          const isDisabled = isEmulationActive && m === 'selection';
          return (
            <button
              key={m}
              className={`modeBtn ${mode === m ? 'active' : ''}`}
              onClick={(): void => {
                setMode(m);
              }}
              disabled={state === 'capturing' || isDisabled}
              title={
                isDisabled
                  ? 'Selection is disabled during emulation'
                  : undefined
              }
            >
              {m === 'fullPage'
                ? 'Full Page'
                : m === 'viewport'
                  ? 'Viewport'
                  : 'Selection'}
            </button>
          );
        })}
      </div>

      <label className="label">Format</label>
      <select
        className="select"
        value={format}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => {
          setFormat(e.target.value as OutputFormat);
        }}
        disabled={state === 'capturing'}
      >
        {(['png', 'jpeg', 'webp', 'svg', 'pdf'] as OutputFormat[]).map(
          (f: OutputFormat): React.ReactElement => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ),
        )}
      </select>

      <label className="label">Resolution: {scale}x</label>
      <input
        type="range"
        min={CAPTURE.MIN_SCALE}
        max={CAPTURE.MAX_SCALE}
        value={scale}
        onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
          setScale(Number(e.target.value));
        }}
        disabled={state === 'capturing'}
        className="slider"
      />
      <div className="scaleLabels">
        <span>1x</span>
        <span>10x</span>
      </div>

      {scale > 1 && state === 'ready' && settings.showZoomWarning && (
        <div className="warning">
          {settings.zoomCapture && !isEmulationActive
            ? 'Page will be zoomed for high-res capture. Page may reflow.'
            : 'Output will be scaled up from native capture.'}
        </div>
      )}

      {renderStatus(state, error)}
      {renderAction(state, progress, handleCapture)}
    </div>
  );
}

export default App;
