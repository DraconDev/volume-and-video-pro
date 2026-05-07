var background = (function() {
  "use strict";var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  const defaultSettings = {
    volume: 100,
    bassBoost: 100,
    voiceBoost: 100,
    mono: false,
    speed: 100
  };
  ({
    settings: { ...defaultSettings }
  });
  background;
  function getHostname$1(url) {
    if (!url) return null;
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return null;
      }
      return parsedUrl.hostname;
    } catch (e) {
      console.warn("SettingsEventHandler: Invalid URL:", url);
      return null;
    }
  }
  function sendMessageToTab(tabId, message, frameId) {
    const options = { frameId };
    chrome.tabs.sendMessage(tabId, message, options).catch((error) => {
      const errorMessage = String(error);
      if (errorMessage.includes("Could not establish connection") || errorMessage.includes("No tab with id")) {
        console.debug(
          `SettingsEventHandler: Error sending message to tab ${tabId} (type: ${message.type}). Tab might be closed or content script not ready. Error:`,
          errorMessage
        );
      } else if (error) {
        console.warn(
          `SettingsEventHandler: Unexpected error sending message to tab ${tabId}. Type: ${message.type}. Error:`,
          error
        );
      }
    });
  }
  async function broadcastSiteSettingsUpdate(hostname, newSiteSettings) {
    if (!hostname) {
      console.warn("SettingsEventHandler: broadcastSiteSettingsUpdate called with no hostname.");
      return;
    }
    console.log(`[!!!] Broadcasting site settings update for ${hostname}`);
    console.log(
      `SettingsEventHandler: Broadcasting site settings data for ${hostname}`,
      newSiteSettings
    );
    const tabs = await chrome.tabs.query({ url: `*://${hostname}/*` });
    console.log(
      `[EventHandler] Found ${tabs.length} tabs matching hostname ${hostname} for site settings update.`
    );
    for (const tab of tabs) {
      const tabHostname = getHostname$1(tab.url);
      if (tab.id && tabHostname === hostname) {
        const message = {
          type: "UPDATE_SETTINGS",
          settings: newSiteSettings,
          hostname
        };
        console.log(
          `[EventHandler] Sending site settings update to tab ${tab.id} (${hostname})`,
          message
        );
        sendMessageToTab(tab.id, message, 0);
      } else {
        console.warn(`[EventHandler] Tab ${tab.id} matched query for ${hostname} but getHostname resolved to ${tabHostname}. Skipping.`);
      }
    }
  }
  async function broadcastGlobalSettingsUpdate(newGlobalSettings) {
    console.log(`[!!!] Broadcasting global settings update`);
    console.log(
      "SettingsEventHandler: Broadcasting global settings data",
      newGlobalSettings
    );
    const tabs = await chrome.tabs.query({});
    console.log(
      `[EventHandler] Found ${tabs.length} tabs to check for global update`
    );
    for (const tab of tabs) {
      if (tab.id && tab.url) {
        const tabHostname = getHostname$1(tab.url);
        if (tabHostname) {
          const siteConfig = settingsManager.getSettingsForSite(tabHostname);
          console.log(
            `[EventHandler] Checking tab ${tab.id} (${tabHostname}) for global update. Site config:`,
            siteConfig
          );
          if (!siteConfig || siteConfig.activeSetting === "global") {
            console.log(
              `[EventHandler] Tab ${tab.id} (${tabHostname}) qualifies for global update.`
            );
            const message = {
              type: "UPDATE_SETTINGS",
              settings: newGlobalSettings,
              hostname: tabHostname
            };
            console.log(
              `[EventHandler] Sending global update to tab ${tab.id} (${tabHostname})`,
              message
            );
            sendMessageToTab(tab.id, message, 0);
          }
        }
      }
    }
  }
  async function broadcastSiteModeUpdate(hostname, mode, effectiveSettings) {
    if (!hostname) {
      console.warn("SettingsEventHandler: broadcastSiteModeUpdate called with no hostname.");
      return;
    }
    console.log(`[!!!] Broadcasting site mode update for ${hostname} to ${mode}`);
    console.log(`SettingsEventHandler: Broadcasting mode data for ${hostname}`, {
      mode,
      effectiveSettings
    });
    const tabs = await chrome.tabs.query({ url: `*://${hostname}/*` });
    console.log(
      `[EventHandler] Found ${tabs.length} tabs matching hostname ${hostname} for site mode update.`
    );
    for (const tab of tabs) {
      const tabHostname = getHostname$1(tab.url);
      if (tab.id && tabHostname === hostname) {
        const message = {
          type: "UPDATE_SETTINGS",
          // Still send UPDATE_SETTINGS
          settings: effectiveSettings,
          // Send the settings appropriate for the new mode
          hostname
        };
        console.log(
          `[EventHandler] Sending site mode update (as UPDATE_SETTINGS) to tab ${tab.id} (${hostname})`,
          message
        );
        sendMessageToTab(tab.id, message, 0);
      } else {
        console.warn(`[EventHandler] Tab ${tab.id} matched query for ${hostname} (mode update) but getHostname resolved to ${tabHostname}. Skipping.`);
      }
    }
  }
  function setupSettingsEventHandler() {
    console.log("SettingsEventHandler: Listeners are now handled directly by SettingsManager");
  }
  background;
  class SettingsManager {
    constructor() {
      __publicField(this, "globalSettings");
      __publicField(this, "siteSettings");
      __publicField(this, "persistTimeout", null);
      __publicField(this, "pendingSettings", {
        globalSettings: null,
        siteSettings: null
      });
      this.globalSettings = { ...defaultSettings };
      this.siteSettings = /* @__PURE__ */ new Map();
    }
    async initialize() {
      const storage = await chrome.storage.sync.get([
        "globalSettings",
        "siteSettings"
      ]);
      this.globalSettings = storage.globalSettings || { ...defaultSettings };
      if (storage.siteSettings) {
        this.siteSettings = new Map(Object.entries(storage.siteSettings));
        console.log(
          "[DEBUG] SettingsManager Initialized with stored site settings. SiteSettings Map:",
          this.siteSettings
        );
      } else {
        this.siteSettings = /* @__PURE__ */ new Map();
        console.log(
          "[DEBUG] SettingsManager Initialized with no stored site settings."
        );
      }
      console.log(
        "[DEBUG] SettingsManager Initialized. Global Settings:",
        this.globalSettings
      );
    }
    async persistSettings(hostname) {
      if (this.persistTimeout) {
        clearTimeout(this.persistTimeout);
      }
      this.pendingSettings.globalSettings = { ...this.globalSettings };
      this.pendingSettings.siteSettings = Object.fromEntries(this.siteSettings);
      this.persistTimeout = setTimeout(async () => {
        try {
          const settings = {
            globalSettings: this.pendingSettings.globalSettings,
            siteSettings: this.pendingSettings.siteSettings
          };
          await chrome.storage.sync.set(settings);
          console.log("SettingsManager: Settings persisted successfully", {
            hostname
          });
          this.pendingSettings.globalSettings = null;
          this.pendingSettings.siteSettings = null;
        } catch (error) {
          console.error("SettingsManager: Failed to persist settings:", error);
        }
      }, 200);
    }
    getSettingsForSite(hostname) {
      let siteConfig = this.siteSettings.get(hostname);
      if (!siteConfig) {
        console.log(
          `SettingsManager: No config found for ${hostname}, creating default global config.`
        );
        siteConfig = {
          enabled: true,
          // Assume enabled by default
          activeSetting: "global",
          settings: { ...this.globalSettings }
          // Use current global settings
        };
      }
      if (siteConfig.activeSetting === "global") {
        return {
          ...siteConfig,
          settings: { ...this.globalSettings }
        };
      }
      if (siteConfig.activeSetting === "disabled") {
        return {
          ...siteConfig,
          enabled: false
        };
      }
      return siteConfig;
    }
    async updateGlobalSettings(settings, tabId, hostname) {
      console.log("SettingsManager: Updating global settings", {
        oldSettings: { ...this.globalSettings },
        newSettings: settings,
        tabId,
        hostname
      });
      this.globalSettings = {
        ...this.globalSettings,
        ...settings
      };
      await this.persistSettings(hostname);
      console.log(
        "SettingsManager: Global settings persisted successfully"
      );
      broadcastGlobalSettingsUpdate(this.globalSettings);
      console.log(
        "SettingsManager: Updated global settings & called broadcast"
      );
    }
    async updateSiteSettings(hostname, settings, tabId) {
      console.log("SettingsManager: Updating site settings for", hostname, {
        tabId
      });
      if (!settings) {
        console.log("SettingsManager: No settings provided");
        return;
      }
      if (!hostname) {
        console.log("SettingsManager: No hostname provided");
        return;
      }
      let siteConfig = this.siteSettings.get(hostname);
      const isNewSite = !siteConfig;
      if (isNewSite) {
        siteConfig = {
          enabled: true,
          activeSetting: "site",
          settings: { ...defaultSettings }
        };
        console.log(
          "SettingsManager: Created new site config with default settings"
        );
      }
      if (!siteConfig) {
        console.log("SettingsManager: Initializing site with default settings");
        return;
      }
      siteConfig.settings = { ...settings };
      siteConfig.activeSetting = "site";
      siteConfig.enabled = true;
      this.siteSettings.set(hostname, siteConfig);
      await this.persistSettings(hostname);
      console.log(
        "SettingsManager: Site settings persisted successfully"
      );
      broadcastSiteSettingsUpdate(hostname, siteConfig.settings);
      console.log(
        "SettingsManager: Updated site settings & called broadcast"
      );
    }
    async updateSiteMode(hostname, mode, tabId) {
      let siteConfig = this.siteSettings.get(hostname);
      siteConfig == null ? void 0 : siteConfig.activeSetting;
      if (!siteConfig) {
        siteConfig = {
          enabled: mode !== "disabled",
          activeSetting: mode,
          settings: { ...this.globalSettings }
        };
      }
      siteConfig.activeSetting = mode;
      siteConfig.enabled = mode !== "disabled";
      this.siteSettings.set(hostname, siteConfig);
      await this.persistSettings(hostname);
      const displaySettings = mode === "disabled" ? { ...defaultSettings } : mode === "global" ? { ...this.globalSettings } : siteConfig.settings || { ...defaultSettings };
      const settingsToBroadcast = { ...displaySettings };
      broadcastSiteModeUpdate(hostname, mode, settingsToBroadcast);
      console.log("SettingsManager: Updated site mode & called broadcast", {
        hostname,
        mode,
        settingsToBroadcast
      });
      return { settingsToUse: settingsToBroadcast, siteConfig };
    }
    async disableSite(hostname, tabId) {
      let siteConfig = this.siteSettings.get(hostname);
      if (!siteConfig) {
        siteConfig = {
          enabled: false,
          activeSetting: "disabled",
          settings: { ...this.globalSettings }
        };
      } else {
        siteConfig.enabled = false;
        siteConfig.activeSetting = "disabled";
      }
      this.siteSettings.set(hostname, siteConfig);
      await this.persistSettings(hostname);
      const disabledSettings = { ...defaultSettings };
      broadcastSiteModeUpdate(hostname, "disabled", disabledSettings);
      console.log("SettingsManager: Disabled site & called broadcast", {
        hostname
      });
      return {
        actualSettings: siteConfig.settings,
        // Keep returning this for potential internal use
        displaySettings: { ...defaultSettings }
      };
    }
  }
  const settingsManager = new SettingsManager();
  background;
  function defineBackground(arg) {
    if (arg == null || typeof arg === "function") return { main: arg };
    return arg;
  }
  var _MatchPattern = class {
    constructor(matchPattern) {
      if (matchPattern === "<all_urls>") {
        this.isAllUrls = true;
        this.protocolMatches = [..._MatchPattern.PROTOCOLS];
        this.hostnameMatch = "*";
        this.pathnameMatch = "*";
      } else {
        const groups = /(.*):\/\/(.*?)(\/.*)/.exec(matchPattern);
        if (groups == null)
          throw new InvalidMatchPattern(matchPattern, "Incorrect format");
        const [_, protocol, hostname, pathname] = groups;
        validateProtocol(matchPattern, protocol);
        validateHostname(matchPattern, hostname);
        this.protocolMatches = protocol === "*" ? ["http", "https"] : [protocol];
        this.hostnameMatch = hostname;
        this.pathnameMatch = pathname;
      }
    }
    includes(url) {
      if (this.isAllUrls)
        return true;
      const u = typeof url === "string" ? new URL(url) : url instanceof Location ? new URL(url.href) : url;
      return !!this.protocolMatches.find((protocol) => {
        if (protocol === "http")
          return this.isHttpMatch(u);
        if (protocol === "https")
          return this.isHttpsMatch(u);
        if (protocol === "file")
          return this.isFileMatch(u);
        if (protocol === "ftp")
          return this.isFtpMatch(u);
        if (protocol === "urn")
          return this.isUrnMatch(u);
      });
    }
    isHttpMatch(url) {
      return url.protocol === "http:" && this.isHostPathMatch(url);
    }
    isHttpsMatch(url) {
      return url.protocol === "https:" && this.isHostPathMatch(url);
    }
    isHostPathMatch(url) {
      if (!this.hostnameMatch || !this.pathnameMatch)
        return false;
      const hostnameMatchRegexs = [
        this.convertPatternToRegex(this.hostnameMatch),
        this.convertPatternToRegex(this.hostnameMatch.replace(/^\*\./, ""))
      ];
      const pathnameMatchRegex = this.convertPatternToRegex(this.pathnameMatch);
      return !!hostnameMatchRegexs.find((regex) => regex.test(url.hostname)) && pathnameMatchRegex.test(url.pathname);
    }
    isFileMatch(url) {
      throw Error("Not implemented: file:// pattern matching. Open a PR to add support");
    }
    isFtpMatch(url) {
      throw Error("Not implemented: ftp:// pattern matching. Open a PR to add support");
    }
    isUrnMatch(url) {
      throw Error("Not implemented: urn:// pattern matching. Open a PR to add support");
    }
    convertPatternToRegex(pattern) {
      const escaped = this.escapeForRegex(pattern);
      const starsReplaced = escaped.replace(/\\\*/g, ".*");
      return RegExp(`^${starsReplaced}$`);
    }
    escapeForRegex(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  };
  var MatchPattern = _MatchPattern;
  MatchPattern.PROTOCOLS = ["http", "https", "file", "ftp", "urn"];
  var InvalidMatchPattern = class extends Error {
    constructor(matchPattern, reason) {
      super(`Invalid match pattern "${matchPattern}": ${reason}`);
    }
  };
  function validateProtocol(matchPattern, protocol) {
    if (!MatchPattern.PROTOCOLS.includes(protocol) && protocol !== "*")
      throw new InvalidMatchPattern(
        matchPattern,
        `${protocol} not a valid protocol (${MatchPattern.PROTOCOLS.join(", ")})`
      );
  }
  function validateHostname(matchPattern, hostname) {
    if (hostname.includes(":"))
      throw new InvalidMatchPattern(matchPattern, `Hostname cannot include a port`);
    if (hostname.includes("*") && hostname.length > 1 && !hostname.startsWith("*."))
      throw new InvalidMatchPattern(
        matchPattern,
        `If using a wildcard (*), it must go at the start of the hostname`
      );
  }
  function getHostname(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      console.error("Message Handler: Invalid URL:", url);
      return "";
    }
  }
  async function handleGetInitialSettings(message, sender, sendResponse) {
    var _a, _b;
    const hostname = message.hostname || (((_a = sender.tab) == null ? void 0 : _a.url) ? getHostname(sender.tab.url) : null);
    if (!hostname) {
      console.warn("Message Handler: GET_INITIAL_SETTINGS received without hostname.");
      sendResponse({ settings: { ...defaultSettings } });
      return;
    }
    try {
      await settingsManager.initialize();
      console.log(`Message Handler: Getting initial settings for ${hostname}`);
      const siteConfig = settingsManager.getSettingsForSite(hostname);
      console.log(
        `[DEBUG] Message Handler (GET_INITIAL_SETTINGS): Retrieved siteConfig for ${hostname}:`,
        JSON.stringify(siteConfig, null, 2)
      );
      let effectiveSettings;
      if ((siteConfig == null ? void 0 : siteConfig.activeSetting) === "site" && siteConfig.settings) {
        effectiveSettings = siteConfig.settings;
      } else if ((siteConfig == null ? void 0 : siteConfig.activeSetting) === "disabled") {
        effectiveSettings = { ...defaultSettings, speed: 100 };
      } else {
        effectiveSettings = settingsManager.globalSettings;
      }
      console.log(
        `Message Handler: Sending initial settings for ${hostname} to tab ${(_b = sender.tab) == null ? void 0 : _b.id}:`,
        effectiveSettings
      );
      sendResponse({ settings: { ...effectiveSettings } });
    } catch (error) {
      console.error(
        `Message Handler: Error processing GET_INITIAL_SETTINGS for ${hostname}:`,
        error
      );
      sendResponse({ settings: { ...defaultSettings, speed: 100 } });
    }
  }
  async function handleUpdateSettings(message, sender, sendResponse) {
    var _a, _b;
    try {
      let targetTabId;
      let targetUrl;
      let hostname;
      if (!sender.tab) {
        const tabs = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });
        if (!((_a = tabs[0]) == null ? void 0 : _a.url) || !((_b = tabs[0]) == null ? void 0 : _b.id)) {
          throw new Error("No active tab found");
        }
        targetTabId = tabs[0].id;
        targetUrl = tabs[0].url;
        hostname = getHostname(targetUrl);
      } else {
        if (!sender.tab.url || !sender.tab.id) {
          throw new Error("Invalid sender tab");
        }
        targetTabId = sender.tab.id;
        targetUrl = sender.tab.url;
        hostname = getHostname(targetUrl);
      }
      console.log("Message Handler: Processing update for", {
        hostname,
        tabId: targetTabId,
        isPopup: !sender.tab,
        settings: message.settings
      });
      const currentSiteConfig = settingsManager.getSettingsForSite(hostname);
      const isCurrentlyGlobal = (currentSiteConfig == null ? void 0 : currentSiteConfig.activeSetting) === "global";
      if (!message.enabled) {
        await settingsManager.disableSite(hostname, targetTabId);
        return sendResponse({ success: true });
      }
      if (!message.settings) {
        throw new Error("No settings provided");
      }
      if (message.isGlobal || isCurrentlyGlobal) {
        await settingsManager.updateGlobalSettings(
          message.settings,
          targetTabId,
          hostname
        );
      } else {
        await settingsManager.updateSiteSettings(
          hostname,
          message.settings,
          targetTabId
        );
      }
      sendResponse({ success: true });
    } catch (error) {
      console.error("Message Handler: Error processing update", error);
      sendResponse({ success: false, error: String(error) });
    }
  }
  async function handleUpdateSiteMode(message, sender, sendResponse) {
    var _a;
    const { hostname, mode } = message;
    const tabId = (_a = sender.tab) == null ? void 0 : _a.id;
    if (!hostname) {
      const error = "No hostname provided for site mode update";
      console.error("Message Handler:", error);
      sendResponse({ success: false, error });
      return;
    }
    if (mode !== "global" && mode !== "site" && mode !== "disabled") {
      const error = `Invalid mode provided: ${mode}`;
      console.error("Message Handler:", error);
      sendResponse({ success: false, error });
      return;
    }
    const { settingsToUse, siteConfig } = await settingsManager.updateSiteMode(
      hostname,
      mode,
      tabId
    );
    if (tabId) {
      await chrome.tabs.sendMessage(tabId, {
        type: "UPDATE_SETTINGS",
        settings: settingsToUse,
        isGlobal: mode === "global"
      });
    }
    sendResponse({ success: true });
  }
  async function handleContentScriptReady(message, sender, sendResponse) {
    var _a, _b;
    try {
      if (!((_a = sender.tab) == null ? void 0 : _a.id) || !((_b = sender.tab) == null ? void 0 : _b.url)) {
        throw new Error("Invalid sender tab");
      }
      const hostname = message.hostname || getHostname(sender.tab.url);
      const siteConfig = settingsManager.getSettingsForSite(hostname);
      const settingsToSend = (siteConfig == null ? void 0 : siteConfig.settings) || defaultSettings;
      const isGlobal = (siteConfig == null ? void 0 : siteConfig.activeSetting) === "global";
      const isEnabled = (siteConfig == null ? void 0 : siteConfig.enabled) ?? true;
      await chrome.tabs.sendMessage(sender.tab.id, {
        type: "UPDATE_SETTINGS",
        settings: settingsToSend,
        isGlobal,
        enabled: isEnabled,
        hostname
      });
      sendResponse({ success: true });
    } catch (error) {
      console.error(
        "Message Handler: Error handling content script ready",
        error
      );
      sendResponse({ success: false, error: String(error) });
    }
  }
  function setupMessageHandler() {
    chrome.runtime.onMessage.addListener(
      (message, sender, sendResponse) => {
        var _a;
        console.log(
          "Message Handler: Received message:",
          message,
          "from tab:",
          (_a = sender.tab) == null ? void 0 : _a.id,
          sender,
          "sender type:",
          sender.documentId ? "content" : "popup"
        );
        (async () => {
          try {
            if (message.type === "GET_INITIAL_SETTINGS") {
              await handleGetInitialSettings(message, sender, sendResponse);
            } else if (message.type === "UPDATE_SETTINGS") {
              await handleUpdateSettings(message, sender, sendResponse);
            } else if (message.type === "UPDATE_SITE_MODE") {
              await handleUpdateSiteMode(message, sender, sendResponse);
            } else if (message.type === "CONTENT_SCRIPT_READY") {
              await handleContentScriptReady(message, sender, sendResponse);
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error("Message Handler: Error processing message:", {
              error: errorMsg,
              message,
              stack: error instanceof Error ? error.stack : void 0
            });
            sendResponse({ success: false, error: errorMsg });
          }
        })();
        return true;
      }
    );
  }
  background;
  chrome.runtime.onInstalled.addListener(async () => {
    console.log(
      "Background: onInstalled event triggered. Initializing settings..."
    );
    await settingsManager.initialize();
    console.log("Background: Settings initialized via onInstalled.");
  });
  const definition = defineBackground(() => {
    console.log("Background: Script executing.");
    settingsManager.initialize().catch(
      (err) => console.error(
        "Background: Initial settingsManager.initialize() failed:",
        err
      )
    );
    setupMessageHandler();
    setupSettingsEventHandler();
    console.log("Background: Main execution finished, listeners set up.");
  });
  background;
  function initPlugins() {
  }
  function getDefaultExportFromCjs(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
  }
  var browserPolyfill$1 = { exports: {} };
  var browserPolyfill = browserPolyfill$1.exports;
  var hasRequiredBrowserPolyfill;
  function requireBrowserPolyfill() {
    if (hasRequiredBrowserPolyfill) return browserPolyfill$1.exports;
    hasRequiredBrowserPolyfill = 1;
    (function(module, exports) {
      (function(global, factory) {
        {
          factory(module);
        }
      })(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : browserPolyfill, function(module2) {
        if (!(globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.id)) {
          throw new Error("This script should only be loaded in a browser extension.");
        }
        if (!(globalThis.browser && globalThis.browser.runtime && globalThis.browser.runtime.id)) {
          const CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE = "The message port closed before a response was received.";
          const wrapAPIs = (extensionAPIs) => {
            const apiMetadata = {
              "alarms": {
                "clear": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "clearAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "get": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "getAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "bookmarks": {
                "create": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "get": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getChildren": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getRecent": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getSubTree": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getTree": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "move": {
                  "minArgs": 2,
                  "maxArgs": 2
                },
                "remove": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeTree": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "search": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "update": {
                  "minArgs": 2,
                  "maxArgs": 2
                }
              },
              "browserAction": {
                "disable": {
                  "minArgs": 0,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "enable": {
                  "minArgs": 0,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "getBadgeBackgroundColor": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getBadgeText": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getPopup": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getTitle": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "openPopup": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "setBadgeBackgroundColor": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "setBadgeText": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "setIcon": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "setPopup": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "setTitle": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                }
              },
              "browsingData": {
                "remove": {
                  "minArgs": 2,
                  "maxArgs": 2
                },
                "removeCache": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeCookies": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeDownloads": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeFormData": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeHistory": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeLocalStorage": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removePasswords": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removePluginData": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "settings": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "commands": {
                "getAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "contextMenus": {
                "remove": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "update": {
                  "minArgs": 2,
                  "maxArgs": 2
                }
              },
              "cookies": {
                "get": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getAll": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getAllCookieStores": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "remove": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "set": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "devtools": {
                "inspectedWindow": {
                  "eval": {
                    "minArgs": 1,
                    "maxArgs": 2,
                    "singleCallbackArg": false
                  }
                },
                "panels": {
                  "create": {
                    "minArgs": 3,
                    "maxArgs": 3,
                    "singleCallbackArg": true
                  },
                  "elements": {
                    "createSidebarPane": {
                      "minArgs": 1,
                      "maxArgs": 1
                    }
                  }
                }
              },
              "downloads": {
                "cancel": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "download": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "erase": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getFileIcon": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "open": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "pause": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeFile": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "resume": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "search": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "show": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                }
              },
              "extension": {
                "isAllowedFileSchemeAccess": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "isAllowedIncognitoAccess": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "history": {
                "addUrl": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "deleteAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "deleteRange": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "deleteUrl": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getVisits": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "search": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "i18n": {
                "detectLanguage": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getAcceptLanguages": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "identity": {
                "launchWebAuthFlow": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "idle": {
                "queryState": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "management": {
                "get": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "getSelf": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "setEnabled": {
                  "minArgs": 2,
                  "maxArgs": 2
                },
                "uninstallSelf": {
                  "minArgs": 0,
                  "maxArgs": 1
                }
              },
              "notifications": {
                "clear": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "create": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "getAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "getPermissionLevel": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "update": {
                  "minArgs": 2,
                  "maxArgs": 2
                }
              },
              "pageAction": {
                "getPopup": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getTitle": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "hide": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "setIcon": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "setPopup": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "setTitle": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                },
                "show": {
                  "minArgs": 1,
                  "maxArgs": 1,
                  "fallbackToNoCallback": true
                }
              },
              "permissions": {
                "contains": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getAll": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "remove": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "request": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "runtime": {
                "getBackgroundPage": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "getPlatformInfo": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "openOptionsPage": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "requestUpdateCheck": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "sendMessage": {
                  "minArgs": 1,
                  "maxArgs": 3
                },
                "sendNativeMessage": {
                  "minArgs": 2,
                  "maxArgs": 2
                },
                "setUninstallURL": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "sessions": {
                "getDevices": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "getRecentlyClosed": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "restore": {
                  "minArgs": 0,
                  "maxArgs": 1
                }
              },
              "storage": {
                "local": {
                  "clear": {
                    "minArgs": 0,
                    "maxArgs": 0
                  },
                  "get": {
                    "minArgs": 0,
                    "maxArgs": 1
                  },
                  "getBytesInUse": {
                    "minArgs": 0,
                    "maxArgs": 1
                  },
                  "remove": {
                    "minArgs": 1,
                    "maxArgs": 1
                  },
                  "set": {
                    "minArgs": 1,
                    "maxArgs": 1
                  }
                },
                "managed": {
                  "get": {
                    "minArgs": 0,
                    "maxArgs": 1
                  },
                  "getBytesInUse": {
                    "minArgs": 0,
                    "maxArgs": 1
                  }
                },
                "sync": {
                  "clear": {
                    "minArgs": 0,
                    "maxArgs": 0
                  },
                  "get": {
                    "minArgs": 0,
                    "maxArgs": 1
                  },
                  "getBytesInUse": {
                    "minArgs": 0,
                    "maxArgs": 1
                  },
                  "remove": {
                    "minArgs": 1,
                    "maxArgs": 1
                  },
                  "set": {
                    "minArgs": 1,
                    "maxArgs": 1
                  }
                }
              },
              "tabs": {
                "captureVisibleTab": {
                  "minArgs": 0,
                  "maxArgs": 2
                },
                "create": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "detectLanguage": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "discard": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "duplicate": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "executeScript": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "get": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getCurrent": {
                  "minArgs": 0,
                  "maxArgs": 0
                },
                "getZoom": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "getZoomSettings": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "goBack": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "goForward": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "highlight": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "insertCSS": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "move": {
                  "minArgs": 2,
                  "maxArgs": 2
                },
                "query": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "reload": {
                  "minArgs": 0,
                  "maxArgs": 2
                },
                "remove": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "removeCSS": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "sendMessage": {
                  "minArgs": 2,
                  "maxArgs": 3
                },
                "setZoom": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "setZoomSettings": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "update": {
                  "minArgs": 1,
                  "maxArgs": 2
                }
              },
              "topSites": {
                "get": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "webNavigation": {
                "getAllFrames": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "getFrame": {
                  "minArgs": 1,
                  "maxArgs": 1
                }
              },
              "webRequest": {
                "handlerBehaviorChanged": {
                  "minArgs": 0,
                  "maxArgs": 0
                }
              },
              "windows": {
                "create": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "get": {
                  "minArgs": 1,
                  "maxArgs": 2
                },
                "getAll": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "getCurrent": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "getLastFocused": {
                  "minArgs": 0,
                  "maxArgs": 1
                },
                "remove": {
                  "minArgs": 1,
                  "maxArgs": 1
                },
                "update": {
                  "minArgs": 2,
                  "maxArgs": 2
                }
              }
            };
            if (Object.keys(apiMetadata).length === 0) {
              throw new Error("api-metadata.json has not been included in browser-polyfill");
            }
            class DefaultWeakMap extends WeakMap {
              constructor(createItem, items = void 0) {
                super(items);
                this.createItem = createItem;
              }
              get(key) {
                if (!this.has(key)) {
                  this.set(key, this.createItem(key));
                }
                return super.get(key);
              }
            }
            const isThenable = (value) => {
              return value && typeof value === "object" && typeof value.then === "function";
            };
            const makeCallback = (promise, metadata) => {
              return (...callbackArgs) => {
                if (extensionAPIs.runtime.lastError) {
                  promise.reject(new Error(extensionAPIs.runtime.lastError.message));
                } else if (metadata.singleCallbackArg || callbackArgs.length <= 1 && metadata.singleCallbackArg !== false) {
                  promise.resolve(callbackArgs[0]);
                } else {
                  promise.resolve(callbackArgs);
                }
              };
            };
            const pluralizeArguments = (numArgs) => numArgs == 1 ? "argument" : "arguments";
            const wrapAsyncFunction = (name, metadata) => {
              return function asyncFunctionWrapper(target, ...args) {
                if (args.length < metadata.minArgs) {
                  throw new Error(`Expected at least ${metadata.minArgs} ${pluralizeArguments(metadata.minArgs)} for ${name}(), got ${args.length}`);
                }
                if (args.length > metadata.maxArgs) {
                  throw new Error(`Expected at most ${metadata.maxArgs} ${pluralizeArguments(metadata.maxArgs)} for ${name}(), got ${args.length}`);
                }
                return new Promise((resolve, reject) => {
                  if (metadata.fallbackToNoCallback) {
                    try {
                      target[name](...args, makeCallback({
                        resolve,
                        reject
                      }, metadata));
                    } catch (cbError) {
                      console.warn(`${name} API method doesn't seem to support the callback parameter, falling back to call it without a callback: `, cbError);
                      target[name](...args);
                      metadata.fallbackToNoCallback = false;
                      metadata.noCallback = true;
                      resolve();
                    }
                  } else if (metadata.noCallback) {
                    target[name](...args);
                    resolve();
                  } else {
                    target[name](...args, makeCallback({
                      resolve,
                      reject
                    }, metadata));
                  }
                });
              };
            };
            const wrapMethod = (target, method, wrapper) => {
              return new Proxy(method, {
                apply(targetMethod, thisObj, args) {
                  return wrapper.call(thisObj, target, ...args);
                }
              });
            };
            let hasOwnProperty = Function.call.bind(Object.prototype.hasOwnProperty);
            const wrapObject = (target, wrappers = {}, metadata = {}) => {
              let cache = /* @__PURE__ */ Object.create(null);
              let handlers = {
                has(proxyTarget2, prop) {
                  return prop in target || prop in cache;
                },
                get(proxyTarget2, prop, receiver) {
                  if (prop in cache) {
                    return cache[prop];
                  }
                  if (!(prop in target)) {
                    return void 0;
                  }
                  let value = target[prop];
                  if (typeof value === "function") {
                    if (typeof wrappers[prop] === "function") {
                      value = wrapMethod(target, target[prop], wrappers[prop]);
                    } else if (hasOwnProperty(metadata, prop)) {
                      let wrapper = wrapAsyncFunction(prop, metadata[prop]);
                      value = wrapMethod(target, target[prop], wrapper);
                    } else {
                      value = value.bind(target);
                    }
                  } else if (typeof value === "object" && value !== null && (hasOwnProperty(wrappers, prop) || hasOwnProperty(metadata, prop))) {
                    value = wrapObject(value, wrappers[prop], metadata[prop]);
                  } else if (hasOwnProperty(metadata, "*")) {
                    value = wrapObject(value, wrappers[prop], metadata["*"]);
                  } else {
                    Object.defineProperty(cache, prop, {
                      configurable: true,
                      enumerable: true,
                      get() {
                        return target[prop];
                      },
                      set(value2) {
                        target[prop] = value2;
                      }
                    });
                    return value;
                  }
                  cache[prop] = value;
                  return value;
                },
                set(proxyTarget2, prop, value, receiver) {
                  if (prop in cache) {
                    cache[prop] = value;
                  } else {
                    target[prop] = value;
                  }
                  return true;
                },
                defineProperty(proxyTarget2, prop, desc) {
                  return Reflect.defineProperty(cache, prop, desc);
                },
                deleteProperty(proxyTarget2, prop) {
                  return Reflect.deleteProperty(cache, prop);
                }
              };
              let proxyTarget = Object.create(target);
              return new Proxy(proxyTarget, handlers);
            };
            const wrapEvent = (wrapperMap) => ({
              addListener(target, listener, ...args) {
                target.addListener(wrapperMap.get(listener), ...args);
              },
              hasListener(target, listener) {
                return target.hasListener(wrapperMap.get(listener));
              },
              removeListener(target, listener) {
                target.removeListener(wrapperMap.get(listener));
              }
            });
            const onRequestFinishedWrappers = new DefaultWeakMap((listener) => {
              if (typeof listener !== "function") {
                return listener;
              }
              return function onRequestFinished(req) {
                const wrappedReq = wrapObject(req, {}, {
                  getContent: {
                    minArgs: 0,
                    maxArgs: 0
                  }
                });
                listener(wrappedReq);
              };
            });
            const onMessageWrappers = new DefaultWeakMap((listener) => {
              if (typeof listener !== "function") {
                return listener;
              }
              return function onMessage(message, sender, sendResponse) {
                let didCallSendResponse = false;
                let wrappedSendResponse;
                let sendResponsePromise = new Promise((resolve) => {
                  wrappedSendResponse = function(response) {
                    didCallSendResponse = true;
                    resolve(response);
                  };
                });
                let result2;
                try {
                  result2 = listener(message, sender, wrappedSendResponse);
                } catch (err) {
                  result2 = Promise.reject(err);
                }
                const isResultThenable = result2 !== true && isThenable(result2);
                if (result2 !== true && !isResultThenable && !didCallSendResponse) {
                  return false;
                }
                const sendPromisedResult = (promise) => {
                  promise.then((msg) => {
                    sendResponse(msg);
                  }, (error) => {
                    let message2;
                    if (error && (error instanceof Error || typeof error.message === "string")) {
                      message2 = error.message;
                    } else {
                      message2 = "An unexpected error occurred";
                    }
                    sendResponse({
                      __mozWebExtensionPolyfillReject__: true,
                      message: message2
                    });
                  }).catch((err) => {
                    console.error("Failed to send onMessage rejected reply", err);
                  });
                };
                if (isResultThenable) {
                  sendPromisedResult(result2);
                } else {
                  sendPromisedResult(sendResponsePromise);
                }
                return true;
              };
            });
            const wrappedSendMessageCallback = ({
              reject,
              resolve
            }, reply) => {
              if (extensionAPIs.runtime.lastError) {
                if (extensionAPIs.runtime.lastError.message === CHROME_SEND_MESSAGE_CALLBACK_NO_RESPONSE_MESSAGE) {
                  resolve();
                } else {
                  reject(new Error(extensionAPIs.runtime.lastError.message));
                }
              } else if (reply && reply.__mozWebExtensionPolyfillReject__) {
                reject(new Error(reply.message));
              } else {
                resolve(reply);
              }
            };
            const wrappedSendMessage = (name, metadata, apiNamespaceObj, ...args) => {
              if (args.length < metadata.minArgs) {
                throw new Error(`Expected at least ${metadata.minArgs} ${pluralizeArguments(metadata.minArgs)} for ${name}(), got ${args.length}`);
              }
              if (args.length > metadata.maxArgs) {
                throw new Error(`Expected at most ${metadata.maxArgs} ${pluralizeArguments(metadata.maxArgs)} for ${name}(), got ${args.length}`);
              }
              return new Promise((resolve, reject) => {
                const wrappedCb = wrappedSendMessageCallback.bind(null, {
                  resolve,
                  reject
                });
                args.push(wrappedCb);
                apiNamespaceObj.sendMessage(...args);
              });
            };
            const staticWrappers = {
              devtools: {
                network: {
                  onRequestFinished: wrapEvent(onRequestFinishedWrappers)
                }
              },
              runtime: {
                onMessage: wrapEvent(onMessageWrappers),
                onMessageExternal: wrapEvent(onMessageWrappers),
                sendMessage: wrappedSendMessage.bind(null, "sendMessage", {
                  minArgs: 1,
                  maxArgs: 3
                })
              },
              tabs: {
                sendMessage: wrappedSendMessage.bind(null, "sendMessage", {
                  minArgs: 2,
                  maxArgs: 3
                })
              }
            };
            const settingMetadata = {
              clear: {
                minArgs: 1,
                maxArgs: 1
              },
              get: {
                minArgs: 1,
                maxArgs: 1
              },
              set: {
                minArgs: 1,
                maxArgs: 1
              }
            };
            apiMetadata.privacy = {
              network: {
                "*": settingMetadata
              },
              services: {
                "*": settingMetadata
              },
              websites: {
                "*": settingMetadata
              }
            };
            return wrapObject(extensionAPIs, staticWrappers, apiMetadata);
          };
          module2.exports = wrapAPIs(chrome);
        } else {
          module2.exports = globalThis.browser;
        }
      });
    })(browserPolyfill$1);
    return browserPolyfill$1.exports;
  }
  var browserPolyfillExports = requireBrowserPolyfill();
  const originalBrowser = /* @__PURE__ */ getDefaultExportFromCjs(browserPolyfillExports);
  const browser = originalBrowser;
  function print(method, ...args) {
    if (typeof args[0] === "string") {
      const message = args.shift();
      method(`[wxt] ${message}`, ...args);
    } else {
      method("[wxt]", ...args);
    }
  }
  const logger = {
    debug: (...args) => print(console.debug, ...args),
    log: (...args) => print(console.log, ...args),
    warn: (...args) => print(console.warn, ...args),
    error: (...args) => print(console.error, ...args)
  };
  let ws;
  function getDevServerWebSocket() {
    if (ws == null) {
      const serverUrl = `${"ws:"}//${"localhost"}:${3002}`;
      logger.debug("Connecting to dev server @", serverUrl);
      ws = new WebSocket(serverUrl, "vite-hmr");
      ws.addWxtEventListener = ws.addEventListener.bind(ws);
      ws.sendCustom = (event, payload) => ws == null ? void 0 : ws.send(JSON.stringify({ type: "custom", event, payload }));
      ws.addEventListener("open", () => {
        logger.debug("Connected to dev server");
      });
      ws.addEventListener("close", () => {
        logger.debug("Disconnected from dev server");
      });
      ws.addEventListener("error", (event) => {
        logger.error("Failed to connect to dev server", event);
      });
      ws.addEventListener("message", (e) => {
        try {
          const message = JSON.parse(e.data);
          if (message.type === "custom") {
            ws == null ? void 0 : ws.dispatchEvent(
              new CustomEvent(message.event, { detail: message.data })
            );
          }
        } catch (err) {
          logger.error("Failed to handle message", err);
        }
      });
    }
    return ws;
  }
  function keepServiceWorkerAlive() {
    setInterval(async () => {
      await browser.runtime.getPlatformInfo();
    }, 5e3);
  }
  function reloadContentScript(payload) {
    const manifest = browser.runtime.getManifest();
    if (manifest.manifest_version == 2) {
      void reloadContentScriptMv2();
    } else {
      void reloadContentScriptMv3(payload);
    }
  }
  async function reloadContentScriptMv3({
    registration,
    contentScript
  }) {
    if (registration === "runtime") {
      await reloadRuntimeContentScriptMv3(contentScript);
    } else {
      await reloadManifestContentScriptMv3(contentScript);
    }
  }
  async function reloadManifestContentScriptMv3(contentScript) {
    const id = `wxt:${contentScript.js[0]}`;
    logger.log("Reloading content script:", contentScript);
    const registered = await browser.scripting.getRegisteredContentScripts();
    logger.debug("Existing scripts:", registered);
    const existing = registered.find((cs) => cs.id === id);
    if (existing) {
      logger.debug("Updating content script", existing);
      await browser.scripting.updateContentScripts([{ ...contentScript, id }]);
    } else {
      logger.debug("Registering new content script...");
      await browser.scripting.registerContentScripts([{ ...contentScript, id }]);
    }
    await reloadTabsForContentScript(contentScript);
  }
  async function reloadRuntimeContentScriptMv3(contentScript) {
    logger.log("Reloading content script:", contentScript);
    const registered = await browser.scripting.getRegisteredContentScripts();
    logger.debug("Existing scripts:", registered);
    const matches = registered.filter((cs) => {
      var _a, _b;
      const hasJs = (_a = contentScript.js) == null ? void 0 : _a.find((js) => {
        var _a2;
        return (_a2 = cs.js) == null ? void 0 : _a2.includes(js);
      });
      const hasCss = (_b = contentScript.css) == null ? void 0 : _b.find((css) => {
        var _a2;
        return (_a2 = cs.css) == null ? void 0 : _a2.includes(css);
      });
      return hasJs || hasCss;
    });
    if (matches.length === 0) {
      logger.log(
        "Content script is not registered yet, nothing to reload",
        contentScript
      );
      return;
    }
    await browser.scripting.updateContentScripts(matches);
    await reloadTabsForContentScript(contentScript);
  }
  async function reloadTabsForContentScript(contentScript) {
    const allTabs = await browser.tabs.query({});
    const matchPatterns = contentScript.matches.map(
      (match) => new MatchPattern(match)
    );
    const matchingTabs = allTabs.filter((tab) => {
      const url = tab.url;
      if (!url) return false;
      return !!matchPatterns.find((pattern) => pattern.includes(url));
    });
    await Promise.all(
      matchingTabs.map(async (tab) => {
        try {
          await browser.tabs.reload(tab.id);
        } catch (err) {
          logger.warn("Failed to reload tab:", err);
        }
      })
    );
  }
  async function reloadContentScriptMv2(_payload) {
    throw Error("TODO: reloadContentScriptMv2");
  }
  {
    try {
      const ws2 = getDevServerWebSocket();
      ws2.addWxtEventListener("wxt:reload-extension", () => {
        browser.runtime.reload();
      });
      ws2.addWxtEventListener("wxt:reload-content-script", (event) => {
        reloadContentScript(event.detail);
      });
      if (true) {
        ws2.addEventListener(
          "open",
          () => ws2.sendCustom("wxt:background-initialized")
        );
        keepServiceWorkerAlive();
      }
    } catch (err) {
      logger.error("Failed to setup web socket connection with dev server", err);
    }
    browser.commands.onCommand.addListener((command) => {
      if (command === "wxt:reload-extension") {
        browser.runtime.reload();
      }
    });
  }
  let result;
  try {
    initPlugins();
    result = definition.main();
    if (result instanceof Promise) {
      console.warn(
        "The background's main() function return a promise, but it must be synchronous"
      );
    }
  } catch (err) {
    logger.error("The background crashed on startup!");
    throw err;
  }
  const result$1 = result;
  return result$1;
})();
background;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2dyb3VuZC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3R5cGVzLnRzIiwiLi4vLi4vc3JjL3NldHRpbmdzLWV2ZW50LWhhbmRsZXIudHMiLCIuLi8uLi9zcmMvc2V0dGluZ3MtbWFuYWdlci50cyIsIi4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS93eHRAMC4xOS4yOV9AdHlwZXMrbm9kZUAyNS42LjFfcm9sbHVwQDQuNjAuMy9ub2RlX21vZHVsZXMvd3h0L2Rpc3Qvc2FuZGJveC9kZWZpbmUtYmFja2dyb3VuZC5tanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vQHdlYmV4dC1jb3JlK21hdGNoLXBhdHRlcm5zQDEuMC4zL25vZGVfbW9kdWxlcy9Ad2ViZXh0LWNvcmUvbWF0Y2gtcGF0dGVybnMvbGliL2luZGV4LmpzIiwiLi4vLi4vc3JjL21lc3NhZ2UtaGFuZGxlci50cyIsIi4uLy4uL2VudHJ5cG9pbnRzL2JhY2tncm91bmQudHMiLCIuLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd2ViZXh0ZW5zaW9uLXBvbHlmaWxsQDAuMTIuMC9ub2RlX21vZHVsZXMvd2ViZXh0ZW5zaW9uLXBvbHlmaWxsL2Rpc3QvYnJvd3Nlci1wb2x5ZmlsbC5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS93eHRAMC4xOS4yOV9AdHlwZXMrbm9kZUAyNS42LjFfcm9sbHVwQDQuNjAuMy9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvYnJvd3Nlci9pbmRleC5tanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGludGVyZmFjZSBBdWRpb1NldHRpbmdzIHtcbiAgdm9sdW1lOiBudW1iZXI7XG4gIGJhc3NCb29zdDogbnVtYmVyO1xuICB2b2ljZUJvb3N0OiBudW1iZXI7XG4gIG1vbm86IGJvb2xlYW47XG4gIHNwZWVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVNldHRpbmdzIHtcbiAgZW5hYmxlZDogYm9vbGVhbjtcbiAgc2V0dGluZ3M/OiBBdWRpb1NldHRpbmdzO1xuICBhY3RpdmVTZXR0aW5nOiBcImdsb2JhbFwiIHwgXCJzaXRlXCIgfCBcImRpc2FibGVkXCI7XG59XG5cbmV4cG9ydCBjb25zdCBkZWZhdWx0U2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3MgPSB7XG4gIHZvbHVtZTogMTAwLFxuICBiYXNzQm9vc3Q6IDEwMCxcbiAgdm9pY2VCb29zdDogMTAwLFxuICBtb25vOiBmYWxzZSxcbiAgc3BlZWQ6IDEwMCxcbn07XG5cbmV4cG9ydCBjb25zdCBkZWZhdWx0U2l0ZVNldHRpbmdzOiBTaXRlU2V0dGluZ3MgPSB7XG4gIGVuYWJsZWQ6IHRydWUsXG4gIHNldHRpbmdzOiB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9LFxuICBhY3RpdmVTZXR0aW5nOiBcImdsb2JhbFwiLCAvLyBTdGFydHMgaW4gZ2xvYmFsIG1vZGUsIGNhbiBiZSBjaGFuZ2VkIHRvIFwic2l0ZVwiIG9yIFwiZGlzYWJsZWRcIlxufTtcblxuZXhwb3J0IHR5cGUgU3RhdGVUeXBlID0ge1xuICBnbG9iYWxTZXR0aW5nczogQXVkaW9TZXR0aW5ncztcbiAgc2l0ZVNldHRpbmdzOiBNYXA8c3RyaW5nLCBTaXRlU2V0dGluZ3M+O1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBVcGRhdGVTZXR0aW5nc01lc3NhZ2Uge1xuICB0eXBlOiBcIlVQREFURV9TRVRUSU5HU1wiO1xuICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncztcbiAgZW5hYmxlZD86IGJvb2xlYW47XG4gIGlzR2xvYmFsPzogYm9vbGVhbjtcbiAgaG9zdG5hbWU/OiBzdHJpbmc7IC8vIEFkZCBvcHRpb25hbCBob3N0bmFtZVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbnRlbnRTY3JpcHRSZWFkeU1lc3NhZ2Uge1xuICB0eXBlOiBcIkNPTlRFTlRfU0NSSVBUX1JFQURZXCI7XG4gIGhvc3RuYW1lPzogc3RyaW5nO1xuICB1c2luZ0dsb2JhbD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVXBkYXRlU2l0ZU1vZGVNZXNzYWdlIHtcbiAgdHlwZTogXCJVUERBVEVfU0lURV9NT0RFXCI7XG4gIGhvc3RuYW1lPzogc3RyaW5nO1xuICBtb2RlPzogXCJnbG9iYWxcIiB8IFwic2l0ZVwiIHwgXCJkaXNhYmxlZFwiO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdldEluaXRpYWxTZXR0aW5nc01lc3NhZ2Uge1xuICB0eXBlOiBcIkdFVF9JTklUSUFMX1NFVFRJTkdTXCI7XG4gIGhvc3RuYW1lPzogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBNZXNzYWdlVHlwZSA9XG4gIHwgVXBkYXRlU2V0dGluZ3NNZXNzYWdlXG4gIHwgQ29udGVudFNjcmlwdFJlYWR5TWVzc2FnZVxuICB8IFVwZGF0ZVNpdGVNb2RlTWVzc2FnZVxuICB8IEdldEluaXRpYWxTZXR0aW5nc01lc3NhZ2U7XG5cbmV4cG9ydCB0eXBlIFN0b3JhZ2VEYXRhID0ge1xuICBnbG9iYWxTZXR0aW5ncz86IEF1ZGlvU2V0dGluZ3M7XG4gIHNpdGVTZXR0aW5ncz86IHsgW2hvc3RuYW1lOiBzdHJpbmddOiBTaXRlU2V0dGluZ3MgfTtcbn07XG5cbi8qKlxuICogQ2hlY2sgaWYgYWxsIGF1ZGlvIHNldHRpbmdzIGFyZSBhdCB0aGVpciBkZWZhdWx0IChkaXNhYmxlZCkgdmFsdWVzLlxuICogVGhpcyBpcyBhIHB1cmUgZnVuY3Rpb24gdXNlZCBhY3Jvc3MgY29udGVudCBzY3JpcHQgYW5kIHBvcHVwLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNTZXR0aW5nc0Rpc2FibGVkKHNldHRpbmdzOiBBdWRpb1NldHRpbmdzKTogYm9vbGVhbiB7XG4gIHJldHVybiAoXG4gICAgc2V0dGluZ3Muc3BlZWQgPT09IDEwMCAmJlxuICAgIHNldHRpbmdzLnZvbHVtZSA9PT0gMTAwICYmXG4gICAgc2V0dGluZ3MuYmFzc0Jvb3N0ID09PSAxMDAgJiZcbiAgICBzZXR0aW5ncy52b2ljZUJvb3N0ID09PSAxMDAgJiZcbiAgICAhc2V0dGluZ3MubW9ub1xuICApO1xufVxuXG4iLCJpbXBvcnQgeyBzZXR0aW5nc01hbmFnZXIgfSBmcm9tIFwiLi9zZXR0aW5ncy1tYW5hZ2VyXCI7XG5pbXBvcnQgeyBBdWRpb1NldHRpbmdzLCBNZXNzYWdlVHlwZSwgVXBkYXRlU2V0dGluZ3NNZXNzYWdlIH0gZnJvbSBcIi4vdHlwZXNcIjsgLy8gQWRkZWQgVXBkYXRlU2V0dGluZ3NNZXNzYWdlXG5cbi8vIEhlbHBlciB0byBnZXQgaG9zdG5hbWUgc2FmZWx5IGFuZCBmaWx0ZXIgbm9uLWh0dHAocykgVVJMc1xuZnVuY3Rpb24gZ2V0SG9zdG5hbWUodXJsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCBudWxsIHtcbiAgaWYgKCF1cmwpIHJldHVybiBudWxsO1xuICB0cnkge1xuICAgIGNvbnN0IHBhcnNlZFVybCA9IG5ldyBVUkwodXJsKTtcbiAgICAvLyBPbmx5IGFsbG93IGh0dHAvaHR0cHMgVVJMcyB0byBhdm9pZCBjaHJvbWU6Ly8gYW5kIG90aGVyIGludGVybmFsIHBhZ2VzXG4gICAgaWYgKHBhcnNlZFVybC5wcm90b2NvbCAhPT0gXCJodHRwOlwiICYmIHBhcnNlZFVybC5wcm90b2NvbCAhPT0gXCJodHRwczpcIikge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIHJldHVybiBwYXJzZWRVcmwuaG9zdG5hbWU7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLndhcm4oXCJTZXR0aW5nc0V2ZW50SGFuZGxlcjogSW52YWxpZCBVUkw6XCIsIHVybCk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuXG4vLyBIZWxwZXIgdG8gc2VuZCBtZXNzYWdlIHRvIGEgc3BlY2lmaWMgdGFiIChmaXJlLWFuZC1mb3JnZXQgZm9yIGJyb2FkY2FzdHMpXG5mdW5jdGlvbiBzZW5kTWVzc2FnZVRvVGFiKHRhYklkOiBudW1iZXIsIG1lc3NhZ2U6IE1lc3NhZ2VUeXBlLCBmcmFtZUlkPzogbnVtYmVyKSB7XG4gIGNvbnN0IG9wdGlvbnMgPSBmcmFtZUlkICE9PSB1bmRlZmluZWQgPyB7IGZyYW1lSWQgfSA6IHt9O1xuICBjaHJvbWUudGFicy5zZW5kTWVzc2FnZSh0YWJJZCwgbWVzc2FnZSwgb3B0aW9ucylcbiAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgLy8gQ2F0Y2ggZXJyb3JzIGZyb20gc2VuZE1lc3NhZ2UsIGJ1dCBkb24ndCBhd2FpdCBpdCBpbiB0aGUgYnJvYWRjYXN0IGxvb3BzLlxuICAgICAgLy8gVGhpcyBtYWtlcyB0aGUgYnJvYWRjYXN0IG5vbi1ibG9ja2luZyBmb3IgdGhlIGJhY2tncm91bmQgc2NyaXB0LlxuICAgICAgY29uc3QgZXJyb3JNZXNzYWdlID0gU3RyaW5nKGVycm9yKTtcbiAgICAgIGlmIChlcnJvck1lc3NhZ2UuaW5jbHVkZXMoXCJDb3VsZCBub3QgZXN0YWJsaXNoIGNvbm5lY3Rpb25cIikgfHwgZXJyb3JNZXNzYWdlLmluY2x1ZGVzKFwiTm8gdGFiIHdpdGggaWRcIikpIHtcbiAgICAgICAgLy8gVGhlc2UgYXJlIGNvbW1vbiBpZiB0aGUgdGFiIGNsb3NlZCBvciBjb250ZW50IHNjcmlwdCBpc24ndCByZWFkeTsgbG9nIGFzIGRlYnVnLlxuICAgICAgICBjb25zb2xlLmRlYnVnKFxuICAgICAgICAgIGBTZXR0aW5nc0V2ZW50SGFuZGxlcjogRXJyb3Igc2VuZGluZyBtZXNzYWdlIHRvIHRhYiAke3RhYklkfSAodHlwZTogJHttZXNzYWdlLnR5cGV9KS4gVGFiIG1pZ2h0IGJlIGNsb3NlZCBvciBjb250ZW50IHNjcmlwdCBub3QgcmVhZHkuIEVycm9yOmAsXG4gICAgICAgICAgZXJyb3JNZXNzYWdlXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGVycm9yKSB7IC8vIEhhbmRsZSBvdGhlciB1bmV4cGVjdGVkIGVycm9ycyBhcyB3YXJuaW5nc1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgYFNldHRpbmdzRXZlbnRIYW5kbGVyOiBVbmV4cGVjdGVkIGVycm9yIHNlbmRpbmcgbWVzc2FnZSB0byB0YWIgJHt0YWJJZH0uIFR5cGU6ICR7bWVzc2FnZS50eXBlfS4gRXJyb3I6YCxcbiAgICAgICAgICBlcnJvclxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xufVxuXG4vKipcbiAqIEJyb2FkY2FzdHMgdXBkYXRlZCBzaXRlLXNwZWNpZmljIHNldHRpbmdzIHRvIHJlbGV2YW50IHRhYnMuXG4gKiBFeHBvcnRlZCB0byBiZSBjYWxsZWQgZGlyZWN0bHkgYnkgU2V0dGluZ3NNYW5hZ2VyLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYnJvYWRjYXN0U2l0ZVNldHRpbmdzVXBkYXRlKFxuICBob3N0bmFtZTogc3RyaW5nLFxuICBuZXdTaXRlU2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3Ncbikge1xuICBpZiAoIWhvc3RuYW1lKSB7XG4gICAgY29uc29sZS53YXJuKFwiU2V0dGluZ3NFdmVudEhhbmRsZXI6IGJyb2FkY2FzdFNpdGVTZXR0aW5nc1VwZGF0ZSBjYWxsZWQgd2l0aCBubyBob3N0bmFtZS5cIik7XG4gICAgcmV0dXJuO1xuICB9XG4gIGNvbnNvbGUubG9nKGBbISEhXSBCcm9hZGNhc3Rpbmcgc2l0ZSBzZXR0aW5ncyB1cGRhdGUgZm9yICR7aG9zdG5hbWV9YCk7XG4gIGNvbnNvbGUubG9nKFxuICAgIGBTZXR0aW5nc0V2ZW50SGFuZGxlcjogQnJvYWRjYXN0aW5nIHNpdGUgc2V0dGluZ3MgZGF0YSBmb3IgJHtob3N0bmFtZX1gLFxuICAgIG5ld1NpdGVTZXR0aW5nc1xuICApO1xuXG4gIC8vIFF1ZXJ5IGZvciB0YWJzIHRoYXQgbWF0Y2ggdGhlIGhvc3RuYW1lIGRpcmVjdGx5XG4gIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7IHVybDogYCo6Ly8ke2hvc3RuYW1lfS8qYCB9KTtcbiAgXG4gIGNvbnNvbGUubG9nKFxuICAgIGBbRXZlbnRIYW5kbGVyXSBGb3VuZCAke3RhYnMubGVuZ3RofSB0YWJzIG1hdGNoaW5nIGhvc3RuYW1lICR7aG9zdG5hbWV9IGZvciBzaXRlIHNldHRpbmdzIHVwZGF0ZS5gXG4gICk7XG5cbiAgZm9yIChjb25zdCB0YWIgb2YgdGFicykge1xuICAgIC8vIERvdWJsZS1jaGVjayBob3N0bmFtZSBqdXN0IGluIGNhc2UgcXVlcnkgaXMgdG9vIGJyb2FkIG9yIFVSTCBjaGFuZ2VzLCB0aG91Z2ggdW5saWtlbHkgd2l0aCBzcGVjaWZpYyBxdWVyeVxuICAgIGNvbnN0IHRhYkhvc3RuYW1lID0gZ2V0SG9zdG5hbWUodGFiLnVybCk7XG4gICAgaWYgKHRhYi5pZCAmJiB0YWJIb3N0bmFtZSA9PT0gaG9zdG5hbWUpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2U6IFVwZGF0ZVNldHRpbmdzTWVzc2FnZSA9IHtcbiAgICAgICAgdHlwZTogXCJVUERBVEVfU0VUVElOR1NcIixcbiAgICAgICAgc2V0dGluZ3M6IG5ld1NpdGVTZXR0aW5ncyxcbiAgICAgICAgaG9zdG5hbWU6IGhvc3RuYW1lLFxuICAgICAgfTtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBgW0V2ZW50SGFuZGxlcl0gU2VuZGluZyBzaXRlIHNldHRpbmdzIHVwZGF0ZSB0byB0YWIgJHt0YWIuaWR9ICgke2hvc3RuYW1lfSlgLFxuICAgICAgICBtZXNzYWdlXG4gICAgICApO1xuICAgICAgc2VuZE1lc3NhZ2VUb1RhYih0YWIuaWQgYXMgbnVtYmVyLCBtZXNzYWdlLCAwKTsgLy8gU3BlY2lmeSBtYWluIGZyYW1lXG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFRoaXMgY2FzZSBzaG91bGQgaWRlYWxseSBub3QgYmUgaGl0IGlmIGNocm9tZS50YWJzLnF1ZXJ5IHdpdGggVVJMIHBhdHRlcm4gaXMgYWNjdXJhdGVcbiAgICAgIGNvbnNvbGUud2FybihgW0V2ZW50SGFuZGxlcl0gVGFiICR7dGFiLmlkfSBtYXRjaGVkIHF1ZXJ5IGZvciAke2hvc3RuYW1lfSBidXQgZ2V0SG9zdG5hbWUgcmVzb2x2ZWQgdG8gJHt0YWJIb3N0bmFtZX0uIFNraXBwaW5nLmApO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIEJyb2FkY2FzdHMgdXBkYXRlZCBnbG9iYWwgc2V0dGluZ3MgdG8gcmVsZXZhbnQgdGFicy5cbiAqIEV4cG9ydGVkIHRvIGJlIGNhbGxlZCBkaXJlY3RseSBieSBTZXR0aW5nc01hbmFnZXIuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBicm9hZGNhc3RHbG9iYWxTZXR0aW5nc1VwZGF0ZShcbiAgbmV3R2xvYmFsU2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3Ncbikge1xuICBjb25zb2xlLmxvZyhgWyEhIV0gQnJvYWRjYXN0aW5nIGdsb2JhbCBzZXR0aW5ncyB1cGRhdGVgKTsgLy8gQURERUQgTE9HXG4gIGNvbnNvbGUubG9nKFxuICAgIFwiU2V0dGluZ3NFdmVudEhhbmRsZXI6IEJyb2FkY2FzdGluZyBnbG9iYWwgc2V0dGluZ3MgZGF0YVwiLFxuICAgIG5ld0dsb2JhbFNldHRpbmdzXG4gICk7XG4gIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGNvbnNvbGUubG9nKFxuICAgIGBbRXZlbnRIYW5kbGVyXSBGb3VuZCAke3RhYnMubGVuZ3RofSB0YWJzIHRvIGNoZWNrIGZvciBnbG9iYWwgdXBkYXRlYFxuICApOyAvLyBMb2cgdGFiIGNvdW50XG4gIGZvciAoY29uc3QgdGFiIG9mIHRhYnMpIHtcbiAgICBpZiAodGFiLmlkICYmIHRhYi51cmwpIHtcbiAgICAgIGNvbnN0IHRhYkhvc3RuYW1lID0gZ2V0SG9zdG5hbWUodGFiLnVybCk7XG4gICAgICBpZiAodGFiSG9zdG5hbWUpIHtcbiAgICAgICAgY29uc3Qgc2l0ZUNvbmZpZyA9IHNldHRpbmdzTWFuYWdlci5nZXRTZXR0aW5nc0ZvclNpdGUodGFiSG9zdG5hbWUpO1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICBgW0V2ZW50SGFuZGxlcl0gQ2hlY2tpbmcgdGFiICR7dGFiLmlkfSAoJHt0YWJIb3N0bmFtZX0pIGZvciBnbG9iYWwgdXBkYXRlLiBTaXRlIGNvbmZpZzpgLFxuICAgICAgICAgIHNpdGVDb25maWdcbiAgICAgICAgKTsgLy8gTG9nIGNoZWNrXG4gICAgICAgIC8vIFNlbmQgdXBkYXRlIGlmIG5vIHNpdGUgY29uZmlnIGV4aXN0cyBvciBpZiBzaXRlIGlzIHNldCB0byBnbG9iYWwgbW9kZVxuICAgICAgICBpZiAoIXNpdGVDb25maWcgfHwgc2l0ZUNvbmZpZy5hY3RpdmVTZXR0aW5nID09PSBcImdsb2JhbFwiKSB7XG4gICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBgW0V2ZW50SGFuZGxlcl0gVGFiICR7dGFiLmlkfSAoJHt0YWJIb3N0bmFtZX0pIHF1YWxpZmllcyBmb3IgZ2xvYmFsIHVwZGF0ZS5gXG4gICAgICAgICAgKTsgLy8gTG9nIHF1YWxpZmljYXRpb25cbiAgICAgICAgICBjb25zdCBtZXNzYWdlOiBVcGRhdGVTZXR0aW5nc01lc3NhZ2UgPSB7XG4gICAgICAgICAgICB0eXBlOiBcIlVQREFURV9TRVRUSU5HU1wiLFxuICAgICAgICAgICAgc2V0dGluZ3M6IG5ld0dsb2JhbFNldHRpbmdzLFxuICAgICAgICAgICAgaG9zdG5hbWU6IHRhYkhvc3RuYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgICAgY29uc29sZS5sb2coXG4gICAgICAgICAgICBgW0V2ZW50SGFuZGxlcl0gU2VuZGluZyBnbG9iYWwgdXBkYXRlIHRvIHRhYiAke3RhYi5pZH0gKCR7dGFiSG9zdG5hbWV9KWAsXG4gICAgICAgICAgICBtZXNzYWdlXG4gICAgICAgICAgKTsgLy8gQURERUQgTE9HXG4gICAgICAgICAgc2VuZE1lc3NhZ2VUb1RhYih0YWIuaWQsIG1lc3NhZ2UsIDApOyAvLyBTcGVjaWZ5IG1haW4gZnJhbWVcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIEJyb2FkY2FzdHMgdXBkYXRlZCBzaXRlIG1vZGUgYW5kIHRoZSBlZmZlY3RpdmUgc2V0dGluZ3MgdG8gcmVsZXZhbnQgdGFicy5cbiAqIEV4cG9ydGVkIHRvIGJlIGNhbGxlZCBkaXJlY3RseSBieSBTZXR0aW5nc01hbmFnZXIuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBicm9hZGNhc3RTaXRlTW9kZVVwZGF0ZShcbiAgaG9zdG5hbWU6IHN0cmluZyxcbiAgbW9kZTogc3RyaW5nLFxuICBlZmZlY3RpdmVTZXR0aW5nczogQXVkaW9TZXR0aW5nc1xuKSB7XG4gIGlmICghaG9zdG5hbWUpIHtcbiAgICBjb25zb2xlLndhcm4oXCJTZXR0aW5nc0V2ZW50SGFuZGxlcjogYnJvYWRjYXN0U2l0ZU1vZGVVcGRhdGUgY2FsbGVkIHdpdGggbm8gaG9zdG5hbWUuXCIpO1xuICAgIHJldHVybjtcbiAgfVxuICBjb25zb2xlLmxvZyhgWyEhIV0gQnJvYWRjYXN0aW5nIHNpdGUgbW9kZSB1cGRhdGUgZm9yICR7aG9zdG5hbWV9IHRvICR7bW9kZX1gKTtcbiAgY29uc29sZS5sb2coYFNldHRpbmdzRXZlbnRIYW5kbGVyOiBCcm9hZGNhc3RpbmcgbW9kZSBkYXRhIGZvciAke2hvc3RuYW1lfWAsIHtcbiAgICBtb2RlLFxuICAgIGVmZmVjdGl2ZVNldHRpbmdzLFxuICB9KTtcblxuICAvLyBRdWVyeSBmb3IgdGFicyB0aGF0IG1hdGNoIHRoZSBob3N0bmFtZSBkaXJlY3RseVxuICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoeyB1cmw6IGAqOi8vJHtob3N0bmFtZX0vKmAgfSk7XG5cbiAgY29uc29sZS5sb2coXG4gICAgYFtFdmVudEhhbmRsZXJdIEZvdW5kICR7dGFicy5sZW5ndGh9IHRhYnMgbWF0Y2hpbmcgaG9zdG5hbWUgJHtob3N0bmFtZX0gZm9yIHNpdGUgbW9kZSB1cGRhdGUuYFxuICApO1xuXG4gIGZvciAoY29uc3QgdGFiIG9mIHRhYnMpIHtcbiAgICAvLyBEb3VibGUtY2hlY2sgaG9zdG5hbWVcbiAgICBjb25zdCB0YWJIb3N0bmFtZSA9IGdldEhvc3RuYW1lKHRhYi51cmwpO1xuICAgIGlmICh0YWIuaWQgJiYgdGFiSG9zdG5hbWUgPT09IGhvc3RuYW1lKSB7XG4gICAgICBjb25zdCBtZXNzYWdlOiBVcGRhdGVTZXR0aW5nc01lc3NhZ2UgPSB7XG4gICAgICAgIHR5cGU6IFwiVVBEQVRFX1NFVFRJTkdTXCIsIC8vIFN0aWxsIHNlbmQgVVBEQVRFX1NFVFRJTkdTXG4gICAgICAgIHNldHRpbmdzOiBlZmZlY3RpdmVTZXR0aW5ncywgLy8gU2VuZCB0aGUgc2V0dGluZ3MgYXBwcm9wcmlhdGUgZm9yIHRoZSBuZXcgbW9kZVxuICAgICAgICBob3N0bmFtZTogaG9zdG5hbWUsXG4gICAgICB9O1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBbRXZlbnRIYW5kbGVyXSBTZW5kaW5nIHNpdGUgbW9kZSB1cGRhdGUgKGFzIFVQREFURV9TRVRUSU5HUykgdG8gdGFiICR7dGFiLmlkfSAoJHtob3N0bmFtZX0pYCxcbiAgICAgICAgbWVzc2FnZVxuICAgICAgKTtcbiAgICAgIHNlbmRNZXNzYWdlVG9UYWIodGFiLmlkLCBtZXNzYWdlLCAwKTsgLy8gU3BlY2lmeSBtYWluIGZyYW1lXG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2FybihgW0V2ZW50SGFuZGxlcl0gVGFiICR7dGFiLmlkfSBtYXRjaGVkIHF1ZXJ5IGZvciAke2hvc3RuYW1lfSAobW9kZSB1cGRhdGUpIGJ1dCBnZXRIb3N0bmFtZSByZXNvbHZlZCB0byAke3RhYkhvc3RuYW1lfS4gU2tpcHBpbmcuYCk7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXR1cFNldHRpbmdzRXZlbnRIYW5kbGVyKCkge1xuICBjb25zb2xlLmxvZyhcIlNldHRpbmdzRXZlbnRIYW5kbGVyOiBMaXN0ZW5lcnMgYXJlIG5vdyBoYW5kbGVkIGRpcmVjdGx5IGJ5IFNldHRpbmdzTWFuYWdlclwiKTtcbn1cbiIsImltcG9ydCB7XG4gIEF1ZGlvU2V0dGluZ3MsXG4gIFNpdGVTZXR0aW5ncyxcbiAgZGVmYXVsdFNldHRpbmdzLFxufSBmcm9tIFwiLi90eXBlc1wiO1xuLy8gSW1wb3J0IHRoZSBicm9hZGNhc3QgZnVuY3Rpb25zIGRpcmVjdGx5XG5pbXBvcnQge1xuICBicm9hZGNhc3RTaXRlU2V0dGluZ3NVcGRhdGUsXG4gIGJyb2FkY2FzdFNpdGVNb2RlVXBkYXRlLFxuICBicm9hZGNhc3RHbG9iYWxTZXR0aW5nc1VwZGF0ZSxcbn0gZnJvbSBcIi4vc2V0dGluZ3MtZXZlbnQtaGFuZGxlclwiO1xuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NNYW5hZ2VyIHtcbiAgZ2xvYmFsU2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3M7XG4gIHByaXZhdGUgc2l0ZVNldHRpbmdzOiBNYXA8c3RyaW5nLCBTaXRlU2V0dGluZ3M+O1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuZ2xvYmFsU2V0dGluZ3MgPSB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9O1xuICAgIHRoaXMuc2l0ZVNldHRpbmdzID0gbmV3IE1hcCgpO1xuICB9XG5cbiAgYXN5bmMgaW5pdGlhbGl6ZSgpIHtcbiAgICBjb25zdCBzdG9yYWdlID0gYXdhaXQgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoW1xuICAgICAgXCJnbG9iYWxTZXR0aW5nc1wiLFxuICAgICAgXCJzaXRlU2V0dGluZ3NcIixcbiAgICBdKTtcbiAgICB0aGlzLmdsb2JhbFNldHRpbmdzID0gc3RvcmFnZS5nbG9iYWxTZXR0aW5ncyB8fCB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9O1xuXG4gICAgaWYgKHN0b3JhZ2Uuc2l0ZVNldHRpbmdzKSB7XG4gICAgICB0aGlzLnNpdGVTZXR0aW5ncyA9IG5ldyBNYXAoT2JqZWN0LmVudHJpZXMoc3RvcmFnZS5zaXRlU2V0dGluZ3MpKTtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBcIltERUJVR10gU2V0dGluZ3NNYW5hZ2VyIEluaXRpYWxpemVkIHdpdGggc3RvcmVkIHNpdGUgc2V0dGluZ3MuIFNpdGVTZXR0aW5ncyBNYXA6XCIsXG4gICAgICAgIHRoaXMuc2l0ZVNldHRpbmdzXG4gICAgICApOyAvLyBBZGQgbG9nXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuc2l0ZVNldHRpbmdzID0gbmV3IE1hcCgpOyAvLyBFbnN1cmUgbWFwIGlzIGVtcHR5IGlmIG5vdGhpbmcgaW4gc3RvcmFnZVxuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIFwiW0RFQlVHXSBTZXR0aW5nc01hbmFnZXIgSW5pdGlhbGl6ZWQgd2l0aCBubyBzdG9yZWQgc2l0ZSBzZXR0aW5ncy5cIlxuICAgICAgKTsgLy8gQWRkIGxvZ1xuICAgIH1cbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIFwiW0RFQlVHXSBTZXR0aW5nc01hbmFnZXIgSW5pdGlhbGl6ZWQuIEdsb2JhbCBTZXR0aW5nczpcIixcbiAgICAgIHRoaXMuZ2xvYmFsU2V0dGluZ3NcbiAgICApOyAvLyBBbHNvIGxvZyBnbG9iYWwgc2V0dGluZ3NcbiAgfVxuXG4gIHByaXZhdGUgcGVyc2lzdFRpbWVvdXQ6IE5vZGVKUy5UaW1lb3V0IHwgbnVsbCA9IG51bGw7XG4gIHByaXZhdGUgcGVuZGluZ1NldHRpbmdzID0ge1xuICAgIGdsb2JhbFNldHRpbmdzOiBudWxsIGFzIEF1ZGlvU2V0dGluZ3MgfCBudWxsLFxuICAgIHNpdGVTZXR0aW5nczogbnVsbCBhcyB7IFtob3N0bmFtZTogc3RyaW5nXTogU2l0ZVNldHRpbmdzIH0gfCBudWxsLFxuICB9O1xuXG4gIHByaXZhdGUgYXN5bmMgcGVyc2lzdFNldHRpbmdzKGhvc3RuYW1lPzogc3RyaW5nKSB7XG4gICAgLy8gQ2xlYXIgYW55IGV4aXN0aW5nIHRpbWVvdXRcbiAgICBpZiAodGhpcy5wZXJzaXN0VGltZW91dCkge1xuICAgICAgY2xlYXJUaW1lb3V0KHRoaXMucGVyc2lzdFRpbWVvdXQpO1xuICAgIH1cblxuICAgIC8vIFF1ZXVlIHRoZSBjdXJyZW50IHNldHRpbmdzXG4gICAgdGhpcy5wZW5kaW5nU2V0dGluZ3MuZ2xvYmFsU2V0dGluZ3MgPSB7IC4uLnRoaXMuZ2xvYmFsU2V0dGluZ3MgfTtcbiAgICB0aGlzLnBlbmRpbmdTZXR0aW5ncy5zaXRlU2V0dGluZ3MgPSBPYmplY3QuZnJvbUVudHJpZXModGhpcy5zaXRlU2V0dGluZ3MpO1xuXG4gICAgLy8gU2V0IGEgbmV3IHRpbWVvdXQgdG8gYmF0Y2ggd3JpdGUgc2V0dGluZ3NcbiAgICB0aGlzLnBlcnNpc3RUaW1lb3V0ID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBzZXR0aW5ncyA9IHtcbiAgICAgICAgICBnbG9iYWxTZXR0aW5nczogdGhpcy5wZW5kaW5nU2V0dGluZ3MuZ2xvYmFsU2V0dGluZ3MsXG4gICAgICAgICAgc2l0ZVNldHRpbmdzOiB0aGlzLnBlbmRpbmdTZXR0aW5ncy5zaXRlU2V0dGluZ3MsXG4gICAgICAgIH07XG4gICAgICAgIGF3YWl0IGNocm9tZS5zdG9yYWdlLnN5bmMuc2V0KHNldHRpbmdzKTtcbiAgICAgICAgY29uc29sZS5sb2coXCJTZXR0aW5nc01hbmFnZXI6IFNldHRpbmdzIHBlcnNpc3RlZCBzdWNjZXNzZnVsbHlcIiwge1xuICAgICAgICAgIGhvc3RuYW1lLFxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBDbGVhciBwZW5kaW5nIHNldHRpbmdzXG4gICAgICAgIHRoaXMucGVuZGluZ1NldHRpbmdzLmdsb2JhbFNldHRpbmdzID0gbnVsbDtcbiAgICAgICAgdGhpcy5wZW5kaW5nU2V0dGluZ3Muc2l0ZVNldHRpbmdzID0gbnVsbDtcbiAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJTZXR0aW5nc01hbmFnZXI6IEZhaWxlZCB0byBwZXJzaXN0IHNldHRpbmdzOlwiLCBlcnJvcik7XG4gICAgICB9XG4gICAgfSwgMjAwKTsgLy8gUmVkdWNlZCBkZWJvdW5jZSB0aW1lIHRvIDIwMG1zXG4gIH1cblxuICBnZXRTZXR0aW5nc0ZvclNpdGUoaG9zdG5hbWU6IHN0cmluZyk6IFNpdGVTZXR0aW5ncyB7XG4gICAgLy8gQ2hhbmdlZCByZXR1cm4gdHlwZSB0byBub24tbnVsbGFibGVcbiAgICBsZXQgc2l0ZUNvbmZpZyA9IHRoaXMuc2l0ZVNldHRpbmdzLmdldChob3N0bmFtZSk7XG5cbiAgICAvLyBJZiBubyBzaXRlIGNvbmZpZyBleGlzdHMsIGNyZWF0ZSBhIGRlZmF1bHQgb25lIHVzaW5nIGdsb2JhbCBzZXR0aW5nc1xuICAgIGlmICghc2l0ZUNvbmZpZykge1xuICAgICAgY29uc29sZS5sb2coXG4gICAgICAgIGBTZXR0aW5nc01hbmFnZXI6IE5vIGNvbmZpZyBmb3VuZCBmb3IgJHtob3N0bmFtZX0sIGNyZWF0aW5nIGRlZmF1bHQgZ2xvYmFsIGNvbmZpZy5gXG4gICAgICApO1xuICAgICAgc2l0ZUNvbmZpZyA9IHtcbiAgICAgICAgZW5hYmxlZDogdHJ1ZSwgLy8gQXNzdW1lIGVuYWJsZWQgYnkgZGVmYXVsdFxuICAgICAgICBhY3RpdmVTZXR0aW5nOiBcImdsb2JhbFwiLFxuICAgICAgICBzZXR0aW5nczogeyAuLi50aGlzLmdsb2JhbFNldHRpbmdzIH0sIC8vIFVzZSBjdXJyZW50IGdsb2JhbCBzZXR0aW5nc1xuICAgICAgfTtcbiAgICAgIC8vIE5vdGU6IFdlIGRvbid0IHBlcnNpc3QgdGhpcyBkZWZhdWx0IGNvbmZpZyBpbW1lZGlhdGVseS5cbiAgICAgIC8vIEl0IG9ubHkgZ2V0cyBwZXJzaXN0ZWQgaWYgdGhlIHVzZXIgZXhwbGljaXRseSBjaGFuZ2VzIHNldHRpbmdzIG9yIG1vZGUgZm9yIHRoaXMgc2l0ZSBsYXRlci5cbiAgICB9XG5cbiAgICAvLyBJZiBpbiBnbG9iYWwgbW9kZSwgbWFrZSBzdXJlIHdlJ3JlIHVzaW5nIGdsb2JhbCBzZXR0aW5nc1xuICAgIGlmIChzaXRlQ29uZmlnLmFjdGl2ZVNldHRpbmcgPT09IFwiZ2xvYmFsXCIpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLnNpdGVDb25maWcsXG4gICAgICAgIHNldHRpbmdzOiB7IC4uLnRoaXMuZ2xvYmFsU2V0dGluZ3MgfSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gRm9yIGRpc2FibGVkIHNpdGVzLCByZXR1cm4gY29uZmlnIGJ1dCB3aXRoIGRpc2FibGVkIGZsYWdcbiAgICBpZiAoc2l0ZUNvbmZpZy5hY3RpdmVTZXR0aW5nID09PSBcImRpc2FibGVkXCIpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLnNpdGVDb25maWcsXG4gICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gc2l0ZUNvbmZpZztcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZUdsb2JhbFNldHRpbmdzKFxuICAgIHNldHRpbmdzOiBQYXJ0aWFsPEF1ZGlvU2V0dGluZ3M+LFxuICAgIHRhYklkPzogbnVtYmVyLFxuICAgIGhvc3RuYW1lPzogc3RyaW5nXG4gICkge1xuICAgIGNvbnNvbGUubG9nKFwiU2V0dGluZ3NNYW5hZ2VyOiBVcGRhdGluZyBnbG9iYWwgc2V0dGluZ3NcIiwge1xuICAgICAgb2xkU2V0dGluZ3M6IHsgLi4udGhpcy5nbG9iYWxTZXR0aW5ncyB9LFxuICAgICAgbmV3U2V0dGluZ3M6IHNldHRpbmdzLFxuICAgICAgdGFiSWQsXG4gICAgICBob3N0bmFtZSxcbiAgICB9KTtcblxuICAgIC8vIFVwZGF0ZSBzZXR0aW5nc1xuICAgIHRoaXMuZ2xvYmFsU2V0dGluZ3MgPSB7XG4gICAgICAuLi50aGlzLmdsb2JhbFNldHRpbmdzLFxuICAgICAgLi4uc2V0dGluZ3MsXG4gICAgfTtcblxuICAgIC8vIFBlcnNpc3Qgc2V0dGluZ3MgZmlyc3QgdG8gZW5zdXJlIGRhdGEgaW50ZWdyaXR5XG4gICAgYXdhaXQgdGhpcy5wZXJzaXN0U2V0dGluZ3MoaG9zdG5hbWUpO1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgXCJTZXR0aW5nc01hbmFnZXI6IEdsb2JhbCBzZXR0aW5ncyBwZXJzaXN0ZWQgc3VjY2Vzc2Z1bGx5XCJcbiAgICApO1xuXG4gICAgLy8gVGhlbiBicm9hZGNhc3QgdGhlIHVwZGF0ZSB0byBvdGhlciB0YWJzXG4gICAgYnJvYWRjYXN0R2xvYmFsU2V0dGluZ3NVcGRhdGUodGhpcy5nbG9iYWxTZXR0aW5ncyk7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBcIlNldHRpbmdzTWFuYWdlcjogVXBkYXRlZCBnbG9iYWwgc2V0dGluZ3MgJiBjYWxsZWQgYnJvYWRjYXN0XCJcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2l0ZVNldHRpbmdzKFxuICAgIGhvc3RuYW1lOiBzdHJpbmcsXG4gICAgc2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3MsXG4gICAgdGFiSWQ/OiBudW1iZXJcbiAgKSB7XG4gICAgY29uc29sZS5sb2coXCJTZXR0aW5nc01hbmFnZXI6IFVwZGF0aW5nIHNpdGUgc2V0dGluZ3MgZm9yXCIsIGhvc3RuYW1lLCB7XG4gICAgICB0YWJJZCxcbiAgICB9KTtcblxuICAgIGlmICghc2V0dGluZ3MpIHtcbiAgICAgIGNvbnNvbGUubG9nKFwiU2V0dGluZ3NNYW5hZ2VyOiBObyBzZXR0aW5ncyBwcm92aWRlZFwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFob3N0bmFtZSkge1xuICAgICAgY29uc29sZS5sb2coXCJTZXR0aW5nc01hbmFnZXI6IE5vIGhvc3RuYW1lIHByb3ZpZGVkXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxldCBzaXRlQ29uZmlnID0gdGhpcy5zaXRlU2V0dGluZ3MuZ2V0KGhvc3RuYW1lKTtcbiAgICBjb25zdCBpc05ld1NpdGUgPSAhc2l0ZUNvbmZpZztcblxuICAgIGlmIChpc05ld1NpdGUpIHtcbiAgICAgIHNpdGVDb25maWcgPSB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgIGFjdGl2ZVNldHRpbmc6IFwic2l0ZVwiLFxuICAgICAgICBzZXR0aW5nczogeyAuLi5kZWZhdWx0U2V0dGluZ3MgfSxcbiAgICAgIH07XG4gICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgXCJTZXR0aW5nc01hbmFnZXI6IENyZWF0ZWQgbmV3IHNpdGUgY29uZmlnIHdpdGggZGVmYXVsdCBzZXR0aW5nc1wiXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAoIXNpdGVDb25maWcpIHtcbiAgICAgIGNvbnNvbGUubG9nKFwiU2V0dGluZ3NNYW5hZ2VyOiBJbml0aWFsaXppbmcgc2l0ZSB3aXRoIGRlZmF1bHQgc2V0dGluZ3NcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vIFVwZGF0ZSB3aXRoIG5ldyBzZXR0aW5nc1xuICAgIHNpdGVDb25maWcuc2V0dGluZ3MgPSB7IC4uLnNldHRpbmdzIH07XG4gICAgc2l0ZUNvbmZpZy5hY3RpdmVTZXR0aW5nID0gXCJzaXRlXCI7XG4gICAgc2l0ZUNvbmZpZy5lbmFibGVkID0gdHJ1ZTtcbiAgICB0aGlzLnNpdGVTZXR0aW5ncy5zZXQoaG9zdG5hbWUsIHNpdGVDb25maWcpO1xuXG4gICAgLy8gUGVyc2lzdCBzZXR0aW5ncyBmaXJzdCB0byBlbnN1cmUgZGF0YSBpbnRlZ3JpdHlcbiAgICBhd2FpdCB0aGlzLnBlcnNpc3RTZXR0aW5ncyhob3N0bmFtZSk7XG4gICAgY29uc29sZS5sb2coXG4gICAgICBcIlNldHRpbmdzTWFuYWdlcjogU2l0ZSBzZXR0aW5ncyBwZXJzaXN0ZWQgc3VjY2Vzc2Z1bGx5XCJcbiAgICApO1xuXG4gICAgLy8gVGhlbiBicm9hZGNhc3QgdGhlIHVwZGF0ZSB0byBvdGhlciB0YWJzXG4gICAgYnJvYWRjYXN0U2l0ZVNldHRpbmdzVXBkYXRlKGhvc3RuYW1lLCBzaXRlQ29uZmlnLnNldHRpbmdzKTtcbiAgICBjb25zb2xlLmxvZyhcbiAgICAgIFwiU2V0dGluZ3NNYW5hZ2VyOiBVcGRhdGVkIHNpdGUgc2V0dGluZ3MgJiBjYWxsZWQgYnJvYWRjYXN0XCJcbiAgICApO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2l0ZU1vZGUoXG4gICAgaG9zdG5hbWU6IHN0cmluZyxcbiAgICBtb2RlOiBcImdsb2JhbFwiIHwgXCJzaXRlXCIgfCBcImRpc2FibGVkXCIsXG4gICAgdGFiSWQ/OiBudW1iZXJcbiAgKSB7XG4gICAgbGV0IHNpdGVDb25maWcgPSB0aGlzLnNpdGVTZXR0aW5ncy5nZXQoaG9zdG5hbWUpO1xuICAgIGNvbnN0IG9sZE1vZGUgPSBzaXRlQ29uZmlnPy5hY3RpdmVTZXR0aW5nO1xuXG4gICAgaWYgKCFzaXRlQ29uZmlnKSB7XG4gICAgICAvLyBJbml0aWFsaXplIHdpdGggY3VycmVudCBnbG9iYWwgc2V0dGluZ3MgaWYgbm8gY29uZmlnIGV4aXN0c1xuICAgICAgc2l0ZUNvbmZpZyA9IHtcbiAgICAgICAgZW5hYmxlZDogbW9kZSAhPT0gXCJkaXNhYmxlZFwiLFxuICAgICAgICBhY3RpdmVTZXR0aW5nOiBtb2RlLFxuICAgICAgICBzZXR0aW5nczogeyAuLi50aGlzLmdsb2JhbFNldHRpbmdzIH0sXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBtb2RlIGFuZCBlbmFibGVkIHN0YXRlLCBidXQgcHJlc2VydmUgc2V0dGluZ3NcbiAgICBzaXRlQ29uZmlnLmFjdGl2ZVNldHRpbmcgPSBtb2RlO1xuICAgIHNpdGVDb25maWcuZW5hYmxlZCA9IG1vZGUgIT09IFwiZGlzYWJsZWRcIjtcblxuICAgIHRoaXMuc2l0ZVNldHRpbmdzLnNldChob3N0bmFtZSwgc2l0ZUNvbmZpZyk7XG4gICAgYXdhaXQgdGhpcy5wZXJzaXN0U2V0dGluZ3MoaG9zdG5hbWUpO1xuXG4gICAgLy8gRGV0ZXJtaW5lIHdoaWNoIHNldHRpbmdzIHRvIGRpc3BsYXkgKG5vdCBtb2RpZnkpXG4gICAgY29uc3QgZGlzcGxheVNldHRpbmdzID1cbiAgICAgIG1vZGUgPT09IFwiZGlzYWJsZWRcIlxuICAgICAgICA/IHsgLi4uZGVmYXVsdFNldHRpbmdzIH1cbiAgICAgICAgOiBtb2RlID09PSBcImdsb2JhbFwiXG4gICAgICAgID8geyAuLi50aGlzLmdsb2JhbFNldHRpbmdzIH1cbiAgICAgICAgOiBzaXRlQ29uZmlnLnNldHRpbmdzIHx8IHsgLi4uZGVmYXVsdFNldHRpbmdzIH07IC8vIFVzZSBkZWZhdWx0cyBpZiBzaXRlIHNldHRpbmdzIGFyZSBzb21laG93IHVuZGVmaW5lZFxuXG4gICAgLy8gRW5zdXJlIHRoZSBvYmplY3QgcGFzc2VkIHN0cmljdGx5IG1hdGNoZXMgQXVkaW9TZXR0aW5ncyB0eXBlXG4gICAgY29uc3Qgc2V0dGluZ3NUb0Jyb2FkY2FzdDogQXVkaW9TZXR0aW5ncyA9IHsgLi4uZGlzcGxheVNldHRpbmdzIH07XG5cbiAgICAvLyBEaXJlY3RseSBjYWxsIHRoZSBicm9hZGNhc3QgZnVuY3Rpb24gaW5zdGVhZCBvZiBlbWl0dGluZyBhbiBldmVudFxuICAgIGJyb2FkY2FzdFNpdGVNb2RlVXBkYXRlKGhvc3RuYW1lLCBtb2RlLCBzZXR0aW5nc1RvQnJvYWRjYXN0KTtcbiAgICBjb25zb2xlLmxvZyhcIlNldHRpbmdzTWFuYWdlcjogVXBkYXRlZCBzaXRlIG1vZGUgJiBjYWxsZWQgYnJvYWRjYXN0XCIsIHtcbiAgICAgIGhvc3RuYW1lLFxuICAgICAgbW9kZSxcbiAgICAgIHNldHRpbmdzVG9Ccm9hZGNhc3QsXG4gICAgfSk7IC8vIFVwZGF0ZWQgbG9nXG4gICAgcmV0dXJuIHsgc2V0dGluZ3NUb1VzZTogc2V0dGluZ3NUb0Jyb2FkY2FzdCwgc2l0ZUNvbmZpZyB9OyAvLyBSZXR1cm4gdGhlIGd1YXJhbnRlZWQgb2JqZWN0XG4gIH1cblxuICBhc3luYyBkaXNhYmxlU2l0ZShob3N0bmFtZTogc3RyaW5nLCB0YWJJZD86IG51bWJlcikge1xuICAgIGxldCBzaXRlQ29uZmlnID0gdGhpcy5zaXRlU2V0dGluZ3MuZ2V0KGhvc3RuYW1lKTtcblxuICAgIGlmICghc2l0ZUNvbmZpZykge1xuICAgICAgLy8gSWYgbm8gY29uZmlnIGV4aXN0cywgY3JlYXRlIG9uZSB3aXRoIGN1cnJlbnQgZ2xvYmFsIHNldHRpbmdzXG4gICAgICBzaXRlQ29uZmlnID0ge1xuICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgYWN0aXZlU2V0dGluZzogXCJkaXNhYmxlZFwiLFxuICAgICAgICBzZXR0aW5nczogeyAuLi50aGlzLmdsb2JhbFNldHRpbmdzIH0sXG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBLZWVwIGV4aXN0aW5nIHNldHRpbmdzLCBqdXN0IHVwZGF0ZSB0aGUgbW9kZVxuICAgICAgc2l0ZUNvbmZpZy5lbmFibGVkID0gZmFsc2U7XG4gICAgICBzaXRlQ29uZmlnLmFjdGl2ZVNldHRpbmcgPSBcImRpc2FibGVkXCI7XG4gICAgfVxuXG4gICAgdGhpcy5zaXRlU2V0dGluZ3Muc2V0KGhvc3RuYW1lLCBzaXRlQ29uZmlnKTtcbiAgICBhd2FpdCB0aGlzLnBlcnNpc3RTZXR0aW5ncyhob3N0bmFtZSk7XG5cbiAgICAvLyBEaXJlY3RseSBjYWxsIHRoZSBicm9hZGNhc3QgZnVuY3Rpb24gaW5zdGVhZCBvZiBlbWl0dGluZyBhbiBldmVudFxuICAgIC8vIEVuc3VyZSB0aGUgcGFzc2VkIG9iamVjdCBzdHJpY3RseSBtYXRjaGVzIEF1ZGlvU2V0dGluZ3MgdHlwZVxuICAgIGNvbnN0IGRpc2FibGVkU2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3MgPSB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9O1xuICAgIGJyb2FkY2FzdFNpdGVNb2RlVXBkYXRlKGhvc3RuYW1lLCBcImRpc2FibGVkXCIsIGRpc2FibGVkU2V0dGluZ3MpO1xuICAgIGNvbnNvbGUubG9nKFwiU2V0dGluZ3NNYW5hZ2VyOiBEaXNhYmxlZCBzaXRlICYgY2FsbGVkIGJyb2FkY2FzdFwiLCB7XG4gICAgICBob3N0bmFtZSxcbiAgICB9KTsgLy8gQWRkZWQgbG9nXG5cbiAgICByZXR1cm4ge1xuICAgICAgYWN0dWFsU2V0dGluZ3M6IHNpdGVDb25maWcuc2V0dGluZ3MsIC8vIEtlZXAgcmV0dXJuaW5nIHRoaXMgZm9yIHBvdGVudGlhbCBpbnRlcm5hbCB1c2VcbiAgICAgIGRpc3BsYXlTZXR0aW5nczogeyAuLi5kZWZhdWx0U2V0dGluZ3MgfSxcbiAgICB9O1xuICB9XG59XG5cbmV4cG9ydCBjb25zdCBzZXR0aW5nc01hbmFnZXIgPSBuZXcgU2V0dGluZ3NNYW5hZ2VyKCk7XG4iLCJleHBvcnQgZnVuY3Rpb24gZGVmaW5lQmFja2dyb3VuZChhcmcpIHtcbiAgaWYgKGFyZyA9PSBudWxsIHx8IHR5cGVvZiBhcmcgPT09IFwiZnVuY3Rpb25cIikgcmV0dXJuIHsgbWFpbjogYXJnIH07XG4gIHJldHVybiBhcmc7XG59XG4iLCIvLyBzcmMvaW5kZXgudHNcbnZhciBfTWF0Y2hQYXR0ZXJuID0gY2xhc3Mge1xuICBjb25zdHJ1Y3RvcihtYXRjaFBhdHRlcm4pIHtcbiAgICBpZiAobWF0Y2hQYXR0ZXJuID09PSBcIjxhbGxfdXJscz5cIikge1xuICAgICAgdGhpcy5pc0FsbFVybHMgPSB0cnVlO1xuICAgICAgdGhpcy5wcm90b2NvbE1hdGNoZXMgPSBbLi4uX01hdGNoUGF0dGVybi5QUk9UT0NPTFNdO1xuICAgICAgdGhpcy5ob3N0bmFtZU1hdGNoID0gXCIqXCI7XG4gICAgICB0aGlzLnBhdGhuYW1lTWF0Y2ggPSBcIipcIjtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgZ3JvdXBzID0gLyguKik6XFwvXFwvKC4qPykoXFwvLiopLy5leGVjKG1hdGNoUGF0dGVybik7XG4gICAgICBpZiAoZ3JvdXBzID09IG51bGwpXG4gICAgICAgIHRocm93IG5ldyBJbnZhbGlkTWF0Y2hQYXR0ZXJuKG1hdGNoUGF0dGVybiwgXCJJbmNvcnJlY3QgZm9ybWF0XCIpO1xuICAgICAgY29uc3QgW18sIHByb3RvY29sLCBob3N0bmFtZSwgcGF0aG5hbWVdID0gZ3JvdXBzO1xuICAgICAgdmFsaWRhdGVQcm90b2NvbChtYXRjaFBhdHRlcm4sIHByb3RvY29sKTtcbiAgICAgIHZhbGlkYXRlSG9zdG5hbWUobWF0Y2hQYXR0ZXJuLCBob3N0bmFtZSk7XG4gICAgICB2YWxpZGF0ZVBhdGhuYW1lKG1hdGNoUGF0dGVybiwgcGF0aG5hbWUpO1xuICAgICAgdGhpcy5wcm90b2NvbE1hdGNoZXMgPSBwcm90b2NvbCA9PT0gXCIqXCIgPyBbXCJodHRwXCIsIFwiaHR0cHNcIl0gOiBbcHJvdG9jb2xdO1xuICAgICAgdGhpcy5ob3N0bmFtZU1hdGNoID0gaG9zdG5hbWU7XG4gICAgICB0aGlzLnBhdGhuYW1lTWF0Y2ggPSBwYXRobmFtZTtcbiAgICB9XG4gIH1cbiAgaW5jbHVkZXModXJsKSB7XG4gICAgaWYgKHRoaXMuaXNBbGxVcmxzKVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgY29uc3QgdSA9IHR5cGVvZiB1cmwgPT09IFwic3RyaW5nXCIgPyBuZXcgVVJMKHVybCkgOiB1cmwgaW5zdGFuY2VvZiBMb2NhdGlvbiA/IG5ldyBVUkwodXJsLmhyZWYpIDogdXJsO1xuICAgIHJldHVybiAhIXRoaXMucHJvdG9jb2xNYXRjaGVzLmZpbmQoKHByb3RvY29sKSA9PiB7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwiaHR0cFwiKVxuICAgICAgICByZXR1cm4gdGhpcy5pc0h0dHBNYXRjaCh1KTtcbiAgICAgIGlmIChwcm90b2NvbCA9PT0gXCJodHRwc1wiKVxuICAgICAgICByZXR1cm4gdGhpcy5pc0h0dHBzTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwiZmlsZVwiKVxuICAgICAgICByZXR1cm4gdGhpcy5pc0ZpbGVNYXRjaCh1KTtcbiAgICAgIGlmIChwcm90b2NvbCA9PT0gXCJmdHBcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNGdHBNYXRjaCh1KTtcbiAgICAgIGlmIChwcm90b2NvbCA9PT0gXCJ1cm5cIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNVcm5NYXRjaCh1KTtcbiAgICB9KTtcbiAgfVxuICBpc0h0dHBNYXRjaCh1cmwpIHtcbiAgICByZXR1cm4gdXJsLnByb3RvY29sID09PSBcImh0dHA6XCIgJiYgdGhpcy5pc0hvc3RQYXRoTWF0Y2godXJsKTtcbiAgfVxuICBpc0h0dHBzTWF0Y2godXJsKSB7XG4gICAgcmV0dXJuIHVybC5wcm90b2NvbCA9PT0gXCJodHRwczpcIiAmJiB0aGlzLmlzSG9zdFBhdGhNYXRjaCh1cmwpO1xuICB9XG4gIGlzSG9zdFBhdGhNYXRjaCh1cmwpIHtcbiAgICBpZiAoIXRoaXMuaG9zdG5hbWVNYXRjaCB8fCAhdGhpcy5wYXRobmFtZU1hdGNoKVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGhvc3RuYW1lTWF0Y2hSZWdleHMgPSBbXG4gICAgICB0aGlzLmNvbnZlcnRQYXR0ZXJuVG9SZWdleCh0aGlzLmhvc3RuYW1lTWF0Y2gpLFxuICAgICAgdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5ob3N0bmFtZU1hdGNoLnJlcGxhY2UoL15cXCpcXC4vLCBcIlwiKSlcbiAgICBdO1xuICAgIGNvbnN0IHBhdGhuYW1lTWF0Y2hSZWdleCA9IHRoaXMuY29udmVydFBhdHRlcm5Ub1JlZ2V4KHRoaXMucGF0aG5hbWVNYXRjaCk7XG4gICAgcmV0dXJuICEhaG9zdG5hbWVNYXRjaFJlZ2V4cy5maW5kKChyZWdleCkgPT4gcmVnZXgudGVzdCh1cmwuaG9zdG5hbWUpKSAmJiBwYXRobmFtZU1hdGNoUmVnZXgudGVzdCh1cmwucGF0aG5hbWUpO1xuICB9XG4gIGlzRmlsZU1hdGNoKHVybCkge1xuICAgIHRocm93IEVycm9yKFwiTm90IGltcGxlbWVudGVkOiBmaWxlOi8vIHBhdHRlcm4gbWF0Y2hpbmcuIE9wZW4gYSBQUiB0byBhZGQgc3VwcG9ydFwiKTtcbiAgfVxuICBpc0Z0cE1hdGNoKHVybCkge1xuICAgIHRocm93IEVycm9yKFwiTm90IGltcGxlbWVudGVkOiBmdHA6Ly8gcGF0dGVybiBtYXRjaGluZy4gT3BlbiBhIFBSIHRvIGFkZCBzdXBwb3J0XCIpO1xuICB9XG4gIGlzVXJuTWF0Y2godXJsKSB7XG4gICAgdGhyb3cgRXJyb3IoXCJOb3QgaW1wbGVtZW50ZWQ6IHVybjovLyBwYXR0ZXJuIG1hdGNoaW5nLiBPcGVuIGEgUFIgdG8gYWRkIHN1cHBvcnRcIik7XG4gIH1cbiAgY29udmVydFBhdHRlcm5Ub1JlZ2V4KHBhdHRlcm4pIHtcbiAgICBjb25zdCBlc2NhcGVkID0gdGhpcy5lc2NhcGVGb3JSZWdleChwYXR0ZXJuKTtcbiAgICBjb25zdCBzdGFyc1JlcGxhY2VkID0gZXNjYXBlZC5yZXBsYWNlKC9cXFxcXFwqL2csIFwiLipcIik7XG4gICAgcmV0dXJuIFJlZ0V4cChgXiR7c3RhcnNSZXBsYWNlZH0kYCk7XG4gIH1cbiAgZXNjYXBlRm9yUmVnZXgoc3RyaW5nKSB7XG4gICAgcmV0dXJuIHN0cmluZy5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgXCJcXFxcJCZcIik7XG4gIH1cbn07XG52YXIgTWF0Y2hQYXR0ZXJuID0gX01hdGNoUGF0dGVybjtcbk1hdGNoUGF0dGVybi5QUk9UT0NPTFMgPSBbXCJodHRwXCIsIFwiaHR0cHNcIiwgXCJmaWxlXCIsIFwiZnRwXCIsIFwidXJuXCJdO1xudmFyIEludmFsaWRNYXRjaFBhdHRlcm4gPSBjbGFzcyBleHRlbmRzIEVycm9yIHtcbiAgY29uc3RydWN0b3IobWF0Y2hQYXR0ZXJuLCByZWFzb24pIHtcbiAgICBzdXBlcihgSW52YWxpZCBtYXRjaCBwYXR0ZXJuIFwiJHttYXRjaFBhdHRlcm59XCI6ICR7cmVhc29ufWApO1xuICB9XG59O1xuZnVuY3Rpb24gdmFsaWRhdGVQcm90b2NvbChtYXRjaFBhdHRlcm4sIHByb3RvY29sKSB7XG4gIGlmICghTWF0Y2hQYXR0ZXJuLlBST1RPQ09MUy5pbmNsdWRlcyhwcm90b2NvbCkgJiYgcHJvdG9jb2wgIT09IFwiKlwiKVxuICAgIHRocm93IG5ldyBJbnZhbGlkTWF0Y2hQYXR0ZXJuKFxuICAgICAgbWF0Y2hQYXR0ZXJuLFxuICAgICAgYCR7cHJvdG9jb2x9IG5vdCBhIHZhbGlkIHByb3RvY29sICgke01hdGNoUGF0dGVybi5QUk9UT0NPTFMuam9pbihcIiwgXCIpfSlgXG4gICAgKTtcbn1cbmZ1bmN0aW9uIHZhbGlkYXRlSG9zdG5hbWUobWF0Y2hQYXR0ZXJuLCBob3N0bmFtZSkge1xuICBpZiAoaG9zdG5hbWUuaW5jbHVkZXMoXCI6XCIpKVxuICAgIHRocm93IG5ldyBJbnZhbGlkTWF0Y2hQYXR0ZXJuKG1hdGNoUGF0dGVybiwgYEhvc3RuYW1lIGNhbm5vdCBpbmNsdWRlIGEgcG9ydGApO1xuICBpZiAoaG9zdG5hbWUuaW5jbHVkZXMoXCIqXCIpICYmIGhvc3RuYW1lLmxlbmd0aCA+IDEgJiYgIWhvc3RuYW1lLnN0YXJ0c1dpdGgoXCIqLlwiKSlcbiAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihcbiAgICAgIG1hdGNoUGF0dGVybixcbiAgICAgIGBJZiB1c2luZyBhIHdpbGRjYXJkICgqKSwgaXQgbXVzdCBnbyBhdCB0aGUgc3RhcnQgb2YgdGhlIGhvc3RuYW1lYFxuICAgICk7XG59XG5mdW5jdGlvbiB2YWxpZGF0ZVBhdGhuYW1lKG1hdGNoUGF0dGVybiwgcGF0aG5hbWUpIHtcbiAgcmV0dXJuO1xufVxuZXhwb3J0IHtcbiAgSW52YWxpZE1hdGNoUGF0dGVybixcbiAgTWF0Y2hQYXR0ZXJuXG59O1xuIiwiaW1wb3J0IHsgc2V0dGluZ3NNYW5hZ2VyIH0gZnJvbSBcIi4vc2V0dGluZ3MtbWFuYWdlclwiO1xuaW1wb3J0IHsgTWVzc2FnZVR5cGUsIGRlZmF1bHRTZXR0aW5ncywgVXBkYXRlU2V0dGluZ3NNZXNzYWdlIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGdldCBob3N0bmFtZSBmcm9tIFVSTFxuZnVuY3Rpb24gZ2V0SG9zdG5hbWUodXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICB0cnkge1xuICAgIHJldHVybiBuZXcgVVJMKHVybCkuaG9zdG5hbWU7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiTWVzc2FnZSBIYW5kbGVyOiBJbnZhbGlkIFVSTDpcIiwgdXJsKTtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVHZXRJbml0aWFsU2V0dGluZ3MoXG4gIG1lc3NhZ2U6IGFueSxcbiAgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyLFxuICBzZW5kUmVzcG9uc2U6IChyZXNwb25zZT86IGFueSkgPT4gdm9pZFxuKSB7XG4gIGNvbnN0IGhvc3RuYW1lID0gbWVzc2FnZS5ob3N0bmFtZSB8fCAoc2VuZGVyLnRhYj8udXJsID8gZ2V0SG9zdG5hbWUoc2VuZGVyLnRhYi51cmwpIDogbnVsbCk7XG5cbiAgaWYgKCFob3N0bmFtZSkge1xuICAgIGNvbnNvbGUud2FybihcIk1lc3NhZ2UgSGFuZGxlcjogR0VUX0lOSVRJQUxfU0VUVElOR1MgcmVjZWl2ZWQgd2l0aG91dCBob3N0bmFtZS5cIik7XG4gICAgc2VuZFJlc3BvbnNlKHsgc2V0dGluZ3M6IHsgLi4uZGVmYXVsdFNldHRpbmdzIH0gfSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBFbnN1cmUgc2V0dGluZ3MgYXJlIGxvYWRlZCBiZWZvcmUgcHJvY2VlZGluZ1xuICAgIGF3YWl0IHNldHRpbmdzTWFuYWdlci5pbml0aWFsaXplKCk7XG4gICAgY29uc29sZS5sb2coYE1lc3NhZ2UgSGFuZGxlcjogR2V0dGluZyBpbml0aWFsIHNldHRpbmdzIGZvciAke2hvc3RuYW1lfWApO1xuXG4gICAgY29uc3Qgc2l0ZUNvbmZpZyA9IHNldHRpbmdzTWFuYWdlci5nZXRTZXR0aW5nc0ZvclNpdGUoaG9zdG5hbWUpO1xuICAgIGNvbnNvbGUubG9nKFxuICAgICAgYFtERUJVR10gTWVzc2FnZSBIYW5kbGVyIChHRVRfSU5JVElBTF9TRVRUSU5HUyk6IFJldHJpZXZlZCBzaXRlQ29uZmlnIGZvciAke2hvc3RuYW1lfTpgLFxuICAgICAgSlNPTi5zdHJpbmdpZnkoc2l0ZUNvbmZpZywgbnVsbCwgMilcbiAgICApO1xuXG4gICAgbGV0IGVmZmVjdGl2ZVNldHRpbmdzOiBhbnk7XG5cbiAgICAvLyBEZXRlcm1pbmUgdGhlIGNvcnJlY3Qgc2V0dGluZ3MgYmFzZWQgb24gc2l0ZSBjb25maWcgYW5kIG1vZGVcbiAgICBpZiAoc2l0ZUNvbmZpZz8uYWN0aXZlU2V0dGluZyA9PT0gXCJzaXRlXCIgJiYgc2l0ZUNvbmZpZy5zZXR0aW5ncykge1xuICAgICAgZWZmZWN0aXZlU2V0dGluZ3MgPSBzaXRlQ29uZmlnLnNldHRpbmdzO1xuICAgIH0gZWxzZSBpZiAoc2l0ZUNvbmZpZz8uYWN0aXZlU2V0dGluZyA9PT0gXCJkaXNhYmxlZFwiKSB7XG4gICAgICAvLyBGb3IgZGlzYWJsZWQsIHNlbmQgZGVmYXVsdCBzZXR0aW5ncyBzbyBhdWRpbyBwcm9jZXNzaW5nIGlzIGJ5cGFzc2VkL25ldXRyYWxcbiAgICAgIGVmZmVjdGl2ZVNldHRpbmdzID0geyAuLi5kZWZhdWx0U2V0dGluZ3MsIHNwZWVkOiAxMDAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXNlIGdsb2JhbCBzZXR0aW5ncyAoZ3VhcmFudGVlZCB0byBiZSBsb2FkZWQgb3IgZGVmYXVsdHMgbm93KVxuICAgICAgZWZmZWN0aXZlU2V0dGluZ3MgPSBzZXR0aW5nc01hbmFnZXIuZ2xvYmFsU2V0dGluZ3M7XG4gICAgfVxuXG4gICAgY29uc29sZS5sb2coXG4gICAgICBgTWVzc2FnZSBIYW5kbGVyOiBTZW5kaW5nIGluaXRpYWwgc2V0dGluZ3MgZm9yICR7aG9zdG5hbWV9IHRvIHRhYiAke3NlbmRlci50YWI/LmlkfTpgLFxuICAgICAgZWZmZWN0aXZlU2V0dGluZ3NcbiAgICApO1xuICAgIHNlbmRSZXNwb25zZSh7IHNldHRpbmdzOiB7IC4uLmVmZmVjdGl2ZVNldHRpbmdzIH0gfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgIGBNZXNzYWdlIEhhbmRsZXI6IEVycm9yIHByb2Nlc3NpbmcgR0VUX0lOSVRJQUxfU0VUVElOR1MgZm9yICR7aG9zdG5hbWV9OmAsXG4gICAgICBlcnJvclxuICAgICk7XG4gICAgLy8gU2VuZCBkZWZhdWx0cyBvbiBlcnJvclxuICAgIHNlbmRSZXNwb25zZSh7IHNldHRpbmdzOiB7IC4uLmRlZmF1bHRTZXR0aW5ncywgc3BlZWQ6IDEwMCB9IH0pO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVVwZGF0ZVNldHRpbmdzKFxuICBtZXNzYWdlOiBVcGRhdGVTZXR0aW5nc01lc3NhZ2UsXG4gIHNlbmRlcjogY2hyb21lLnJ1bnRpbWUuTWVzc2FnZVNlbmRlcixcbiAgc2VuZFJlc3BvbnNlOiAocmVzcG9uc2U/OiBhbnkpID0+IHZvaWRcbikge1xuICB0cnkge1xuICAgIC8vIElmIHNlbmRlciBpcyBwb3B1cCAobm8gdGFiKSwgZ2V0IGFjdGl2ZSB0YWIgaW5mb1xuICAgIGxldCB0YXJnZXRUYWJJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuICAgIGxldCB0YXJnZXRVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBsZXQgaG9zdG5hbWU6IHN0cmluZztcblxuICAgIGlmICghc2VuZGVyLnRhYikge1xuICAgICAgLy8gTWVzc2FnZSBmcm9tIHBvcHVwIC0gZ2V0IGFjdGl2ZSB0YWJcbiAgICAgIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7XG4gICAgICAgIGFjdGl2ZTogdHJ1ZSxcbiAgICAgICAgY3VycmVudFdpbmRvdzogdHJ1ZSxcbiAgICAgIH0pO1xuICAgICAgaWYgKCF0YWJzWzBdPy51cmwgfHwgIXRhYnNbMF0/LmlkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vIGFjdGl2ZSB0YWIgZm91bmRcIik7XG4gICAgICB9XG4gICAgICB0YXJnZXRUYWJJZCA9IHRhYnNbMF0uaWQ7XG4gICAgICB0YXJnZXRVcmwgPSB0YWJzWzBdLnVybDtcbiAgICAgIGhvc3RuYW1lID0gZ2V0SG9zdG5hbWUodGFyZ2V0VXJsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gTWVzc2FnZSBmcm9tIGNvbnRlbnQgc2NyaXB0XG4gICAgICBpZiAoIXNlbmRlci50YWIudXJsIHx8ICFzZW5kZXIudGFiLmlkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgc2VuZGVyIHRhYlwiKTtcbiAgICAgIH1cbiAgICAgIHRhcmdldFRhYklkID0gc2VuZGVyLnRhYi5pZDtcbiAgICAgIHRhcmdldFVybCA9IHNlbmRlci50YWIudXJsO1xuICAgICAgaG9zdG5hbWUgPSBnZXRIb3N0bmFtZSh0YXJnZXRVcmwpO1xuICAgIH1cblxuICAgIGNvbnNvbGUubG9nKFwiTWVzc2FnZSBIYW5kbGVyOiBQcm9jZXNzaW5nIHVwZGF0ZSBmb3JcIiwge1xuICAgICAgaG9zdG5hbWUsXG4gICAgICB0YWJJZDogdGFyZ2V0VGFiSWQsXG4gICAgICBpc1BvcHVwOiAhc2VuZGVyLnRhYixcbiAgICAgIHNldHRpbmdzOiBtZXNzYWdlLnNldHRpbmdzLFxuICAgIH0pO1xuXG4gICAgLy8gR2V0IGN1cnJlbnQgc2l0ZSBjb25maWcgKHN5bmNocm9ub3VzIG1ldGhvZClcbiAgICBjb25zdCBjdXJyZW50U2l0ZUNvbmZpZyA9IHNldHRpbmdzTWFuYWdlci5nZXRTZXR0aW5nc0ZvclNpdGUoaG9zdG5hbWUpO1xuICAgIGNvbnN0IGlzQ3VycmVudGx5R2xvYmFsID0gY3VycmVudFNpdGVDb25maWc/LmFjdGl2ZVNldHRpbmcgPT09IFwiZ2xvYmFsXCI7XG5cbiAgICBpZiAoIW1lc3NhZ2UuZW5hYmxlZCkge1xuICAgICAgYXdhaXQgc2V0dGluZ3NNYW5hZ2VyLmRpc2FibGVTaXRlKGhvc3RuYW1lLCB0YXJnZXRUYWJJZCk7XG4gICAgICByZXR1cm4gc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICBpZiAoIW1lc3NhZ2Uuc2V0dGluZ3MpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vIHNldHRpbmdzIHByb3ZpZGVkXCIpO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBzZXR0aW5ncyBiYXNlZCBvbiBtb2RlXG4gICAgaWYgKG1lc3NhZ2UuaXNHbG9iYWwgfHwgaXNDdXJyZW50bHlHbG9iYWwpIHtcbiAgICAgIGF3YWl0IHNldHRpbmdzTWFuYWdlci51cGRhdGVHbG9iYWxTZXR0aW5ncyhcbiAgICAgICAgbWVzc2FnZS5zZXR0aW5ncyxcbiAgICAgICAgdGFyZ2V0VGFiSWQsXG4gICAgICAgIGhvc3RuYW1lXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBhd2FpdCBzZXR0aW5nc01hbmFnZXIudXBkYXRlU2l0ZVNldHRpbmdzKFxuICAgICAgICBob3N0bmFtZSxcbiAgICAgICAgbWVzc2FnZS5zZXR0aW5ncyxcbiAgICAgICAgdGFyZ2V0VGFiSWRcbiAgICAgICk7XG4gICAgfVxuXG4gICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiTWVzc2FnZSBIYW5kbGVyOiBFcnJvciBwcm9jZXNzaW5nIHVwZGF0ZVwiLCBlcnJvcik7XG4gICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVVwZGF0ZVNpdGVNb2RlKFxuICBtZXNzYWdlOiBhbnksXG4gIHNlbmRlcjogY2hyb21lLnJ1bnRpbWUuTWVzc2FnZVNlbmRlcixcbiAgc2VuZFJlc3BvbnNlOiAocmVzcG9uc2U/OiBhbnkpID0+IHZvaWRcbikge1xuICBjb25zdCB7IGhvc3RuYW1lLCBtb2RlIH0gPSBtZXNzYWdlO1xuICBjb25zdCB0YWJJZCA9IHNlbmRlci50YWI/LmlkO1xuXG4gIC8vIFZhbGlkYXRlIGlucHV0c1xuICBpZiAoIWhvc3RuYW1lKSB7XG4gICAgY29uc3QgZXJyb3IgPSBcIk5vIGhvc3RuYW1lIHByb3ZpZGVkIGZvciBzaXRlIG1vZGUgdXBkYXRlXCI7XG4gICAgY29uc29sZS5lcnJvcihcIk1lc3NhZ2UgSGFuZGxlcjpcIiwgZXJyb3IpO1xuICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvciB9KTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAobW9kZSAhPT0gXCJnbG9iYWxcIiAmJiBtb2RlICE9PSBcInNpdGVcIiAmJiBtb2RlICE9PSBcImRpc2FibGVkXCIpIHtcbiAgICBjb25zdCBlcnJvciA9IGBJbnZhbGlkIG1vZGUgcHJvdmlkZWQ6ICR7bW9kZX1gO1xuICAgIGNvbnNvbGUuZXJyb3IoXCJNZXNzYWdlIEhhbmRsZXI6XCIsIGVycm9yKTtcbiAgICBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3IgfSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgeyBzZXR0aW5nc1RvVXNlLCBzaXRlQ29uZmlnIH0gPSBhd2FpdCBzZXR0aW5nc01hbmFnZXIudXBkYXRlU2l0ZU1vZGUoXG4gICAgaG9zdG5hbWUsXG4gICAgbW9kZSxcbiAgICB0YWJJZFxuICApO1xuXG4gIC8vIEJyb2FkY2FzdCBzZXR0aW5ncyB0byB0aGUgdGFiXG4gIGlmICh0YWJJZCkge1xuICAgIGF3YWl0IGNocm9tZS50YWJzLnNlbmRNZXNzYWdlKHRhYklkLCB7XG4gICAgICB0eXBlOiBcIlVQREFURV9TRVRUSU5HU1wiLFxuICAgICAgc2V0dGluZ3M6IHNldHRpbmdzVG9Vc2UsXG4gICAgICBpc0dsb2JhbDogbW9kZSA9PT0gXCJnbG9iYWxcIixcbiAgICB9KTtcbiAgfVxuXG4gIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUNvbnRlbnRTY3JpcHRSZWFkeShcbiAgbWVzc2FnZTogYW55LFxuICBzZW5kZXI6IGNocm9tZS5ydW50aW1lLk1lc3NhZ2VTZW5kZXIsXG4gIHNlbmRSZXNwb25zZTogKHJlc3BvbnNlPzogYW55KSA9PiB2b2lkXG4pIHtcbiAgdHJ5IHtcbiAgICBpZiAoIXNlbmRlci50YWI/LmlkIHx8ICFzZW5kZXIudGFiPy51cmwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgc2VuZGVyIHRhYlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBob3N0bmFtZSA9IG1lc3NhZ2UuaG9zdG5hbWUgfHwgZ2V0SG9zdG5hbWUoc2VuZGVyLnRhYi51cmwpO1xuICAgIGNvbnN0IHNpdGVDb25maWcgPSBzZXR0aW5nc01hbmFnZXIuZ2V0U2V0dGluZ3NGb3JTaXRlKGhvc3RuYW1lKTtcblxuICAgIGNvbnN0IHNldHRpbmdzVG9TZW5kID0gc2l0ZUNvbmZpZz8uc2V0dGluZ3MgfHwgZGVmYXVsdFNldHRpbmdzO1xuICAgIGNvbnN0IGlzR2xvYmFsID0gc2l0ZUNvbmZpZz8uYWN0aXZlU2V0dGluZyA9PT0gXCJnbG9iYWxcIjtcbiAgICBjb25zdCBpc0VuYWJsZWQgPSBzaXRlQ29uZmlnPy5lbmFibGVkID8/IHRydWU7XG5cbiAgICBhd2FpdCBjaHJvbWUudGFicy5zZW5kTWVzc2FnZShzZW5kZXIudGFiLmlkLCB7XG4gICAgICB0eXBlOiBcIlVQREFURV9TRVRUSU5HU1wiLFxuICAgICAgc2V0dGluZ3M6IHNldHRpbmdzVG9TZW5kLFxuICAgICAgaXNHbG9iYWwsXG4gICAgICBlbmFibGVkOiBpc0VuYWJsZWQsXG4gICAgICBob3N0bmFtZSxcbiAgICB9IGFzIE1lc3NhZ2VUeXBlKTtcblxuICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgIFwiTWVzc2FnZSBIYW5kbGVyOiBFcnJvciBoYW5kbGluZyBjb250ZW50IHNjcmlwdCByZWFkeVwiLFxuICAgICAgZXJyb3JcbiAgICApO1xuICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0dXBNZXNzYWdlSGFuZGxlcigpIHtcbiAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKFxuICAgIChtZXNzYWdlOiBNZXNzYWdlVHlwZSwgc2VuZGVyLCBzZW5kUmVzcG9uc2UpID0+IHtcbiAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICBcIk1lc3NhZ2UgSGFuZGxlcjogUmVjZWl2ZWQgbWVzc2FnZTpcIixcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgXCJmcm9tIHRhYjpcIixcbiAgICAgICAgc2VuZGVyLnRhYj8uaWQsXG4gICAgICAgIHNlbmRlcixcbiAgICAgICAgXCJzZW5kZXIgdHlwZTpcIixcbiAgICAgICAgc2VuZGVyLmRvY3VtZW50SWQgPyBcImNvbnRlbnRcIiA6IFwicG9wdXBcIlxuICAgICAgKTtcblxuICAgICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBpZiAobWVzc2FnZS50eXBlID09PSBcIkdFVF9JTklUSUFMX1NFVFRJTkdTXCIpIHtcbiAgICAgICAgICAgIGF3YWl0IGhhbmRsZUdldEluaXRpYWxTZXR0aW5ncyhtZXNzYWdlLCBzZW5kZXIsIHNlbmRSZXNwb25zZSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChtZXNzYWdlLnR5cGUgPT09IFwiVVBEQVRFX1NFVFRJTkdTXCIpIHtcbiAgICAgICAgICAgIGF3YWl0IGhhbmRsZVVwZGF0ZVNldHRpbmdzKG1lc3NhZ2UsIHNlbmRlciwgc2VuZFJlc3BvbnNlKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1lc3NhZ2UudHlwZSA9PT0gXCJVUERBVEVfU0lURV9NT0RFXCIpIHtcbiAgICAgICAgICAgIGF3YWl0IGhhbmRsZVVwZGF0ZVNpdGVNb2RlKG1lc3NhZ2UsIHNlbmRlciwgc2VuZFJlc3BvbnNlKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1lc3NhZ2UudHlwZSA9PT0gXCJDT05URU5UX1NDUklQVF9SRUFEWVwiKSB7XG4gICAgICAgICAgICBhd2FpdCBoYW5kbGVDb250ZW50U2NyaXB0UmVhZHkobWVzc2FnZSwgc2VuZGVyLCBzZW5kUmVzcG9uc2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zdCBlcnJvck1zZyA9XG4gICAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcIk1lc3NhZ2UgSGFuZGxlcjogRXJyb3IgcHJvY2Vzc2luZyBtZXNzYWdlOlwiLCB7XG4gICAgICAgICAgICBlcnJvcjogZXJyb3JNc2csXG4gICAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgICAgc3RhY2s6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5zdGFjayA6IHVuZGVmaW5lZCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yTXNnIH0pO1xuICAgICAgICB9XG4gICAgICB9KSgpO1xuXG4gICAgICByZXR1cm4gdHJ1ZTsgLy8gS2VlcCB0aGUgbWVzc2FnZSBjaGFubmVsIG9wZW4gZm9yIGFzeW5jIHJlc3BvbnNlXG4gICAgfVxuICApO1xufVxuIiwiaW1wb3J0IHsgc2V0dGluZ3NNYW5hZ2VyIH0gZnJvbSBcIi4uL3NyYy9zZXR0aW5ncy1tYW5hZ2VyXCI7XG5pbXBvcnQgeyBkZWZhdWx0U2V0dGluZ3MgfSBmcm9tIFwiLi4vc3JjL3R5cGVzXCI7XG5pbXBvcnQgeyBkZWZpbmVCYWNrZ3JvdW5kIH0gZnJvbSBcInd4dC9zYW5kYm94XCI7XG5pbXBvcnQgeyBzZXR1cE1lc3NhZ2VIYW5kbGVyIH0gZnJvbSBcIi4uL3NyYy9tZXNzYWdlLWhhbmRsZXJcIjtcbmltcG9ydCB7IHNldHVwU2V0dGluZ3NFdmVudEhhbmRsZXIgfSBmcm9tIFwiLi4vc3JjL3NldHRpbmdzLWV2ZW50LWhhbmRsZXJcIjtcblxuLy8gSW5pdGlhbGl6ZSBzZXR0aW5ncyBvbiBleHRlbnNpb24gc3RhcnR1cCBvciBmaXJzdCBpbnN0YWxsXG5jaHJvbWUucnVudGltZS5vbkluc3RhbGxlZC5hZGRMaXN0ZW5lcihhc3luYyAoKSA9PiB7XG4gIGNvbnNvbGUubG9nKFxuICAgIFwiQmFja2dyb3VuZDogb25JbnN0YWxsZWQgZXZlbnQgdHJpZ2dlcmVkLiBJbml0aWFsaXppbmcgc2V0dGluZ3MuLi5cIlxuICApO1xuICBhd2FpdCBzZXR0aW5nc01hbmFnZXIuaW5pdGlhbGl6ZSgpO1xuICBjb25zb2xlLmxvZyhcIkJhY2tncm91bmQ6IFNldHRpbmdzIGluaXRpYWxpemVkIHZpYSBvbkluc3RhbGxlZC5cIik7XG59KTtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQmFja2dyb3VuZCgoKSA9PiB7XG4gIGNvbnNvbGUubG9nKFwiQmFja2dyb3VuZDogU2NyaXB0IGV4ZWN1dGluZy5cIik7XG5cbiAgLy8gSW5pdGlhbGl6ZSBzZXR0aW5ncyBtYW5hZ2VyIChmaXJlLWFuZC1mb3JnZXQsIGhhbmRsZXMgaXRzIG93biBlcnJvcnMpXG4gIC8vIFRoaXMgZW5zdXJlcyBpdCBzdGFydHMgbG9hZGluZyBBU0FQLiBMaXN0ZW5lcnMgYmVsb3cgbWlnaHQgaW5pdGlhbGx5IGdldCBkZWZhdWx0cy5cbiAgc2V0dGluZ3NNYW5hZ2VyXG4gICAgLmluaXRpYWxpemUoKVxuICAgIC5jYXRjaCgoZXJyKSA9PlxuICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgXCJCYWNrZ3JvdW5kOiBJbml0aWFsIHNldHRpbmdzTWFuYWdlci5pbml0aWFsaXplKCkgZmFpbGVkOlwiLFxuICAgICAgICBlcnJcbiAgICAgIClcbiAgICApO1xuXG4gIC8vIFNldCB1cCBsaXN0ZW5lcnMgd2l0aGluIHRoZSBkZWZpbmVCYWNrZ3JvdW5kIGNvbnRleHRcbiAgLy8gVGhpcyBtaWdodCBoZWxwIGVuc3VyZSB0aGV5IGFyZSBjb3JyZWN0bHkgYXR0YWNoZWQvcmVhdHRhY2hlZCBkdXJpbmcgcmVsb2Fkcy5cbiAgc2V0dXBNZXNzYWdlSGFuZGxlcigpO1xuICBzZXR1cFNldHRpbmdzRXZlbnRIYW5kbGVyKCk7IC8vIEVuc3VyZSB0aGlzIHJ1bnMgd2l0aGluIHRoZSBkZWZpbmVkIGNvbnRleHRcblxuICBjb25zb2xlLmxvZyhcIkJhY2tncm91bmQ6IE1haW4gZXhlY3V0aW9uIGZpbmlzaGVkLCBsaXN0ZW5lcnMgc2V0IHVwLlwiKTtcbn0pO1xuIiwiKGZ1bmN0aW9uIChnbG9iYWwsIGZhY3RvcnkpIHtcbiAgaWYgKHR5cGVvZiBkZWZpbmUgPT09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kKSB7XG4gICAgZGVmaW5lKFwid2ViZXh0ZW5zaW9uLXBvbHlmaWxsXCIsIFtcIm1vZHVsZVwiXSwgZmFjdG9yeSk7XG4gIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICBmYWN0b3J5KG1vZHVsZSk7XG4gIH0gZWxzZSB7XG4gICAgdmFyIG1vZCA9IHtcbiAgICAgIGV4cG9ydHM6IHt9XG4gICAgfTtcbiAgICBmYWN0b3J5KG1vZCk7XG4gICAgZ2xvYmFsLmJyb3dzZXIgPSBtb2QuZXhwb3J0cztcbiAgfVxufSkodHlwZW9mIGdsb2JhbFRoaXMgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxUaGlzIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdGhpcywgZnVuY3Rpb24gKG1vZHVsZSkge1xuICAvKiB3ZWJleHRlbnNpb24tcG9seWZpbGwgLSB2MC4xMi4wIC0gVHVlIE1heSAxNCAyMDI0IDE4OjAxOjI5ICovXG4gIC8qIC0qLSBNb2RlOiBpbmRlbnQtdGFicy1tb2RlOiBuaWw7IGpzLWluZGVudC1sZXZlbDogMiAtKi0gKi9cbiAgLyogdmltOiBzZXQgc3RzPTIgc3c9MiBldCB0dz04MDogKi9cbiAgLyogVGhpcyBTb3VyY2UgQ29kZSBGb3JtIGlzIHN1YmplY3QgdG8gdGhlIHRlcm1zIG9mIHRoZSBNb3ppbGxhIFB1YmxpY1xuICAgKiBMaWNlbnNlLCB2LiAyLjAuIElmIGEgY29weSBvZiB0aGUgTVBMIHdhcyBub3QgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzXG4gICAqIGZpbGUsIFlvdSBjYW4gb2J0YWluIG9uZSBhdCBodHRwOi8vbW96aWxsYS5vcmcvTVBMLzIuMC8uICovXG4gIFwidXNlIHN0cmljdFwiO1xuXG4gIGlmICghKGdsb2JhbFRoaXMuY2hyb21lICYmIGdsb2JhbFRoaXMuY2hyb21lLnJ1bnRpbWUgJiYgZ2xvYmFsVGhpcy5jaHJvbWUucnVudGltZS5pZCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGlzIHNjcmlwdCBzaG91bGQgb25seSBiZSBsb2FkZWQgaW4gYSBicm93c2VyIGV4dGVuc2lvbi5cIik7XG4gIH1cbiAgaWYgKCEoZ2xvYmFsVGhpcy5icm93c2VyICYmIGdsb2JhbFRoaXMuYnJvd3Nlci5ydW50aW1lICYmIGdsb2JhbFRoaXMuYnJvd3Nlci5ydW50aW1lLmlkKSkge1xuICAgIGNvbnN0IENIUk9NRV9TRU5EX01FU1NBR0VfQ0FMTEJBQ0tfTk9fUkVTUE9OU0VfTUVTU0FHRSA9IFwiVGhlIG1lc3NhZ2UgcG9ydCBjbG9zZWQgYmVmb3JlIGEgcmVzcG9uc2Ugd2FzIHJlY2VpdmVkLlwiO1xuXG4gICAgLy8gV3JhcHBpbmcgdGhlIGJ1bGsgb2YgdGhpcyBwb2x5ZmlsbCBpbiBhIG9uZS10aW1lLXVzZSBmdW5jdGlvbiBpcyBhIG1pbm9yXG4gICAgLy8gb3B0aW1pemF0aW9uIGZvciBGaXJlZm94LiBTaW5jZSBTcGlkZXJtb25rZXkgZG9lcyBub3QgZnVsbHkgcGFyc2UgdGhlXG4gICAgLy8gY29udGVudHMgb2YgYSBmdW5jdGlvbiB1bnRpbCB0aGUgZmlyc3QgdGltZSBpdCdzIGNhbGxlZCwgYW5kIHNpbmNlIGl0IHdpbGxcbiAgICAvLyBuZXZlciBhY3R1YWxseSBuZWVkIHRvIGJlIGNhbGxlZCwgdGhpcyBhbGxvd3MgdGhlIHBvbHlmaWxsIHRvIGJlIGluY2x1ZGVkXG4gICAgLy8gaW4gRmlyZWZveCBuZWFybHkgZm9yIGZyZWUuXG4gICAgY29uc3Qgd3JhcEFQSXMgPSBleHRlbnNpb25BUElzID0+IHtcbiAgICAgIC8vIE5PVEU6IGFwaU1ldGFkYXRhIGlzIGFzc29jaWF0ZWQgdG8gdGhlIGNvbnRlbnQgb2YgdGhlIGFwaS1tZXRhZGF0YS5qc29uIGZpbGVcbiAgICAgIC8vIGF0IGJ1aWxkIHRpbWUgYnkgcmVwbGFjaW5nIHRoZSBmb2xsb3dpbmcgXCJpbmNsdWRlXCIgd2l0aCB0aGUgY29udGVudCBvZiB0aGVcbiAgICAgIC8vIEpTT04gZmlsZS5cbiAgICAgIGNvbnN0IGFwaU1ldGFkYXRhID0ge1xuICAgICAgICBcImFsYXJtc1wiOiB7XG4gICAgICAgICAgXCJjbGVhclwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImNsZWFyQWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYm9va21hcmtzXCI6IHtcbiAgICAgICAgICBcImNyZWF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldENoaWxkcmVuXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0UmVjZW50XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0U3ViVHJlZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFRyZWVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlVHJlZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNlYXJjaFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInVwZGF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImJyb3dzZXJBY3Rpb25cIjoge1xuICAgICAgICAgIFwiZGlzYWJsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImVuYWJsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEJhZGdlQmFja2dyb3VuZENvbG9yXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QmFkZ2VUZXh0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0UG9wdXBcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRUaXRsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm9wZW5Qb3B1cFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldEJhZGdlQmFja2dyb3VuZENvbG9yXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0QmFkZ2VUZXh0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0SWNvblwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFBvcHVwXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0VGl0bGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJicm93c2luZ0RhdGFcIjoge1xuICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlQ2FjaGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVDb29raWVzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlRG93bmxvYWRzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlRm9ybURhdGFcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVIaXN0b3J5XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlTG9jYWxTdG9yYWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlUGFzc3dvcmRzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlUGx1Z2luRGF0YVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldHRpbmdzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY29tbWFuZHNcIjoge1xuICAgICAgICAgIFwiZ2V0QWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiY29udGV4dE1lbnVzXCI6IHtcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInVwZGF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNvb2tpZXNcIjoge1xuICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWxsQ29va2llU3RvcmVzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiZGV2dG9vbHNcIjoge1xuICAgICAgICAgIFwiaW5zcGVjdGVkV2luZG93XCI6IHtcbiAgICAgICAgICAgIFwiZXZhbFwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMixcbiAgICAgICAgICAgICAgXCJzaW5nbGVDYWxsYmFja0FyZ1wiOiBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJwYW5lbHNcIjoge1xuICAgICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMyxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDMsXG4gICAgICAgICAgICAgIFwic2luZ2xlQ2FsbGJhY2tBcmdcIjogdHJ1ZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiZWxlbWVudHNcIjoge1xuICAgICAgICAgICAgICBcImNyZWF0ZVNpZGViYXJQYW5lXCI6IHtcbiAgICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImRvd25sb2Fkc1wiOiB7XG4gICAgICAgICAgXCJjYW5jZWxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkb3dubG9hZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImVyYXNlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0RmlsZUljb25cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJvcGVuXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicGF1c2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVGaWxlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVzdW1lXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2VhcmNoXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2hvd1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImV4dGVuc2lvblwiOiB7XG4gICAgICAgICAgXCJpc0FsbG93ZWRGaWxlU2NoZW1lQWNjZXNzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiaXNBbGxvd2VkSW5jb2duaXRvQWNjZXNzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiaGlzdG9yeVwiOiB7XG4gICAgICAgICAgXCJhZGRVcmxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkZWxldGVBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkZWxldGVSYW5nZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRlbGV0ZVVybFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFZpc2l0c1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNlYXJjaFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImkxOG5cIjoge1xuICAgICAgICAgIFwiZGV0ZWN0TGFuZ3VhZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBY2NlcHRMYW5ndWFnZXNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJpZGVudGl0eVwiOiB7XG4gICAgICAgICAgXCJsYXVuY2hXZWJBdXRoRmxvd1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImlkbGVcIjoge1xuICAgICAgICAgIFwicXVlcnlTdGF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcIm1hbmFnZW1lbnRcIjoge1xuICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0U2VsZlwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldEVuYWJsZWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1bmluc3RhbGxTZWxmXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwibm90aWZpY2F0aW9uc1wiOiB7XG4gICAgICAgICAgXCJjbGVhclwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImNyZWF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFBlcm1pc3Npb25MZXZlbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInVwZGF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInBhZ2VBY3Rpb25cIjoge1xuICAgICAgICAgIFwiZ2V0UG9wdXBcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRUaXRsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRJY29uXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0UG9wdXBcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRUaXRsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNob3dcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJwZXJtaXNzaW9uc1wiOiB7XG4gICAgICAgICAgXCJjb250YWluc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlcXVlc3RcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJydW50aW1lXCI6IHtcbiAgICAgICAgICBcImdldEJhY2tncm91bmRQYWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0UGxhdGZvcm1JbmZvXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwib3Blbk9wdGlvbnNQYWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVxdWVzdFVwZGF0ZUNoZWNrXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2VuZE1lc3NhZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogM1xuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZW5kTmF0aXZlTWVzc2FnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFVuaW5zdGFsbFVSTFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInNlc3Npb25zXCI6IHtcbiAgICAgICAgICBcImdldERldmljZXNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRSZWNlbnRseUNsb3NlZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlc3RvcmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzdG9yYWdlXCI6IHtcbiAgICAgICAgICBcImxvY2FsXCI6IHtcbiAgICAgICAgICAgIFwiY2xlYXJcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiZ2V0Qnl0ZXNJblVzZVwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJzZXRcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibWFuYWdlZFwiOiB7XG4gICAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiZ2V0Qnl0ZXNJblVzZVwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzeW5jXCI6IHtcbiAgICAgICAgICAgIFwiY2xlYXJcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiZ2V0Qnl0ZXNJblVzZVwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwicmVtb3ZlXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJzZXRcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwidGFic1wiOiB7XG4gICAgICAgICAgXCJjYXB0dXJlVmlzaWJsZVRhYlwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImNyZWF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRldGVjdExhbmd1YWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZGlzY2FyZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImR1cGxpY2F0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImV4ZWN1dGVTY3JpcHRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRDdXJyZW50XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0Wm9vbVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFpvb21TZXR0aW5nc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdvQmFja1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdvRm9yd2FyZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImhpZ2hsaWdodFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImluc2VydENTU1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJxdWVyeVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbG9hZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUNTU1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNlbmRNZXNzYWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDNcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0Wm9vbVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFpvb21TZXR0aW5nc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInVwZGF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInRvcFNpdGVzXCI6IHtcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcIndlYk5hdmlnYXRpb25cIjoge1xuICAgICAgICAgIFwiZ2V0QWxsRnJhbWVzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0RnJhbWVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJ3ZWJSZXF1ZXN0XCI6IHtcbiAgICAgICAgICBcImhhbmRsZXJCZWhhdmlvckNoYW5nZWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJ3aW5kb3dzXCI6IHtcbiAgICAgICAgICBcImNyZWF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEN1cnJlbnRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRMYXN0Rm9jdXNlZFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInVwZGF0ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgaWYgKE9iamVjdC5rZXlzKGFwaU1ldGFkYXRhKS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiYXBpLW1ldGFkYXRhLmpzb24gaGFzIG5vdCBiZWVuIGluY2x1ZGVkIGluIGJyb3dzZXItcG9seWZpbGxcIik7XG4gICAgICB9XG5cbiAgICAgIC8qKlxuICAgICAgICogQSBXZWFrTWFwIHN1YmNsYXNzIHdoaWNoIGNyZWF0ZXMgYW5kIHN0b3JlcyBhIHZhbHVlIGZvciBhbnkga2V5IHdoaWNoIGRvZXNcbiAgICAgICAqIG5vdCBleGlzdCB3aGVuIGFjY2Vzc2VkLCBidXQgYmVoYXZlcyBleGFjdGx5IGFzIGFuIG9yZGluYXJ5IFdlYWtNYXBcbiAgICAgICAqIG90aGVyd2lzZS5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBjcmVhdGVJdGVtXG4gICAgICAgKiAgICAgICAgQSBmdW5jdGlvbiB3aGljaCB3aWxsIGJlIGNhbGxlZCBpbiBvcmRlciB0byBjcmVhdGUgdGhlIHZhbHVlIGZvciBhbnlcbiAgICAgICAqICAgICAgICBrZXkgd2hpY2ggZG9lcyBub3QgZXhpc3QsIHRoZSBmaXJzdCB0aW1lIGl0IGlzIGFjY2Vzc2VkLiBUaGVcbiAgICAgICAqICAgICAgICBmdW5jdGlvbiByZWNlaXZlcywgYXMgaXRzIG9ubHkgYXJndW1lbnQsIHRoZSBrZXkgYmVpbmcgY3JlYXRlZC5cbiAgICAgICAqL1xuICAgICAgY2xhc3MgRGVmYXVsdFdlYWtNYXAgZXh0ZW5kcyBXZWFrTWFwIHtcbiAgICAgICAgY29uc3RydWN0b3IoY3JlYXRlSXRlbSwgaXRlbXMgPSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBzdXBlcihpdGVtcyk7XG4gICAgICAgICAgdGhpcy5jcmVhdGVJdGVtID0gY3JlYXRlSXRlbTtcbiAgICAgICAgfVxuICAgICAgICBnZXQoa2V5KSB7XG4gICAgICAgICAgaWYgKCF0aGlzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgICB0aGlzLnNldChrZXksIHRoaXMuY3JlYXRlSXRlbShrZXkpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHN1cGVyLmdldChrZXkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIC8qKlxuICAgICAgICogUmV0dXJucyB0cnVlIGlmIHRoZSBnaXZlbiBvYmplY3QgaXMgYW4gb2JqZWN0IHdpdGggYSBgdGhlbmAgbWV0aG9kLCBhbmQgY2FuXG4gICAgICAgKiB0aGVyZWZvcmUgYmUgYXNzdW1lZCB0byBiZWhhdmUgYXMgYSBQcm9taXNlLlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIHZhbHVlIHRvIHRlc3QuXG4gICAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn0gVHJ1ZSBpZiB0aGUgdmFsdWUgaXMgdGhlbmFibGUuXG4gICAgICAgKi9cbiAgICAgIGNvbnN0IGlzVGhlbmFibGUgPSB2YWx1ZSA9PiB7XG4gICAgICAgIHJldHVybiB2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIHZhbHVlLnRoZW4gPT09IFwiZnVuY3Rpb25cIjtcbiAgICAgIH07XG5cbiAgICAgIC8qKlxuICAgICAgICogQ3JlYXRlcyBhbmQgcmV0dXJucyBhIGZ1bmN0aW9uIHdoaWNoLCB3aGVuIGNhbGxlZCwgd2lsbCByZXNvbHZlIG9yIHJlamVjdFxuICAgICAgICogdGhlIGdpdmVuIHByb21pc2UgYmFzZWQgb24gaG93IGl0IGlzIGNhbGxlZDpcbiAgICAgICAqXG4gICAgICAgKiAtIElmLCB3aGVuIGNhbGxlZCwgYGNocm9tZS5ydW50aW1lLmxhc3RFcnJvcmAgY29udGFpbnMgYSBub24tbnVsbCBvYmplY3QsXG4gICAgICAgKiAgIHRoZSBwcm9taXNlIGlzIHJlamVjdGVkIHdpdGggdGhhdCB2YWx1ZS5cbiAgICAgICAqIC0gSWYgdGhlIGZ1bmN0aW9uIGlzIGNhbGxlZCB3aXRoIGV4YWN0bHkgb25lIGFyZ3VtZW50LCB0aGUgcHJvbWlzZSBpc1xuICAgICAgICogICByZXNvbHZlZCB0byB0aGF0IHZhbHVlLlxuICAgICAgICogLSBPdGhlcndpc2UsIHRoZSBwcm9taXNlIGlzIHJlc29sdmVkIHRvIGFuIGFycmF5IGNvbnRhaW5pbmcgYWxsIG9mIHRoZVxuICAgICAgICogICBmdW5jdGlvbidzIGFyZ3VtZW50cy5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gcHJvbWlzZVxuICAgICAgICogICAgICAgIEFuIG9iamVjdCBjb250YWluaW5nIHRoZSByZXNvbHV0aW9uIGFuZCByZWplY3Rpb24gZnVuY3Rpb25zIG9mIGFcbiAgICAgICAqICAgICAgICBwcm9taXNlLlxuICAgICAgICogQHBhcmFtIHtmdW5jdGlvbn0gcHJvbWlzZS5yZXNvbHZlXG4gICAgICAgKiAgICAgICAgVGhlIHByb21pc2UncyByZXNvbHV0aW9uIGZ1bmN0aW9uLlxuICAgICAgICogQHBhcmFtIHtmdW5jdGlvbn0gcHJvbWlzZS5yZWplY3RcbiAgICAgICAqICAgICAgICBUaGUgcHJvbWlzZSdzIHJlamVjdGlvbiBmdW5jdGlvbi5cbiAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSBtZXRhZGF0YVxuICAgICAgICogICAgICAgIE1ldGFkYXRhIGFib3V0IHRoZSB3cmFwcGVkIG1ldGhvZCB3aGljaCBoYXMgY3JlYXRlZCB0aGUgY2FsbGJhY2suXG4gICAgICAgKiBAcGFyYW0ge2Jvb2xlYW59IG1ldGFkYXRhLnNpbmdsZUNhbGxiYWNrQXJnXG4gICAgICAgKiAgICAgICAgV2hldGhlciBvciBub3QgdGhlIHByb21pc2UgaXMgcmVzb2x2ZWQgd2l0aCBvbmx5IHRoZSBmaXJzdFxuICAgICAgICogICAgICAgIGFyZ3VtZW50IG9mIHRoZSBjYWxsYmFjaywgYWx0ZXJuYXRpdmVseSBhbiBhcnJheSBvZiBhbGwgdGhlXG4gICAgICAgKiAgICAgICAgY2FsbGJhY2sgYXJndW1lbnRzIGlzIHJlc29sdmVkLiBCeSBkZWZhdWx0LCBpZiB0aGUgY2FsbGJhY2tcbiAgICAgICAqICAgICAgICBmdW5jdGlvbiBpcyBpbnZva2VkIHdpdGggb25seSBhIHNpbmdsZSBhcmd1bWVudCwgdGhhdCB3aWxsIGJlXG4gICAgICAgKiAgICAgICAgcmVzb2x2ZWQgdG8gdGhlIHByb21pc2UsIHdoaWxlIGFsbCBhcmd1bWVudHMgd2lsbCBiZSByZXNvbHZlZCBhc1xuICAgICAgICogICAgICAgIGFuIGFycmF5IGlmIG11bHRpcGxlIGFyZSBnaXZlbi5cbiAgICAgICAqXG4gICAgICAgKiBAcmV0dXJucyB7ZnVuY3Rpb259XG4gICAgICAgKiAgICAgICAgVGhlIGdlbmVyYXRlZCBjYWxsYmFjayBmdW5jdGlvbi5cbiAgICAgICAqL1xuICAgICAgY29uc3QgbWFrZUNhbGxiYWNrID0gKHByb21pc2UsIG1ldGFkYXRhKSA9PiB7XG4gICAgICAgIHJldHVybiAoLi4uY2FsbGJhY2tBcmdzKSA9PiB7XG4gICAgICAgICAgaWYgKGV4dGVuc2lvbkFQSXMucnVudGltZS5sYXN0RXJyb3IpIHtcbiAgICAgICAgICAgIHByb21pc2UucmVqZWN0KG5ldyBFcnJvcihleHRlbnNpb25BUElzLnJ1bnRpbWUubGFzdEVycm9yLm1lc3NhZ2UpKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1ldGFkYXRhLnNpbmdsZUNhbGxiYWNrQXJnIHx8IGNhbGxiYWNrQXJncy5sZW5ndGggPD0gMSAmJiBtZXRhZGF0YS5zaW5nbGVDYWxsYmFja0FyZyAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgIHByb21pc2UucmVzb2x2ZShjYWxsYmFja0FyZ3NbMF0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwcm9taXNlLnJlc29sdmUoY2FsbGJhY2tBcmdzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICB9O1xuICAgICAgY29uc3QgcGx1cmFsaXplQXJndW1lbnRzID0gbnVtQXJncyA9PiBudW1BcmdzID09IDEgPyBcImFyZ3VtZW50XCIgOiBcImFyZ3VtZW50c1wiO1xuXG4gICAgICAvKipcbiAgICAgICAqIENyZWF0ZXMgYSB3cmFwcGVyIGZ1bmN0aW9uIGZvciBhIG1ldGhvZCB3aXRoIHRoZSBnaXZlbiBuYW1lIGFuZCBtZXRhZGF0YS5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICAgICAgICogICAgICAgIFRoZSBuYW1lIG9mIHRoZSBtZXRob2Qgd2hpY2ggaXMgYmVpbmcgd3JhcHBlZC5cbiAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSBtZXRhZGF0YVxuICAgICAgICogICAgICAgIE1ldGFkYXRhIGFib3V0IHRoZSBtZXRob2QgYmVpbmcgd3JhcHBlZC5cbiAgICAgICAqIEBwYXJhbSB7aW50ZWdlcn0gbWV0YWRhdGEubWluQXJnc1xuICAgICAgICogICAgICAgIFRoZSBtaW5pbXVtIG51bWJlciBvZiBhcmd1bWVudHMgd2hpY2ggbXVzdCBiZSBwYXNzZWQgdG8gdGhlXG4gICAgICAgKiAgICAgICAgZnVuY3Rpb24uIElmIGNhbGxlZCB3aXRoIGZld2VyIHRoYW4gdGhpcyBudW1iZXIgb2YgYXJndW1lbnRzLCB0aGVcbiAgICAgICAqICAgICAgICB3cmFwcGVyIHdpbGwgcmFpc2UgYW4gZXhjZXB0aW9uLlxuICAgICAgICogQHBhcmFtIHtpbnRlZ2VyfSBtZXRhZGF0YS5tYXhBcmdzXG4gICAgICAgKiAgICAgICAgVGhlIG1heGltdW0gbnVtYmVyIG9mIGFyZ3VtZW50cyB3aGljaCBtYXkgYmUgcGFzc2VkIHRvIHRoZVxuICAgICAgICogICAgICAgIGZ1bmN0aW9uLiBJZiBjYWxsZWQgd2l0aCBtb3JlIHRoYW4gdGhpcyBudW1iZXIgb2YgYXJndW1lbnRzLCB0aGVcbiAgICAgICAqICAgICAgICB3cmFwcGVyIHdpbGwgcmFpc2UgYW4gZXhjZXB0aW9uLlxuICAgICAgICogQHBhcmFtIHtib29sZWFufSBtZXRhZGF0YS5zaW5nbGVDYWxsYmFja0FyZ1xuICAgICAgICogICAgICAgIFdoZXRoZXIgb3Igbm90IHRoZSBwcm9taXNlIGlzIHJlc29sdmVkIHdpdGggb25seSB0aGUgZmlyc3RcbiAgICAgICAqICAgICAgICBhcmd1bWVudCBvZiB0aGUgY2FsbGJhY2ssIGFsdGVybmF0aXZlbHkgYW4gYXJyYXkgb2YgYWxsIHRoZVxuICAgICAgICogICAgICAgIGNhbGxiYWNrIGFyZ3VtZW50cyBpcyByZXNvbHZlZC4gQnkgZGVmYXVsdCwgaWYgdGhlIGNhbGxiYWNrXG4gICAgICAgKiAgICAgICAgZnVuY3Rpb24gaXMgaW52b2tlZCB3aXRoIG9ubHkgYSBzaW5nbGUgYXJndW1lbnQsIHRoYXQgd2lsbCBiZVxuICAgICAgICogICAgICAgIHJlc29sdmVkIHRvIHRoZSBwcm9taXNlLCB3aGlsZSBhbGwgYXJndW1lbnRzIHdpbGwgYmUgcmVzb2x2ZWQgYXNcbiAgICAgICAqICAgICAgICBhbiBhcnJheSBpZiBtdWx0aXBsZSBhcmUgZ2l2ZW4uXG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge2Z1bmN0aW9uKG9iamVjdCwgLi4uKil9XG4gICAgICAgKiAgICAgICBUaGUgZ2VuZXJhdGVkIHdyYXBwZXIgZnVuY3Rpb24uXG4gICAgICAgKi9cbiAgICAgIGNvbnN0IHdyYXBBc3luY0Z1bmN0aW9uID0gKG5hbWUsIG1ldGFkYXRhKSA9PiB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBhc3luY0Z1bmN0aW9uV3JhcHBlcih0YXJnZXQsIC4uLmFyZ3MpIHtcbiAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPCBtZXRhZGF0YS5taW5BcmdzKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGF0IGxlYXN0ICR7bWV0YWRhdGEubWluQXJnc30gJHtwbHVyYWxpemVBcmd1bWVudHMobWV0YWRhdGEubWluQXJncyl9IGZvciAke25hbWV9KCksIGdvdCAke2FyZ3MubGVuZ3RofWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoYXJncy5sZW5ndGggPiBtZXRhZGF0YS5tYXhBcmdzKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGF0IG1vc3QgJHttZXRhZGF0YS5tYXhBcmdzfSAke3BsdXJhbGl6ZUFyZ3VtZW50cyhtZXRhZGF0YS5tYXhBcmdzKX0gZm9yICR7bmFtZX0oKSwgZ290ICR7YXJncy5sZW5ndGh9YCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgICAgICBpZiAobWV0YWRhdGEuZmFsbGJhY2tUb05vQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgLy8gVGhpcyBBUEkgbWV0aG9kIGhhcyBjdXJyZW50bHkgbm8gY2FsbGJhY2sgb24gQ2hyb21lLCBidXQgaXQgcmV0dXJuIGEgcHJvbWlzZSBvbiBGaXJlZm94LFxuICAgICAgICAgICAgICAvLyBhbmQgc28gdGhlIHBvbHlmaWxsIHdpbGwgdHJ5IHRvIGNhbGwgaXQgd2l0aCBhIGNhbGxiYWNrIGZpcnN0LCBhbmQgaXQgd2lsbCBmYWxsYmFja1xuICAgICAgICAgICAgICAvLyB0byBub3QgcGFzc2luZyB0aGUgY2FsbGJhY2sgaWYgdGhlIGZpcnN0IGNhbGwgZmFpbHMuXG4gICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0W25hbWVdKC4uLmFyZ3MsIG1ha2VDYWxsYmFjayh7XG4gICAgICAgICAgICAgICAgICByZXNvbHZlLFxuICAgICAgICAgICAgICAgICAgcmVqZWN0XG4gICAgICAgICAgICAgICAgfSwgbWV0YWRhdGEpKTtcbiAgICAgICAgICAgICAgfSBjYXRjaCAoY2JFcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgJHtuYW1lfSBBUEkgbWV0aG9kIGRvZXNuJ3Qgc2VlbSB0byBzdXBwb3J0IHRoZSBjYWxsYmFjayBwYXJhbWV0ZXIsIGAgKyBcImZhbGxpbmcgYmFjayB0byBjYWxsIGl0IHdpdGhvdXQgYSBjYWxsYmFjazogXCIsIGNiRXJyb3IpO1xuICAgICAgICAgICAgICAgIHRhcmdldFtuYW1lXSguLi5hcmdzKTtcblxuICAgICAgICAgICAgICAgIC8vIFVwZGF0ZSB0aGUgQVBJIG1ldGhvZCBtZXRhZGF0YSwgc28gdGhhdCB0aGUgbmV4dCBBUEkgY2FsbHMgd2lsbCBub3QgdHJ5IHRvXG4gICAgICAgICAgICAgICAgLy8gdXNlIHRoZSB1bnN1cHBvcnRlZCBjYWxsYmFjayBhbnltb3JlLlxuICAgICAgICAgICAgICAgIG1ldGFkYXRhLmZhbGxiYWNrVG9Ob0NhbGxiYWNrID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgbWV0YWRhdGEubm9DYWxsYmFjayA9IHRydWU7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKG1ldGFkYXRhLm5vQ2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgdGFyZ2V0W25hbWVdKC4uLmFyZ3MpO1xuICAgICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0YXJnZXRbbmFtZV0oLi4uYXJncywgbWFrZUNhbGxiYWNrKHtcbiAgICAgICAgICAgICAgICByZXNvbHZlLFxuICAgICAgICAgICAgICAgIHJlamVjdFxuICAgICAgICAgICAgICB9LCBtZXRhZGF0YSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgICAgfTtcblxuICAgICAgLyoqXG4gICAgICAgKiBXcmFwcyBhbiBleGlzdGluZyBtZXRob2Qgb2YgdGhlIHRhcmdldCBvYmplY3QsIHNvIHRoYXQgY2FsbHMgdG8gaXQgYXJlXG4gICAgICAgKiBpbnRlcmNlcHRlZCBieSB0aGUgZ2l2ZW4gd3JhcHBlciBmdW5jdGlvbi4gVGhlIHdyYXBwZXIgZnVuY3Rpb24gcmVjZWl2ZXMsXG4gICAgICAgKiBhcyBpdHMgZmlyc3QgYXJndW1lbnQsIHRoZSBvcmlnaW5hbCBgdGFyZ2V0YCBvYmplY3QsIGZvbGxvd2VkIGJ5IGVhY2ggb2ZcbiAgICAgICAqIHRoZSBhcmd1bWVudHMgcGFzc2VkIHRvIHRoZSBvcmlnaW5hbCBtZXRob2QuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IHRhcmdldFxuICAgICAgICogICAgICAgIFRoZSBvcmlnaW5hbCB0YXJnZXQgb2JqZWN0IHRoYXQgdGhlIHdyYXBwZWQgbWV0aG9kIGJlbG9uZ3MgdG8uXG4gICAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSBtZXRob2RcbiAgICAgICAqICAgICAgICBUaGUgbWV0aG9kIGJlaW5nIHdyYXBwZWQuIFRoaXMgaXMgdXNlZCBhcyB0aGUgdGFyZ2V0IG9mIHRoZSBQcm94eVxuICAgICAgICogICAgICAgIG9iamVjdCB3aGljaCBpcyBjcmVhdGVkIHRvIHdyYXAgdGhlIG1ldGhvZC5cbiAgICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IHdyYXBwZXJcbiAgICAgICAqICAgICAgICBUaGUgd3JhcHBlciBmdW5jdGlvbiB3aGljaCBpcyBjYWxsZWQgaW4gcGxhY2Ugb2YgYSBkaXJlY3QgaW52b2NhdGlvblxuICAgICAgICogICAgICAgIG9mIHRoZSB3cmFwcGVkIG1ldGhvZC5cbiAgICAgICAqXG4gICAgICAgKiBAcmV0dXJucyB7UHJveHk8ZnVuY3Rpb24+fVxuICAgICAgICogICAgICAgIEEgUHJveHkgb2JqZWN0IGZvciB0aGUgZ2l2ZW4gbWV0aG9kLCB3aGljaCBpbnZva2VzIHRoZSBnaXZlbiB3cmFwcGVyXG4gICAgICAgKiAgICAgICAgbWV0aG9kIGluIGl0cyBwbGFjZS5cbiAgICAgICAqL1xuICAgICAgY29uc3Qgd3JhcE1ldGhvZCA9ICh0YXJnZXQsIG1ldGhvZCwgd3JhcHBlcikgPT4ge1xuICAgICAgICByZXR1cm4gbmV3IFByb3h5KG1ldGhvZCwge1xuICAgICAgICAgIGFwcGx5KHRhcmdldE1ldGhvZCwgdGhpc09iaiwgYXJncykge1xuICAgICAgICAgICAgcmV0dXJuIHdyYXBwZXIuY2FsbCh0aGlzT2JqLCB0YXJnZXQsIC4uLmFyZ3MpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgICAgbGV0IGhhc093blByb3BlcnR5ID0gRnVuY3Rpb24uY2FsbC5iaW5kKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkpO1xuXG4gICAgICAvKipcbiAgICAgICAqIFdyYXBzIGFuIG9iamVjdCBpbiBhIFByb3h5IHdoaWNoIGludGVyY2VwdHMgYW5kIHdyYXBzIGNlcnRhaW4gbWV0aG9kc1xuICAgICAgICogYmFzZWQgb24gdGhlIGdpdmVuIGB3cmFwcGVyc2AgYW5kIGBtZXRhZGF0YWAgb2JqZWN0cy5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gdGFyZ2V0XG4gICAgICAgKiAgICAgICAgVGhlIHRhcmdldCBvYmplY3QgdG8gd3JhcC5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gW3dyYXBwZXJzID0ge31dXG4gICAgICAgKiAgICAgICAgQW4gb2JqZWN0IHRyZWUgY29udGFpbmluZyB3cmFwcGVyIGZ1bmN0aW9ucyBmb3Igc3BlY2lhbCBjYXNlcy4gQW55XG4gICAgICAgKiAgICAgICAgZnVuY3Rpb24gcHJlc2VudCBpbiB0aGlzIG9iamVjdCB0cmVlIGlzIGNhbGxlZCBpbiBwbGFjZSBvZiB0aGVcbiAgICAgICAqICAgICAgICBtZXRob2QgaW4gdGhlIHNhbWUgbG9jYXRpb24gaW4gdGhlIGB0YXJnZXRgIG9iamVjdCB0cmVlLiBUaGVzZVxuICAgICAgICogICAgICAgIHdyYXBwZXIgbWV0aG9kcyBhcmUgaW52b2tlZCBhcyBkZXNjcmliZWQgaW4ge0BzZWUgd3JhcE1ldGhvZH0uXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IFttZXRhZGF0YSA9IHt9XVxuICAgICAgICogICAgICAgIEFuIG9iamVjdCB0cmVlIGNvbnRhaW5pbmcgbWV0YWRhdGEgdXNlZCB0byBhdXRvbWF0aWNhbGx5IGdlbmVyYXRlXG4gICAgICAgKiAgICAgICAgUHJvbWlzZS1iYXNlZCB3cmFwcGVyIGZ1bmN0aW9ucyBmb3IgYXN5bmNocm9ub3VzLiBBbnkgZnVuY3Rpb24gaW5cbiAgICAgICAqICAgICAgICB0aGUgYHRhcmdldGAgb2JqZWN0IHRyZWUgd2hpY2ggaGFzIGEgY29ycmVzcG9uZGluZyBtZXRhZGF0YSBvYmplY3RcbiAgICAgICAqICAgICAgICBpbiB0aGUgc2FtZSBsb2NhdGlvbiBpbiB0aGUgYG1ldGFkYXRhYCB0cmVlIGlzIHJlcGxhY2VkIHdpdGggYW5cbiAgICAgICAqICAgICAgICBhdXRvbWF0aWNhbGx5LWdlbmVyYXRlZCB3cmFwcGVyIGZ1bmN0aW9uLCBhcyBkZXNjcmliZWQgaW5cbiAgICAgICAqICAgICAgICB7QHNlZSB3cmFwQXN5bmNGdW5jdGlvbn1cbiAgICAgICAqXG4gICAgICAgKiBAcmV0dXJucyB7UHJveHk8b2JqZWN0Pn1cbiAgICAgICAqL1xuICAgICAgY29uc3Qgd3JhcE9iamVjdCA9ICh0YXJnZXQsIHdyYXBwZXJzID0ge30sIG1ldGFkYXRhID0ge30pID0+IHtcbiAgICAgICAgbGV0IGNhY2hlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICAgICAgbGV0IGhhbmRsZXJzID0ge1xuICAgICAgICAgIGhhcyhwcm94eVRhcmdldCwgcHJvcCkge1xuICAgICAgICAgICAgcmV0dXJuIHByb3AgaW4gdGFyZ2V0IHx8IHByb3AgaW4gY2FjaGU7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBnZXQocHJveHlUYXJnZXQsIHByb3AsIHJlY2VpdmVyKSB7XG4gICAgICAgICAgICBpZiAocHJvcCBpbiBjYWNoZSkge1xuICAgICAgICAgICAgICByZXR1cm4gY2FjaGVbcHJvcF07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIShwcm9wIGluIHRhcmdldCkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGxldCB2YWx1ZSA9IHRhcmdldFtwcm9wXTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAvLyBUaGlzIGlzIGEgbWV0aG9kIG9uIHRoZSB1bmRlcmx5aW5nIG9iamVjdC4gQ2hlY2sgaWYgd2UgbmVlZCB0byBkb1xuICAgICAgICAgICAgICAvLyBhbnkgd3JhcHBpbmcuXG5cbiAgICAgICAgICAgICAgaWYgKHR5cGVvZiB3cmFwcGVyc1twcm9wXSA9PT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAgICAgLy8gV2UgaGF2ZSBhIHNwZWNpYWwtY2FzZSB3cmFwcGVyIGZvciB0aGlzIG1ldGhvZC5cbiAgICAgICAgICAgICAgICB2YWx1ZSA9IHdyYXBNZXRob2QodGFyZ2V0LCB0YXJnZXRbcHJvcF0sIHdyYXBwZXJzW3Byb3BdKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChoYXNPd25Qcm9wZXJ0eShtZXRhZGF0YSwgcHJvcCkpIHtcbiAgICAgICAgICAgICAgICAvLyBUaGlzIGlzIGFuIGFzeW5jIG1ldGhvZCB0aGF0IHdlIGhhdmUgbWV0YWRhdGEgZm9yLiBDcmVhdGUgYVxuICAgICAgICAgICAgICAgIC8vIFByb21pc2Ugd3JhcHBlciBmb3IgaXQuXG4gICAgICAgICAgICAgICAgbGV0IHdyYXBwZXIgPSB3cmFwQXN5bmNGdW5jdGlvbihwcm9wLCBtZXRhZGF0YVtwcm9wXSk7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSB3cmFwTWV0aG9kKHRhcmdldCwgdGFyZ2V0W3Byb3BdLCB3cmFwcGVyKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBUaGlzIGlzIGEgbWV0aG9kIHRoYXQgd2UgZG9uJ3Qga25vdyBvciBjYXJlIGFib3V0LiBSZXR1cm4gdGhlXG4gICAgICAgICAgICAgICAgLy8gb3JpZ2luYWwgbWV0aG9kLCBib3VuZCB0byB0aGUgdW5kZXJseWluZyBvYmplY3QuXG4gICAgICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5iaW5kKHRhcmdldCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmIHZhbHVlICE9PSBudWxsICYmIChoYXNPd25Qcm9wZXJ0eSh3cmFwcGVycywgcHJvcCkgfHwgaGFzT3duUHJvcGVydHkobWV0YWRhdGEsIHByb3ApKSkge1xuICAgICAgICAgICAgICAvLyBUaGlzIGlzIGFuIG9iamVjdCB0aGF0IHdlIG5lZWQgdG8gZG8gc29tZSB3cmFwcGluZyBmb3IgdGhlIGNoaWxkcmVuXG4gICAgICAgICAgICAgIC8vIG9mLiBDcmVhdGUgYSBzdWItb2JqZWN0IHdyYXBwZXIgZm9yIGl0IHdpdGggdGhlIGFwcHJvcHJpYXRlIGNoaWxkXG4gICAgICAgICAgICAgIC8vIG1ldGFkYXRhLlxuICAgICAgICAgICAgICB2YWx1ZSA9IHdyYXBPYmplY3QodmFsdWUsIHdyYXBwZXJzW3Byb3BdLCBtZXRhZGF0YVtwcm9wXSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGhhc093blByb3BlcnR5KG1ldGFkYXRhLCBcIipcIikpIHtcbiAgICAgICAgICAgICAgLy8gV3JhcCBhbGwgcHJvcGVydGllcyBpbiAqIG5hbWVzcGFjZS5cbiAgICAgICAgICAgICAgdmFsdWUgPSB3cmFwT2JqZWN0KHZhbHVlLCB3cmFwcGVyc1twcm9wXSwgbWV0YWRhdGFbXCIqXCJdKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIFdlIGRvbid0IG5lZWQgdG8gZG8gYW55IHdyYXBwaW5nIGZvciB0aGlzIHByb3BlcnR5LFxuICAgICAgICAgICAgICAvLyBzbyBqdXN0IGZvcndhcmQgYWxsIGFjY2VzcyB0byB0aGUgdW5kZXJseWluZyBvYmplY3QuXG4gICAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eShjYWNoZSwgcHJvcCwge1xuICAgICAgICAgICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgIGdldCgpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0YXJnZXRbcHJvcF07XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBzZXQodmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgIHRhcmdldFtwcm9wXSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNhY2hlW3Byb3BdID0gdmFsdWU7XG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBzZXQocHJveHlUYXJnZXQsIHByb3AsIHZhbHVlLCByZWNlaXZlcikge1xuICAgICAgICAgICAgaWYgKHByb3AgaW4gY2FjaGUpIHtcbiAgICAgICAgICAgICAgY2FjaGVbcHJvcF0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHRhcmdldFtwcm9wXSA9IHZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBkZWZpbmVQcm9wZXJ0eShwcm94eVRhcmdldCwgcHJvcCwgZGVzYykge1xuICAgICAgICAgICAgcmV0dXJuIFJlZmxlY3QuZGVmaW5lUHJvcGVydHkoY2FjaGUsIHByb3AsIGRlc2MpO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZGVsZXRlUHJvcGVydHkocHJveHlUYXJnZXQsIHByb3ApIHtcbiAgICAgICAgICAgIHJldHVybiBSZWZsZWN0LmRlbGV0ZVByb3BlcnR5KGNhY2hlLCBwcm9wKTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gUGVyIGNvbnRyYWN0IG9mIHRoZSBQcm94eSBBUEksIHRoZSBcImdldFwiIHByb3h5IGhhbmRsZXIgbXVzdCByZXR1cm4gdGhlXG4gICAgICAgIC8vIG9yaWdpbmFsIHZhbHVlIG9mIHRoZSB0YXJnZXQgaWYgdGhhdCB2YWx1ZSBpcyBkZWNsYXJlZCByZWFkLW9ubHkgYW5kXG4gICAgICAgIC8vIG5vbi1jb25maWd1cmFibGUuIEZvciB0aGlzIHJlYXNvbiwgd2UgY3JlYXRlIGFuIG9iamVjdCB3aXRoIHRoZVxuICAgICAgICAvLyBwcm90b3R5cGUgc2V0IHRvIGB0YXJnZXRgIGluc3RlYWQgb2YgdXNpbmcgYHRhcmdldGAgZGlyZWN0bHkuXG4gICAgICAgIC8vIE90aGVyd2lzZSB3ZSBjYW5ub3QgcmV0dXJuIGEgY3VzdG9tIG9iamVjdCBmb3IgQVBJcyB0aGF0XG4gICAgICAgIC8vIGFyZSBkZWNsYXJlZCByZWFkLW9ubHkgYW5kIG5vbi1jb25maWd1cmFibGUsIHN1Y2ggYXMgYGNocm9tZS5kZXZ0b29sc2AuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIFRoZSBwcm94eSBoYW5kbGVycyB0aGVtc2VsdmVzIHdpbGwgc3RpbGwgdXNlIHRoZSBvcmlnaW5hbCBgdGFyZ2V0YFxuICAgICAgICAvLyBpbnN0ZWFkIG9mIHRoZSBgcHJveHlUYXJnZXRgLCBzbyB0aGF0IHRoZSBtZXRob2RzIGFuZCBwcm9wZXJ0aWVzIGFyZVxuICAgICAgICAvLyBkZXJlZmVyZW5jZWQgdmlhIHRoZSBvcmlnaW5hbCB0YXJnZXRzLlxuICAgICAgICBsZXQgcHJveHlUYXJnZXQgPSBPYmplY3QuY3JlYXRlKHRhcmdldCk7XG4gICAgICAgIHJldHVybiBuZXcgUHJveHkocHJveHlUYXJnZXQsIGhhbmRsZXJzKTtcbiAgICAgIH07XG5cbiAgICAgIC8qKlxuICAgICAgICogQ3JlYXRlcyBhIHNldCBvZiB3cmFwcGVyIGZ1bmN0aW9ucyBmb3IgYW4gZXZlbnQgb2JqZWN0LCB3aGljaCBoYW5kbGVzXG4gICAgICAgKiB3cmFwcGluZyBvZiBsaXN0ZW5lciBmdW5jdGlvbnMgdGhhdCB0aG9zZSBtZXNzYWdlcyBhcmUgcGFzc2VkLlxuICAgICAgICpcbiAgICAgICAqIEEgc2luZ2xlIHdyYXBwZXIgaXMgY3JlYXRlZCBmb3IgZWFjaCBsaXN0ZW5lciBmdW5jdGlvbiwgYW5kIHN0b3JlZCBpbiBhXG4gICAgICAgKiBtYXAuIFN1YnNlcXVlbnQgY2FsbHMgdG8gYGFkZExpc3RlbmVyYCwgYGhhc0xpc3RlbmVyYCwgb3IgYHJlbW92ZUxpc3RlbmVyYFxuICAgICAgICogcmV0cmlldmUgdGhlIG9yaWdpbmFsIHdyYXBwZXIsIHNvIHRoYXQgIGF0dGVtcHRzIHRvIHJlbW92ZSBhXG4gICAgICAgKiBwcmV2aW91c2x5LWFkZGVkIGxpc3RlbmVyIHdvcmsgYXMgZXhwZWN0ZWQuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtEZWZhdWx0V2Vha01hcDxmdW5jdGlvbiwgZnVuY3Rpb24+fSB3cmFwcGVyTWFwXG4gICAgICAgKiAgICAgICAgQSBEZWZhdWx0V2Vha01hcCBvYmplY3Qgd2hpY2ggd2lsbCBjcmVhdGUgdGhlIGFwcHJvcHJpYXRlIHdyYXBwZXJcbiAgICAgICAqICAgICAgICBmb3IgYSBnaXZlbiBsaXN0ZW5lciBmdW5jdGlvbiB3aGVuIG9uZSBkb2VzIG5vdCBleGlzdCwgYW5kIHJldHJpZXZlXG4gICAgICAgKiAgICAgICAgYW4gZXhpc3Rpbmcgb25lIHdoZW4gaXQgZG9lcy5cbiAgICAgICAqXG4gICAgICAgKiBAcmV0dXJucyB7b2JqZWN0fVxuICAgICAgICovXG4gICAgICBjb25zdCB3cmFwRXZlbnQgPSB3cmFwcGVyTWFwID0+ICh7XG4gICAgICAgIGFkZExpc3RlbmVyKHRhcmdldCwgbGlzdGVuZXIsIC4uLmFyZ3MpIHtcbiAgICAgICAgICB0YXJnZXQuYWRkTGlzdGVuZXIod3JhcHBlck1hcC5nZXQobGlzdGVuZXIpLCAuLi5hcmdzKTtcbiAgICAgICAgfSxcbiAgICAgICAgaGFzTGlzdGVuZXIodGFyZ2V0LCBsaXN0ZW5lcikge1xuICAgICAgICAgIHJldHVybiB0YXJnZXQuaGFzTGlzdGVuZXIod3JhcHBlck1hcC5nZXQobGlzdGVuZXIpKTtcbiAgICAgICAgfSxcbiAgICAgICAgcmVtb3ZlTGlzdGVuZXIodGFyZ2V0LCBsaXN0ZW5lcikge1xuICAgICAgICAgIHRhcmdldC5yZW1vdmVMaXN0ZW5lcih3cmFwcGVyTWFwLmdldChsaXN0ZW5lcikpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGNvbnN0IG9uUmVxdWVzdEZpbmlzaGVkV3JhcHBlcnMgPSBuZXcgRGVmYXVsdFdlYWtNYXAobGlzdGVuZXIgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICByZXR1cm4gbGlzdGVuZXI7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogV3JhcHMgYW4gb25SZXF1ZXN0RmluaXNoZWQgbGlzdGVuZXIgZnVuY3Rpb24gc28gdGhhdCBpdCB3aWxsIHJldHVybiBhXG4gICAgICAgICAqIGBnZXRDb250ZW50KClgIHByb3BlcnR5IHdoaWNoIHJldHVybnMgYSBgUHJvbWlzZWAgcmF0aGVyIHRoYW4gdXNpbmcgYVxuICAgICAgICAgKiBjYWxsYmFjayBBUEkuXG4gICAgICAgICAqXG4gICAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSByZXFcbiAgICAgICAgICogICAgICAgIFRoZSBIQVIgZW50cnkgb2JqZWN0IHJlcHJlc2VudGluZyB0aGUgbmV0d29yayByZXF1ZXN0LlxuICAgICAgICAgKi9cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG9uUmVxdWVzdEZpbmlzaGVkKHJlcSkge1xuICAgICAgICAgIGNvbnN0IHdyYXBwZWRSZXEgPSB3cmFwT2JqZWN0KHJlcSwge30gLyogd3JhcHBlcnMgKi8sIHtcbiAgICAgICAgICAgIGdldENvbnRlbnQ6IHtcbiAgICAgICAgICAgICAgbWluQXJnczogMCxcbiAgICAgICAgICAgICAgbWF4QXJnczogMFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGxpc3RlbmVyKHdyYXBwZWRSZXEpO1xuICAgICAgICB9O1xuICAgICAgfSk7XG4gICAgICBjb25zdCBvbk1lc3NhZ2VXcmFwcGVycyA9IG5ldyBEZWZhdWx0V2Vha01hcChsaXN0ZW5lciA9PiB7XG4gICAgICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgIHJldHVybiBsaXN0ZW5lcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBXcmFwcyBhIG1lc3NhZ2UgbGlzdGVuZXIgZnVuY3Rpb24gc28gdGhhdCBpdCBtYXkgc2VuZCByZXNwb25zZXMgYmFzZWQgb25cbiAgICAgICAgICogaXRzIHJldHVybiB2YWx1ZSwgcmF0aGVyIHRoYW4gYnkgcmV0dXJuaW5nIGEgc2VudGluZWwgdmFsdWUgYW5kIGNhbGxpbmcgYVxuICAgICAgICAgKiBjYWxsYmFjay4gSWYgdGhlIGxpc3RlbmVyIGZ1bmN0aW9uIHJldHVybnMgYSBQcm9taXNlLCB0aGUgcmVzcG9uc2UgaXNcbiAgICAgICAgICogc2VudCB3aGVuIHRoZSBwcm9taXNlIGVpdGhlciByZXNvbHZlcyBvciByZWplY3RzLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0geyp9IG1lc3NhZ2VcbiAgICAgICAgICogICAgICAgIFRoZSBtZXNzYWdlIHNlbnQgYnkgdGhlIG90aGVyIGVuZCBvZiB0aGUgY2hhbm5lbC5cbiAgICAgICAgICogQHBhcmFtIHtvYmplY3R9IHNlbmRlclxuICAgICAgICAgKiAgICAgICAgRGV0YWlscyBhYm91dCB0aGUgc2VuZGVyIG9mIHRoZSBtZXNzYWdlLlxuICAgICAgICAgKiBAcGFyYW0ge2Z1bmN0aW9uKCopfSBzZW5kUmVzcG9uc2VcbiAgICAgICAgICogICAgICAgIEEgY2FsbGJhY2sgd2hpY2gsIHdoZW4gY2FsbGVkIHdpdGggYW4gYXJiaXRyYXJ5IGFyZ3VtZW50LCBzZW5kc1xuICAgICAgICAgKiAgICAgICAgdGhhdCB2YWx1ZSBhcyBhIHJlc3BvbnNlLlxuICAgICAgICAgKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAgICAgICAgICogICAgICAgIFRydWUgaWYgdGhlIHdyYXBwZWQgbGlzdGVuZXIgcmV0dXJuZWQgYSBQcm9taXNlLCB3aGljaCB3aWxsIGxhdGVyXG4gICAgICAgICAqICAgICAgICB5aWVsZCBhIHJlc3BvbnNlLiBGYWxzZSBvdGhlcndpc2UuXG4gICAgICAgICAqL1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gb25NZXNzYWdlKG1lc3NhZ2UsIHNlbmRlciwgc2VuZFJlc3BvbnNlKSB7XG4gICAgICAgICAgbGV0IGRpZENhbGxTZW5kUmVzcG9uc2UgPSBmYWxzZTtcbiAgICAgICAgICBsZXQgd3JhcHBlZFNlbmRSZXNwb25zZTtcbiAgICAgICAgICBsZXQgc2VuZFJlc3BvbnNlUHJvbWlzZSA9IG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgICAgICAgICAgd3JhcHBlZFNlbmRSZXNwb25zZSA9IGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICBkaWRDYWxsU2VuZFJlc3BvbnNlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIGxldCByZXN1bHQ7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJlc3VsdCA9IGxpc3RlbmVyKG1lc3NhZ2UsIHNlbmRlciwgd3JhcHBlZFNlbmRSZXNwb25zZSk7XG4gICAgICAgICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICByZXN1bHQgPSBQcm9taXNlLnJlamVjdChlcnIpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBpc1Jlc3VsdFRoZW5hYmxlID0gcmVzdWx0ICE9PSB0cnVlICYmIGlzVGhlbmFibGUocmVzdWx0KTtcblxuICAgICAgICAgIC8vIElmIHRoZSBsaXN0ZW5lciBkaWRuJ3QgcmV0dXJuZWQgdHJ1ZSBvciBhIFByb21pc2UsIG9yIGNhbGxlZFxuICAgICAgICAgIC8vIHdyYXBwZWRTZW5kUmVzcG9uc2Ugc3luY2hyb25vdXNseSwgd2UgY2FuIGV4aXQgZWFybGllclxuICAgICAgICAgIC8vIGJlY2F1c2UgdGhlcmUgd2lsbCBiZSBubyByZXNwb25zZSBzZW50IGZyb20gdGhpcyBsaXN0ZW5lci5cbiAgICAgICAgICBpZiAocmVzdWx0ICE9PSB0cnVlICYmICFpc1Jlc3VsdFRoZW5hYmxlICYmICFkaWRDYWxsU2VuZFJlc3BvbnNlKSB7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gQSBzbWFsbCBoZWxwZXIgdG8gc2VuZCB0aGUgbWVzc2FnZSBpZiB0aGUgcHJvbWlzZSByZXNvbHZlc1xuICAgICAgICAgIC8vIGFuZCBhbiBlcnJvciBpZiB0aGUgcHJvbWlzZSByZWplY3RzIChhIHdyYXBwZWQgc2VuZE1lc3NhZ2UgaGFzXG4gICAgICAgICAgLy8gdG8gdHJhbnNsYXRlIHRoZSBtZXNzYWdlIGludG8gYSByZXNvbHZlZCBwcm9taXNlIG9yIGEgcmVqZWN0ZWRcbiAgICAgICAgICAvLyBwcm9taXNlKS5cbiAgICAgICAgICBjb25zdCBzZW5kUHJvbWlzZWRSZXN1bHQgPSBwcm9taXNlID0+IHtcbiAgICAgICAgICAgIHByb21pc2UudGhlbihtc2cgPT4ge1xuICAgICAgICAgICAgICAvLyBzZW5kIHRoZSBtZXNzYWdlIHZhbHVlLlxuICAgICAgICAgICAgICBzZW5kUmVzcG9uc2UobXNnKTtcbiAgICAgICAgICAgIH0sIGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gU2VuZCBhIEpTT04gcmVwcmVzZW50YXRpb24gb2YgdGhlIGVycm9yIGlmIHRoZSByZWplY3RlZCB2YWx1ZVxuICAgICAgICAgICAgICAvLyBpcyBhbiBpbnN0YW5jZSBvZiBlcnJvciwgb3IgdGhlIG9iamVjdCBpdHNlbGYgb3RoZXJ3aXNlLlxuICAgICAgICAgICAgICBsZXQgbWVzc2FnZTtcbiAgICAgICAgICAgICAgaWYgKGVycm9yICYmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yIHx8IHR5cGVvZiBlcnJvci5tZXNzYWdlID09PSBcInN0cmluZ1wiKSkge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBlcnJvci5tZXNzYWdlO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UgPSBcIkFuIHVuZXhwZWN0ZWQgZXJyb3Igb2NjdXJyZWRcIjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBzZW5kUmVzcG9uc2Uoe1xuICAgICAgICAgICAgICAgIF9fbW96V2ViRXh0ZW5zaW9uUG9seWZpbGxSZWplY3RfXzogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtZXNzYWdlXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgLy8gUHJpbnQgYW4gZXJyb3Igb24gdGhlIGNvbnNvbGUgaWYgdW5hYmxlIHRvIHNlbmQgdGhlIHJlc3BvbnNlLlxuICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHNlbmQgb25NZXNzYWdlIHJlamVjdGVkIHJlcGx5XCIsIGVycik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgLy8gSWYgdGhlIGxpc3RlbmVyIHJldHVybmVkIGEgUHJvbWlzZSwgc2VuZCB0aGUgcmVzb2x2ZWQgdmFsdWUgYXMgYVxuICAgICAgICAgIC8vIHJlc3VsdCwgb3RoZXJ3aXNlIHdhaXQgdGhlIHByb21pc2UgcmVsYXRlZCB0byB0aGUgd3JhcHBlZFNlbmRSZXNwb25zZVxuICAgICAgICAgIC8vIGNhbGxiYWNrIHRvIHJlc29sdmUgYW5kIHNlbmQgaXQgYXMgYSByZXNwb25zZS5cbiAgICAgICAgICBpZiAoaXNSZXN1bHRUaGVuYWJsZSkge1xuICAgICAgICAgICAgc2VuZFByb21pc2VkUmVzdWx0KHJlc3VsdCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNlbmRQcm9taXNlZFJlc3VsdChzZW5kUmVzcG9uc2VQcm9taXNlKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBMZXQgQ2hyb21lIGtub3cgdGhhdCB0aGUgbGlzdGVuZXIgaXMgcmVwbHlpbmcuXG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHdyYXBwZWRTZW5kTWVzc2FnZUNhbGxiYWNrID0gKHtcbiAgICAgICAgcmVqZWN0LFxuICAgICAgICByZXNvbHZlXG4gICAgICB9LCByZXBseSkgPT4ge1xuICAgICAgICBpZiAoZXh0ZW5zaW9uQVBJcy5ydW50aW1lLmxhc3RFcnJvcikge1xuICAgICAgICAgIC8vIERldGVjdCB3aGVuIG5vbmUgb2YgdGhlIGxpc3RlbmVycyByZXBsaWVkIHRvIHRoZSBzZW5kTWVzc2FnZSBjYWxsIGFuZCByZXNvbHZlXG4gICAgICAgICAgLy8gdGhlIHByb21pc2UgdG8gdW5kZWZpbmVkIGFzIGluIEZpcmVmb3guXG4gICAgICAgICAgLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9tb3ppbGxhL3dlYmV4dGVuc2lvbi1wb2x5ZmlsbC9pc3N1ZXMvMTMwXG4gICAgICAgICAgaWYgKGV4dGVuc2lvbkFQSXMucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSA9PT0gQ0hST01FX1NFTkRfTUVTU0FHRV9DQUxMQkFDS19OT19SRVNQT05TRV9NRVNTQUdFKSB7XG4gICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IoZXh0ZW5zaW9uQVBJcy5ydW50aW1lLmxhc3RFcnJvci5tZXNzYWdlKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHJlcGx5ICYmIHJlcGx5Ll9fbW96V2ViRXh0ZW5zaW9uUG9seWZpbGxSZWplY3RfXykge1xuICAgICAgICAgIC8vIENvbnZlcnQgYmFjayB0aGUgSlNPTiByZXByZXNlbnRhdGlvbiBvZiB0aGUgZXJyb3IgaW50b1xuICAgICAgICAgIC8vIGFuIEVycm9yIGluc3RhbmNlLlxuICAgICAgICAgIHJlamVjdChuZXcgRXJyb3IocmVwbHkubWVzc2FnZSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc29sdmUocmVwbHkpO1xuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgY29uc3Qgd3JhcHBlZFNlbmRNZXNzYWdlID0gKG5hbWUsIG1ldGFkYXRhLCBhcGlOYW1lc3BhY2VPYmosIC4uLmFyZ3MpID0+IHtcbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDwgbWV0YWRhdGEubWluQXJncykge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgYXQgbGVhc3QgJHttZXRhZGF0YS5taW5BcmdzfSAke3BsdXJhbGl6ZUFyZ3VtZW50cyhtZXRhZGF0YS5taW5BcmdzKX0gZm9yICR7bmFtZX0oKSwgZ290ICR7YXJncy5sZW5ndGh9YCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gbWV0YWRhdGEubWF4QXJncykge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgYXQgbW9zdCAke21ldGFkYXRhLm1heEFyZ3N9ICR7cGx1cmFsaXplQXJndW1lbnRzKG1ldGFkYXRhLm1heEFyZ3MpfSBmb3IgJHtuYW1lfSgpLCBnb3QgJHthcmdzLmxlbmd0aH1gKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIGNvbnN0IHdyYXBwZWRDYiA9IHdyYXBwZWRTZW5kTWVzc2FnZUNhbGxiYWNrLmJpbmQobnVsbCwge1xuICAgICAgICAgICAgcmVzb2x2ZSxcbiAgICAgICAgICAgIHJlamVjdFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGFyZ3MucHVzaCh3cmFwcGVkQ2IpO1xuICAgICAgICAgIGFwaU5hbWVzcGFjZU9iai5zZW5kTWVzc2FnZSguLi5hcmdzKTtcbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgICAgY29uc3Qgc3RhdGljV3JhcHBlcnMgPSB7XG4gICAgICAgIGRldnRvb2xzOiB7XG4gICAgICAgICAgbmV0d29yazoge1xuICAgICAgICAgICAgb25SZXF1ZXN0RmluaXNoZWQ6IHdyYXBFdmVudChvblJlcXVlc3RGaW5pc2hlZFdyYXBwZXJzKVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgcnVudGltZToge1xuICAgICAgICAgIG9uTWVzc2FnZTogd3JhcEV2ZW50KG9uTWVzc2FnZVdyYXBwZXJzKSxcbiAgICAgICAgICBvbk1lc3NhZ2VFeHRlcm5hbDogd3JhcEV2ZW50KG9uTWVzc2FnZVdyYXBwZXJzKSxcbiAgICAgICAgICBzZW5kTWVzc2FnZTogd3JhcHBlZFNlbmRNZXNzYWdlLmJpbmQobnVsbCwgXCJzZW5kTWVzc2FnZVwiLCB7XG4gICAgICAgICAgICBtaW5BcmdzOiAxLFxuICAgICAgICAgICAgbWF4QXJnczogM1xuICAgICAgICAgIH0pXG4gICAgICAgIH0sXG4gICAgICAgIHRhYnM6IHtcbiAgICAgICAgICBzZW5kTWVzc2FnZTogd3JhcHBlZFNlbmRNZXNzYWdlLmJpbmQobnVsbCwgXCJzZW5kTWVzc2FnZVwiLCB7XG4gICAgICAgICAgICBtaW5BcmdzOiAyLFxuICAgICAgICAgICAgbWF4QXJnczogM1xuICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBjb25zdCBzZXR0aW5nTWV0YWRhdGEgPSB7XG4gICAgICAgIGNsZWFyOiB7XG4gICAgICAgICAgbWluQXJnczogMSxcbiAgICAgICAgICBtYXhBcmdzOiAxXG4gICAgICAgIH0sXG4gICAgICAgIGdldDoge1xuICAgICAgICAgIG1pbkFyZ3M6IDEsXG4gICAgICAgICAgbWF4QXJnczogMVxuICAgICAgICB9LFxuICAgICAgICBzZXQ6IHtcbiAgICAgICAgICBtaW5BcmdzOiAxLFxuICAgICAgICAgIG1heEFyZ3M6IDFcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGFwaU1ldGFkYXRhLnByaXZhY3kgPSB7XG4gICAgICAgIG5ldHdvcms6IHtcbiAgICAgICAgICBcIipcIjogc2V0dGluZ01ldGFkYXRhXG4gICAgICAgIH0sXG4gICAgICAgIHNlcnZpY2VzOiB7XG4gICAgICAgICAgXCIqXCI6IHNldHRpbmdNZXRhZGF0YVxuICAgICAgICB9LFxuICAgICAgICB3ZWJzaXRlczoge1xuICAgICAgICAgIFwiKlwiOiBzZXR0aW5nTWV0YWRhdGFcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIHJldHVybiB3cmFwT2JqZWN0KGV4dGVuc2lvbkFQSXMsIHN0YXRpY1dyYXBwZXJzLCBhcGlNZXRhZGF0YSk7XG4gICAgfTtcblxuICAgIC8vIFRoZSBidWlsZCBwcm9jZXNzIGFkZHMgYSBVTUQgd3JhcHBlciBhcm91bmQgdGhpcyBmaWxlLCB3aGljaCBtYWtlcyB0aGVcbiAgICAvLyBgbW9kdWxlYCB2YXJpYWJsZSBhdmFpbGFibGUuXG4gICAgbW9kdWxlLmV4cG9ydHMgPSB3cmFwQVBJcyhjaHJvbWUpO1xuICB9IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZ2xvYmFsVGhpcy5icm93c2VyO1xuICB9XG59KTtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWJyb3dzZXItcG9seWZpbGwuanMubWFwXG4iLCJpbXBvcnQgb3JpZ2luYWxCcm93c2VyIGZyb20gXCJ3ZWJleHRlbnNpb24tcG9seWZpbGxcIjtcbmV4cG9ydCBjb25zdCBicm93c2VyID0gb3JpZ2luYWxCcm93c2VyO1xuIl0sIm5hbWVzIjpbImdldEhvc3RuYW1lIiwidGhpcyIsIm1vZHVsZSIsInByb3h5VGFyZ2V0IiwidmFsdWUiLCJyZXN1bHQiLCJtZXNzYWdlIl0sIm1hcHBpbmdzIjoiOzs7OztBQWNPLFFBQU0sa0JBQWlDO0FBQUEsSUFDNUMsUUFBUTtBQUFBLElBQ1IsV0FBVztBQUFBLElBQ1gsWUFBWTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1Q7QUFFaUQsR0FBQTtBQUFBLElBRS9DLFVBQVUsRUFBRSxHQUFHLGdCQUFBO0FBQUEsRUFFakI7O0FDdEJBLFdBQVNBLGNBQVksS0FBd0M7QUFDM0QsUUFBSSxDQUFDLElBQUssUUFBTztBQUNqQixRQUFJO0FBQ0YsWUFBTSxZQUFZLElBQUksSUFBSSxHQUFHO0FBRTdCLFVBQUksVUFBVSxhQUFhLFdBQVcsVUFBVSxhQUFhLFVBQVU7QUFDckUsZUFBTztBQUFBLE1BQ1Q7QUFDQSxhQUFPLFVBQVU7QUFBQSxJQUNuQixTQUFTLEdBQUc7QUFDVixjQUFRLEtBQUssc0NBQXNDLEdBQUc7QUFDdEQsYUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNGO0FBSUEsV0FBUyxpQkFBaUIsT0FBZSxTQUFzQixTQUFrQjtBQUMvRSxVQUFNLFVBQWtDLEVBQUU7QUFDMUMsV0FBTyxLQUFLLFlBQVksT0FBTyxTQUFTLE9BQU8sRUFDNUMsTUFBTSxDQUFB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QSxnQkFDVCxTQUFTO0FBQUEsY0FDbkI7QUFBQTtBQUVNLHdCQUFZLFVBQVU7QUFBQSxjQUNwQixTQUFTO0FBQUEsZ0JBQ1AsS0FBSztBQUFBO2NBRVAsVUFBVTtBQUFBLGdCQUNSLEtBQUs7QUFBQTtjQUVQLFVBQVU7QUFBQSxnQkFDUixLQUFLO0FBQUEsY0FDZjtBQUFBO0FBRU0sbUJBQU8sV0FBVyxlQUFlLGdCQUFnQixXQUFXO0FBQUEsVUFDbEU7QUFJSSxVQUFBSCxRQUFPLFVBQVUsU0FBUyxNQUFNO0FBQUEsUUFDcEMsT0FBUztBQUNMLFVBQUFBLFFBQU8sVUFBVSxXQUFXO0FBQUEsUUFDaEM7QUFBQSxNQUNBLENBQUM7QUFBQTs7Ozs7QUN0c0NNLFFBQU0sVUFBVTs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OzsiLCJ4X2dvb2dsZV9pZ25vcmVMaXN0IjpbMyw0LDcsOF19
