// ==============================================================================
// Milestone 1 Adversarial Stress & Edge Case Test Suite
// ==============================================================================

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MockChromeMV3 } from '../mocks/mockChrome.js';
import { EDUCATIONAL_REGEX, compileKeywordRegex, escapeRegex } from '../../constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKGROUND_PATH = pathToFileURL(path.resolve(__dirname, '../../background.js')).href;

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

console.log('\n=== RUNNING M1 STRESS & EDGE CASE VERIFICATION SUITE ===\n');

// -----------------------------------------------------------------------------
// Test 1: Rapid Tab Switching Concurrency Stress Test
// -----------------------------------------------------------------------------
await test('Stress 1: Rapid concurrent tab switches serialize cleanly via syncQueue', async () => {
    const startTime = new Date('2026-11-08T11:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
    mock.tabsList = [
        { id: 1, url: 'https://reddit.com', active: true, windowId: 1 },
        { id: 2, url: 'https://google.com', active: false, windowId: 1 },
        { id: 3, url: 'https://twitter.com', active: false, windowId: 1 },
        { id: 4, url: 'https://wikipedia.org', active: false, windowId: 1 }
    ];

    await mock.wakeWorker(BACKGROUND_PATH);

    // Rapidly switch between tabs 50 times in rapid succession
    const switchPromises = [];
    for (let i = 0; i < 50; i++) {
        const targetTabId = (i % 4) + 1;
        mock.advanceClock(100);
        switchPromises.push(mock.activateTab(targetTabId, 1));
    }

    await Promise.all(switchPromises);

    const state = await mock.storage.local.get();
    assert.equal(typeof state.today_usage, 'number', 'today_usage must be a valid number');
    assert.ok(!isNaN(state.today_usage), 'today_usage must not be NaN');
    assert.ok(state.today_usage >= 0, 'today_usage must not be negative');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Test 2: Storage Data Corruption Self-Healing
// -----------------------------------------------------------------------------
await test('Edge Case 2: Storage with NaN, null, and negative usage self-heals to 0', async () => {
    const startTime = new Date('2026-11-08T12:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
    mock.tabsList = [
        { id: 10, url: 'https://reddit.com', active: true, windowId: 1 }
    ];

    // Intentionally inject corrupted storage
    await mock.storage.local.set({
        last_reset_date: '2026-11-08',
        today_usage: NaN,
        session_start_time: 'corrupted-timestamp',
        session_tab_id: null
    });

    await mock.wakeWorker(BACKGROUND_PATH);

    // Call GET_STATE
    const state = await mock.runtime.sendMessage({ action: 'GET_STATE' });
    assert.equal(typeof state.todayUsage, 'number', 'Sanitized todayUsage must be number');
    assert.ok(!isNaN(state.todayUsage), 'todayUsage must not be NaN');
    assert.equal(state.todayUsage, 0, 'Corrupted usage must safely fall back to 0');
    assert.equal(state.remainingMs, 300000, 'Remaining allowance must be 300,000ms');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Test 3: Last Remaining Tab in Window is Redirected, Not Removed
// -----------------------------------------------------------------------------
await test('Edge Case 3: Sole remaining tab in window redirects to wallpaper rather than closing browser', async () => {
    const startTime = new Date('2026-11-08T13:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    // Only 1 tab exists in the entire browser
    mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
    mock.tabsList = [
        { id: 999, url: 'https://twitter.com', active: true, windowId: 1 }
    ];

    // Already at limit (300,000ms)
    await mock.storage.local.set({
        last_reset_date: '2026-11-08',
        today_usage: 300000
    });

    await mock.wakeWorker(BACKGROUND_PATH);

    mock.callLog.tabsRemoved = [];
    mock.callLog.tabsUpdated = [];

    // Trigger update on tab 999
    await mock.updateTab(999, { url: 'https://twitter.com/notifications' });

    // Verify tab 999 was updated (redirected), NOT removed (which would close Chrome)
    assert.equal(mock.callLog.tabsRemoved.length, 0, 'Sole remaining tab must NOT be removed');
    const updateCall = mock.callLog.tabsUpdated.find(u => u.tabId === 999);
    assert.ok(updateCall, 'Sole remaining tab must be updated to redirect target');
    assert.ok(updateCall.updateInfo.url.includes('pinimg.com'), 'Redirect target must be wallpaper');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Test 4: Multi-tab window closes all tracked tabs when limit reached
// -----------------------------------------------------------------------------
await test('Edge Case 4: Multi-tab window removes tracked tabs while keeping non-tracked tabs open', async () => {
    const startTime = new Date('2026-11-08T14:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
    mock.tabsList = [
        { id: 101, url: 'https://reddit.com', active: true, windowId: 1 },
        { id: 102, url: 'https://twitter.com', active: false, windowId: 1 },
        { id: 103, url: 'https://google.com', active: false, windowId: 1 }
    ];

    await mock.storage.local.set({
        last_reset_date: '2026-11-08',
        today_usage: 299000,
        session_start_time: startTime,
        session_tab_id: 101
    });

    await mock.wakeWorker(BACKGROUND_PATH);

    mock.callLog.tabsRemoved = [];

    // Advance 2 seconds -> quota expires (301,000ms >= 300,000ms)
    mock.advanceClock(2000);
    await mock.fireAlarm('frost_limit_expiry');

    // Both reddit (101) and twitter (102) should be removed; google (103) should remain
    const removedIds = mock.callLog.tabsRemoved.map(r => r.tabId);
    assert.ok(removedIds.includes(101), 'Reddit tab 101 must be removed');
    assert.ok(removedIds.includes(102), 'Twitter tab 102 must be removed');
    assert.ok(!removedIds.includes(103), 'Google tab 103 must NOT be removed');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Test 5: Educational Keyword Regex Adversarial Leaks and Matches
// -----------------------------------------------------------------------------
await test('Adversarial Regex 5: Zero false-positive leaks on entertainment, 100% detection of educational keywords', () => {
    // False Positive Test Cases: Entertainment/Clickbait titles containing substrings of keywords
    const falsePositiveAttackVectors = [
        // 'ai' substring attacks
        'Top 10 Fails of the Month',
        'Daily Vlog in Hawaii',
        'Paid Promotion: Best Gaming Chair',
        'Captain America New Trailer Breakdown',
        'Wait and See What Happens Next',
        'Affordable Airbnb in Tokyo',
        'Rainy Day in Seattle',
        'Haircut Transformation Video',
        'Stairway to Heaven Guitar Cover',

        // 'ted' substring attacks (past tense verbs)
        'I Tested 50 Viral TikTok Products',
        'Streamer Reacted to Scary Videos',
        'We Visited the Most Dangerous Place',
        'He Predicted the Entire Plot',
        'United Flight Experience Vlog',
        'My Friend Created a Monster',
        'I Attempted the Impossible Challenge',

        // 'iso' substring attacks
        'Minecraft Hardcore Survival Episode 10',
        'Anisoptera Dragonfly Hunting Behaviour (without isolation)',
        'Poison Ivy Treatment Hacks',

        // 'guide' / 'math' inside other words
        'Guillermo del Toro Interview',
        'Aftermath of the Earthquake'
    ];

    for (const title of falsePositiveAttackVectors) {
        const matches = EDUCATIONAL_REGEX.test(title);
        assert.equal(matches, false, `False positive leak detected for title: "${title}"`);
    }

    // True Positive Test Cases: Legitimate academic and engineering titles
    const truePositiveTargets = [
        'Learn C++ From Scratch (Full Course)',
        'C++: Advanced Metaprogramming Patterns',
        'Modern C++ Best Practices',
        'Introduction to AI and Neural Networks',
        'MIT 18.06: Linear Algebra Lecture 1',
        'Calculus II: Integration Techniques Tutorial',
        'Crash Course: World History',
        'Veritasium: The Riddle That Fooled Einstein',
        '3Blue1Brown: Essence of Linear Algebra',
        'TED: Do Schools Kill Creativity? - Ken Robinson',
        'ISO 27001 Information Security Management Standard',
        'Building a Robot with Arduino & Raspberry Pi',
        'Data Structures and Algorithms in Rust'
    ];

    for (const title of truePositiveTargets) {
        const matches = EDUCATIONAL_REGEX.test(title);
        assert.equal(matches, true, `True positive failed to match educational title: "${title}"`);
    }
});

// -----------------------------------------------------------------------------
// Test 6: Browser onStartup Session Cleanup
// -----------------------------------------------------------------------------
await test('Lifecycle 6: chrome.runtime.onStartup nullifies dangling session_start_time', async () => {
    const startTime = new Date('2026-11-08T09:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    // Previous dirty session left from sudden browser crash
    await mock.storage.local.set({
        last_reset_date: '2026-11-08',
        today_usage: 60000,
        session_start_time: startTime - 3600000, // 1 hour ago
        session_tab_id: 888
    });

    // Simulate browser cold boot: onStartup dispatches
    await mock.wakeWorker(BACKGROUND_PATH, async () => {
        for (const l of mock.runtimeStartupListeners) {
            await l();
        }
    });

    const state = await mock.storage.local.get();
    assert.equal(state.session_start_time, null, 'onStartup must clear session_start_time');
    assert.equal(state.session_tab_id, null, 'onStartup must clear session_tab_id');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('\n=== STRESS & EDGE CASE SUITE COMPLETE ===');
const passedCount = results.filter(r => r.passed).length;
const failedCount = results.filter(r => !r.passed).length;
console.log(`Results: ${passedCount} passed, ${failedCount} failed of ${results.length} tests.`);

if (failedCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
