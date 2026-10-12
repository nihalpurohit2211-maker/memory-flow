# MemoryFlow — Start Here

MemoryFlow is a light, local-first web application for discovering an event through photos and videos. It features Memory Flow with intentional editorial layouts, full-contain high-res image and video viewing with interactive zoom/pan, deliberate hover pre-activation, related moment navigation, Take Me Somewhere discovery, Timeline with authentic camera capture timestamps, a spatial 2D Memory Map, real local CPU-optimized visual embeddings (`Xenova/clip-vit-base-patch32`), multi-signal grouping ("One moment, many cameras"), and authenticated shareable collections with server-side password enforcement and rate limiting.

---

## 🌐 Public Repository & Links
- **GitHub Repository (Public):** [https://github.com/nihalpurohit2211-maker/memory-flow](https://github.com/nihalpurohit2211-maker/memory-flow)
- **Local Application URL:** [http://127.0.0.1:5173/](http://127.0.0.1:5173/)
- **Direct Collection URL:** [http://127.0.0.1:5173/c/elevate](http://127.0.0.1:5173/c/elevate)

---

## 🚀 Running the App (Verified)

### 1. Installation
```bash
npm install
```

### 2. Start Local Development Server
```bash
npm run dev
```
- **Verified Local Address:** [`http://127.0.0.1:5173/`](http://127.0.0.1:5173/)
- The server binds strictly to loopback (`127.0.0.1`) on port `5173` with `--strictPort`.

### 3. Production Build & Loopback Preview
```bash
# Typecheck TypeScript source (0 errors)
npm run typecheck

# Build optimized production bundle
npm run build

# Preview production build strictly on 127.0.0.1:5173
npm run preview
```

### 4. Automated Test Suite (30 Tests Passing)
```bash
npm test
```
Runs the 6 Vitest test suites covering:
1. `src/lib/ai/__tests__/embeddingAudit.test.ts` — AI model specs, vector ops throughput, near-duplicate detection at 95%, and multi-signal time separation.
2. `server/__tests__/storageAndSecurity.test.ts` — Server collection storage, PBKDF2 hashing, HMAC visitor tokens, access epoch revocation, and IP rate limiting.
3. `src/lib/__tests__/imageRepairAndCdn.test.ts` — JPEG byte buffer corruption repair and Google CDN `=s0` uncropped URL construction.
4. `src/lib/__tests__/phase2DriveAndAI.test.ts` — Google Drive link parsing, EXIF camera timestamps, admin security guards, and multi-camera clustering.
5. `src/lib/__tests__/stage2.test.ts` — Media processor SHA-256 duplicate content detection and recommendation diversity.
6. `src/lib/__tests__/largeFixture.test.ts` — 1,000-record synthetic performance test.

---

## 🔒 Security, Roles & Shareable Collections

### 1. Admin Role & Sharing Panel
- Click the **Visitor / Admin** toggle in the header. Default admin passphrase is `admin123`.
- In Admin mode, click **Sharing** to manage the collection:
  - **Public:** Accessible by anyone who navigates to `/c/elevate`.
  - **Unlisted:** Excluded from public index listings; accessible via link.
  - **Password Protected:** Requires a passphrase to view collection data, images, and moments.
  - **Password Hint:** Optional hint displayed on the password prompt.
  - **Copy Link:** Copies `/c/elevate` with a localhost warning banner.
  - **Preview Visitor View:** Immediately tests the visitor unlock experience.

### 2. Server-Side Security & Rate Limiting
- **Password Hashing:** Passwords hashed with PBKDF2 (10,000 iterations, SHA-512) and verified using constant-time `crypto.timingSafeEqual`.
- **IP Rate Limiting:** Limits failed password attempts to 5 per 15-minute window per IP, returning HTTP 429 with retry cooldown.
- **HMAC Session Tokens:** Successful unlocks receive an HMAC-signed visitor session token with 12-hour expiry.
- **Instant Revocation:** Changing visibility or updating the password increments the `accessEpoch`, instantly invalidating all existing visitor tokens.
- **Credential Protection:** Google Drive API keys, service accounts, and password hashes are never exposed to clients.

---

## 🖼️ Image Viewing & Decoder Resilience

- **Contain-Fit Uncropped Full View:** Images open in contain-fit mode (`object-contain`), preserving exact photographic aspect ratios without letterbox distortion or clipping.
- **Interactive Zoom & Pan (1x to 4x):** Zoom controls in toolbar, keyboard shortcuts (`+`, `-`, `0`), mouse wheel zoom, and 2D drag-panning.
- **1.5s Deliberate Hover Pre-Activation:** Hovering a thumbnail for 1.5 seconds shows an animated progress bar and opens the viewer. Pointer leave immediately cancels the timer.
- **Suppression of Reopening Loops:** Closing the viewer suppresses hover re-triggering for 1.5s until a new deliberate hover occurs.
- **Mobile Touch Optimization:** Touch devices detect `(pointer: coarse)` and require tap-only opening.
- **Progressive Dual-Layer Display:** Instant thumbnail preview replaced smoothly after asynchronous `HTMLImageElement.decode()`.
- **Google CDN `=s0` Links:** Direct high-res CDN links bypass Google Drive HTML virus scan pages and CORS restrictions.
- **JPEG Corruption Repair:** Detects and appends missing EOI (`0xFF, 0xD9`) markers on truncated camera JPEGs.

---

## 🧠 Local AI & Multi-Signal Grouping

- **Model:** Quantized `Xenova/clip-vit-base-patch32` running via ONNX Runtime Web on WASM CPU (int8 ~87 MB).
- **Fallback:** 64-dimensional normalized spatial perceptual feature extractor.
- **Bounded Hardware Footprint:** Concurrency bounded to 1 with 30ms event loop yields, accommodating dual-core CPUs with low RAM.
- **Multi-Signal Rules:**
  - Close capture times (<45m) + visual match ($\ge 0.65$) = "One moment, many cameras".
  - Distant capture times (>90m apart) = Strictly separated into distinct moments regardless of visual similarity.
  - Unknown capture times = Kept strictly provisional with neutral labels.
  - Near-duplicates ($\ge 95\%$ similarity) = Flagged without deleting originals.

---

## 🐳 Hosting & Deployment Preparation
- **Dockerfile:** Multi-stage production container build on Node 20 Alpine.
- **render.yaml:** Blueprint for deploying on Render.com web services.
- **Environment Template:** See `.env.example` for environment variable options.
