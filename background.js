import { 
    UNLOCK_DATE, 
    REDIRECT_TARGET, 
    BLOCKED_DOMAINS, 
    HARD_BLOCKED_DOMAINS, 
    DAILY_ALLOWANCE_MINUTES 
} from './constants.js';

const ALLOWANCE_MINUTES = (typeof DAILY_ALLOWANCE_MINUTES === 'number' && DAILY_ALLOWANCE_MINUTES > 0)
    ? DAILY_ALLOWANCE_MINUTES
    : 5;
const TIMER_LIMIT_MS = ALLOWANCE_MINUTES * 60 * 1000;
const DEFAULT_REDIRECT_FALLBACK = 'https://i.pinimg.com/736x/1b/fe/cc/1bfecc680fca94aaa57920bbce34582a.jpg';

const ALARM_LIMIT_EXPIRY = 'frost_limit_expiry';
const ALARM_HEARTBEAT = 'frost_heartbeat';

// Helper to safely get the target redirect URL
function getRedirectTarget() {
    if (REDIRECT_TARGET && typeof REDIRECT_TARGET === 'string' && REDIRECT_TARGET.trim().startsWith('http')) {
        return REDIRECT_TARGET.trim();
    }
    return DEFAULT_REDIRECT_FALLBACK;
}

// Helper to check if we are still in the blocking period
function isBlockingActive() {
    return new Date() < UNLOCK_DATE;
}

// Format local date string (YYYY-MM-DD) for accurate daily resets
function getLocalDateString() {
    return new Date().toLocaleDateString('en-CA');
}

function getHostname(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
}

function hostnameMatches(hostname, domainPattern) {
    if (!hostname || !domainPattern) return false;
    const pattern = domainPattern.toLowerCase();
    const host = hostname.toLowerCase();
    if (pattern.includes('.')) {
        return host === pattern || host.endsWith(`.${pattern}`);
    }
    // Match domain labels for keyword patterns without dots (e.g. 'flixbaba')
    const labels = host.split('.');
    return labels.includes(pattern);
}

function isDomainMatched(url, patterns) {
    const hostname = getHostname(url);
    if (!hostname) return false;
    return patterns.some((p) => hostnameMatches(hostname, p));
}

