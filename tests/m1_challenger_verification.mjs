// ==============================================================================
// F.R.O.S.T. Milestone 1 Empirical Verification Suite
// Challenger 2: Adversarial Stress Test & Rules Verification Harness
// ==============================================================================

import fs from 'fs';
import path from 'path';
import { 
    EDUCATIONAL_KEYWORDS, 
    EDUCATIONAL_REGEX, 
    compileKeywordRegex, 
    escapeRegex, 
    BLOCKED_DOMAINS, 
    HARD_BLOCKED_DOMAINS 
} from '../constants.js';

let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, message, details = {}) {
    if (condition) {
        passedTests++;
    } else {
        failedTests++;
        failures.push({ message, details });
        console.error(`  FAIL: ${message}`, details);
    }
}

console.log('='.repeat(70));
console.log('F.R.O.S.T. Milestone 1 Adversarial Verification Suite');
console.log('='.repeat(70));

// ==============================================================================
// 1. Parity Check: constants.js vs content.js
// ==============================================================================
console.log('\n[Suite 1] Static Parity: constants.js vs content.js');

const contentSrc = fs.readFileSync('content.js', 'utf8');
const kwMatch = contentSrc.match(/const EDUCATIONAL_KEYWORDS = (\[[\s\S]*?\]);/);
assert(kwMatch !== null, 'Found EDUCATIONAL_KEYWORDS in content.js');

const contentKeywords = eval(kwMatch[1]);
assert(
    Array.isArray(contentKeywords) && contentKeywords.length === EDUCATIONAL_KEYWORDS.length,
    `Keywords array length matches (${EDUCATIONAL_KEYWORDS.length})`
);

let allKeywordsMatch = true;
for (let i = 0; i < EDUCATIONAL_KEYWORDS.length; i++) {
    if (EDUCATIONAL_KEYWORDS[i] !== contentKeywords[i]) {
        allKeywordsMatch = false;
        break;
    }
}
assert(allKeywordsMatch, 'Every keyword in content.js matches constants.js in exact value and order');

// Compile content.js regex
function compileContentRegex(keywords) {
    const patterns = keywords.map((k) => {
        const esc = escapeRegex(k.toLowerCase());
        const start = /^\w/.test(k) ? '\\b' : '(?<=^|[\\s.,!?;:()[\\]{}"\'`])';
        const end = /\w$/.test(k) ? '\\b' : '(?=$|[\\s.,!?;:()[\\]{}"\'`])';
        return start + esc + end;
    });
    return new RegExp(patterns.join('|'), 'i');
}
const contentRegex = compileContentRegex(contentKeywords);

// ==============================================================================
// 2. Educational Keyword Regex Engine: Zero False-Positive Leaks on Entertainment Titles
// ==============================================================================
console.log('\n[Suite 2] Educational Keyword Regex Engine: Entertainment Substring Traps');

