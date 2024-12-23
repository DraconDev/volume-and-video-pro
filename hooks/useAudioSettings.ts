import { AudioSettings, SiteSettings } from "@/src/types";
import { useState, useCallback, useEffect } from "react";

export const useAudioSettings = (defaultSettings: AudioSettings) => {
    const [settings, setSettings] = useState<AudioSettings>(defaultSettings);
    const [globalSettings, setGlobalSettings] =
        useState<AudioSettings>(defaultSettings);
    const [siteConfigs, setSiteConfigs] = useState<{
        [key: string]: SiteSettings;
    }>({});
    const [currentUrl, setCurrentUrl] = useState<string>("");
    const [isUsingGlobalSettings, setIsUsingGlobalSettings] = useState(false);
    const [saving, setSaving] = useState(false);

    const updateSettings = useCallback(
        (newSettings: AudioSettings, updateImmediately = true) => {
            // Check if settings have actually changed
            const hasChanged = Object.entries(newSettings).some(
                ([key, value]) => settings[key as keyof AudioSettings] !== value
            );

            if (!hasChanged) {
                console.log("Settings unchanged, skipping update");
                return;
            }

            setSettings(newSettings);

            if (updateImmediately) {
                if (!isUsingGlobalSettings && currentUrl) {
                    const newSiteConfigs = { ...siteConfigs };
                    newSiteConfigs[currentUrl] = {
                        enabled: true,
                        settings: newSettings,
                        activeSetting: "site",
                    };
                    setSiteConfigs(newSiteConfigs);
                    chrome.storage.sync.set({ siteConfigs: newSiteConfigs });
                }

                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    (tabs) => {
                        if (tabs[0]?.id) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                type: "UPDATE_SETTINGS",
                                settings: newSettings,
                                isGlobal: isUsingGlobalSettings,
                                enabled: true,
                            });
                        }
                    }
                );
            }
        },
        [currentUrl, isUsingGlobalSettings, siteConfigs, settings]
    );

    const handleSettingsToggle = useCallback(
        (type: "global" | "site" | "default") => {
            if (!currentUrl) return;

            const updateTab = (
                settings: AudioSettings,
                isGlobal: boolean,
                enabled: boolean
            ) => {
                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    (tabs) => {
                        if (tabs[0]?.id) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                type: "UPDATE_SETTINGS",
                                settings,
                                isGlobal,
                                enabled,
                            });
                        }
                    }
                );
            };

            if (type === "global") {
                chrome.storage.sync.get(["globalSettings"], (result) => {
                    const newGlobalSettings =
                        result.globalSettings || defaultSettings;

                    // Check if settings would actually change
                    const hasChanged = Object.entries(newGlobalSettings).some(
                        ([key, value]) =>
                            settings[key as keyof AudioSettings] !== value
                    );

                    if (!hasChanged && isUsingGlobalSettings) {
                        console.log(
                            "Already using same global settings, skipping update"
                        );
                        return;
                    }

                    setSettings(newGlobalSettings);
                    setIsUsingGlobalSettings(true);

                    const newSiteConfigs = { ...siteConfigs };
                    newSiteConfigs[currentUrl] = {
                        enabled: true,
                        settings: newGlobalSettings,
                        activeSetting: "global",
                    };
                    setSiteConfigs(newSiteConfigs);
                    chrome.storage.sync.set({ siteConfigs: newSiteConfigs });

                    updateTab(newGlobalSettings, true, true);
                });
            } else if (type === "site") {
                const newSiteSettings =
                    siteConfigs[currentUrl]?.settings || settings;

                // Check if settings would actually change
                const hasChanged =
                    Object.entries(newSiteSettings).some(
                        ([key, value]) =>
                            settings[key as keyof AudioSettings] !== value
                    ) || isUsingGlobalSettings;

                if (!hasChanged) {
                    console.log(
                        "Already using same site settings, skipping update"
                    );
                    return;
                }

                setSettings(newSiteSettings);
                setIsUsingGlobalSettings(false);

                const newSiteConfigs = { ...siteConfigs };
                newSiteConfigs[currentUrl] = {
                    enabled: true,
                    settings: newSiteSettings,
                    activeSetting: "site",
                };
                setSiteConfigs(newSiteConfigs);
                chrome.storage.sync.set({ siteConfigs: newSiteConfigs });

                updateTab(newSiteSettings, false, true);
            } else {
                // Always update when disabling
                const newSiteConfigs = { ...siteConfigs };
                newSiteConfigs[currentUrl] = {
                    enabled: true,
                    settings: defaultSettings,
                    activeSetting: "default",
                };
                setSiteConfigs(newSiteConfigs);
                chrome.storage.sync.set({ siteConfigs: newSiteConfigs });

                updateTab(defaultSettings, false, true);
            }
        },
        [
            currentUrl,
            settings,
            siteConfigs,
            defaultSettings,
            isUsingGlobalSettings,
        ]
    );

    // Load initial settings
    useEffect(() => {
        chrome.storage.sync.get(
            {
                globalSettings: defaultSettings,
                siteConfigs: {},
            },
            (result) => {
                setGlobalSettings(result.globalSettings);
                setSiteConfigs(result.siteConfigs);

                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    (tabs) => {
                        if (tabs[0]?.url) {
                            const url = tabs[0].url;
                            setCurrentUrl(url);

                            const siteConfig = result.siteConfigs[url];
                            if (siteConfig) {
                                const activeSetting =
                                    siteConfig.activeSetting || "global";
                                setIsUsingGlobalSettings(
                                    activeSetting === "global"
                                );

                                if (activeSetting === "global") {
                                    setSettings(result.globalSettings);
                                } else if (activeSetting === "default") {
                                    setSettings(defaultSettings);
                                } else {
                                    setSettings(
                                        siteConfig.settings || defaultSettings
                                    );
                                }
                            } else {
                                setIsUsingGlobalSettings(true);
                                setSettings(result.globalSettings);
                            }
                        }
                    }
                );
            }
        );
    }, [defaultSettings]);

    return {
        settings,
        globalSettings,
        siteConfigs,
        currentUrl,
        isUsingGlobalSettings,
        saving,
        setSaving,
        updateSettings,
        handleSettingsToggle,
        setSettings,
        setGlobalSettings,
        setSiteConfigs,
        setCurrentUrl,
        setIsUsingGlobalSettings,
    };
};
