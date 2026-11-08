/**
 * ==============================================================================
 * F.R.O.S.T. Focus Dashboard - Controller & Synchronization Engine
 * ==============================================================================
 */

import {
    UNLOCK_DATE,
    DAILY_ALLOWANCE_MINUTES,
    BLOCKED_DOMAINS,
    HARD_BLOCKED_DOMAINS
} from './constants.js';

// Quota configuration
export const TIMER_LIMIT_MS = (typeof DAILY_ALLOWANCE_MINUTES === 'number' && DAILY_ALLOWANCE_MINUTES > 0
    ? DAILY_ALLOWANCE_MINUTES
    : 5) * 60 * 1000;

// SVG Ring geometry (radius = 70)
export const CIRCUMFERENCE = 2 * Math.PI * 70; // ~439.82297

// Helper to check if the blocking date has passed
export function isBlockingActive(now = new Date()) {
    return now < UNLOCK_DATE;
}

// Format local date string (YYYY-MM-DD) for accurate daily resets
export function getLocalDateString(date = new Date()) {
    return date.toLocaleDateString('en-CA');
}

// URL & Hostname parsing helpers
export function getHostname(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
}

export function hostnameMatches(hostname, domainPattern) {
    if (!hostname || !domainPattern) return false;
    const pattern = domainPattern.toLowerCase();
    const host = hostname.toLowerCase();
    if (pattern.includes('.')) {
        return host === pattern || host.endsWith(`.${pattern}`);
    }
    const labels = host.split('.');
    return labels.includes(pattern);
}

export function isDomainMatched(url, patterns) {
    const hostname = getHostname(url);
    if (!hostname) return false;
    return patterns.some((p) => hostnameMatches(hostname, p));
}

