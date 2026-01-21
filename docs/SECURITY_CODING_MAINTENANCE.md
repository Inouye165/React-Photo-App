# Security & Maintenance Guide

Security isn't a "phase" we do at the end. It's the only reason this project exists. If we leak user photos, the whole thing is pointless.

This doc is the "how to not mess up" guide for anyone touching the code.

---

## The Security Model (Read This First)

We don't trust the frontend. Ever.

1.  **Auth is Bearer-Only:** The API expects `Authorization: Bearer <token>`. We don't do session cookies for the API because CSRF is a nightmare I don't want to deal with.
2.  **Images are Special:** Browsers are dumb and won't send headers for `<img>` tags.
    *   **Solution:** We use **Signed URLs** (short-lived tokens in the query string) for thumbnails.
    *   **Legacy:** There is some old cookie code for compatibility. Treat it like radioactive waste. Don't touch it unless you're removing it.
3.  **RLS is the Final Boss:** Even if the API code is buggy, the Database Row-Level Security (RLS) should prevent data leaks.

---

## Before You Commit

Run these. I wrote them for a reason.

```bash
# 1. Scan for secrets (don't commit API keys)
npm run secret-scan

# 2. Check for privilege escalation bugs
npm run check-privilege

# 3. Run the full test suite (it catches auth regressions)
npm run test:run
cd server && npm test
```

---

## Coding Rules (The "Don't Get Fired" List)

### 1. Auth & Access
*   **Default to Deny:** Every new route must have `authenticateToken` middleware.
*   **Check Ownership:** Just because a user is logged in doesn't mean they own `photo_123`. Always check `user_id === resource.owner_id`.
*   **No "Magic" Access:** Don't create "admin" backdoors for debugging. Use the database directly if you need to fix data.
*   **RLS Policy Discipline:**
    *   Never add permissive policies with `USING (true)` or `WITH CHECK (true)`.
    *   All RLS changes must be migrations (no manual dashboard edits).
    *   PRs touching RLS must list the exact policies added/removed and include a `pg_policies` review.

### 2. Logging & Privacy
*   **No Headers in Logs:** Request headers contain tokens. Never log `req.headers`.
*   **No PII:** Don't log filenames if they contain user info.
*   **Redact Everything:** If you're logging an error object, make sure it doesn't dump the entire user session.

### 3. Dependencies
*   **Update Deliberately:** Don't just `npm update` blindly. Read the changelogs for `jsonwebtoken`, `helmet`, and `supabase-js`.
*   **Lockfiles Matter:** Commit your `package-lock.json`. It's the only thing keeping our supply chain sane.

---

## Handling Images (The Tricky Part)

Serving private images is hard.

*   **Do:** Use `useSignedThumbnails` hook in React. It handles the token rotation for you.
*   **Don't:** Try to make `<img>` tags send Bearer tokens. It won't work.
*   **Don't:** Put long-lived tokens in URLs. URLs get logged in proxy servers, browser history, and referer headers.

---

## Review Checklist

When opening a PR, ask yourself:

- [ ] Did I add a new endpoint? Does it check `auth.uid()`?
- [ ] Can User A access User B's stuff by guessing an ID?
- [ ] Did I add a `console.log` that prints a token?
- [ ] Did I touch the `server/auth` folder? (If yes, add extra tests).

---

## When in Doubt...

**Fail Closed.** Return a 401 or 403. It's better to break the app for one user than to leak data to everyone.