// Format remaining milliseconds to 4-character M:SS badge string
function formatBadgeTime(remainingMs) {
    if (remainingMs <= 0) return '0:00';
    const totalSec = Math.ceil(remainingMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Dynamic badge background color based on remaining time
function getBadgeColor(remainingMs) {
    if (remainingMs <= 0) return '#7f1d1d'; // Deep red / expired
    if (remainingMs <= 60000) return '#dc2626'; // Red (< 1 min)
    if (remainingMs <= 120000) return '#d97706'; // Amber (< 2 min)
    return '#0284c7'; // Ice Blue / Cyan (> 2 min)
}

// Update the extension toolbar action badge text, colors, and tooltip
async function updateBadgeUI() {
    if (!chrome.action) return;

    if (!isBlockingActive()) {
        try {
            await chrome.action.setBadgeText({ text: '' });
            await chrome.action.setTitle({ title: 'F.R.O.S.T. - Focus period ended' });
        } catch {}
        return;
    }

    const today = getLocalDateString();
    const now = Date.now();

    const data = await chrome.storage.local.get([
        'last_reset_date',
        'today_usage',
        'session_start_time',
        'show_badge'
    ]);

    let usage = (data.last_reset_date === today) ? (data.today_usage || 0) : 0;
    if (typeof usage !== 'number' || isNaN(usage) || usage < 0) {
        usage = 0;
    }

    const isTrackingActive = Boolean(
        data.last_reset_date === today &&
        data.session_start_time &&
        typeof data.session_start_time === 'number'
    );
    if (isTrackingActive) {
        const elapsed = Math.max(0, now - data.session_start_time);
        usage += Math.min(elapsed, 120000);
    }

    const remainingMs = Math.max(0, TIMER_LIMIT_MS - usage);
    const isExpired = remainingMs <= 0;
    const isBadgeEnabled = (data.show_badge !== undefined) ? Boolean(data.show_badge) : true;

    const badgeText = formatBadgeTime(remainingMs);
    const badgeColor = getBadgeColor(remainingMs);

    // Show badge text if user clicked to enable it, if actively on a tracked site, or if expired
    if (isExpired || isTrackingActive || isBadgeEnabled) {
        try {
            await chrome.action.setBadgeText({ text: badgeText });
            await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
            if (chrome.action.setBadgeTextColor) {
                await chrome.action.setBadgeTextColor({ color: '#ffffff' });
            }
        } catch {}
    } else {
        try {
            await chrome.action.setBadgeText({ text: '' });
        } catch {}
    }

    // Set informative tooltip
    const totalSec = Math.ceil(remainingMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    let title;
    if (isExpired) {
        title = 'F.R.O.S.T.: Daily allowance exhausted (0:00 remaining)';
    } else if (isTrackingActive) {
        title = `F.R.O.S.T.: ${m}m ${s}s remaining (Active countdown)`;
    } else {
        title = `F.R.O.S.T.: ${m}m ${s}s remaining of ${ALLOWANCE_MINUTES}m quota (Paused)`;
    }

    try {
        await chrome.action.setTitle({ title });
    } catch {}

    // If quota expired while actively tracking, trigger immediate closure
    if (isExpired && isTrackingActive) {
        requestSync();
    }
}

// Close a tab automatically; if it is the only tab in the window, redirect to avoid closing the entire browser
async function closeOrRedirectTab(tabId) {
    try {
        const allTabs = await chrome.tabs.query({});
        if (allTabs.length > 1) {
            await chrome.tabs.remove(tabId);
        } else {
            await chrome.tabs.update(tabId, { url: getRedirectTarget() });
        }
    } catch {
        // Tab may have already closed or navigated
    }
}

// Redirect tab explicitly (used for hard blocks and anti-tamper)
async function redirectTab(tabId) {
    try {
        await chrome.tabs.update(tabId, { url: getRedirectTarget() });
    } catch {
        // Tab may have closed or navigated already
    }
}

// Close all open tabs that match tracked domains once timer expires
async function closeAllTrackedTabs() {
    try {
        const tabs = await chrome.tabs.query({});
        const trackedTabs = tabs.filter((t) => {
            const url = t.url || t.pendingUrl;
            return url && isDomainMatched(url, BLOCKED_DOMAINS);
        });

        for (const tab of trackedTabs) {
            await closeOrRedirectTab(tab.id);
        }
    } catch (err) {
        console.error('Error closing tracked tabs:', err);
    }
}

// Helper to check if Incognito access is allowed for this extension
function checkIncognitoAccess() {
    return new Promise((resolve) => {
        try {
            if (typeof chrome !== 'undefined' && chrome.extension && typeof chrome.extension.isAllowedIncognitoAccess === 'function') {
                chrome.extension.isAllowedIncognitoAccess((isAllowed) => {
                    resolve(Boolean(isAllowed));
                });
            } else {
                resolve(true); // Default to true in non-extension or test mock environments
            }
        } catch {
            resolve(true);
        }
    });
}

// Purge incognito windows and tabs immediately
function purgeIncognitoTab(tab) {
    if (!isBlockingActive() || !tab) return false;
    if (tab.incognito && tab.id) {
        try {
            chrome.tabs.remove(tab.id);
        } catch {}
        return true;
    }
    return false;
}

// Purge all existing incognito windows across the browser
async function purgeAllIncognito() {
    if (!isBlockingActive()) return;
    try {
        if (chrome.windows && chrome.windows.getAll) {
            const wins = await chrome.windows.getAll({ populate: false });
            for (const win of wins) {
                if (win.incognito && win.id) {
                    try {
                        await chrome.windows.remove(win.id);
                    } catch {}
                }
            }
        }
    } catch {}
}

if (chrome.tabs && chrome.tabs.onCreated) {
    chrome.tabs.onCreated.addListener((tab) => {
        purgeIncognitoTab(tab);
    });
}

if (chrome.tabs && chrome.tabs.onActivated) {
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        try {
            if (chrome.tabs && chrome.tabs.get) {
                const tab = await chrome.tabs.get(activeInfo.tabId);
                purgeIncognitoTab(tab);
            }
        } catch {}
    });
}

if (chrome.windows && chrome.windows.onCreated) {
    chrome.windows.onCreated.addListener((win) => {
        if (isBlockingActive() && win.incognito && win.id) {
            try {
                chrome.windows.remove(win.id);
            } catch {}
        }
    });
}

if (chrome.windows && chrome.windows.onFocusChanged) {
    chrome.windows.onFocusChanged.addListener(async (windowId) => {
        if (!isBlockingActive() || !windowId || windowId === chrome.windows.WINDOW_ID_NONE) return;
        try {
            if (chrome.windows && chrome.windows.get) {
                const win = await chrome.windows.get(windowId);
                if (win && win.incognito && win.id) {
                    chrome.windows.remove(win.id);
                }
            }
        } catch {}
    });
}

// Purge any incognito windows on initialization
purgeAllIncognito();

// Find any currently active tab across browser windows matching tracked domains
async function findActiveTrackedTab() {
    try {
        if (chrome.windows && chrome.windows.getLastFocused) {
            const lastWin = await chrome.windows.getLastFocused({ populate: true });
            if (lastWin && lastWin.state !== 'minimized' && Array.isArray(lastWin.tabs)) {
                const activeTab = lastWin.tabs.find((t) => t.active);
                if (activeTab) {
                    const url = activeTab.url || activeTab.pendingUrl;
                    if (url && isDomainMatched(url, BLOCKED_DOMAINS)) {
                        return activeTab;
                    }
                }
                return null;
            }
        }

        const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (activeTabs && activeTabs.length > 0) {
            const tab = activeTabs[0];
            const url = tab.url || tab.pendingUrl;
            if (url && isDomainMatched(url, BLOCKED_DOMAINS)) {
                return tab;
            }
        }
        return null;
    } catch (err) {
        console.error('Error finding active tracked tab:', err);
        return null;
    }
}

// Anti-tamper: Block extensions page by closing the tab (or redirect fallback)
const blockExtensions = async (details) => {
    if (!isBlockingActive() || !details) return;
    const url = details.url || details.pendingUrl;
    if (url && (url.startsWith('chrome://extensions') || url.startsWith('chrome://settings/extensions'))) {
        const isAllowedIncognito = await checkIncognitoAccess();
        // If Incognito permission is NOT yet granted, allow user to open extension details page to toggle it
        if (!isAllowedIncognito) {
            const extId = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ? chrome.runtime.id : '';
            if (extId && (url.includes(extId) || url === 'chrome://extensions' || url === 'chrome://extensions/')) {
                return;
            }
        }

        const tabId = details.tabId || details.id;
        if (tabId) {
            try {
                await chrome.tabs.remove(tabId);
            } catch {
                await redirectTab(tabId);
            }
        }
    }
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo.url || tab.pendingUrl || tab.url;
    blockExtensions({ url, tabId });
});
chrome.webNavigation.onBeforeNavigate.addListener((details) => blockExtensions({ url: details.url, tabId: details.tabId }));
chrome.webNavigation.onCommitted.addListener((details) => blockExtensions({ url: details.url, tabId: details.tabId }));

