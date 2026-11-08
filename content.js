// ==============================================================================
// F.R.O.S.T. Content Script (YouTube Strict Academic Surveillance & Shorts Elimination)
// ==============================================================================

const EDUCATIONAL_KEYWORDS = [
    // General Educational Terms
    'tutorial', 'course', 'lecture', 'science', 'math', 'coding', 'study', 'university', 'college', 'exam', 
    'preparation', 'guide', 'how to', 'documentary', 'mathematics', 'algebra', 'calculus', 'geometry', 
    'statistics', 'programming', 'academy', 'khan', 'coursera', 'edx', 'udemy', 'pluralsight', 
    'linkedin learning', 'ted', 'crash course', 'veritasium', 'vsauce', '3blue1brown', 'smarter everyday', 
    'mark rober', 'engineering explained', 'computerphile', 'numberphile', 'periodic videos', 'minutephysics', 
    'minuteearth', 'asapscience', 'scishow', 'kurzgesagt', 'educational', 'lesson', 'learn', 'instruction', 
    'seminar', 'workshop', 'masterclass', 'bootcamp', 'coding challenge', 'algorithms', 'data structures',

    // Core Engineering & Science
    'engineering', 'physics', 'chemistry', 'biology', 'electronics', 'circuits', 'mechanics', 'thermodynamics', 
    'robotics', 'mechatronics', 'aerospace', 'civil', 'mechanical', 'electrical', 'chemical', 'software',
    'structural', 'material science', 'nanotechnology', 'biomedical', 'semiconductor', 'power systems',
    'control systems', 'signal processing', 'fluid mechanics', 'solid mechanics', 'quantum',

    // Computer Science & Software
    'python', 'javascript', 'java', 'c++', 'rust', 'sql', 'web development', 'data science', 'machine learning', 
    'ai', 'artificial intelligence', 'devops', 'cloud computing', 'aws', 'azure', 'cybersecurity', 'linux',
    'git', 'github', 'docker', 'kubernetes', 'database', 'backend', 'frontend', 'fullstack',

    // Professional & Research
    'research', 'methodology', 'thesis', 'dissertation', 'project', 'design', 'simulation', 'modeling',
    'cad', 'solidworks', 'autocad', 'matlab', 'labview', 'arduino', 'raspberry pi', 'embedded',
    'prototype', 'patent', 'standard', 'iso', 'ieee'
];

// Helper to escape regex special characters
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pre-compile regular expression with word boundaries and punctuation handling
function compileKeywordRegex(keywords) {
    const patterns = keywords.map((k) => {
        const esc = escapeRegex(k.toLowerCase());
        const start = /^\w/.test(k) ? '\\b' : '(?<=^|[\\s.,!?;:()[\\]{}"\'`\\/-])';
        const end = /\w$/.test(k) ? '\\b' : '(?=$|[\\s.,!?;:()[\\]{}"\'`\\/-])';
        return start + esc + end;
    });
    return new RegExp(patterns.join('|'), 'i');
}

const EDUCATIONAL_REGEX = compileKeywordRegex(EDUCATIONAL_KEYWORDS);

// Inject CSS at document_start to hide Shorts navigation, shelves, and hover previews
const style = document.createElement('style');
style.textContent = `
    /* Inline preview suppression (eliminates DOM mutation thrashing) */
    #inline-preview-player,
    ytd-video-preview,
    ytd-inline-playback-renderer,
    #preview-container,
    .ytd-video-preview,
    ytd-moving-thumbnail-renderer,

    /* YouTube Shorts UI suppression */
    ytd-guide-entry-renderer:has(a[href*="/shorts"]),
    ytd-mini-guide-entry-renderer:has(a[href*="/shorts"]),
    ytd-rich-shelf-renderer[is-shorts],
    ytd-reel-shelf-renderer,
    ytd-rich-item-renderer:has(a[href*="/shorts"]),
    a[href^="/shorts"],
    a[href*="/shorts/"],

    /* YouTube Main Page & Feeds suppression */
    ytd-browse[page-subtype="home"],
    ytd-browse[page-subtype="trending"],
    ytd-browse[page-subtype="subscriptions"],
    #page-manager > ytd-browse[role="main"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
    }
`;
if (document.documentElement) {
    document.documentElement.appendChild(style);
} else {
    document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.appendChild(style);
    });
}

// Safe asynchronous messaging with context invalidation guard
function safeSendMessage(message) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        return;
    }
    try {
        const p = chrome.runtime.sendMessage(message);
        if (p && typeof p.catch === 'function') {
            p.catch(() => {});
        }
    } catch {}
}

// Pause and blank video element to prevent media leakage
function pauseAndBlankMedia() {
    try {
        const videos = document.querySelectorAll('video');
        videos.forEach((v) => {
            try {
                v.pause();
                v.muted = true;
                v.src = '';
            } catch {}
        });
    } catch {}
}

// Instant detection and blocking of YouTube Shorts
function checkShorts() {
    const pathname = window.location.pathname || '';
    const href = window.location.href || '';
    if (pathname.startsWith('/shorts/') || href.includes('/shorts/')) {
        pauseAndBlankMedia();
        safeSendMessage({ action: 'redirect' });
        return true;
    }
    return false;
}

