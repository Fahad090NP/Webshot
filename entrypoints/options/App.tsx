// Options interface for Webshot extension: handles customization of defaults, capture parameters, and interactive behaviors.

import { useState, useEffect, useCallback } from 'react';
import type { WebShotSettings, OutputFormat } from '@/lib/types';
import { loadSettings, saveSettings, CAPTURE } from '@/lib/captureConfig';
import './App.css';

function App(): React.ReactElement {
  const [settings, setSettings] = useState<WebShotSettings | null>(null);
  const [saved, setSaved] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect((): void => {
    loadSettings()
      .then((s: WebShotSettings): void => {
        setSettings(s);
      })
      .catch((): void => {});
  }, []);

  const updateSetting = useCallback(
    <K extends keyof WebShotSettings>(
      key: K,
      value: WebShotSettings[K],
    ): void => {
      setSettings((prev: WebShotSettings | null): WebShotSettings | null => {
        if (prev == null) return prev;
        return { ...prev, [key]: value };
      });
      setSaved(false);
    },
    [],
  );

  const handleSave = useCallback((): void => {
    if (settings == null) return;
    saveSettings(settings)
      .then((): void => {
        setSaved(true);
        setError('');
        setTimeout((): void => {
          setSaved(false);
        }, 2000);
      })
      .catch((err: unknown): void => {
        setError(String(err));
      });
  }, [settings]);

  if (settings == null) {
    return (
      <div className="container">
        <p>Loading settings...</p>
      </div>
    );
  }

  const formats: OutputFormat[] = ['png', 'jpeg', 'webp', 'svg', 'pdf'];

  return (
    <div className="container">
      <h1 className="pageTitle">Webshot Settings</h1>

      <section className="section">
        <h2 className="sectionTitle">Defaults</h2>

        <label className="field">
          <span className="fieldLabel">Default Format</span>
          <select
            className="fieldInput"
            value={settings.defaultFormat}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => {
              updateSetting('defaultFormat', e.target.value as OutputFormat);
            }}
          >
            {formats.map((f: OutputFormat): React.ReactElement => (
              <option key={f} value={f}>
                {f.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="fieldLabel">
            Default Scale ({settings.defaultScale}x)
          </span>
          <input
            type="range"
            className="fieldInput"
            min={CAPTURE.MIN_SCALE}
            max={CAPTURE.MAX_SCALE}
            value={settings.defaultScale}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
              updateSetting('defaultScale', Number(e.target.value));
            }}
          />
        </label>

        <label className="field">
          <span className="fieldLabel">
            Default Quality ({Math.round(settings.defaultQuality * 100)}%)
          </span>
          <input
            type="range"
            className="fieldInput"
            min={0.1}
            max={1}
            step={0.05}
            value={settings.defaultQuality}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
              updateSetting('defaultQuality', Number(e.target.value));
            }}
          />
        </label>
      </section>

      <section className="section">
        <h2 className="sectionTitle">Capture Behavior</h2>

        <label className="field">
          <span className="fieldLabel">
            Scroll Pad (px) — overlap between scroll tiles
          </span>
          <input
            type="number"
            className="fieldInput"
            min={0}
            max={1000}
            value={settings.scrollPad}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
              updateSetting('scrollPad', Number(e.target.value));
            }}
          />
        </label>

        <label className="field">
          <span className="fieldLabel">
            Capture Delay (ms) — wait time between scrolls
          </span>
          <input
            type="number"
            className="fieldInput"
            min={0}
            max={5000}
            value={settings.captureDelay}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
              updateSetting('captureDelay', Number(e.target.value));
            }}
          />
        </label>
      </section>

      <section className="section">
        <h2 className="sectionTitle">High Resolution</h2>

        <label className="field fieldToggle">
          <span className="fieldLabel">
            Zoom-based capture
            <span className="fieldHint">
              When enabled, browser zoom is used for &gt;1x resolution. Page may
              reflow.
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.zoomCapture}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
              updateSetting('zoomCapture', e.target.checked);
            }}
          />
        </label>

        <label className="field fieldToggle">
          <span className="fieldLabel">
            Show zoom warning
            <span className="fieldHint">
              Shows a warning when capturing above 1x with zoom enabled
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.showZoomWarning}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
              updateSetting('showZoomWarning', e.target.checked);
            }}
          />
        </label>
      </section>

      <section className="section">
        <h2 className="sectionTitle">Interaction Blocking</h2>

        <label className="field fieldToggle">
          <span className="fieldLabel">
            Block user interactions during capture
            <span className="fieldHint">
              Disables clicks, selection, and pointer events while capturing
            </span>
          </span>
          <input
            type="checkbox"
            checked={settings.blockInteractions}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
              updateSetting('blockInteractions', e.target.checked);
            }}
          />
        </label>
      </section>

      {error !== '' && <p className="errorMsg">{error}</p>}
      {saved && <p className="successMsg">Settings saved!</p>}

      <button className="saveBtn" onClick={handleSave}>
        Save Settings
      </button>
    </div>
  );
}

export default App;