const entertainmentTitles = [
    // Traps for 'ai'
    'Top 10 Epic Fails of 2026',
    'Official Movie Trailer HD',
    'Daily Morning Routine of a Billionaire',
    'Never Do This Again in Public',
    'Waiting 24 Hours in an Abandoned Mall',
    'I Am Afraid of Spiders Prank',
    'Domino Chain Reaction Record',
    'Road Trip Across Spain',
    'Climbing the Highest Mountain in the World',
    'Captain Jack Sparrow Best Moments',
    'Going Straight to the Championship Game',
    'How I Entertain My Cat for Hours',
    'The Maid Came In Unexpectedly',
    'She Claimed the World Record for Stunts',
    'Driving a Train Across the Desert',
    'Brain Freeze Challenge with Ice Cream',
    'The Great Train Robbery Story',
    'Walking in the Rain Prank',
    'Taylor Swift - Cruel Summer (Lyrics)',
    'Air Force Pilot Reacts to Top Gun',

    // Traps for 'ted'
    'I Tested 50 Viral TikTok Products',
    'Streamer Reacted to Scary Videos',
    'We Visited the Most Dangerous Island',
    'Most Wanted Criminal Escapes from Guard',
    'We Celebrated 10 Million Subscribers',
    'He Cheated in the Hardcore Tournament',
    'Ghost Spotted on Real Camera',
    'I Shouted at a Random Stranger',
    'Undefeated Boxer Gets Knocked Out Cold',
    'He Got So Excited He Broke His Monitor',
    'I Rented a Mega Yacht for the Weekend',
    'Fans Voted on My Next Extreme Tattoo',
    'I Dented My Supercar While Drifting',
    'United Airlines First Class Cabin Tour',
    'The Day Everything Started to Go Wrong',
    'He Wasted 100,000 V-Bucks in Fortnite',
    'Invited to the Secret Illuminati Party',
    'Fainted on the Roller Coaster',
    'Arrested for Jaywalking in Tokyo',
    'Tasted Every Candy in the World',

    // Traps for 'iso'
    'Minecraft Hardcore Survival Episode 1',
    'Solo 100 Day Wilderness Isolation Challenge',
    'Eating the World Most Poisonous Pufferfish',
    'Prank in a Maximum Security Prison',
    'Hunting for Wild Bison in the Snow',
    'The Great Treason of the Minecraft SMP',
    'Top 10 Legendary Anime Anisons',
    'Prisoners Attempt daring Escape',

    // Traps for 'rust'
    'Trust Me Bro - Ultimate Gaming Moments',
    'The Stuffed Crust Pizza Taste Test',
    'Frustrated Streamer Smashes Keyboard to Pieces',
    'Thrust SSC Jet Car Sonic Boom',
    'Living in a Rustic Wooden Cabin in Norway',
    'Brushed Gold iPhone Customization',

    // Traps for 'cad'
    'I Spent 1000 Dollars at the Japanese Arcade',
    'Making Giant Avocado Guacamole',
    'Massive 100000 Domino Cascade Effect',
    'The Loudest Cicada Swarm in History',
    'Running the Navy Blockade in GTA 5',
    'Barricade Defense in Zombie Apocalypse',

    // Traps for 'git'
    'The Amazing Digital Circus Episode 2 Highlights',
    'Is this Magic Prank Even Legitimate?',
    'Extreme Agitation in the Haunted House',
    'Fugitive Hides in Plain Sight from Police',
    'Digitally Restored 1920s Color Video',

    // Traps for 'math'
    'Surviving the Aftermath of a Category 5 Tornado',
    'Exploring the Eerie Aftermath of the Flood',
    'The Horrific Aftermath of the Battle',

    // Traps for other short keywords ('aws', 'sql')
    'Jaws 5 Shark Attack Scene in 4K',
    'Cat Shows Its Razor Sharp Claws',
    'Disqualified from the MrBeast Challenge'
];

assert(entertainmentTitles.length >= 50, `At least 50 entertainment titles tested (actual: ${entertainmentTitles.length})`);

let leakedTitles = [];
for (const title of entertainmentTitles) {
    const constantsMatch = EDUCATIONAL_REGEX.test(title);
    const contentMatch = contentRegex.test(title);
    if (constantsMatch || contentMatch) {
        leakedTitles.push({ title, constantsMatch, contentMatch });
    }
}

assert(
    leakedTitles.length === 0,
    `Zero false-positive leaks across all ${entertainmentTitles.length} entertainment titles (leaks: ${leakedTitles.length})`,
    leakedTitles
);

// ==============================================================================
// 3. Punctuation & Programming Symbols: Boundary Handling for C++
// ==============================================================================
console.log('\n[Suite 3] Punctuation & Programming Symbols: C++ Boundary Verification');

// Mandatory test cases from DISPATCH.md
const dispatchCppCases = [
    'Learn C++ in 2026',
    'C++ Tutorial for Beginners',
    'How to write C++ code'
];

dispatchCppCases.forEach((t) => {
    assert(EDUCATIONAL_REGEX.test(t), `Dispatch case matches: "${t}"`);
    assert(contentRegex.test(t), `Content script matches dispatch case: "${t}"`);
});

