import assert from 'node:assert/strict';
import { MockChromeMV3 } from './mocks/mockChrome.js';

console.log('======================================================================');
console.log('F.R.O.S.T. Incognito Shield & Extension-Controlled Blocking Tests');
console.log('======================================================================\n');

const mock = new MockChromeMV3(new Date('2026-11-08T12:00:00Z').getTime());
mock.installGlobal();

// Add windows.getAll & windows.remove support to mock if missing
if (!chrome.windows.getAll) {
    chrome.windows.getAll = async () => mock.windowsList;
}
if (!chrome.windows.remove) {
    chrome.windows.remove = async (id) => {
        mock.windowsList = mock.windowsList.filter(w => w.id !== id);
    };
}
if (!chrome.windows.get) {
    chrome.windows.get = async (id) => mock.windowsList.find(w => w.id === id) || null;
}

// Add chrome.extension.isAllowedIncognitoAccess mock
let mockIncognitoAllowed = false;
chrome.extension = {
    isAllowedIncognitoAccess(callback) {
        callback(mockIncognitoAllowed);
    }
};

// Import background.js logic
await import('../background.js');

console.log('--- Test 1: Incognito Tab Purge ---');
mock.tabsList = [
    { id: 101, url: 'https://www.google.com', incognito: true, active: true, windowId: 2 },
    { id: 102, url: 'https://github.com', incognito: false, active: true, windowId: 1 }
];

// Dispatch tabs.onUpdated for incognito tab
for (const listener of mock.tabsUpdatedListeners) {
    listener(101, { status: 'loading' }, mock.tabsList[0]);
}
assert.equal(mock.callLog.tabsRemoved.some(r => r.tabId === 101), true, 'Incognito tab must be removed on update!');
console.log('PASS: Incognito tab immediately removed when updated.');

console.log('\n--- Test 2: GET_STATE reflects isAllowedIncognito state ---');
mockIncognitoAllowed = false;
let stateResponse = null;
for (const listener of mock.runtimeMessageListeners) {
    listener({ action: 'GET_STATE' }, {}, (res) => {
        stateResponse = res;
    });
}
await new Promise(r => setTimeout(r, 20));
assert.equal(stateResponse.isAllowedIncognito, false, 'GET_STATE must return isAllowedIncognito = false');
console.log('PASS: GET_STATE returns isAllowedIncognito = false when not granted.');

mockIncognitoAllowed = true;
stateResponse = null;
for (const listener of mock.runtimeMessageListeners) {
    listener({ action: 'GET_STATE' }, {}, (res) => {
        stateResponse = res;
    });
}
await new Promise(r => setTimeout(r, 20));
assert.equal(stateResponse.isAllowedIncognito, true, 'GET_STATE must return isAllowedIncognito = true');
console.log('PASS: GET_STATE returns isAllowedIncognito = true when granted.');

console.log('\n======================================================================');
console.log('All Incognito extension-level tests passed successfully!');
console.log('======================================================================');
mock.uninstallGlobal();