// Instant detection and blocking of YouTube Main Page and Algorithmic Feeds
function checkMainOrFeed() {
    try {
        const u = new URL(window.location.href);
        const p = u.pathname.replace(/\/+$/, '') || '/';
        // Main page / home feed
        if (p === '/' || p === '') {
            pauseAndBlankMedia();
            safeSendMessage({ action: 'redirect' });
            return true;
        }
        // Algorithmic feeds (trending, explore, subscriptions, etc.)
        if (p.startsWith('/feed')) {
            pauseAndBlankMedia();
            safeSendMessage({ action: 'redirect' });
            return true;
        }
    } catch {
        const href = window.location.href.toLowerCase();
        if (href.endsWith('youtube.com/') || href.endsWith('youtube.com') || href.includes('youtube.com/?') || href.includes('/feed/')) {
            pauseAndBlankMedia();
            safeSendMessage({ action: 'redirect' });
            return true;
        }
    }
    return false;
}

// Watch page detector supporting standard watch, live streams, and embedded players
function isWatchPage(url) {
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

// Synchronously clean document.title for fast fallback
function getCleanDocumentTitle() {
    let t = document.title || '';
    t = t.replace(/^\(\d+\)\s*/, ''); // strip notification count: "(3) Title"
    t = t.replace(/\s*-\s*YouTube$/i, ''); // strip brand suffix: "Title - YouTube"
    return t.trim();
}

// Extract active video title with robust selector cascade
function getActiveVideoTitle() {
    // 1. Check primary DOM elements
    const titleElement = document.querySelector(
        'ytd-watch-metadata h1 yt-formatted-string,' +
        'h1.ytd-video-primary-info-renderer,' +
        '#title h1,' +
        'h1.title.style-scope.ytd-video-primary-info-renderer'
    );
    if (titleElement) {
        const text = (titleElement.innerText || '').trim();
        if (text.length > 0) return text;
    }

    // 2. Synchronous fallback: document.title
    const docTitle = getCleanDocumentTitle();
    if (docTitle.length > 0 && docTitle.toLowerCase() !== 'youtube') {
        return docTitle;
    }

    // 3. Fallback: meta tag
    const metaTitle = document.querySelector('meta[name="title"]');
    if (metaTitle && metaTitle.content) {
        const text = metaTitle.content.trim();
        if (text.length > 0) return text;
    }

    return '';
}

let lastCheckTime = 0;
function checkYouTubeTitle(force = false) {
    // Shorts and Main Page are always blocked immediately
    if (checkShorts()) return;
    if (checkMainOrFeed()) return;

    const url = window.location.href;
    if (!isWatchPage(url)) return;

    const title = getActiveVideoTitle();
    if (!title || title.length === 0) {
        // Title not yet available in DOM; do not set lastCheckTime to avoid lockouts
        return;
    }

    // Rate limit to avoid duplicate message spam once title has been verified (bypassed if forced)
    const now = Date.now();
    if (!force && now - lastCheckTime < 1000) return;
    lastCheckTime = now;

    const isEducational = EDUCATIONAL_REGEX.test(title);
    if (!isEducational) {
        pauseAndBlankMedia();
        safeSendMessage({ action: 'redirect' });
    }
}

// Global Navigation Observer & SPA Event Handlers
let lastCheckedUrl = window.location.href;

function onPossibleNavigation() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        return;
    }

    if (checkShorts()) return;
    if (checkMainOrFeed()) return;

    const currentUrl = window.location.href;
    if (currentUrl !== lastCheckedUrl) {
        lastCheckedUrl = currentUrl;
        lastCheckTime = 0; // Reset debounce for new URL
        checkYouTubeTitle(true);
        // Staggered checks during DOM hydration of the newly loaded page
        setTimeout(() => checkYouTubeTitle(true), 250);
        setTimeout(() => checkYouTubeTitle(true), 600);
        setTimeout(() => checkYouTubeTitle(true), 1200);
    } else {
        checkYouTubeTitle(false);
    }
}

const observer = new MutationObserver(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        observer.disconnect();
        return;
    }
    onPossibleNavigation();
});

observer.observe(document.documentElement, { childList: true, subtree: true });

// Check on URL change interval fallback
const checkInterval = setInterval(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        clearInterval(checkInterval);
        return;
    }
    if (window.location.href !== lastCheckedUrl) {
        lastCheckedUrl = window.location.href;
        lastCheckTime = 0;
        if (checkShorts()) return;
        if (checkMainOrFeed()) return;
        checkYouTubeTitle(true);
    }
}, 1000);

// Initial execution
if (!checkShorts() && !checkMainOrFeed()) {
    checkYouTubeTitle(true);
}

// YouTube SPA navigation and browser history events
window.addEventListener('yt-navigate-start', () => {
    if (checkShorts()) return;
    if (checkMainOrFeed()) return;
    onPossibleNavigation();
}, true);
window.addEventListener('yt-navigate-finish', onPossibleNavigation, true);
window.addEventListener('yt-page-data-updated', onPossibleNavigation, true);
window.addEventListener('popstate', onPossibleNavigation, true);
window.addEventListener('hashchange', onPossibleNavigation, true);