// Helper to check if today's allowance is already exhausted (including in-flight active session)
async function isAllowanceExhausted() {
    const today = getLocalDateString();
    const data = await chrome.storage.local.get(['last_reset_date', 'today_usage', 'session_start_time']);
    if (data.last_reset_date !== today) return false;
    let usage = (typeof data.today_usage === 'number' && !isNaN(data.today_usage) && data.today_usage > 0)
        ? data.today_usage
        : 0;
    if (data.session_start_time && typeof data.session_start_time === 'number') {
        const elapsed = Math.max(0, Date.now() - data.session_start_time);
        usage += Math.min(elapsed, 120000);
    }
    return usage >= TIMER_LIMIT_MS;
}

// Schedule or update expiry alarm without queue thrashing
async function scheduleExpiryAlarm(targetTime) {
    try {
        const now = Date.now();
        if (targetTime <= now) return;
        const existing = await chrome.alarms.get(ALARM_LIMIT_EXPIRY);
        if (!existing || Math.abs(existing.scheduledTime - targetTime) > 5000) {
            await chrome.alarms.create(ALARM_LIMIT_EXPIRY, { when: targetTime });
        }
    } catch (err) {
        console.error('Error scheduling expiry alarm:', err);
    }
}

// Mutex queue to prevent race conditions during async state updates
let syncQueue = Promise.resolve();

