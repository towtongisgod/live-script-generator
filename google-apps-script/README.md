# Google Docs Export — Apps Script Integration

Integration layer between the static Live Script Generator (GitHub Pages) and
Google Docs. The frontend never holds an OAuth token, Service Account key,
Client Secret, or any Drive-writing credential — it only sends a plain JSON
payload to this Web App, which runs under whichever Google account deploys
it.

```
Live Script Generator (static, GitHub Pages)
        ↓  POST structured JSON (core.js buildExportPayload)
Google Apps Script Web App  (google-apps-script/Code.gs)
        ↓
Create a brand-new Google Doc from scratch (no template file involved)
        ↓
Write Header / Title / Subtitle / Account Summary / Promotion blocks / Policy Guide
        ↓
Move it into the configured Output Folder
        ↓
Return { documentId, documentUrl, documentTitle, createdAt }
```

**There is no separate Master Template Google Doc to create, edit, or keep in
sync.** Every export builds a fresh document from scratch — the full layout
(matching the reference doc's structure) is written directly in
`Code.gs` (`buildDocumentContent_` and friends), the same way the existing
OAuth-based export (`app.js` → `exportToGoogleDoc`) already builds a doc from
scratch rather than copying anything. This means one less manual setup step,
and the layout only ever needs to change in one place (this file) instead of
also needing a template doc edited to match.

---

## 1. Layout reference

If you want to change the visual layout, look at the reference doc
(`1UH24hQhClOnwG_-fOyUx7wNS1On35Oqkbmh_FMRfke0`) for the target structure —
Header, Title, Subtitle, Account Summary table, per-Promotion blocks (price
table → Section 1/2/3 → Short Loop → Q&A → Product Talk), Policy Guide — then
edit the corresponding function in `Code.gs`. There's nothing to copy from
it; it's a visual reference only.

## 2. Template ID — not needed

This integration doesn't use a Template ID. (An earlier version of this
integration copied a Master Template — if you're looking at old notes that
mention `GOOGLE_DOCS_TEMPLATE_ID`, that step no longer applies.)

## 3. How to create an Output Folder

Create (or pick) a Drive folder that all exported documents should land in —
this is also where the exported docs inherit their sharing permissions from,
so set that folder's sharing the way you want new documents to behave (e.g.
shared with your MC team's Group). Copy its folder ID from the URL
(`https://drive.google.com/drive/folders/`**`THIS_PART`**), and set
`GOOGLE_DRIVE_OUTPUT_FOLDER_ID` in Script Properties (Project Settings →
Script Properties → Add script property).

## 4. How to deploy the Apps Script Web App

