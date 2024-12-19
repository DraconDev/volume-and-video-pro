import { useState } from "react";
import { AudioSettings, defaultSettings } from "../../src/types";
import { AudioControls } from "../../components/AudioControls";
import { Header } from "../../components/Header";
import { SettingsToggle } from "../../components/SettingsToggle";
import { useAudioSettings } from "../../hooks/useAudioSettings";
import "./App.css";

function App() {
    const {
        settings,
        siteConfigs,
        currentUrl,
        isUsingGlobalSettings,
        saving,
        setSaving,
        updateSettings,
        handleSettingsToggle,
        setSiteConfigs,
    } = useAudioSettings(defaultSettings);

    const [showSiteEditor, setShowSiteEditor] = useState(false);

    const isSiteEnabled = currentUrl
        ? siteConfigs[currentUrl]?.enabled !== false
        : true;

    const handleSettingChange = (
        key: keyof AudioSettings,
        value: number | boolean
    ) => {
        const newSettings = { ...settings, [key]: value };
        updateSettings(newSettings);
        setSaving(true);
        setTimeout(() => setSaving(false), 500);
    };

    const handleReset = () => {
        console.log("Resetting all settings");
        updateSettings(defaultSettings);
        setSaving(true);
        setTimeout(() => setSaving(false), 500);
    };

    const handleToggleSite = () => {
        if (currentUrl) {
            const newSiteConfigs = { ...siteConfigs };
            newSiteConfigs[currentUrl] = {
                ...siteConfigs[currentUrl],
                enabled: !isSiteEnabled,
                lastUsedType: !isSiteEnabled ? "site" : "disabled"
            };
            setSiteConfigs(newSiteConfigs);
            chrome.storage.sync.set({ siteConfigs: newSiteConfigs });
            handleSettingsToggle(!isSiteEnabled ? "site" : "disabled");
        }
    };

    const formatDiff = (value: number) => {
        const diff = value - 100;
        return `${diff > 0 ? "+" : ""}${diff}%`;
    };

    return (
        <div className="container">
            <div className="controls-section main-controls">
                <Header
                    currentUrl={currentUrl}
                    isSiteEnabled={isSiteEnabled}
                    onToggleSite={handleToggleSite}
                    onReset={handleReset}
                />

                <SettingsToggle
                    isUsingGlobalSettings={isUsingGlobalSettings}
                    isSiteEnabled={isSiteEnabled}
                    onToggle={handleSettingsToggle}
                />

                <AudioControls
                    settings={settings}
                    onSettingChange={handleSettingChange}
                    formatDiff={formatDiff}
                />

                {saving && <div className="saving-indicator">Saving...</div>}
            </div>
        </div>
    );
}

export default App;
