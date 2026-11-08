// ==============================================================================
// F.R.O.S.T. Milestone 1 Iteration 2 Challenger 2 Stress & Verification Suite
// ==============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { 
    EDUCATIONAL_KEYWORDS, 
    EDUCATIONAL_REGEX, 
    compileKeywordRegex, 
    escapeRegex 
} from '../constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('='.repeat(75));
console.log('F.R.O.S.T. Challenger 2 Empirical Stress Test Harness (M1 Iteration 2)');
console.log('='.repeat(75));

let totalAsserts = 0;
let passedAsserts = 0;
let failedAsserts = 0;
const failureDetails = [];

function check(condition, desc, extra = null) {
    totalAsserts++;
    if (condition) {
        passedAsserts++;
    } else {
        failedAsserts++;
        failureDetails.push({ desc, extra });
        console.error(`  FAIL: ${desc}`);
        if (extra) console.error('        Details:', extra);
    }
}

// ==============================================================================
// SUITE 1: Extraction & Parity of Regex Engines (constants.js vs content.js)
// ==============================================================================
console.log('\n[Suite 1] Extraction & Parity of Regex Engines');

const contentCode = fs.readFileSync(path.resolve(__dirname, '../content.js'), 'utf8');

// Dynamically extract compileKeywordRegex implementation from content.js
const compileFuncMatch = contentCode.match(/function compileKeywordRegex\(keywords\)[\s\S]*?\n\}/);
check(compileFuncMatch !== null, 'compileKeywordRegex extracted from content.js');

// Dynamically extract EDUCATIONAL_KEYWORDS from content.js
const keywordsMatch = contentCode.match(/const EDUCATIONAL_KEYWORDS = (\[[\s\S]*?\]);/);
check(keywordsMatch !== null, 'EDUCATIONAL_KEYWORDS extracted from content.js');

const contentKeywords = eval(keywordsMatch[1]);
check(Array.isArray(contentKeywords), 'contentKeywords is a valid array');
check(contentKeywords.length === EDUCATIONAL_KEYWORDS.length, 
    `Keyword count parity: ${contentKeywords.length} === ${EDUCATIONAL_KEYWORDS.length}`);

// Build content.js regex by evaluating extracted code
const contentCompileKeywordRegex = new Function('escapeRegex', `
    ${compileFuncMatch[0]}
    return compileKeywordRegex;
`)(escapeRegex);

const contentEducationalRegex = contentCompileKeywordRegex(contentKeywords);
check(contentEducationalRegex instanceof RegExp, 'Successfully compiled content.js regex directly from source');

// Verify exact lookaround boundary tokens in content.js source code
check(
    contentCode.includes("const start = /^\\w/.test(k) ? '\\\\b' : '(?<=^|[\\\\s.,!?;:()[\\\\]{}\"\\'`\\\\/-])';"),
    'content.js start boundary includes \\/- delimiters'
);
check(
    contentCode.includes("const end = /\\w$/.test(k) ? '\\\\b' : '(?=$|[\\\\s.,!?;:()[\\\\]{}\"\\'`\\\\/-])';"),
    'content.js end boundary includes \\/- delimiters'
);

// ==============================================================================
// SUITE 2: C++ Delimiter Matrix & Edge Case Stress Testing
// ==============================================================================
console.log('\n[Suite 2] C++ Delimiter Matrix & Edge Case Stress Testing');

// 2.1 Required cases from DISPATCH
const dispatchCases = [
    { title: 'C++-based', expected: true },
    { title: 'C++/CLI', expected: true },
    { title: 'Modern C++/WinRT', expected: true },
    { title: 'Learn C++', expected: true }
];

dispatchCases.forEach(({ title, expected }) => {
    const constResult = EDUCATIONAL_REGEX.test(title);
    const contentResult = contentEducationalRegex.test(title);
    check(constResult === expected, `Dispatch case constants.js: "${title}" -> ${expected}`);
    check(contentResult === expected, `Dispatch case content.js: "${title}" -> ${expected}`);
});

// 2.2 Pure C++ Regex Isolation (no interference from other keywords)
const pureCppConstRegex = compileKeywordRegex(['c++']);
const pureCppContentRegex = contentCompileKeywordRegex(['c++']);

const validCppBoundaryCases = [
    // Standalone / Line boundaries
    'C++',
    'c++',
    '  C++  ',
    '\nC++\n',
    '\tC++\t',

    // Hyphen delimiters
    'C++-based architecture',
    'Modern-C++-guide',
    'non-C++-developer',
    'C++-2026',
    'C++-standard',

    // Slash delimiters
    'C++/CLI programming',
    'Modern C++/WinRT',
    'C++/Win32',
    'Win32/C++',
    'native/C++/interop',

    // Standard punctuation
    'Learn C++, and succeed',
    'What is C++?',
    'Awesome C++!',
    'C++: The Complete Reference',
    'Code in C++; see results',
    'Hello, C++.',

    // Bracket delimiters
    '(C++) in depth',
    '[C++] quick guide',
    '{C++} cheat sheet',

    // Quote delimiters
    '"C++" is powerful',
    '\'C++\' language',
    '`C++` syntax'
];

