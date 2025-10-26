# Secret Rotation & Incident Response Checklist

If you suspect API keys or other secrets have been committed or exposed, rotate them immediately. This document gives a concise, practical checklist for Supabase and OpenAI keys and general guidance for other secrets.

## Quick high-level steps

1. Revoke the exposed key(s) immediately from the provider dashboard.
2. Create a new key with the minimum required permissions.
3. Update the key in any CI/CD secrets (GitHub Actions Secrets, etc.).
4. Update local `.env` files on machines that need the new key. Do NOT commit `.env` files.
5. If secrets were pushed to the repository, consider removing them from history (see "Removing secrets from git history").
6. Notify any stakeholders and rotate any dependent credentials (e.g., secondary service keys) as necessary.

---

## Supabase (storage / API) rotation

- Go to your Supabase project at https://app.supabase.com.
- Open **Project Settings → API**.
- Revoke the exposed key (anon or service_role depending on which was leaked).
- Generate a new key.
- Update any server `.env` values (e.g., `SUPABASE_URL`, `SUPABASE_KEY`) in the `server/.env` file and in your CI secrets (`Settings → Secrets` in GitHub).
- If you used a `service_role` in client-side code, revoke and replace it immediately — `service_role` keys must never be exposed to clients.

Notes:
- Ensure your **`photos`** storage bucket is private (see README).
- Use minimal-permission keys for server-side usage. Keep `service_role` keys strictly server-side.

## OpenAI rotation

- Go to https://platform.openai.com/account/keys
- Revoke the leaked key.
- Create a new API key.
- Update the new key in your server `.env` and CI secrets (e.g. `OPENAI_API_KEY`).
- If your app used the key client-side, rotate immediately and audit where keys are used.

## GitHub Actions / CI

- Replace any plaintext keys in workflow YAMLs with repository secrets.
- Update the repository secrets (`Settings → Secrets & variables`) with the rotated keys.
- Re-run CI to ensure builds/flows pick up the new keys.

## Removing secrets from git history (if keys were committed)

If secrets were pushed at any time, removing them from history reduces risk but **rotation is mandatory** even after removal.

Options:

- Use the BFG Repo-Cleaner (easier):
  - https://rtyley.github.io/bfg-repo-cleaner/
  - Follow instructions to replace/remove files containing secrets, then force-push the cleaned repository.

- Use git filter-repo (recommended modern tool):
  - https://github.com/newren/git-filter-repo
  - Example (replace `YOUR_SECRET` with plain value):

    ```bash
    git filter-repo --replace-text <(echo 'YOUR_SECRET==>[REDACTED]')
    ```

After cleaning history:
- Force-push to the repository: `git push --force` (requires admin coordination).
- Invalidate old keys and rotate them as described above.

## Post-rotation checks

- Verify the application works locally with new keys.
- Verify CI uses the new secrets (trigger a PR or manual run).
- Search the repo for accidental placeholders or leftover keys (case-insensitive search for key prefixes like `sk-`, `supabase`, `aws`, `ghp_`, etc.).

## Contact / escalation

If this is a production incident or you do not control the provider account, escalate to the project owner and follow your org's incident response policy.

---

Keep this file as a short operational checklist. For deeper incident response playbooks, integrate with your organization's security team and run a post-incident review.
