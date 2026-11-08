// ==============================================================================
// F.R.O.S.T. Mock Chrome MV3 Environment with Virtual Clock & SW Lifecycle
// ==============================================================================

export class MockChromeMV3 {
    constructor(initialTime = Date.now()) {
        this.virtualTime = initialTime;
        this.originalDateNow = Date.now;
        this.originalDate = globalThis.Date;

        // Persistent State across Service Worker lifecycles
        this.storageData = {};
        this.alarmsMap = new Map();
        this.tabsList = [];
        this.windowsList = [];
        this.callLog = {
            tabsRemoved: [],
            tabsUpdated: [],
            alarmsCreated: [],
            alarmsCleared: [],
            badgeUpdates: []
        };

        // Active intervals recorded during worker execution so they can be cleaned up on worker suspension
        this.activeIntervals = new Set();
        this.hookIntervals();

        // Bind mock APIs
        this.initStorage();
        this.initAlarms();
        this.initTabs();
        this.initWindows();
        this.initWebNavigation();
        this.initAction();
        this.initRuntime();
    }

    hookIntervals() {
        const self = this;
        this.originalSetInterval = globalThis.setInterval;
        this.originalClearInterval = globalThis.clearInterval;

        globalThis.setInterval = function (fn, ms, ...args) {
            const id = self.originalSetInterval(fn, ms, ...args);
            self.activeIntervals.add(id);
            return id;
        };

        globalThis.clearInterval = function (id) {
            self.activeIntervals.delete(id);
            self.originalClearInterval(id);
        };
    }

    restoreIntervals() {
        if (this.originalSetInterval) {
            globalThis.setInterval = this.originalSetInterval;
        }
        if (this.originalClearInterval) {
            globalThis.clearInterval = this.originalClearInterval;
        }
    }

    // Install virtual clock on global Date
    installVirtualClock() {
        const self = this;
        Date.now = () => self.virtualTime;

        // Wrap new Date()
        const OriginalDate = this.originalDate;
        function MockDate(...args) {
            if (args.length === 0) {
                return new OriginalDate(self.virtualTime);
            }
            return new OriginalDate(...args);
        }
        MockDate.now = () => self.virtualTime;
        MockDate.parse = OriginalDate.parse;
        MockDate.UTC = OriginalDate.UTC;
        MockDate.prototype = OriginalDate.prototype;

        globalThis.Date = MockDate;
    }

    uninstallVirtualClock() {
        Date.now = this.originalDateNow;
        globalThis.Date = this.originalDate;
    }

    advanceClock(ms) {
        this.virtualTime += ms;
    }

    setClock(timestamp) {
        this.virtualTime = timestamp;
    }

    // Attach this mock chrome instance to globalThis.chrome
    installGlobal() {
        this.installVirtualClock();
        globalThis.chrome = {
            storage: this.storage,
            alarms: this.alarms,
            tabs: this.tabs,
            windows: this.windows,
            webNavigation: this.webNavigation,
            action: this.action,
            runtime: this.runtime
        };
    }

    uninstallGlobal() {
        this.suspendWorker();
        this.uninstallVirtualClock();
        this.restoreIntervals();
        delete globalThis.chrome;
    }

    initStorage() {
        const self = this;
        this.storage = {
            local: {
                async get(keys) {
                    if (!keys) return { ...self.storageData };
                    if (typeof keys === 'string') {
                        return { [keys]: self.storageData[keys] };
                    }
                    if (Array.isArray(keys)) {
                        const res = {};
                        for (const k of keys) {
                            if (k in self.storageData) {
                                res[k] = self.storageData[k];
                            }
                        }
                        return res;
                    }
                    if (typeof keys === 'object') {
                        const res = { ...keys };
                        for (const k of Object.keys(keys)) {
                            if (k in self.storageData) {
                                res[k] = self.storageData[k];
                            }
                        }
                        return res;
                    }
                    return { ...self.storageData };
                },
                async set(items) {
                    for (const [k, v] of Object.entries(items)) {
                        self.storageData[k] = v;
                    }
                },
                async clear() {
                    self.storageData = {};
                }
            }
        };
    }

    initAlarms() {
        const self = this;
        this.alarmsListeners = [];

        this.alarms = {
            async create(name, info) {
                let scheduledTime = self.virtualTime;
                if (info.when) {
                    scheduledTime = info.when;
                } else if (info.delayInMinutes) {
                    scheduledTime = self.virtualTime + info.delayInMinutes * 60 * 1000;
                }
                const alarm = {
                    name,
                    scheduledTime,
                    periodInMinutes: info.periodInMinutes || null
                };
                self.alarmsMap.set(name, alarm);
                self.callLog.alarmsCreated.push({ name, info, scheduledTime, at: self.virtualTime });
            },
            async get(name) {
                return self.alarmsMap.get(name) || null;
            },
            async clear(name) {
                const existed = self.alarmsMap.delete(name);
                self.callLog.alarmsCleared.push({ name, at: self.virtualTime, existed });
                return existed;
            },
            async clearAll() {
                self.alarmsMap.clear();
                return true;
            },
            onAlarm: {
                addListener(fn) {
                    self.alarmsListeners.push(fn);
                },
                removeListener(fn) {
                    self.alarmsListeners = self.alarmsListeners.filter(l => l !== fn);
                }
            }
        };
    }

