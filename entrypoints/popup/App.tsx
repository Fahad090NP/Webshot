import { useState, useCallback, useEffect } from 'react';
import { CAPTURE, loadSettings } from '@/lib/captureConfig';
import type { CaptureMode, OutputFormat, WebShotSettings } from '@/lib/types';
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
      })
      .catch((): void => {});

    return (): void => {};
  }, []);

  const handleCapture = useCallback((): void => {
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

        const request: Record<string, unknown> = {
          type: 'startCapture',
          data: { mode, format, scale, quality: CAPTURE.DEFAULT_QUALITY },
        };

        browser.tabs
          .sendMessage(tabList[0].id, request)
          .then((): void => {
            const listener: (message: unknown) => void = (
              message: unknown,
            ): void => {
              const msg: Record<string, unknown> = message as Record<
                string,
                unknown
              >;
              const msgType: string | undefined = msg.type as
                string | undefined;

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
                }, 1_500);
              } else if (msgType === 'captureCancelled') {
                setState('ready');
                browser.runtime.onMessage.removeListener(listener);
              }
            };

            browser.runtime.onMessage.addListener(listener);

            setTimeout((): void => {
              browser.runtime.onMessage.removeListener(listener);
              if (!completed) {
                setError('Capture timed out');
                setState('error');
              }
            }, 120_000);
          })
          .catch((): void => {
            setError(
              'Failed to communicate with content script. Try reloading the page.',
            );
            setState('error');
          });
      })
      .catch((): void => {
        setError('Failed to query tabs');
        setState('error');
      });
  }, [mode, format, scale]);

  const handleOpenSettings = useCallback((): void => {
    browser.runtime.openOptionsPage().catch((): void => {});
  }, []);

  const modes: CaptureMode[] = ['fullPage', 'viewport', 'selection'];

  return (
    <div className="app">
      <div className="header">
        <h1 className="title">Webshot</h1>
        <button
          className="settingsBtn"
          onClick={handleOpenSettings}
          title="Settings"
        >
          &#9881;
        </button>
      </div>

      <label className="label">Capture Mode</label>
      <div className="modeGroup">
        {modes.map((m: CaptureMode): React.ReactElement => (
          <button
            key={m}
            className={`modeBtn ${mode === m ? 'active' : ''}`}
            onClick={(): void => {
              setMode(m);
            }}
            disabled={state === 'capturing'}
          >
            {m === 'fullPage'
              ? 'Full Page'
              : m === 'viewport'
                ? 'Viewport'
                : 'Selection'}
          </button>
        ))}
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

      {scale > 1 && state === 'ready' && settings?.showZoomWarning === true && (
        <div className="warning">
          {settings.zoomCapture
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
