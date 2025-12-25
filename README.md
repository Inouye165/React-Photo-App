# Lumina

![Status: Prototype](https://img.shields.io/badge/status-prototype-yellow.svg)
[![Tests](https://img.shields.io/badge/tests-vitest%20%2B%20jest-brightgreen.svg)](TESTING.md)
[![Security](https://img.shields.io/badge/security-JWT%20%2B%20RLS-blue.svg)](https://supabase.com/docs/guides/auth)
[![HEIC Support](https://img.shields.io/badge/HEIC-Auto%20Convert-orange.svg)](https://en.wikipedia.org/wiki/High_Efficiency_Image_Format)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://reactjs.org/)
[![License](https://img.shields.io/badge/license-Restricted-red.svg)](LICENSE)

Lumina is a photo workspace I'm building. The main goal? Stop doing simple tutorials and actually build something that handles the messy, hard stuff—like real security, heavy file uploads, and architecture that doesn't fall apart.

The frontend is still rough (I'm working on it), but I've spent a ton of time making the backend and security production-grade. Eventually, I want this to be a place where you can share photos without handing over your data to big tech.

**Author:** Ron Inouye ([@Inouye165](https://github.com/Inouye165))

## Why I'm Building This

I wanted to see what it actually takes to ship a secure, cloud-deployed app. Not just the "happy path" you see in guides, but the real deal.

My focus has been on:
*   **Not breaking things:** Architecting it so I can add features later without rewriting everything.
*   **Security that isn't fake:** Using Row-Level Security (RLS) from the start, not patching it in later.
*   **Modern tools:** Getting my hands dirty with Supabase, Docker, and real deployment pipelines.

It's definitely an engineering prototype right now. I care more about the engine than the paint job.

## The Vibe

*   **Privacy is the default:** Everything starts with "can other people see this?" (The answer should be no).
*   **No Security Theater:** I'm trying to be honest about what's secure and what's still a WIP.

## The Tech Stack (The Interesting Parts)

This isn't just a wrapper around an API. Here's what's actually happening under the hood:

*   **Testing:** There are over 1,100 tests here. I'm trying to be disciplined about it.
*   **Streaming Uploads:** No saving to disk first. Files stream directly to the cloud to keep the server light.
*   **Background Jobs:** I'm using BullMQ and Redis to handle the heavy lifting (thumbnails, AI analysis) so the UI doesn't freeze.
*   **AI Stuff:** Using LangGraph to organize the AI logic instead of just spaghetti-coding API calls.
*   **HEIC Support:** Because iPhones exist, I added auto-conversion to JPEG.
*   **Cursor-Based Pagination:** I implemented proper cursor pagination so the app doesn't choke when you have 10,000 photos.

## Cool Features & Experiments

### AI Photo Concierge
I'm playing around with some AI features:
*   **Detection:** It can spot dogs, food, etc.
*   **Logic:** It tries to figure out if a food photo matches a restaurant, or if that comic book is a collectible.
*   **Context:** It tries to name mountains or landmarks in the background.

### Backend & Security
*   **Zero-Disk Streaming:** Uploads go straight to Supabase.
*   **Bearer Auth:** Standard token-based auth.
*   **CSRF Protection:** Checking origins on state-changing requests.
*   **Secret Scanning:** I have checks in place to stop me from committing API keys.

## How Uploads Work

Most tutorials tell you to save a file to the server, then upload it. I hate that because it fills up the disk. Here's how I do it:

1.  **Stream:** Photo goes from you -> Supabase Storage.
2.  **Verify:** We check the hash on the fly.
3.  **Queue:** A background job picks it up.
4.  **Process:** Workers extract the EXIF data, make thumbnails, and run the AI.
5.  **Update:** The frontend refreshes the gallery immediately. Simple and effective.

## Running It Locally

If you want to poke around:

**Prerequisites:** Node 20+, Docker (you need this for the DB and Redis).

```bash
# 1. Install dependencies
npm install
cd server && npm install && cd ..

# 2. Spin up local services
docker-compose up -d db redis

# 3. Setup environment
cp server/.env.example server/.env

# 4. Run migrations
cd server && npx knex migrate:latest --knexfile knexfile.js && cd ..

# 5. Start development (you'll need 3 terminals)
npm run dev           # Frontend
cd server && npm run dev # Backend
cd server && npm run worker # Background Worker
```

**Heads up:**
*   You need the worker running or thumbnails won't happen.
*   If you don't have the Google Maps keys, the map stuff just won't work.
*   The backend needs an OpenAI key to start (unless you're in test mode).

## Docs

*   [Testing Guide](TESTING.md)
*   [Project Status & Deep Dive](docs/STATUS.md)
*   [Security Checklist](docs/SECURITY_CODING_MAINTENANCE.md)

## License

**Restricted License.** Free to read and learn from, but you cannot use this commercially or redistribute it without permission. See [LICENSE](LICENSE) for details.