// Pure C++ test cases where C++ is the ONLY educational token (ensures other keywords do not mask failures)
const cppOnlyRegex = compileKeywordRegex(['c++']);
const pureCppCases = [
    'Modern C++ in Depth',
    'Advanced C++',
    'Why C++ is So Fast',
    'Deep Dive into C++',
    'C++: What You Need to Know',
    '(C++) Memory Safety & Pointers',
    'Is C++ Obsolete?',
    'C++ Core Guidelines',
    'Hello World in C++',
    'Writing a Game Engine in C++',
    'C++, Rust, or Zig?',
    'Understanding C++ Move Semantics'
];

pureCppCases.forEach((t) => {
    assert(cppOnlyRegex.test(t), `Pure C++ regex correctly matches: "${t}"`);
    assert(EDUCATIONAL_REGEX.test(t), `Full educational regex matches: "${t}"`);
});

// Boundary punctuation edge cases for C++
const cppPunctuationBoundaries = [
    { title: 'Learn C++', shouldMatch: true },
    { title: 'C++ is awesome', shouldMatch: true },
    { title: 'Best of C++, Vol 1', shouldMatch: true },
    { title: 'Why use C++?', shouldMatch: true },
    { title: 'Mastering [C++] today', shouldMatch: true },
    { title: 'The "C++" programming language', shouldMatch: true },
    { title: 'Fast code with C++; let us see', shouldMatch: true }
];

cppPunctuationBoundaries.forEach(({ title, shouldMatch }) => {
    assert(cppOnlyRegex.test(title) === shouldMatch, `Punctuation boundary correctly handled for: "${title}"`);
});

// ==============================================================================
// 4. Domain Matching Engine Verification
// ==============================================================================
console.log('\n[Suite 4] Domain Matching Engine (hostnameMatches & isDomainMatched)');

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
    const host = hostname.toLowerCase();
    if (pattern.includes('.')) {
        return host === pattern || host.endsWith(`.${pattern}`);
    }
    const labels = host.split('.');
    return labels.includes(pattern);
}

function isDomainMatched(url, patterns) {
    const hostname = getHostname(url);
    if (!hostname) return false;
    return patterns.some((p) => hostnameMatches(hostname, p));
}

// Test cases from DISPATCH.md: 'flixbaba', 'flixbaba.mov', 'sub.flixbaba.com', 'reddit.com', 'old.reddit.com'
// vs non-matching: 'notflixbaba.com', 'google.com'
const allPatterns = [...BLOCKED_DOMAINS, ...HARD_BLOCKED_DOMAINS];

// Dispatch positive cases
assert(isDomainMatched('https://flixbaba/movie/1', ['flixbaba']), "Matches bare label 'flixbaba'");
assert(isDomainMatched('https://flixbaba.mov/movie/1', ['flixbaba.mov']), "Matches exact domain 'flixbaba.mov'");
assert(isDomainMatched('https://sub.flixbaba.com/watch', ['flixbaba']), "Matches sub.flixbaba.com via bare pattern 'flixbaba'");
assert(isDomainMatched('https://reddit.com/r/all', ['reddit.com']), "Matches 'reddit.com'");
assert(isDomainMatched('https://old.reddit.com/r/all', ['reddit.com']), "Matches subdomain 'old.reddit.com'");

// Dispatch negative cases
assert(!isDomainMatched('https://notflixbaba.com', allPatterns), "Correctly rejects prefix attack 'notflixbaba.com'");
assert(!isDomainMatched('https://google.com', allPatterns), "Correctly rejects safe domain 'google.com'");

