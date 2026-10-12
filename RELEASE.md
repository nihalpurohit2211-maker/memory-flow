# MemoryFlow — Release Notes & Verification Report

**Release Version:** 1.0.0 (Final Reliable Shareable Release)  
**Date:** 2026-10-12  
**Public Repository:** [https://github.com/nihalpurohit2211-maker/memory-flow](https://github.com/nihalpurohit2211-maker/memory-flow)  
**Loopback URL:** [http://127.0.0.1:5173/](http://127.0.0.1:5173/)  
**Collection Route:** [http://127.0.0.1:5173/c/elevate](http://127.0.0.1:5173/c/elevate)  

---

## 1. Executive Summary

This release delivers the complete, audited, and production-ready MemoryFlow platform. All 8 core requirements from the user specification have been implemented, tested, audited by an independent Reviewer subagent, and verified.

The application operates as a local-first, privacy-respecting photo/video experience with light theme aesthetics, persistent server storage via SQLite (`better-sqlite3`), robust viewer interactions, zero-shot scene classification, cross-photo place clustering, visitor contributions with organizer review queues, and production-grade security.

---

## 2. Key Changes & Technical Solutions

### Area 1: Rebuilt Image Viewing & Decoder Resilience
* **Removed Hover-to-Open:** Cards never trigger full modals, focus transfers, or route changes on hover. Opening the viewer is strictly gated behind deliberate click or tap.
* **In-Card Quality Upgrade:** Dwell hovering or focusing a Flow card for 1.0 second initiates an in-card resolution upgrade (`thumbnailUrl` or `=s640`). Moving the pointer away or blurring focus immediately aborts the pending request.
* **White Band Investigation & True Root Cause:**
  - *Layout mismatch:* Previous viewer used two overlapping `<img>` tags (low-res thumbnail in-flow and high-res overlay positioned absolute) which had differing bounding boxes and aspect-ratios.
  - *Decoder behavior on incomplete streams:* Camera files with missing scan lines (e.g., truncated camera JPEGs) cause standard browsers to fill the remaining declared frame height with blank/white pixels.
  - *Solution:* Rebuilt the viewer with a single active `<img key={currentMedia.id}>` tag. Damaged streams are identified via byte integrity analysis, flagged with `isDamaged = true`, and presented with an honest notice and direct download link.
* **JPEG Byte-Repair Audit:** Clarified that appending `0xFF, 0xD9` allows decoders to parse the top rows without throwing syntax errors, but **does not recover missing image pixels**. MemoryFlow never mutates original files on disk.
* **Single Active-Media Navigation:** Arrow keys and touch swipes cleanly switch media without crossfade or image stacking. Incrementing request IDs (`activeRequestIdRef`) reject stale loads during rapid navigation. Zoom/pan resets to 1x and previous videos are paused immediately.

### Area 2: Viewer Details and Authentic Downloads
* **Authentic Raw File Downloads:** "Download original" fetches the raw file bytes preserving filename via `/api/collections/:slug/download/:mediaId` (not canvas exports or recompressed buffers).
* **Contributor Attribution:** Verified contributor names are prominently displayed; unverified names receive clear labeling; unknown contributors are marked "Contributor unknown". Drive owners are never falsely attributed as photographers.
* **Interactive Metadata Chips:** Short chips for moment, place, and activity with horizontal touch/keyboard scroll and group navigation.

### Area 3: People, Places & Scene Classification
* **8 Calibrated Activity & Scene Tags:**
  - Standard tags: `group photo`, `person speaking`, `stage performance`, `rehearsal`, `preparation`, `auditorium`, `classroom`, `outdoors`.
  - Prototype vectors use zero-mean calibration and variance filtering (`targetVariance < 1e-4`), preventing false positives on solid colors or flat noise.
* **Cross-Photo Place Grouping:** Visual clustering identifies places across the entire collection regardless of capture time, without the 90-minute moment constraint.
* **Admin Place Management:** Organizers can rename places (e.g., "Sabian Hall") and merge duplicate places with atomic database operations.
* **Privacy First:** People/facial grouping is **OFF by default** (`people_grouping_enabled = 0`).

### Area 4: Shared Server-Side Persistence & Performance
* **Persistent SQLite Backend:** Powered by `better-sqlite3` at `data/memoryflow.db` with WAL mode and foreign key enforcement.
* **Idempotent Schema Migrations:** Auto-creates tables and migrates legacy JSON records on startup.
* **Hot Online Backups:** `backupDatabase()` takes instantaneous database snapshots without locking concurrent reads.
* **Zero Client Model Downloads:** Visitors do NOT download AI models or run embedding indexing. All indexing is performed server-side or by the admin.

### Area 5: Viewer Contributions & Review Queue
* **Multer File Storage:** Contributor uploads are safely saved to `uploads/pending/` with randomized unique names.
* **File Validation:** Strictly enforced 25MB limit on images and 100MB on videos on both client and server.
* **Review Queue:** Admin can review submissions and approve (integrating them into the collection with verified attribution) or reject them.

### Area 6: Complete Backend & Release Security
* **Password Hashing:** 100,000 PBKDF2 rounds (SHA-512) with random salts and timing-safe comparison (`crypto.timingSafeEqual`).
* **Server-Enforced Sessions:** Admin sessions are tracked in SQLite with 24-hour expiration.
* **Rate Limiting:** 5 failed attempts per 15 minutes per IP with HTTP 429 cooldown headers.
* **Access Epoch Invalidation:** Passphrase or visibility changes increment the `access_epoch`, instantly revoking all active visitor tokens.
* **Clean .gitignore:** Database files, backups, uploads, caches, and secrets are strictly excluded from source control.

---

## 3. Independent Audit Findings & Fixes

The independent Release Auditor subagent audited the codebase and reported:
- **Image Viewing Rebuild:** PASSED
- **Viewer Details & Downloads:** PASSED
- **People, Places & Activities:** PASSED
- **Process Once & SQLite Persistence:** PASSED
- **Viewer Contributions:** PASSED (with 1 recommendation)
- **Security & Password Hashing:** PASSED (with 1 recommendation)
- **Test Suite & Production Build:** PASSED

### Actioned Recommendations:
1. **Defect 1 Fixed:** Added `data/*.db*`, `data/backups/`, and `uploads/` to `.gitignore`. Confirmed with `git status` that no database files or user uploads are tracked.
2. **Defect 2 Fixed:** Enforced 25MB image file limit and 100MB video file limit directly on the server in `server/apiRouter.ts`.

---

## 4. Test Suite & Build Evidence

- **Unit Tests:** 8/8 test suites passed, 39/39 tests passed (`npm test`):
  - `server/__tests__/sqliteBackup.test.ts` (3 tests)
  - `server/__tests__/storageAndSecurity.test.ts` (6 tests)
  - `src/lib/ai/__tests__/embeddingAudit.test.ts` (6 tests)
  - `src/lib/ai/__tests__/sceneClassification.test.ts` (4 tests)
  - `src/lib/__tests__/imageRepairAndCdn.test.ts` (5 tests)
  - `src/lib/__tests__/largeFixture.test.ts` (1 test)
  - `src/lib/__tests__/phase2DriveAndAI.test.ts` (9 tests)
  - `src/lib/__tests__/stage2.test.ts` (5 tests)
- **TypeScript Compilation:** Passed with 0 errors (`npm run typecheck`).
- **Production Build:** Succeeded in 11.16s (`npm run build`). Assets generated cleanly in `dist/`.

---

## 5. Deployment & Hosting Preparation

- **Containerization:** `Dockerfile` provides multi-stage build on Node 20 Alpine.
- **Render Configuration:** `render.yaml` specifies environment, build commands, and start scripts.
- **Local Dev / Preview:**
  ```bash
  npm run dev       # Development server on 127.0.0.1:5173
  npm run preview   # Production preview on 127.0.0.1:5173
  ```
