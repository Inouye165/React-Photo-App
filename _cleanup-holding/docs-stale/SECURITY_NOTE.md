# SECURITY NOTE: GPS/EXIF Test Data Purge

On 2025-12-18, server/server_photos.json (containing EXIF-like photo metadata with GPS fields) was removed from the repository due to privacy and security concerns. Even mock/test data with GPS coordinates poses a risk of accidental leakage or confusion in the future.

**Actions taken:**
- File deleted and added to .gitignore
- Repo hygiene script added to CI to block future commits of GPS/EXIF fields
- All references in docs/code removed

**If you previously cloned this repo:**
- You may need to re-clone or run `git filter-repo` to fully purge sensitive data from your local history if the file existed in your clone.

**Why this matters:**
- EXIF data (GPS, timestamps, device info) can leak sensitive location or device details, even in test data.
- Guardrails now prevent recurrence by scanning for forbidden keys/patterns in all tracked files.

For questions, contact the security lead or see SECURITY_REMEDIATION_SUMMARY.md.
