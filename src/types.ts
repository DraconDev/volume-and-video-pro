export interface AudioSettings {
    volume: number;
    bassBoost: number;
    voiceBoost: number;
    mono: boolean;
    speed: number;
}

export interface SiteSettings {
    enabled: boolean;
    settings?: AudioSettings;
    lastUsedType: "global" | "site" | "disabled";
}

export const defaultSettings: AudioSettings = {
    volume: 100,
    bassBoost: 100,
    voiceBoost: 100,
    mono: false,
    speed: 100,
};

export const defaultSiteSettings: SiteSettings = {
    enabled: true,
    settings: { ...defaultSettings },
    lastUsedType: "global",
};

export type StateType = {
    globalSettings: AudioSettings;
    siteSettings: Map<string, SiteSettings>;
};

export type MessageType = {
    type: "UPDATE_SETTINGS" | "CONTENT_SCRIPT_READY" | "UPDATE_SITE_MODE";
    settings?: AudioSettings;
    enabled?: boolean;
    isGlobal?: boolean;
    hostname?: string;
    mode?: "global" | "site" | "disabled";
};

export type StorageData = {
    globalSettings?: AudioSettings;
    siteSettings?: { [hostname: string]: SiteSettings };
};
