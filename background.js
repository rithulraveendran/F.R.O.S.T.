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
const DEFAULT_REDIRECT_FALLBACK = 'https://i.pinimg.com/736x/6e/59/0b/6e590bb22b1fc1b447c8ff6a7f7902aa.jpg';

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
    return hostname === pattern || hostname.endsWith(`.${pattern}`);
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

    const isTrackingActive = Boolean(data.session_start_time && typeof data.session_start_time === 'number');
    if (isTrackingActive) {
        const elapsed = Math.max(0, now - data.session_start_time);
        usage += elapsed;
    }

    const remainingMs = Math.max(0, TIMER_LIMIT_MS - usage);
    const isExpired = remainingMs <= 0;
    const isBadgeEnabled = Boolean(data.show_badge);

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
        title = `F.R.O.S.T.: ${m}m ${s}s remaining (Active countdown) - Click to toggle`;
    } else {
        title = `F.R.O.S.T.: ${m}m ${s}s remaining of ${ALLOWANCE_MINUTES}m quota (Paused) - Click to toggle`;
    }

    try {
        await chrome.action.setTitle({ title });
    } catch {}

    // If quota expired while actively tracking, trigger immediate sync and redirect
    if (isExpired && isTrackingActive) {
        requestSync();
    }
}

// Safe tab redirect helper
async function redirectTab(tabId) {
    try {
        await chrome.tabs.update(tabId, { url: getRedirectTarget() });
    } catch {
        // Tab may have closed or navigated already
    }
}

// Redirect all open tabs that match tracked domains once timer expires
async function redirectAllTrackedTabs() {
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            const url = tab.url || tab.pendingUrl;
            if (url && isDomainMatched(url, BLOCKED_DOMAINS)) {
                await redirectTab(tab.id);
            }
        }
    } catch (err) {
        console.error('Error redirecting tracked tabs:', err);
    }
}

// Anti-tamper: Block extensions page
const blockExtensions = (details) => {
    if (!isBlockingActive()) return;
    const url = details.url || details.pendingUrl;
    if (url && (url.startsWith('chrome://extensions') || url.startsWith('chrome://settings/extensions'))) {
        const tabId = details.tabId || details.id;
        if (tabId) {
            redirectTab(tabId);
        }
    }
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => blockExtensions(tab));
chrome.webNavigation.onBeforeNavigate.addListener((details) => blockExtensions(details));
chrome.webNavigation.onCommitted.addListener((details) => blockExtensions(details));

// Helper to check if today's allowance is already exhausted
async function isAllowanceExhausted() {
    const today = getLocalDateString();
    const data = await chrome.storage.local.get(['last_reset_date', 'today_usage']);
    if (data.last_reset_date !== today) return false;
    const usage = data.today_usage || 0;
    return usage >= TIMER_LIMIT_MS;
}

// Mutex queue to prevent race conditions during async state updates
let syncQueue = Promise.resolve();

function requestSync() {
    syncQueue = syncQueue.then(async () => {
        try {
            await syncTrackingState();
        } catch (err) {
            console.error('Error in syncTrackingState:', err);
        }
    });
    return syncQueue;
}

// Core tracking engine: synchronized timestamp-based time tracking
async function syncTrackingState() {
    if (!isBlockingActive()) {
        try {
            await chrome.alarms.clear(ALARM_LIMIT_EXPIRY);
        } catch {}
        await updateBadgeUI();
        return;
    }

    const today = getLocalDateString();
    const now = Date.now();

    const data = await chrome.storage.local.get([
        'last_reset_date',
        'today_usage',
        'session_start_time',
        'session_tab_id'
    ]);

    let usage = (data.last_reset_date === today) ? (data.today_usage || 0) : 0;
    if (typeof usage !== 'number' || isNaN(usage) || usage < 0) {
        usage = 0;
    }

    // Accumulate elapsed time if an active tracking session was open
    if (data.session_start_time && typeof data.session_start_time === 'number') {
        const elapsed = Math.max(0, now - data.session_start_time);
        usage += elapsed;
    }

    // If quota reached or exceeded, redirect all tracked tabs immediately
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
        await redirectAllTrackedTabs();
        await updateBadgeUI();
        return;
    }

    // Determine if the user is actively viewing a tracked domain right now
    let isTrackedActive = false;
    let currentActiveTab = null;

    try {
        const lastWin = await chrome.windows.getLastFocused({ populate: true });
        if (lastWin && lastWin.focused && Array.isArray(lastWin.tabs)) {
            const activeTab = lastWin.tabs.find((t) => t.active);
            if (activeTab) {
                const url = activeTab.url || activeTab.pendingUrl;
                if (url && isDomainMatched(url, BLOCKED_DOMAINS)) {
                    isTrackedActive = true;
                    currentActiveTab = activeTab;
                }
            }
        }
    } catch (err) {
        console.error('Error checking active focused tab:', err);
    }

    if (isTrackedActive && currentActiveTab) {
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
            await redirectAllTrackedTabs();
        } else {
            // Track active session starting from now
            await chrome.storage.local.set({
                today_usage: usage,
                last_reset_date: today,
                session_start_time: now,
                session_tab_id: currentActiveTab.id
            });
            // Schedule exact alarm for when the remaining quota expires
            await chrome.alarms.create(ALARM_LIMIT_EXPIRY, { when: now + remainingMs });
        }
    } else {
        // Not actively viewing a tracked domain: persist accumulated usage and end session
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

// Extension action click: toggle badge countdown display
if (chrome.action && chrome.action.onClicked) {
    chrome.action.onClicked.addListener(async () => {
        const data = await chrome.storage.local.get(['show_badge']);
        const nextState = !Boolean(data.show_badge);
        await chrome.storage.local.set({ show_badge: nextState });
        await updateBadgeUI();
    });
}

// Main blocking logic on tab navigation/updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!isBlockingActive()) return;

    const url = tab.url || tab.pendingUrl || changeInfo.url;
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

    // Tracked domains (Redirect immediately if allowance exhausted)
    if (isDomainMatched(url, BLOCKED_DOMAINS)) {
        const exhausted = await isAllowanceExhausted();
        if (exhausted) {
            redirectTab(tabId);
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
            redirectTab(details.tabId);
        }
    }
});

// Tab switched
chrome.tabs.onActivated.addListener(() => {
    requestSync();
});

// Tab closed
chrome.tabs.onRemoved.addListener(() => {
    requestSync();
});

// Window focus changed (Chrome focused/unfocused or switched windows)
chrome.windows.onFocusChanged.addListener(() => {
    requestSync();
});

// Alarm triggers (expiry or periodic heartbeat)
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM_LIMIT_EXPIRY || alarm.name === ALARM_HEARTBEAT) {
        requestSync();
    }
});

// Listen for messages from content script (YouTube validation)
chrome.runtime.onMessage.addListener((request, sender) => {
    if (!isBlockingActive()) return;

    if (request.action === 'redirect' && sender.tab) {
        redirectTab(sender.tab.id);
    }
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
function ensureHeartbeatAlarm() {
    chrome.alarms.get(ALARM_HEARTBEAT, (alarm) => {
        if (!alarm) {
            chrome.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: 1 });
        }
    });
}

// Lifecycle listeners
chrome.runtime.onInstalled.addListener(() => {
    ensureHeartbeatAlarm();
    requestSync();
});

chrome.runtime.onStartup.addListener(async () => {
    try {
        await chrome.storage.local.set({
            session_start_time: null,
            session_tab_id: null
        });
    } catch {}
    ensureHeartbeatAlarm();
    requestSync();
});

// Bootstrap
ensureHeartbeatAlarm();
requestSync();
