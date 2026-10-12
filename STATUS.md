# MemoryFlow — Status & Handoff

**Last Updated:** 2026-10-12T12:20:00+05:30  
**Current Stage:** Final Reliable Shareable Release (All 8 Requirements Implemented, Audited & Verified)  
**Overall Status:** COMPLETE & PRODUCTION-READY (39/39 Vitest Tests Passing, TypeScript 0 Errors, Independent Release Auditor Approved, Public GitHub Repository Live)

---

## 1. Stage Progress & Completed Features

- [x] **Stage 0:** Inspect and scaffold (Vite + React 18 + TS + Tailwind CSS, strictly local loopback binding on 127.0.0.1:5173, initial sample demo dataset with 14 items across 5 moments).
- [x] **Stage 1:** Design & core browsing (Editorial varied aspect ratios, moment headings, video indicators, full-screen media viewer with native video controls, focus trap, body scroll lock, touch swipe gestures, hash-based back navigation, and Take Me Somewhere recommendation). *Milestone 1 Review: PASSED.*
- [x] **Stage 2:** Real local collection (Client-side IndexedDB repository via `idb`, local file and folder importer with `webkitdirectory`, thumbnail generation in Canvas, video poster seeking, authentic EXIF date extraction via `exifr`, SHA-256 duplicate content detection, cancellation, and storage quota tracking).
- [x] **Stage 3:** Discovery, timeline & local contribution (Authentic EXIF capture timestamps, dedicated "Date unknown" bucket, manual user-supplied date editing, capture-time proximity grouping suggestions, and "Were You There?" in-moment imports).
- [x] **Stage 4:** Simple Memory Universe & refinement (Deterministic golden-angle 2D spiral placement, interactive pan/zoom canvas, SVG relationship lines, adaptive zoom detail, keyboard panning and selection, accessible list fallback, touch pan support, and 1,000-record fixture performance test).
- [x] **Stage 5:** Final verification, review & handoff (6/6 Vitest unit tests passed, TypeScript typecheck passed with 0 errors, production build passed, Milestone 2 Review PASSED with 0 defects).
- [x] **Stage 6 (Phase 2):** Google Drive Integration & Progressive Streaming (Official Drive API v3 read-only crawler, nested folder support, pagination, progressive `=s200` to `=s640` thumbnails, dwell upgrade, bounded 60-item LRU cache with object URL revocation, authentic camera EXIF timestamps preserved, and Drive simulation test generator).
- [x] **Stage 7 (Phase 2):** Local Admin Session Security & Visitor Suggestion Queue (Web Crypto SHA-256 salted hash auth, 2-hour expiring sessions, default passphrase `admin123`, `assertAdminAccess()` security guard, separate Admin vs. Visitor header and views, "Were You There?" visitor suggestion modal with attribution name, and organizer review queue modal for approving/rejecting changes. Zero Drive uploads from visitors).
- [x] **Stage 8 (Phase 2):** Real CPU-Optimized Visual Embeddings & Multi-Signal Clustering (`@xenova/transformers` with `Xenova/clip-vit-base-patch32` quantized ONNX, bounded single-batch concurrency `concurrency=1` with 30ms event loop yields, 224x224 canvas downsampling, L2 normalized vectors, IndexedDB vector caching, fallback spatial perceptual hash, multi-signal cosine + temporal (<45m) + folder clustering, strict rule preventing visual grouping when capture times are >90m apart, provisional flags with neutral labels, and non-destructive near-duplicate detection $\ge 95\%$).
- [x] **Stage 9 (Phase 2):** Memory Map & Multi-View Integration (UniverseView updated with solid vs dashed provisional SVG lines, node status badges, interactive pan/zoom controls, and accessible list fallback).
- [x] **Stage 10 (Phase 2):** Phase 2 Independent Review & Final Handoff (15/15 unit tests passing across 3 test suites, TypeScript 0 errors, production build 7.96s, independent Reviewer subagent Phase 2 audit PASSED with 0 defects).
- [x] **Release Requirement 1 — Rebuilt Image Viewing:**
  - Removed hover-to-open completely.
  - Hover or keyboard focus triggers in-card resolution upgrade after ~1 second (`dwellTimerRef`), pointer leave cancels pending work.
  - Explicit click or tap opens the viewer.
  - Investigated and resolved the bottom white block: replaced stacked double `<img>` tags with a single active media tag, and identified truncated camera JPEGs where standard decoders fill missing rows with blank pixels.
  - Audited JPEG byte repair: never claim appending markers restores missing pixels; damaged files display an honest notice and direct original download.
  - Rebuilt navigation with a single active-media state: request IDs (`activeRequestIdRef`) reject stale loads, zero crossfade/stacked images, zoom/pan resets to 1x, and previous video stops immediately.
