# Habits

A phone app (installable web app) for daily habit tracking. No account, no server — data stays on the device and it works offline.

- **Today** – hadith of the day, prayer times and next prayer, the five prayers (on time / jama’ah / late), sunnah extras, adhkar, and your own habits (add, rename, remove) with a gym log.
- **Adhkar** – morning, evening, after-prayer and sleep adhkar with tap counters, plus a free tasbih counter.
- **Weight** – one entry per day, chart with goal line, BMI, changes and full history.
- **Progress** – weekly/monthly summary and a 30-day grid and streak per habit.
- **Settings** – theme, location and calculation method, reminders, calendar export, JSON backup.

## Install on a phone

Host the folder on any HTTPS static host (e.g. GitHub Pages: *Settings → Pages → Deploy from a branch*), open the URL on the phone, then:

- **iPhone (Safari):** Share → *Add to Home Screen*
- **Android (Chrome):** menu → *Install app* / *Add to Home screen*

## Run locally

    python3 -m http.server 8000

Plain HTML/CSS/JS — no build step. The app lives in `habits/`; the adhkar list is `habits/adhkar.js`.