validCppBoundaryCases.forEach((title) => {
    const constRes = pureCppConstRegex.test(title);
    const contentRes = pureCppContentRegex.test(title);
    check(constRes === true, `Valid C++ boundary (constants.js): "${title}"`);
    check(contentRes === true, `Valid C++ boundary (content.js): "${title}"`);
});

// 2.3 Adversarial C++ Non-Matching Traps (must NOT match pure C++ regex)
const invalidCppTraps = [
    { title: 'abc++', reason: 'Preceding word character (no boundary)' },
    { title: '123c++', reason: 'Preceding digit character (no boundary)' },
    { title: '_c++', reason: 'Preceding underscore (word character)' },
    { title: 'c+++', reason: 'Trailing non-delimiter symbol +' },
    { title: 'c++xyz', reason: 'Trailing word characters (no boundary)' },
    { title: 'c++_test', reason: 'Trailing underscore' }
];

invalidCppTraps.forEach(({ title, reason }) => {
    const constRes = pureCppConstRegex.test(title);
    const contentRes = pureCppContentRegex.test(title);
    check(constRes === false, `Adversarial C++ rejected (constants.js): "${title}" [${reason}]`);
    check(contentRes === false, `Adversarial C++ rejected (content.js): "${title}" [${reason}]`);
});

// ==============================================================================
// SUITE 3: 71 Entertainment False-Positive Trap Titles Verification
// ==============================================================================
console.log('\n[Suite 3] 71 Entertainment False-Positive Trap Titles Verification');

// Extract the 71 entertainment titles from tests/m1_challenger_verification.mjs
const m1ChallengerCode = fs.readFileSync(path.resolve(__dirname, 'm1_challenger_verification.mjs'), 'utf8');
const entTitlesMatch = m1ChallengerCode.match(/const entertainmentTitles = (\[[\s\S]*?\]);/);
check(entTitlesMatch !== null, 'Extracted 71 entertainment titles from m1_challenger_verification.mjs');

const entertainmentTitles = eval(entTitlesMatch[1]);
check(entertainmentTitles.length === 71, `Exact count of 71 entertainment trap titles verified (${entertainmentTitles.length})`);

let entFailuresConst = 0;
let entFailuresContent = 0;

entertainmentTitles.forEach((title, idx) => {
    const constRes = EDUCATIONAL_REGEX.test(title);
    const contentRes = contentEducationalRegex.test(title);
    if (constRes) {
        entFailuresConst++;
        console.error(`  LEAK in constants.js [#${idx + 1}]: "${title}"`);
    }
    if (contentRes) {
        entFailuresContent++;
        console.error(`  LEAK in content.js [#${idx + 1}]: "${title}"`);
    }
});

check(entFailuresConst === 0, `All 71 entertainment trap titles rejected by constants.js (${entFailuresConst} leaks)`);
check(entFailuresContent === 0, `All 71 entertainment trap titles rejected by content.js (${entFailuresContent} leaks)`);

// Additional 10 adversarial pop-culture & clickbait traps
const extraEntertainmentTraps = [
    'Top 10 Minecraft YouTuber Dramas',
    'Taylor Swift - Karma (Official Music Video)',
    'MrBeast Survived 7 Days in an Abandoned City',
    'I Built a Secret Room Behind My Bookshelf',
    'GTA 6 Leaked Map and Gameplay Analysis',
    'Gordon Ramsay Roasts Terrible Chefs Compilation',
    'World Record Domino Pyramid Collapse',
    'Reacting to Cringey TikToks for 1 Hour',
    'Sidemen Hide and Seek in a Giant Stadium',
    'Unboxing the World Most Expensive Mystery Box'
];

extraEntertainmentTraps.forEach((title) => {
    check(EDUCATIONAL_REGEX.test(title) === false, `Extra entertainment trap rejected (constants.js): "${title}"`);
    check(contentEducationalRegex.test(title) === false, `Extra entertainment trap rejected (content.js): "${title}"`);
});

// ==============================================================================
// SUITE 4: YouTube SPA Navigation & Staggered Hydration Debounce Simulation
// ==============================================================================
console.log('\n[Suite 4] YouTube SPA Staggered Debounce Execution Simulation');

class SimulatedYouTubeSPAContentScript {
    constructor() {
        this.lastCheckTime = 0;
        this.lastCheckedUrl = 'https://www.youtube.com/';
        this.currentUrl = 'https://www.youtube.com/';
        this.currentTitle = '';
        this.messagesSent = [];
        this.mediaPaused = false;
        this.currentTime = 10000;
        this.timerQueue = [];
    }