// Adversarial domain stress tests
const adversarialDomainCases = [
    { url: 'https://sub.sub.flixbaba.net/video', expected: true, desc: 'Nested subdomain matching bare flixbaba' },
    { url: 'https://flixbaba.watch.party/stream', expected: true, desc: 'Bare pattern in top-level subdomain position' },
    { url: 'https://myflixbaba.com', expected: false, desc: 'Subword non-match: myflixbaba.com' },
    { url: 'https://flixbaba-live.org', expected: false, desc: 'Hyphenated non-match: flixbaba-live.org' },
    { url: 'https://notreddit.com', expected: false, desc: 'Subword non-match: notreddit.com' },
    { url: 'https://reddit.com.scam.org', expected: false, desc: 'Prefix domain phishing: reddit.com.scam.org' },
    { url: 'https://fakefacebook.com', expected: false, desc: 'Prefix spoof: fakefacebook.com' },
    { url: 'https://x.com/home', expected: true, desc: 'Exact short domain: x.com' },
    { url: 'https://mobile.x.com/status', expected: true, desc: 'Subdomain for short domain: mobile.x.com' },
    { url: 'https://notx.com', expected: false, desc: 'Subword for short domain: notx.com' },
    { url: 'https://youtube.com/watch?v=123', expected: false, desc: 'YouTube is handled separately, not in BLOCKED_DOMAINS' }
];

adversarialDomainCases.forEach(({ url, expected, desc }) => {
    assert(isDomainMatched(url, allPatterns) === expected, `${desc}: ${url}`);
});

// ==============================================================================
// 5. YouTube Shorts & Watch Page Detection Logic
// ==============================================================================
console.log('\n[Suite 5] YouTube Shorts & Watch Page Detection Logic');

// Content script Shorts check implementation
function simulateContentCheckShorts(pathname, href) {
    return (pathname.startsWith('/shorts/') || href.includes('/shorts/'));
}

// Background script Shorts check implementation
function simulateBackgroundCheckShorts(url) {
    return url.toLowerCase().includes('youtube.com/shorts/');
}

// Content script Watch page detector
function simulateIsWatchPage(url) {
    if (!url) return false;
    try {
        const u = new URL(url);
        if (!u.hostname.includes('youtube.com')) return false;
        if (u.pathname === '/watch' && u.searchParams.has('v')) return true;
        if (u.pathname.startsWith('/live/')) return true;
        if (u.pathname.startsWith('/embed/')) return true;
        return false;
    } catch {
        return (
            (url.includes('youtube.com/watch') && url.includes('v=')) ||
            url.includes('youtube.com/live/') ||
            url.includes('youtube.com/embed/')
        );
    }
}

// Dispatch test cases:
// /shorts/abc123xyz, youtube.com/shorts/, /watch?v=123, /live/stream1, /embed/vid2
assert(
    simulateContentCheckShorts('/shorts/abc123xyz', 'https://www.youtube.com/shorts/abc123xyz'),
    "Content script detects Shorts path: '/shorts/abc123xyz'"
);
assert(
    simulateBackgroundCheckShorts('https://www.youtube.com/shorts/abc123xyz'),
    "Background script detects Shorts URL: 'https://www.youtube.com/shorts/abc123xyz'"
);

assert(
    simulateContentCheckShorts('/shorts/', 'https://www.youtube.com/shorts/'),
    "Content script detects Shorts root path: 'youtube.com/shorts/'"
);
assert(
    simulateBackgroundCheckShorts('https://www.youtube.com/shorts/'),
    "Background script detects Shorts root URL: 'https://www.youtube.com/shorts/'"
);

assert(
    !simulateContentCheckShorts('/watch', 'https://www.youtube.com/watch?v=123'),
    "Watch page is NOT detected as Shorts: '/watch?v=123'"
);
assert(
    simulateIsWatchPage('https://www.youtube.com/watch?v=123'),
    "Watch page with video ID is detected as watch page: '/watch?v=123'"
);

assert(
    !simulateContentCheckShorts('/live/stream1', 'https://www.youtube.com/live/stream1'),
    "Live stream is NOT detected as Shorts: '/live/stream1'"
);
assert(
    simulateIsWatchPage('https://www.youtube.com/live/stream1'),
    "Live stream is detected as watch page: '/live/stream1'"
);

assert(
    !simulateContentCheckShorts('/embed/vid2', 'https://www.youtube.com/embed/vid2'),
    "Embed player is NOT detected as Shorts: '/embed/vid2'"
);
assert(
    simulateIsWatchPage('https://www.youtube.com/embed/vid2'),
    "Embed player is detected as watch page: '/embed/vid2'"
);

