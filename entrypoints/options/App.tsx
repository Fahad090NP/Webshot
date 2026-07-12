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

// Functional SVG Icons for Sidebar Tabs and Badges
function ConfigIcon(): React.ReactElement {
  return (
    <svg
      className="tabIcon"
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

function DeviceIcon(): React.ReactElement {
  return (
    <svg
      className="tabIcon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

function HistoryIcon(): React.ReactElement {
  return (
    <svg
      className="tabIcon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function BackupIcon(): React.ReactElement {
  return (
    <svg
      className="tabIcon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}

function MobileCategoryIcon(): React.ReactElement {
  return (
    <svg
      className="badgeIcon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <rect x="5" y="2" width="14" height="20" rx="2" />
    </svg>
  );
}

function TabletCategoryIcon(): React.ReactElement {
  return (
    <svg
      className="badgeIcon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <rect
        x="4"
        y="2"
        width="16"
        height="20"
        rx="2"
        transform="rotate(90 12 12)"
      />
    </svg>
  );
}

function DesktopCategoryIcon(): React.ReactElement {
  return (
    <svg
      className="badgeIcon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

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
  const [previewItem, setPreviewItem] = useState<CaptureHistoryItem | null>(
    null,
  );

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

  const handleResetSettings = useCallback((): void => {
    if (
      window.confirm(
        'Are you sure you want to reset all configurations to default values?',
      )
    ) {
      setSettings(DEFAULT_SETTINGS);
      saveSettings(DEFAULT_SETTINGS)
        .then((): void => {
          setSaved(true);
          setError('');
          setTimeout((): void => {
            setSaved(false);
          }, 2000);
        })
        .catch((err: unknown) => {
          setError(String(err));
        });
    }
  }, []);

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

  const handleDeleteHistory = useCallback(
    (id: string): void => {
      deleteHistoryItem(id)
        .then((updated) => {
          setHistoryItems(updated);
          if (previewItem?.id === id) {
            setPreviewItem(null);
          }
        })
        .catch((): void => {});
    },
    [previewItem],
  );

  const handleClearHistory = useCallback((): void => {
    clearHistory()
      .then((): void => {
        setHistoryItems([]);
        setPreviewItem(null);
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
                setTimeout((): void => {
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

  const totalCount = historyItems.length;
  const totalSize = historyItems.reduce((acc, h) => acc + h.size, 0);
  const formatStats = historyItems.reduce<Record<string, number>>((acc, h) => {
    acc[h.format] = (acc[h.format] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="optionsApp animated">
      {/* Sidebar Navigation Panel */}
      <div className="optionsSidebar">
        <div className="sidebarBrand">
          <svg
            className="sidebarLogo"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <span className="sidebarTitle">Webshot Config</span>
        </div>
        <div className="sidebarTabs">
          {(['general', 'devices', 'history', 'backup'] as SettingsTab[]).map(
            (tab) => (
              <button
                key={tab}
                className={`sidebarTabBtn ${activeTab === tab ? 'active' : ''}`}
                onClick={(): void => {
                  setActiveTab(tab);
                  setError('');
                }}
              >
                {tab === 'general' ? (
                  <ConfigIcon />
                ) : tab === 'devices' ? (
                  <DeviceIcon />
                ) : tab === 'history' ? (
                  <HistoryIcon />
                ) : (
                  <BackupIcon />
                )}
                <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
              </button>
            ),
          )}
        </div>
        <div className="sidebarFooter">
          <span>v1.2.0 • Orgusys</span>
        </div>
      </div>

      {/* Right side Settings Content Panels */}
      <div className="optionsContent">
        {activeTab === 'general' && (
          <div className="tabContent">
            <h2 className="contentTitle">General Configurations</h2>

            <section className="section">
              <h3 className="sectionTitle">Defaults</h3>

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
              <h3 className="sectionTitle">Capture Options</h3>

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
              <h3 className="sectionTitle">Rendering & Safety</h3>

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

            <section className="section">
              <h3 className="sectionTitle">Keyboard Shortcuts</h3>
              <div className="shortcutsGrid">
                <div className="shortcutCard">
                  <kbd className="shortcutKey">Ctrl + Shift + Y</kbd>
                  <span className="shortcutDesc">Capture Full Page</span>
                </div>
                <div className="shortcutCard">
                  <kbd className="shortcutKey">Ctrl + Shift + U</kbd>
                  <span className="shortcutDesc">Capture Viewport</span>
                </div>
              </div>
            </section>

            {error !== '' && <p className="errorMsg">{error}</p>}
            {saved && <p className="successMsg">Settings saved!</p>}

            <div className="generalActions">
              <button
                className="saveBtn"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save Settings'}
              </button>
              <button
                className="resetBtn"
                onClick={handleResetSettings}
                disabled={isSaving}
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        )}

        {activeTab === 'devices' && (
          <div className="tabContent">
            <h2 className="contentTitle">Device Emulation</h2>

            <section className="section">
              <h3 className="sectionTitle">Create Custom Device Profile</h3>
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
                  <div className="deviceGrid">
                    {settings.customDevices.map((d) => (
                      <div key={d.id} className="deviceCard">
                        <div className="deviceCardHeader">
                          <div className="deviceBadge">
                            {d.category === 'desktop' ? (
                              <DesktopCategoryIcon />
                            ) : d.category === 'tablet' ? (
                              <TabletCategoryIcon />
                            ) : (
                              <MobileCategoryIcon />
                            )}
                            <span className="deviceTag">{d.category}</span>
                          </div>
                          <button
                            className="deleteCardBtn"
                            onClick={() => {
                              handleDeleteCustomDevice(d.id);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                        <div className="deviceCardBody">
                          <strong className="deviceName">{d.name}</strong>
                          <span className="deviceMetrics">
                            {d.width}px × {d.height}px
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="section">
              <h3 className="sectionTitle">
                Pre-configured Emulation Templates
              </h3>
              <div className="devicePresetGrid">
                {PRESET_DEVICES.map((d) => (
                  <div key={d.id} className="presetCard">
                    <div className="presetHeader">
                      {d.category === 'desktop' ? (
                        <DesktopCategoryIcon />
                      ) : d.category === 'tablet' ? (
                        <TabletCategoryIcon />
                      ) : (
                        <MobileCategoryIcon />
                      )}
                      <span className="tag">{d.category}</span>
                    </div>
                    <strong className="presetName">{d.name}</strong>
                    <span className="presetMetrics">
                      {d.width} × {d.height}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="tabContent">
            <div className="historyHeader">
              <h2 className="contentTitle">Screenshot Gallery</h2>
              {historyItems.length > 0 && (
                <button className="clearBtn" onClick={handleClearHistory}>
                  Clear Gallery
                </button>
              )}
            </div>

            <section className="section">
              {historyItems.length > 0 && (
                <div className="statsDashboard">
                  <div className="statsCard">
                    <div className="statsHeader">
                      <svg
                        className="statsIcon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <rect
                          x="3"
                          y="3"
                          width="18"
                          height="18"
                          rx="2"
                          ry="2"
                        />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                      </svg>
                      <span className="statsLabel">Total Captures</span>
                    </div>
                    <span className="statsVal">{totalCount}</span>
                  </div>
                  <div className="statsCard">
                    <div className="statsHeader">
                      <svg
                        className="statsIcon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                      <span className="statsLabel">Thumbnail Size</span>
                    </div>
                    <span className="statsVal">
                      {Math.round(totalSize / 1024)} KB
                    </span>
                  </div>
                  <div className="statsCard">
                    <div className="statsHeader">
                      <svg
                        className="statsIcon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      <span className="statsLabel">Formats Active</span>
                    </div>
                    <span className="statsVal">
                      {formats.filter((f) => (formatStats[f] ?? 0) > 0).length}
                    </span>
                  </div>
                </div>
              )}

              {historyItems.length === 0 ? (
                <p className="hintLabel">
                  Your capture history gallery is empty.
                </p>
              ) : (
                <div className="historyGrid">
                  {historyItems.map((item) => (
                    <div key={item.id} className="historyCard">
                      <div
                        className="historyThumbContainer clickable"
                        onClick={(): void => {
                          setPreviewItem(item);
                        }}
                      >
                        <img
                          src={item.dataUri}
                          alt={item.title}
                          className="historyThumb"
                        />
                        <div className="thumbHoverOverlay">
                          <svg
                            className="overlayIcon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                          >
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            <line x1="11" y1="8" x2="11" y2="14" />
                            <line x1="8" y1="11" x2="14" y2="11" />
                          </svg>
                        </div>
                      </div>
                      <div className="historyMeta">
                        <strong
                          className="historyTitle clickable"
                          title={item.title}
                          onClick={(): void => {
                            setPreviewItem(item);
                          }}
                        >
                          {item.title}
                        </strong>
                        <div className="metaRow">
                          <svg
                            className="metaIcon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="historyUrl"
                            title={item.url}
                          >
                            {item.url}
                          </a>
                        </div>
                        <div className="metaRow specs">
                          <span className="badge format">
                            {item.format.toUpperCase()}
                          </span>
                          <span className="metaText">{item.scale}x res</span>
                          <span className="metaDivider">•</span>
                          <span className="metaText">
                            {Math.round(item.size / 1024)} KB
                          </span>
                        </div>
                        <span className="historyDate">
                          {new Date(item.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <button
                        className="deleteCardBtn"
                        onClick={(): void => {
                          handleDeleteHistory(item.id);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Interactive Screenshot Preview Modal */}
            {previewItem != null && (
              <div
                className="previewModalOverlay"
                onClick={(): void => {
                  setPreviewItem(null);
                }}
              >
                <div
                  className="previewModal"
                  onClick={(e): void => {
                    e.stopPropagation();
                  }}
                >
                  <div className="modalHeader">
                    <h3 className="modalTitle" title={previewItem.title}>
                      {previewItem.title}
                    </h3>
                    <button
                      className="modalCloseBtn"
                      onClick={(): void => {
                        setPreviewItem(null);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="modalBody">
                    <div className="modalImgContainer">
                      <img
                        src={previewItem.dataUri}
                        alt={previewItem.title}
                        className="modalImg"
                      />
                    </div>
                    <div className="modalDetails">
                      <div className="modalDetailItem">
                        <strong>Source Link</strong>
                        <a
                          href={previewItem.url}
                          target="_blank"
                          rel="noreferrer"
                          className="modalUrlLink"
                        >
                          {previewItem.url}
                        </a>
                      </div>
                      <div className="modalDetailItem">
                        <strong>Format</strong>
                        <span className="modalSpecTag">
                          {previewItem.format.toUpperCase()}
                        </span>
                      </div>
                      <div className="modalDetailItem">
                        <strong>Resolution Scale</strong>
                        <span>{previewItem.scale}x</span>
                      </div>
                      <div className="modalDetailItem">
                        <strong>Estimated Size</strong>
                        <span>{Math.round(previewItem.size / 1024)} KB</span>
                      </div>
                      <div className="modalDetailItem">
                        <strong>Captured On</strong>
                        <span>
                          {new Date(previewItem.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <button
                        className="modalDeleteBtn"
                        onClick={(): void => {
                          handleDeleteHistory(previewItem.id);
                        }}
                      >
                        Delete Capture Log
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'backup' && (
          <div className="tabContent">
            <h2 className="contentTitle">Backup & Restore</h2>

            <section className="section">
              <h3 className="sectionTitle">Settings Management</h3>
              <p className="hintLabel margin">
                Download your current configuration options as a settings JSON
                backup file, or restore configuration from a previously saved
                JSON file.
              </p>
              <div className="backupActions">
                <button className="exportBtn" onClick={handleExportBackup}>
                  Export Settings JSON
                </button>

                <div className="importField">
                  <label className="importLabel">
                    <svg
                      className="cloudUploadIcon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                    </svg>
                    <span>Click to Import Settings backup</span>
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
    </div>
  );
}

export default App;
