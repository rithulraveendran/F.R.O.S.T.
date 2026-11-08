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

// Inject CSS to hide inline previews and prevent hover-play initialization
const style = document.createElement('style');
style.textContent = `
    #inline-preview-player,
    ytd-video-preview,
    ytd-inline-playback-renderer,
    #preview-container,
    .ytd-video-preview {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
    }
`;
document.documentElement.appendChild(style);

function removeInlinePreviews() {
    const previewSelectors = [
        '#inline-preview-player', 
        'ytd-video-preview', 
        'ytd-inline-playback-renderer',
        '#preview-container'
    ];
    previewSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.remove());
    });
}

let lastCheckTime = 0;
function checkYouTubeTitle() {
    // Only check if we are on a WATCH page
    const url = window.location.href;
    if (!url.includes('youtube.com/watch')) return;
    if (!url.includes('v=')) return;

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
        // Ensure the title is not empty (sometimes it's empty during initial load)
        if (title.trim().length === 0) return;

        const isEducational = EDUCATIONAL_KEYWORDS.some(keyword => title.includes(keyword));

        if (!isEducational) {
            try {
                chrome.runtime.sendMessage({ action: 'redirect' });
            } catch {
                // Ignore context invalidation on extension reload
            }
        }
    }
}

// Global Mutation Observer
let lastCheckedUrl = window.location.href;
let lastPreviewCleanupTime = 0;

function onPossibleNavigation() {
    const currentUrl = window.location.href;
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

observer.observe(document.documentElement, { childList: true, subtree: true });

// Check on URL change (for SPA navigation)
setInterval(() => {
    if (window.location.href !== lastCheckedUrl) {
        lastCheckedUrl = window.location.href;
        lastCheckTime = 0;
        checkYouTubeTitle();
    }
}, 2000);

// Initial checks
checkYouTubeTitle();
removeInlinePreviews();

// YouTube SPA navigation events (more reliable than DOM mutation heuristics)
window.addEventListener('yt-navigate-finish', onPossibleNavigation, true);
window.addEventListener('yt-page-data-updated', onPossibleNavigation, true);