// Format milliseconds to M:SS (matches background badge exactly)
export function formatTimerDisplay(remainingMs) {
    if (remainingMs <= 0) return '0:00';
    const totalSec = Math.ceil(remainingMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Format human-readable usage summary
export function formatUsageSummary(todayUsage, timerLimitMs = TIMER_LIMIT_MS) {
    const safeUsage = Math.max(0, Math.min(timerLimitMs, todayUsage || 0));
    const usedSec = Math.floor(safeUsage / 1000);
    const usedM = Math.floor(usedSec / 60);
    const usedS = usedSec % 60;
    const limitM = Math.round(timerLimitMs / 60000);
    return `Used ${usedM}m ${usedS < 10 ? '0' : ''}${usedS}s of ${limitM}m 00s quota`;
}

// Calculate days remaining until UNLOCK_DATE
export function getDaysUntilUnlock(now = new Date(), unlockDate = UNLOCK_DATE) {
    if (now >= unlockDate) return 0;
    const diff = unlockDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Calculate hours and minutes remaining until next midnight
export function getTimeUntilMidnight(now = new Date()) {
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const diffMs = Math.max(0, nextMidnight.getTime() - now.getTime());
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return { diffHours, diffMins };
}

// Format unlock date string (e.g. "Jan 05, 2027")
export function formatUnlockDate(date = UNLOCK_DATE) {
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

// Categorize active tab context
export function categorizeTabUrl(url, now = new Date()) {
    if (!isBlockingActive(now)) {
        return {
            category: 'standdown',
            icon: '⚪',
            domain: getHostname(url) || 'Browser',
            description: 'Standdown (Restrictions Inactive)'
        };
    }

    if (!url || url.startsWith('chrome://') || url.startsWith('about:')) {
        if (url && (url.startsWith('chrome://extensions') || url.includes('extensions'))) {
            return {
                category: 'hardblocked',
                icon: '⛔',
                domain: 'chrome://extensions',
                description: 'Zero Allowance Hub (Anti-Tamper Locked)'
            };
        }
        return {
            category: 'productive',
            icon: '🛡️',
            domain: 'Browser System',
            description: 'Productive Focus Mode (Allowance Paused)'
        };
    }

    const host = getHostname(url);

    // Hard blocked domains
    if (isDomainMatched(url, HARD_BLOCKED_DOMAINS)) {
        return {
            category: 'hardblocked',
            icon: '⛔',
            domain: host || 'Restricted Hub',
            description: 'Zero Allowance Hub (Instant Redirect)'
        };
    }

    // YouTube STEM academic filter / Shorts
    if (host.includes('youtube.com')) {
        if (url.includes('/shorts/')) {
            return {
                category: 'hardblocked',
                icon: '⛔',
                domain: 'youtube.com/shorts',
                description: 'Distraction Trap (Instant Block)'
            };
        }
        return {
            category: 'youtube',
            icon: '🎓',
            domain: 'youtube.com',
            description: 'YouTube STEM Academic Filter Active'
        };
    }

    // Tracked distraction perimeter
    if (isDomainMatched(url, BLOCKED_DOMAINS)) {
        return {
            category: 'tracked',
            icon: '⚡',
            domain: host,
            description: 'Active Distraction (Quota Consuming)'
        };
    }

    // Productive / focus browsing
    return {
        category: 'productive',
        icon: '🛡️',
        domain: host || 'Productive Workspace',
        description: 'Productive Focus Mode (Allowance Paused)'
    };
}

// Dashboard reactive controller state
let state = {
    todayUsage: 0,
    baseUsage: 0,
    remainingMs: TIMER_LIMIT_MS,
    timerLimitMs: TIMER_LIMIT_MS,
    isTrackingActive: false,
    isExpired: false,
    isBlockingActive: isBlockingActive(),
    sessionStartTime: null,
    lastResetDate: getLocalDateString(),
    showBadge: true,
    isAllowedIncognito: true
};

// UI Elements cache
let elements = {};

function initElements() {
    elements = {
        statusPill: document.getElementById('status-pill'),
        statusText: document.getElementById('status-text'),
        progressCircle: document.getElementById('progress-circle'),
        timerDisplay: document.getElementById('timer-display'),
        usageSummary: document.getElementById('usage-summary'),
        contextBanner: document.getElementById('context-banner'),
        contextIcon: document.getElementById('context-icon'),
        contextDomain: document.getElementById('context-domain'),
        contextDesc: document.getElementById('context-desc'),
        unlockDateDisplay: document.getElementById('unlock-date-display'),
        unlockCountdown: document.getElementById('unlock-countdown'),
        resetTimeDisplay: document.getElementById('reset-time-display'),
        resetCountdown: document.getElementById('reset-countdown'),
        perimeterCount: document.getElementById('perimeter-count'),
        perimeterSub: document.getElementById('perimeter-sub'),
        antiTamperVal: document.getElementById('anti-tamper-val'),
        antiTamperSub: document.getElementById('anti-tamper-sub'),
        incognitoAlert: document.getElementById('incognito-alert'),
        enableIncognitoBtn: document.getElementById('enable-incognito-btn'),
        badgeToggle: document.getElementById('badge-toggle'),
        syncBtn: document.getElementById('sync-btn')
    };
}

// Render routine
export function renderUI() {
    if (!elements.timerDisplay) return;

    // 1. Hero Circular Gauge Card
    const remaining = Math.max(0, state.remainingMs);
    elements.timerDisplay.textContent = formatTimerDisplay(remaining);
    elements.usageSummary.textContent = formatUsageSummary(state.todayUsage, state.timerLimitMs);

    // Dynamic stroke offset calculation
    const ratio = Math.max(0, Math.min(1, remaining / state.timerLimitMs));
    const offset = CIRCUMFERENCE * (1 - ratio);
    elements.progressCircle.style.strokeDashoffset = offset.toFixed(2);

    // Dynamic stroke color transitions
    if (!state.isBlockingActive) {
        elements.progressCircle.style.stroke = '#94a3b8'; // Slate muted
    } else if (remaining <= 0 || state.isExpired) {
        elements.progressCircle.style.stroke = '#ef4444'; // Crimson (<0m)
    } else if (remaining <= 60000) {
        elements.progressCircle.style.stroke = '#ef4444'; // Crimson (<1m)
    } else if (remaining <= 120000) {
        elements.progressCircle.style.stroke = '#f59e0b'; // Amber (1-2m)
    } else {
        elements.progressCircle.style.stroke = '#38bdf8'; // Frost cyan (>2m)
    }

    // 2. Status Pill
    if (!state.isBlockingActive) {
        elements.statusPill.className = 'status-pill status-standdown';
        elements.statusText.textContent = 'STANDDOWN';
    } else if (remaining <= 0 || state.isExpired) {
        elements.statusPill.className = 'status-pill status-exhausted';
        elements.statusText.textContent = 'EXHAUSTED';
    } else if (state.isTrackingActive) {
        elements.statusPill.className = 'status-pill status-active';
        elements.statusText.textContent = 'ACTIVE COUNTDOWN';
    } else {
        elements.statusPill.className = 'status-pill status-monitoring';
        elements.statusText.textContent = 'MONITORING';
    }

    // 3. 2x2 Surveillance Metrics Grid
    elements.unlockDateDisplay.textContent = formatUnlockDate(UNLOCK_DATE);
    const daysLeft = getDaysUntilUnlock(new Date(), UNLOCK_DATE);
    elements.unlockCountdown.textContent = daysLeft > 0 ? `${daysLeft} days left` : 'Unlocked';

    elements.resetTimeDisplay.textContent = 'Midnight';
    const { diffHours, diffMins } = getTimeUntilMidnight(new Date());
    elements.resetCountdown.textContent = `in ${diffHours}h ${diffMins}m`;

    elements.perimeterCount.textContent = `${BLOCKED_DOMAINS.length} Domains`;
    const quotaMinutes = Math.round(state.timerLimitMs / 60000);
    elements.perimeterSub.textContent = `Shared ${quotaMinutes}m budget`;

    if (state.isBlockingActive) {
        if (state.isAllowedIncognito === false) {
            if (elements.incognitoAlert) elements.incognitoAlert.style.display = 'flex';
            elements.antiTamperVal.textContent = 'ACTION REQ.';
            elements.antiTamperVal.className = 'metric-val text-warning';
            elements.antiTamperSub.textContent = 'Enable in Incognito';
        } else {
            if (elements.incognitoAlert) elements.incognitoAlert.style.display = 'none';
            elements.antiTamperVal.textContent = 'ENFORCED';
            elements.antiTamperVal.className = 'metric-val text-success';
            elements.antiTamperSub.textContent = 'Incognito Blocked';
        }
    } else {
        if (elements.incognitoAlert) elements.incognitoAlert.style.display = 'none';
        elements.antiTamperVal.textContent = 'STANDDOWN';
        elements.antiTamperVal.className = 'metric-val';
        elements.antiTamperSub.textContent = 'Restrictions Lifted';
    }

    // 4. Controls: Badge Toggle
    if (elements.badgeToggle) {
        elements.badgeToggle.checked = Boolean(state.showBadge);
    }
}

// Update Active Tab Context Surveillance Banner
export async function updateActiveTabContext() {
    if (!elements.contextBanner) return;

    try {
        if (!chrome.tabs || !chrome.tabs.query) {
            applyContext({
                category: 'productive',
                icon: '🛡️',
                domain: 'Active Tab',
                description: 'Productive Focus Mode (Allowance Paused)'
            });
            return;
        }

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs && tabs.length > 0 ? tabs[0] : null;

        if (!activeTab || !activeTab.url) {
            applyContext({
                category: 'productive',
                icon: '🛡️',
                domain: 'Browser Focus',
                description: 'Productive Focus Mode (Allowance Paused)'
            });
            return;
        }

        const ctx = categorizeTabUrl(activeTab.url);
        applyContext(ctx);
    } catch (err) {
        console.error('Error querying active tab:', err);
    }
}

function applyContext(ctx) {
    if (!elements.contextBanner) return;
    elements.contextBanner.className = `context-banner context-${ctx.category}`;
    elements.contextIcon.textContent = ctx.icon;
    elements.contextDomain.textContent = ctx.domain;
    elements.contextDesc.textContent = ctx.description;
}

// Layer 1: Instant cache render from chrome.storage.local
export async function loadCachedState() {
    try {
        if (!chrome.storage || !chrome.storage.local) return;

        const data = await chrome.storage.local.get([
            'last_reset_date',
            'today_usage',
            'session_start_time',
            'show_badge'
        ]);

        const today = getLocalDateString();
        let storedUsage = (data.last_reset_date === today && typeof data.today_usage === 'number')
            ? Math.max(0, data.today_usage)
            : 0;

        const isTracking = Boolean(
            data.last_reset_date === today &&
            data.session_start_time &&
            typeof data.session_start_time === 'number'
        );

        let currentUsage = storedUsage;
        if (isTracking) {
            const elapsed = Math.max(0, Date.now() - data.session_start_time);
            currentUsage += Math.min(elapsed, 120000);
        }

        const remainingMs = Math.max(0, TIMER_LIMIT_MS - currentUsage);

        state.todayUsage = currentUsage;
        state.baseUsage = storedUsage;
        state.remainingMs = remainingMs;
        state.isTrackingActive = isTracking;
        state.isExpired = remainingMs <= 0;
        state.sessionStartTime = isTracking ? data.session_start_time : null;
        state.lastResetDate = data.last_reset_date;
        state.showBadge = data.show_badge !== undefined ? Boolean(data.show_badge) : true;
        state.isBlockingActive = isBlockingActive();

        if (chrome.extension && chrome.extension.isAllowedIncognitoAccess) {
            chrome.extension.isAllowedIncognitoAccess((isAllowed) => {
                state.isAllowedIncognito = Boolean(isAllowed);
                renderUI();
            });
        }

        renderUI();
    } catch (err) {
        console.error('Error loading cached state:', err);
    }
}

// Layer 2: Wake background SW & Reconcile state
export async function syncAuthoritativeState() {
    try {
        if (!chrome.runtime || !chrome.runtime.sendMessage) return;

        chrome.runtime.sendMessage({ action: 'GET_STATE' }, (response) => {
            if (chrome.runtime.lastError) {
                // Background SW may be momentarily suspended or waking; cache render already displayed
                return;
            }
            if (response) {
                if (typeof response.remainingMs === 'number') {
                    state.remainingMs = response.remainingMs;
                }
                if (typeof response.todayUsage === 'number') {
                    state.todayUsage = response.todayUsage;
                }
                if (response.isTrackingActive !== undefined) {
                    state.isTrackingActive = Boolean(response.isTrackingActive);
                }
                if (response.isExpired !== undefined) {
                    state.isExpired = Boolean(response.isExpired);
                }
                if (response.isBlockingActive !== undefined) {
                    state.isBlockingActive = Boolean(response.isBlockingActive);
                }
                if (response.showBadge !== undefined) {
                    state.showBadge = Boolean(response.showBadge);
                }
                if (response.isAllowedIncognito !== undefined) {
                    state.isAllowedIncognito = Boolean(response.isAllowedIncognito);
                }
                renderUI();
            }
        });
    } catch (err) {
        console.error('Error synchronizing authoritative state:', err);
    }
}

// Layer 4: Local 1Hz ticker
export function tick() {
    if (state.isTrackingActive && state.sessionStartTime) {
        const elapsed = Math.max(0, Date.now() - state.sessionStartTime);
        state.todayUsage = state.baseUsage + Math.min(elapsed, 120000);
        state.remainingMs = Math.max(0, state.timerLimitMs - state.todayUsage);
        if (state.remainingMs <= 0) {
            state.isExpired = true;
            state.isTrackingActive = false;
        }
    }
    renderUI();
}

// Wire Event Listeners & Initialize
export function setupEventListeners() {
    // Enable Incognito button (opens extension page to toggle "Allow in incognito")
    if (elements.enableIncognitoBtn) {
        elements.enableIncognitoBtn.addEventListener('click', () => {
            const extId = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) ? chrome.runtime.id : '';
            if (chrome.tabs && chrome.tabs.create) {
                chrome.tabs.create({ url: extId ? `chrome://extensions/?id=${extId}` : 'chrome://extensions' });
            }
        });
    }

    // Badge toggle control
    if (elements.badgeToggle) {
        elements.badgeToggle.addEventListener('change', async () => {
            const checked = elements.badgeToggle.checked;
            state.showBadge = checked;
            try {
                if (chrome.storage && chrome.storage.local) {
                    await chrome.storage.local.set({ show_badge: checked });
                }
            } catch (err) {
                console.error('Error saving show_badge setting:', err);
            }
        });
    }

    // Force Sync button
    if (elements.syncBtn) {
        elements.syncBtn.addEventListener('click', async () => {
            elements.syncBtn.classList.add('spinning');
            try {
                if (chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({ action: 'REQUEST_SYNC' }, (response) => {
                        if (response) {
                            if (typeof response.remainingMs === 'number') state.remainingMs = response.remainingMs;
                            if (typeof response.todayUsage === 'number') state.todayUsage = response.todayUsage;
                            if (response.isTrackingActive !== undefined) state.isTrackingActive = Boolean(response.isTrackingActive);
                            if (response.isExpired !== undefined) state.isExpired = Boolean(response.isExpired);
                            if (response.showBadge !== undefined) state.showBadge = Boolean(response.showBadge);
                            renderUI();
                        }
                    });
                }
            } catch (err) {
                console.error('Error sending REQUEST_SYNC:', err);
            } finally {
                setTimeout(() => {
                    elements.syncBtn.classList.remove('spinning');
                }, 600);
            }
        });
    }

    // Layer 3: Reactive Subscription to storage changes
    if (chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes.today_usage || changes.session_start_time || changes.last_reset_date || changes.show_badge) {
                loadCachedState();
            }
        });
    }

    // Active Tab Listeners to dynamically update context banner
    if (chrome.tabs) {
        if (chrome.tabs.onActivated) {
            chrome.tabs.onActivated.addListener(updateActiveTabContext);
        }
        if (chrome.tabs.onUpdated) {
            chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
                if (changeInfo.url || changeInfo.status === 'complete') {
                    updateActiveTabContext();
                }
            });
        }
    }
}

// Bootstrap when running inside browser DOM environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', async () => {
        initElements();
        setupEventListeners();

        // Layer 1: Instant cache render (<5ms paint)
        await loadCachedState();

        // Active tab inspection
        await updateActiveTabContext();

        // Layer 2: Wake background SW & reconcile authoritative state
        await syncAuthoritativeState();

        // Layer 4: Local 1Hz interval ticker
        setInterval(tick, 1000);
    });
}
