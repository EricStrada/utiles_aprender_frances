# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A small set of browser-only tools for learning French from Spanish. There is **no build system, no package manager, no tests, and no server-side code** — everything is plain static HTML/CSS/JS that runs by opening the file in a browser. The UI language is Spanish; the content language is French.

- `generador.html` — "Gestor de BD" (database manager): browse, edit, merge, and export the dictionary.
- `quiz.html` — vocabulary and verb-conjugation quiz that consumes the dictionary.
- `dictionnaire.json` — the single source of truth, shared by both tools.
- Two PDFs (grammar reference, verb conjugations) are bundled study material, not code.

## Running / developing

Open `generador.html` or `quiz.html` directly in a browser. Both `fetch()` `dictionnaire.json` from the same directory on load (`DB_URL = 'dictionnaire.json'` in quiz.html, `loadDB()` in both).

- `file://` will usually fail the fetch due to CORS. To exercise the auto-load path, serve the folder over HTTP, e.g. `python -m http.server` and visit `http://localhost:8000/quiz.html`.
- Both tools have a manual-import fallback: if the fetch fails, the UI shows a file picker to load `dictionnaire.json` by hand, so they also work from `file://`.
- The published versions run through `htmlpreview.github.io` against the GitHub raw files (see README links).

Each HTML file is fully self-contained (inline CSS + inline JS in one `<script>`). The only external dependencies are loaded from CDNs in `generador.html`: SheetJS/`xlsx` (Excel export) and Google Fonts. Editing means editing the single file directly.

## Data model (`dictionnaire.json`)

This schema is the contract between the two tools — changing it means updating both. Structure:

- `meta` — `columns` (canonical field order for word objects), `tense_levels` (CEFR level per verb tense), `tense_labels` (display names per tense). Quiz difficulty and verb-tense gating derive from these maps, not from hardcoded lists.
- `categories[]` → each has `id`, `nom` (Spanish display name), `subcategories[]` → each has `id`, `nom`, `mots[]`.
- A **word** (`mot`) object: `mot`, `ipa`, `genre`, `autre_genre`, `traductions[]`, `synonymes[]`, `exemple`, `niveau` (CEFR A1–C2), `registre`, `type_mot` (e.g. `nom`, `verbe`).
- A **verb** additionally has `groupe`, `auxiliaire`, and optionally `conjugaisons`.
- `conjugaisons` is keyed by tense id (e.g. `indicatif_présent`), then by person (`je`/`tu`/`il`/`nous`/`vous`/`ils`), each holding `{ forme, ipa }`. Many verbs have **no** `conjugaisons` — code must treat it as optional (`m.conjugaisons || {}`).

## Architecture notes for editing

**generador.html** is organized as tab panels (MERGE / MANAGE / GEN / VERBS). Key flows:
- Filtering is driven by selected niveles/registres/categories Sets (`filterWord`, `getFilteredWords`, `getFilteredData`); `refreshAll`/`renderPreview` re-render from those.
- Merge (`readAndMerge` → `validateDBFormat` → `performMerge` → `mergeArr`) imports another DB file and combines it; always validate format before merging.
- Manage tab (`mg*` functions) does in-place tree editing: rename/move/create/delete categories & subcategories and edit words; edits mutate the in-memory DB and must be re-exported to persist.
- Verb editing (`verbsSaveEdit`) edits `conjugaisons` in the detail view and **syncs back into `DB.categories`** by finding the matching `mot` — keep this sync when changing verb edit code.
- Exports: `exportJSON` (canonical DB), `exportExcel` (SheetJS, styled, one sheet per category + index), `exportCSV`, `exportCategoriesTXT`. The JSON export is what regenerates `dictionnaire.json`.

**quiz.html** has multiple modes selected via `switchMode`: vocab modes plus three verb modes — `tense_id`, `conj_choice`, `conj_write` (`isVerbMode()`). `rebuildPools()` builds the question pool from the filtered DB; **verbs without conjugation data are skipped** for verb modes. Each mode has its own `render*` function; answers go through `handleVocabAnswer` / `handleVerbAnswer` / `checkWrite`. `checkWrite` normalizes input (`normaliseCirc`, `insertOE` for œ) before comparing forms.

## Conventions

- Identifiers and comments mix Spanish and French; match the surrounding style (Spanish for UI/code comments, French for linguistic data).
- When adding a verb tense, update `meta.tense_levels` and `meta.tense_labels` together — both tools read tense metadata from there.
- The versioned filenames in git history (e.g. `generador_v14.html`) are old; the canonical files are the unsuffixed `generador.html` / `quiz.html` / `dictionnaire.json`.
