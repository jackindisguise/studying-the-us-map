# Studying the US Map

**An Anki deck for learning where every U.S. state is, and a few facts about each.**
Built in the same way as the World Map deck.

## The deck

- **Notes:** one *State Map* note per state (50; no D.C. or territories), most populous first.
- **Card:** *Locate* shows a map with one state highlighted and asks which it is.
- **Back:** name, abbreviation, region, capital, largest city, bordering states and countries, nickname, statehood date, population, GDP, GDP per capita, land area, density, governor and party. Numbers carry their rank among the 50 states.
- **Sub-decks:** the four Census regions (Northeast, South, Midwest, West).
- **Maps:** one SVG per state, north-up Mercator. Connecticut, Delaware and Rhode Island also get a zoom box with a scale bar.
- **Flags:** not included yet; planned as their own sub-decks.

![Locate, back](docs/images/locate-back.png)

## Usage

Requires Node.js 22.12 or newer.

```
npm install
npm run build      # records, maps and build/notes.csv
npm run apkg       # build/studying-the-us-map-<version>.apkg
```

- `npm run examples`: screenshots into `docs/images/` (needs Edge or Chrome).
- `node scripts/build-examples.js RI AK`: test screenshots into `build/examples/`.
- `node scripts/render-all.js RI AK`: re-render only some maps.
- `npm run fetch:refresh`: download the sources again, then rebuild.

## Data

| Data | Source |
| --- | --- |
| State shapes | `us-atlas` (U.S. Census cartographic boundaries) |
| Other countries, lakes | `world-atlas` and Natural Earth |
| Population (2025 estimate) | U.S. Census Bureau |
| GDP (2025, current dollars) | Bureau of Economic Analysis |
| Capital, largest city, statehood, land area, governors, nicknames | Wikipedia |

- For the original 13 states, the statehood date is the date they ratified the Constitution.
- Borders are land borders; states that only meet at a corner or across water do not count.
- **Governors** are those in office when the data was downloaded (November 25, 2026). Newly elected governors take office around December 2026 and January 2027, so run `npm run fetch:refresh` after that.

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please) (`.github/workflows/release.yml`):

1. Commit to `main` with [conventional commit](https://www.conventionalcommits.org) titles (`feat:`, `fix:`, `docs:` and so on).
2. release-please keeps a release pull request open that bumps the version in `package.json` and the version badge in `docs/ankiweb.md`, and updates `CHANGELOG.md`.
3. Merging that pull request creates the GitHub release and the `v<version>` tag. The workflow then runs `npm run build` and `npm run apkg` and attaches `studying-the-us-map-<version>.apkg` to the release.

The repository on GitHub needs *Allow GitHub Actions to create and approve pull requests* turned on (Settings, Actions, General) for step 2.
