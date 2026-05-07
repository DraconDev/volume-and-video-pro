import { describe, it, expect, beforeEach } from "vitest";
import { SettingsManager } from "../src/settings-manager";
import { defaultSettings, AudioSettings } from "../src/types";

// Mock chrome APIs
const mockStorage: Record<string, any> = {};
(globalThis as any).chrome = {
  storage: {
    sync: {
      get: async (keys: string[]) => {
        const result: Record<string, any> = {};
        keys.forEach((key) => {
          if (mockStorage[key]) result[key] = mockStorage[key];
        });
        return result;
      },
      set: async (items: Record<string, any>) => {
        Object.assign(mockStorage, items);
      },
    },
  },
  tabs: {
    query: async () => [],
    sendMessage: async () => {},
  },
  runtime: {
    lastError: null,
  },
};

describe("SettingsManager", () => {
  let manager: SettingsManager;

  beforeEach(() => {
    manager = new SettingsManager();
    // Clear mock storage
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  it("initializes with default settings", () => {
    expect(manager.globalSettings).toEqual(defaultSettings);
  });

  it("updates global settings", async () => {
    const newSettings: AudioSettings = {
      ...defaultSettings,
      volume: 200,
    };
    await manager.updateGlobalSettings(newSettings, 1, "example.com");
    expect(manager.globalSettings.volume).toBe(200);
  });

  it("updates site settings separately from global", async () => {
    const globalSettings: AudioSettings = {
      ...defaultSettings,
      volume: 200,
    };
    await manager.updateGlobalSettings(globalSettings, 1, "example.com");

    const siteSettings: AudioSettings = {
      ...defaultSettings,
      volume: 300,
    };
    await manager.updateSiteSettings("example.com", siteSettings, 1);

    const siteConfig = manager.getSettingsForSite("example.com");
    expect(siteConfig.settings!.volume).toBe(300);
    expect(manager.globalSettings.volume).toBe(200);
  });

  it("returns default settings for unknown sites", () => {
    const siteConfig = manager.getSettingsForSite("unknown.com");
    expect(siteConfig.settings).toEqual(defaultSettings);
    expect(siteConfig.activeSetting).toBe("global");
  });

  it("disables site correctly", async () => {
    await manager.updateSiteSettings("example.com", defaultSettings, 1);
    await manager.disableSite("example.com");

    const siteConfig = manager.getSettingsForSite("example.com");
    expect(siteConfig.enabled).toBe(false);
    expect(siteConfig.activeSetting).toBe("disabled");
  });
});