    now() {
        return this.currentTime;
    }

    setTimeout(fn, delay) {
        const id = this.timerQueue.length + 1;
        this.timerQueue.push({ id, fn, triggerAt: this.currentTime + delay });
        return id;
    }

    advanceClock(ms) {
        this.currentTime += ms;
        // Run any due timers
        const due = this.timerQueue.filter(t => t.triggerAt <= this.currentTime);
        this.timerQueue = this.timerQueue.filter(t => t.triggerAt > this.currentTime);
        for (const t of due) {
            t.fn();
        }
    }

    isWatchPage(url) {
        return url.includes('/watch?v=') || url.includes('/live/');
    }

    checkShorts() {
        if (this.currentUrl.includes('/shorts/')) {
            this.safeSendMessage({ action: 'redirect' });
            return true;
        }
        return false;
    }

    pauseAndBlankMedia() {
        this.mediaPaused = true;
    }

    safeSendMessage(msg) {
        this.messagesSent.push({ time: this.currentTime, msg });
    }

    checkYouTubeTitle(force = false) {
        if (this.checkShorts()) return;
        if (!this.isWatchPage(this.currentUrl)) return;

        const title = this.currentTitle;
        if (!title || title.length === 0) return;

        const now = this.now();
        if (!force && now - this.lastCheckTime < 1000) return;
        this.lastCheckTime = now;

        const isEducational = EDUCATIONAL_REGEX.test(title);
        if (!isEducational) {
            this.pauseAndBlankMedia();
            this.safeSendMessage({ action: 'redirect' });
        }
    }

    onPossibleNavigation(newUrl) {
        this.currentUrl = newUrl;
        if (this.checkShorts()) return;

        if (this.currentUrl !== this.lastCheckedUrl) {
            this.lastCheckedUrl = this.currentUrl;
            this.lastCheckTime = 0;
            this.checkYouTubeTitle(true);
            this.setTimeout(() => this.checkYouTubeTitle(true), 250);
            this.setTimeout(() => this.checkYouTubeTitle(true), 600);
            this.setTimeout(() => this.checkYouTubeTitle(true), 1200);
        } else {
            this.checkYouTubeTitle(false);
        }
    }
}

// 4.1 Test: DOM hydration delay of 250ms on non-educational video
{
    const spa = new SimulatedYouTubeSPAContentScript();
    // Initially on an educational video
    spa.currentUrl = 'https://www.youtube.com/watch?v=edu123';
    spa.lastCheckedUrl = spa.currentUrl;
    spa.currentTitle = 'Learn C++ Programming Masterclass';
    spa.checkYouTubeTitle(true);
    check(spa.messagesSent.length === 0, 'Educational video allowed on initial load');

    // User navigates via SPA to an entertainment video
    spa.advanceClock(500); // 500ms later
    spa.currentTitle = 'Learn C++ Programming Masterclass'; // DOM still has stale title at t=0
    spa.onPossibleNavigation('https://www.youtube.com/watch?v=ent999');
    check(spa.messagesSent.length === 0, 'No redirect at t=0 because DOM still has old title');

    // At 200ms, YouTube SPA DOM mutates and updates the title to the new entertainment video
    spa.advanceClock(200);
    spa.currentTitle = 'Top 10 Epic Fails of 2026';

    // At 250ms, the staggered timeout fires and evaluates the hydrated title
    spa.advanceClock(50);
    check(spa.mediaPaused === true, 'Media paused at 250ms when new title hydrated');
    check(spa.messagesSent.length === 1, 'Redirect message sent at 250ms despite < 1000ms debounce gap');
    check(spa.messagesSent[0]?.msg?.action === 'redirect', 'Redirect action confirmed');
}

// 4.2 Test: DOM hydration delay of 600ms on non-educational video
{
    const spa = new SimulatedYouTubeSPAContentScript();
    spa.currentUrl = 'https://www.youtube.com/watch?v=edu123';
    spa.lastCheckedUrl = spa.currentUrl;
    spa.currentTitle = 'Python Data Structures';
    spa.checkYouTubeTitle(true);

    spa.advanceClock(2000);
    // Navigate to entertainment video where title takes 600ms to hydrate
    spa.currentTitle = ''; // Title is empty during initial load
    spa.onPossibleNavigation('https://www.youtube.com/watch?v=ent777');
    check(spa.messagesSent.length === 0, 'No redirect at t=0 on empty title');

    spa.advanceClock(250); // t=250ms: title still empty
    check(spa.messagesSent.length === 0, 'No redirect at t=250ms on empty title');

    // Title appears just before 600ms
    spa.currentTitle = 'Unboxing the World Most Expensive Mystery Box';
    spa.advanceClock(350); // reaches 600ms
    check(spa.mediaPaused === true, 'Media paused at 600ms timer');
    check(spa.messagesSent.length === 1, 'Redirect message sent at 600ms check (force=true bypassed debounce)');
}

