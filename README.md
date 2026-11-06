# 🛡️ F.R.O.S.T. — Focus Restriction & Online Surveillance Timer

[![Platform](https://img.shields.io/badge/Platform-Google%20Chrome%20(MV3)-blue.svg?style=for-the-badge&logo=googlechrome)]()
[![Status](https://img.shields.io/badge/Status-Hard--Lockdown-red.svg?style=for-the-badge)]()
[![License](https://img.shields.io/badge/License-MIT-emerald.svg?style=for-the-badge)]()

> *"Engineering demands absolute precision. Procrastination is a variable we cannot afford."*

**F.R.O.S.T.** is not an ordinary website blocker. It is an **engineering-grade psychological firewall** designed for students, engineers, and researchers who need an unyielding environment for high-stakes preparation. Once engaged, F.R.O.S.T. enforces strict boundaries that cannot be casually toggled off until your designated target date.

---

## ⚠️ Critical Advisory: Read Before Installing

> [!CAUTION]
> **THIS EXTENSION ENFORCES AN ACTIVE ANTI-TAMPER PROTOCOL.**  
> Once loaded into Chrome, navigation to `chrome://extensions` and extension settings is actively intercepted and redirected. You will **not** be able to casually click "Disable" or "Remove" through standard browser UI until the configured `UNLOCK_DATE` is reached. Proceed only if you are fully committed to deep, uninterrupted focus.

---

## 🚀 Key Features

### 📅 The Hard Date Gate
The firewall operates against a tamper-checked system threshold (`UNLOCK_DATE` in `constants.js`):
- **Absolute Lockdown:** All filtering rules and anti-tamper mechanisms remain fully enforced until the system clock passes the unlock date.
- **Automated Stand-down:** Once the unlock timestamp arrives, the extension automatically stands down, restoring standard browser navigation without requiring code edits.

### ⏳ Shared Daily Allowance (Default: 5 Minutes)
Maintains a shared pool of leisure time across distracting platforms:
- **Pooled Distraction Budget:** Spend an aggregated 5 minutes total per day (configurable via `DAILY_ALLOWANCE_MINUTES` in `constants.js`) across all blacklisted domains (Reddit, Instagram, X/Twitter, etc.) before hard redirection triggers.
- **Autonomous Midnight Reset:** The timer automatically resets at midnight each day via `chrome.storage.local`.
- **Educational Exclusion:** Productive YouTube study sessions do *not* consume your distraction allowance.

### 🎥 Intelligent YouTube Educational Firewall
Allows YouTube strictly for research and technical learning while eradicating rabbit holes:
- **Instant Shorts Purge:** Any navigation to `youtube.com/shorts/*` is redirected instantly (zero-second grace).
- **Engineering & Academic Filter:** Long-form videos are evaluated in real time. If the video title does not match verified STEM/engineering keywords (Physics, Calculus, Algorithms, Circuits, etc.), the video is immediately blocked.
- **Anti-Hover Suppression:** YouTube’s inline preview / hover-play player (`#inline-preview-player`) is structurally hidden and disabled via injected CSS and DOM observers, eliminating passive thumbnail browsing.
- **SPA Resilience:** Built to listen directly for YouTube single-page application lifecycle events (`yt-navigate-finish`, `yt-page-data-updated`).

### ⛔ Zero-Tolerance Hard Block
Severe distraction hubs (e.g., streaming and pirate media platforms) are configured under `HARD_BLOCKED_DOMAINS` for 100% instant redirection with zero daily timer allowance.

### 🔐 Anti-Tamper Protocol
Blocks impulsive attempts to disable the extension mid-session:
- Intercepts navigation to `chrome://extensions` and `chrome://settings/extensions`.
- Leverages multi-layer navigation listeners (`tabs.onUpdated`, `webNavigation.onBeforeNavigate`, `webNavigation.onCommitted`).

---

## 🛠️ Configuration & Customization

All primary behavior is governed by [`constants.js`](constants.js). You can review or tailor these settings prior to installation:

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `UNLOCK_DATE` | `Date` | Timestamp until which all restrictions remain active (e.g. `2027-01-05T00:00:00`). |
| `DAILY_ALLOWANCE_MINUTES` | `number` | Daily shared quota in minutes across tracked domains (default: `5`). |
| `REDIRECT_TARGET` | `string` | Target URL where blocked tabs will be redirected (motivational wallpaper, focus dashboard). |
| `BLOCKED_DOMAINS` | `Array<string>` | Hostnames subject to the shared daily allowance. |
| `HARD_BLOCKED_DOMAINS` | `Array<string>` | Hostnames permanently blocked with 0 allowance. |
| `EDUCATIONAL_KEYWORDS` | `Array<string>` | Keywords required in YouTube video titles to permit viewing. |

```javascript
// constants.js excerpt
export const UNLOCK_DATE = new Date('2027-01-05T00:00:00');
export const DAILY_ALLOWANCE_MINUTES = 5;
export const REDIRECT_TARGET = 'https://i.pinimg.com/736x/6e/59/0b/6e590bb22b1fc1b447c8ff6a7f7902aa.jpg';
```

---

## 📥 Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rithulraveendran/F.R.O.S.T.git
   ```
2. **Review Configuration:** Open `constants.js` and set your preferred `UNLOCK_DATE` and `REDIRECT_TARGET`.
3. **Open Extensions Page:** Open Google Chrome and navigate to `chrome://extensions` *(do this before enabling the extension)*.
4. **Enable Developer Mode:** Turn on the toggle switch in the top-right corner.
5. **Load Extension:** Click **Load unpacked** and select the cloned repository folder.
6. **Focus:** Your workstation is now locked into focus mode.

---

## 🔄 Applying Modifications

Because the Anti-Tamper protocol prevents accessing the standard extension "Reload" button in the Chrome UI:
1. Save your desired file edits in the folder.
2. Completely quit Chrome (close all open windows or exit via system tray / Task Manager).
3. Relaunch Chrome. Chrome automatically picks up updated files for unpacked extensions upon restart.

---

## 🛑 Emergency Bypass Protocol

If an unexpected emergency requires removing the extension before the unlock date:
1. Completely close Google Chrome.
2. Move, rename, or delete the local folder from your storage drive.
3. Relaunch Google Chrome. Chrome will detect the missing source files and deactivate the extension.

---

## 📜 License

Distributed under the MIT License. See [`LICENSE`](LICENSE) for more information.

---

<p align="center">
  <i>Built for the relentless. Zero excuses.</i>
</p>
