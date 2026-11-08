// ==============================================================================
// F.R.O.S.T. Configuration
// ==============================================================================

/**
 * The threshold date until which all restrictions and anti-tamper shields are active.
 * Adjust this to your specific study/focus deadline.
 */
export const UNLOCK_DATE = new Date('2027-01-05T00:00:00');

/**
 * Shared daily allowance in minutes across all domains in BLOCKED_DOMAINS.
 * Once this quota is exhausted, tracked domains are immediately redirected.
 */
export const DAILY_ALLOWANCE_MINUTES = 5;

/**
 * Target URL to redirect blocked requests (motivational wallpaper, focus dashboard, etc.).
 */
export const REDIRECT_TARGET = 'https://i.pinimg.com/736x/6e/59/0b/6e590bb22b1fc1b447c8ff6a7f7902aa.jpg';

/**
 * Domains tracked under the shared daily allowance.
 */
export const BLOCKED_DOMAINS = [
    'facebook.com',
    'instagram.com',
    'twitter.com',
    'x.com',
    'tiktok.com',
    'snapchat.com',
    'music.youtube.com',
    'spotify.com',
    'linkedin.com',
    'pinterest.com',
    'reddit.com',
    'quora.com',
    'github.com'
];

/**
 * Domains that are blocked immediately with zero timer allowance.
 */
export const HARD_BLOCKED_DOMAINS = [
    'flixbaba.mov',
    'flixbaba'
];

/**
 * Educational keywords used by the YouTube content filter.
 * If a video's title does not match at least one keyword, it will be redirected.
 */
export const EDUCATIONAL_KEYWORDS = [
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

/**
 * Escapes regex special characters.
 */
export function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compiles educational keywords into a high-performance regex with boundary guards.
 * Uses \b for alphanumeric words and lookarounds for symbols (e.g. 'c++').
 */
export function compileKeywordRegex(keywords) {
    const patterns = keywords.map((k) => {
        const esc = escapeRegex(k.toLowerCase());
        const start = /^\w/.test(k) ? '\\b' : '(?<=^|[\\s.,!?;:()[\\]{}"\'`\\/-])';
        const end = /\w$/.test(k) ? '\\b' : '(?=$|[\\s.,!?;:()[\\]{}"\'`\\/-])';
        return start + esc + end;
    });
    return new RegExp(patterns.join('|'), 'i');
}

/**
 * Pre-compiled regular expression for educational keyword matching.
 */
export const EDUCATIONAL_REGEX = compileKeywordRegex(EDUCATIONAL_KEYWORDS);

