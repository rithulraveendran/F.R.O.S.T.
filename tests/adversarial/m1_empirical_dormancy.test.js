// ==============================================================================
// Milestone 1 Adversarial Empirical Verification Test Suite
// ==============================================================================

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MockChromeMV3 } from '../mocks/mockChrome.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKGROUND_PATH = pathToFileURL(path.resolve(__dirname, '../../background.js')).href;

// Test Runner
const results = [];
async function test(name, fn) {
    try {
        await fn();
        results.push({ name, passed: true });
        console.log(`  PASS: ${name}`);
    } catch (err) {
        results.push({ name, passed: false, error: err });
        console.error(`  FAIL: ${name}`);
        console.error(err);
    }
}

console.log('\n=== RUNNING M1 EMPIRICAL ADVERSARIAL VERIFICATION SUITE ===\n');

// -----------------------------------------------------------------------------
// Test 1: Service Worker Dormancy & State Persistence
// -----------------------------------------------------------------------------
await test('Dormancy 1: Worker suspension after 30s and waking on alarm preserves usage', async () => {
    const startTime = new Date('2026-11-08T10:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    // Setup initial window & tab: Active tracked tab (reddit.com) in focused window
    mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
    mock.tabsList = [
        { id: 101, url: 'https://www.reddit.com/r/programming', active: true, windowId: 1 }
    ];

    // Wake up Service Worker 1
    await mock.wakeWorker(BACKGROUND_PATH);

    // Initial state after bootstrap
    let state = await mock.storage.local.get();
    assert.equal(state.today_usage, 0, 'Initial usage must be 0');
    assert.equal(state.session_tab_id, 101, 'Tracked tab 101 must be active');
    assert.ok(state.session_start_time, 'session_start_time must be set');

    // Simulate 30s of browsing, then SW suspends (dormancy)
    mock.advanceClock(30000);
    mock.suspendWorker();

    // Advance virtual clock by another 45s while SW is dormant (user still browsing reddit)
    mock.advanceClock(45000);

    // Wake up SW 2 via periodic heartbeat alarm
    await mock.wakeWorker(BACKGROUND_PATH, async () => {
        await mock.fireAlarm('frost_heartbeat');
    });

    state = await mock.storage.local.get();
    // 30s + 45s = 75s elapsed = 75,000ms
    assert.equal(state.today_usage, 75000, `Usage after wake must accumulate to 75000ms, got ${state.today_usage}`);
    assert.equal(state.session_tab_id, 101, 'Active session tab must still be 101');
    assert.equal(state.session_start_time, mock.virtualTime, 'session_start_time must update to wake time');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Test 2: Long Suspend / Machine Sleep Protection (Cap at 120,000ms)
// -----------------------------------------------------------------------------
await test('Sleep Drain 2: 3-hour machine sleep caps elapsed usage at 120,000ms and preserves remaining quota', async () => {
    const startTime = new Date('2026-11-08T14:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
    mock.tabsList = [
        { id: 201, url: 'https://twitter.com/home', active: true, windowId: 1 }
    ];

    // Worker wakes, starts tracking
    await mock.wakeWorker(BACKGROUND_PATH);
    let state = await mock.storage.local.get();
    assert.equal(state.today_usage, 0);

    // User browses for 30 seconds
    mock.advanceClock(30000);
    // Machine goes to sleep / lid closed for 3 hours (3 * 3600 * 1000 = 10,800,000ms)
    mock.suspendWorker();
    mock.advanceClock(3 * 3600 * 1000);

    // Machine wakes up 3 hours later, triggers wakeup
    await mock.wakeWorker(BACKGROUND_PATH, async () => {
        await mock.fireAlarm('frost_heartbeat');
    });

    state = await mock.storage.local.get();

    // The single-interval elapsed time must be capped at 120,000ms, NOT 10,800,000ms!
    // Total usage = 0 (before sleep) + 120,000ms (clamped sleep wake-up) = 120,000ms
    assert.equal(state.today_usage, 120000, `Usage must be clamped to 120,000ms, got: ${state.today_usage}`);

    // TIMER_LIMIT_MS is 300,000ms (5 mins). User must still have 180,000ms (3 mins) left!
    const remainingMs = 300000 - state.today_usage;
    assert.equal(remainingMs, 180000, `User should retain 180,000ms quota, got: ${remainingMs}`);

    // Verify tracked tab 201 was NOT removed/closed prematurely
    const tabStillExists = mock.tabsList.some(t => t.id === 201);
    assert.ok(tabStillExists, 'Tab 201 must NOT be closed because quota is not exhausted');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Test 3: Midnight Rollover During Sleep Cleans Session and Resets Usage
// -----------------------------------------------------------------------------
await test('Rollover 3: Sleep across midnight resets today_usage to 0 and clears dangling session', async () => {
    // Start at 23:55 on 2026-11-08
    const startTime = new Date('2026-11-08T23:55:00').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
    mock.tabsList = [
        { id: 301, url: 'https://instagram.com', active: true, windowId: 1 }
    ];

    // Setup prior usage of 200,000ms on 2026-11-08
    await mock.storage.local.set({
        last_reset_date: '2026-11-08',
        today_usage: 200000,
        session_start_time: startTime,
        session_tab_id: 301
    });

    // Worker goes to sleep across midnight to 2026-11-09 02:00:00 (2 hours later)
    mock.suspendWorker();
    const nextDayTime = new Date('2026-11-09T02:00:00').getTime();
    mock.setClock(nextDayTime);

    // Wake up on new day
    await mock.wakeWorker(BACKGROUND_PATH, async () => {
        await mock.fireAlarm('frost_heartbeat');
    });

    const state = await mock.storage.local.get();
    assert.equal(state.last_reset_date, '2026-11-09', 'last_reset_date must roll over to 2026-11-09');
    assert.equal(state.today_usage, 0, `Usage must be reset to 0 for the new day, got ${state.today_usage}`);
    assert.equal(state.session_tab_id, 301, 'Tab 301 is active so fresh session starts');
    assert.equal(state.session_start_time, nextDayTime, 'session_start_time must be initialized to wake time');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Test 4: In-Flight Active Session Calculation in isAllowanceExhausted
// -----------------------------------------------------------------------------
await test('In-Flight 4: isAllowanceExhausted detects in-flight session before sync write', async () => {
    const startTime = new Date('2026-11-08T12:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
    mock.tabsList = [
        { id: 401, url: 'https://reddit.com', active: true, windowId: 1 },
        { id: 402, url: 'https://google.com', active: false, windowId: 1 }
    ];

    // Prior stored usage is 250,000ms (50,000ms left out of 300,000ms)
    await mock.storage.local.set({
        last_reset_date: '2026-11-08',
        today_usage: 250000,
        session_start_time: startTime,
        session_tab_id: 401
    });

    await mock.wakeWorker(BACKGROUND_PATH);

    // Scenario A: At T + 45s (total usage = 250s + 45s = 295s < 300s)
    mock.advanceClock(45000);
    // User attempts to navigate tab 402 to facebook.com
    await mock.updateTab(402, { url: 'https://facebook.com' });
    // Facebook navigation should NOT be blocked yet because 5s remains
    const tab402AfterA = mock.tabsList.find(t => t.id === 402);
    assert.ok(tab402AfterA, 'Tab 402 should not be closed at 295s');
    assert.equal(tab402AfterA.url, 'https://facebook.com', 'Tab 402 should remain on facebook.com');

    // Scenario B: At T + 52s (total usage = 250s + 52s = 302s >= 300s)
    mock.advanceClock(7000);
    // User opens new tab 403 to tiktok.com
    mock.tabsList.push({ id: 403, url: 'https://tiktok.com', active: false, windowId: 1 });
    await mock.updateTab(403, { url: 'https://tiktok.com' });

    // Since in-flight elapsed (52s) + stored usage (250s) = 302s >= 300s:
    // isAllowanceExhausted() MUST return true and close tab 403!
    const tab403AfterB = mock.tabsList.find(t => t.id === 403);
    assert.ok(!tab403AfterB || tab403AfterB.url !== 'https://tiktok.com', 'Tab 403 must be closed or redirected once in-flight session exceeds limit');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Test 5: Window Focus Isolation
// -----------------------------------------------------------------------------
await test('Focus 5: Background/unfocused windows and minimized windows do not decrement allowance', async () => {
    const startTime = new Date('2026-11-08T15:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    // Window 1: Focused window with work tab (github.com - wait, github is in BLOCKED_DOMAINS! Let's use google.com)
    // Window 2: Background unfocused window with distraction tab (facebook.com)
    mock.windowsList = [
        { id: 1, focused: true, state: 'normal' },
        { id: 2, focused: false, state: 'normal' }
    ];
    mock.tabsList = [
        { id: 501, url: 'https://www.google.com/search?q=math', active: true, windowId: 1 },
        { id: 502, url: 'https://www.facebook.com/feed', active: true, windowId: 2 }
    ];

    await mock.wakeWorker(BACKGROUND_PATH);

    // Initial state: Window 1 is focused with google.com -> no tracked tab
    let state = await mock.storage.local.get();
    assert.equal(state.today_usage, 0);
    assert.equal(state.session_start_time, null, 'No session should start while tracked tab is in background window');

    // Advance clock by 60s while working in Window 1
    mock.advanceClock(60000);
    await mock.fireAlarm('frost_heartbeat');

    state = await mock.storage.local.get();
    assert.equal(state.today_usage, 0, 'Usage must remain 0 while distraction tab is in unfocused window');

    // Switch focus to Window 2 (facebook.com)
    await mock.changeWindowFocus(2);
    state = await mock.storage.local.get();
    assert.equal(state.session_tab_id, 502, 'Tracking must activate for Window 2 tab 502');
    assert.ok(state.session_start_time, 'session_start_time must be recorded');

    // Browse Facebook for 40 seconds
    mock.advanceClock(40000);

    // Switch focus away from Chrome (e.g. to VS Code / WINDOW_ID_NONE)
    await mock.changeWindowFocus(mock.windows.WINDOW_ID_NONE);
    state = await mock.storage.local.get();
    assert.equal(state.today_usage, 40000, `Usage must record 40,000ms, got ${state.today_usage}`);
    assert.equal(state.session_start_time, null, 'Session must pause when Chrome loses focus');

    // Stay in VS Code for 5 minutes
    mock.advanceClock(300000);
    await mock.fireAlarm('frost_heartbeat');

    state = await mock.storage.local.get();
    assert.equal(state.today_usage, 40000, 'Usage must remain strictly 40,000ms while user is in VS Code');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Test 6: Anti-Tamper Tab Destruction for chrome://extensions
// -----------------------------------------------------------------------------
await test('Anti-Tamper 6: Attempting to access chrome://extensions invokes chrome.tabs.remove', async () => {
    const startTime = new Date('2026-11-08T16:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
    mock.tabsList = [
        { id: 601, url: 'https://google.com', active: true, windowId: 1 },
        { id: 602, url: 'about:blank', active: false, windowId: 1 }
    ];

    await mock.wakeWorker(BACKGROUND_PATH);

    // Clear initial call logs
    mock.callLog.tabsRemoved = [];

    // User navigates tab 602 to chrome://extensions
    await mock.triggerBeforeNavigate({ tabId: 602, url: 'chrome://extensions', frameId: 0 });

    // Assert that chrome.tabs.remove was called for tab 602
    const removedCall = mock.callLog.tabsRemoved.find(c => c.tabId === 602);
    assert.ok(removedCall, 'chrome.tabs.remove must be called when navigating to chrome://extensions');

    // Also test chrome://settings/extensions via tabs.onUpdated
    mock.callLog.tabsRemoved = [];
    mock.tabsList.push({ id: 603, url: 'about:blank', active: false, windowId: 1 });
    await mock.updateTab(603, { url: 'chrome://settings/extensions' });

    const removed603 = mock.callLog.tabsRemoved.find(c => c.tabId === 603);
    assert.ok(removed603, 'chrome.tabs.remove must be called when tab updates to chrome://settings/extensions');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Test 7: Hard Blocked Domains (flixbaba variants)
// -----------------------------------------------------------------------------
await test('Hard Block 7: flixbaba and subdomains are immediately redirected without quota consumption', async () => {
    const startTime = new Date('2026-11-08T17:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
    mock.tabsList = [
        { id: 701, url: 'https://google.com', active: true, windowId: 1 }
    ];

    await mock.wakeWorker(BACKGROUND_PATH);
    mock.callLog.tabsUpdated = [];

    // Navigate to flixbaba.mov
    mock.tabsList.push({ id: 702, url: 'about:blank', active: false, windowId: 1 });
    await mock.triggerBeforeNavigate({ tabId: 702, url: 'https://flixbaba.mov/watch?v=1', frameId: 0 });

    const redirect702 = mock.callLog.tabsUpdated.find(u => u.tabId === 702);
    assert.ok(redirect702, 'flixbaba.mov must trigger tab update redirect');
    assert.ok(redirect702.updateInfo.url.includes('pinimg.com'), 'Must redirect to REDIRECT_TARGET');

    // Navigate to sub.flixbaba.org
    mock.callLog.tabsUpdated = [];
    mock.tabsList.push({ id: 703, url: 'about:blank', active: false, windowId: 1 });
    await mock.triggerBeforeNavigate({ tabId: 703, url: 'https://sub.flixbaba.org/movie/play', frameId: 0 });

    const redirect703 = mock.callLog.tabsUpdated.find(u => u.tabId === 703);
    assert.ok(redirect703, 'sub.flixbaba.org must trigger tab update redirect via label matching');

    // Confirm today_usage was NOT consumed
    const state = await mock.storage.local.get();
    assert.equal(state.today_usage, 0, 'Hard-blocked domains must not consume daily allowance');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Test 8: Focus Dashboard Sync API (GET_STATE / REQUEST_SYNC)
// -----------------------------------------------------------------------------
await test('Dashboard API 8: GET_STATE returns accurate reactive state payload', async () => {
    const startTime = new Date('2026-11-08T18:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
    mock.tabsList = [
        { id: 801, url: 'https://reddit.com', active: true, windowId: 1 }
    ];

    await mock.wakeWorker(BACKGROUND_PATH);

    // Advance 60 seconds of active browsing
    mock.advanceClock(60000);

    // Send GET_STATE message to background.js
    const response = await mock.runtime.sendMessage({ action: 'GET_STATE' });

    assert.ok(response, 'GET_STATE must return a response object');
    assert.equal(typeof response.remainingMs, 'number', 'remainingMs must be a number');
    assert.equal(response.todayUsage, 60000, `todayUsage should be 60000, got: ${response.todayUsage}`);
    assert.equal(response.remainingMs, 240000, `remainingMs should be 240000, got: ${response.remainingMs}`);
    assert.equal(response.timerLimitMs, 300000, 'timerLimitMs should be 300000 (5 mins)');
    assert.equal(response.isTrackingActive, true, 'isTrackingActive must be true');
    assert.equal(response.isExpired, false, 'isExpired must be false');
    assert.equal(response.isBlockingActive, true, 'isBlockingActive must be true');
    assert.equal(response.showBadge, true, 'showBadge must default to true');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n=== TEST SUITE COMPLETE ===');
const passedCount = results.filter(r => r.passed).length;
const failedCount = results.filter(r => !r.passed).length;
console.log(`Results: ${passedCount} passed, ${failedCount} failed of ${results.length} tests.`);

if (failedCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
