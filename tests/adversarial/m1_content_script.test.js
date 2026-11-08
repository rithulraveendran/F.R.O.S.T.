// ==============================================================================
// Milestone 1 Content Script Verification Test Suite
// ==============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const contentSrc = fs.readFileSync(path.resolve(__dirname, '../../content.js'), 'utf8');

const results = [];
function test(name, fn) {
    try {
        fn();
        results.push({ name, passed: true });
        console.log(`  PASS: ${name}`);
    } catch (err) {
        results.push({ name, passed: false, error: err });
        console.error(`  FAIL: ${name}`);
        console.error(err);
    }
}

console.log('\n=== RUNNING M1 CONTENT SCRIPT VERIFICATION SUITE ===\n');

// Test 1: Shorts CSS rules injection
test('Content 1: CSS stylesheet contains complete Shorts and preview suppression selectors', () => {
    assert.ok(contentSrc.includes('a[href*="/shorts/"]'), 'Must suppress /shorts/ links');
    assert.ok(contentSrc.includes('ytd-reel-shelf-renderer'), 'Must suppress reel shelves');
    assert.ok(contentSrc.includes('ytd-rich-shelf-renderer[is-shorts]'), 'Must suppress rich shelf shorts');
    assert.ok(contentSrc.includes('#inline-preview-player'), 'Must suppress inline preview players');
    assert.ok(contentSrc.includes('display: none !important'), 'Must enforce display none');
});

// Test 2: Watch page detection regex / URL logic
test('Content 2: isWatchPage identifies standard, live, and embedded YouTube streams', () => {
    // Extract isWatchPage function from content.js or evaluate in sandboxed scope
    const isWatchPageMatch = contentSrc.match(/function isWatchPage\(url\) \{([\s\S]*?)\n\}/);
    assert.ok(isWatchPageMatch, 'isWatchPage function must exist in content.js');

    const isWatchPage = new Function('url', isWatchPageMatch[1]);

    assert.equal(isWatchPage('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true);
    assert.equal(isWatchPage('https://www.youtube.com/live/xyz123'), true);
    assert.equal(isWatchPage('https://www.youtube.com/embed/abc456'), true);
    assert.equal(isWatchPage('https://www.youtube.com/feed/subscriptions'), false);
    assert.equal(isWatchPage('https://www.youtube.com/'), false);
    assert.equal(isWatchPage('https://www.google.com/watch?v=123'), false);
});

// Test 3: getCleanDocumentTitle removes badge counts and brand suffixes
test('Content 3: getCleanDocumentTitle strips notification count and brand suffix', () => {
    const getCleanTitleMatch = contentSrc.match(/function getCleanDocumentTitle\(\) \{([\s\S]*?)\n\}/);
    assert.ok(getCleanTitleMatch, 'getCleanDocumentTitle function must exist');

    function evalCleanTitle(docTitle) {
        const fakeDocument = { title: docTitle };
        const fn = new Function('document', getCleanTitleMatch[1]);
        return fn(fakeDocument);
    }

    assert.equal(evalCleanTitle('(3) Learn C++ Fast - YouTube'), 'Learn C++ Fast');
    assert.equal(evalCleanTitle('(99) MIT 18.06 Linear Algebra - YouTube'), 'MIT 18.06 Linear Algebra');
    assert.equal(evalCleanTitle('Standard Title Without Badge - YouTube'), 'Standard Title Without Badge');
    assert.equal(evalCleanTitle('Only YouTube - YouTube'), 'Only YouTube');
});

// Test 4: Check Shorts instant redirection trigger
test('Content 4: checkShorts detects pathname or href containing /shorts/', () => {
    const checkShortsMatch = contentSrc.match(/function checkShorts\(\) \{([\s\S]*?)\n\}/);
    assert.ok(checkShortsMatch, 'checkShorts function must exist');

    let paused = false;
    let sentMessage = null;

    function evalCheckShorts(pathname, href) {
        paused = false;
        sentMessage = null;
        const fakeWindow = { location: { pathname, href } };
        const fakePauseAndBlankMedia = () => { paused = true; };
        const fakeSafeSendMessage = (msg) => { sentMessage = msg; };

        const fn = new Function('window', 'pauseAndBlankMedia', 'safeSendMessage', checkShortsMatch[1]);
        return fn(fakeWindow, fakePauseAndBlankMedia, fakeSafeSendMessage);
    }

    const res1 = evalCheckShorts('/shorts/abc123xyz', 'https://www.youtube.com/shorts/abc123xyz');
    assert.equal(res1, true, 'Must return true for shorts path');
    assert.equal(paused, true, 'Must pause and blank media on Shorts');
    assert.deepEqual(sentMessage, { action: 'redirect' }, 'Must send redirect action');

    const res2 = evalCheckShorts('/watch', 'https://www.youtube.com/watch?v=123');
    assert.equal(res2, false, 'Must return false for regular watch page');
});

console.log('\n=== CONTENT SCRIPT SUITE COMPLETE ===');
const passedCount = results.filter(r => r.passed).length;
const failedCount = results.filter(r => !r.passed).length;
console.log(`Results: ${passedCount} passed, ${failedCount} failed of ${results.length} tests.`);

if (failedCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
