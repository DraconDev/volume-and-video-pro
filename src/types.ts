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
  activeSetting: "global" | "site" | "disabled";
}

export const defaultSettings: AudioSettings = {
  volume: 100,
  bassBoost: 100,
  voiceBoost: 100,
  mono: false,
  speed: 100,
};

export interface GetInitialSettingsMessage {
  type: "GET_INITIAL_SETTINGS";
  hostname: string;
}


export const defaultSiteSettings: SiteSettings = {
  enabled: true,
  settings: { ...defaultSettings },
  activeSetting: "global", // Starts in global mode, can be changed to "site" or "disabled"
};

export type StateType = {
  globalSettings: AudioSettings;
  siteSettings: Map<string, SiteSettings>;
};

export interface UpdateSettingsMessage {
  type: "UPDATE_SETTINGS";
  settings: AudioSettings;
  enabled?: boolean;
  isGlobal?: boolean;
  hostname?: string; // Add optional hostname
}

export interface ContentScriptReadyMessage {
  type: "CONTENT_SCRIPT_READY";
  hostname?: string;
  usingGlobal?: boolean;
}

export interface UpdateSiteModeMessage {
  type: "UPDATE_SITE_MODE";
  hostname?: string;
  mode?: "global" | "site" | "disabled";
}

export type MessageType =
  | UpdateSettingsMessage
  | ContentScriptReadyMessage
  | UpdateSiteModeMessage;

export type StorageData = {
  globalSettings?: AudioSettings;
  siteSettings?: { [hostname: string]: SiteSettings };
};