function requestSync(closedTabId = null) {
    syncQueue = syncQueue.then(async () => {
        try {
            await syncTrackingState(closedTabId);
        } catch (err) {
            console.error('Error in syncTrackingState:', err);
        }
    });
    return syncQueue;
}

// Core tracking engine: synchronized timestamp-based time tracking
async function syncTrackingState(closedTabId = null) {
    if (!isBlockingActive()) {
        try {
            await chrome.alarms.clear(ALARM_LIMIT_EXPIRY);
        } catch {}
        await updateBadgeUI();
        return;
    }

    const today = getLocalDateString();
    const now = Date.now();

    // Verify whether an active tracked tab currently exists in the focused window
    const currentActiveTab = await findActiveTrackedTab();

    const data = await chrome.storage.local.get([
        'last_reset_date',
        'today_usage',
        'session_start_time',
        'session_tab_id'
    ]);

    let usage = 0;
    if (data.last_reset_date === today) {
        usage = (typeof data.today_usage === 'number' && !isNaN(data.today_usage) && data.today_usage > 0)
            ? data.today_usage
            : 0;

        // Determine if an in-flight session is valid to accumulate.
        // We accumulate elapsed session time if:
        // 1. The tracked tab is currently active in the focused window, OR
        // 2. Window lost focus / tab switched within the same running browser, OR
        // 3. The tracked tab was actively browsed and just closed (matching closedTabId).
        // If the browser restarted (cold start / session restore), session_tab_id will not match
        // any open tracked tab or currentActiveTab, preventing dangling session time inflation.
        let isSessionValid = false;
        if (data.session_start_time && typeof data.session_start_time === 'number' && data.session_tab_id) {
            try {
                const allTabs = await chrome.tabs.query({});
                const sessionTab = allTabs.find((t) => t.id === data.session_tab_id);
                const url = sessionTab && (sessionTab.url || sessionTab.pendingUrl);
                if (url && isDomainMatched(url, BLOCKED_DOMAINS)) {
                    // Legitimate active session: either currently active in the focused window,
                    // OR window lost focus / tab switched within the same running browser
                    if (currentActiveTab && currentActiveTab.id === data.session_tab_id) {
                        isSessionValid = true;
                    } else if (!currentActiveTab) {
                        isSessionValid = true;
                    }
                } else if (closedTabId && data.session_tab_id === closedTabId) {
                    // The tracked tab was actively browsed and just closed!
                    isSessionValid = true;
                }
            } catch {
                isSessionValid = false;
            }
        }

        if (isSessionValid) {
            const rawElapsed = now - data.session_start_time;
            if (rawElapsed > 0) {
                // Cap single-interval elapsed time to realistic boundaries (e.g. 120,000 ms)
                // to prevent suspended/sleeping browser tabs from draining the quota
                usage += Math.min(rawElapsed, 120000);
            }
        }
    } else {
        // Date changed (midnight rollover): reset tracking and clean dangling sessions
        data.session_start_time = null;
        data.session_tab_id = null;
    }

    // If quota reached or exceeded, close all tracked tabs immediately
    if (usage >= TIMER_LIMIT_MS) {
        usage = TIMER_LIMIT_MS;
        await chrome.storage.local.set({
            today_usage: usage,
            last_reset_date: today,
            session_start_time: null,
            session_tab_id: null
        });
        try {
            await chrome.alarms.clear(ALARM_LIMIT_EXPIRY);
        } catch {}
        await closeAllTrackedTabs();
        await updateBadgeUI();
        return;
    }

    if (currentActiveTab) {
        const remainingMs = TIMER_LIMIT_MS - usage;
        if (remainingMs <= 0) {
            await chrome.storage.local.set({
                today_usage: TIMER_LIMIT_MS,
                last_reset_date: today,
                session_start_time: null,
                session_tab_id: null
            });
            try {
                await chrome.alarms.clear(ALARM_LIMIT_EXPIRY);
            } catch {}
            await closeAllTrackedTabs();
        } else {
            // Track active session starting from now
            await chrome.storage.local.set({
                today_usage: usage,
                last_reset_date: today,
                session_start_time: now,
                session_tab_id: currentActiveTab.id
            });
            // Ensure exact alarm is scheduled for when remaining quota expires
            await scheduleExpiryAlarm(now + remainingMs);
        }
    } else {
        // Not actively on a tracked tab: persist accumulated usage and cleanly end session
        await chrome.storage.local.set({
            today_usage: usage,
            last_reset_date: today,
            session_start_time: null,
            session_tab_id: null
        });
        try {
            await chrome.alarms.clear(ALARM_LIMIT_EXPIRY);
        } catch {}
    }

    await updateBadgeUI();
}

