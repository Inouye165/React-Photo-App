# Project Status & Deep Dive

This isn't a traditional roadmap. It's a log of what I've actually built, why I built it that way, and the messy engineering reality behind the features.

I'm not interested in building another "To-Do List" app. I wanted to tackle the stuff that usually breaks in production: heavy files, slow networks, and security that actually works.

---

## The Architecture (How It Actually Works)

Most tutorials show you a frontend talking to a database. That falls apart when you have 50MB files or long-running AI tasks. Here's how I wired this thing up to survive the real world.

### 1. The "Zero-Disk" Upload Pipeline
**The Problem:** Saving files to the server's disk (`/tmp`) crashes your server when 10 users upload at once.
**My Solution:** I use **Busboy** to stream the incoming file directly to **Supabase Storage**.
*   The server never holds the full file in RAM.
*   It calculates the SHA-256 hash *while* the bytes are flying through.
*   If the upload fails halfway, no garbage is left on my server.

### 2. The "Don't Block the User" Queue
**The Problem:** Generating thumbnails and running AI takes 5-10 seconds. You can't make the user wait that long just to see "Upload Complete."
**My Solution:** **BullMQ + Redis**.
*   The API says "Received!" immediately (202 Accepted).
*   A background worker picks up the job later.
*   It handles the heavy lifting: resizing, HEIC conversion, and calling OpenAI.
*   If the AI service is down, the job retries automatically. No crashed requests.

### 3. The "Real" Security Layer
**The Problem:** Frontend security is fake. Anyone can edit JavaScript variables.
**My Solution:** **Row-Level Security (RLS)** in Postgres.
*   I don't trust my own backend code to filter data perfectly every time.
*   I defined policies in the database: `auth.uid() = owner_id`.
*   Even if I write a bug in the API, the database literally refuses to return someone else's photos.

---

## What's Built (The "Hard" Stuff)

### Infrastructure & Core
- [x] **Streaming Uploads:** Direct-to-cloud piping. No disk usage.
- [x] **HEIC Support:** Because iPhones are everywhere. Auto-converts to JPEG for the web.
- [x] **Cursor Pagination:** Infinite scroll that actually scales. No `OFFSET` queries slowing down the DB.
- [x] **Dockerized Dev Env:** Local Postgres and Redis that match production exactly.
- [x] **Strict Content Security Policy (CSP):** I spent days fighting CSP headers so XSS attacks don't stand a chance.

### AI & Intelligence (LangGraph)
I didn't just want "smart tags." I wanted a system that thinks.
- [x] **Orchestrated Pipeline:** It's not one prompt. It's a graph.
    1.  Extract GPS.
    2.  Look up the location (Reverse Geocoding).
    3.  *Then* ask the Vision Model: "Given we are at a sushi restaurant in Tokyo, what is this dish?"
- [x] **Food Detective:** It cross-references visual data with real restaurant menus nearby.
- [x] **Collectibles Valuation:** It tries to grade comic books and estimate prices based on condition.

### Developer Experience
- [x] **1,100+ Tests:** I don't like breaking things. Frontend (Vitest) and Backend (Jest) are fully covered.
- [x] **Stress Testing:** I wrote scripts to hammer the server with uploads to prove the queue works.

---

## Real-time Photo Processing Events (Stream-first)

The app uses **Server-Sent Events (SSE)** to receive `photo.processing` updates as the backend finishes AI/image processing.

### Feature flag + kill switch
- **Client flag (default off):** set `VITE_ENABLE_PHOTO_EVENTS=true` to enable the SSE client.
- **Server kill switch:** set `REALTIME_EVENTS_DISABLED=true` to make `/events/photos` return `503`.

### Runtime behavior
- When SSE is enabled and healthy, the client marks streaming as active and **does not run polling loops concurrently**.
- If SSE is disabled (flag off), rejected (e.g., `503` kill switch / `429` connection cap), or fails repeatedly, the client **falls back to HTTP polling**.
- To avoid flapping, after **3 consecutive connect/disconnect failures** in a single session the client prefers polling for the rest of that session.
- Event application is **deduped** using event IDs to prevent double-updates.

### How to verify locally
- In DevTools Network, watch a long-lived request to `/events/photos` with response `Content-Type: text/event-stream`.
- Trigger AI processing and observe `photo.processing` SSE frames.
- Set `REALTIME_EVENTS_DISABLED=true` on the server and confirm `/events/photos` returns `503` and the UI continues updating via polling.

---

## Future Ideas (The "Maybe" List)

I'm not committing to dates. These are just things I want to explore when I have time.

*   **Facial Recognition:** But only if I can do it locally/privately.
*   **Natural Language Search:** "Show me the photos of the dog from last summer."
*   **Public Sharing:** Generating secure, time-limited links for friends.
*   **Video Support:** Handling MP4s is a whole new beast (transcoding, streaming) that I want to tackle next.

---

## Known Rough Edges

*   **The UI is "Engineer Art":** It works, but it's not winning design awards yet.
*   **English Only:** The AI currently only speaks English.
*   **Self-Hosted:** There's no "Sign Up" button for the public yet. You have to run it yourself.
