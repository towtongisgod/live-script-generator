# Live Script Generator

Static web app for live-commerce script preparation. The current version is the August 2026 Pattern A/B/C experiment build: it maps each selected Brand x Platform account to the assigned selling pattern for the live slot, then generates one continuous MC-ready spoken script from parsed promotion text.

## Current Version

- **Experiment:** August 2026 Script Pattern A/B/C
- **Pattern A:** Advisor / Diagnose & Educate
- **Pattern B:** Bestie / Lifestyle & Engagement
- **Pattern C:** Closer / Value & Closing
- **Runtime:** static HTML, CSS, and JavaScript. No backend, database, paid API, login, or build-time secret is required.

Old `advisor`, `bestie`, and `closer` strategy names are still accepted as aliases, but the UI now shows the production A/B/C experiment language.

## Primary Accounts

The selector intentionally shows 5 live accounts:

- SKINOXY TikTok
- SKINOXY Shopee
- KISS TikTok
- KISS Shopee
- DGMR TikTok

DGMR Shopee remains in `data/brands.json` and `config/accounts.js` as future-ready knowledge, but it is hidden from the primary selector until the experiment plan needs it.

## Features

- Parse multi-promotion text pasted from live-commerce planning sheets.
- Preserve Product Truth fields: product names, normal price, promo price, discount, gifts, rights, live-only language, promo dates, notes, and tiered price details.
- Assign Pattern A/B/C by account, date, and start time using the August 2026 test plan.
- Support manual pattern override and a slot-check state for pre-test or off-plan time ranges.
- Generate a single continuous spoken script without `Session 1/2/3` labels.
- Apply brand persona and platform persona separately for each Brand x Platform.
- Generate assigned pattern only, or generate all A/B/C variants for review.
- Copy only the spoken script, copy metadata, export JSON, copy all spoken scripts, and generate again without changing the Product Truth values.
- Keep the existing OCR image upload and crop workflow using Tesseract.js in the browser.
- Build as a static bundle for hosting.

## Workflow

1. Select account, live date, and start time.
2. Keep auto assignment on, or turn it off to choose a manual Pattern A/B/C override.
3. Paste promotion text or load a bundled sample.
4. Generate the assigned script for production use.
5. Use "Generate A/B/C for review" only for comparison. The UI warns that MCs should not switch patterns mid-slot.
6. Copy the main spoken script for MC use. Metadata and JSON export are separate.

## Local Development

```bash
npm test
node dev-server.js
```

Open:

```text
http://127.0.0.1:8000/
```

## Build

```bash
npm run build
```

The build writes the static-hosting worker bundle to:

```text
dist/server/index.js
```

If a new static source file is added, also add it to the `sources` array in `build-site.js`; the production bundle uses that explicit manifest.

## Tests

```bash
npm test
```

The test suite covers:

- primary account visibility and hidden DGMR Shopee readiness
- August 2026 pattern assignment rules
- parser regression across bundled sample promotion files
- Product Truth consistency across A/B/C
- Pattern A/B/C structure and persona differences
- Generate Again behavior
- copy/export/OCR/responsive static checks

## Deployment Notes

The app is static-site compatible and can run on GitHub Pages or OpenAI Sites hosting. The previous GitHub Pages target documented in this project is:

```text
https://towtongisgod.github.io/live-script-generator/
```

The OpenAI Sites project configuration lives in:

```text
.openai/hosting.json
```

Run tests and build before deploying.
