import { useState } from "react";
import { AudioSettings } from "../../src/types";

import { SettingsToggle } from "../../components/SettingsToggle";
import { AudioControls } from "../../components/AudioControls";

function App() {
    const [settings, setSettings] = useState<AudioSettings>({
        volume: 100,
        speed: 100,
        bassBoost: 100,
        voiceBoost: 100,
        mono: false,
    });

    const [isUsingGlobalSettings, setIsUsingGlobalSettings] = useState(true);
    const [isSiteEnabled, setIsSiteEnabled] = useState(true);

    const handleSettingChange = (
        key: keyof AudioSettings,
        value: number | boolean
    ) => {
        setSettings((prev) => ({
            ...prev,
            [key]: value,
        }));
    };

    const formatDiff = (value: number) => {
        return `${value}%`;
    };

    const handleReset = () => {
        setSettings({
            volume: 100,
            speed: 100,
            bassBoost: 100,
            voiceBoost: 100,
            mono: false,
        });
    };

    const handleToggleMode = (mode: "global" | "site" | "disabled") => {
        if (mode === "global") {
            setIsUsingGlobalSettings(true);
            setIsSiteEnabled(true);
        } else if (mode === "site") {
            setIsUsingGlobalSettings(false);
            setIsSiteEnabled(true);
        } else {
            setIsUsingGlobalSettings(false);
            setIsSiteEnabled(false);
        }
    };

    return (
        <div className="w-[280px] p-4 font-sans">
            <AudioControls
                settings={settings}
                onSettingChange={handleSettingChange}
                formatDiff={formatDiff}
                onReset={handleReset}
            />

            <SettingsToggle
                isUsingGlobalSettings={isUsingGlobalSettings}
                isSiteEnabled={isSiteEnabled}
                onToggle={handleToggleMode}
            />

            <button
                onClick={() => {}}
                className="w-full bg-primary text-white rounded py-2.5 text-sm font-medium border-none cursor-pointer hover:bg-[#1557b0] transition-colors duration-200"
            >
                Donate
            </button>
        </div>
    );
}

export default App;