// Note: In Chrome Manifest V3, when "action.default_popup" is specified in manifest.json,
// chrome.action.onClicked does not fire because clicking the action icon opens the popup.
// Badge display preferences and status controls are managed via the Focus Dashboard popup.

// Main blocking logic on tab navigation/updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!isBlockingActive()) return;
    if (purgeIncognitoTab(tab)) return;

    const url = changeInfo.url || tab.pendingUrl || tab.url;
    if (!url) return;

    // Block YouTube Shorts (Always Immediate)
    if (url.toLowerCase().includes('youtube.com/shorts/')) {
        redirectTab(tabId);
        return;
    }

    // Hard-blocked domains (Always Immediate)
    if (isDomainMatched(url, HARD_BLOCKED_DOMAINS)) {
        redirectTab(tabId);
        return;
    }

    // Tracked domains: close tab immediately if allowance exhausted
    if (isDomainMatched(url, BLOCKED_DOMAINS)) {
        const exhausted = await isAllowanceExhausted();
        if (exhausted) {
            await closeOrRedirectTab(tabId);
            return;
        }
    }

    requestSync();
});

// Early navigation interceptor
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (!isBlockingActive()) return;
    if (details.frameId !== 0) return;

    const url = details.url;
    if (!url) return;

    // Block YouTube Shorts (Always Immediate)
    if (url.toLowerCase().includes('youtube.com/shorts/')) {
        redirectTab(details.tabId);
        return;
    }

    if (isDomainMatched(url, HARD_BLOCKED_DOMAINS)) {
        redirectTab(details.tabId);
        return;
    }

    if (isDomainMatched(url, BLOCKED_DOMAINS)) {
        const exhausted = await isAllowanceExhausted();
        if (exhausted) {
            await closeOrRedirectTab(details.tabId);
        }
    }
});

// Tab switched
chrome.tabs.onActivated.addListener(() => {
    requestSync();
});

// Tab closed
chrome.tabs.onRemoved.addListener((tabId) => {
    requestSync(tabId);
});

// Window focus changed: pause timer if focus leaves Chrome or switches away from tracked tab
if (chrome.windows && chrome.windows.onFocusChanged) {
    chrome.windows.onFocusChanged.addListener(() => {
        requestSync();
    });
}

// Alarm triggers (expiry or periodic heartbeat)
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_LIMIT_EXPIRY || alarm.name === ALARM_HEARTBEAT) {
        requestSync();
    }
});

