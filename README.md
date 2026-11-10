# DayTrack

A habit, meal, training and calorie tracker that installs on an iPhone as a home-screen app (PWA).
No account, no server: all data stays on the device and the app works offline.

- **Today** – calories left, macros, habit checklist, meal and training summary for any day
- **Habits** – daily habits with a 7-day view and streaks
- **Meals** – breakfast / lunch / dinner / snacks with calories and macros, built-in food list, recent foods
- **Training** – workout log with calories burned estimated from activity, duration and body weight
- **Calories** – BMR / TDEE calculator (Mifflin-St Jeor), daily target and macro split, backup export/import

## Put it on your iPhone

1. Host the files over HTTPS. With GitHub Pages: merge this branch into `main`, then
   *Settings → Pages → Deploy from a branch → `main` / root*.
2. Open the page in **Safari** on the iPhone.
3. Tap **Share → Add to Home Screen**.

## Run locally

    python3 -m http.server 8000

Plain HTML/CSS/JS, no build step.
