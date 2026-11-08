// ==============================================================================
// F.R.O.S.T. Challenger 1 Independent Stress & Verification Harness
// ==============================================================================

import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { MockChromeMV3 } from './mocks/mockChrome.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKGROUND_PATH = pathToFileURL(path.resolve(__dirname, '../background.js')).href;

async function runTests() {
    console.log('='.repeat(70));
    console.log('F.R.O.S.T. Challenger 1 Stress & Verification Harness');
    console.log('='.repeat(70));

    let failures = 0;

    // -------------------------------------------------------------------------
    // TEST 1: Cold start with dirty session marker when restored tab is tracked
    // -------------------------------------------------------------------------
    console.log('\n--- Test 1: Cold start with dirty marker & restored tracked tab ---');
    try {
        const startTime = new Date('2026-11-08T10:00:00Z').getTime();
        const mock = new MockChromeMV3(startTime);
        mock.installGlobal();

        // Simulate crash 10 minutes ago while on reddit (tab 999)
        await mock.storage.local.set({
            last_reset_date: '2026-11-08',
            today_usage: 10000,
            session_start_time: startTime - 600000, // 10 minutes ago
            session_tab_id: 999
        });

        // Browser restarts with restored tab 1: reddit.com active in focused window
        mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
        mock.tabsList = [
            { id: 1, url: 'https://reddit.com', active: true, windowId: 1 }
        ];

        // Wake worker (simulating browser startup)
        await mock.wakeWorker(BACKGROUND_PATH);

        const state = await mock.storage.local.get();
        console.log(`State after cold start with reddit restored: today_usage = ${state.today_usage}`);
        console.log(`session_start_time = ${state.session_start_time}, session_tab_id = ${state.session_tab_id}`);

        // What should today_usage be?
        // If the browser was closed for 10 minutes, the user was NOT browsing during those 10 minutes!
        // today_usage must be strictly 10000 (preserved) and NOT 130000 (inflated by 120s max cap).
        assert.equal(
            state.today_usage,
            10000,
            `today_usage must NOT inflate on cold startup with dirty marker when restored tab is tracked! Expected: 10000, Got: ${state.today_usage} (+${state.today_usage - 10000}ms)`
        );

        mock.uninstallGlobal();
    } catch (err) {
        console.error('Test 1 failed with error:', err);
        failures++;
    }

    // -------------------------------------------------------------------------
    // TEST 2: High Concurrency GET_STATE during heavy state sync and tab switching
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: High Concurrency GET_STATE stress test ---');
    try {
        const startTime = new Date('2026-11-08T11:00:00Z').getTime();
        const mock = new MockChromeMV3(startTime);
        mock.installGlobal();

        mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
        mock.tabsList = [
            { id: 10, url: 'https://reddit.com', active: true, windowId: 1 },
            { id: 20, url: 'https://news.ycombinator.com', active: false, windowId: 1 },
            { id: 30, url: 'https://youtube.com/watch?v=123', active: false, windowId: 1 }
        ];

        await mock.wakeWorker(BACKGROUND_PATH);

        // Fire 100 concurrent requests consisting of:
        // - 50 GET_STATE calls
        // - 25 tab activations
        // - 25 periodic alarms
        const promises = [];
        let stateResponses = [];

        for (let i = 0; i < 50; i++) {
            promises.push(
                mock.runtime.sendMessage({ action: 'GET_STATE' }).then(res => {
                    stateResponses.push(res);
                })
            );
            if (i % 2 === 0) {
                promises.push(mock.activateTab(i % 4 === 0 ? 10 : 20));
            }
            if (i % 5 === 0) {
                promises.push(mock.fireAlarm('frost_heartbeat'));
            }
        }

        await Promise.all(promises);

        console.log(`Received ${stateResponses.length} GET_STATE responses under heavy concurrent load.`);
        assert.equal(stateResponses.length, 50, 'All 50 GET_STATE requests must receive responses');

        for (const res of stateResponses) {
            assert.ok(res !== undefined && res !== null, 'Response must not be null/undefined');
            assert.equal(typeof res.remainingMs, 'number', 'remainingMs must be a number');
            assert.equal(typeof res.todayUsage, 'number', 'todayUsage must be a number');
            assert.ok(res.remainingMs >= 0, 'remainingMs must be >= 0');
            assert.ok(res.remainingMs <= 300000, 'remainingMs must be <= 5m allowance');
            assert.ok(res.todayUsage >= 0, 'todayUsage must be >= 0');
            assert.equal(res.remainingMs + res.todayUsage, 300000, 'remainingMs + todayUsage must equal TIMER_LIMIT_MS (300000)');
        }

        console.log('SUCCESS: All 50 concurrent GET_STATE responses were strictly consistent!');
        mock.uninstallGlobal();
    } catch (err) {
        console.error('Test 2 failed with error:', err);
        failures++;
    }

    // -------------------------------------------------------------------------
    // TEST 3: Cold startup with dirty marker and UNTRACKED blank tab
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Cold start with dirty marker & untracked tab ---');
    try {
        const startTime = new Date('2026-11-08T12:00:00Z').getTime();
        const mock = new MockChromeMV3(startTime);
        mock.installGlobal();

        await mock.storage.local.set({
            last_reset_date: '2026-11-08',
            today_usage: 25000,
            session_start_time: startTime - 400000,
            session_tab_id: 888
        });

        mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
        mock.tabsList = [
            { id: 1, url: 'chrome://newtab', active: true, windowId: 1 }
        ];

        await mock.wakeWorker(BACKGROUND_PATH);

        const state = await mock.storage.local.get();
        console.log(`State after cold start with newtab: today_usage = ${state.today_usage}`);
        assert.equal(state.today_usage, 25000, 'today_usage must remain exactly 25000');
        assert.equal(state.session_start_time, null, 'session_start_time must be null');
        assert.equal(state.session_tab_id, null, 'session_tab_id must be null');

        console.log('SUCCESS: Untracked tab cold start cleanly nullified session without inflating usage!');
        mock.uninstallGlobal();
    } catch (err) {
        console.error('Test 3 failed with error:', err);
        failures++;
    }

    // -------------------------------------------------------------------------
    // TEST 4: Dormancy wakeup during legitimate active tracking
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Dormancy wakeup during legitimate active tracking ---');
    try {
        const startTime = new Date('2026-11-08T13:00:00Z').getTime();
        const mock = new MockChromeMV3(startTime);
        mock.installGlobal();

        mock.windowsList = [{ id: 1, focused: true, state: 'normal' }];
        mock.tabsList = [
            { id: 42, url: 'https://reddit.com', active: true, windowId: 1 }
        ];

        // Worker wakes up, starts tracking tab 42
        await mock.wakeWorker(BACKGROUND_PATH);

        let state = await mock.storage.local.get();
        assert.equal(state.session_tab_id, 42, 'session_tab_id must be 42');
        assert.equal(state.session_start_time, startTime, 'session_start_time must be startTime');

        // Worker suspends (dormancy)
        mock.suspendWorker();

        // 30 seconds elapse while user is browsing tab 42
        mock.advanceClock(30000);

        // Alarm wakes worker
        await mock.wakeWorker(BACKGROUND_PATH, async () => {
            await mock.fireAlarm('frost_heartbeat');
        });

        state = await mock.storage.local.get();
        console.log(`State after 30s dormancy: today_usage = ${state.today_usage}`);
        // Usage should be 30000ms
        assert.equal(state.today_usage, 30000, `today_usage should be 30000ms, got ${state.today_usage}`);
        assert.equal(state.session_tab_id, 42, 'session_tab_id must still be 42');
        assert.equal(state.session_start_time, startTime + 30000, 'session_start_time should be reset to current time');

        console.log('SUCCESS: Dormancy wakeup during active browsing correctly accumulated 30s!');
        mock.uninstallGlobal();
    } catch (err) {
        console.error('Test 4 failed with error:', err);
        failures++;
    }

    console.log('\n' + '='.repeat(70));
    console.log(`Harness complete. Failures: ${failures}`);
    console.log('='.repeat(70));

    if (failures > 0) {
        process.exit(1);
    }
}

runTests();
