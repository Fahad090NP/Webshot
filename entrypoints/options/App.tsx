// Options interface for Webshot extension: handles customization of defaults, device emulations, settings backups, and historical captures.

import { useState, useEffect, useCallback } from 'react';
import type {
  WebShotSettings,
  OutputFormat,
  DeviceProfile,
  CaptureHistoryItem,
} from '@/lib/types';
import {
  loadSettings,
  saveSettings,
  CAPTURE,
  DEFAULT_SETTINGS,
  PRESET_DEVICES,
} from '@/lib/captureConfig';
import {
  loadHistory,
  deleteHistoryItem,
  clearHistory,
} from '@/lib/captureHistory';
import './App.css';

type SettingsTab = 'general' | 'devices' | 'history' | 'backup';

function App(): React.ReactElement {
  const [settings, setSettings] = useState<WebShotSettings | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [saved, setSaved] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Custom Device Profile Form State
  const [newDeviceName, setNewDeviceName] = useState<string>('');
  const [newDeviceWidth, setNewDeviceWidth] = useState<number>(375);
  const [newDeviceHeight, setNewDeviceHeight] = useState<number>(812);
  const [newDeviceUA, setNewDeviceUA] = useState<string>('');
  const [newDeviceMobile, setNewDeviceMobile] = useState<boolean>(true);

  // Capture History Gallery State
  const [historyItems, setHistoryItems] = useState<CaptureHistoryItem[]>([]);

  useEffect((): void => {
    loadSettings()
      .then((s: WebShotSettings): void => {
        setSettings(s);
      })
      .catch((): void => {});
  }, []);

  useEffect((): void => {
    if (activeTab === 'history') {
      loadHistory()
        .then((items: CaptureHistoryItem[]): void => {
          setHistoryItems(items);
        })
        .catch((): void => {});
    }
  }, [activeTab]);

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
    setIsSaving(true);
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
      })
      .finally((): void => {
        setIsSaving(false);
      });
  }, [settings]);

  const handleAddCustomDevice = useCallback((): void => {
    if (settings == null) return;
    if (newDeviceName === '') {
      setError('Device name cannot be empty');
      return;
    }
    const newDevice: DeviceProfile = {
      id: `dev-${Date.now()}`,
      name: newDeviceName,
      width: newDeviceWidth,
      height: newDeviceHeight,
      mobile: newDeviceMobile,
      userAgent: newDeviceUA,
      category:
        newDeviceWidth > 1024
          ? 'desktop'
          : newDeviceWidth > 767
            ? 'tablet'
            : 'mobile',
    };
    const updated = [...settings.customDevices, newDevice];
    updateSetting('customDevices', updated);

    // Save configuration change immediately
    saveSettings({ ...settings, customDevices: updated })
      .then((): void => {
        setNewDeviceName('');
        setNewDeviceUA('');
        setError('');
      })
      .catch((err: unknown): void => {
        setError(String(err));
      });
  }, [
    settings,
    newDeviceName,
    newDeviceWidth,
    newDeviceHeight,
    newDeviceMobile,
    newDeviceUA,
    updateSetting,
  ]);

  const handleDeleteCustomDevice = useCallback(
    (id: string): void => {
      if (settings == null) return;
      const updated = settings.customDevices.filter((d) => d.id !== id);
      updateSetting('customDevices', updated);
      saveSettings({ ...settings, customDevices: updated }).catch(
        (): void => {},
      );
    },
    [settings, updateSetting],
  );

  const handleDeleteHistory = useCallback((id: string): void => {
    deleteHistoryItem(id)
      .then((updated) => {
        setHistoryItems(updated);
      })
      .catch((): void => {});
  }, []);

  const handleClearHistory = useCallback((): void => {
    clearHistory()
      .then(() => {
        setHistoryItems([]);
      })
      .catch((): void => {});
  }, []);

  const handleExportBackup = useCallback((): void => {
    if (settings == null) return;
    const dataStr = JSON.stringify(settings, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `webshot-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [settings]);

  const handleImportBackup = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0];
      if (file == null) return;
      const reader = new FileReader();
      reader.onload = (event): void => {
        try {
          const parsed = JSON.parse(event.target?.result as string) as Record<
            string,
            unknown
          > | null;
          if (parsed !== null && typeof parsed === 'object') {
            const merged = { ...DEFAULT_SETTINGS, ...parsed };
            setSettings(merged);
            saveSettings(merged)
              .then((): void => {
                setSaved(true);
                setError('');
                setTimeout(() => {
                  setSaved(false);
                }, 2000);
              })
              .catch((err: unknown) => {
                setError(String(err));
              });
          } else {
            setError('Invalid settings backup structure');
          }
        } catch (err: unknown) {
          setError(`Failed to read backup settings: ${String(err)}`);
        }
      };
      reader.readAsText(file);
    },
    [],
  );

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
      <h1 className="pageTitle">Webshot Config</h1>

      {/* Tabs Selector Navigation bar */}
      <div className="tabsGroup">
        {(['general', 'devices', 'history', 'backup'] as SettingsTab[]).map(
          (tab) => (
            <button
              key={tab}
              className={`tabBtn ${activeTab === tab ? 'active' : ''}`}
              onClick={(): void => {
                setActiveTab(tab);
                setError('');
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ),
        )}
      </div>

      {activeTab === 'general' && (
        <div>
          <section className="section">
            <h2 className="sectionTitle">Defaults</h2>

            <label className="field">
              <span className="fieldLabel">Default Format</span>
              <select
                className="fieldInput"
                value={settings.defaultFormat}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>): void => {
                  updateSetting(
                    'defaultFormat',
                    e.target.value as OutputFormat,
                  );
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
            <h2 className="sectionTitle">Capture Options</h2>

            <label className="field">
              <span className="fieldLabel">
                Filename Template
                <span className="fieldHint">
                  Supports templates using tags: `{`title`}`, `{`domain`}`, `
                  {`date`}`, `{`time`}`, `{`format`}`, `{`device`}`
                </span>
              </span>
              <input
                type="text"
                className="fieldInput textInput"
                value={settings.filenameTemplate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                  updateSetting('filenameTemplate', e.target.value);
                }}
              />
            </label>

            <label className="field">
              <span className="fieldLabel">Scroll Overlap Pad (px)</span>
              <input
                type="number"
                className="fieldInput"
                min={0}
                max={1000}
                value={settings.scrollPad}
                onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                  const parsed = Number(e.target.value);
                  updateSetting(
                    'scrollPad',
                    Number.isFinite(parsed) ? parsed : 0,
                  );
                }}
              />
            </label>

            <label className="field">
              <span className="fieldLabel">Settle Wait Delay (ms)</span>
              <input
                type="number"
                className="fieldInput"
                min={0}
                max={5000}
                value={settings.captureDelay}
                onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                  const parsed = Number(e.target.value);
                  updateSetting(
                    'captureDelay',
                    Number.isFinite(parsed) ? parsed : 0,
                  );
                }}
              />
            </label>

            <label className="field">
              <span className="fieldLabel">Max History Cache Items</span>
              <input
                type="number"
                className="fieldInput"
                min={5}
                max={500}
                value={settings.maxHistoryItems}
                onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                  const parsed = Number(e.target.value);
                  updateSetting(
                    'maxHistoryItems',
                    Number.isFinite(parsed) ? parsed : 50,
                  );
                }}
              />
            </label>
          </section>

          <section className="section">
            <h2 className="sectionTitle">Rendering & Safety</h2>

            <label className="field fieldToggle">
              <span className="fieldLabel">
                Split PDF Multi-page
                <span className="fieldHint">
                  Divides PDF pages vertically matching standard portrait A4
                  page dimensions
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.pdfMultiPage}
                onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                  updateSetting('pdfMultiPage', e.target.checked);
                }}
              />
            </label>

            <label className="field fieldToggle">
              <span className="fieldLabel">
                Show scaling warning overlay
                <span className="fieldHint">
                  Reminds user that high-res rendering may cause page layout
                  updates
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

            <label className="field fieldToggle">
              <span className="fieldLabel">
                Block mouse input and events
                <span className="fieldHint">
                  Disables user clicks, text hover, and input actions while
                  screen stitching
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

          <button className="saveBtn" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}

      {activeTab === 'devices' && (
        <div>
          <section className="section">
            <h2 className="sectionTitle">Custom Device Profiles Manager</h2>
            <div className="addDeviceForm">
              <div className="formRow">
                <input
                  type="text"
                  placeholder="Device Profile Name (e.g. iPhone 15)"
                  className="fieldInput fullWidth"
                  value={newDeviceName}
                  onChange={(e) => {
                    setNewDeviceName(e.target.value);
                  }}
                />
              </div>
              <div className="formRow split">
                <label className="formLabel">
                  Width
                  <input
                    type="number"
                    min={100}
                    max={10000}
                    className="fieldInput"
                    value={newDeviceWidth}
                    onChange={(e) => {
                      setNewDeviceWidth(Number(e.target.value));
                    }}
                  />
                </label>
                <label className="formLabel">
                  Height
                  <input
                    type="number"
                    min={100}
                    max={10000}
                    className="fieldInput"
                    value={newDeviceHeight}
                    onChange={(e) => {
                      setNewDeviceHeight(Number(e.target.value));
                    }}
                  />
                </label>
              </div>
              <div className="formRow">
                <input
                  type="text"
                  placeholder="User Agent override header string (Optional)"
                  className="fieldInput fullWidth"
                  value={newDeviceUA}
                  onChange={(e) => {
                    setNewDeviceUA(e.target.value);
                  }}
                />
              </div>
              <div className="formRow inline">
                <label className="fieldToggle">
                  <input
                    type="checkbox"
                    checked={newDeviceMobile}
                    onChange={(e) => {
                      setNewDeviceMobile(e.target.checked);
                    }}
                  />
                  <span>Enable Mobile emulation flags</span>
                </label>
                <button className="addBtn" onClick={handleAddCustomDevice}>
                  Add Device
                </button>
              </div>
            </div>

            <div className="deviceList">
              <h3 className="subTitleLabel">Your Devices</h3>
              {settings.customDevices.length === 0 ? (
                <p className="hintLabel">No custom devices added yet.</p>
              ) : (
                settings.customDevices.map((d) => (
                  <div key={d.id} className="deviceCard">
                    <div className="deviceInfo">
                      <strong className="deviceName">{d.name}</strong>
                      <span className="deviceMetrics">
                        {d.width}px × {d.height}px (
                        {d.mobile ? 'Mobile' : 'Desktop'})
                      </span>
                    </div>
                    <button
                      className="deleteCardBtn"
                      onClick={() => {
                        handleDeleteCustomDevice(d.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="section">
            <h2 className="sectionTitle">Pre-configured Emulation Templates</h2>
            <div className="devicePresetGrid">
              {PRESET_DEVICES.map((d) => (
                <div key={d.id} className="presetCard">
                  <strong>{d.name}</strong>
                  <span>
                    {d.width} × {d.height}
                  </span>
                  <span className="tag">{d.category}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'history' && (
        <div>
          <section className="section">
            <div className="historyHeader">
              <h2 className="sectionTitle">Screenshot Logs</h2>
              {historyItems.length > 0 && (
                <button className="clearBtn" onClick={handleClearHistory}>
                  Clear All Gallery
                </button>
              )}
            </div>

            {historyItems.length === 0 ? (
              <p className="hintLabel">
                Your capture history gallery is empty.
              </p>
            ) : (
              <div className="historyGrid">
                {historyItems.map((item) => (
                  <div key={item.id} className="historyCard">
                    <img
                      src={item.dataUri}
                      alt={item.title}
                      className="historyThumb"
                    />
                    <div className="historyMeta">
                      <strong className="historyTitle" title={item.title}>
                        {item.title}
                      </strong>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="historyUrl"
                        title={item.url}
                      >
                        {item.url}
                      </a>
                      <span className="historyDetails">
                        {item.format.toUpperCase()} • {item.scale}x •{' '}
                        {Math.round(item.size / 1024)} KB
                      </span>
                      <span className="historyDate">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <button
                      className="deleteCardBtn"
                      onClick={() => {
                        handleDeleteHistory(item.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'backup' && (
        <div>
          <section className="section">
            <h2 className="sectionTitle">Settings Management</h2>
            <p className="hintLabel margin">
              Download your configurations as a settings JSON file or restore a
              previous settings backup file.
            </p>
            <div className="backupActions">
              <button className="exportBtn" onClick={handleExportBackup}>
                Export Settings JSON
              </button>

              <div className="importField">
                <label className="importLabel">
                  Import Settings backup
                  <input
                    type="file"
                    accept=".json"
                    className="fileInput"
                    onChange={handleImportBackup}
                  />
                </label>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