// Listen for messages from content scripts and popup dashboard
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.action) return false;

    // Content script redirect command (YouTube non-educational or Shorts)
    if (request.action === 'redirect' && sender.tab) {
        if (isBlockingActive()) {
            redirectTab(sender.tab.id);
        }
        return false;
    }

    // Focus Dashboard Popup state query and synchronization API
    if (request.action === 'GET_STATE' || request.action === 'get_status' || request.action === 'REQUEST_SYNC') {
        (async () => {
            try {
                await requestSync();
                const today = getLocalDateString();
                const data = await chrome.storage.local.get([
                    'last_reset_date',
                    'today_usage',
                    'session_start_time',
                    'show_badge'
                ]);
                let usage = (data.last_reset_date === today) ? (data.today_usage || 0) : 0;
                if (typeof usage !== 'number' || isNaN(usage) || usage < 0) {
                    usage = 0;
                }
                const isTracking = Boolean(
                    data.last_reset_date === today &&
                    data.session_start_time &&
                    typeof data.session_start_time === 'number'
                );
                if (isTracking) {
                    const elapsed = Math.max(0, Date.now() - data.session_start_time);
                    usage += Math.min(elapsed, 120000);
                }
                const remainingMs = Math.max(0, TIMER_LIMIT_MS - usage);
                const isExpired = remainingMs <= 0;
                const showBadge = (data.show_badge !== undefined) ? Boolean(data.show_badge) : true;
                const isAllowedIncognito = await checkIncognitoAccess();

                sendResponse({
                    remainingMs,
                    todayUsage: usage,
                    timerLimitMs: TIMER_LIMIT_MS,
                    isTrackingActive: isTracking,
                    isExpired,
                    isBlockingActive: isBlockingActive(),
                    showBadge,
                    isAllowedIncognito
                });
            } catch (err) {
                console.error('Error handling GET_STATE:', err);
                sendResponse({
                    remainingMs: 0,
                    todayUsage: TIMER_LIMIT_MS,
                    timerLimitMs: TIMER_LIMIT_MS,
                    isTrackingActive: false,
                    isExpired: true,
                    isBlockingActive: isBlockingActive(),
                    showBadge: true,
                    isAllowedIncognito: true
                });
            }
        })();
        return true; // Keep message channel open for async response
    }

    return false;
});

// Live second-by-second countdown ticker while service worker is active
setInterval(() => {
    updateBadgeUI();
}, 1000);

// In-memory sync ticker while background service worker is awake
setInterval(() => {
    requestSync();
}, 5000);

// Initialize periodic heartbeat alarm safely without wiping pending alarms
async function ensureHeartbeatAlarm() {
    try {
        if (!chrome.alarms) return;
        const alarm = await chrome.alarms.get(ALARM_HEARTBEAT);
        if (!alarm) {
            await chrome.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: 1 });
        }
    } catch (err) {
        console.error('Error ensuring heartbeat alarm:', err);
    }
}

// Lifecycle listeners
chrome.runtime.onInstalled.addListener(async () => {
    try {
        const data = await chrome.storage.local.get(['show_badge']);
        if (data.show_badge === undefined) {
            await chrome.storage.local.set({ show_badge: true });
        }
    } catch {}
    await purgeAllIncognito();
    await ensureHeartbeatAlarm();
    await requestSync();

    // Check if Incognito access is allowed; if not, open extension details so user can easily enable it
    try {
        const isAllowed = await checkIncognitoAccess();
        if (!isAllowed && chrome.tabs && chrome.tabs.create && chrome.runtime && chrome.runtime.id) {
            chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
        }
    } catch {}
});

chrome.runtime.onStartup.addListener(async () => {
    try {
        await chrome.storage.local.set({
            session_start_time: null,
            session_tab_id: null
        });
    } catch {}
    await purgeAllIncognito();
    await ensureHeartbeatAlarm();
    await requestSync();
});

// Bootstrap
purgeAllIncognito();
ensureHeartbeatAlarm();
requestSync();
