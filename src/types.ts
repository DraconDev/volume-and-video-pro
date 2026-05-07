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

export interface GetInitialSettingsMessage {
  type: "GET_INITIAL_SETTINGS";
  hostname?: string;
}

export type MessageType =
  | UpdateSettingsMessage
  | ContentScriptReadyMessage
  | UpdateSiteModeMessage
  | GetInitialSettingsMessage;

export type StorageData = {
  globalSettings?: AudioSettings;
  siteSettings?: { [hostname: string]: SiteSettings };
};

/**
 * Check if all audio settings are at their default (disabled) values.
 * This is a pure function used across content script and popup.
 */
export function isSettingsDisabled(settings: AudioSettings): boolean {
  return (
    settings.speed === 100 &&
    settings.volume === 100 &&
    settings.bassBoost === 100 &&
    settings.voiceBoost === 100 &&
    !settings.mono
  );
}

/**
 * Debug logger that can be disabled in production.
 * Set localStorage.debugVvp = 'true' to enable debug output.
 */
const DEBUG_ENABLED =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("debugVvp") === "true";

export function debugLog(...args: any[]) {
  if (DEBUG_ENABLED) {
    console.log("[VVP]", ...args);
  }
}

export function debugWarn(...args: any[]) {
  if (DEBUG_ENABLED) {
    console.warn("[VVP]", ...args);
  }
}

