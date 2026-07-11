import { useState, useCallback, useEffect, useRef } from 'react';
import { CAPTURE } from '@/lib/captureConfig';
import type { CaptureMode, OutputFormat } from '@/lib/types';
import './App.css';

type CaptureState = 'ready' | 'capturing' | 'done' | 'error';

function App() {
  const [mode, setMode] = useState<CaptureMode>('fullPage');
  const [format, setFormat] = useState<OutputFormat>(CAPTURE.DEFAULT_FORMAT);
  const [scale, setScale] = useState<number>(CAPTURE.DEFAULT_SCALE);
  const [state, setState] = useState<CaptureState>('ready');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const listenerRef = useRef<((message: unknown) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        browser.runtime.onMessage.removeListener(listenerRef.current);
      }
    };
  }, []);

  const handleCapture = useCallback(async () => {
    setState('capturing');
    setProgress(0);
    setError('');

    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const tab = tabs[0];
    if (!tab?.id) {
      setError('No active tab found');
      setState('error');
      return;
    }

    const request = {
      mode,
      format,
      scale,
      quality: CAPTURE.DEFAULT_QUALITY,
    };

    try {
      await browser.tabs.sendMessage(tab.id, {
        type: 'startCapture',
        data: request,
      });
    } catch {
      setError(
        'Failed to communicate with content script. Try reloading the page.',
      );
      setState('error');
      return;
    }

    let done = false;
    const listener = (message: unknown): void => {
      const msg = message as Record<string, unknown>;
      const type = msg.type as string | undefined;

      if (type === 'captureProgress') {
        const d = msg.data as { complete: number };
        setProgress(d.complete);
      } else if (type === 'captureBlob') {
        const d = msg.data as { blob: Blob; filename: string };
        browser.runtime.sendMessage({ type: 'captureBlob', data: d });
        done = true;
        setState('done');
        browser.runtime.onMessage.removeListener(listener);
      } else if (type === 'captureCancelled') {
        setState('ready');
        browser.runtime.onMessage.removeListener(listener);
      }
    };

    listenerRef.current = listener;
    browser.runtime.onMessage.addListener(listener);

    setTimeout(() => {
      browser.runtime.onMessage.removeListener(listener);
      if (!done) {
        setError('Capture timed out');
        setState('error');
      }
    }, 120_000);
  }, [mode, format, scale]);

  const modes: CaptureMode[] = ['fullPage', 'viewport', 'selection'];

  return (
    <div className="app">
      <h1 className="title">Webshot</h1>

      <label className="label">Capture Mode</label>
      <div className="modeGroup">
        {modes.map((m) => (
          <button
            key={m}
            className={`modeBtn ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
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
        onChange={(e) => setFormat(e.target.value as OutputFormat)}
        disabled={state === 'capturing'}
      >
        {(['png', 'jpeg', 'webp', 'svg', 'pdf'] as OutputFormat[]).map((f) => (
          <option key={f} value={f}>
            {f.toUpperCase()}
          </option>
        ))}
      </select>

      <label className="label">Resolution: {scale}x</label>
      <input
        type="range"
        min={CAPTURE.MIN_SCALE}
        max={CAPTURE.MAX_SCALE}
        value={scale}
        onChange={(e) => setScale(Number(e.target.value))}
        disabled={state === 'capturing'}
        className="slider"
      />
      <div className="scaleLabels">
        <span>1x</span>
        <span>10x</span>
      </div>

      {(state as CaptureState) === 'error' && <p className="error">{error}</p>}
      {(state as CaptureState) === 'done' && (
        <p className="success">Download started!</p>
      )}

      {(state as CaptureState) === 'capturing' ? (
        <div className="progressWrap">
          <div
            className="progressBar"
            style={{ width: `${progress * 100}%` }}
          />
          <span className="progressText">{Math.round(progress * 100)}%</span>
        </div>
      ) : (
        <button
          className="captureBtn"
          onClick={handleCapture}
          disabled={(state as CaptureState) === 'capturing'}
        >
          {(state as CaptureState) === 'ready' ? 'Capture' : 'Capture Another'}
        </button>
      )}
    </div>
  );
}

export default App;
