# Crickrida Mobile

Flutter iOS & Android client for [Crickrida](https://crickrida.rkjat.in) — the IPL analytics platform.

## Architecture

```
Flutter app  →  https://crickrida.rkjat.in/api/*  →  FastAPI + DuckDB
```

Same backend as the web dashboard. No separate mobile API.

## Features

Everything is free — no account or sign-in.

- **Home** — KPIs, leaderboards, recent matches
- **Matches** — filter by season/team, match detail
- **Players** — batting/bowling leaderboards, search, profiles + matchups
- **Content Studio** — branded cards (player, comparison, match, record, season) with PNG export & share
- **More**
  - Cricket Pulse
  - Teams / Venues / Seasons
  - Head to Head
  - Charts
  - Player Impact

## Run

```bash
cd mobile
flutter pub get
flutter run
```

### Point at a different API

```bash
flutter run --dart-define=API_BASE=http://localhost:8000
```

## Build

```bash
# Android
flutter build apk --release
flutter build appbundle --release

# iOS
flutter build ios --release
```

## Project layout

```
lib/
  core/           # config, theme, API client, auth
  services/       # ApiService facade
  widgets/        # shared UI
  features/       # screens by domain
```