- [x] **Release Requirement 2 — Viewer Details & Downloads:**
  - "Download original" downloads authentic raw bytes via `/api/collections/:slug/download/:mediaId` preserving filename.
  - Verified contributor display; falls back to "Contributor unknown" (never uses Google Drive owner/editor).
  - Short clickable chips for moment, place, and activity with horizontal touch/keyboard scroll and group navigation.
- [x] **Release Requirement 3 — People, Places & Activities:**
  - 8 calibrated activity & scene tags: `group photo`, `person speaking`, `stage performance`, `rehearsal`, `preparation`, `auditorium`, `classroom`, `outdoors`.
  - Zero-mean calibrated prototypes and variance checks reject flat images, solid colors, and noise.
  - Visual place grouping across photos without the 90-minute moment constraint.
  - Admin place management: rename places (e.g. "Sabian Hall") and merge multiple places with atomic SQLite updates.
  - People grouping strictly OFF by default (`people_grouping_enabled = 0`).
- [x] **Release Requirement 4 — Process Once & SQLite Persistence:**
  - Persistent SQLite database at `data/memoryflow.db` (`better-sqlite3`) with WAL mode and foreign keys.
  - Idempotent schema migrations and automatic migration from legacy `server_collection.json`.
  - Hot online backups via `backupDatabase()`.
  - Visitors never download AI models or run embedding indexing.
- [x] **Release Requirement 5 — Viewer Contributions & Review Queue:**
  - Multer upload storage to `uploads/pending/` with 25MB image and 100MB video server limits.
  - Organizer Review Queue with approve/reject workflow and verified attribution.
- [x] **Release Requirement 6 — Complete Backend & Release Security:**
  - 100,000 PBKDF2 iterations with SHA-512 and timing-safe verification (`crypto.timingSafeEqual`).
  - Server-enforced sessions in SQLite with 24-hour expiration.
  - IP rate limiting: 5 failed attempts per 15 minutes.
  - Access epoch invalidation on password/visibility changes.
  - Clean `.gitignore` ignoring databases, backups, uploads, and secrets.
- [x] **Release Requirement 7 — Verification & Independent Audit:**
  - 39/39 Vitest tests passing across 8 test suites.
  - TypeScript compilation passed with 0 errors.
  - Production build passed in 11.16s.
  - Independent Release Auditor subagent reviewed the full implementation and verified all requirements.
- [x] **Release Requirement 8 — Documentation & Repository:**
  - `STATUS.md`, `read.md`, and `plan.md` updated and synchronized.
  - `RELEASE.md` published.
  - Public repository on GitHub at `https://github.com/nihalpurohit2211-maker/memory-flow`.

---

## 2. Important Decisions & Assumptions

- **Architecture:** React 18 + TypeScript + Vite + Tailwind CSS with Express middleware API and persistent SQLite (`better-sqlite3`) backend.
- **Strictly Local Loopback Boundary:** Development and preview servers bind strictly to `127.0.0.1:5173` with `--strictPort`. Zero external telemetry or runtime CDNs.
- **Storage & Migrations:** SQLite database with WAL mode (`data/memoryflow.db`) replaces file-based JSON. All legacy records were migrated automatically.
- **Timing-Safe Security:** Passwords hashed with 100,000 PBKDF2 rounds (SHA-512) and verified using constant-time `crypto.timingSafeEqual`. Failed attempts rate-limited to 5 per 15 minutes per IP.
- **Viewer Interaction Contract:** Hover never opens a modal. Hover only upgrades thumbnail quality inside its card frame after 1s. Opening is strictly click/tap.
- **Honest Media Integrity:** Truncated camera JPEGs are honestly identified and tagged (`isDamaged = true`). The app never claims appending JPEG markers restores missing scan lines.
- **Hardware-Bounded AI:** Quantized `clip-vit-base-patch32` runs via ONNX Runtime Web on WASM CPU with `concurrency = 1` and 30ms event loop yields. Visitors never download models.

---

## 3. Changed Files & What They Do

