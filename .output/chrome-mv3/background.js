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
  const DEBUG_ENABLED = typeof localStorage !== "undefined" && localStorage.getItem("debugVvp") === "true";
  function debugLog(...args) {
    if (DEBUG_ENABLED) {
      console.log("[VVP]", ...args);
    }
  }
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
    debugLog(`[!!!] Broadcasting site settings update for ${hostname}`);
    debugLog(
      `SettingsEventHandler: Broadcasting site settings data for ${hostname}`,
      newSiteSettings
    );
    const tabs = await chrome.tabs.query({ url: `*://${hostname}/*` });
    debugLog(
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
        debugLog(
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
    debugLog(`[!!!] Broadcasting global settings update`);
    debugLog(
      "SettingsEventHandler: Broadcasting global settings data",
      newGlobalSettings
    );
    const tabs = await chrome.tabs.query({});
    debugLog(
      `[EventHandler] Found ${tabs.length} tabs to check for global update`
    );
    for (const tab of tabs) {
      if (tab.id && tab.url) {
        const tabHostname = getHostname$1(tab.url);
        if (tabHostname) {
          const siteConfig = settingsManager.getSettingsForSite(tabHostname);
          debugLog(
            `[EventHandler] Checking tab ${tab.id} (${tabHostname}) for global update. Site config:`,
            siteConfig
          );
          if (!siteConfig || siteConfig.activeSetting === "global") {
            debugLog(
              `[EventHandler] Tab ${tab.id} (${tabHostname}) qualifies for global update.`
            );
            const message = {
              type: "UPDATE_SETTINGS",
              settings: newGlobalSettings,
              hostname: tabHostname
            };
            debugLog(
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
    debugLog(`[!!!] Broadcasting site mode update for ${hostname} to ${mode}`);
    debugLog(`SettingsEventHandler: Broadcasting mode data for ${hostname}`, {
      mode,
      effectiveSettings
    });
    const tabs = await chrome.tabs.query({ url: `*://${hostname}/*` });
    debugLog(
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
        debugLog(
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
    debugLog("SettingsEventHandler: Listeners are now handled directly by SettingsManager");
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
        debugLog(
          "[DEBUG] SettingsManager Initialized with stored site settings. SiteSettings Map:",
          this.siteSettings
        );
      } else {
        this.siteSettings = /* @__PURE__ */ new Map();
        debugLog(
          "[DEBUG] SettingsManager Initialized with no stored site settings."
        );
      }
      debugLog(
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
          debugLog("SettingsManager: Settings persisted successfully", {
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
        debugLog(
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
      debugLog("SettingsManager: Updating global settings", {
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
      debugLog(
        "SettingsManager: Global settings persisted successfully"
      );
      broadcastGlobalSettingsUpdate(this.globalSettings);
      debugLog(
        "SettingsManager: Updated global settings & called broadcast"
      );
    }
    async updateSiteSettings(hostname, settings, tabId) {
      debugLog("SettingsManager: Updating site settings for", hostname, {
        tabId
      });
      if (!settings) {
        debugLog("SettingsManager: No settings provided");
        return;
      }
      if (!hostname) {
        debugLog("SettingsManager: No hostname provided");
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
        debugLog(
          "SettingsManager: Created new site config with default settings"
        );
      }
      if (!siteConfig) {
        debugLog("SettingsManager: Initializing site with default settings");
        return;
      }
      siteConfig.settings = { ...settings };
      siteConfig.activeSetting = "site";
      siteConfig.enabled = true;
      this.siteSettings.set(hostname, siteConfig);
      await this.persistSettings(hostname);
      debugLog(
        "SettingsManager: Site settings persisted successfully"
      );
      broadcastSiteSettingsUpdate(hostname, siteConfig.settings);
      debugLog(
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
      debugLog("SettingsManager: Updated site mode & called broadcast", {
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
      debugLog("SettingsManager: Disabled site & called broadcast", {
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
      debugLog(`Message Handler: Getting initial settings for ${hostname}`);
      const siteConfig = settingsManager.getSettingsForSite(hostname);
      debugLog(
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
      debugLog(
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
      debugLog("Message Handler: Processing update for", {
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
        debugLog(
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
    debugLog(
      "Background: onInstalled event triggered. Initializing settings..."
    );
    await settingsManager.initialize();
    debugLog("Background: Settings initialized via onInstalled.");
  });
  const definition = defineBackground(() => {
    debugLog("Background: Script executing.");
    settingsManager.initialize().catch(
      (err) => console.error(
        "Background: Initial settingsManager.initialize() failed:",
        err
      )
    );
    setupMessageHandler();
    setupSettingsEventHandler();
    debugLog("Background: Main execution finished, listeners set up.");
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
      const serverUrl = `${"ws:"}//${"localhost"}:${3e3}`;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja2dyb3VuZC5qcyIsInNvdXJjZXMiOlsiLi4vLi4vc3JjL3R5cGVzLnRzIiwiLi4vLi4vc3JjL3NldHRpbmdzLWV2ZW50LWhhbmRsZXIudHMiLCIuLi8uLi9zcmMvc2V0dGluZ3MtbWFuYWdlci50cyIsIi4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS93eHRAMC4xOS4yOV9AdHlwZXMrbm9kZUAyNS42LjFfcm9sbHVwQDQuNjAuMy9ub2RlX21vZHVsZXMvd3h0L2Rpc3Qvc2FuZGJveC9kZWZpbmUtYmFja2dyb3VuZC5tanMiLCIuLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vQHdlYmV4dC1jb3JlK21hdGNoLXBhdHRlcm5zQDEuMC4zL25vZGVfbW9kdWxlcy9Ad2ViZXh0LWNvcmUvbWF0Y2gtcGF0dGVybnMvbGliL2luZGV4LmpzIiwiLi4vLi4vc3JjL21lc3NhZ2UtaGFuZGxlci50cyIsIi4uLy4uL2VudHJ5cG9pbnRzL2JhY2tncm91bmQudHMiLCIuLi8uLi9ub2RlX21vZHVsZXMvLnBucG0vd2ViZXh0ZW5zaW9uLXBvbHlmaWxsQDAuMTIuMC9ub2RlX21vZHVsZXMvd2ViZXh0ZW5zaW9uLXBvbHlmaWxsL2Rpc3QvYnJvd3Nlci1wb2x5ZmlsbC5qcyIsIi4uLy4uL25vZGVfbW9kdWxlcy8ucG5wbS93eHRAMC4xOS4yOV9AdHlwZXMrbm9kZUAyNS42LjFfcm9sbHVwQDQuNjAuMy9ub2RlX21vZHVsZXMvd3h0L2Rpc3QvYnJvd3Nlci9pbmRleC5tanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGludGVyZmFjZSBBdWRpb1NldHRpbmdzIHtcbiAgdm9sdW1lOiBudW1iZXI7XG4gIGJhc3NCb29zdDogbnVtYmVyO1xuICB2b2ljZUJvb3N0OiBudW1iZXI7XG4gIG1vbm86IGJvb2xlYW47XG4gIHNwZWVkOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2l0ZVNldHRpbmdzIHtcbiAgZW5hYmxlZDogYm9vbGVhbjtcbiAgc2V0dGluZ3M/OiBBdWRpb1NldHRpbmdzO1xuICBhY3RpdmVTZXR0aW5nOiBcImdsb2JhbFwiIHwgXCJzaXRlXCIgfCBcImRpc2FibGVkXCI7XG59XG5cbmV4cG9ydCBjb25zdCBkZWZhdWx0U2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3MgPSB7XG4gIHZvbHVtZTogMTAwLFxuICBiYXNzQm9vc3Q6IDEwMCxcbiAgdm9pY2VCb29zdDogMTAwLFxuICBtb25vOiBmYWxzZSxcbiAgc3BlZWQ6IDEwMCxcbn07XG5cbmV4cG9ydCBjb25zdCBkZWZhdWx0U2l0ZVNldHRpbmdzOiBTaXRlU2V0dGluZ3MgPSB7XG4gIGVuYWJsZWQ6IHRydWUsXG4gIHNldHRpbmdzOiB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9LFxuICBhY3RpdmVTZXR0aW5nOiBcImdsb2JhbFwiLCAvLyBTdGFydHMgaW4gZ2xvYmFsIG1vZGUsIGNhbiBiZSBjaGFuZ2VkIHRvIFwic2l0ZVwiIG9yIFwiZGlzYWJsZWRcIlxufTtcblxuZXhwb3J0IHR5cGUgU3RhdGVUeXBlID0ge1xuICBnbG9iYWxTZXR0aW5nczogQXVkaW9TZXR0aW5ncztcbiAgc2l0ZVNldHRpbmdzOiBNYXA8c3RyaW5nLCBTaXRlU2V0dGluZ3M+O1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBVcGRhdGVTZXR0aW5nc01lc3NhZ2Uge1xuICB0eXBlOiBcIlVQREFURV9TRVRUSU5HU1wiO1xuICBzZXR0aW5nczogQXVkaW9TZXR0aW5ncztcbiAgZW5hYmxlZD86IGJvb2xlYW47XG4gIGlzR2xvYmFsPzogYm9vbGVhbjtcbiAgaG9zdG5hbWU/OiBzdHJpbmc7IC8vIEFkZCBvcHRpb25hbCBob3N0bmFtZVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIENvbnRlbnRTY3JpcHRSZWFkeU1lc3NhZ2Uge1xuICB0eXBlOiBcIkNPTlRFTlRfU0NSSVBUX1JFQURZXCI7XG4gIGhvc3RuYW1lPzogc3RyaW5nO1xuICB1c2luZ0dsb2JhbD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVXBkYXRlU2l0ZU1vZGVNZXNzYWdlIHtcbiAgdHlwZTogXCJVUERBVEVfU0lURV9NT0RFXCI7XG4gIGhvc3RuYW1lPzogc3RyaW5nO1xuICBtb2RlPzogXCJnbG9iYWxcIiB8IFwic2l0ZVwiIHwgXCJkaXNhYmxlZFwiO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdldEluaXRpYWxTZXR0aW5nc01lc3NhZ2Uge1xuICB0eXBlOiBcIkdFVF9JTklUSUFMX1NFVFRJTkdTXCI7XG4gIGhvc3RuYW1lPzogc3RyaW5nO1xufVxuXG5leHBvcnQgdHlwZSBNZXNzYWdlVHlwZSA9XG4gIHwgVXBkYXRlU2V0dGluZ3NNZXNzYWdlXG4gIHwgQ29udGVudFNjcmlwdFJlYWR5TWVzc2FnZVxuICB8IFVwZGF0ZVNpdGVNb2RlTWVzc2FnZVxuICB8IEdldEluaXRpYWxTZXR0aW5nc01lc3NhZ2U7XG5cbmV4cG9ydCB0eXBlIFN0b3JhZ2VEYXRhID0ge1xuICBnbG9iYWxTZXR0aW5ncz86IEF1ZGlvU2V0dGluZ3M7XG4gIHNpdGVTZXR0aW5ncz86IHsgW2hvc3RuYW1lOiBzdHJpbmddOiBTaXRlU2V0dGluZ3MgfTtcbn07XG5cbi8qKlxuICogQ2hlY2sgaWYgYWxsIGF1ZGlvIHNldHRpbmdzIGFyZSBhdCB0aGVpciBkZWZhdWx0IChkaXNhYmxlZCkgdmFsdWVzLlxuICogVGhpcyBpcyBhIHB1cmUgZnVuY3Rpb24gdXNlZCBhY3Jvc3MgY29udGVudCBzY3JpcHQgYW5kIHBvcHVwLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNTZXR0aW5nc0Rpc2FibGVkKHNldHRpbmdzOiBBdWRpb1NldHRpbmdzKTogYm9vbGVhbiB7XG4gIHJldHVybiAoXG4gICAgc2V0dGluZ3Muc3BlZWQgPT09IDEwMCAmJlxuICAgIHNldHRpbmdzLnZvbHVtZSA9PT0gMTAwICYmXG4gICAgc2V0dGluZ3MuYmFzc0Jvb3N0ID09PSAxMDAgJiZcbiAgICBzZXR0aW5ncy52b2ljZUJvb3N0ID09PSAxMDAgJiZcbiAgICAhc2V0dGluZ3MubW9ub1xuICApO1xufVxuXG4vKipcbiAqIERlYnVnIGxvZ2dlciB0aGF0IGNhbiBiZSBkaXNhYmxlZCBpbiBwcm9kdWN0aW9uLlxuICogU2V0IGxvY2FsU3RvcmFnZS5kZWJ1Z1Z2cCA9ICd0cnVlJyB0byBlbmFibGUgZGVidWcgb3V0cHV0LlxuICovXG5jb25zdCBERUJVR19FTkFCTEVEID1cbiAgdHlwZW9mIGxvY2FsU3RvcmFnZSAhPT0gXCJ1bmRlZmluZWRcIiAmJlxuICBsb2NhbFN0b3JhZ2UuZ2V0SXRlbShcImRlYnVnVnZwXCIpID09PSBcInRydWVcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGRlYnVnTG9nKC4uLmFyZ3M6IGFueVtdKSB7XG4gIGlmIChERUJVR19FTkFCTEVEKSB7XG4gICAgY29uc29sZS5sb2coXCJbVlZQXVwiLCAuLi5hcmdzKTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVidWdXYXJuKC4uLmFyZ3M6IGFueVtdKSB7XG4gIGlmIChERUJVR19FTkFCTEVEKSB7XG4gICAgY29uc29sZS53YXJuKFwiW1ZWUF1cIiwgLi4uYXJncyk7XG4gIH1cbn1cblxuIiwiaW1wb3J0IHsgc2V0dGluZ3NNYW5hZ2VyIH0gZnJvbSBcIi4vc2V0dGluZ3MtbWFuYWdlclwiO1xuaW1wb3J0IHsgQXVkaW9TZXR0aW5ncywgTWVzc2FnZVR5cGUsIFVwZGF0ZVNldHRpbmdzTWVzc2FnZSwgZGVidWdMb2cgfSBmcm9tIFwiLi90eXBlc1wiO1xuXG4vLyBIZWxwZXIgdG8gZ2V0IGhvc3RuYW1lIHNhZmVseSBhbmQgZmlsdGVyIG5vbi1odHRwKHMpIFVSTHNcbmZ1bmN0aW9uIGdldEhvc3RuYW1lKHVybDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgbnVsbCB7XG4gIGlmICghdXJsKSByZXR1cm4gbnVsbDtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWRVcmwgPSBuZXcgVVJMKHVybCk7XG4gICAgLy8gT25seSBhbGxvdyBodHRwL2h0dHBzIFVSTHMgdG8gYXZvaWQgY2hyb21lOi8vIGFuZCBvdGhlciBpbnRlcm5hbCBwYWdlc1xuICAgIGlmIChwYXJzZWRVcmwucHJvdG9jb2wgIT09IFwiaHR0cDpcIiAmJiBwYXJzZWRVcmwucHJvdG9jb2wgIT09IFwiaHR0cHM6XCIpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICByZXR1cm4gcGFyc2VkVXJsLmhvc3RuYW1lO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS53YXJuKFwiU2V0dGluZ3NFdmVudEhhbmRsZXI6IEludmFsaWQgVVJMOlwiLCB1cmwpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cblxuLy8gSGVscGVyIHRvIHNlbmQgbWVzc2FnZSB0byBhIHNwZWNpZmljIHRhYiAoZmlyZS1hbmQtZm9yZ2V0IGZvciBicm9hZGNhc3RzKVxuZnVuY3Rpb24gc2VuZE1lc3NhZ2VUb1RhYih0YWJJZDogbnVtYmVyLCBtZXNzYWdlOiBNZXNzYWdlVHlwZSwgZnJhbWVJZD86IG51bWJlcikge1xuICBjb25zdCBvcHRpb25zID0gZnJhbWVJZCAhPT0gdW5kZWZpbmVkID8geyBmcmFtZUlkIH0gOiB7fTtcbiAgY2hyb21lLnRhYnMuc2VuZE1lc3NhZ2UodGFiSWQsIG1lc3NhZ2UsIG9wdGlvbnMpXG4gICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIC8vIENhdGNoIGVycm9ycyBmcm9tIHNlbmRNZXNzYWdlLCBidXQgZG9uJ3QgYXdhaXQgaXQgaW4gdGhlIGJyb2FkY2FzdCBsb29wcy5cbiAgICAgIC8vIFRoaXMgbWFrZXMgdGhlIGJyb2FkY2FzdCBub24tYmxvY2tpbmcgZm9yIHRoZSBiYWNrZ3JvdW5kIHNjcmlwdC5cbiAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IFN0cmluZyhlcnJvcik7XG4gICAgICBpZiAoZXJyb3JNZXNzYWdlLmluY2x1ZGVzKFwiQ291bGQgbm90IGVzdGFibGlzaCBjb25uZWN0aW9uXCIpIHx8IGVycm9yTWVzc2FnZS5pbmNsdWRlcyhcIk5vIHRhYiB3aXRoIGlkXCIpKSB7XG4gICAgICAgIC8vIFRoZXNlIGFyZSBjb21tb24gaWYgdGhlIHRhYiBjbG9zZWQgb3IgY29udGVudCBzY3JpcHQgaXNuJ3QgcmVhZHk7IGxvZyBhcyBkZWJ1Zy5cbiAgICAgICAgY29uc29sZS5kZWJ1ZyhcbiAgICAgICAgICBgU2V0dGluZ3NFdmVudEhhbmRsZXI6IEVycm9yIHNlbmRpbmcgbWVzc2FnZSB0byB0YWIgJHt0YWJJZH0gKHR5cGU6ICR7bWVzc2FnZS50eXBlfSkuIFRhYiBtaWdodCBiZSBjbG9zZWQgb3IgY29udGVudCBzY3JpcHQgbm90IHJlYWR5LiBFcnJvcjpgLFxuICAgICAgICAgIGVycm9yTWVzc2FnZVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChlcnJvcikgeyAvLyBIYW5kbGUgb3RoZXIgdW5leHBlY3RlZCBlcnJvcnMgYXMgd2FybmluZ3NcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIGBTZXR0aW5nc0V2ZW50SGFuZGxlcjogVW5leHBlY3RlZCBlcnJvciBzZW5kaW5nIG1lc3NhZ2UgdG8gdGFiICR7dGFiSWR9LiBUeXBlOiAke21lc3NhZ2UudHlwZX0uIEVycm9yOmAsXG4gICAgICAgICAgZXJyb3JcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcbn1cblxuLyoqXG4gKiBCcm9hZGNhc3RzIHVwZGF0ZWQgc2l0ZS1zcGVjaWZpYyBzZXR0aW5ncyB0byByZWxldmFudCB0YWJzLlxuICogRXhwb3J0ZWQgdG8gYmUgY2FsbGVkIGRpcmVjdGx5IGJ5IFNldHRpbmdzTWFuYWdlci5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGJyb2FkY2FzdFNpdGVTZXR0aW5nc1VwZGF0ZShcbiAgaG9zdG5hbWU6IHN0cmluZyxcbiAgbmV3U2l0ZVNldHRpbmdzOiBBdWRpb1NldHRpbmdzXG4pIHtcbiAgaWYgKCFob3N0bmFtZSkge1xuICAgIGNvbnNvbGUud2FybihcIlNldHRpbmdzRXZlbnRIYW5kbGVyOiBicm9hZGNhc3RTaXRlU2V0dGluZ3NVcGRhdGUgY2FsbGVkIHdpdGggbm8gaG9zdG5hbWUuXCIpO1xuICAgIHJldHVybjtcbiAgfVxuICBkZWJ1Z0xvZyhgWyEhIV0gQnJvYWRjYXN0aW5nIHNpdGUgc2V0dGluZ3MgdXBkYXRlIGZvciAke2hvc3RuYW1lfWApO1xuICBkZWJ1Z0xvZyhcbiAgICBgU2V0dGluZ3NFdmVudEhhbmRsZXI6IEJyb2FkY2FzdGluZyBzaXRlIHNldHRpbmdzIGRhdGEgZm9yICR7aG9zdG5hbWV9YCxcbiAgICBuZXdTaXRlU2V0dGluZ3NcbiAgKTtcblxuICAvLyBRdWVyeSBmb3IgdGFicyB0aGF0IG1hdGNoIHRoZSBob3N0bmFtZSBkaXJlY3RseVxuICBjb25zdCB0YWJzID0gYXdhaXQgY2hyb21lLnRhYnMucXVlcnkoeyB1cmw6IGAqOi8vJHtob3N0bmFtZX0vKmAgfSk7XG4gIFxuICBkZWJ1Z0xvZyhcbiAgICBgW0V2ZW50SGFuZGxlcl0gRm91bmQgJHt0YWJzLmxlbmd0aH0gdGFicyBtYXRjaGluZyBob3N0bmFtZSAke2hvc3RuYW1lfSBmb3Igc2l0ZSBzZXR0aW5ncyB1cGRhdGUuYFxuICApO1xuXG4gIGZvciAoY29uc3QgdGFiIG9mIHRhYnMpIHtcbiAgICAvLyBEb3VibGUtY2hlY2sgaG9zdG5hbWUganVzdCBpbiBjYXNlIHF1ZXJ5IGlzIHRvbyBicm9hZCBvciBVUkwgY2hhbmdlcywgdGhvdWdoIHVubGlrZWx5IHdpdGggc3BlY2lmaWMgcXVlcnlcbiAgICBjb25zdCB0YWJIb3N0bmFtZSA9IGdldEhvc3RuYW1lKHRhYi51cmwpO1xuICAgIGlmICh0YWIuaWQgJiYgdGFiSG9zdG5hbWUgPT09IGhvc3RuYW1lKSB7XG4gICAgICBjb25zdCBtZXNzYWdlOiBVcGRhdGVTZXR0aW5nc01lc3NhZ2UgPSB7XG4gICAgICAgIHR5cGU6IFwiVVBEQVRFX1NFVFRJTkdTXCIsXG4gICAgICAgIHNldHRpbmdzOiBuZXdTaXRlU2V0dGluZ3MsXG4gICAgICAgIGhvc3RuYW1lOiBob3N0bmFtZSxcbiAgICAgIH07XG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtFdmVudEhhbmRsZXJdIFNlbmRpbmcgc2l0ZSBzZXR0aW5ncyB1cGRhdGUgdG8gdGFiICR7dGFiLmlkfSAoJHtob3N0bmFtZX0pYCxcbiAgICAgICAgbWVzc2FnZVxuICAgICAgKTtcbiAgICAgIHNlbmRNZXNzYWdlVG9UYWIodGFiLmlkIGFzIG51bWJlciwgbWVzc2FnZSwgMCk7IC8vIFNwZWNpZnkgbWFpbiBmcmFtZVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBUaGlzIGNhc2Ugc2hvdWxkIGlkZWFsbHkgbm90IGJlIGhpdCBpZiBjaHJvbWUudGFicy5xdWVyeSB3aXRoIFVSTCBwYXR0ZXJuIGlzIGFjY3VyYXRlXG4gICAgICBjb25zb2xlLndhcm4oYFtFdmVudEhhbmRsZXJdIFRhYiAke3RhYi5pZH0gbWF0Y2hlZCBxdWVyeSBmb3IgJHtob3N0bmFtZX0gYnV0IGdldEhvc3RuYW1lIHJlc29sdmVkIHRvICR7dGFiSG9zdG5hbWV9LiBTa2lwcGluZy5gKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBCcm9hZGNhc3RzIHVwZGF0ZWQgZ2xvYmFsIHNldHRpbmdzIHRvIHJlbGV2YW50IHRhYnMuXG4gKiBFeHBvcnRlZCB0byBiZSBjYWxsZWQgZGlyZWN0bHkgYnkgU2V0dGluZ3NNYW5hZ2VyLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYnJvYWRjYXN0R2xvYmFsU2V0dGluZ3NVcGRhdGUoXG4gIG5ld0dsb2JhbFNldHRpbmdzOiBBdWRpb1NldHRpbmdzXG4pIHtcbiAgZGVidWdMb2coYFshISFdIEJyb2FkY2FzdGluZyBnbG9iYWwgc2V0dGluZ3MgdXBkYXRlYCk7XG4gIGRlYnVnTG9nKFxuICAgIFwiU2V0dGluZ3NFdmVudEhhbmRsZXI6IEJyb2FkY2FzdGluZyBnbG9iYWwgc2V0dGluZ3MgZGF0YVwiLFxuICAgIG5ld0dsb2JhbFNldHRpbmdzXG4gICk7XG4gIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7fSk7XG4gIGRlYnVnTG9nKFxuICAgIGBbRXZlbnRIYW5kbGVyXSBGb3VuZCAke3RhYnMubGVuZ3RofSB0YWJzIHRvIGNoZWNrIGZvciBnbG9iYWwgdXBkYXRlYFxuICApO1xuICBmb3IgKGNvbnN0IHRhYiBvZiB0YWJzKSB7XG4gICAgaWYgKHRhYi5pZCAmJiB0YWIudXJsKSB7XG4gICAgICBjb25zdCB0YWJIb3N0bmFtZSA9IGdldEhvc3RuYW1lKHRhYi51cmwpO1xuICAgICAgaWYgKHRhYkhvc3RuYW1lKSB7XG4gICAgICAgIGNvbnN0IHNpdGVDb25maWcgPSBzZXR0aW5nc01hbmFnZXIuZ2V0U2V0dGluZ3NGb3JTaXRlKHRhYkhvc3RuYW1lKTtcbiAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgYFtFdmVudEhhbmRsZXJdIENoZWNraW5nIHRhYiAke3RhYi5pZH0gKCR7dGFiSG9zdG5hbWV9KSBmb3IgZ2xvYmFsIHVwZGF0ZS4gU2l0ZSBjb25maWc6YCxcbiAgICAgICAgICBzaXRlQ29uZmlnXG4gICAgICAgICk7XG4gICAgICAgIC8vIFNlbmQgdXBkYXRlIGlmIG5vIHNpdGUgY29uZmlnIGV4aXN0cyBvciBpZiBzaXRlIGlzIHNldCB0byBnbG9iYWwgbW9kZVxuICAgICAgICBpZiAoIXNpdGVDb25maWcgfHwgc2l0ZUNvbmZpZy5hY3RpdmVTZXR0aW5nID09PSBcImdsb2JhbFwiKSB7XG4gICAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgICBgW0V2ZW50SGFuZGxlcl0gVGFiICR7dGFiLmlkfSAoJHt0YWJIb3N0bmFtZX0pIHF1YWxpZmllcyBmb3IgZ2xvYmFsIHVwZGF0ZS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgICBjb25zdCBtZXNzYWdlOiBVcGRhdGVTZXR0aW5nc01lc3NhZ2UgPSB7XG4gICAgICAgICAgICB0eXBlOiBcIlVQREFURV9TRVRUSU5HU1wiLFxuICAgICAgICAgICAgc2V0dGluZ3M6IG5ld0dsb2JhbFNldHRpbmdzLFxuICAgICAgICAgICAgaG9zdG5hbWU6IHRhYkhvc3RuYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgICAgZGVidWdMb2coXG4gICAgICAgICAgICBgW0V2ZW50SGFuZGxlcl0gU2VuZGluZyBnbG9iYWwgdXBkYXRlIHRvIHRhYiAke3RhYi5pZH0gKCR7dGFiSG9zdG5hbWV9KWAsXG4gICAgICAgICAgICBtZXNzYWdlXG4gICAgICAgICAgKTtcbiAgICAgICAgICBzZW5kTWVzc2FnZVRvVGFiKHRhYi5pZCwgbWVzc2FnZSwgMCk7IC8vIFNwZWNpZnkgbWFpbiBmcmFtZVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbi8qKlxuICogQnJvYWRjYXN0cyB1cGRhdGVkIHNpdGUgbW9kZSBhbmQgdGhlIGVmZmVjdGl2ZSBzZXR0aW5ncyB0byByZWxldmFudCB0YWJzLlxuICogRXhwb3J0ZWQgdG8gYmUgY2FsbGVkIGRpcmVjdGx5IGJ5IFNldHRpbmdzTWFuYWdlci5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGJyb2FkY2FzdFNpdGVNb2RlVXBkYXRlKFxuICBob3N0bmFtZTogc3RyaW5nLFxuICBtb2RlOiBzdHJpbmcsXG4gIGVmZmVjdGl2ZVNldHRpbmdzOiBBdWRpb1NldHRpbmdzXG4pIHtcbiAgaWYgKCFob3N0bmFtZSkge1xuICAgIGNvbnNvbGUud2FybihcIlNldHRpbmdzRXZlbnRIYW5kbGVyOiBicm9hZGNhc3RTaXRlTW9kZVVwZGF0ZSBjYWxsZWQgd2l0aCBubyBob3N0bmFtZS5cIik7XG4gICAgcmV0dXJuO1xuICB9XG4gIGRlYnVnTG9nKGBbISEhXSBCcm9hZGNhc3Rpbmcgc2l0ZSBtb2RlIHVwZGF0ZSBmb3IgJHtob3N0bmFtZX0gdG8gJHttb2RlfWApO1xuICBkZWJ1Z0xvZyhgU2V0dGluZ3NFdmVudEhhbmRsZXI6IEJyb2FkY2FzdGluZyBtb2RlIGRhdGEgZm9yICR7aG9zdG5hbWV9YCwge1xuICAgIG1vZGUsXG4gICAgZWZmZWN0aXZlU2V0dGluZ3MsXG4gIH0pO1xuXG4gIC8vIFF1ZXJ5IGZvciB0YWJzIHRoYXQgbWF0Y2ggdGhlIGhvc3RuYW1lIGRpcmVjdGx5XG4gIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7IHVybDogYCo6Ly8ke2hvc3RuYW1lfS8qYCB9KTtcblxuICBkZWJ1Z0xvZyhcbiAgICBgW0V2ZW50SGFuZGxlcl0gRm91bmQgJHt0YWJzLmxlbmd0aH0gdGFicyBtYXRjaGluZyBob3N0bmFtZSAke2hvc3RuYW1lfSBmb3Igc2l0ZSBtb2RlIHVwZGF0ZS5gXG4gICk7XG5cbiAgZm9yIChjb25zdCB0YWIgb2YgdGFicykge1xuICAgIC8vIERvdWJsZS1jaGVjayBob3N0bmFtZVxuICAgIGNvbnN0IHRhYkhvc3RuYW1lID0gZ2V0SG9zdG5hbWUodGFiLnVybCk7XG4gICAgaWYgKHRhYi5pZCAmJiB0YWJIb3N0bmFtZSA9PT0gaG9zdG5hbWUpIHtcbiAgICAgIGNvbnN0IG1lc3NhZ2U6IFVwZGF0ZVNldHRpbmdzTWVzc2FnZSA9IHtcbiAgICAgICAgdHlwZTogXCJVUERBVEVfU0VUVElOR1NcIiwgLy8gU3RpbGwgc2VuZCBVUERBVEVfU0VUVElOR1NcbiAgICAgICAgc2V0dGluZ3M6IGVmZmVjdGl2ZVNldHRpbmdzLCAvLyBTZW5kIHRoZSBzZXR0aW5ncyBhcHByb3ByaWF0ZSBmb3IgdGhlIG5ldyBtb2RlXG4gICAgICAgIGhvc3RuYW1lOiBob3N0bmFtZSxcbiAgICAgIH07XG4gICAgICBkZWJ1Z0xvZyhcbiAgICAgICAgYFtFdmVudEhhbmRsZXJdIFNlbmRpbmcgc2l0ZSBtb2RlIHVwZGF0ZSAoYXMgVVBEQVRFX1NFVFRJTkdTKSB0byB0YWIgJHt0YWIuaWR9ICgke2hvc3RuYW1lfSlgLFxuICAgICAgICBtZXNzYWdlXG4gICAgICApO1xuICAgICAgc2VuZE1lc3NhZ2VUb1RhYih0YWIuaWQsIG1lc3NhZ2UsIDApOyAvLyBTcGVjaWZ5IG1haW4gZnJhbWVcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKGBbRXZlbnRIYW5kbGVyXSBUYWIgJHt0YWIuaWR9IG1hdGNoZWQgcXVlcnkgZm9yICR7aG9zdG5hbWV9IChtb2RlIHVwZGF0ZSkgYnV0IGdldEhvc3RuYW1lIHJlc29sdmVkIHRvICR7dGFiSG9zdG5hbWV9LiBTa2lwcGluZy5gKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwU2V0dGluZ3NFdmVudEhhbmRsZXIoKSB7XG4gIGRlYnVnTG9nKFwiU2V0dGluZ3NFdmVudEhhbmRsZXI6IExpc3RlbmVycyBhcmUgbm93IGhhbmRsZWQgZGlyZWN0bHkgYnkgU2V0dGluZ3NNYW5hZ2VyXCIpO1xufVxuIiwiaW1wb3J0IHtcbiAgQXVkaW9TZXR0aW5ncyxcbiAgU2l0ZVNldHRpbmdzLFxuICBkZWZhdWx0U2V0dGluZ3MsXG4gIGRlYnVnTG9nLFxufSBmcm9tIFwiLi90eXBlc1wiO1xuLy8gSW1wb3J0IHRoZSBicm9hZGNhc3QgZnVuY3Rpb25zIGRpcmVjdGx5XG5pbXBvcnQge1xuICBicm9hZGNhc3RTaXRlU2V0dGluZ3NVcGRhdGUsXG4gIGJyb2FkY2FzdFNpdGVNb2RlVXBkYXRlLFxuICBicm9hZGNhc3RHbG9iYWxTZXR0aW5nc1VwZGF0ZSxcbn0gZnJvbSBcIi4vc2V0dGluZ3MtZXZlbnQtaGFuZGxlclwiO1xuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NNYW5hZ2VyIHtcbiAgZ2xvYmFsU2V0dGluZ3M6IEF1ZGlvU2V0dGluZ3M7XG4gIHByaXZhdGUgc2l0ZVNldHRpbmdzOiBNYXA8c3RyaW5nLCBTaXRlU2V0dGluZ3M+O1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMuZ2xvYmFsU2V0dGluZ3MgPSB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9O1xuICAgIHRoaXMuc2l0ZVNldHRpbmdzID0gbmV3IE1hcCgpO1xuICB9XG5cbiAgYXN5bmMgaW5pdGlhbGl6ZSgpIHtcbiAgICBjb25zdCBzdG9yYWdlID0gYXdhaXQgY2hyb21lLnN0b3JhZ2Uuc3luYy5nZXQoW1xuICAgICAgXCJnbG9iYWxTZXR0aW5nc1wiLFxuICAgICAgXCJzaXRlU2V0dGluZ3NcIixcbiAgICBdKTtcbiAgICB0aGlzLmdsb2JhbFNldHRpbmdzID0gc3RvcmFnZS5nbG9iYWxTZXR0aW5ncyB8fCB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9O1xuXG4gICAgaWYgKHN0b3JhZ2Uuc2l0ZVNldHRpbmdzKSB7XG4gICAgICB0aGlzLnNpdGVTZXR0aW5ncyA9IG5ldyBNYXAoT2JqZWN0LmVudHJpZXMoc3RvcmFnZS5zaXRlU2V0dGluZ3MpKTtcbiAgICAgIGRlYnVnTG9nKFxuICAgICAgICBcIltERUJVR10gU2V0dGluZ3NNYW5hZ2VyIEluaXRpYWxpemVkIHdpdGggc3RvcmVkIHNpdGUgc2V0dGluZ3MuIFNpdGVTZXR0aW5ncyBNYXA6XCIsXG4gICAgICAgIHRoaXMuc2l0ZVNldHRpbmdzXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnNpdGVTZXR0aW5ncyA9IG5ldyBNYXAoKTsgLy8gRW5zdXJlIG1hcCBpcyBlbXB0eSBpZiBub3RoaW5nIGluIHN0b3JhZ2VcbiAgICAgIGRlYnVnTG9nKFxuICAgICAgICBcIltERUJVR10gU2V0dGluZ3NNYW5hZ2VyIEluaXRpYWxpemVkIHdpdGggbm8gc3RvcmVkIHNpdGUgc2V0dGluZ3MuXCJcbiAgICAgICk7XG4gICAgfVxuICAgIGRlYnVnTG9nKFxuICAgICAgXCJbREVCVUddIFNldHRpbmdzTWFuYWdlciBJbml0aWFsaXplZC4gR2xvYmFsIFNldHRpbmdzOlwiLFxuICAgICAgdGhpcy5nbG9iYWxTZXR0aW5nc1xuICAgICk7XG4gIH1cblxuICBwcml2YXRlIHBlcnNpc3RUaW1lb3V0OiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuICBwcml2YXRlIHBlbmRpbmdTZXR0aW5ncyA9IHtcbiAgICBnbG9iYWxTZXR0aW5nczogbnVsbCBhcyBBdWRpb1NldHRpbmdzIHwgbnVsbCxcbiAgICBzaXRlU2V0dGluZ3M6IG51bGwgYXMgeyBbaG9zdG5hbWU6IHN0cmluZ106IFNpdGVTZXR0aW5ncyB9IHwgbnVsbCxcbiAgfTtcblxuICBwcml2YXRlIGFzeW5jIHBlcnNpc3RTZXR0aW5ncyhob3N0bmFtZT86IHN0cmluZykge1xuICAgIC8vIENsZWFyIGFueSBleGlzdGluZyB0aW1lb3V0XG4gICAgaWYgKHRoaXMucGVyc2lzdFRpbWVvdXQpIHtcbiAgICAgIGNsZWFyVGltZW91dCh0aGlzLnBlcnNpc3RUaW1lb3V0KTtcbiAgICB9XG5cbiAgICAvLyBRdWV1ZSB0aGUgY3VycmVudCBzZXR0aW5nc1xuICAgIHRoaXMucGVuZGluZ1NldHRpbmdzLmdsb2JhbFNldHRpbmdzID0geyAuLi50aGlzLmdsb2JhbFNldHRpbmdzIH07XG4gICAgdGhpcy5wZW5kaW5nU2V0dGluZ3Muc2l0ZVNldHRpbmdzID0gT2JqZWN0LmZyb21FbnRyaWVzKHRoaXMuc2l0ZVNldHRpbmdzKTtcblxuICAgIC8vIFNldCBhIG5ldyB0aW1lb3V0IHRvIGJhdGNoIHdyaXRlIHNldHRpbmdzXG4gICAgdGhpcy5wZXJzaXN0VGltZW91dCA9IHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSB7XG4gICAgICAgICAgZ2xvYmFsU2V0dGluZ3M6IHRoaXMucGVuZGluZ1NldHRpbmdzLmdsb2JhbFNldHRpbmdzLFxuICAgICAgICAgIHNpdGVTZXR0aW5nczogdGhpcy5wZW5kaW5nU2V0dGluZ3Muc2l0ZVNldHRpbmdzLFxuICAgICAgICB9O1xuICAgICAgICBhd2FpdCBjaHJvbWUuc3RvcmFnZS5zeW5jLnNldChzZXR0aW5ncyk7XG4gICAgICAgIGRlYnVnTG9nKFwiU2V0dGluZ3NNYW5hZ2VyOiBTZXR0aW5ncyBwZXJzaXN0ZWQgc3VjY2Vzc2Z1bGx5XCIsIHtcbiAgICAgICAgICBob3N0bmFtZSxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ2xlYXIgcGVuZGluZyBzZXR0aW5nc1xuICAgICAgICB0aGlzLnBlbmRpbmdTZXR0aW5ncy5nbG9iYWxTZXR0aW5ncyA9IG51bGw7XG4gICAgICAgIHRoaXMucGVuZGluZ1NldHRpbmdzLnNpdGVTZXR0aW5ncyA9IG51bGw7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKFwiU2V0dGluZ3NNYW5hZ2VyOiBGYWlsZWQgdG8gcGVyc2lzdCBzZXR0aW5nczpcIiwgZXJyb3IpO1xuICAgICAgfVxuICAgIH0sIDIwMCk7IC8vIFJlZHVjZWQgZGVib3VuY2UgdGltZSB0byAyMDBtc1xuICB9XG5cbiAgZ2V0U2V0dGluZ3NGb3JTaXRlKGhvc3RuYW1lOiBzdHJpbmcpOiBTaXRlU2V0dGluZ3Mge1xuICAgIC8vIENoYW5nZWQgcmV0dXJuIHR5cGUgdG8gbm9uLW51bGxhYmxlXG4gICAgbGV0IHNpdGVDb25maWcgPSB0aGlzLnNpdGVTZXR0aW5ncy5nZXQoaG9zdG5hbWUpO1xuXG4gICAgLy8gSWYgbm8gc2l0ZSBjb25maWcgZXhpc3RzLCBjcmVhdGUgYSBkZWZhdWx0IG9uZSB1c2luZyBnbG9iYWwgc2V0dGluZ3NcbiAgICBpZiAoIXNpdGVDb25maWcpIHtcbiAgICAgIGRlYnVnTG9nKFxuICAgICAgICBgU2V0dGluZ3NNYW5hZ2VyOiBObyBjb25maWcgZm91bmQgZm9yICR7aG9zdG5hbWV9LCBjcmVhdGluZyBkZWZhdWx0IGdsb2JhbCBjb25maWcuYFxuICAgICAgKTtcbiAgICAgIHNpdGVDb25maWcgPSB7XG4gICAgICAgIGVuYWJsZWQ6IHRydWUsIC8vIEFzc3VtZSBlbmFibGVkIGJ5IGRlZmF1bHRcbiAgICAgICAgYWN0aXZlU2V0dGluZzogXCJnbG9iYWxcIixcbiAgICAgICAgc2V0dGluZ3M6IHsgLi4udGhpcy5nbG9iYWxTZXR0aW5ncyB9LCAvLyBVc2UgY3VycmVudCBnbG9iYWwgc2V0dGluZ3NcbiAgICAgIH07XG4gICAgICAvLyBOb3RlOiBXZSBkb24ndCBwZXJzaXN0IHRoaXMgZGVmYXVsdCBjb25maWcgaW1tZWRpYXRlbHkuXG4gICAgICAvLyBJdCBvbmx5IGdldHMgcGVyc2lzdGVkIGlmIHRoZSB1c2VyIGV4cGxpY2l0bHkgY2hhbmdlcyBzZXR0aW5ncyBvciBtb2RlIGZvciB0aGlzIHNpdGUgbGF0ZXIuXG4gICAgfVxuXG4gICAgLy8gSWYgaW4gZ2xvYmFsIG1vZGUsIG1ha2Ugc3VyZSB3ZSdyZSB1c2luZyBnbG9iYWwgc2V0dGluZ3NcbiAgICBpZiAoc2l0ZUNvbmZpZy5hY3RpdmVTZXR0aW5nID09PSBcImdsb2JhbFwiKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICAuLi5zaXRlQ29uZmlnLFxuICAgICAgICBzZXR0aW5nczogeyAuLi50aGlzLmdsb2JhbFNldHRpbmdzIH0sXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEZvciBkaXNhYmxlZCBzaXRlcywgcmV0dXJuIGNvbmZpZyBidXQgd2l0aCBkaXNhYmxlZCBmbGFnXG4gICAgaWYgKHNpdGVDb25maWcuYWN0aXZlU2V0dGluZyA9PT0gXCJkaXNhYmxlZFwiKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICAuLi5zaXRlQ29uZmlnLFxuICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIHNpdGVDb25maWc7XG4gIH1cblxuICBhc3luYyB1cGRhdGVHbG9iYWxTZXR0aW5ncyhcbiAgICBzZXR0aW5nczogUGFydGlhbDxBdWRpb1NldHRpbmdzPixcbiAgICB0YWJJZD86IG51bWJlcixcbiAgICBob3N0bmFtZT86IHN0cmluZ1xuICApIHtcbiAgICBkZWJ1Z0xvZyhcIlNldHRpbmdzTWFuYWdlcjogVXBkYXRpbmcgZ2xvYmFsIHNldHRpbmdzXCIsIHtcbiAgICAgIG9sZFNldHRpbmdzOiB7IC4uLnRoaXMuZ2xvYmFsU2V0dGluZ3MgfSxcbiAgICAgIG5ld1NldHRpbmdzOiBzZXR0aW5ncyxcbiAgICAgIHRhYklkLFxuICAgICAgaG9zdG5hbWUsXG4gICAgfSk7XG5cbiAgICAvLyBVcGRhdGUgc2V0dGluZ3NcbiAgICB0aGlzLmdsb2JhbFNldHRpbmdzID0ge1xuICAgICAgLi4udGhpcy5nbG9iYWxTZXR0aW5ncyxcbiAgICAgIC4uLnNldHRpbmdzLFxuICAgIH07XG5cbiAgICAvLyBQZXJzaXN0IHNldHRpbmdzIGZpcnN0IHRvIGVuc3VyZSBkYXRhIGludGVncml0eVxuICAgIGF3YWl0IHRoaXMucGVyc2lzdFNldHRpbmdzKGhvc3RuYW1lKTtcbiAgICBkZWJ1Z0xvZyhcbiAgICAgIFwiU2V0dGluZ3NNYW5hZ2VyOiBHbG9iYWwgc2V0dGluZ3MgcGVyc2lzdGVkIHN1Y2Nlc3NmdWxseVwiXG4gICAgKTtcblxuICAgIC8vIFRoZW4gYnJvYWRjYXN0IHRoZSB1cGRhdGUgdG8gb3RoZXIgdGFic1xuICAgIGJyb2FkY2FzdEdsb2JhbFNldHRpbmdzVXBkYXRlKHRoaXMuZ2xvYmFsU2V0dGluZ3MpO1xuICAgIGRlYnVnTG9nKFxuICAgICAgXCJTZXR0aW5nc01hbmFnZXI6IFVwZGF0ZWQgZ2xvYmFsIHNldHRpbmdzICYgY2FsbGVkIGJyb2FkY2FzdFwiXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZVNpdGVTZXR0aW5ncyhcbiAgICBob3N0bmFtZTogc3RyaW5nLFxuICAgIHNldHRpbmdzOiBBdWRpb1NldHRpbmdzLFxuICAgIHRhYklkPzogbnVtYmVyXG4gICkge1xuICAgIGRlYnVnTG9nKFwiU2V0dGluZ3NNYW5hZ2VyOiBVcGRhdGluZyBzaXRlIHNldHRpbmdzIGZvclwiLCBob3N0bmFtZSwge1xuICAgICAgdGFiSWQsXG4gICAgfSk7XG5cbiAgICBpZiAoIXNldHRpbmdzKSB7XG4gICAgICBkZWJ1Z0xvZyhcIlNldHRpbmdzTWFuYWdlcjogTm8gc2V0dGluZ3MgcHJvdmlkZWRcIik7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghaG9zdG5hbWUpIHtcbiAgICAgIGRlYnVnTG9nKFwiU2V0dGluZ3NNYW5hZ2VyOiBObyBob3N0bmFtZSBwcm92aWRlZFwiKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgc2l0ZUNvbmZpZyA9IHRoaXMuc2l0ZVNldHRpbmdzLmdldChob3N0bmFtZSk7XG4gICAgY29uc3QgaXNOZXdTaXRlID0gIXNpdGVDb25maWc7XG5cbiAgICBpZiAoaXNOZXdTaXRlKSB7XG4gICAgICBzaXRlQ29uZmlnID0ge1xuICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICBhY3RpdmVTZXR0aW5nOiBcInNpdGVcIixcbiAgICAgICAgc2V0dGluZ3M6IHsgLi4uZGVmYXVsdFNldHRpbmdzIH0sXG4gICAgICB9O1xuICAgICAgZGVidWdMb2coXG4gICAgICAgIFwiU2V0dGluZ3NNYW5hZ2VyOiBDcmVhdGVkIG5ldyBzaXRlIGNvbmZpZyB3aXRoIGRlZmF1bHQgc2V0dGluZ3NcIlxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKCFzaXRlQ29uZmlnKSB7XG4gICAgICBkZWJ1Z0xvZyhcIlNldHRpbmdzTWFuYWdlcjogSW5pdGlhbGl6aW5nIHNpdGUgd2l0aCBkZWZhdWx0IHNldHRpbmdzXCIpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBVcGRhdGUgd2l0aCBuZXcgc2V0dGluZ3NcbiAgICBzaXRlQ29uZmlnLnNldHRpbmdzID0geyAuLi5zZXR0aW5ncyB9O1xuICAgIHNpdGVDb25maWcuYWN0aXZlU2V0dGluZyA9IFwic2l0ZVwiO1xuICAgIHNpdGVDb25maWcuZW5hYmxlZCA9IHRydWU7XG4gICAgdGhpcy5zaXRlU2V0dGluZ3Muc2V0KGhvc3RuYW1lLCBzaXRlQ29uZmlnKTtcblxuICAgIC8vIFBlcnNpc3Qgc2V0dGluZ3MgZmlyc3QgdG8gZW5zdXJlIGRhdGEgaW50ZWdyaXR5XG4gICAgYXdhaXQgdGhpcy5wZXJzaXN0U2V0dGluZ3MoaG9zdG5hbWUpO1xuICAgIGRlYnVnTG9nKFxuICAgICAgXCJTZXR0aW5nc01hbmFnZXI6IFNpdGUgc2V0dGluZ3MgcGVyc2lzdGVkIHN1Y2Nlc3NmdWxseVwiXG4gICAgKTtcblxuICAgIC8vIFRoZW4gYnJvYWRjYXN0IHRoZSB1cGRhdGUgdG8gb3RoZXIgdGFic1xuICAgIGJyb2FkY2FzdFNpdGVTZXR0aW5nc1VwZGF0ZShob3N0bmFtZSwgc2l0ZUNvbmZpZy5zZXR0aW5ncyk7XG4gICAgZGVidWdMb2coXG4gICAgICBcIlNldHRpbmdzTWFuYWdlcjogVXBkYXRlZCBzaXRlIHNldHRpbmdzICYgY2FsbGVkIGJyb2FkY2FzdFwiXG4gICAgKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZVNpdGVNb2RlKFxuICAgIGhvc3RuYW1lOiBzdHJpbmcsXG4gICAgbW9kZTogXCJnbG9iYWxcIiB8IFwic2l0ZVwiIHwgXCJkaXNhYmxlZFwiLFxuICAgIHRhYklkPzogbnVtYmVyXG4gICkge1xuICAgIGxldCBzaXRlQ29uZmlnID0gdGhpcy5zaXRlU2V0dGluZ3MuZ2V0KGhvc3RuYW1lKTtcbiAgICBjb25zdCBvbGRNb2RlID0gc2l0ZUNvbmZpZz8uYWN0aXZlU2V0dGluZztcblxuICAgIGlmICghc2l0ZUNvbmZpZykge1xuICAgICAgLy8gSW5pdGlhbGl6ZSB3aXRoIGN1cnJlbnQgZ2xvYmFsIHNldHRpbmdzIGlmIG5vIGNvbmZpZyBleGlzdHNcbiAgICAgIHNpdGVDb25maWcgPSB7XG4gICAgICAgIGVuYWJsZWQ6IG1vZGUgIT09IFwiZGlzYWJsZWRcIixcbiAgICAgICAgYWN0aXZlU2V0dGluZzogbW9kZSxcbiAgICAgICAgc2V0dGluZ3M6IHsgLi4udGhpcy5nbG9iYWxTZXR0aW5ncyB9LFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBVcGRhdGUgbW9kZSBhbmQgZW5hYmxlZCBzdGF0ZSwgYnV0IHByZXNlcnZlIHNldHRpbmdzXG4gICAgc2l0ZUNvbmZpZy5hY3RpdmVTZXR0aW5nID0gbW9kZTtcbiAgICBzaXRlQ29uZmlnLmVuYWJsZWQgPSBtb2RlICE9PSBcImRpc2FibGVkXCI7XG5cbiAgICB0aGlzLnNpdGVTZXR0aW5ncy5zZXQoaG9zdG5hbWUsIHNpdGVDb25maWcpO1xuICAgIGF3YWl0IHRoaXMucGVyc2lzdFNldHRpbmdzKGhvc3RuYW1lKTtcblxuICAgIC8vIERldGVybWluZSB3aGljaCBzZXR0aW5ncyB0byBkaXNwbGF5IChub3QgbW9kaWZ5KVxuICAgIGNvbnN0IGRpc3BsYXlTZXR0aW5ncyA9XG4gICAgICBtb2RlID09PSBcImRpc2FibGVkXCJcbiAgICAgICAgPyB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9XG4gICAgICAgIDogbW9kZSA9PT0gXCJnbG9iYWxcIlxuICAgICAgICA/IHsgLi4udGhpcy5nbG9iYWxTZXR0aW5ncyB9XG4gICAgICAgIDogc2l0ZUNvbmZpZy5zZXR0aW5ncyB8fCB7IC4uLmRlZmF1bHRTZXR0aW5ncyB9OyAvLyBVc2UgZGVmYXVsdHMgaWYgc2l0ZSBzZXR0aW5ncyBhcmUgc29tZWhvdyB1bmRlZmluZWRcblxuICAgIC8vIEVuc3VyZSB0aGUgb2JqZWN0IHBhc3NlZCBzdHJpY3RseSBtYXRjaGVzIEF1ZGlvU2V0dGluZ3MgdHlwZVxuICAgIGNvbnN0IHNldHRpbmdzVG9Ccm9hZGNhc3Q6IEF1ZGlvU2V0dGluZ3MgPSB7IC4uLmRpc3BsYXlTZXR0aW5ncyB9O1xuXG4gICAgLy8gRGlyZWN0bHkgY2FsbCB0aGUgYnJvYWRjYXN0IGZ1bmN0aW9uIGluc3RlYWQgb2YgZW1pdHRpbmcgYW4gZXZlbnRcbiAgICBicm9hZGNhc3RTaXRlTW9kZVVwZGF0ZShob3N0bmFtZSwgbW9kZSwgc2V0dGluZ3NUb0Jyb2FkY2FzdCk7XG4gICAgZGVidWdMb2coXCJTZXR0aW5nc01hbmFnZXI6IFVwZGF0ZWQgc2l0ZSBtb2RlICYgY2FsbGVkIGJyb2FkY2FzdFwiLCB7XG4gICAgICBob3N0bmFtZSxcbiAgICAgIG1vZGUsXG4gICAgICBzZXR0aW5nc1RvQnJvYWRjYXN0LFxuICAgIH0pOyAvLyBVcGRhdGVkIGxvZ1xuICAgIHJldHVybiB7IHNldHRpbmdzVG9Vc2U6IHNldHRpbmdzVG9Ccm9hZGNhc3QsIHNpdGVDb25maWcgfTsgLy8gUmV0dXJuIHRoZSBndWFyYW50ZWVkIG9iamVjdFxuICB9XG5cbiAgYXN5bmMgZGlzYWJsZVNpdGUoaG9zdG5hbWU6IHN0cmluZywgdGFiSWQ/OiBudW1iZXIpIHtcbiAgICBsZXQgc2l0ZUNvbmZpZyA9IHRoaXMuc2l0ZVNldHRpbmdzLmdldChob3N0bmFtZSk7XG5cbiAgICBpZiAoIXNpdGVDb25maWcpIHtcbiAgICAgIC8vIElmIG5vIGNvbmZpZyBleGlzdHMsIGNyZWF0ZSBvbmUgd2l0aCBjdXJyZW50IGdsb2JhbCBzZXR0aW5nc1xuICAgICAgc2l0ZUNvbmZpZyA9IHtcbiAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICAgIGFjdGl2ZVNldHRpbmc6IFwiZGlzYWJsZWRcIixcbiAgICAgICAgc2V0dGluZ3M6IHsgLi4udGhpcy5nbG9iYWxTZXR0aW5ncyB9LFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gS2VlcCBleGlzdGluZyBzZXR0aW5ncywganVzdCB1cGRhdGUgdGhlIG1vZGVcbiAgICAgIHNpdGVDb25maWcuZW5hYmxlZCA9IGZhbHNlO1xuICAgICAgc2l0ZUNvbmZpZy5hY3RpdmVTZXR0aW5nID0gXCJkaXNhYmxlZFwiO1xuICAgIH1cblxuICAgIHRoaXMuc2l0ZVNldHRpbmdzLnNldChob3N0bmFtZSwgc2l0ZUNvbmZpZyk7XG4gICAgYXdhaXQgdGhpcy5wZXJzaXN0U2V0dGluZ3MoaG9zdG5hbWUpO1xuXG4gICAgLy8gRGlyZWN0bHkgY2FsbCB0aGUgYnJvYWRjYXN0IGZ1bmN0aW9uIGluc3RlYWQgb2YgZW1pdHRpbmcgYW4gZXZlbnRcbiAgICAvLyBFbnN1cmUgdGhlIHBhc3NlZCBvYmplY3Qgc3RyaWN0bHkgbWF0Y2hlcyBBdWRpb1NldHRpbmdzIHR5cGVcbiAgICBjb25zdCBkaXNhYmxlZFNldHRpbmdzOiBBdWRpb1NldHRpbmdzID0geyAuLi5kZWZhdWx0U2V0dGluZ3MgfTtcbiAgICBicm9hZGNhc3RTaXRlTW9kZVVwZGF0ZShob3N0bmFtZSwgXCJkaXNhYmxlZFwiLCBkaXNhYmxlZFNldHRpbmdzKTtcbiAgICBkZWJ1Z0xvZyhcIlNldHRpbmdzTWFuYWdlcjogRGlzYWJsZWQgc2l0ZSAmIGNhbGxlZCBicm9hZGNhc3RcIiwge1xuICAgICAgaG9zdG5hbWUsXG4gICAgfSk7IC8vIEFkZGVkIGxvZ1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGFjdHVhbFNldHRpbmdzOiBzaXRlQ29uZmlnLnNldHRpbmdzLCAvLyBLZWVwIHJldHVybmluZyB0aGlzIGZvciBwb3RlbnRpYWwgaW50ZXJuYWwgdXNlXG4gICAgICBkaXNwbGF5U2V0dGluZ3M6IHsgLi4uZGVmYXVsdFNldHRpbmdzIH0sXG4gICAgfTtcbiAgfVxufVxuXG5leHBvcnQgY29uc3Qgc2V0dGluZ3NNYW5hZ2VyID0gbmV3IFNldHRpbmdzTWFuYWdlcigpO1xuIiwiZXhwb3J0IGZ1bmN0aW9uIGRlZmluZUJhY2tncm91bmQoYXJnKSB7XG4gIGlmIChhcmcgPT0gbnVsbCB8fCB0eXBlb2YgYXJnID09PSBcImZ1bmN0aW9uXCIpIHJldHVybiB7IG1haW46IGFyZyB9O1xuICByZXR1cm4gYXJnO1xufVxuIiwiLy8gc3JjL2luZGV4LnRzXG52YXIgX01hdGNoUGF0dGVybiA9IGNsYXNzIHtcbiAgY29uc3RydWN0b3IobWF0Y2hQYXR0ZXJuKSB7XG4gICAgaWYgKG1hdGNoUGF0dGVybiA9PT0gXCI8YWxsX3VybHM+XCIpIHtcbiAgICAgIHRoaXMuaXNBbGxVcmxzID0gdHJ1ZTtcbiAgICAgIHRoaXMucHJvdG9jb2xNYXRjaGVzID0gWy4uLl9NYXRjaFBhdHRlcm4uUFJPVE9DT0xTXTtcbiAgICAgIHRoaXMuaG9zdG5hbWVNYXRjaCA9IFwiKlwiO1xuICAgICAgdGhpcy5wYXRobmFtZU1hdGNoID0gXCIqXCI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGdyb3VwcyA9IC8oLiopOlxcL1xcLyguKj8pKFxcLy4qKS8uZXhlYyhtYXRjaFBhdHRlcm4pO1xuICAgICAgaWYgKGdyb3VwcyA9PSBudWxsKVxuICAgICAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihtYXRjaFBhdHRlcm4sIFwiSW5jb3JyZWN0IGZvcm1hdFwiKTtcbiAgICAgIGNvbnN0IFtfLCBwcm90b2NvbCwgaG9zdG5hbWUsIHBhdGhuYW1lXSA9IGdyb3VwcztcbiAgICAgIHZhbGlkYXRlUHJvdG9jb2wobWF0Y2hQYXR0ZXJuLCBwcm90b2NvbCk7XG4gICAgICB2YWxpZGF0ZUhvc3RuYW1lKG1hdGNoUGF0dGVybiwgaG9zdG5hbWUpO1xuICAgICAgdmFsaWRhdGVQYXRobmFtZShtYXRjaFBhdHRlcm4sIHBhdGhuYW1lKTtcbiAgICAgIHRoaXMucHJvdG9jb2xNYXRjaGVzID0gcHJvdG9jb2wgPT09IFwiKlwiID8gW1wiaHR0cFwiLCBcImh0dHBzXCJdIDogW3Byb3RvY29sXTtcbiAgICAgIHRoaXMuaG9zdG5hbWVNYXRjaCA9IGhvc3RuYW1lO1xuICAgICAgdGhpcy5wYXRobmFtZU1hdGNoID0gcGF0aG5hbWU7XG4gICAgfVxuICB9XG4gIGluY2x1ZGVzKHVybCkge1xuICAgIGlmICh0aGlzLmlzQWxsVXJscylcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIGNvbnN0IHUgPSB0eXBlb2YgdXJsID09PSBcInN0cmluZ1wiID8gbmV3IFVSTCh1cmwpIDogdXJsIGluc3RhbmNlb2YgTG9jYXRpb24gPyBuZXcgVVJMKHVybC5ocmVmKSA6IHVybDtcbiAgICByZXR1cm4gISF0aGlzLnByb3RvY29sTWF0Y2hlcy5maW5kKChwcm90b2NvbCkgPT4ge1xuICAgICAgaWYgKHByb3RvY29sID09PSBcImh0dHBcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNIdHRwTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwiaHR0cHNcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNIdHRwc01hdGNoKHUpO1xuICAgICAgaWYgKHByb3RvY29sID09PSBcImZpbGVcIilcbiAgICAgICAgcmV0dXJuIHRoaXMuaXNGaWxlTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwiZnRwXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzRnRwTWF0Y2godSk7XG4gICAgICBpZiAocHJvdG9jb2wgPT09IFwidXJuXCIpXG4gICAgICAgIHJldHVybiB0aGlzLmlzVXJuTWF0Y2godSk7XG4gICAgfSk7XG4gIH1cbiAgaXNIdHRwTWF0Y2godXJsKSB7XG4gICAgcmV0dXJuIHVybC5wcm90b2NvbCA9PT0gXCJodHRwOlwiICYmIHRoaXMuaXNIb3N0UGF0aE1hdGNoKHVybCk7XG4gIH1cbiAgaXNIdHRwc01hdGNoKHVybCkge1xuICAgIHJldHVybiB1cmwucHJvdG9jb2wgPT09IFwiaHR0cHM6XCIgJiYgdGhpcy5pc0hvc3RQYXRoTWF0Y2godXJsKTtcbiAgfVxuICBpc0hvc3RQYXRoTWF0Y2godXJsKSB7XG4gICAgaWYgKCF0aGlzLmhvc3RuYW1lTWF0Y2ggfHwgIXRoaXMucGF0aG5hbWVNYXRjaClcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBob3N0bmFtZU1hdGNoUmVnZXhzID0gW1xuICAgICAgdGhpcy5jb252ZXJ0UGF0dGVyblRvUmVnZXgodGhpcy5ob3N0bmFtZU1hdGNoKSxcbiAgICAgIHRoaXMuY29udmVydFBhdHRlcm5Ub1JlZ2V4KHRoaXMuaG9zdG5hbWVNYXRjaC5yZXBsYWNlKC9eXFwqXFwuLywgXCJcIikpXG4gICAgXTtcbiAgICBjb25zdCBwYXRobmFtZU1hdGNoUmVnZXggPSB0aGlzLmNvbnZlcnRQYXR0ZXJuVG9SZWdleCh0aGlzLnBhdGhuYW1lTWF0Y2gpO1xuICAgIHJldHVybiAhIWhvc3RuYW1lTWF0Y2hSZWdleHMuZmluZCgocmVnZXgpID0+IHJlZ2V4LnRlc3QodXJsLmhvc3RuYW1lKSkgJiYgcGF0aG5hbWVNYXRjaFJlZ2V4LnRlc3QodXJsLnBhdGhuYW1lKTtcbiAgfVxuICBpc0ZpbGVNYXRjaCh1cmwpIHtcbiAgICB0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogZmlsZTovLyBwYXR0ZXJuIG1hdGNoaW5nLiBPcGVuIGEgUFIgdG8gYWRkIHN1cHBvcnRcIik7XG4gIH1cbiAgaXNGdHBNYXRjaCh1cmwpIHtcbiAgICB0aHJvdyBFcnJvcihcIk5vdCBpbXBsZW1lbnRlZDogZnRwOi8vIHBhdHRlcm4gbWF0Y2hpbmcuIE9wZW4gYSBQUiB0byBhZGQgc3VwcG9ydFwiKTtcbiAgfVxuICBpc1Vybk1hdGNoKHVybCkge1xuICAgIHRocm93IEVycm9yKFwiTm90IGltcGxlbWVudGVkOiB1cm46Ly8gcGF0dGVybiBtYXRjaGluZy4gT3BlbiBhIFBSIHRvIGFkZCBzdXBwb3J0XCIpO1xuICB9XG4gIGNvbnZlcnRQYXR0ZXJuVG9SZWdleChwYXR0ZXJuKSB7XG4gICAgY29uc3QgZXNjYXBlZCA9IHRoaXMuZXNjYXBlRm9yUmVnZXgocGF0dGVybik7XG4gICAgY29uc3Qgc3RhcnNSZXBsYWNlZCA9IGVzY2FwZWQucmVwbGFjZSgvXFxcXFxcKi9nLCBcIi4qXCIpO1xuICAgIHJldHVybiBSZWdFeHAoYF4ke3N0YXJzUmVwbGFjZWR9JGApO1xuICB9XG4gIGVzY2FwZUZvclJlZ2V4KHN0cmluZykge1xuICAgIHJldHVybiBzdHJpbmcucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csIFwiXFxcXCQmXCIpO1xuICB9XG59O1xudmFyIE1hdGNoUGF0dGVybiA9IF9NYXRjaFBhdHRlcm47XG5NYXRjaFBhdHRlcm4uUFJPVE9DT0xTID0gW1wiaHR0cFwiLCBcImh0dHBzXCIsIFwiZmlsZVwiLCBcImZ0cFwiLCBcInVyblwiXTtcbnZhciBJbnZhbGlkTWF0Y2hQYXR0ZXJuID0gY2xhc3MgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKG1hdGNoUGF0dGVybiwgcmVhc29uKSB7XG4gICAgc3VwZXIoYEludmFsaWQgbWF0Y2ggcGF0dGVybiBcIiR7bWF0Y2hQYXR0ZXJufVwiOiAke3JlYXNvbn1gKTtcbiAgfVxufTtcbmZ1bmN0aW9uIHZhbGlkYXRlUHJvdG9jb2wobWF0Y2hQYXR0ZXJuLCBwcm90b2NvbCkge1xuICBpZiAoIU1hdGNoUGF0dGVybi5QUk9UT0NPTFMuaW5jbHVkZXMocHJvdG9jb2wpICYmIHByb3RvY29sICE9PSBcIipcIilcbiAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihcbiAgICAgIG1hdGNoUGF0dGVybixcbiAgICAgIGAke3Byb3RvY29sfSBub3QgYSB2YWxpZCBwcm90b2NvbCAoJHtNYXRjaFBhdHRlcm4uUFJPVE9DT0xTLmpvaW4oXCIsIFwiKX0pYFxuICAgICk7XG59XG5mdW5jdGlvbiB2YWxpZGF0ZUhvc3RuYW1lKG1hdGNoUGF0dGVybiwgaG9zdG5hbWUpIHtcbiAgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKFwiOlwiKSlcbiAgICB0aHJvdyBuZXcgSW52YWxpZE1hdGNoUGF0dGVybihtYXRjaFBhdHRlcm4sIGBIb3N0bmFtZSBjYW5ub3QgaW5jbHVkZSBhIHBvcnRgKTtcbiAgaWYgKGhvc3RuYW1lLmluY2x1ZGVzKFwiKlwiKSAmJiBob3N0bmFtZS5sZW5ndGggPiAxICYmICFob3N0bmFtZS5zdGFydHNXaXRoKFwiKi5cIikpXG4gICAgdGhyb3cgbmV3IEludmFsaWRNYXRjaFBhdHRlcm4oXG4gICAgICBtYXRjaFBhdHRlcm4sXG4gICAgICBgSWYgdXNpbmcgYSB3aWxkY2FyZCAoKiksIGl0IG11c3QgZ28gYXQgdGhlIHN0YXJ0IG9mIHRoZSBob3N0bmFtZWBcbiAgICApO1xufVxuZnVuY3Rpb24gdmFsaWRhdGVQYXRobmFtZShtYXRjaFBhdHRlcm4sIHBhdGhuYW1lKSB7XG4gIHJldHVybjtcbn1cbmV4cG9ydCB7XG4gIEludmFsaWRNYXRjaFBhdHRlcm4sXG4gIE1hdGNoUGF0dGVyblxufTtcbiIsImltcG9ydCB7IHNldHRpbmdzTWFuYWdlciB9IGZyb20gXCIuL3NldHRpbmdzLW1hbmFnZXJcIjtcbmltcG9ydCB7IE1lc3NhZ2VUeXBlLCBkZWZhdWx0U2V0dGluZ3MsIFVwZGF0ZVNldHRpbmdzTWVzc2FnZSAsIGRlYnVnTG9nIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGdldCBob3N0bmFtZSBmcm9tIFVSTFxuZnVuY3Rpb24gZ2V0SG9zdG5hbWUodXJsOiBzdHJpbmcpOiBzdHJpbmcge1xuICB0cnkge1xuICAgIHJldHVybiBuZXcgVVJMKHVybCkuaG9zdG5hbWU7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiTWVzc2FnZSBIYW5kbGVyOiBJbnZhbGlkIFVSTDpcIiwgdXJsKTtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBoYW5kbGVHZXRJbml0aWFsU2V0dGluZ3MoXG4gIG1lc3NhZ2U6IGFueSxcbiAgc2VuZGVyOiBjaHJvbWUucnVudGltZS5NZXNzYWdlU2VuZGVyLFxuICBzZW5kUmVzcG9uc2U6IChyZXNwb25zZT86IGFueSkgPT4gdm9pZFxuKSB7XG4gIGNvbnN0IGhvc3RuYW1lID0gbWVzc2FnZS5ob3N0bmFtZSB8fCAoc2VuZGVyLnRhYj8udXJsID8gZ2V0SG9zdG5hbWUoc2VuZGVyLnRhYi51cmwpIDogbnVsbCk7XG5cbiAgaWYgKCFob3N0bmFtZSkge1xuICAgIGNvbnNvbGUud2FybihcIk1lc3NhZ2UgSGFuZGxlcjogR0VUX0lOSVRJQUxfU0VUVElOR1MgcmVjZWl2ZWQgd2l0aG91dCBob3N0bmFtZS5cIik7XG4gICAgc2VuZFJlc3BvbnNlKHsgc2V0dGluZ3M6IHsgLi4uZGVmYXVsdFNldHRpbmdzIH0gfSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdHJ5IHtcbiAgICAvLyBFbnN1cmUgc2V0dGluZ3MgYXJlIGxvYWRlZCBiZWZvcmUgcHJvY2VlZGluZ1xuICAgIGF3YWl0IHNldHRpbmdzTWFuYWdlci5pbml0aWFsaXplKCk7XG4gICAgZGVidWdMb2coYE1lc3NhZ2UgSGFuZGxlcjogR2V0dGluZyBpbml0aWFsIHNldHRpbmdzIGZvciAke2hvc3RuYW1lfWApO1xuXG4gICAgY29uc3Qgc2l0ZUNvbmZpZyA9IHNldHRpbmdzTWFuYWdlci5nZXRTZXR0aW5nc0ZvclNpdGUoaG9zdG5hbWUpO1xuICAgIGRlYnVnTG9nKFxuICAgICAgYFtERUJVR10gTWVzc2FnZSBIYW5kbGVyIChHRVRfSU5JVElBTF9TRVRUSU5HUyk6IFJldHJpZXZlZCBzaXRlQ29uZmlnIGZvciAke2hvc3RuYW1lfTpgLFxuICAgICAgSlNPTi5zdHJpbmdpZnkoc2l0ZUNvbmZpZywgbnVsbCwgMilcbiAgICApO1xuXG4gICAgbGV0IGVmZmVjdGl2ZVNldHRpbmdzOiBhbnk7XG5cbiAgICAvLyBEZXRlcm1pbmUgdGhlIGNvcnJlY3Qgc2V0dGluZ3MgYmFzZWQgb24gc2l0ZSBjb25maWcgYW5kIG1vZGVcbiAgICBpZiAoc2l0ZUNvbmZpZz8uYWN0aXZlU2V0dGluZyA9PT0gXCJzaXRlXCIgJiYgc2l0ZUNvbmZpZy5zZXR0aW5ncykge1xuICAgICAgZWZmZWN0aXZlU2V0dGluZ3MgPSBzaXRlQ29uZmlnLnNldHRpbmdzO1xuICAgIH0gZWxzZSBpZiAoc2l0ZUNvbmZpZz8uYWN0aXZlU2V0dGluZyA9PT0gXCJkaXNhYmxlZFwiKSB7XG4gICAgICAvLyBGb3IgZGlzYWJsZWQsIHNlbmQgZGVmYXVsdCBzZXR0aW5ncyBzbyBhdWRpbyBwcm9jZXNzaW5nIGlzIGJ5cGFzc2VkL25ldXRyYWxcbiAgICAgIGVmZmVjdGl2ZVNldHRpbmdzID0geyAuLi5kZWZhdWx0U2V0dGluZ3MsIHNwZWVkOiAxMDAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVXNlIGdsb2JhbCBzZXR0aW5ncyAoZ3VhcmFudGVlZCB0byBiZSBsb2FkZWQgb3IgZGVmYXVsdHMgbm93KVxuICAgICAgZWZmZWN0aXZlU2V0dGluZ3MgPSBzZXR0aW5nc01hbmFnZXIuZ2xvYmFsU2V0dGluZ3M7XG4gICAgfVxuXG4gICAgZGVidWdMb2coXG4gICAgICBgTWVzc2FnZSBIYW5kbGVyOiBTZW5kaW5nIGluaXRpYWwgc2V0dGluZ3MgZm9yICR7aG9zdG5hbWV9IHRvIHRhYiAke3NlbmRlci50YWI/LmlkfTpgLFxuICAgICAgZWZmZWN0aXZlU2V0dGluZ3NcbiAgICApO1xuICAgIHNlbmRSZXNwb25zZSh7IHNldHRpbmdzOiB7IC4uLmVmZmVjdGl2ZVNldHRpbmdzIH0gfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgIGBNZXNzYWdlIEhhbmRsZXI6IEVycm9yIHByb2Nlc3NpbmcgR0VUX0lOSVRJQUxfU0VUVElOR1MgZm9yICR7aG9zdG5hbWV9OmAsXG4gICAgICBlcnJvclxuICAgICk7XG4gICAgLy8gU2VuZCBkZWZhdWx0cyBvbiBlcnJvclxuICAgIHNlbmRSZXNwb25zZSh7IHNldHRpbmdzOiB7IC4uLmRlZmF1bHRTZXR0aW5ncywgc3BlZWQ6IDEwMCB9IH0pO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVVwZGF0ZVNldHRpbmdzKFxuICBtZXNzYWdlOiBVcGRhdGVTZXR0aW5nc01lc3NhZ2UsXG4gIHNlbmRlcjogY2hyb21lLnJ1bnRpbWUuTWVzc2FnZVNlbmRlcixcbiAgc2VuZFJlc3BvbnNlOiAocmVzcG9uc2U/OiBhbnkpID0+IHZvaWRcbikge1xuICB0cnkge1xuICAgIC8vIElmIHNlbmRlciBpcyBwb3B1cCAobm8gdGFiKSwgZ2V0IGFjdGl2ZSB0YWIgaW5mb1xuICAgIGxldCB0YXJnZXRUYWJJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuICAgIGxldCB0YXJnZXRVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDtcbiAgICBsZXQgaG9zdG5hbWU6IHN0cmluZztcblxuICAgIGlmICghc2VuZGVyLnRhYikge1xuICAgICAgLy8gTWVzc2FnZSBmcm9tIHBvcHVwIC0gZ2V0IGFjdGl2ZSB0YWJcbiAgICAgIGNvbnN0IHRhYnMgPSBhd2FpdCBjaHJvbWUudGFicy5xdWVyeSh7XG4gICAgICAgIGFjdGl2ZTogdHJ1ZSxcbiAgICAgICAgY3VycmVudFdpbmRvdzogdHJ1ZSxcbiAgICAgIH0pO1xuICAgICAgaWYgKCF0YWJzWzBdPy51cmwgfHwgIXRhYnNbMF0/LmlkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vIGFjdGl2ZSB0YWIgZm91bmRcIik7XG4gICAgICB9XG4gICAgICB0YXJnZXRUYWJJZCA9IHRhYnNbMF0uaWQ7XG4gICAgICB0YXJnZXRVcmwgPSB0YWJzWzBdLnVybDtcbiAgICAgIGhvc3RuYW1lID0gZ2V0SG9zdG5hbWUodGFyZ2V0VXJsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gTWVzc2FnZSBmcm9tIGNvbnRlbnQgc2NyaXB0XG4gICAgICBpZiAoIXNlbmRlci50YWIudXJsIHx8ICFzZW5kZXIudGFiLmlkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgc2VuZGVyIHRhYlwiKTtcbiAgICAgIH1cbiAgICAgIHRhcmdldFRhYklkID0gc2VuZGVyLnRhYi5pZDtcbiAgICAgIHRhcmdldFVybCA9IHNlbmRlci50YWIudXJsO1xuICAgICAgaG9zdG5hbWUgPSBnZXRIb3N0bmFtZSh0YXJnZXRVcmwpO1xuICAgIH1cblxuICAgIGRlYnVnTG9nKFwiTWVzc2FnZSBIYW5kbGVyOiBQcm9jZXNzaW5nIHVwZGF0ZSBmb3JcIiwge1xuICAgICAgaG9zdG5hbWUsXG4gICAgICB0YWJJZDogdGFyZ2V0VGFiSWQsXG4gICAgICBpc1BvcHVwOiAhc2VuZGVyLnRhYixcbiAgICAgIHNldHRpbmdzOiBtZXNzYWdlLnNldHRpbmdzLFxuICAgIH0pO1xuXG4gICAgLy8gR2V0IGN1cnJlbnQgc2l0ZSBjb25maWcgKHN5bmNocm9ub3VzIG1ldGhvZClcbiAgICBjb25zdCBjdXJyZW50U2l0ZUNvbmZpZyA9IHNldHRpbmdzTWFuYWdlci5nZXRTZXR0aW5nc0ZvclNpdGUoaG9zdG5hbWUpO1xuICAgIGNvbnN0IGlzQ3VycmVudGx5R2xvYmFsID0gY3VycmVudFNpdGVDb25maWc/LmFjdGl2ZVNldHRpbmcgPT09IFwiZ2xvYmFsXCI7XG5cbiAgICBpZiAoIW1lc3NhZ2UuZW5hYmxlZCkge1xuICAgICAgYXdhaXQgc2V0dGluZ3NNYW5hZ2VyLmRpc2FibGVTaXRlKGhvc3RuYW1lLCB0YXJnZXRUYWJJZCk7XG4gICAgICByZXR1cm4gc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICBpZiAoIW1lc3NhZ2Uuc2V0dGluZ3MpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIk5vIHNldHRpbmdzIHByb3ZpZGVkXCIpO1xuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBzZXR0aW5ncyBiYXNlZCBvbiBtb2RlXG4gICAgaWYgKG1lc3NhZ2UuaXNHbG9iYWwgfHwgaXNDdXJyZW50bHlHbG9iYWwpIHtcbiAgICAgIGF3YWl0IHNldHRpbmdzTWFuYWdlci51cGRhdGVHbG9iYWxTZXR0aW5ncyhcbiAgICAgICAgbWVzc2FnZS5zZXR0aW5ncyxcbiAgICAgICAgdGFyZ2V0VGFiSWQsXG4gICAgICAgIGhvc3RuYW1lXG4gICAgICApO1xuICAgIH0gZWxzZSB7XG4gICAgICBhd2FpdCBzZXR0aW5nc01hbmFnZXIudXBkYXRlU2l0ZVNldHRpbmdzKFxuICAgICAgICBob3N0bmFtZSxcbiAgICAgICAgbWVzc2FnZS5zZXR0aW5ncyxcbiAgICAgICAgdGFyZ2V0VGFiSWRcbiAgICAgICk7XG4gICAgfVxuXG4gICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogdHJ1ZSB9KTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiTWVzc2FnZSBIYW5kbGVyOiBFcnJvciBwcm9jZXNzaW5nIHVwZGF0ZVwiLCBlcnJvcik7XG4gICAgc2VuZFJlc3BvbnNlKHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBTdHJpbmcoZXJyb3IpIH0pO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZVVwZGF0ZVNpdGVNb2RlKFxuICBtZXNzYWdlOiBhbnksXG4gIHNlbmRlcjogY2hyb21lLnJ1bnRpbWUuTWVzc2FnZVNlbmRlcixcbiAgc2VuZFJlc3BvbnNlOiAocmVzcG9uc2U/OiBhbnkpID0+IHZvaWRcbikge1xuICBjb25zdCB7IGhvc3RuYW1lLCBtb2RlIH0gPSBtZXNzYWdlO1xuICBjb25zdCB0YWJJZCA9IHNlbmRlci50YWI/LmlkO1xuXG4gIC8vIFZhbGlkYXRlIGlucHV0c1xuICBpZiAoIWhvc3RuYW1lKSB7XG4gICAgY29uc3QgZXJyb3IgPSBcIk5vIGhvc3RuYW1lIHByb3ZpZGVkIGZvciBzaXRlIG1vZGUgdXBkYXRlXCI7XG4gICAgY29uc29sZS5lcnJvcihcIk1lc3NhZ2UgSGFuZGxlcjpcIiwgZXJyb3IpO1xuICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvciB9KTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAobW9kZSAhPT0gXCJnbG9iYWxcIiAmJiBtb2RlICE9PSBcInNpdGVcIiAmJiBtb2RlICE9PSBcImRpc2FibGVkXCIpIHtcbiAgICBjb25zdCBlcnJvciA9IGBJbnZhbGlkIG1vZGUgcHJvdmlkZWQ6ICR7bW9kZX1gO1xuICAgIGNvbnNvbGUuZXJyb3IoXCJNZXNzYWdlIEhhbmRsZXI6XCIsIGVycm9yKTtcbiAgICBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3IgfSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgeyBzZXR0aW5nc1RvVXNlLCBzaXRlQ29uZmlnIH0gPSBhd2FpdCBzZXR0aW5nc01hbmFnZXIudXBkYXRlU2l0ZU1vZGUoXG4gICAgaG9zdG5hbWUsXG4gICAgbW9kZSxcbiAgICB0YWJJZFxuICApO1xuXG4gIC8vIEJyb2FkY2FzdCBzZXR0aW5ncyB0byB0aGUgdGFiXG4gIGlmICh0YWJJZCkge1xuICAgIGF3YWl0IGNocm9tZS50YWJzLnNlbmRNZXNzYWdlKHRhYklkLCB7XG4gICAgICB0eXBlOiBcIlVQREFURV9TRVRUSU5HU1wiLFxuICAgICAgc2V0dGluZ3M6IHNldHRpbmdzVG9Vc2UsXG4gICAgICBpc0dsb2JhbDogbW9kZSA9PT0gXCJnbG9iYWxcIixcbiAgICB9KTtcbiAgfVxuXG4gIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUgfSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGhhbmRsZUNvbnRlbnRTY3JpcHRSZWFkeShcbiAgbWVzc2FnZTogYW55LFxuICBzZW5kZXI6IGNocm9tZS5ydW50aW1lLk1lc3NhZ2VTZW5kZXIsXG4gIHNlbmRSZXNwb25zZTogKHJlc3BvbnNlPzogYW55KSA9PiB2b2lkXG4pIHtcbiAgdHJ5IHtcbiAgICBpZiAoIXNlbmRlci50YWI/LmlkIHx8ICFzZW5kZXIudGFiPy51cmwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgc2VuZGVyIHRhYlwiKTtcbiAgICB9XG5cbiAgICBjb25zdCBob3N0bmFtZSA9IG1lc3NhZ2UuaG9zdG5hbWUgfHwgZ2V0SG9zdG5hbWUoc2VuZGVyLnRhYi51cmwpO1xuICAgIGNvbnN0IHNpdGVDb25maWcgPSBzZXR0aW5nc01hbmFnZXIuZ2V0U2V0dGluZ3NGb3JTaXRlKGhvc3RuYW1lKTtcblxuICAgIGNvbnN0IHNldHRpbmdzVG9TZW5kID0gc2l0ZUNvbmZpZz8uc2V0dGluZ3MgfHwgZGVmYXVsdFNldHRpbmdzO1xuICAgIGNvbnN0IGlzR2xvYmFsID0gc2l0ZUNvbmZpZz8uYWN0aXZlU2V0dGluZyA9PT0gXCJnbG9iYWxcIjtcbiAgICBjb25zdCBpc0VuYWJsZWQgPSBzaXRlQ29uZmlnPy5lbmFibGVkID8/IHRydWU7XG5cbiAgICBhd2FpdCBjaHJvbWUudGFicy5zZW5kTWVzc2FnZShzZW5kZXIudGFiLmlkLCB7XG4gICAgICB0eXBlOiBcIlVQREFURV9TRVRUSU5HU1wiLFxuICAgICAgc2V0dGluZ3M6IHNldHRpbmdzVG9TZW5kLFxuICAgICAgaXNHbG9iYWwsXG4gICAgICBlbmFibGVkOiBpc0VuYWJsZWQsXG4gICAgICBob3N0bmFtZSxcbiAgICB9IGFzIE1lc3NhZ2VUeXBlKTtcblxuICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IHRydWUgfSk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcbiAgICAgIFwiTWVzc2FnZSBIYW5kbGVyOiBFcnJvciBoYW5kbGluZyBjb250ZW50IHNjcmlwdCByZWFkeVwiLFxuICAgICAgZXJyb3JcbiAgICApO1xuICAgIHNlbmRSZXNwb25zZSh7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9KTtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0dXBNZXNzYWdlSGFuZGxlcigpIHtcbiAgY2hyb21lLnJ1bnRpbWUub25NZXNzYWdlLmFkZExpc3RlbmVyKFxuICAgIChtZXNzYWdlOiBNZXNzYWdlVHlwZSwgc2VuZGVyLCBzZW5kUmVzcG9uc2UpID0+IHtcbiAgICAgIGRlYnVnTG9nKFxuICAgICAgICBcIk1lc3NhZ2UgSGFuZGxlcjogUmVjZWl2ZWQgbWVzc2FnZTpcIixcbiAgICAgICAgbWVzc2FnZSxcbiAgICAgICAgXCJmcm9tIHRhYjpcIixcbiAgICAgICAgc2VuZGVyLnRhYj8uaWQsXG4gICAgICAgIHNlbmRlcixcbiAgICAgICAgXCJzZW5kZXIgdHlwZTpcIixcbiAgICAgICAgc2VuZGVyLmRvY3VtZW50SWQgPyBcImNvbnRlbnRcIiA6IFwicG9wdXBcIlxuICAgICAgKTtcblxuICAgICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBpZiAobWVzc2FnZS50eXBlID09PSBcIkdFVF9JTklUSUFMX1NFVFRJTkdTXCIpIHtcbiAgICAgICAgICAgIGF3YWl0IGhhbmRsZUdldEluaXRpYWxTZXR0aW5ncyhtZXNzYWdlLCBzZW5kZXIsIHNlbmRSZXNwb25zZSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChtZXNzYWdlLnR5cGUgPT09IFwiVVBEQVRFX1NFVFRJTkdTXCIpIHtcbiAgICAgICAgICAgIGF3YWl0IGhhbmRsZVVwZGF0ZVNldHRpbmdzKG1lc3NhZ2UsIHNlbmRlciwgc2VuZFJlc3BvbnNlKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1lc3NhZ2UudHlwZSA9PT0gXCJVUERBVEVfU0lURV9NT0RFXCIpIHtcbiAgICAgICAgICAgIGF3YWl0IGhhbmRsZVVwZGF0ZVNpdGVNb2RlKG1lc3NhZ2UsIHNlbmRlciwgc2VuZFJlc3BvbnNlKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG1lc3NhZ2UudHlwZSA9PT0gXCJDT05URU5UX1NDUklQVF9SRUFEWVwiKSB7XG4gICAgICAgICAgICBhd2FpdCBoYW5kbGVDb250ZW50U2NyaXB0UmVhZHkobWVzc2FnZSwgc2VuZGVyLCBzZW5kUmVzcG9uc2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICBjb25zdCBlcnJvck1zZyA9XG4gICAgICAgICAgICBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcIk1lc3NhZ2UgSGFuZGxlcjogRXJyb3IgcHJvY2Vzc2luZyBtZXNzYWdlOlwiLCB7XG4gICAgICAgICAgICBlcnJvcjogZXJyb3JNc2csXG4gICAgICAgICAgICBtZXNzYWdlLFxuICAgICAgICAgICAgc3RhY2s6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5zdGFjayA6IHVuZGVmaW5lZCxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBzZW5kUmVzcG9uc2UoeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yTXNnIH0pO1xuICAgICAgICB9XG4gICAgICB9KSgpO1xuXG4gICAgICByZXR1cm4gdHJ1ZTsgLy8gS2VlcCB0aGUgbWVzc2FnZSBjaGFubmVsIG9wZW4gZm9yIGFzeW5jIHJlc3BvbnNlXG4gICAgfVxuICApO1xufVxuIiwiaW1wb3J0IHsgc2V0dGluZ3NNYW5hZ2VyIH0gZnJvbSBcIi4uL3NyYy9zZXR0aW5ncy1tYW5hZ2VyXCI7XG5pbXBvcnQgeyBkZWZhdWx0U2V0dGluZ3MsIGRlYnVnTG9nIH0gZnJvbSBcIi4uL3NyYy90eXBlc1wiO1xuaW1wb3J0IHsgZGVmaW5lQmFja2dyb3VuZCB9IGZyb20gXCJ3eHQvc2FuZGJveFwiO1xuaW1wb3J0IHsgc2V0dXBNZXNzYWdlSGFuZGxlciB9IGZyb20gXCIuLi9zcmMvbWVzc2FnZS1oYW5kbGVyXCI7XG5pbXBvcnQgeyBzZXR1cFNldHRpbmdzRXZlbnRIYW5kbGVyIH0gZnJvbSBcIi4uL3NyYy9zZXR0aW5ncy1ldmVudC1oYW5kbGVyXCI7XG5cbi8vIEluaXRpYWxpemUgc2V0dGluZ3Mgb24gZXh0ZW5zaW9uIHN0YXJ0dXAgb3IgZmlyc3QgaW5zdGFsbFxuY2hyb21lLnJ1bnRpbWUub25JbnN0YWxsZWQuYWRkTGlzdGVuZXIoYXN5bmMgKCkgPT4ge1xuICBkZWJ1Z0xvZyhcbiAgICBcIkJhY2tncm91bmQ6IG9uSW5zdGFsbGVkIGV2ZW50IHRyaWdnZXJlZC4gSW5pdGlhbGl6aW5nIHNldHRpbmdzLi4uXCJcbiAgKTtcbiAgYXdhaXQgc2V0dGluZ3NNYW5hZ2VyLmluaXRpYWxpemUoKTtcbiAgZGVidWdMb2coXCJCYWNrZ3JvdW5kOiBTZXR0aW5ncyBpbml0aWFsaXplZCB2aWEgb25JbnN0YWxsZWQuXCIpO1xufSk7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUJhY2tncm91bmQoKCkgPT4ge1xuICBkZWJ1Z0xvZyhcIkJhY2tncm91bmQ6IFNjcmlwdCBleGVjdXRpbmcuXCIpO1xuXG4gIC8vIEluaXRpYWxpemUgc2V0dGluZ3MgbWFuYWdlciAoZmlyZS1hbmQtZm9yZ2V0LCBoYW5kbGVzIGl0cyBvd24gZXJyb3JzKVxuICAvLyBUaGlzIGVuc3VyZXMgaXQgc3RhcnRzIGxvYWRpbmcgQVNBUC4gTGlzdGVuZXJzIGJlbG93IG1pZ2h0IGluaXRpYWxseSBnZXQgZGVmYXVsdHMuXG4gIHNldHRpbmdzTWFuYWdlclxuICAgIC5pbml0aWFsaXplKClcbiAgICAuY2F0Y2goKGVycikgPT5cbiAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgIFwiQmFja2dyb3VuZDogSW5pdGlhbCBzZXR0aW5nc01hbmFnZXIuaW5pdGlhbGl6ZSgpIGZhaWxlZDpcIixcbiAgICAgICAgZXJyXG4gICAgICApXG4gICAgKTtcblxuICAvLyBTZXQgdXAgbGlzdGVuZXJzIHdpdGhpbiB0aGUgZGVmaW5lQmFja2dyb3VuZCBjb250ZXh0XG4gIC8vIFRoaXMgbWlnaHQgaGVscCBlbnN1cmUgdGhleSBhcmUgY29ycmVjdGx5IGF0dGFjaGVkL3JlYXR0YWNoZWQgZHVyaW5nIHJlbG9hZHMuXG4gIHNldHVwTWVzc2FnZUhhbmRsZXIoKTtcbiAgc2V0dXBTZXR0aW5nc0V2ZW50SGFuZGxlcigpOyAvLyBFbnN1cmUgdGhpcyBydW5zIHdpdGhpbiB0aGUgZGVmaW5lZCBjb250ZXh0XG5cbiAgZGVidWdMb2coXCJCYWNrZ3JvdW5kOiBNYWluIGV4ZWN1dGlvbiBmaW5pc2hlZCwgbGlzdGVuZXJzIHNldCB1cC5cIik7XG59KTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsLCBmYWN0b3J5KSB7XG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZShcIndlYmV4dGVuc2lvbi1wb2x5ZmlsbFwiLCBbXCJtb2R1bGVcIl0sIGZhY3RvcnkpO1xuICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgZmFjdG9yeShtb2R1bGUpO1xuICB9IGVsc2Uge1xuICAgIHZhciBtb2QgPSB7XG4gICAgICBleHBvcnRzOiB7fVxuICAgIH07XG4gICAgZmFjdG9yeShtb2QpO1xuICAgIGdsb2JhbC5icm93c2VyID0gbW9kLmV4cG9ydHM7XG4gIH1cbn0pKHR5cGVvZiBnbG9iYWxUaGlzICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsVGhpcyA6IHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHRoaXMsIGZ1bmN0aW9uIChtb2R1bGUpIHtcbiAgLyogd2ViZXh0ZW5zaW9uLXBvbHlmaWxsIC0gdjAuMTIuMCAtIFR1ZSBNYXkgMTQgMjAyNCAxODowMToyOSAqL1xuICAvKiAtKi0gTW9kZTogaW5kZW50LXRhYnMtbW9kZTogbmlsOyBqcy1pbmRlbnQtbGV2ZWw6IDIgLSotICovXG4gIC8qIHZpbTogc2V0IHN0cz0yIHN3PTIgZXQgdHc9ODA6ICovXG4gIC8qIFRoaXMgU291cmNlIENvZGUgRm9ybSBpcyBzdWJqZWN0IHRvIHRoZSB0ZXJtcyBvZiB0aGUgTW96aWxsYSBQdWJsaWNcbiAgICogTGljZW5zZSwgdi4gMi4wLiBJZiBhIGNvcHkgb2YgdGhlIE1QTCB3YXMgbm90IGRpc3RyaWJ1dGVkIHdpdGggdGhpc1xuICAgKiBmaWxlLCBZb3UgY2FuIG9idGFpbiBvbmUgYXQgaHR0cDovL21vemlsbGEub3JnL01QTC8yLjAvLiAqL1xuICBcInVzZSBzdHJpY3RcIjtcblxuICBpZiAoIShnbG9iYWxUaGlzLmNocm9tZSAmJiBnbG9iYWxUaGlzLmNocm9tZS5ydW50aW1lICYmIGdsb2JhbFRoaXMuY2hyb21lLnJ1bnRpbWUuaWQpKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiVGhpcyBzY3JpcHQgc2hvdWxkIG9ubHkgYmUgbG9hZGVkIGluIGEgYnJvd3NlciBleHRlbnNpb24uXCIpO1xuICB9XG4gIGlmICghKGdsb2JhbFRoaXMuYnJvd3NlciAmJiBnbG9iYWxUaGlzLmJyb3dzZXIucnVudGltZSAmJiBnbG9iYWxUaGlzLmJyb3dzZXIucnVudGltZS5pZCkpIHtcbiAgICBjb25zdCBDSFJPTUVfU0VORF9NRVNTQUdFX0NBTExCQUNLX05PX1JFU1BPTlNFX01FU1NBR0UgPSBcIlRoZSBtZXNzYWdlIHBvcnQgY2xvc2VkIGJlZm9yZSBhIHJlc3BvbnNlIHdhcyByZWNlaXZlZC5cIjtcblxuICAgIC8vIFdyYXBwaW5nIHRoZSBidWxrIG9mIHRoaXMgcG9seWZpbGwgaW4gYSBvbmUtdGltZS11c2UgZnVuY3Rpb24gaXMgYSBtaW5vclxuICAgIC8vIG9wdGltaXphdGlvbiBmb3IgRmlyZWZveC4gU2luY2UgU3BpZGVybW9ua2V5IGRvZXMgbm90IGZ1bGx5IHBhcnNlIHRoZVxuICAgIC8vIGNvbnRlbnRzIG9mIGEgZnVuY3Rpb24gdW50aWwgdGhlIGZpcnN0IHRpbWUgaXQncyBjYWxsZWQsIGFuZCBzaW5jZSBpdCB3aWxsXG4gICAgLy8gbmV2ZXIgYWN0dWFsbHkgbmVlZCB0byBiZSBjYWxsZWQsIHRoaXMgYWxsb3dzIHRoZSBwb2x5ZmlsbCB0byBiZSBpbmNsdWRlZFxuICAgIC8vIGluIEZpcmVmb3ggbmVhcmx5IGZvciBmcmVlLlxuICAgIGNvbnN0IHdyYXBBUElzID0gZXh0ZW5zaW9uQVBJcyA9PiB7XG4gICAgICAvLyBOT1RFOiBhcGlNZXRhZGF0YSBpcyBhc3NvY2lhdGVkIHRvIHRoZSBjb250ZW50IG9mIHRoZSBhcGktbWV0YWRhdGEuanNvbiBmaWxlXG4gICAgICAvLyBhdCBidWlsZCB0aW1lIGJ5IHJlcGxhY2luZyB0aGUgZm9sbG93aW5nIFwiaW5jbHVkZVwiIHdpdGggdGhlIGNvbnRlbnQgb2YgdGhlXG4gICAgICAvLyBKU09OIGZpbGUuXG4gICAgICBjb25zdCBhcGlNZXRhZGF0YSA9IHtcbiAgICAgICAgXCJhbGFybXNcIjoge1xuICAgICAgICAgIFwiY2xlYXJcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJjbGVhckFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImJvb2ttYXJrc1wiOiB7XG4gICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRDaGlsZHJlblwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFJlY2VudFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFN1YlRyZWVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRUcmVlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwibW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVRyZWVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZWFyY2hcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJicm93c2VyQWN0aW9uXCI6IHtcbiAgICAgICAgICBcImRpc2FibGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJlbmFibGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRCYWRnZUJhY2tncm91bmRDb2xvclwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEJhZGdlVGV4dFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFBvcHVwXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0VGl0bGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJvcGVuUG9wdXBcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRCYWRnZUJhY2tncm91bmRDb2xvclwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldEJhZGdlVGV4dFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldEljb25cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRQb3B1cFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFRpdGxlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiYnJvd3NpbmdEYXRhXCI6IHtcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAyXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUNhY2hlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlQ29va2llc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZURvd25sb2Fkc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUZvcm1EYXRhXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlSGlzdG9yeVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZUxvY2FsU3RvcmFnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVBhc3N3b3Jkc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVBsdWdpbkRhdGFcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXR0aW5nc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNvbW1hbmRzXCI6IHtcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImNvbnRleHRNZW51c1wiOiB7XG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJjb29raWVzXCI6IHtcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbENvb2tpZVN0b3Jlc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImRldnRvb2xzXCI6IHtcbiAgICAgICAgICBcImluc3BlY3RlZFdpbmRvd1wiOiB7XG4gICAgICAgICAgICBcImV2YWxcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDIsXG4gICAgICAgICAgICAgIFwic2luZ2xlQ2FsbGJhY2tBcmdcIjogZmFsc2VcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicGFuZWxzXCI6IHtcbiAgICAgICAgICAgIFwiY3JlYXRlXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDMsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAzLFxuICAgICAgICAgICAgICBcInNpbmdsZUNhbGxiYWNrQXJnXCI6IHRydWVcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImVsZW1lbnRzXCI6IHtcbiAgICAgICAgICAgICAgXCJjcmVhdGVTaWRlYmFyUGFuZVwiOiB7XG4gICAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJkb3dubG9hZHNcIjoge1xuICAgICAgICAgIFwiY2FuY2VsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZG93bmxvYWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJlcmFzZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEZpbGVJY29uXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwib3BlblwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJmYWxsYmFja1RvTm9DYWxsYmFja1wiOiB0cnVlXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInBhdXNlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicmVtb3ZlRmlsZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlc3VtZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNlYXJjaFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNob3dcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJleHRlbnNpb25cIjoge1xuICAgICAgICAgIFwiaXNBbGxvd2VkRmlsZVNjaGVtZUFjY2Vzc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImlzQWxsb3dlZEluY29nbml0b0FjY2Vzc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcImhpc3RvcnlcIjoge1xuICAgICAgICAgIFwiYWRkVXJsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZGVsZXRlQWxsXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZGVsZXRlUmFuZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkZWxldGVVcmxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRWaXNpdHNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZWFyY2hcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJpMThuXCI6IHtcbiAgICAgICAgICBcImRldGVjdExhbmd1YWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0QWNjZXB0TGFuZ3VhZ2VzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwiaWRlbnRpdHlcIjoge1xuICAgICAgICAgIFwibGF1bmNoV2ViQXV0aEZsb3dcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJpZGxlXCI6IHtcbiAgICAgICAgICBcInF1ZXJ5U3RhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJtYW5hZ2VtZW50XCI6IHtcbiAgICAgICAgICBcImdldFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEFsbFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFNlbGZcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRFbmFibGVkXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwidW5pbnN0YWxsU2VsZlwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcIm5vdGlmaWNhdGlvbnNcIjoge1xuICAgICAgICAgIFwiY2xlYXJcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRQZXJtaXNzaW9uTGV2ZWxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJwYWdlQWN0aW9uXCI6IHtcbiAgICAgICAgICBcImdldFBvcHVwXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0VGl0bGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWRlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0SWNvblwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFBvcHVwXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2V0VGl0bGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwiZmFsbGJhY2tUb05vQ2FsbGJhY2tcIjogdHJ1ZVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzaG93XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDEsXG4gICAgICAgICAgICBcImZhbGxiYWNrVG9Ob0NhbGxiYWNrXCI6IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicGVybWlzc2lvbnNcIjoge1xuICAgICAgICAgIFwiY29udGFpbnNcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZXF1ZXN0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwicnVudGltZVwiOiB7XG4gICAgICAgICAgXCJnZXRCYWNrZ3JvdW5kUGFnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFBsYXRmb3JtSW5mb1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm9wZW5PcHRpb25zUGFnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInJlcXVlc3RVcGRhdGVDaGVja1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNlbmRNZXNzYWdlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDNcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic2VuZE5hdGl2ZU1lc3NhZ2VcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRVbmluc3RhbGxVUkxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJzZXNzaW9uc1wiOiB7XG4gICAgICAgICAgXCJnZXREZXZpY2VzXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0UmVjZW50bHlDbG9zZWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZXN0b3JlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwic3RvcmFnZVwiOiB7XG4gICAgICAgICAgXCJsb2NhbFwiOiB7XG4gICAgICAgICAgICBcImNsZWFyXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImdldEJ5dGVzSW5Vc2VcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwic2V0XCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIm1hbmFnZWRcIjoge1xuICAgICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImdldEJ5dGVzSW5Vc2VcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3luY1wiOiB7XG4gICAgICAgICAgICBcImNsZWFyXCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcImdldEJ5dGVzSW5Vc2VcIjoge1xuICAgICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBcInJlbW92ZVwiOiB7XG4gICAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwic2V0XCI6IHtcbiAgICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICBcInRhYnNcIjoge1xuICAgICAgICAgIFwiY2FwdHVyZVZpc2libGVUYWJcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkZXRlY3RMYW5ndWFnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImRpc2NhcmRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJkdXBsaWNhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJleGVjdXRlU2NyaXB0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0Q3VycmVudFwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMCxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAwXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldFpvb21cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRab29tU2V0dGluZ3NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnb0JhY2tcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnb0ZvcndhcmRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJoaWdobGlnaHRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJpbnNlcnRDU1NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJtb3ZlXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAyLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDJcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwicXVlcnlcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZWxvYWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVDU1NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZW5kTWVzc2FnZVwiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMixcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAzXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcInNldFpvb21cIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJzZXRab29tU2V0dGluZ3NcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJ0b3BTaXRlc1wiOiB7XG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMFxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgXCJ3ZWJOYXZpZ2F0aW9uXCI6IHtcbiAgICAgICAgICBcImdldEFsbEZyYW1lc1wiOiB7XG4gICAgICAgICAgICBcIm1pbkFyZ3NcIjogMSxcbiAgICAgICAgICAgIFwibWF4QXJnc1wiOiAxXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcImdldEZyYW1lXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAxLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwid2ViUmVxdWVzdFwiOiB7XG4gICAgICAgICAgXCJoYW5kbGVyQmVoYXZpb3JDaGFuZ2VkXCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDBcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIFwid2luZG93c1wiOiB7XG4gICAgICAgICAgXCJjcmVhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRBbGxcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJnZXRDdXJyZW50XCI6IHtcbiAgICAgICAgICAgIFwibWluQXJnc1wiOiAwLFxuICAgICAgICAgICAgXCJtYXhBcmdzXCI6IDFcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiZ2V0TGFzdEZvY3VzZWRcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDAsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJyZW1vdmVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDEsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJ1cGRhdGVcIjoge1xuICAgICAgICAgICAgXCJtaW5BcmdzXCI6IDIsXG4gICAgICAgICAgICBcIm1heEFyZ3NcIjogMlxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGlmIChPYmplY3Qua2V5cyhhcGlNZXRhZGF0YSkubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcImFwaS1tZXRhZGF0YS5qc29uIGhhcyBub3QgYmVlbiBpbmNsdWRlZCBpbiBicm93c2VyLXBvbHlmaWxsXCIpO1xuICAgICAgfVxuXG4gICAgICAvKipcbiAgICAgICAqIEEgV2Vha01hcCBzdWJjbGFzcyB3aGljaCBjcmVhdGVzIGFuZCBzdG9yZXMgYSB2YWx1ZSBmb3IgYW55IGtleSB3aGljaCBkb2VzXG4gICAgICAgKiBub3QgZXhpc3Qgd2hlbiBhY2Nlc3NlZCwgYnV0IGJlaGF2ZXMgZXhhY3RseSBhcyBhbiBvcmRpbmFyeSBXZWFrTWFwXG4gICAgICAgKiBvdGhlcndpc2UuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtmdW5jdGlvbn0gY3JlYXRlSXRlbVxuICAgICAgICogICAgICAgIEEgZnVuY3Rpb24gd2hpY2ggd2lsbCBiZSBjYWxsZWQgaW4gb3JkZXIgdG8gY3JlYXRlIHRoZSB2YWx1ZSBmb3IgYW55XG4gICAgICAgKiAgICAgICAga2V5IHdoaWNoIGRvZXMgbm90IGV4aXN0LCB0aGUgZmlyc3QgdGltZSBpdCBpcyBhY2Nlc3NlZC4gVGhlXG4gICAgICAgKiAgICAgICAgZnVuY3Rpb24gcmVjZWl2ZXMsIGFzIGl0cyBvbmx5IGFyZ3VtZW50LCB0aGUga2V5IGJlaW5nIGNyZWF0ZWQuXG4gICAgICAgKi9cbiAgICAgIGNsYXNzIERlZmF1bHRXZWFrTWFwIGV4dGVuZHMgV2Vha01hcCB7XG4gICAgICAgIGNvbnN0cnVjdG9yKGNyZWF0ZUl0ZW0sIGl0ZW1zID0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgc3VwZXIoaXRlbXMpO1xuICAgICAgICAgIHRoaXMuY3JlYXRlSXRlbSA9IGNyZWF0ZUl0ZW07XG4gICAgICAgIH1cbiAgICAgICAgZ2V0KGtleSkge1xuICAgICAgICAgIGlmICghdGhpcy5oYXMoa2V5KSkge1xuICAgICAgICAgICAgdGhpcy5zZXQoa2V5LCB0aGlzLmNyZWF0ZUl0ZW0oa2V5KSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBzdXBlci5nZXQoa2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICAvKipcbiAgICAgICAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZ2l2ZW4gb2JqZWN0IGlzIGFuIG9iamVjdCB3aXRoIGEgYHRoZW5gIG1ldGhvZCwgYW5kIGNhblxuICAgICAgICogdGhlcmVmb3JlIGJlIGFzc3VtZWQgdG8gYmVoYXZlIGFzIGEgUHJvbWlzZS5cbiAgICAgICAqXG4gICAgICAgKiBAcGFyYW0geyp9IHZhbHVlIFRoZSB2YWx1ZSB0byB0ZXN0LlxuICAgICAgICogQHJldHVybnMge2Jvb2xlYW59IFRydWUgaWYgdGhlIHZhbHVlIGlzIHRoZW5hYmxlLlxuICAgICAgICovXG4gICAgICBjb25zdCBpc1RoZW5hYmxlID0gdmFsdWUgPT4ge1xuICAgICAgICByZXR1cm4gdmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSBcIm9iamVjdFwiICYmIHR5cGVvZiB2YWx1ZS50aGVuID09PSBcImZ1bmN0aW9uXCI7XG4gICAgICB9O1xuXG4gICAgICAvKipcbiAgICAgICAqIENyZWF0ZXMgYW5kIHJldHVybnMgYSBmdW5jdGlvbiB3aGljaCwgd2hlbiBjYWxsZWQsIHdpbGwgcmVzb2x2ZSBvciByZWplY3RcbiAgICAgICAqIHRoZSBnaXZlbiBwcm9taXNlIGJhc2VkIG9uIGhvdyBpdCBpcyBjYWxsZWQ6XG4gICAgICAgKlxuICAgICAgICogLSBJZiwgd2hlbiBjYWxsZWQsIGBjaHJvbWUucnVudGltZS5sYXN0RXJyb3JgIGNvbnRhaW5zIGEgbm9uLW51bGwgb2JqZWN0LFxuICAgICAgICogICB0aGUgcHJvbWlzZSBpcyByZWplY3RlZCB3aXRoIHRoYXQgdmFsdWUuXG4gICAgICAgKiAtIElmIHRoZSBmdW5jdGlvbiBpcyBjYWxsZWQgd2l0aCBleGFjdGx5IG9uZSBhcmd1bWVudCwgdGhlIHByb21pc2UgaXNcbiAgICAgICAqICAgcmVzb2x2ZWQgdG8gdGhhdCB2YWx1ZS5cbiAgICAgICAqIC0gT3RoZXJ3aXNlLCB0aGUgcHJvbWlzZSBpcyByZXNvbHZlZCB0byBhbiBhcnJheSBjb250YWluaW5nIGFsbCBvZiB0aGVcbiAgICAgICAqICAgZnVuY3Rpb24ncyBhcmd1bWVudHMuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IHByb21pc2VcbiAgICAgICAqICAgICAgICBBbiBvYmplY3QgY29udGFpbmluZyB0aGUgcmVzb2x1dGlvbiBhbmQgcmVqZWN0aW9uIGZ1bmN0aW9ucyBvZiBhXG4gICAgICAgKiAgICAgICAgcHJvbWlzZS5cbiAgICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IHByb21pc2UucmVzb2x2ZVxuICAgICAgICogICAgICAgIFRoZSBwcm9taXNlJ3MgcmVzb2x1dGlvbiBmdW5jdGlvbi5cbiAgICAgICAqIEBwYXJhbSB7ZnVuY3Rpb259IHByb21pc2UucmVqZWN0XG4gICAgICAgKiAgICAgICAgVGhlIHByb21pc2UncyByZWplY3Rpb24gZnVuY3Rpb24uXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gbWV0YWRhdGFcbiAgICAgICAqICAgICAgICBNZXRhZGF0YSBhYm91dCB0aGUgd3JhcHBlZCBtZXRob2Qgd2hpY2ggaGFzIGNyZWF0ZWQgdGhlIGNhbGxiYWNrLlxuICAgICAgICogQHBhcmFtIHtib29sZWFufSBtZXRhZGF0YS5zaW5nbGVDYWxsYmFja0FyZ1xuICAgICAgICogICAgICAgIFdoZXRoZXIgb3Igbm90IHRoZSBwcm9taXNlIGlzIHJlc29sdmVkIHdpdGggb25seSB0aGUgZmlyc3RcbiAgICAgICAqICAgICAgICBhcmd1bWVudCBvZiB0aGUgY2FsbGJhY2ssIGFsdGVybmF0aXZlbHkgYW4gYXJyYXkgb2YgYWxsIHRoZVxuICAgICAgICogICAgICAgIGNhbGxiYWNrIGFyZ3VtZW50cyBpcyByZXNvbHZlZC4gQnkgZGVmYXVsdCwgaWYgdGhlIGNhbGxiYWNrXG4gICAgICAgKiAgICAgICAgZnVuY3Rpb24gaXMgaW52b2tlZCB3aXRoIG9ubHkgYSBzaW5nbGUgYXJndW1lbnQsIHRoYXQgd2lsbCBiZVxuICAgICAgICogICAgICAgIHJlc29sdmVkIHRvIHRoZSBwcm9taXNlLCB3aGlsZSBhbGwgYXJndW1lbnRzIHdpbGwgYmUgcmVzb2x2ZWQgYXNcbiAgICAgICAqICAgICAgICBhbiBhcnJheSBpZiBtdWx0aXBsZSBhcmUgZ2l2ZW4uXG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge2Z1bmN0aW9ufVxuICAgICAgICogICAgICAgIFRoZSBnZW5lcmF0ZWQgY2FsbGJhY2sgZnVuY3Rpb24uXG4gICAgICAgKi9cbiAgICAgIGNvbnN0IG1ha2VDYWxsYmFjayA9IChwcm9taXNlLCBtZXRhZGF0YSkgPT4ge1xuICAgICAgICByZXR1cm4gKC4uLmNhbGxiYWNrQXJncykgPT4ge1xuICAgICAgICAgIGlmIChleHRlbnNpb25BUElzLnJ1bnRpbWUubGFzdEVycm9yKSB7XG4gICAgICAgICAgICBwcm9taXNlLnJlamVjdChuZXcgRXJyb3IoZXh0ZW5zaW9uQVBJcy5ydW50aW1lLmxhc3RFcnJvci5tZXNzYWdlKSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChtZXRhZGF0YS5zaW5nbGVDYWxsYmFja0FyZyB8fCBjYWxsYmFja0FyZ3MubGVuZ3RoIDw9IDEgJiYgbWV0YWRhdGEuc2luZ2xlQ2FsbGJhY2tBcmcgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICBwcm9taXNlLnJlc29sdmUoY2FsbGJhY2tBcmdzWzBdKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJvbWlzZS5yZXNvbHZlKGNhbGxiYWNrQXJncyk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgfTtcbiAgICAgIGNvbnN0IHBsdXJhbGl6ZUFyZ3VtZW50cyA9IG51bUFyZ3MgPT4gbnVtQXJncyA9PSAxID8gXCJhcmd1bWVudFwiIDogXCJhcmd1bWVudHNcIjtcblxuICAgICAgLyoqXG4gICAgICAgKiBDcmVhdGVzIGEgd3JhcHBlciBmdW5jdGlvbiBmb3IgYSBtZXRob2Qgd2l0aCB0aGUgZ2l2ZW4gbmFtZSBhbmQgbWV0YWRhdGEuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWVcbiAgICAgICAqICAgICAgICBUaGUgbmFtZSBvZiB0aGUgbWV0aG9kIHdoaWNoIGlzIGJlaW5nIHdyYXBwZWQuXG4gICAgICAgKiBAcGFyYW0ge29iamVjdH0gbWV0YWRhdGFcbiAgICAgICAqICAgICAgICBNZXRhZGF0YSBhYm91dCB0aGUgbWV0aG9kIGJlaW5nIHdyYXBwZWQuXG4gICAgICAgKiBAcGFyYW0ge2ludGVnZXJ9IG1ldGFkYXRhLm1pbkFyZ3NcbiAgICAgICAqICAgICAgICBUaGUgbWluaW11bSBudW1iZXIgb2YgYXJndW1lbnRzIHdoaWNoIG11c3QgYmUgcGFzc2VkIHRvIHRoZVxuICAgICAgICogICAgICAgIGZ1bmN0aW9uLiBJZiBjYWxsZWQgd2l0aCBmZXdlciB0aGFuIHRoaXMgbnVtYmVyIG9mIGFyZ3VtZW50cywgdGhlXG4gICAgICAgKiAgICAgICAgd3JhcHBlciB3aWxsIHJhaXNlIGFuIGV4Y2VwdGlvbi5cbiAgICAgICAqIEBwYXJhbSB7aW50ZWdlcn0gbWV0YWRhdGEubWF4QXJnc1xuICAgICAgICogICAgICAgIFRoZSBtYXhpbXVtIG51bWJlciBvZiBhcmd1bWVudHMgd2hpY2ggbWF5IGJlIHBhc3NlZCB0byB0aGVcbiAgICAgICAqICAgICAgICBmdW5jdGlvbi4gSWYgY2FsbGVkIHdpdGggbW9yZSB0aGFuIHRoaXMgbnVtYmVyIG9mIGFyZ3VtZW50cywgdGhlXG4gICAgICAgKiAgICAgICAgd3JhcHBlciB3aWxsIHJhaXNlIGFuIGV4Y2VwdGlvbi5cbiAgICAgICAqIEBwYXJhbSB7Ym9vbGVhbn0gbWV0YWRhdGEuc2luZ2xlQ2FsbGJhY2tBcmdcbiAgICAgICAqICAgICAgICBXaGV0aGVyIG9yIG5vdCB0aGUgcHJvbWlzZSBpcyByZXNvbHZlZCB3aXRoIG9ubHkgdGhlIGZpcnN0XG4gICAgICAgKiAgICAgICAgYXJndW1lbnQgb2YgdGhlIGNhbGxiYWNrLCBhbHRlcm5hdGl2ZWx5IGFuIGFycmF5IG9mIGFsbCB0aGVcbiAgICAgICAqICAgICAgICBjYWxsYmFjayBhcmd1bWVudHMgaXMgcmVzb2x2ZWQuIEJ5IGRlZmF1bHQsIGlmIHRoZSBjYWxsYmFja1xuICAgICAgICogICAgICAgIGZ1bmN0aW9uIGlzIGludm9rZWQgd2l0aCBvbmx5IGEgc2luZ2xlIGFyZ3VtZW50LCB0aGF0IHdpbGwgYmVcbiAgICAgICAqICAgICAgICByZXNvbHZlZCB0byB0aGUgcHJvbWlzZSwgd2hpbGUgYWxsIGFyZ3VtZW50cyB3aWxsIGJlIHJlc29sdmVkIGFzXG4gICAgICAgKiAgICAgICAgYW4gYXJyYXkgaWYgbXVsdGlwbGUgYXJlIGdpdmVuLlxuICAgICAgICpcbiAgICAgICAqIEByZXR1cm5zIHtmdW5jdGlvbihvYmplY3QsIC4uLiopfVxuICAgICAgICogICAgICAgVGhlIGdlbmVyYXRlZCB3cmFwcGVyIGZ1bmN0aW9uLlxuICAgICAgICovXG4gICAgICBjb25zdCB3cmFwQXN5bmNGdW5jdGlvbiA9IChuYW1lLCBtZXRhZGF0YSkgPT4ge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gYXN5bmNGdW5jdGlvbldyYXBwZXIodGFyZ2V0LCAuLi5hcmdzKSB7XG4gICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoIDwgbWV0YWRhdGEubWluQXJncykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCBhdCBsZWFzdCAke21ldGFkYXRhLm1pbkFyZ3N9ICR7cGx1cmFsaXplQXJndW1lbnRzKG1ldGFkYXRhLm1pbkFyZ3MpfSBmb3IgJHtuYW1lfSgpLCBnb3QgJHthcmdzLmxlbmd0aH1gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gbWV0YWRhdGEubWF4QXJncykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBFeHBlY3RlZCBhdCBtb3N0ICR7bWV0YWRhdGEubWF4QXJnc30gJHtwbHVyYWxpemVBcmd1bWVudHMobWV0YWRhdGEubWF4QXJncyl9IGZvciAke25hbWV9KCksIGdvdCAke2FyZ3MubGVuZ3RofWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgaWYgKG1ldGFkYXRhLmZhbGxiYWNrVG9Ob0NhbGxiYWNrKSB7XG4gICAgICAgICAgICAgIC8vIFRoaXMgQVBJIG1ldGhvZCBoYXMgY3VycmVudGx5IG5vIGNhbGxiYWNrIG9uIENocm9tZSwgYnV0IGl0IHJldHVybiBhIHByb21pc2Ugb24gRmlyZWZveCxcbiAgICAgICAgICAgICAgLy8gYW5kIHNvIHRoZSBwb2x5ZmlsbCB3aWxsIHRyeSB0byBjYWxsIGl0IHdpdGggYSBjYWxsYmFjayBmaXJzdCwgYW5kIGl0IHdpbGwgZmFsbGJhY2tcbiAgICAgICAgICAgICAgLy8gdG8gbm90IHBhc3NpbmcgdGhlIGNhbGxiYWNrIGlmIHRoZSBmaXJzdCBjYWxsIGZhaWxzLlxuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHRhcmdldFtuYW1lXSguLi5hcmdzLCBtYWtlQ2FsbGJhY2soe1xuICAgICAgICAgICAgICAgICAgcmVzb2x2ZSxcbiAgICAgICAgICAgICAgICAgIHJlamVjdFxuICAgICAgICAgICAgICAgIH0sIG1ldGFkYXRhKSk7XG4gICAgICAgICAgICAgIH0gY2F0Y2ggKGNiRXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYCR7bmFtZX0gQVBJIG1ldGhvZCBkb2Vzbid0IHNlZW0gdG8gc3VwcG9ydCB0aGUgY2FsbGJhY2sgcGFyYW1ldGVyLCBgICsgXCJmYWxsaW5nIGJhY2sgdG8gY2FsbCBpdCB3aXRob3V0IGEgY2FsbGJhY2s6IFwiLCBjYkVycm9yKTtcbiAgICAgICAgICAgICAgICB0YXJnZXRbbmFtZV0oLi4uYXJncyk7XG5cbiAgICAgICAgICAgICAgICAvLyBVcGRhdGUgdGhlIEFQSSBtZXRob2QgbWV0YWRhdGEsIHNvIHRoYXQgdGhlIG5leHQgQVBJIGNhbGxzIHdpbGwgbm90IHRyeSB0b1xuICAgICAgICAgICAgICAgIC8vIHVzZSB0aGUgdW5zdXBwb3J0ZWQgY2FsbGJhY2sgYW55bW9yZS5cbiAgICAgICAgICAgICAgICBtZXRhZGF0YS5mYWxsYmFja1RvTm9DYWxsYmFjayA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIG1ldGFkYXRhLm5vQ2FsbGJhY2sgPSB0cnVlO1xuICAgICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmIChtZXRhZGF0YS5ub0NhbGxiYWNrKSB7XG4gICAgICAgICAgICAgIHRhcmdldFtuYW1lXSguLi5hcmdzKTtcbiAgICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdGFyZ2V0W25hbWVdKC4uLmFyZ3MsIG1ha2VDYWxsYmFjayh7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSxcbiAgICAgICAgICAgICAgICByZWplY3RcbiAgICAgICAgICAgICAgfSwgbWV0YWRhdGEpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfTtcbiAgICAgIH07XG5cbiAgICAgIC8qKlxuICAgICAgICogV3JhcHMgYW4gZXhpc3RpbmcgbWV0aG9kIG9mIHRoZSB0YXJnZXQgb2JqZWN0LCBzbyB0aGF0IGNhbGxzIHRvIGl0IGFyZVxuICAgICAgICogaW50ZXJjZXB0ZWQgYnkgdGhlIGdpdmVuIHdyYXBwZXIgZnVuY3Rpb24uIFRoZSB3cmFwcGVyIGZ1bmN0aW9uIHJlY2VpdmVzLFxuICAgICAgICogYXMgaXRzIGZpcnN0IGFyZ3VtZW50LCB0aGUgb3JpZ2luYWwgYHRhcmdldGAgb2JqZWN0LCBmb2xsb3dlZCBieSBlYWNoIG9mXG4gICAgICAgKiB0aGUgYXJndW1lbnRzIHBhc3NlZCB0byB0aGUgb3JpZ2luYWwgbWV0aG9kLlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSB0YXJnZXRcbiAgICAgICAqICAgICAgICBUaGUgb3JpZ2luYWwgdGFyZ2V0IG9iamVjdCB0aGF0IHRoZSB3cmFwcGVkIG1ldGhvZCBiZWxvbmdzIHRvLlxuICAgICAgICogQHBhcmFtIHtmdW5jdGlvbn0gbWV0aG9kXG4gICAgICAgKiAgICAgICAgVGhlIG1ldGhvZCBiZWluZyB3cmFwcGVkLiBUaGlzIGlzIHVzZWQgYXMgdGhlIHRhcmdldCBvZiB0aGUgUHJveHlcbiAgICAgICAqICAgICAgICBvYmplY3Qgd2hpY2ggaXMgY3JlYXRlZCB0byB3cmFwIHRoZSBtZXRob2QuXG4gICAgICAgKiBAcGFyYW0ge2Z1bmN0aW9ufSB3cmFwcGVyXG4gICAgICAgKiAgICAgICAgVGhlIHdyYXBwZXIgZnVuY3Rpb24gd2hpY2ggaXMgY2FsbGVkIGluIHBsYWNlIG9mIGEgZGlyZWN0IGludm9jYXRpb25cbiAgICAgICAqICAgICAgICBvZiB0aGUgd3JhcHBlZCBtZXRob2QuXG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge1Byb3h5PGZ1bmN0aW9uPn1cbiAgICAgICAqICAgICAgICBBIFByb3h5IG9iamVjdCBmb3IgdGhlIGdpdmVuIG1ldGhvZCwgd2hpY2ggaW52b2tlcyB0aGUgZ2l2ZW4gd3JhcHBlclxuICAgICAgICogICAgICAgIG1ldGhvZCBpbiBpdHMgcGxhY2UuXG4gICAgICAgKi9cbiAgICAgIGNvbnN0IHdyYXBNZXRob2QgPSAodGFyZ2V0LCBtZXRob2QsIHdyYXBwZXIpID0+IHtcbiAgICAgICAgcmV0dXJuIG5ldyBQcm94eShtZXRob2QsIHtcbiAgICAgICAgICBhcHBseSh0YXJnZXRNZXRob2QsIHRoaXNPYmosIGFyZ3MpIHtcbiAgICAgICAgICAgIHJldHVybiB3cmFwcGVyLmNhbGwodGhpc09iaiwgdGFyZ2V0LCAuLi5hcmdzKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICAgIGxldCBoYXNPd25Qcm9wZXJ0eSA9IEZ1bmN0aW9uLmNhbGwuYmluZChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5KTtcblxuICAgICAgLyoqXG4gICAgICAgKiBXcmFwcyBhbiBvYmplY3QgaW4gYSBQcm94eSB3aGljaCBpbnRlcmNlcHRzIGFuZCB3cmFwcyBjZXJ0YWluIG1ldGhvZHNcbiAgICAgICAqIGJhc2VkIG9uIHRoZSBnaXZlbiBgd3JhcHBlcnNgIGFuZCBgbWV0YWRhdGFgIG9iamVjdHMuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IHRhcmdldFxuICAgICAgICogICAgICAgIFRoZSB0YXJnZXQgb2JqZWN0IHRvIHdyYXAuXG4gICAgICAgKlxuICAgICAgICogQHBhcmFtIHtvYmplY3R9IFt3cmFwcGVycyA9IHt9XVxuICAgICAgICogICAgICAgIEFuIG9iamVjdCB0cmVlIGNvbnRhaW5pbmcgd3JhcHBlciBmdW5jdGlvbnMgZm9yIHNwZWNpYWwgY2FzZXMuIEFueVxuICAgICAgICogICAgICAgIGZ1bmN0aW9uIHByZXNlbnQgaW4gdGhpcyBvYmplY3QgdHJlZSBpcyBjYWxsZWQgaW4gcGxhY2Ugb2YgdGhlXG4gICAgICAgKiAgICAgICAgbWV0aG9kIGluIHRoZSBzYW1lIGxvY2F0aW9uIGluIHRoZSBgdGFyZ2V0YCBvYmplY3QgdHJlZS4gVGhlc2VcbiAgICAgICAqICAgICAgICB3cmFwcGVyIG1ldGhvZHMgYXJlIGludm9rZWQgYXMgZGVzY3JpYmVkIGluIHtAc2VlIHdyYXBNZXRob2R9LlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSBbbWV0YWRhdGEgPSB7fV1cbiAgICAgICAqICAgICAgICBBbiBvYmplY3QgdHJlZSBjb250YWluaW5nIG1ldGFkYXRhIHVzZWQgdG8gYXV0b21hdGljYWxseSBnZW5lcmF0ZVxuICAgICAgICogICAgICAgIFByb21pc2UtYmFzZWQgd3JhcHBlciBmdW5jdGlvbnMgZm9yIGFzeW5jaHJvbm91cy4gQW55IGZ1bmN0aW9uIGluXG4gICAgICAgKiAgICAgICAgdGhlIGB0YXJnZXRgIG9iamVjdCB0cmVlIHdoaWNoIGhhcyBhIGNvcnJlc3BvbmRpbmcgbWV0YWRhdGEgb2JqZWN0XG4gICAgICAgKiAgICAgICAgaW4gdGhlIHNhbWUgbG9jYXRpb24gaW4gdGhlIGBtZXRhZGF0YWAgdHJlZSBpcyByZXBsYWNlZCB3aXRoIGFuXG4gICAgICAgKiAgICAgICAgYXV0b21hdGljYWxseS1nZW5lcmF0ZWQgd3JhcHBlciBmdW5jdGlvbiwgYXMgZGVzY3JpYmVkIGluXG4gICAgICAgKiAgICAgICAge0BzZWUgd3JhcEFzeW5jRnVuY3Rpb259XG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge1Byb3h5PG9iamVjdD59XG4gICAgICAgKi9cbiAgICAgIGNvbnN0IHdyYXBPYmplY3QgPSAodGFyZ2V0LCB3cmFwcGVycyA9IHt9LCBtZXRhZGF0YSA9IHt9KSA9PiB7XG4gICAgICAgIGxldCBjYWNoZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG4gICAgICAgIGxldCBoYW5kbGVycyA9IHtcbiAgICAgICAgICBoYXMocHJveHlUYXJnZXQsIHByb3ApIHtcbiAgICAgICAgICAgIHJldHVybiBwcm9wIGluIHRhcmdldCB8fCBwcm9wIGluIGNhY2hlO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZ2V0KHByb3h5VGFyZ2V0LCBwcm9wLCByZWNlaXZlcikge1xuICAgICAgICAgICAgaWYgKHByb3AgaW4gY2FjaGUpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGNhY2hlW3Byb3BdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCEocHJvcCBpbiB0YXJnZXQpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBsZXQgdmFsdWUgPSB0YXJnZXRbcHJvcF07XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhIG1ldGhvZCBvbiB0aGUgdW5kZXJseWluZyBvYmplY3QuIENoZWNrIGlmIHdlIG5lZWQgdG8gZG9cbiAgICAgICAgICAgICAgLy8gYW55IHdyYXBwaW5nLlxuXG4gICAgICAgICAgICAgIGlmICh0eXBlb2Ygd3JhcHBlcnNbcHJvcF0gPT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgICAgIC8vIFdlIGhhdmUgYSBzcGVjaWFsLWNhc2Ugd3JhcHBlciBmb3IgdGhpcyBtZXRob2QuXG4gICAgICAgICAgICAgICAgdmFsdWUgPSB3cmFwTWV0aG9kKHRhcmdldCwgdGFyZ2V0W3Byb3BdLCB3cmFwcGVyc1twcm9wXSk7XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAoaGFzT3duUHJvcGVydHkobWV0YWRhdGEsIHByb3ApKSB7XG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhbiBhc3luYyBtZXRob2QgdGhhdCB3ZSBoYXZlIG1ldGFkYXRhIGZvci4gQ3JlYXRlIGFcbiAgICAgICAgICAgICAgICAvLyBQcm9taXNlIHdyYXBwZXIgZm9yIGl0LlxuICAgICAgICAgICAgICAgIGxldCB3cmFwcGVyID0gd3JhcEFzeW5jRnVuY3Rpb24ocHJvcCwgbWV0YWRhdGFbcHJvcF0pO1xuICAgICAgICAgICAgICAgIHZhbHVlID0gd3JhcE1ldGhvZCh0YXJnZXQsIHRhcmdldFtwcm9wXSwgd3JhcHBlcik7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhIG1ldGhvZCB0aGF0IHdlIGRvbid0IGtub3cgb3IgY2FyZSBhYm91dC4gUmV0dXJuIHRoZVxuICAgICAgICAgICAgICAgIC8vIG9yaWdpbmFsIG1ldGhvZCwgYm91bmQgdG8gdGhlIHVuZGVybHlpbmcgb2JqZWN0LlxuICAgICAgICAgICAgICAgIHZhbHVlID0gdmFsdWUuYmluZCh0YXJnZXQpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJvYmplY3RcIiAmJiB2YWx1ZSAhPT0gbnVsbCAmJiAoaGFzT3duUHJvcGVydHkod3JhcHBlcnMsIHByb3ApIHx8IGhhc093blByb3BlcnR5KG1ldGFkYXRhLCBwcm9wKSkpIHtcbiAgICAgICAgICAgICAgLy8gVGhpcyBpcyBhbiBvYmplY3QgdGhhdCB3ZSBuZWVkIHRvIGRvIHNvbWUgd3JhcHBpbmcgZm9yIHRoZSBjaGlsZHJlblxuICAgICAgICAgICAgICAvLyBvZi4gQ3JlYXRlIGEgc3ViLW9iamVjdCB3cmFwcGVyIGZvciBpdCB3aXRoIHRoZSBhcHByb3ByaWF0ZSBjaGlsZFxuICAgICAgICAgICAgICAvLyBtZXRhZGF0YS5cbiAgICAgICAgICAgICAgdmFsdWUgPSB3cmFwT2JqZWN0KHZhbHVlLCB3cmFwcGVyc1twcm9wXSwgbWV0YWRhdGFbcHJvcF0pO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChoYXNPd25Qcm9wZXJ0eShtZXRhZGF0YSwgXCIqXCIpKSB7XG4gICAgICAgICAgICAgIC8vIFdyYXAgYWxsIHByb3BlcnRpZXMgaW4gKiBuYW1lc3BhY2UuXG4gICAgICAgICAgICAgIHZhbHVlID0gd3JhcE9iamVjdCh2YWx1ZSwgd3JhcHBlcnNbcHJvcF0sIG1ldGFkYXRhW1wiKlwiXSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBXZSBkb24ndCBuZWVkIHRvIGRvIGFueSB3cmFwcGluZyBmb3IgdGhpcyBwcm9wZXJ0eSxcbiAgICAgICAgICAgICAgLy8gc28ganVzdCBmb3J3YXJkIGFsbCBhY2Nlc3MgdG8gdGhlIHVuZGVybHlpbmcgb2JqZWN0LlxuICAgICAgICAgICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkoY2FjaGUsIHByb3AsIHtcbiAgICAgICAgICAgICAgICBjb25maWd1cmFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICBnZXQoKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gdGFyZ2V0W3Byb3BdO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgc2V0KHZhbHVlKSB7XG4gICAgICAgICAgICAgICAgICB0YXJnZXRbcHJvcF0gPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICByZXR1cm4gdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYWNoZVtwcm9wXSA9IHZhbHVlO1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgc2V0KHByb3h5VGFyZ2V0LCBwcm9wLCB2YWx1ZSwgcmVjZWl2ZXIpIHtcbiAgICAgICAgICAgIGlmIChwcm9wIGluIGNhY2hlKSB7XG4gICAgICAgICAgICAgIGNhY2hlW3Byb3BdID0gdmFsdWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0YXJnZXRbcHJvcF0gPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZGVmaW5lUHJvcGVydHkocHJveHlUYXJnZXQsIHByb3AsIGRlc2MpIHtcbiAgICAgICAgICAgIHJldHVybiBSZWZsZWN0LmRlZmluZVByb3BlcnR5KGNhY2hlLCBwcm9wLCBkZXNjKTtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGRlbGV0ZVByb3BlcnR5KHByb3h5VGFyZ2V0LCBwcm9wKSB7XG4gICAgICAgICAgICByZXR1cm4gUmVmbGVjdC5kZWxldGVQcm9wZXJ0eShjYWNoZSwgcHJvcCk7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIFBlciBjb250cmFjdCBvZiB0aGUgUHJveHkgQVBJLCB0aGUgXCJnZXRcIiBwcm94eSBoYW5kbGVyIG11c3QgcmV0dXJuIHRoZVxuICAgICAgICAvLyBvcmlnaW5hbCB2YWx1ZSBvZiB0aGUgdGFyZ2V0IGlmIHRoYXQgdmFsdWUgaXMgZGVjbGFyZWQgcmVhZC1vbmx5IGFuZFxuICAgICAgICAvLyBub24tY29uZmlndXJhYmxlLiBGb3IgdGhpcyByZWFzb24sIHdlIGNyZWF0ZSBhbiBvYmplY3Qgd2l0aCB0aGVcbiAgICAgICAgLy8gcHJvdG90eXBlIHNldCB0byBgdGFyZ2V0YCBpbnN0ZWFkIG9mIHVzaW5nIGB0YXJnZXRgIGRpcmVjdGx5LlxuICAgICAgICAvLyBPdGhlcndpc2Ugd2UgY2Fubm90IHJldHVybiBhIGN1c3RvbSBvYmplY3QgZm9yIEFQSXMgdGhhdFxuICAgICAgICAvLyBhcmUgZGVjbGFyZWQgcmVhZC1vbmx5IGFuZCBub24tY29uZmlndXJhYmxlLCBzdWNoIGFzIGBjaHJvbWUuZGV2dG9vbHNgLlxuICAgICAgICAvL1xuICAgICAgICAvLyBUaGUgcHJveHkgaGFuZGxlcnMgdGhlbXNlbHZlcyB3aWxsIHN0aWxsIHVzZSB0aGUgb3JpZ2luYWwgYHRhcmdldGBcbiAgICAgICAgLy8gaW5zdGVhZCBvZiB0aGUgYHByb3h5VGFyZ2V0YCwgc28gdGhhdCB0aGUgbWV0aG9kcyBhbmQgcHJvcGVydGllcyBhcmVcbiAgICAgICAgLy8gZGVyZWZlcmVuY2VkIHZpYSB0aGUgb3JpZ2luYWwgdGFyZ2V0cy5cbiAgICAgICAgbGV0IHByb3h5VGFyZ2V0ID0gT2JqZWN0LmNyZWF0ZSh0YXJnZXQpO1xuICAgICAgICByZXR1cm4gbmV3IFByb3h5KHByb3h5VGFyZ2V0LCBoYW5kbGVycyk7XG4gICAgICB9O1xuXG4gICAgICAvKipcbiAgICAgICAqIENyZWF0ZXMgYSBzZXQgb2Ygd3JhcHBlciBmdW5jdGlvbnMgZm9yIGFuIGV2ZW50IG9iamVjdCwgd2hpY2ggaGFuZGxlc1xuICAgICAgICogd3JhcHBpbmcgb2YgbGlzdGVuZXIgZnVuY3Rpb25zIHRoYXQgdGhvc2UgbWVzc2FnZXMgYXJlIHBhc3NlZC5cbiAgICAgICAqXG4gICAgICAgKiBBIHNpbmdsZSB3cmFwcGVyIGlzIGNyZWF0ZWQgZm9yIGVhY2ggbGlzdGVuZXIgZnVuY3Rpb24sIGFuZCBzdG9yZWQgaW4gYVxuICAgICAgICogbWFwLiBTdWJzZXF1ZW50IGNhbGxzIHRvIGBhZGRMaXN0ZW5lcmAsIGBoYXNMaXN0ZW5lcmAsIG9yIGByZW1vdmVMaXN0ZW5lcmBcbiAgICAgICAqIHJldHJpZXZlIHRoZSBvcmlnaW5hbCB3cmFwcGVyLCBzbyB0aGF0ICBhdHRlbXB0cyB0byByZW1vdmUgYVxuICAgICAgICogcHJldmlvdXNseS1hZGRlZCBsaXN0ZW5lciB3b3JrIGFzIGV4cGVjdGVkLlxuICAgICAgICpcbiAgICAgICAqIEBwYXJhbSB7RGVmYXVsdFdlYWtNYXA8ZnVuY3Rpb24sIGZ1bmN0aW9uPn0gd3JhcHBlck1hcFxuICAgICAgICogICAgICAgIEEgRGVmYXVsdFdlYWtNYXAgb2JqZWN0IHdoaWNoIHdpbGwgY3JlYXRlIHRoZSBhcHByb3ByaWF0ZSB3cmFwcGVyXG4gICAgICAgKiAgICAgICAgZm9yIGEgZ2l2ZW4gbGlzdGVuZXIgZnVuY3Rpb24gd2hlbiBvbmUgZG9lcyBub3QgZXhpc3QsIGFuZCByZXRyaWV2ZVxuICAgICAgICogICAgICAgIGFuIGV4aXN0aW5nIG9uZSB3aGVuIGl0IGRvZXMuXG4gICAgICAgKlxuICAgICAgICogQHJldHVybnMge29iamVjdH1cbiAgICAgICAqL1xuICAgICAgY29uc3Qgd3JhcEV2ZW50ID0gd3JhcHBlck1hcCA9PiAoe1xuICAgICAgICBhZGRMaXN0ZW5lcih0YXJnZXQsIGxpc3RlbmVyLCAuLi5hcmdzKSB7XG4gICAgICAgICAgdGFyZ2V0LmFkZExpc3RlbmVyKHdyYXBwZXJNYXAuZ2V0KGxpc3RlbmVyKSwgLi4uYXJncyk7XG4gICAgICAgIH0sXG4gICAgICAgIGhhc0xpc3RlbmVyKHRhcmdldCwgbGlzdGVuZXIpIHtcbiAgICAgICAgICByZXR1cm4gdGFyZ2V0Lmhhc0xpc3RlbmVyKHdyYXBwZXJNYXAuZ2V0KGxpc3RlbmVyKSk7XG4gICAgICAgIH0sXG4gICAgICAgIHJlbW92ZUxpc3RlbmVyKHRhcmdldCwgbGlzdGVuZXIpIHtcbiAgICAgICAgICB0YXJnZXQucmVtb3ZlTGlzdGVuZXIod3JhcHBlck1hcC5nZXQobGlzdGVuZXIpKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBjb25zdCBvblJlcXVlc3RGaW5pc2hlZFdyYXBwZXJzID0gbmV3IERlZmF1bHRXZWFrTWFwKGxpc3RlbmVyID0+IHtcbiAgICAgICAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgcmV0dXJuIGxpc3RlbmVyO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFdyYXBzIGFuIG9uUmVxdWVzdEZpbmlzaGVkIGxpc3RlbmVyIGZ1bmN0aW9uIHNvIHRoYXQgaXQgd2lsbCByZXR1cm4gYVxuICAgICAgICAgKiBgZ2V0Q29udGVudCgpYCBwcm9wZXJ0eSB3aGljaCByZXR1cm5zIGEgYFByb21pc2VgIHJhdGhlciB0aGFuIHVzaW5nIGFcbiAgICAgICAgICogY2FsbGJhY2sgQVBJLlxuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0ge29iamVjdH0gcmVxXG4gICAgICAgICAqICAgICAgICBUaGUgSEFSIGVudHJ5IG9iamVjdCByZXByZXNlbnRpbmcgdGhlIG5ldHdvcmsgcmVxdWVzdC5cbiAgICAgICAgICovXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBvblJlcXVlc3RGaW5pc2hlZChyZXEpIHtcbiAgICAgICAgICBjb25zdCB3cmFwcGVkUmVxID0gd3JhcE9iamVjdChyZXEsIHt9IC8qIHdyYXBwZXJzICovLCB7XG4gICAgICAgICAgICBnZXRDb250ZW50OiB7XG4gICAgICAgICAgICAgIG1pbkFyZ3M6IDAsXG4gICAgICAgICAgICAgIG1heEFyZ3M6IDBcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBsaXN0ZW5lcih3cmFwcGVkUmVxKTtcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICAgICAgY29uc3Qgb25NZXNzYWdlV3JhcHBlcnMgPSBuZXcgRGVmYXVsdFdlYWtNYXAobGlzdGVuZXIgPT4ge1xuICAgICAgICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICByZXR1cm4gbGlzdGVuZXI7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogV3JhcHMgYSBtZXNzYWdlIGxpc3RlbmVyIGZ1bmN0aW9uIHNvIHRoYXQgaXQgbWF5IHNlbmQgcmVzcG9uc2VzIGJhc2VkIG9uXG4gICAgICAgICAqIGl0cyByZXR1cm4gdmFsdWUsIHJhdGhlciB0aGFuIGJ5IHJldHVybmluZyBhIHNlbnRpbmVsIHZhbHVlIGFuZCBjYWxsaW5nIGFcbiAgICAgICAgICogY2FsbGJhY2suIElmIHRoZSBsaXN0ZW5lciBmdW5jdGlvbiByZXR1cm5zIGEgUHJvbWlzZSwgdGhlIHJlc3BvbnNlIGlzXG4gICAgICAgICAqIHNlbnQgd2hlbiB0aGUgcHJvbWlzZSBlaXRoZXIgcmVzb2x2ZXMgb3IgcmVqZWN0cy5cbiAgICAgICAgICpcbiAgICAgICAgICogQHBhcmFtIHsqfSBtZXNzYWdlXG4gICAgICAgICAqICAgICAgICBUaGUgbWVzc2FnZSBzZW50IGJ5IHRoZSBvdGhlciBlbmQgb2YgdGhlIGNoYW5uZWwuXG4gICAgICAgICAqIEBwYXJhbSB7b2JqZWN0fSBzZW5kZXJcbiAgICAgICAgICogICAgICAgIERldGFpbHMgYWJvdXQgdGhlIHNlbmRlciBvZiB0aGUgbWVzc2FnZS5cbiAgICAgICAgICogQHBhcmFtIHtmdW5jdGlvbigqKX0gc2VuZFJlc3BvbnNlXG4gICAgICAgICAqICAgICAgICBBIGNhbGxiYWNrIHdoaWNoLCB3aGVuIGNhbGxlZCB3aXRoIGFuIGFyYml0cmFyeSBhcmd1bWVudCwgc2VuZHNcbiAgICAgICAgICogICAgICAgIHRoYXQgdmFsdWUgYXMgYSByZXNwb25zZS5cbiAgICAgICAgICogQHJldHVybnMge2Jvb2xlYW59XG4gICAgICAgICAqICAgICAgICBUcnVlIGlmIHRoZSB3cmFwcGVkIGxpc3RlbmVyIHJldHVybmVkIGEgUHJvbWlzZSwgd2hpY2ggd2lsbCBsYXRlclxuICAgICAgICAgKiAgICAgICAgeWllbGQgYSByZXNwb25zZS4gRmFsc2Ugb3RoZXJ3aXNlLlxuICAgICAgICAgKi9cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG9uTWVzc2FnZShtZXNzYWdlLCBzZW5kZXIsIHNlbmRSZXNwb25zZSkge1xuICAgICAgICAgIGxldCBkaWRDYWxsU2VuZFJlc3BvbnNlID0gZmFsc2U7XG4gICAgICAgICAgbGV0IHdyYXBwZWRTZW5kUmVzcG9uc2U7XG4gICAgICAgICAgbGV0IHNlbmRSZXNwb25zZVByb21pc2UgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgICAgIHdyYXBwZWRTZW5kUmVzcG9uc2UgPSBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgICAgICAgICAgZGlkQ2FsbFNlbmRSZXNwb25zZSA9IHRydWU7XG4gICAgICAgICAgICAgIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBsZXQgcmVzdWx0O1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICByZXN1bHQgPSBsaXN0ZW5lcihtZXNzYWdlLCBzZW5kZXIsIHdyYXBwZWRTZW5kUmVzcG9uc2UpO1xuICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgcmVzdWx0ID0gUHJvbWlzZS5yZWplY3QoZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgaXNSZXN1bHRUaGVuYWJsZSA9IHJlc3VsdCAhPT0gdHJ1ZSAmJiBpc1RoZW5hYmxlKHJlc3VsdCk7XG5cbiAgICAgICAgICAvLyBJZiB0aGUgbGlzdGVuZXIgZGlkbid0IHJldHVybmVkIHRydWUgb3IgYSBQcm9taXNlLCBvciBjYWxsZWRcbiAgICAgICAgICAvLyB3cmFwcGVkU2VuZFJlc3BvbnNlIHN5bmNocm9ub3VzbHksIHdlIGNhbiBleGl0IGVhcmxpZXJcbiAgICAgICAgICAvLyBiZWNhdXNlIHRoZXJlIHdpbGwgYmUgbm8gcmVzcG9uc2Ugc2VudCBmcm9tIHRoaXMgbGlzdGVuZXIuXG4gICAgICAgICAgaWYgKHJlc3VsdCAhPT0gdHJ1ZSAmJiAhaXNSZXN1bHRUaGVuYWJsZSAmJiAhZGlkQ2FsbFNlbmRSZXNwb25zZSkge1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIEEgc21hbGwgaGVscGVyIHRvIHNlbmQgdGhlIG1lc3NhZ2UgaWYgdGhlIHByb21pc2UgcmVzb2x2ZXNcbiAgICAgICAgICAvLyBhbmQgYW4gZXJyb3IgaWYgdGhlIHByb21pc2UgcmVqZWN0cyAoYSB3cmFwcGVkIHNlbmRNZXNzYWdlIGhhc1xuICAgICAgICAgIC8vIHRvIHRyYW5zbGF0ZSB0aGUgbWVzc2FnZSBpbnRvIGEgcmVzb2x2ZWQgcHJvbWlzZSBvciBhIHJlamVjdGVkXG4gICAgICAgICAgLy8gcHJvbWlzZSkuXG4gICAgICAgICAgY29uc3Qgc2VuZFByb21pc2VkUmVzdWx0ID0gcHJvbWlzZSA9PiB7XG4gICAgICAgICAgICBwcm9taXNlLnRoZW4obXNnID0+IHtcbiAgICAgICAgICAgICAgLy8gc2VuZCB0aGUgbWVzc2FnZSB2YWx1ZS5cbiAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKG1zZyk7XG4gICAgICAgICAgICB9LCBlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIFNlbmQgYSBKU09OIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBlcnJvciBpZiB0aGUgcmVqZWN0ZWQgdmFsdWVcbiAgICAgICAgICAgICAgLy8gaXMgYW4gaW5zdGFuY2Ugb2YgZXJyb3IsIG9yIHRoZSBvYmplY3QgaXRzZWxmIG90aGVyd2lzZS5cbiAgICAgICAgICAgICAgbGV0IG1lc3NhZ2U7XG4gICAgICAgICAgICAgIGlmIChlcnJvciAmJiAoZXJyb3IgaW5zdGFuY2VvZiBFcnJvciB8fCB0eXBlb2YgZXJyb3IubWVzc2FnZSA9PT0gXCJzdHJpbmdcIikpIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gZXJyb3IubWVzc2FnZTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlID0gXCJBbiB1bmV4cGVjdGVkIGVycm9yIG9jY3VycmVkXCI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgc2VuZFJlc3BvbnNlKHtcbiAgICAgICAgICAgICAgICBfX21veldlYkV4dGVuc2lvblBvbHlmaWxsUmVqZWN0X186IHRydWUsXG4gICAgICAgICAgICAgICAgbWVzc2FnZVxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIC8vIFByaW50IGFuIGVycm9yIG9uIHRoZSBjb25zb2xlIGlmIHVuYWJsZSB0byBzZW5kIHRoZSByZXNwb25zZS5cbiAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byBzZW5kIG9uTWVzc2FnZSByZWplY3RlZCByZXBseVwiLCBlcnIpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfTtcblxuICAgICAgICAgIC8vIElmIHRoZSBsaXN0ZW5lciByZXR1cm5lZCBhIFByb21pc2UsIHNlbmQgdGhlIHJlc29sdmVkIHZhbHVlIGFzIGFcbiAgICAgICAgICAvLyByZXN1bHQsIG90aGVyd2lzZSB3YWl0IHRoZSBwcm9taXNlIHJlbGF0ZWQgdG8gdGhlIHdyYXBwZWRTZW5kUmVzcG9uc2VcbiAgICAgICAgICAvLyBjYWxsYmFjayB0byByZXNvbHZlIGFuZCBzZW5kIGl0IGFzIGEgcmVzcG9uc2UuXG4gICAgICAgICAgaWYgKGlzUmVzdWx0VGhlbmFibGUpIHtcbiAgICAgICAgICAgIHNlbmRQcm9taXNlZFJlc3VsdChyZXN1bHQpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZW5kUHJvbWlzZWRSZXN1bHQoc2VuZFJlc3BvbnNlUHJvbWlzZSk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gTGV0IENocm9tZSBrbm93IHRoYXQgdGhlIGxpc3RlbmVyIGlzIHJlcGx5aW5nLlxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9O1xuICAgICAgfSk7XG4gICAgICBjb25zdCB3cmFwcGVkU2VuZE1lc3NhZ2VDYWxsYmFjayA9ICh7XG4gICAgICAgIHJlamVjdCxcbiAgICAgICAgcmVzb2x2ZVxuICAgICAgfSwgcmVwbHkpID0+IHtcbiAgICAgICAgaWYgKGV4dGVuc2lvbkFQSXMucnVudGltZS5sYXN0RXJyb3IpIHtcbiAgICAgICAgICAvLyBEZXRlY3Qgd2hlbiBub25lIG9mIHRoZSBsaXN0ZW5lcnMgcmVwbGllZCB0byB0aGUgc2VuZE1lc3NhZ2UgY2FsbCBhbmQgcmVzb2x2ZVxuICAgICAgICAgIC8vIHRoZSBwcm9taXNlIHRvIHVuZGVmaW5lZCBhcyBpbiBGaXJlZm94LlxuICAgICAgICAgIC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbW96aWxsYS93ZWJleHRlbnNpb24tcG9seWZpbGwvaXNzdWVzLzEzMFxuICAgICAgICAgIGlmIChleHRlbnNpb25BUElzLnJ1bnRpbWUubGFzdEVycm9yLm1lc3NhZ2UgPT09IENIUk9NRV9TRU5EX01FU1NBR0VfQ0FMTEJBQ0tfTk9fUkVTUE9OU0VfTUVTU0FHRSkge1xuICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZWplY3QobmV3IEVycm9yKGV4dGVuc2lvbkFQSXMucnVudGltZS5sYXN0RXJyb3IubWVzc2FnZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChyZXBseSAmJiByZXBseS5fX21veldlYkV4dGVuc2lvblBvbHlmaWxsUmVqZWN0X18pIHtcbiAgICAgICAgICAvLyBDb252ZXJ0IGJhY2sgdGhlIEpTT04gcmVwcmVzZW50YXRpb24gb2YgdGhlIGVycm9yIGludG9cbiAgICAgICAgICAvLyBhbiBFcnJvciBpbnN0YW5jZS5cbiAgICAgICAgICByZWplY3QobmV3IEVycm9yKHJlcGx5Lm1lc3NhZ2UpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXNvbHZlKHJlcGx5KTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIGNvbnN0IHdyYXBwZWRTZW5kTWVzc2FnZSA9IChuYW1lLCBtZXRhZGF0YSwgYXBpTmFtZXNwYWNlT2JqLCAuLi5hcmdzKSA9PiB7XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA8IG1ldGFkYXRhLm1pbkFyZ3MpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGF0IGxlYXN0ICR7bWV0YWRhdGEubWluQXJnc30gJHtwbHVyYWxpemVBcmd1bWVudHMobWV0YWRhdGEubWluQXJncyl9IGZvciAke25hbWV9KCksIGdvdCAke2FyZ3MubGVuZ3RofWApO1xuICAgICAgICB9XG4gICAgICAgIGlmIChhcmdzLmxlbmd0aCA+IG1ldGFkYXRhLm1heEFyZ3MpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGF0IG1vc3QgJHttZXRhZGF0YS5tYXhBcmdzfSAke3BsdXJhbGl6ZUFyZ3VtZW50cyhtZXRhZGF0YS5tYXhBcmdzKX0gZm9yICR7bmFtZX0oKSwgZ290ICR7YXJncy5sZW5ndGh9YCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICBjb25zdCB3cmFwcGVkQ2IgPSB3cmFwcGVkU2VuZE1lc3NhZ2VDYWxsYmFjay5iaW5kKG51bGwsIHtcbiAgICAgICAgICAgIHJlc29sdmUsXG4gICAgICAgICAgICByZWplY3RcbiAgICAgICAgICB9KTtcbiAgICAgICAgICBhcmdzLnB1c2god3JhcHBlZENiKTtcbiAgICAgICAgICBhcGlOYW1lc3BhY2VPYmouc2VuZE1lc3NhZ2UoLi4uYXJncyk7XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICAgIGNvbnN0IHN0YXRpY1dyYXBwZXJzID0ge1xuICAgICAgICBkZXZ0b29sczoge1xuICAgICAgICAgIG5ldHdvcms6IHtcbiAgICAgICAgICAgIG9uUmVxdWVzdEZpbmlzaGVkOiB3cmFwRXZlbnQob25SZXF1ZXN0RmluaXNoZWRXcmFwcGVycylcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHJ1bnRpbWU6IHtcbiAgICAgICAgICBvbk1lc3NhZ2U6IHdyYXBFdmVudChvbk1lc3NhZ2VXcmFwcGVycyksXG4gICAgICAgICAgb25NZXNzYWdlRXh0ZXJuYWw6IHdyYXBFdmVudChvbk1lc3NhZ2VXcmFwcGVycyksXG4gICAgICAgICAgc2VuZE1lc3NhZ2U6IHdyYXBwZWRTZW5kTWVzc2FnZS5iaW5kKG51bGwsIFwic2VuZE1lc3NhZ2VcIiwge1xuICAgICAgICAgICAgbWluQXJnczogMSxcbiAgICAgICAgICAgIG1heEFyZ3M6IDNcbiAgICAgICAgICB9KVxuICAgICAgICB9LFxuICAgICAgICB0YWJzOiB7XG4gICAgICAgICAgc2VuZE1lc3NhZ2U6IHdyYXBwZWRTZW5kTWVzc2FnZS5iaW5kKG51bGwsIFwic2VuZE1lc3NhZ2VcIiwge1xuICAgICAgICAgICAgbWluQXJnczogMixcbiAgICAgICAgICAgIG1heEFyZ3M6IDNcbiAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICB9O1xuICAgICAgY29uc3Qgc2V0dGluZ01ldGFkYXRhID0ge1xuICAgICAgICBjbGVhcjoge1xuICAgICAgICAgIG1pbkFyZ3M6IDEsXG4gICAgICAgICAgbWF4QXJnczogMVxuICAgICAgICB9LFxuICAgICAgICBnZXQ6IHtcbiAgICAgICAgICBtaW5BcmdzOiAxLFxuICAgICAgICAgIG1heEFyZ3M6IDFcbiAgICAgICAgfSxcbiAgICAgICAgc2V0OiB7XG4gICAgICAgICAgbWluQXJnczogMSxcbiAgICAgICAgICBtYXhBcmdzOiAxXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBhcGlNZXRhZGF0YS5wcml2YWN5ID0ge1xuICAgICAgICBuZXR3b3JrOiB7XG4gICAgICAgICAgXCIqXCI6IHNldHRpbmdNZXRhZGF0YVxuICAgICAgICB9LFxuICAgICAgICBzZXJ2aWNlczoge1xuICAgICAgICAgIFwiKlwiOiBzZXR0aW5nTWV0YWRhdGFcbiAgICAgICAgfSxcbiAgICAgICAgd2Vic2l0ZXM6IHtcbiAgICAgICAgICBcIipcIjogc2V0dGluZ01ldGFkYXRhXG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICByZXR1cm4gd3JhcE9iamVjdChleHRlbnNpb25BUElzLCBzdGF0aWNXcmFwcGVycywgYXBpTWV0YWRhdGEpO1xuICAgIH07XG5cbiAgICAvLyBUaGUgYnVpbGQgcHJvY2VzcyBhZGRzIGEgVU1EIHdyYXBwZXIgYXJvdW5kIHRoaXMgZmlsZSwgd2hpY2ggbWFrZXMgdGhlXG4gICAgLy8gYG1vZHVsZWAgdmFyaWFibGUgYXZhaWxhYmxlLlxuICAgIG1vZHVsZS5leHBvcnRzID0gd3JhcEFQSXMoY2hyb21lKTtcbiAgfSBlbHNlIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGdsb2JhbFRoaXMuYnJvd3NlcjtcbiAgfVxufSk7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1icm93c2VyLXBvbHlmaWxsLmpzLm1hcFxuIiwiaW1wb3J0IG9yaWdpbmFsQnJvd3NlciBmcm9tIFwid2ViZXh0ZW5zaW9uLXBvbHlmaWxsXCI7XG5leHBvcnQgY29uc3QgYnJvd3NlciA9IG9yaWdpbmFsQnJvd3NlcjtcbiJdLCJuYW1lcyI6WyJnZXRIb3N0bmFtZSIsInRoaXMiLCJtb2R1bGUiLCJwcm94eVRhcmdldCIsInZhbHVlIiwicmVzdWx0IiwibWVzc2FnZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFjTyxRQUFNLGtCQUFpQztBQUFBLElBQzVDLFFBQVE7QUFBQSxJQUNSLFdBQVc7QUFBQSxJQUNYLFlBQVk7QUFBQSxJQUNaLE1BQU07QUFBQSxJQUNOLE9BQU87QUFBQSxFQUNUO0FBRWlELEdBQUE7QUFBQSxJQUUvQyxVQUFVLEVBQUUsR0FBRyxnQkFBQTtBQUFBLEVBRWpCO0FBNkRBLFFBQU0sZ0JBQ0osT0FBTyxpQkFBaUIsZUFDeEIsYUFBYSxRQUFRLFVBQVUsTUFBTTtBQUVoQyxXQUFTLFlBQVksTUFBYTtBQUN2QyxRQUFJLGVBQWU7QUFDakIsY0FBUSxJQUFJLFNB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