    initTabs() {
        const self = this;
        this.tabsUpdatedListeners = [];
        this.tabsActivatedListeners = [];
        this.tabsRemovedListeners = [];

        this.tabs = {
            async query(queryInfo = {}) {
                return self.tabsList.filter(t => {
                    if (queryInfo.active !== undefined && t.active !== queryInfo.active) return false;
                    if (queryInfo.windowId !== undefined && t.windowId !== queryInfo.windowId) return false;
                    if (queryInfo.lastFocusedWindow) {
                        const win = self.windowsList.find(w => w.id === t.windowId);
                        if (!win || !win.focused) return false;
                    }
                    return true;
                });
            },
            async remove(tabId) {
                self.callLog.tabsRemoved.push({ tabId, at: self.virtualTime });
                const idx = self.tabsList.findIndex(t => t.id === tabId);
                if (idx !== -1) {
                    self.tabsList.splice(idx, 1);
                }
                // Dispatch tabs.onRemoved
                for (const l of self.tabsRemovedListeners) {
                    try { l(tabId, { isWindowClosing: false, windowId: 1 }); } catch {}
                }
            },
            async update(tabId, updateInfo) {
                self.callLog.tabsUpdated.push({ tabId, updateInfo, at: self.virtualTime });
                const tab = self.tabsList.find(t => t.id === tabId);
                if (tab) {
                    Object.assign(tab, updateInfo);
                    // Dispatch tabs.onUpdated
                    for (const l of self.tabsUpdatedListeners) {
                        try { l(tabId, updateInfo, tab); } catch {}
                    }
                }
                return tab;
            },
            onUpdated: {
                addListener(fn) { self.tabsUpdatedListeners.push(fn); },
                removeListener(fn) { self.tabsUpdatedListeners = self.tabsUpdatedListeners.filter(l => l !== fn); }
            },
            onActivated: {
                addListener(fn) { self.tabsActivatedListeners.push(fn); },
                removeListener(fn) { self.tabsActivatedListeners = self.tabsActivatedListeners.filter(l => l !== fn); }
            },
            onRemoved: {
                addListener(fn) { self.tabsRemovedListeners.push(fn); },
                removeListener(fn) { self.tabsRemovedListeners = self.tabsRemovedListeners.filter(l => l !== fn); }
            }
        };
    }

    initWindows() {
        const self = this;
        this.windowsFocusListeners = [];

        this.windows = {
            WINDOW_ID_NONE: -1,
            async getLastFocused(queryInfo = {}) {
                let win = self.windowsList.find(w => w.focused);
                if (!win && self.windowsList.length > 0) {
                    win = self.windowsList[0];
                }
                if (!win) return null;

                const result = { ...win };
                if (queryInfo.populate) {
                    result.tabs = self.tabsList.filter(t => t.windowId === win.id);
                }
                return result;
            },
            onFocusChanged: {
                addListener(fn) { self.windowsFocusListeners.push(fn); },
                removeListener(fn) { self.windowsFocusListeners = self.windowsFocusListeners.filter(l => l !== fn); }
            }
        };
    }

    initWebNavigation() {
        const self = this;
        this.webNavBeforeListeners = [];
        this.webNavCommittedListeners = [];

        this.webNavigation = {
            onBeforeNavigate: {
                addListener(fn) { self.webNavBeforeListeners.push(fn); },
                removeListener(fn) { self.webNavBeforeListeners = self.webNavBeforeListeners.filter(l => l !== fn); }
            },
            onCommitted: {
                addListener(fn) { self.webNavCommittedListeners.push(fn); },
                removeListener(fn) { self.webNavCommittedListeners = self.webNavCommittedListeners.filter(l => l !== fn); }
            }
        };
    }

    initAction() {
        const self = this;
        this.actionClickedListeners = [];
        this.action = {
            badgeState: { text: '', color: '', textColor: '', title: '' },
            async setBadgeText({ text }) {
                self.action.badgeState.text = text;
                self.callLog.badgeUpdates.push({ text, at: self.virtualTime });
            },
            async setBadgeBackgroundColor({ color }) {
                self.action.badgeState.color = color;
            },
            async setBadgeTextColor({ color }) {
                self.action.badgeState.textColor = color;
            },
            async setTitle({ title }) {
                self.action.badgeState.title = title;
            },
            onClicked: {
                addListener(fn) { self.actionClickedListeners.push(fn); },
                removeListener(fn) { self.actionClickedListeners = self.actionClickedListeners.filter(l => l !== fn); }
            }
        };
    }

