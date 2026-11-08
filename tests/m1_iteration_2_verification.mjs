// ==============================================================================
// F.R.O.S.T. Milestone 1 Iteration 2 Remediation Verification Suite
// ==============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MockChromeMV3 } from './mocks/mockChrome.js';
import { EDUCATIONAL_REGEX, compileKeywordRegex } from '../constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKGROUND_PATH = pathToFileURL(path.resolve(__dirname, '../background.js')).href;

console.log('='.repeat(70));
console.log('F.R.O.S.T. M1 Iteration 2 Remediation Verification');
console.log('='.repeat(70));

let passed = 0;
let total = 0;

function check(desc, fn) {
    total++;
    try {
        fn();
        console.log(`  PASS: [${total}] ${desc}`);
        passed++;
    } catch (err) {
        console.error(`  FAIL: [${total}] ${desc}`);
        console.error(err);
    }
}

async function checkAsync(desc, fn) {
    total++;
    try {
        await fn();
        console.log(`  PASS: [${total}] ${desc}`);
        passed++;
    } catch (err) {
        console.error(`  FAIL: [${total}] ${desc}`);
        console.error(err);
    }
}

// -----------------------------------------------------------------------------
// Defect 1: Browser Startup Top-Level Bootstrap Race
// -----------------------------------------------------------------------------
await checkAsync('Defect 1: Cold startup with dirty session markers does NOT inflate today_usage', async () => {
    const startTime = new Date('2026-11-08T08:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    // Dirty session left from prior browser session/crash (10 minutes ago)
    await mock.storage.local.set({
        last_reset_date: '2026-11-08',
        today_usage: 15000,
        session_start_time: startTime - 600000, // 10 minutes ago
        session_tab_id: 999
    });

    // Browser starts with only an untracked blank tab (id 1)
    mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
    mock.tabsList = [
        { id: 1, url: 'chrome://newtab', active: true, windowId: 1 }
    ];

    // Wake worker: top-level requestSync() runs immediately on module load
    await mock.wakeWorker(BACKGROUND_PATH);

    const state = await mock.storage.local.get();
    assert.equal(
        state.today_usage,
        15000,
        `today_usage must remain strictly 15,000ms (NOT inflated). Got: ${state.today_usage}`
    );
    assert.equal(state.session_start_time, null, 'session_start_time must be cleared to null');
    assert.equal(state.session_tab_id, null, 'session_tab_id must be cleared to null');

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Defect 2: GET_STATE Mutex Serialization
// -----------------------------------------------------------------------------
await checkAsync('Defect 2: GET_STATE uses requestSync() and serializes on syncQueue', async () => {
    const bgSrc = fs.readFileSync('background.js', 'utf8');
    assert.ok(
        bgSrc.includes("if (request.action === 'GET_STATE'") &&
        bgSrc.includes('await requestSync();'),
        'GET_STATE message handler must use await requestSync() instead of direct syncTrackingState()'
    );
    assert.ok(
        !bgSrc.match(/request\.action === 'GET_STATE'[\s\S]*?await syncTrackingState\(\);/),
        'GET_STATE must not bypass syncQueue with await syncTrackingState()'
    );

    // Verify GET_STATE runtime behavior under concurrency
    const startTime = new Date('2026-11-08T09:00:00Z').getTime();
    const mock = new MockChromeMV3(startTime);
    mock.installGlobal();

    mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
    mock.tabsList = [
        { id: 101, url: 'https://reddit.com', active: true, windowId: 1 }
    ];

    await mock.wakeWorker(BACKGROUND_PATH);

    // Fire 10 concurrent GET_STATE messages
    const statePromises = [];
    for (let i = 0; i < 10; i++) {
        statePromises.push(mock.runtime.sendMessage({ action: 'GET_STATE' }));
    }
    const results = await Promise.all(statePromises);
    for (const res of results) {
        assert.ok(res, 'GET_STATE response must be defined');
        assert.equal(typeof res.todayUsage, 'number', 'todayUsage must be a number');
        assert.equal(typeof res.remainingMs, 'number', 'remainingMs must be a number');
        assert.equal(res.isTrackingActive, true, 'isTrackingActive must be true on reddit');
    }

    mock.uninstallGlobal();
});

// -----------------------------------------------------------------------------
// Defect 3: YouTube SPA Hydration Debounce Deadlock
// -----------------------------------------------------------------------------
check('Defect 3: content.js checkYouTubeTitle has force flag and staggered SPA calls bypass debounce', () => {
    const contentSrc = fs.readFileSync('content.js', 'utf8');

    // Verify signature
    assert.ok(
        contentSrc.includes('function checkYouTubeTitle(force = false)'),
        'checkYouTubeTitle must accept force = false parameter'
    );

    // Verify debounce bypass logic
    assert.ok(
        contentSrc.includes('if (!force && now - lastCheckTime < 1000) return;'),
        'Debounce must only rate-limit when !force'
    );

    // Verify staggered calls pass force = true
    assert.ok(
        contentSrc.includes('checkYouTubeTitle(true);'),
        'Immediate check must pass force = true on URL change'
    );
    assert.ok(
        contentSrc.includes('setTimeout(() => checkYouTubeTitle(true), 250);'),
        '250ms staggered check must pass force = true'
    );
    assert.ok(
        contentSrc.includes('setTimeout(() => checkYouTubeTitle(true), 600);'),
        '600ms staggered check must pass force = true'
    );
    assert.ok(
        contentSrc.includes('setTimeout(() => checkYouTubeTitle(true), 1200);'),
        '1200ms staggered check must pass force = true'
    );
});

// -----------------------------------------------------------------------------
// Defect 4: Regex Lookaround Delimiters for Non-Word Boundary Tokens
// -----------------------------------------------------------------------------
check('Defect 4: Regex matches hyphenated and slashed C++ educational titles', () => {
    const requiredMatches = [
        'C++-based',
        'C++/CLI',
        'Modern C++/WinRT',
        'Advanced C++ Programming',
        'C++: The Complete Guide',
        'Learning C++ (2026 Edition)'
    ];

    for (const title of requiredMatches) {
        assert.equal(
            EDUCATIONAL_REGEX.test(title),
            true,
            `EDUCATIONAL_REGEX must match: "${title}"`
        );
    }

    // Verify content.js parity
    const contentSrc = fs.readFileSync('content.js', 'utf8');
    assert.ok(
        contentSrc.includes("const end = /\\w$/.test(k) ? '\\\\b' : '(?=$|[\\\\s.,!?;:()[\\\\]{}\"\\'`\\\\/-])';"),
        'content.js compileKeywordRegex must include hyphen and slash in lookahead delimiters'
    );

    // Ensure entertainment false-positives are still 100% blocked
    const falsePositiveTraps = [
        'Top 10 Epic Fails',
        'Daily Morning Routine',
        'Captain Jack Sparrow',
        'I Tested 50 Viral TikTok Products',
        'Jaws 5 Shark Attack Scene in 4K',
        'Solo 100 Day Wilderness Isolation Challenge'
    ];

    for (const title of falsePositiveTraps) {
        assert.equal(
            EDUCATIONAL_REGEX.test(title),
            false,
            `EDUCATIONAL_REGEX must NOT match entertainment title: "${title}"`
        );
    }
});

// -----------------------------------------------------------------------------
// Defect 5: Dead Code and Tooltip Cleanup
// -----------------------------------------------------------------------------
check('Defect 5: dead chrome.action.onClicked is cleaned up and tooltips updated', () => {
    const bgSrc = fs.readFileSync('background.js', 'utf8');

    // Verify chrome.action.onClicked listener is removed
    assert.ok(
        !bgSrc.includes('chrome.action.onClicked.addListener'),
        'Dead chrome.action.onClicked listener must be removed'
    );

    // Verify explanation note is present
    assert.ok(
        bgSrc.includes('action.default_popup') && bgSrc.includes('Focus Dashboard popup'),
        'Comment explaining MV3 action.default_popup superseding onClicked must be present'
    );

    // Verify tooltips no longer claim "Click to toggle"
    assert.ok(
        !bgSrc.includes('- Click to toggle'),
        'Tooltips must not contain "- Click to toggle"'
    );
    assert.ok(
        bgSrc.includes('F.R.O.S.T.: ${m}m ${s}s remaining (Active countdown)'),
        'Active countdown tooltip must be formatted cleanly'
    );
    assert.ok(
        bgSrc.includes('F.R.O.S.T.: ${m}m ${s}s remaining of ${ALLOWANCE_MINUTES}m quota (Paused)'),
        'Paused tooltip must be formatted cleanly'
    );
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('='.repeat(70));
console.log(`TOTAL CHECKS: ${total}`);
console.log(`PASSED:       ${passed}`);
console.log(`FAILED:       ${total - passed}`);
console.log('='.repeat(70));

if (passed !== total) {
    process.exit(1);
} else {
    console.log('ALL REMEDIATION CHECKS PASSED PERFECTLY!\n');
    process.exit(0);
}
