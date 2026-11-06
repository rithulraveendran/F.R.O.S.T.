import { UNLOCK_DATE, REDIRECT_TARGET, BLOCKED_DOMAINS, HARD_BLOCKED_DOMAINS } from './constants.js';

const TIMER_LIMIT_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_REDIRECT_FALLBACK = 'https://i.pinimg.com/736x/6e/59/0b/6e590bb22b1fc1b447c8ff6a7f7902aa.jpg';

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

// Anti-tamper: Block extensions page (Multiple listeners for maximum reliability)
const blockExtensions = (details) => {
    if (!isBlockingActive()) return;
    const url = details.url || details.pendingUrl;
    if (url && (url.startsWith('chrome://extensions') || url.startsWith('chrome://settings/extensions'))) {
        const tabId = details.tabId || details.id;
        chrome.tabs.update(tabId, { url: getRedirectTarget() });
    }
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => blockExtensions(tab));
chrome.webNavigation.onBeforeNavigate.addListener((details) => blockExtensions(details));
chrome.webNavigation.onCommitted.addListener((details) => blockExtensions(details));

// Main blocking logic
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (!isBlockingActive()) return;
    if (!tab.url) return;

    const url = tab.url;

    // Block YouTube Shorts (Always Immediate)
    if (url.toLowerCase().includes('youtube.com/shorts/')) {
        chrome.tabs.update(tabId, { url: getRedirectTarget() });
        return;
    }

    // Hard-blocked domains (Always Immediate)
    if (isDomainMatched(url, HARD_BLOCKED_DOMAINS)) {
        chrome.tabs.update(tabId, { url: getRedirectTarget() });
        return;
    }

    // Tracked domains (Only redirect if 15-min timer is up)
    const isTracked = isDomainMatched(url, BLOCKED_DOMAINS);
    if (isTracked) {
        const today = new Date().toISOString().split('T')[0];
        const data = await chrome.storage.local.get(['last_reset_date', 'today_usage']);
        
        if (data.last_reset_date === today && (data.today_usage || 0) >= TIMER_LIMIT_MS) {
            chrome.tabs.update(tabId, { url: getRedirectTarget() });
        }
    }
});

// Timer Logic
async function updateTimer(incrementMs) {
    if (!isBlockingActive()) return;

    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs.length === 0) return;

    const activeTab = tabs[0];
    if (!activeTab.url) return;

    const url = activeTab.url;

    // Check if the current site is one we want to track (only the Blocked Domains)
    const isTracked = isDomainMatched(url, BLOCKED_DOMAINS);

    if (isTracked) {
        const today = new Date().toISOString().split('T')[0];
        const data = await chrome.storage.local.get(['last_reset_date', 'today_usage']);
        
        let usage = data.today_usage || 0;
        if (data.last_reset_date !== today) {
            usage = 0;
        }

        usage += incrementMs;

        await chrome.storage.local.set({
            today_usage: usage,
            last_reset_date: today
        });

        if (usage >= TIMER_LIMIT_MS) {
            chrome.tabs.update(activeTab.id, { url: getRedirectTarget() });
        }
    }
}

// Set up alarm for periodic background check (1 minute)
chrome.alarms.create('timerAlarm', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'timerAlarm') {
        updateTimer(60000);
    }
});

// Also use setInterval for more frequent updates while service worker is active (10 seconds)
setInterval(() => updateTimer(10000), 10000);

// Listen for messages from content script (YouTube validation)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!isBlockingActive()) return;

    if (request.action === 'redirect' && sender.tab) {
        chrome.tabs.update(sender.tab.id, { url: getRedirectTarget() });
    }
});
