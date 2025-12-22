<!-- docs/PRODUCT_STORY.md -->

# From Simple Photo Uploader to AI Photo Concierge  
## A Product Story (Sept–Nov 2025)

### Setting the Stage – September 2025

In **late September 2025**, the project started a new chapter.

Earlier versions of the app had done their job: they were great learning vehicles for React and basic Node, but they weren’t something you’d confidently run for other people. You wanted more than another tutorial project—you wanted a product you’d be proud to show on a résumé, in an interview, or even to paying users.

Around **September 30, 2025**, you opened a new repository and launched what became the **“2025 overhaul.”**

The goal was simple but ambitious:

> Turn a course-style photo gallery into a **serious, backend-driven photo service**.

The backend took responsibility for uploads and metadata, and the frontend became a proper client for that service. Photos were now first-class records, not just images thrown into a folder.

---

### Learning to See – October 2025

By **early October 2025**, the app took its first real-world steps.

Phones don’t care what formats are easy to handle; they just send HEICs and big images. So the app learned to cope with that reality:

- It could handle **HEIC images** gracefully.
- It generated **thumbnails** to keep browsing fast.
- It began to use **location data** to give the AI more context about each photo.

Under the hood, the backend had been cleaned up and modularized. Instead of being a single tangled file, it became a set of clearer modules—routes, helpers, and configuration—backed by automated tests and early CI.

By **late October 2025**, you took another step: you taught the app patience.

Instead of blocking uploads while AI processed an image, the app offloaded that work to an **async queue**. Users could drop in photos and keep moving, while a background worker quietly analyzed them. You also started writing down how things worked—how images were handled, how migrations behaved—so that the app was not just usable, but understandable.

The app had learned an important lesson: real products don’t just work; they recover, scale, and document themselves.

---

### Going Cloud-Native – Early November 2025

In **early November 2025**, the focus shifted from “works well on my machine” to **“works well in the cloud.”**

Supabase/local Postgres became the backbone of the data layer. Local development uses PostgreSQL (e.g., Docker Compose) for parity with production. Configuration was no longer an afterthought: environment variables, secrets, and deployment scenarios were carefully managed.

At the same time, you tightened up security on the front line:

- You introduced **Content Security Policy (CSP)** with Helmet.
- You created dedicated **CSP tests in CI**, ensuring production builds behaved safely in a browser.

From the outside, the app still looked like a photo gallery. But under the hood, it had become something ready to live on a real web server, not just a dev machine.

---

### Giving the App a Personality – Mid November 2025

Around **mid-November 2025**, the app started to feel less like a tool and more like a **concierge**.

#### The Collectibles Concierge

First, you gave it a sense of **value**.

You built a full collectibles flow:

- Photos could now represent **Pyrex bowls, comic books, and other memorabilia**.
- The app treated them as **collectibles**, not just jpg files.
- Metadata, valuations, and condition notes turned a simple photo into an asset profile.

The AI pipeline was extended to estimate what an item might be worth, based on the image and structured data. The app became a personal collectibles assistant.

#### The Sense of Place

Next, you gave it a better sense of **where**.

By integrating a **Places API**, the app learned to look around each photo’s GPS coordinates:

- “Is there a restaurant nearby?”
- “What’s the name of this café?”
- “What points of interest surround this spot?”

A new **POI (points of interest) system** fetched and cached nearby places, converting raw coordinates into meaningful names and categories.

You then wrapped all of this in **LangGraph**, creating a clear AI workflow instead of a bundle of one-off calls. The app now had a real “brain”: an orchestrated sequence of steps that understood context, location, and domain.

---

### Becoming a Food Detective – Late November 2025

By **mid to late November 2025**, the app didn’t just see photos—it **understood** them, especially when food was involved.

You built a **Food Detective agent** with a very specific job:

> Look at the photo, figure out what dish it is, and guess which nearby restaurant it came from.

Using the POI data from the Places provider:

- The AI recognized dishes (“seafood boil,” “burger,” “ramen,” etc.).
- It cross-referenced the list of nearby restaurants.
- It surfaced a likely match and wove that into the description.

Now, when you looking at a food photo, you weren’t just seeing “a bowl of something.” You might see:

> “Seafood boil from Cajun Crack’n in Concord, captured near Willow Pass Road.”

The app had quietly combined image understanding, GPS, and local business data to tell a story.

---

### Locking It Down – Security & Reliability

Of course, a smart app also has to be a **safe** app.

Between roughly **November 21 and November 25, 2025**, you put security and reliability front and center:

- **Row Level Security (RLS)** ensured that each user’s data stayed isolated in the database.
- **Bearer token authentication** became the standard for protected routes, and cookie-based auth was limited to legacy/transition use (e.g., image access/E2E) while eliminating token-in-query patterns.
- **CSRF defenses** use strict Origin/Referer verification (no CSRF tokens).
- Concurrency limits and race-condition fixes prevented a single user from overwhelming the system with uploads.
- CI was tamed, flaky tests were fixed, and the pipeline became stable and predictable.

By this point, the app’s defenses looked like something you’d expect from a seasoned SaaS product, not a personal project.

---

### Where the App Stands Now

By the end of **November 2025**, the story had shifted completely.

What began in late September as a **“2025 overhaul”** of a familiar photo app is now:

- An **AI photo concierge** that:
  - Knows what’s in your photos.
  - Knows **where** they were taken.
  - Recognizes when something is a **collectible** and can help estimate its value.
  - Acts as a **food detective**, pairing dishes with likely restaurants.
- A **cloud-native web app**:
  - Backed by Supabase Postgres and object storage.
  - Secured with RLS, CSRF protection, cookies, CSP, and path safety.
  - Guarded by CI checks, security scans, and automated tests.

It’s still your app. You can still drop in a photo and get a simple gallery view.

But behind that simplicity is an architecture—and a story—that reflects months of thoughtful engineering, one commit at a time.