1. Go to [script.google.com](https://script.google.com), create a new project (or `clasp create` from this folder).
2. Copy `Code.gs` and `appsscript.json` in.
3. Set the Script Property above.
4. **Deploy → New deployment → Web app.**
5. Set **Execute as** and **Who has access** — see the Access Model section below before choosing.
6. Copy the deployment's `/exec` URL — this is `GOOGLE_APPS_SCRIPT_ENDPOINT` for the frontend config.
7. Every time you edit `Code.gs`, you must **Deploy → Manage deployments → Edit → New version** for the live endpoint to pick up the change (editing the script alone does not update a published Web App).

## 5. How to choose Execute As

| Option | Execute as | Who has access | Behavior |
|---|---|---|---|
| **A (recommended for this use case)** | Me (the deploying user) | Anyone within [your Google Workspace domain] | Every export runs with the deploying user's Drive permissions — so the Output Folder just needs to be shared with that one account. Anyone in the company domain can call the endpoint. Documents are owned by the deploying account. **Trade-off:** the deploying account becomes a single point of ownership — if that person leaves, transfer file ownership or redeploy under a shared/service account first. |
| B | User accessing the web app | Anyone within domain | Each caller's own Drive identity is used — they must individually have edit access to the Output Folder, or the export fails. Documents are owned by whoever clicked Export, not a central account. **Trade-off:** more setup (share the folder with every MC/staff account that will export), but no single-point-of-ownership risk, and it's clearer in Drive who created what. |

**Default recommendation: Option A**, deployed under a shared team/service Google account (not a personal one), with **Access: Anyone within the domain** — never "Anyone" (that would let unauthenticated internet traffic trigger doc creation). This matches "safe for an internal team" and avoids needing to individually provision Drive access for every MC.

Either way: **never** set Access to "Anyone" (public/unauthenticated) — the payload validation in Code.gs is a data-integrity check, not an authentication mechanism, and provides no protection against an anonymous internet caller spamming document creation.

## 6. How to restrict who can call it

- Keep the deployment's **Who has access** set to your Google Workspace domain (not "Anyone"), so only signed-in company accounts can call the endpoint at all.
- If you need finer-grained control, add an explicit allow-list check at the top of `doPost` using `Session.getActiveUser().getEmail()` (only available reliably under Option A / domain-restricted deployments) against a Script Property `ALLOWED_EMAILS`.
- Never rely on a token embedded in the frontend JS as your real access control — anyone can read it from GitHub Pages' served files.

## 7. How to connect the Endpoint to the frontend

Set `GOOGLE_APPS_SCRIPT_ENDPOINT` in `config/google-apps-script-config.js` (this repo) to the deployment's `/exec` URL. That file is public configuration (a URL, not a secret) and is safe to commit — same category as the existing `GOOGLE_DOCS_CONFIG.clientId` already committed in `config/google-integration.js`.

## 8. How to change the layout in the future

Edit the relevant function in `Code.gs` (`buildDocumentContent_`, `insertPromotionBlock_`, `insertPriceSummaryTable_`, or `DOCUMENT_THEMES` for colors) and redeploy a new version. No template file to update in parallel.

## 9. How to test Export

Manual Integration Test Checklist (run once after every deploy/redeploy — an Apps Script Web App cannot be exercised from this repo's Node test suite, see `tests/run-tests.js` for the pure-function payload/validation tests that run automatically instead):

1. Generate a script on the live site for each of the 5 accounts.
2. Click **Export to Google Docs (Template)**. Confirm: loading state shows, button disables, no double-submit on rapid double-click.
3. Confirm the returned link opens a **new**, freshly-created Doc.
4. Confirm Brand/Platform/Pattern in the header match what was selected on screen.
5. Confirm price/quantity/gifts in the doc match the Product Truth shown on the result card.
6. Confirm every Section's line breaks are preserved (not collapsed into one paragraph).
7. Re-click Export with the exact same account+date+pattern within a few minutes — confirm it returns the **same** document (no duplicate created).
8. Export a 1-promotion and a 2+-promotion batch — confirm both render correctly, no hardcoded "Promotion 1 / Promotion 2" assumption.
9. Export a Pattern A/B/C **Review** batch — confirm the filename clearly says "Review" and the doc is not mistaken for a production single-Pattern script.
10. Export a promotion with no gift and one with a Final Price — confirm the gift row disappears cleanly (no empty placeholder) and Final Price shows correctly.
11. Open the resulting Doc, then File → Download → PDF and → Microsoft Word (.docx) — confirm layout/line breaks survive both.
12. Confirm the new Doc actually lands in the configured Output Folder (not My Drive root).

## 10. How to roll back

- **Bad deploy:** Manage deployments → select the previous version → make it the active version for that deployment (or redeploy from a reverted `Code.gs`).
- **Bad document already created:** the file is a normal Drive file in the Output Folder — move it to Trash from Drive; this Web App never deletes anything itself, so cleanup is always a manual, deliberate action.

## 11. How to fix Permission errors

- `"You do not have permission..."` → the account executing the script (Option A: the deploying user; Option B: the caller) doesn't have edit access to the Output Folder. Share it with that account/domain.
- `CONFIG_MISSING_OUTPUT_FOLDER_ID` → Script Property not set (see section 3).
- Newly created documents come out **more restricted than expected** → check the Output Folder's own sharing settings; new files inherit from there once moved in, this script never calls any sharing/permission API itself.

## 12. How to verify no secret is committed

```bash
git grep -i "AKIA\|BEGIN PRIVATE KEY\|client_secret\|apps_script_token"
```

There is nothing to find by design: `GOOGLE_DRIVE_OUTPUT_FOLDER_ID` lives only in Apps Script's Script Properties (server-side, never in this repo); the only IDs that ever reach this repo are the public OAuth Client ID (`config/google-integration.js`, pre-existing) and the Apps Script Web App's `/exec` URL (`config/google-apps-script-config.js`) — neither of those grants write access on its own without the caller also being an authorized domain user per the Access Model above.
