// ==============================================================================
// F.R.O.S.T. - YouTube Content Script & Context-Aware Firewall
// Clean UI Study Mode + Strict Shorts Purge + Educational Screening
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

// 1. Inject Comprehensive Clean UI Styles (Clean Study Mode + Total Shorts Purge + Distraction-Free Homepage)
const style = document.createElement('style');
style.textContent = `
    /* ==========================================================================
       A. TOTAL SHORTS PURGE
       ========================================================================== */
    ytd-reel-shelf-renderer,
    ytd-rich-shelf-renderer[is-shorts],
    ytd-rich-section-renderer:has(ytd-reel-shelf-renderer),
    ytd-guide-entry-renderer:has(a[href*="/shorts"]),
    ytd-mini-guide-entry-renderer:has(a[href*="/shorts"]),
    a[href^="/shorts"],
    a[href*="/shorts/"],
    ytd-shorts,
    #shorts-container,
    ytm-shorts-lockup-view-model-v2,
    yt-chip-cloud-chip-renderer:has(yt-formatted-string[title="Shorts"]),

    /* ==========================================================================
       B. DISTRACTION-FREE CLEAN WATCH PAGE
       ========================================================================== */
    /* Hide algorithmic recommendation sidebar (Related videos) */
    #related,
    #secondary.ytd-watch-flexy,
    ytd-watch-next-secondary-results-renderer,

    /* Hide comments section completely */
    #comments,
    ytd-comments,
    ytd-item-section-renderer:has(#comments),

    /* Hide live chat, merchandise, fundraising and sponsor cards */
    #chat,
    ytd-live-chat-frame,
    ytd-merch-shelf-renderer,
    ytd-clarification-renderer,

    /* Hide end-screen thumbnail cards & hover overlays */
    .ytp-ce-element,
    .ytp-ce-covering-overlay,
    .ytp-ce-element-show,
    .ytp-endscreen-content,
    .html5-endscreen,

    /* Disable hover preview playback */
    #inline-preview-player,
    ytd-video-preview,
    ytd-inline-playback-renderer,
    #preview-container,
    .ytd-video-preview,
    ytd-moving-thumbnail-renderer,

    /* ==========================================================================
       C. TOTAL HOMEPAGE & FEED BLOCK (NO YT MAIN PAGE FEED)
       ========================================================================== */
    ytd-browse[page-subtype="home"],
    ytd-browse[page-subtype="home"] #contents,
    ytd-browse[page-subtype="home"] ytd-rich-grid-renderer,
    #page-manager > ytd-browse[role="main"]:not([page-subtype="channels"]),
    ytd-browse[page-subtype="trending"],
    ytd-browse[page-subtype="subscriptions"],
    #feed,
    ytd-two-column-browse-results-renderer[page-subtype="home"],
    #primary:has(ytd-rich-grid-renderer),
    ytd-guide-section-renderer:has(a[href*="/feed/explore"]),
    ytd-guide-section-renderer:has(a[href*="/feed/trending"]),
    ytd-guide-section-renderer:has(a[href*="/feed/subscriptions"]) {
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

function updateHomepageStudyBanner() {
    const isHome = (window.location.pathname === '/' || window.location.pathname === '') && !window.location.search.includes('search_query');
    let banner = document.getElementById('frost-study-mode-banner');
    if (isHome) {
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'frost-study-mode-banner';
            banner.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:120px 20px;text-align:center;font-family:system-ui,-apple-system,sans-serif;color:#38bdf8;';
            banner.innerHTML = `
                <div style="font-size:52px;margin-bottom:16px;">🛡️</div>
                <h1 style="font-size:26px;font-weight:700;color:#f8fafc;margin:0 0 10px 0;">F.R.O.S.T. Study Mode Active</h1>
                <p style="font-size:16px;color:#94a3b8;max-width:540px;margin:0;line-height:1.6;">YouTube homepage feed is blocked to eliminate distractions. Use the search bar above to look up lectures, courses, and educational material.</p>
            `;
            const target = document.querySelector('ytd-page-manager') || document.querySelector('#page-manager') || document.body;
            if (target) {
                target.appendChild(banner);
            }
        }
    } else {
        if (banner) banner.remove();
    }
}

function removeInlinePreviews() {
    const previewSelectors = [
        '#inline-preview-player', 
        'ytd-video-preview', 
        'ytd-inline-playback-renderer',
        '#preview-container',
        'ytd-reel-shelf-renderer'
    ];
    previewSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.remove());
    });
}

let lastCheckTime = 0;
function checkYouTubeTitle() {
    const url = window.location.href;

    // Shorts are always blocked immediately
    if (url.includes('/shorts/')) {
        try {
            chrome.runtime.sendMessage({ action: 'redirect' });
        } catch {}
        return;
    }

    // Only check educational keywords if we are on a WATCH page
    if (!url.includes('youtube.com/watch') || !url.includes('v=')) return;

    // Rate limit checks to avoid issues during rapid DOM updates
    const now = Date.now();
    if (now - lastCheckTime < 1000) return;
    lastCheckTime = now;

    // Primary title selectors for the main video player ONLY
    const titleElement = document.querySelector(
        'ytd-watch-metadata h1 yt-formatted-string,' +
        'h1.ytd-video-primary-info-renderer,' +
        '#title h1,' +
        'meta[name="title"]'
    );
    
    if (titleElement) {
        const title = (titleElement.innerText || titleElement.content || '').toLowerCase();
        if (title.trim().length === 0) return;

        const isEducational = EDUCATIONAL_KEYWORDS.some(keyword => title.includes(keyword));

        if (!isEducational) {
            try {
                chrome.runtime.sendMessage({ action: 'redirect' });
            } catch {}
        }
    }
}

// Global Mutation Observer
let lastCheckedUrl = window.location.href;
let lastPreviewCleanupTime = 0;

function onPossibleNavigation() {
    const currentUrl = window.location.href;
    updateHomepageStudyBanner();
    if (currentUrl !== lastCheckedUrl) {
        lastCheckedUrl = currentUrl;
        lastCheckTime = 0; // allow immediate re-check on navigation
        setTimeout(checkYouTubeTitle, 250);
    } else {
        checkYouTubeTitle();
    }
}

const observer = new MutationObserver(() => {
    const now = Date.now();
    if (now - lastPreviewCleanupTime > 500) {
        lastPreviewCleanupTime = now;
        removeInlinePreviews();
    }

    onPossibleNavigation();
});

if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
} else {
    document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.documentElement, { childList: true, subtree: true });
    });
}

// Check on URL change (for SPA navigation)
setInterval(() => {
    if (window.location.href !== lastCheckedUrl) {
        lastCheckedUrl = window.location.href;
        lastCheckTime = 0;
        checkYouTubeTitle();
        updateHomepageStudyBanner();
    }
}, 1000);

// Initial checks
checkYouTubeTitle();
removeInlinePreviews();
updateHomepageStudyBanner();

// YouTube SPA navigation events
window.addEventListener('yt-navigate-finish', onPossibleNavigation, true);
window.addEventListener('yt-page-data-updated', onPossibleNavigation, true);
