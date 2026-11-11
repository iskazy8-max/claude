# Habits

A phone app (installable web app) for daily habit tracking. No account, no server — data stays on the device and it works offline.

- **Today** – tick off the five prayers, morning/evening adhkar, 2 pages of Quran and gym. Browse back to earlier days.
- **Adhkar** – أذكار الصباح and أذكار المساء with tap counters for the repetitions.
- **Weight** – one entry per day, with a chart, changes and full history.
- **Progress** – 30-day grid and streak per habit, plus JSON export/import backup.

## Install on a phone

Host the folder on any HTTPS static host (e.g. GitHub Pages: *Settings → Pages → Deploy from a branch*), open the URL on the phone, then:

- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** menu → *Install app* / *Add to Home screen*

## Run locally

    python3 -m http.server 8000

Plain HTML/CSS/JS — no build step. The app lives in `habits/`; the adhkar list is `habits/adhkar.js`.