    initRuntime() {
        const self = this;
        this.runtimeMessageListeners = [];
        this.runtimeInstalledListeners = [];
        this.runtimeStartupListeners = [];

        this.runtime = {
            id: 'frost-extension-test-id',
            onMessage: {
                addListener(fn) { self.runtimeMessageListeners.push(fn); },
                removeListener(fn) { self.runtimeMessageListeners = self.runtimeMessageListeners.filter(l => l !== fn); }
            },
            onInstalled: {
                addListener(fn) { self.runtimeInstalledListeners.push(fn); },
                removeListener(fn) { self.runtimeInstalledListeners = self.runtimeInstalledListeners.filter(l => l !== fn); }
            },
            onStartup: {
                addListener(fn) { self.runtimeStartupListeners.push(fn); },
                removeListener(fn) { self.runtimeStartupListeners = self.runtimeStartupListeners.filter(l => l !== fn); }
            },
            // Simulate sending a message to background.js
            async sendMessage(message, sender = {}) {
                let responseResult = undefined;
                let responseHandled = false;

                const sendResponse = (res) => {
                    responseResult = res;
                    responseHandled = true;
                };

                for (const listener of self.runtimeMessageListeners) {
                    const isAsync = listener(message, sender, sendResponse);
                    if (isAsync) {
                        // Allow async handler to resolve
                        await new Promise(r => setImmediate(r));
                    }
                }

                // If async processing is in flight, poll briefly
                let loops = 0;
                while (!responseHandled && loops < 50) {
                    await new Promise(r => setTimeout(r, 10));
                    loops++;
                }

                return responseResult;
            }
        };
    }

    // Trigger tab activation
    async activateTab(tabId, windowId = 1) {
        for (const t of this.tabsList) {
            if (t.windowId === windowId) {
                t.active = (t.id === tabId);
            }
        }
        for (const l of this.tabsActivatedListeners) {
            l({ tabId, windowId });
        }
        // Give event microtasks time to run
        await new Promise(r => setTimeout(r, 20));
    }

    // Trigger tab update
    async updateTab(tabId, changeInfo) {
        const tab = this.tabsList.find(t => t.id === tabId);
        if (tab) {
            Object.assign(tab, changeInfo);
        }
        for (const l of this.tabsUpdatedListeners) {
            l(tabId, changeInfo, tab || { id: tabId, ...changeInfo });
        }
        await new Promise(r => setTimeout(r, 20));
    }

    // Trigger window focus change
    async changeWindowFocus(windowId) {
        for (const w of this.windowsList) {
            w.focused = (w.id === windowId);
        }
        for (const l of this.windowsFocusListeners) {
            l(windowId);
        }
        await new Promise(r => setTimeout(r, 20));
    }

    // Trigger alarm firing
    async fireAlarm(name) {
        const alarm = this.alarmsMap.get(name);
        const alarmObj = alarm || { name, scheduledTime: this.virtualTime };
        for (const l of this.alarmsListeners) {
            l(alarmObj);
        }
        await new Promise(r => setTimeout(r, 20));
    }

    // Trigger navigation
    async triggerBeforeNavigate(details) {
        for (const l of this.webNavBeforeListeners) {
            l(details);
        }
        await new Promise(r => setTimeout(r, 20));
    }

    // Terminate service worker: destroys transient event listeners and intervals,
    // leaving persistent storage, alarms, tabs, and windows intact.
    suspendWorker() {
        for (const id of this.activeIntervals) {
            this.originalClearInterval(id);
        }
        this.activeIntervals.clear();

        // Clear in-memory listeners registered by the worker instance
        this.alarmsListeners = [];
        this.tabsUpdatedListeners = [];
        this.tabsActivatedListeners = [];
        this.tabsRemovedListeners = [];
        this.windowsFocusListeners = [];
        this.webNavBeforeListeners = [];
        this.webNavCommittedListeners = [];
        this.runtimeMessageListeners = [];
        this.runtimeInstalledListeners = [];
        this.runtimeStartupListeners = [];
    }

    // Wake service worker: imports background.js with cache buster and executes trigger action
    async wakeWorker(backgroundPath = '../../background.js', triggerFn = null) {
        // Cache buster creates a brand new execution environment
        const runId = Math.random().toString(36).substring(2) + '_' + Date.now();
        const importUrl = `${backgroundPath}?run=${runId}`;
        await import(importUrl);
        // Wait for top-level bootstrap promises
        await new Promise(r => setTimeout(r, 30));

        if (triggerFn) {
            await triggerFn();
            await new Promise(r => setTimeout(r, 30));
        }
    }
}
