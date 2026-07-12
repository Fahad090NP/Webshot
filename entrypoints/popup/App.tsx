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

// Custom Inline SVG Icons (Zero-dependency & lightweight)
function SettingsIcon(): React.ReactElement {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function FullPageIcon(): React.ReactElement {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  );
}

function ViewportIcon(): React.ReactElement {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function SelectionIcon(): React.ReactElement {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 3h2M10 3h4M18 3h2a2 2 0 0 1 2 2v2M22 11v2M22 17v2a2 2 0 0 1-2 2h-2M14 21h-4M6 21H4a2 2 0 0 1-2-2v-2M2 13v-2M2 7V5a2 2 0 0 1 2-2" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </svg>
  );
}

function StitchIcon(): React.ReactElement {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function CDPIcon(): React.ReactElement {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m8 9 3 3-3 3M13 15h3" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
    </svg>
  );
}

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
    <div className="app animated">
      <div className="header">
        <div className="brand">
          <svg
            className="logoIcon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <h1 className="title">Webshot</h1>
        </div>
        <button
          className="settingsBtn"
          onClick={handleOpenSettings}
          title="Settings"
        >
          <SettingsIcon />
        </button>
      </div>

      <div className="controlGroup">
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
            <StitchIcon />
            <span>Stitch (Classic)</span>
          </button>
          <button
            className={`engineBtn ${settings.activeEngine === 'cdp' || isEmulationActive ? 'active' : ''}`}
            onClick={(): void => {
              updateEngineSettings({ activeEngine: 'cdp' });
            }}
            disabled={state === 'capturing'}
          >
            <CDPIcon />
            <span>Debugger (CDP)</span>
          </button>
        </div>
      </div>

      <div className="controlGroup">
        <label className="label">Device Profile</label>
        <div className="selectContainer">
          <select
            className="select"
            value={settings.activeDeviceId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => {
              const val = e.target.value;
              updateEngineSettings({
                activeDeviceId: val,
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
        </div>
      </div>

      <div className="controlGroup">
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
                {m === 'fullPage' ? (
                  <>
                    <FullPageIcon />
                    <span>Full Page</span>
                  </>
                ) : m === 'viewport' ? (
                  <>
                    <ViewportIcon />
                    <span>Viewport</span>
                  </>
                ) : (
                  <>
                    <SelectionIcon />
                    <span>Selection</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="controlGroup flexRow">
        <div className="flexCol">
          <label className="label">Format</label>
          <select
            className="select compact"
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
        </div>

        <div className="flexCol flexGrow">
          <label className="label">Resolution: {scale}x</label>
          <div className="sliderContainer">
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
          </div>
        </div>
      </div>

      {scale > 1 && state === 'ready' && settings.showZoomWarning && (
        <div className="warning">
          <svg
            className="warnIcon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>
            {settings.zoomCapture && !isEmulationActive
              ? 'Page will zoom for high-res. Layout reflows may occur.'
              : 'Output will scale up from native.'}
          </span>
        </div>
      )}

      {renderStatus(state, error)}
      {renderAction(state, progress, handleCapture)}
    </div>
  );
}

export default App;
