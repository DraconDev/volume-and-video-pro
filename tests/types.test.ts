import { describe, it, expect } from "vitest";
import { isSettingsDisabled, defaultSettings } from "../src/types";

describe("isSettingsDisabled", () => {
  it("returns true for default settings", () => {
    expect(isSettingsDisabled(defaultSettings)).toBe(true);
  });

  it("returns false when volume is not 100", () => {
    expect(isSettingsDisabled({ ...defaultSettings, volume: 150 })).toBe(false);
    expect(isSettingsDisabled({ ...defaultSettings, volume: 50 })).toBe(false);
  });

  it("returns false when speed is not 100", () => {
    expect(isSettingsDisabled({ ...defaultSettings, speed: 150 })).toBe(false);
    expect(isSettingsDisabled({ ...defaultSettings, speed: 50 })).toBe(false);
  });

  it("returns false when bassBoost is not 100", () => {
    expect(isSettingsDisabled({ ...defaultSettings, bassBoost: 150 })).toBe(false);
  });

  it("returns false when voiceBoost is not 100", () => {
    expect(isSettingsDisabled({ ...defaultSettings, voiceBoost: 150 })).toBe(false);
  });

  it("returns false when mono is true", () => {
    expect(isSettingsDisabled({ ...defaultSettings, mono: true })).toBe(false);
  });
});