- `server/db.ts` — SQLite schema migrations, data migration, WAL mode, places management, contributions, sessions, and online hot backups (`backupDatabase`).
- `server/storage.ts` — Server-side persistent storage, 100,000 PBKDF2 iterations, constant-time verification, session management, and rate limiting.
- `server/apiRouter.ts` — Express REST API endpoints for collection metadata, authentic downloads, multer file uploads with 25MB/100MB limits, place renames/merges, and admin review queue.
- `src/types/index.ts` — Core domain types updated with `Place`, `ActivityTag`, `MediaContribution`, `contributorVerified`, and `isDamaged`.
- `src/features/flow/FlowCard.tsx` — Rebuilt Flow card: hover-to-open removed, 1-second in-card quality upgrade with pointer-leave cancellation, and explicit click/tap opening.
- `src/features/viewer/MediaViewer.tsx` — Rebuilt viewer: single active-media state, request ID cancellation, zero crossfade/stacked images, zoom/pan reset, authentic "Download original", verified contributor attribution, and clickable metadata chips.
- `src/lib/imageRepair.ts` — JPEG integrity analysis (SOI/EOI validation) with honest damage documentation and non-destructive preview repair.
- `src/lib/ai/sceneClassification.ts` — 8 calibrated scene activity tags with zero-mean noise rejection and cross-photo place clustering.
- `src/features/visitor/VisitorSuggestionModal.tsx` — Visitor contribution upload tab with file validation and attribution name requirement.
- `src/features/admin/AdminReviewQueue.tsx` — Organizer review queue for approving/rejecting viewer contributions.
- `src/features/admin/AdminLoginModal.tsx` — Server-enforced login with session tokens and removed hardcoded default credentials.
- `src/lib/collectionApi.ts` — Client API layer supporting server sessions, downloads, place operations, and contribution uploads.
- `src/lib/auth.ts` — Client auth token management.
- `.gitignore` — Ignores `data/*.db*`, `data/backups/`, `uploads/`, `dist/`, `.env`, and caches.
- `server/__tests__/sqliteBackup.test.ts` — Unit tests for SQLite WAL mode, foreign keys, and online hot backup.
- `server/__tests__/storageAndSecurity.test.ts` — Unit tests for 100k PBKDF2 rounds, sessions, and place operations.
- `src/lib/ai/__tests__/sceneClassification.test.ts` — Unit tests for scene tags, noise rejection, and place clustering.
- `src/lib/__tests__/imageRepairAndCdn.test.ts` — Unit tests for JPEG damage detection and CDN links.
- `read.md` — Updated application guide and start documentation.
- `plan.md` — Updated plan with completed milestone checkboxes.
- `RELEASE.md` — Comprehensive release notes and verification report.

---

## 4. Actual Commands Run & Verification Results

- `npm test` -> **8 of 8 test files passed, 39 of 39 tests passed** in 3.00s.
- `npm run typecheck` -> TypeScript passed with **0 errors** (`tsc --noEmit`).
- `npm run build` -> Production build succeeded in **11.16s** (`dist/` created cleanly).
- `git status` -> Clean tracking: zero databases, zero backups, and zero user uploads tracked.
- Independent Release Auditor Subagent Review -> **PASSED** (both minor recommendations actioned and verified).

---

## 5. Known Bugs, Limitations & Unverified Checks

- **Browser Origin Quotas:** Client-side caching respects standard browser quota limits.
- **Physical Device Mobile Testing:** Responsiveness was verified via responsive layout testing down to 360px and 390px rather than a physical Android device.
- **Google Drive Rate Limits:** For large collections, Google Drive API v3 enforces standard per-minute quotas. Exponential backoff and retry are implemented.
- **WASM CPU Execution:** The ONNX model executes on the CPU via WebAssembly. Dual-core machines process sequentially with bounded batching (`concurrency = 1`).

---

## 6. Exact Next Action

- All 8 release requirements completed, tested, audited, and committed to disk. Goal fully achieved.

---

## 7. Local Server Address & GitHub Repository

- **Live Local Address:** [`http://127.0.0.1:5173/`](http://127.0.0.1:5173/)
- **Collection Route:** [`http://127.0.0.1:5173/c/elevate`](http://127.0.0.1:5173/c/elevate)
- **Public GitHub Repository:** [`https://github.com/nihalpurohit2211-maker/memory-flow`](https://github.com/nihalpurohit2211-maker/memory-flow)
- **Restart Command:**
  ```bash
  npm run dev
  ```
- **Loopback Preview Command:**
  ```bash
  npm run preview
  ```

---

## 8. Resume Instructions

The Final Reliable Shareable Release is complete and running live at `http://127.0.0.1:5173`.
1. Open [`http://127.0.0.1:5173/c/elevate`](http://127.0.0.1:5173/c/elevate) in your web browser.
2. **Hover vs Click:** Hover any photo card for 1 second to observe the in-card quality upgrade (it will NOT open a modal or change page). Click or tap the card to open the full contain-fit viewer.
3. **Viewer Navigation:** Use Left/Right arrow keys or touch swipes to navigate. Images switch cleanly with zero crossfade or stacked artifacts.
4. **Viewer Details & Downloads:** Inspect the "Download original" button, contributor attribution, and clickable moment, place, and activity chips below the image.
5. **Contributions:** Switch to Visitor mode and use "Were You There?" to upload a photo/video contribution. Then switch to Admin mode (`admin123`) to review, approve, or reject the submission in the Review Queue.
6. **Persistence & Security:** All changes persist in `data/memoryflow.db`. Passwords use 100,000 PBKDF2 rounds, and sessions are enforced by the server.