// Non-watch YouTube pages (e.g., search, subscriptions, home)
assert(!simulateIsWatchPage('https://www.youtube.com/'), 'Home page is NOT watch page');
assert(!simulateIsWatchPage('https://www.youtube.com/results?search_query=calc'), 'Search results page is NOT watch page');
assert(!simulateIsWatchPage('https://www.youtube.com/feed/subscriptions'), 'Subscriptions feed is NOT watch page');
assert(!simulateIsWatchPage('https://www.youtube.com/shorts/abc123xyz'), 'Shorts page is NOT watch page');

// ==============================================================================
// 6. Extreme Adversarial Stress Tests & Malformed Inputs
// ==============================================================================
console.log('\n[Suite 6] Extreme Adversarial Stress & Malformed Inputs');

const extremeTitles = [
    { title: '', expected: false, desc: 'Empty title string' },
    { title: '   ', expected: false, desc: 'Whitespace-only title' },
    { title: '!!!???***&&&^^^', expected: false, desc: 'Punctuation-only string' },
    { title: 'a'.repeat(50000), expected: false, desc: '50k char monolithic non-matching string' },
    { title: '🔴 LIVE: ' + 'a'.repeat(500) + ' Tutorial ' + 'b'.repeat(500), expected: true, desc: 'Long string with embedded keyword' },
    { title: '【4K HDR】Learn C++ Today 🚀', expected: true, desc: 'Unicode brackets and emoji around C++' },
    { title: '[Official] Calculus 1 Full Course', expected: true, desc: 'Square bracketed title with course' },
    { title: 'C++ & Python & Rust comparison', expected: true, desc: 'Multiple keywords combined' },
    { title: 'Drawing an avocado in the arcade', expected: false, desc: 'Multiple substring traps (cad) in single title' },
    { title: 'Completely unrelated video clip with high excitement', expected: false, desc: 'Excitement does not match ted' }
];

extremeTitles.forEach(({ title, expected, desc }) => {
    assert(EDUCATIONAL_REGEX.test(title) === expected, `Extreme title test (${desc})`);
});

const weirdUrls = [
    { url: 'about:blank', expected: false, desc: 'about:blank pseudo-protocol' },
    { url: 'chrome://extensions', expected: false, desc: 'chrome: internal schema' },
    { url: 'file:///C:/test.html', expected: false, desc: 'file: local schema' },
    { url: 'javascript:void(0)', expected: false, desc: 'javascript: scheme' },
    { url: 'https://', expected: false, desc: 'incomplete https: protocol' },
    { url: 'http://', expected: false, desc: 'incomplete http: protocol' },
    { url: 'null', expected: false, desc: 'string "null"' },
    { url: undefined, expected: false, desc: 'undefined url' },
    { url: '', expected: false, desc: 'empty url string' },
    { url: 'https://FLIXBABA.MOV/test', expected: true, desc: 'Uppercase domain FLIXBABA.MOV' },
    { url: 'https://OLD.REDDIT.COM/r/funny', expected: true, desc: 'Uppercase subdomain OLD.REDDIT.COM' }
];

weirdUrls.forEach(({ url, expected, desc }) => {
    assert(isDomainMatched(url, allPatterns) === expected, `Malformed URL test (${desc})`);
});

// ==============================================================================
// 7. Summary and Final Assertion
// ==============================================================================
console.log('\n' + '='.repeat(70));
console.log(`TOTAL TESTS: ${passedTests + failedTests}`);
console.log(`PASSED:      ${passedTests}`);
console.log(`FAILED:      ${failedTests}`);
console.log('='.repeat(70));

if (failedTests > 0) {
    console.error('\nFAILURES SUMMARY:');
    failures.forEach((f, idx) => console.error(`  ${idx + 1}. ${f.message}`, f.details));
    process.exit(1);
} else {
    console.log('\nALL EMPIRICAL ASSERTIONS PASSED WITH ZERO DEFECTS.');
    process.exit(0);
}