// 4.3 Test: Repeated DOM mutations on same educational video are debounced
{
    const spa = new SimulatedYouTubeSPAContentScript();
    spa.currentUrl = 'https://www.youtube.com/watch?v=edu456';
    spa.lastCheckedUrl = spa.currentUrl;
    spa.currentTitle = 'Algorithms and Data Structures Tutorial';
    spa.checkYouTubeTitle(true);

    // Fire 50 rapid mutation events within 100ms
    for (let i = 0; i < 50; i++) {
        spa.advanceClock(2);
        spa.onPossibleNavigation(spa.currentUrl); // same URL, force = false
    }

    check(spa.messagesSent.length === 0, 'Zero messages sent on educational video during rapid mutations');
    check(spa.lastCheckTime === 10000, 'Debounced calls did not advance lastCheckTime');
}

// 4.4 Test: DOM mutation before 250ms timer with initially empty title catches entertainment video
{
    const spa = new SimulatedYouTubeSPAContentScript();
    spa.currentUrl = 'https://www.youtube.com/watch?v=edu123';
    spa.lastCheckedUrl = spa.currentUrl;
    spa.currentTitle = 'Calculus III Lecture';
    spa.checkYouTubeTitle(true);

    spa.advanceClock(2000); // t=12000
    // Navigate to new entertainment video, initially empty title
    spa.currentTitle = '';
    spa.onPossibleNavigation('https://www.youtube.com/watch?v=ent555');
    check(spa.messagesSent.length === 0, 'No redirect at t=0 with empty title');
    check(spa.lastCheckTime === 0, 'lastCheckTime remains 0 when title was empty');

    // At t=120ms, DOM mutation renders the entertainment title
    spa.advanceClock(120);
    spa.currentTitle = 'Going Straight to the Championship Game';
    // MutationObserver fires on the same URL with force=false
    spa.onPossibleNavigation('https://www.youtube.com/watch?v=ent555');
    check(spa.mediaPaused === true, 'Media paused immediately at 120ms mutation');
    check(spa.messagesSent.length === 1, 'Redirect message sent at 120ms because lastCheckTime was 0 (now - 0 >= 1000)');
}

// 4.5 Test: Immediate Shorts redirection in SPA
{
    const spa = new SimulatedYouTubeSPAContentScript();
    spa.onPossibleNavigation('https://www.youtube.com/shorts/funnycat123');
    check(spa.messagesSent.length === 1, 'Shorts URL triggers immediate redirect');
    check(spa.messagesSent[0].msg.action === 'redirect', 'Shorts redirect action verified');
}

// ==============================================================================
// SUITE 5: ReDoS & Catastrophic Backtracking Stress Testing
// ==============================================================================
console.log('\n[Suite 5] ReDoS & Catastrophic Backtracking Stress Testing');

const adversarialPayloads = [
    'c++'.repeat(2000),
    ('c++/' + '-'.repeat(100)).repeat(100),
    '/' + '/'.repeat(10000) + 'c++',
    'c++' + ' '.repeat(10000),
    'ai '.repeat(5000),
    'ted-'.repeat(5000),
    '['.repeat(5000) + 'c++' + ']'.repeat(5000)
];

adversarialPayloads.forEach((payload, idx) => {
    const t0 = performance.now();
    const resConst = EDUCATIONAL_REGEX.test(payload);
    const tConst = performance.now() - t0;

    const t1 = performance.now();
    const resContent = contentEducationalRegex.test(payload);
    const tContent = performance.now() - t1;

    check(tConst < 100, `ReDoS payload #${idx + 1} constants.js completed in ${tConst.toFixed(2)}ms (< 100ms)`);
    check(tContent < 100, `ReDoS payload #${idx + 1} content.js completed in ${tContent.toFixed(2)}ms (< 100ms)`);
});

// ==============================================================================
// SUMMARY & VERDICT
// ==============================================================================
console.log('\n' + '='.repeat(75));
console.log(`TOTAL EMPIRICAL CHECKS: ${totalAsserts}`);
console.log(`PASSED:                 ${passedAsserts}`);
console.log(`FAILED:                 ${failedAsserts}`);
console.log('='.repeat(75));

if (failedAsserts > 0) {
    console.error(`\nFAILED CHECKS COUNT: ${failedAsserts}`);
    process.exit(1);
} else {
    console.log('\nALL EMPIRICAL CHALLENGER ASSERTIONS PASSED WITH ZERO DEFECTS.');
    process.exit(0);
}
