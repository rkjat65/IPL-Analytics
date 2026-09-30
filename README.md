# Cricket Analytics Platform — IPL and T20 World Cup Intelligence

> End-to-end analysis of IPL and Men's T20 World Cup ball-by-ball data, with an explicit tournament switch and fully isolated statistics.

[![Live Dashboard](https://img.shields.io/badge/Live%20Dashboard-Visit-blue?style=flat-square)](https://rkjat.in/portfolio/ipl-analytics.html)
[![Case Study](https://img.shields.io/badge/Case%20Study-rkjat.in-informational?style=flat-square)](https://rkjat.in/portfolio/ipl-analytics.html)
[![Stack](https://img.shields.io/badge/Stack-Python%20%7C%20FastAPI%20%7C%20DuckDB%20%7C%20React-yellow?style=flat-square)]()

---

## What This Is

An open-source cricket analytics platform built on ball-by-ball data — not match summaries. It supports two independent modes: IPL (2008–2026) and Men's T20 World Cup (2007–2026). The same analytical tools are available in both modes, while separate DuckDB files prevent matches, players, teams, and records from mixing.

**Scale:** 1,243 IPL matches · 378 T20 World Cup matches · 10 World Cup editions

---

## What It Answers

The platform is built around specific questions an analyst would actually ask:

- Which teams perform best in the death overs (overs 17–20) under pressure?
- How has powerplay strategy evolved from 2008 to 2026?
- Which bowlers are most effective against left-handed batsmen?
- How do batting averages change across the three phases of an innings?
- Which venues produce the highest/lowest scoring matches and why?

---

## Architecture

```
Cricsheet JSON (ball-by-ball)
        ↓
    ├── ipl.duckdb
    └── t20_world_cup.duckdb
        ↓
    FastAPI (analytical backend)
        ↓
    ├── React + Tailwind (web dashboard — crickrida.com)
    └── Flutter (iOS & Android app — /mobile)
```

**Key architectural decision:** Each tournament has its own DuckDB database. A request-scoped tournament context selects exactly one database, so an IPL request cannot include World Cup data and vice versa.

**Why DuckDB over Pandas:** DuckDB enables fast in-process querying of large JSON datasets at query time rather than pre-aggregating — faster iteration, no stale pre-computed tables.

**Why ball-by-ball over match summaries:** Ball-by-ball data enables phase analysis (powerplay, middle overs, death), pressure metrics, and wagon-wheel-equivalent insights that are impossible with match-level aggregates.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Data source | [Cricsheet](https://cricsheet.org/) — open ball-by-ball JSON and player register |
| Query engine | DuckDB |
| Backend API | FastAPI (Python) |
| Frontend | React + Tailwind CSS |
| Mobile | Flutter (iOS & Android) — see [`mobile/`](./mobile) |
| Data processing | Python (pandas, numpy) |

---

## Data Source

Ball-by-ball data comes from [Cricsheet](https://cricsheet.org/). Player identities use the official [Cricsheet Register](https://cricsheet.org/register/) and its stable person identifiers, including verified name variants. Register data is provided under the Open Data Commons Attribution License.

The identity build keeps tournament statistics isolated while merging name variants that belong to the same person (for example, `V Kohli` and `Virat Kohli`). Editorial famous names such as “King Kohli” remain searchable and are displayed separately from the verified player name.

### Reusable player images

`tools/import_wikimedia_player_images.py` fills missing player portraits from
Wikidata and Wikimedia Commons. It matches the verified ESPNcricinfo ID in the
identity catalogue to Wikidata property `P2697`, checks the Commons licence,
creates a 512×512 WebP crop, and writes the source and attribution metadata to
`data/player_image_attributions.json`.

```powershell
# Audit catalogue coverage without downloading files
python tools/import_wikimedia_player_images.py --dry-run

# Import and review selected players
python tools/import_wikimedia_player_images.py --player "Babar Azam" --player "Shahid Afridi"

# Permanently reject reviewed candidates and remove their generated files
python tools/import_wikimedia_player_images.py --reject-player "Example Player" --reject-player "Another Player"
```

Existing images are preserved unless `--overwrite` is explicitly supplied.
Candidate photographs still require a visual review: unsuitable Commons files
are recorded in `data/wikimedia_player_image_decisions.json` by
`--reject-player`, pruned from the generated images and prevented from returning
on later runs. Published credits are available at `/image-credits`.

For players without an acceptable Wikidata P18 portrait, the category discovery
tool checks the exact Commons category linked to the verified Wikidata entity.
It only creates a review queue; it never publishes search results automatically.

```powershell
python tools/discover_wikimedia_player_images.py --results 8
python tools/prepare_wikimedia_candidate_review.py "$env:TEMP\crickrida-wikimedia-review"
python tools/import_wikimedia_search_selections.py
```

Approved category candidates live in
`data/wikimedia_commons_search_selections.json`, keeping the manual identity and
image-quality decision auditable and repeatable. Name-based Commons searching is
available only through the explicit `--include-name-search` option because names
can collide with unrelated people.

---

## Live Demo

**[→ Explore the Live Dashboard](https://rkjat.in/portfolio/ipl-analytics.html)**

**[→ Read the Full Case Study](https://rkjat.in/portfolio/ipl-analytics.html)**

---

## Related Projects

- **[India's Fiscal Federalism](https://github.com/rkjat65/India-Economic-Pulse)** — Policy data analysis
- **[India Economic Pulse](https://github.com/rkjat65/India-Economic-Pulse)** — Macroeconomic indicator dashboard
- **[Portfolio](https://rkjat.in)** — rkjat.in

---

## Author

**Radhakishan Jat** — Research & Content Analyst, Data Storyteller

[Portfolio](https://rkjat.in) · [LinkedIn](https://linkedin.com/in/rkjat65) · [radhakishanjat65@gmail.com](mailto:radhakishanjat65@gmail.com)
