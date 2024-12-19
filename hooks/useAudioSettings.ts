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
            setSettings(newSettings);

            if (updateImmediately) {
                if (!isUsingGlobalSettings && currentUrl) {
                    const newSiteConfigs = { ...siteConfigs };
                    newSiteConfigs[currentUrl] = {
                        enabled: true,
                        settings: newSettings,
                        lastUsedType: "site",
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
        [currentUrl, isUsingGlobalSettings, siteConfigs]
    );

    const handleSettingsToggle = useCallback(
        (type: "global" | "site" | "disabled") => {
            if (!currentUrl) return;

            if (type === "global") {
                chrome.storage.sync.get(["globalSettings"], (result) => {
                    const globalSettings =
                        result.globalSettings || defaultSettings;
                    setSettings(globalSettings);
                    setIsUsingGlobalSettings(true);

                    const newSiteConfigs = { ...siteConfigs };
                    newSiteConfigs[currentUrl] = {
                        enabled: true,
                        settings: globalSettings,
                        lastUsedType: "global",
                    };
                    setSiteConfigs(newSiteConfigs);
                    chrome.storage.sync.set({ siteConfigs: newSiteConfigs });

                    chrome.tabs.query(
                        { active: true, currentWindow: true },
                        (tabs) => {
                            if (tabs[0]?.id) {
                                chrome.tabs.sendMessage(tabs[0].id, {
                                    type: "UPDATE_SETTINGS",
                                    settings: globalSettings,
                                    isGlobal: true,
                                    enabled: true,
                                });
                            }
                        }
                    );
                });
            } else if (type === "site") {
                const siteSettings =
                    siteConfigs[currentUrl]?.settings || settings;
                setSettings(siteSettings);
                setIsUsingGlobalSettings(false);

                const newSiteConfigs = { ...siteConfigs };
                newSiteConfigs[currentUrl] = {
                    enabled: true,
                    settings: siteSettings,
                    lastUsedType: "site",
                };
                setSiteConfigs(newSiteConfigs);
                chrome.storage.sync.set({ siteConfigs: newSiteConfigs });

                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    (tabs) => {
                        if (tabs[0]?.id) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                type: "UPDATE_SETTINGS",
                                settings: siteSettings,
                                isGlobal: false,
                                enabled: true,
                            });
                        }
                    }
                );
            } else {
                const newSiteConfigs = { ...siteConfigs };
                newSiteConfigs[currentUrl] = {
                    enabled: false,
                    settings: settings,
                    lastUsedType: "disabled",
                };
                setSiteConfigs(newSiteConfigs);
                chrome.storage.sync.set({ siteConfigs: newSiteConfigs });

                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    (tabs) => {
                        if (tabs[0]?.id) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                type: "UPDATE_SETTINGS",
                                settings: defaultSettings,
                                isGlobal: false,
                                enabled: false,
                            });
                        }
                    }
                );
            }
        },
        [currentUrl, settings, siteConfigs, defaultSettings]
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
                                const lastUsedType =
                                    siteConfig.lastUsedType || "global";
                                setIsUsingGlobalSettings(
                                    lastUsedType === "global"
                                );

                                if (lastUsedType === "global") {
                                    setSettings(result.globalSettings);
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
