# AI-ish Comment Review

Generated: 2025-12-13T16:20:28.637Z

Scanned text files: 484

Skipped files: 4 (binary/unreadable)

Heuristic focus: comments that over-explain, narrate obvious code, use tutorial/assistant tone, or include explicit AI branding.

Codebase Scan Log: __mocks__/heic-to.js

   No issues

Codebase Scan Log: __mocks__/heic2any.js

   No issues

Codebase Scan Log: .env.example

1. Tutorial-style explanation

Flag: Lines 1-3 (hash).

Excerpt: # Root Environment Template for Local Development / # Copy this file to .env and fill in your actual values

Why it reads AI-ish: Tutorial / explanatory tone.

Fix: Delete. Delete entirely (file name + imports already communicate this). If you want a label, keep a single short line:  Worker entry point.

Codebase Scan Log: .eslintrc.cjs

   No issues

Codebase Scan Log: .gitattributes

   No issues

Codebase Scan Log: .github/codeql/codeql-config.yml

   No issues

Codebase Scan Log: .github/copilot-instructions.md

   No issues

Codebase Scan Log: .github/ISSUE_TEMPLATE/problem-log.yaml

   No issues

Codebase Scan Log: .github/pr_update.md

   No issues

Codebase Scan Log: .github/PULL_REQUEST_TEMPLATE.md

   No issues

Codebase Scan Log: .github/workflows/ci.yml

   No issues

Codebase Scan Log: .github/workflows/integration.yml

   No issues

Codebase Scan Log: .github/workflows/secret-scan.yml

   No issues

Codebase Scan Log: .gitignore

   No issues

Codebase Scan Log: .husky/pre-commit

   No issues

Codebase Scan Log: .trivial-ci-trigger-2.txt

   No issues

Codebase Scan Log: .trivial-ci-trigger.txt

   No issues

Codebase Scan Log: AI_CODE_REVIEW.md

   No issues

Codebase Scan Log: ai-per-file-audit.js

   No issues

Codebase Scan Log: CHANGELOG.md

1. AI-sounding comment

Flag: Lines 11-11 (hash).

Excerpt: ## [v1.1.0] - 2025-10-30

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: CONTRIBUTING.md

   No issues

Codebase Scan Log: debug_channels.cjs

   No issues

Codebase Scan Log: debug_state_shape.cjs

   No issues

Codebase Scan Log: debug-react-window.js

   No issues

Codebase Scan Log: diag/jest.run.all.txt

   No issues

Codebase Scan Log: dist/index.html

   No issues

Codebase Scan Log: dist/vite.svg

   No issues

Codebase Scan Log: docker-compose.yml

1. AI branding in comments

Flag: Lines 23-23 (hash).

Excerpt: # 2. REQUIRED (Recommended) Service: Redis for BullMQ Queue

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: docs/AUTHENTICATION.md

   No issues

Codebase Scan Log: docs/branch-reports/refactor-centralize-api-logic.md

   No issues

Codebase Scan Log: docs/CHANGELOG.md

   No issues

Codebase Scan Log: docs/cloud-deployment/RAILWAY_MIGRATION_LESSONS.md

1. AI branding in comments

Flag: Lines 95-95 (hash).

Excerpt: ### Worker Service (BullMQ/AI)

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. AI branding in comments

Flag: Lines 131-131 (hash).

Excerpt: ## Additional Lessons (VSC LLM chatGPT4.1)

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: docs/CONTRIBUTING.md

   No issues

Codebase Scan Log: docs/debug/collectibles-pipeline-code-snapshot.txt

1. AI branding in comments

Flag: Lines 1808-1808 (trailing-hash).

Excerpt: #### LLM Used in ${nodeName}\n**Timestamp:** ${timestamp}\n**Model:** ${modelName}\n\n**Prompt:**\n\`\`\`json\n${formatV

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: docs/DEV.md

   No issues

Codebase Scan Log: docs/DOCUMENTATION_AUDIT.md

   No issues

Codebase Scan Log: docs/ENGINEERING_CASE_STUDY.md

   No issues

Codebase Scan Log: docs/error-handling-audit.md

1. AI-sounding comment

Flag: Lines 95-95 (hash).

Excerpt: #### 2.1 Cleanup Code (Safe)

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. AI-sounding comment

Flag: Lines 119-119 (hash).

Excerpt: #### 2.2 Frontend: Collectibles Fetch Fallback

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

3. AI-sounding comment

Flag: Lines 163-163 (hash).

Excerpt: #### 2.3 Frontend: Auth Context - E2E Session Check

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

4. AI-sounding comment

Flag: Lines 206-206 (hash).

Excerpt: #### 2.4 Frontend: API - JSON Parse Fallbacks

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

5. AI-sounding comment

Flag: Lines 238-238 (hash).

Excerpt: #### 2.5 Backend: Periodic Supabase Smoke Test

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

6. AI-sounding comment

Flag: Lines 264-264 (hash).

Excerpt: #### 2.6 Backend: Dynamic Allowlist Load

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

7. AI-sounding comment

Flag: Lines 307-307 (hash).

Excerpt: ### 3.1 Backend Communication (API Calls)

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

8. AI-sounding comment

Flag: Lines 391-391 (hash).

Excerpt: ### 3.2 Auth/Protected Routes

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

9. AI-sounding comment

Flag: Lines 553-553 (hash).

Excerpt: ### 3.3 Media/Thumbnail/File Handling

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: docs/FIX_ORPHANED_PHOTOS.md

   No issues

Codebase Scan Log: docs/history/AI_POLLING_FIX.md

   No issues

Codebase Scan Log: docs/history/CACHE_IMPLEMENTATION_SUMMARY.md

   No issues

Codebase Scan Log: docs/history/CI_FIX_REPORT_DISPLAY.md

   No issues

Codebase Scan Log: docs/history/CI_FIX_REPORT_LANGGRAPH.md

   No issues

Codebase Scan Log: docs/history/CI_FIX_REPORT_SUMMARY.md

   No issues

Codebase Scan Log: docs/history/CI_FIX_REPORT_UPLOADS.md

   No issues

Codebase Scan Log: docs/history/CI_FIX_REPORT.md

   No issues

Codebase Scan Log: docs/history/CI_FIX_SUMMARY.md

   No issues

Codebase Scan Log: docs/history/CI_TROUBLESHOOTING_LOG.md

   No issues

Codebase Scan Log: docs/history/HEIC_REFACTOR_SUMMARY.md

   No issues

Codebase Scan Log: docs/history/HELMET_ENABLE_LOG.md

1. AI-sounding comment

Flag: Lines 39-39 (hash).

Excerpt: ## [2025-11-06] Step 7: Local Test Run

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. AI-sounding comment

Flag: Lines 66-66 (hash).

Excerpt: ## [2025-11-06] Step 1: Analyze `server/middleware/security.js` Export Shape

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Rewrite (keep rationale, drop narration). Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

3. AI-sounding comment

Flag: Lines 82-82 (hash).

Excerpt: ## [2025-11-06] Step 2: App Entry Point and Helmet Mounting

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

4. AI-sounding comment

Flag: Lines 94-94 (hash).

Excerpt: ## [2025-11-06] Step 3: Helmet Configuration Review

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

5. AI-sounding comment

Flag: Lines 106-106 (hash).

Excerpt: ## [2025-11-06] Step 4: Security Header Tests

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Rewrite (keep rationale, drop narration). Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

6. AI-sounding comment

Flag: Lines 117-117 (hash).

Excerpt: ## [2025-11-06] Step 5: Local Verification

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

7. AI-sounding comment

Flag: Lines 128-128 (hash).

Excerpt: ## [2025-11-06] Step 6: README Update Plan

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: docs/history/INTEGRATION_TEST_FIX.md

   No issues

Codebase Scan Log: docs/history/PR_DESCRIPTION_fix_secure_cookie_auth.md

   No issues

Codebase Scan Log: docs/history/PR_DESCRIPTION_image_caching.md

   No issues

Codebase Scan Log: docs/history/PROBLEM_LOG.md

   No issues

Codebase Scan Log: docs/history/PROBLEMS_SOLVED.md

   No issues

Codebase Scan Log: docs/history/PROFESSIONAL_CODE_REVIEW_LOG.md

   No issues

Codebase Scan Log: docs/history/server_llm-run-log.md

1. AI branding in comments

Flag: Lines 56-56 (hash).

Excerpt: # LLM run log

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: docs/history/server_PROBLEM_LOG.md

   No issues

Codebase Scan Log: docs/history/server_PROBLEMS_SOLVED.md

   No issues

Codebase Scan Log: docs/history/SPLIT_BRAIN_AUTH_FIX.md

   No issues

Codebase Scan Log: docs/history/SUPABASE_MIGRATION_SUMMARY.md

   No issues

Codebase Scan Log: docs/history/TEST_SUMMARY.md

   No issues

Codebase Scan Log: docs/history/TESTS_HARDENING_LOG.md

   No issues

Codebase Scan Log: docs/history/UPLOAD_REFACTOR_SUMMARY.md

   No issues

Codebase Scan Log: docs/IMPROVEMENT_PLAN.md

   No issues

Codebase Scan Log: docs/model-selection.md

   No issues

Codebase Scan Log: docs/pipeline-graphs/collectibles-execution-log.md

1. AI branding in comments

Flag: Lines 57-57 (hash).

Excerpt: #### LLM Used in classify_image

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. Verbose header / docblock

Flag: Lines 348-348 (trailing-hash).

Excerpt: #1 Value - GoCollect\",\"link\":\"https://gocollect.com/comic/legionnaires-1\",\"snippet\":\"Comic Book Lot (2) Single U

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 449-449 (trailing-hash).

Excerpt: #1 Value - GoCollect\",\"link\":\"https://gocollect.com/comic/legionnaires-1\",\"snippet\":\"Comic Book Lot (2) Single U

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. AI branding in comments

Flag: Lines 458-458 (hash).

Excerpt: #### LLM Used in describe_collectible

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

5. Verbose header / docblock

Flag: Lines 479-479 (trailing-hash).

Excerpt: #2 comic book, published by DC in May 1993, features the exciting adventures of Saturn Girl, Cosmic Boy, and Live Wire a

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

6. Verbose header / docblock

Flag: Lines 517-517 (trailing-hash).

Excerpt: #2 comic book, published by DC in May 1993, features the exciting adventures of Saturn Girl, Cosmic Boy, and Live Wire a

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

7. Verbose header / docblock

Flag: Lines 633-633 (trailing-hash).

Excerpt: #1 Value - GoCollect\",\"link\":\"https://gocollect.com/comic/legionnaires-1\",\"snippet\":\"Comic Book Lot (2) Single U

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

8. Verbose header / docblock

Flag: Lines 666-666 (trailing-hash).

Excerpt: #2 comic book, published by DC in May 1993, features the exciting adventures of Saturn Girl, Cosmic Boy, and Live Wire a

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

9. Verbose header / docblock

Flag: Lines 782-782 (trailing-hash).

Excerpt: #1 Value - GoCollect\",\"link\":\"https://gocollect.com/comic/legionnaires-1\",\"snippet\":\"Comic Book Lot (2) Single U

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

10. AI branding in comments

Flag: Lines 848-848 (hash).

Excerpt: #### LLM Used in classify_image

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

11. Verbose header / docblock

Flag: Lines 1139-1139 (trailing-hash).

Excerpt: #1 Value - GoCollect\",\"link\":\"https://gocollect.com/comic/power-pack-1\",\"snippet\":\"Explore detailed information

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

12. Verbose header / docblock

Flag: Lines 1240-1240 (trailing-hash).

Excerpt: #1 Value - GoCollect\",\"link\":\"https://gocollect.com/comic/power-pack-1\",\"snippet\":\"Explore detailed information

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

13. AI branding in comments

Flag: Lines 1249-1249 (hash).

Excerpt: #### LLM Used in describe_collectible

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

14. Verbose header / docblock

Flag: Lines 1262-1262 (trailing-hash).

Excerpt: #1' from Marvel.\",\n  \"conditionReasoning\": \"The comic shows light wear with no major flaws, typical for a used comi

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

15. Verbose header / docblock

Flag: Lines 1270-1270 (trailing-hash).

Excerpt: #1' comic book, published by Marvel in August 1984, features the debut of the superhero team composed of four siblings,

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

16. Verbose header / docblock

Flag: Lines 1308-1308 (trailing-hash).

Excerpt: #1' comic book, published by Marvel in August 1984, features the debut of the superhero team composed of four siblings,

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

17. Verbose header / docblock

Flag: Lines 1424-1424 (trailing-hash).

Excerpt: #1 Value - GoCollect\",\"link\":\"https://gocollect.com/comic/power-pack-1\",\"snippet\":\"Explore detailed information

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

18. Verbose header / docblock

Flag: Lines 1457-1457 (trailing-hash).

Excerpt: #1' comic book, published by Marvel in August 1984, features the debut of the superhero team composed of four siblings,

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

19. Verbose header / docblock

Flag: Lines 1573-1573 (trailing-hash).

Excerpt: #1 Value - GoCollect\",\"link\":\"https://gocollect.com/comic/power-pack-1\",\"snippet\":\"Explore detailed information

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

20. AI branding in comments

Flag: Lines 1648-1648 (hash).

Excerpt: #### LLM Used in classify_image

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

21. Verbose header / docblock

Flag: Lines 1939-1939 (trailing-hash).

Excerpt: #1 comic book value\",\"fetchedAt\":\"2025-11-29T18:10:21.419Z\",\"results\":[{\"title\":\"Power Pack #1 Value - GoColle

Why it reads AI-ish: Overly verbose comment block; Checklist / step-by-step structure.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

22. Verbose header / docblock

Flag: Lines 2040-2040 (trailing-hash).

Excerpt: #1 comic book value\",\"fetchedAt\":\"2025-11-29T18:10:21.419Z\",\"results\":[{\"title\":\"Power Pack #1 Value - GoColle

Why it reads AI-ish: Overly verbose comment block; Checklist / step-by-step structure.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

23. AI branding in comments

Flag: Lines 2049-2049 (hash).

Excerpt: #### LLM Used in describe_collectible

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

24. Verbose header / docblock

Flag: Lines 2062-2062 (trailing-hash).

Excerpt: #1' range from approximately $4.48 to $25.00 based on recent sales data.\",\n  \"confidences\": {\n    \"category\": 0.9

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

25. Verbose header / docblock

Flag: Lines 2070-2070 (trailing-hash).

Excerpt: #1' comic book, published by Marvel in August 1984, introduces readers to a unique superhero team of four young siblings

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

26. Verbose header / docblock

Flag: Lines 2114-2114 (trailing-hash).

Excerpt: #1' comic book, published by Marvel in August 1984, introduces readers to a unique superhero team of four young siblings

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

27. Verbose header / docblock

Flag: Lines 2236-2236 (trailing-hash).

Excerpt: #1 comic book value\",\"fetchedAt\":\"2025-11-29T18:10:21.419Z\",\"results\":[{\"title\":\"Power Pack #1 Value - GoColle

Why it reads AI-ish: Overly verbose comment block; Checklist / step-by-step structure.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

28. Verbose header / docblock

Flag: Lines 2269-2269 (trailing-hash).

Excerpt: #1' comic book, published by Marvel in August 1984, introduces readers to a unique superhero team of four young siblings

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

29. Verbose header / docblock

Flag: Lines 2391-2391 (trailing-hash).

Excerpt: #1 comic book value\",\"fetchedAt\":\"2025-11-29T18:10:21.419Z\",\"results\":[{\"title\":\"Power Pack #1 Value - GoColle

Why it reads AI-ish: Overly verbose comment block; Checklist / step-by-step structure.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: docs/pipeline-graphs/collectibles-flowchart.md

   No issues

Codebase Scan Log: docs/pipeline-graphs/last-sync.txt

   No issues

Codebase Scan Log: docs/pipeline-graphs/README.md

   No issues

Codebase Scan Log: docs/pipeline-graphs/update-ai-sequence.md

   No issues

Codebase Scan Log: docs/PRODUCT_STORY.md

   No issues

Codebase Scan Log: docs/PRODUCTION_SETUP.md

   No issues

Codebase Scan Log: docs/ROADMAP.md

   No issues

Codebase Scan Log: docs/SCALABILITY.md

   No issues

Codebase Scan Log: docs/screenshots/edit_page.png

   Skipped: binary file

Codebase Scan Log: docs/SECRET_ROTATION.md

   No issues

Codebase Scan Log: docs/SECURITY_FIX_CROSS_USER_DATA_LEAKAGE.md

   No issues

Codebase Scan Log: docs/SECURITY_REMEDIATION_CWE489_DEBUG_ROUTES.md

   No issues

Codebase Scan Log: docs/SECURITY_REMEDIATION_CWE489.md

   No issues

Codebase Scan Log: docs/SECURITY_REMEDIATION_PRIVILEGE_ESCALATION.md

   No issues

Codebase Scan Log: docs/TESTING.md

   No issues

Codebase Scan Log: docs/TOOLS_AND_TESTS.md

   No issues

Codebase Scan Log: docs/upload-picker-architecture.md

   No issues

Codebase Scan Log: DRAFT_SECURITY_ISSUE_jest-openapi.md

   No issues

Codebase Scan Log: e2e/a11y.gallery.spec.ts

   No issues

Codebase Scan Log: e2e/a11y.upload.spec.ts

   No issues

Codebase Scan Log: e2e/map.spec.ts

   No issues

Codebase Scan Log: e2e/smoke.spec.ts

   No issues

Codebase Scan Log: eslint.config.js

   No issues

Codebase Scan Log: file-picker-files.txt

   No issues

Codebase Scan Log: git-history.txt

1. AI branding in comments

Flag: Lines 253-253 (trailing-hash).

Excerpt: #45 from Inouye165/migrate-router-llm

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. AI-sounding comment

Flag: Lines 257-257 (trailing-hash).

Excerpt: #phase-1.1)

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: index.html

   No issues

Codebase Scan Log: LICENSE

   No issues

Codebase Scan Log: nixpacks.toml

   No issues

Codebase Scan Log: package-lock.json

   No issues

Codebase Scan Log: package.json

   No issues

Codebase Scan Log: perf/smoke.js

   No issues

Codebase Scan Log: playwright.config.ts

   No issues

Codebase Scan Log: postcss.config.js

   No issues

Codebase Scan Log: pr_description.md

   No issues

Codebase Scan Log: PROBLEM_LOG.md

   No issues

Codebase Scan Log: Procfile

   No issues

Codebase Scan Log: public/icons/README.md

   No issues

Codebase Scan Log: public/manifest.json

   No issues

Codebase Scan Log: public/vaultage-bg.png

   Skipped: binary file

Codebase Scan Log: public/vite.svg

   No issues

Codebase Scan Log: railway.toml

   No issues

Codebase Scan Log: readme-2025-12-11-cursor.md

   No issues

Codebase Scan Log: README.md

   No issues

Codebase Scan Log: scripts/backfill-gps.js

   No issues

Codebase Scan Log: scripts/check-privilege.cjs

   No issues

Codebase Scan Log: scripts/commit-helper.cjs

   No issues

Codebase Scan Log: scripts/deadcode-scan.cjs

   No issues

Codebase Scan Log: scripts/deadcode-scan.js

   No issues

Codebase Scan Log: scripts/docker-smoke.js

   No issues

Codebase Scan Log: scripts/integration-test.cjs

   No issues

Codebase Scan Log: scripts/populate-server-env.ps1

   No issues

Codebase Scan Log: scripts/prepare.cjs

1. Verbose header / docblock

Flag: Lines 2-11 (block-doc).

Excerpt: /** / * Conditional husky install script for prepare lifecycle hook.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: scripts/regenerate-thumbnails.cjs

1. Verbose header / docblock

Flag: Lines 40-45 (line).

Excerpt: // 1. Download original image / // The storage path in DB might be relative or absolute, usually it's 'working/f

Why it reads AI-ish: Overly verbose comment block; Assistant-y phrasing.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. AI-sounding comment

Flag: Lines 47-48 (line).

Excerpt: // Let's try to download from 'photos' bucket using storage_path / // If storage_path is null, maybe try constructing it?

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

3. AI-sounding comment

Flag: Lines 104-106 (line).

Excerpt: // If sharp fails, it might be HEIC without support. / // In a real script we'd import heic-convert.

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: scripts/reset-ai-retry.cjs

   No issues

Codebase Scan Log: scripts/reset-ai-retry.js

   No issues

Codebase Scan Log: scripts/secret-scan.cjs

   No issues

Codebase Scan Log: scripts/stress-test.cjs

1. Verbose header / docblock

Flag: Lines 2-22 (block-doc).

Excerpt: /** / * Stress Test Runner

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: scripts/validate-keys.cjs

   No issues

Codebase Scan Log: scripts/verify-env.cjs

   No issues

Codebase Scan Log: SECURITY_REMEDIATION_SUMMARY.md

   No issues

Codebase Scan Log: server/.env.ci

   No issues

Codebase Scan Log: server/.env.example

1. Verbose header / docblock

Flag: Lines 31-34 (hash).

Excerpt: # Database Connection / # For Local Docker: postgresql://photoapp:photoapp_dev@localhost:5432/photoapp

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Tutorial-style explanation

Flag: Lines 66-68 (hash).

Excerpt: # Photo App Server Configuration / # Copy this file to .env and fill in your actual values

Why it reads AI-ish: Tutorial / explanatory tone.

Fix: Delete. Delete entirely (file name + imports already communicate this). If you want a label, keep a single short line:  Worker entry point.

Codebase Scan Log: server/ai/debug_image.jpg

   No issues

Codebase Scan Log: server/ai/food/nutritionSearch.js

   No issues

Codebase Scan Log: server/ai/food/nutritionSearch.test.js

   No issues

Codebase Scan Log: server/ai/langchain/agents.js

1. Verbose header / docblock

Flag: Lines 8-8 (trailing).

Excerpt: // NEW: specific observations from high-res exam\n    "distinguishingFeatures": [string, ...],\n    "conditionAssessment

Why it reads AI-ish: Tutorial / explanatory tone; Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/ai/langchain/tools/searchTool.js

   No issues

Codebase Scan Log: server/ai/langgraph/__tests__/classification_helpers.test.js

   No issues

Codebase Scan Log: server/ai/langgraph/__tests__/collect_context_graph_integration.test.js

   No issues

Codebase Scan Log: server/ai/langgraph/__tests__/collect_context_node.test.js

1. AI-sounding comment

Flag: Lines 91-92 (line).

Excerpt: // Make nearbyPlaces throw if invoked so we can be sure location_intelligence_agent / // will NOT call it for collectables

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/ai/langgraph/__tests__/collect_context.test.js

   No issues

Codebase Scan Log: server/ai/langgraph/__tests__/collectible_flow.test.js

1. AI-sounding comment

Flag: Lines 101-102 (line).

Excerpt: // Let's check describe_collectible implementation again. / // It builds analysisContext, then calls OpenAI to generate description.

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. AI-sounding comment

Flag: Lines 122-124 (line).

Excerpt: // Verify the context passed to OpenAI (optional, but good for debugging) / // const lastCall = openai.chat.completions.create.mock.calls[2]; // 0=identify,

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/ai/langgraph/__tests__/food_location_agent_fallback.test.js

   No issues

Codebase Scan Log: server/ai/langgraph/__tests__/food_location_agent_threshold.test.js

   No issues

Codebase Scan Log: server/ai/langgraph/__tests__/food_location_agent.test.js

   No issues

Codebase Scan Log: server/ai/langgraph/__tests__/graph.collectibles.test.js

1. AI-sounding comment

Flag: Lines 90-90 (line).

Excerpt: // Step 1: classify_image

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. AI-sounding comment

Flag: Lines 94-94 (line).

Excerpt: // Step 2: identify_collectible - merge state

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

3. AI-sounding comment

Flag: Lines 101-101 (line).

Excerpt: // Step 3: valuate_collectible - merge state

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

4. AI-sounding comment

Flag: Lines 108-108 (line).

Excerpt: // Step 4: describe_collectible - merge state

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/ai/langgraph/__tests__/sprint1_router.test.js

   No issues

Codebase Scan Log: server/ai/langgraph/audit_logger.js

   No issues

Codebase Scan Log: server/ai/langgraph/classification_helpers.js

   No issues

Codebase Scan Log: server/ai/langgraph/collect_context.js

   No issues

Codebase Scan Log: server/ai/langgraph/context.js

   No issues

Codebase Scan Log: server/ai/langgraph/graph.food.test.js

1. AI branding in comments

Flag: Lines 129-129 (line).

Excerpt: // Response from LLM: returns JSON with fields

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. AI branding in comments

Flag: Lines 203-203 (line).

Excerpt: // Ensure the LLM was called and the sanitized messages contain the curated candidate

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

3. AI branding in comments

Flag: Lines 226-226 (line).

Excerpt: // Have LLM return a different restaurant name, but the deterministic override should win

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

4. AI branding in comments

Flag: Lines 324-324 (line).

Excerpt: // But LLM-provided restaurant_name can still be used in structured fields

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/ai/langgraph/graph.js

   No issues

Codebase Scan Log: server/ai/langgraph/langgraph_full_debug_runner.js

1. AI branding in comments

Flag: Lines 1-7 (block).

Excerpt: /* / Debug runner for LangGraph full workflow.

Why it reads AI-ish: Explicit AI attribution/branding; Tutorial / explanatory tone; Overly verbose comment block.

Fix: Delete. Delete entirely (file name + imports already communicate this). If you want a label, keep a single short line:  Worker entry point.

2. Tutorial-style explanation

Flag: Lines 41-41 (line).

Excerpt: // For debugging we will call the model unless classification_override present

Why it reads AI-ish: Tutorial / explanatory tone.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/ai/langgraph/langgraph_step_debug.js

   No issues

Codebase Scan Log: server/ai/langgraph/nodes/classify_image.js

   No issues

Codebase Scan Log: server/ai/langgraph/nodes/collect_context.js

   No issues

Codebase Scan Log: server/ai/langgraph/nodes/decide_scene_label.js

   No issues

Codebase Scan Log: server/ai/langgraph/nodes/describe_collectible.js

1. Verbose header / docblock

Flag: Lines 1-14 (block-doc).

Excerpt: /** / * describe_collectible.js - LangGraph Node

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 95-100 (block-doc).

Excerpt: /** / * Generate a rich description for a collectible item

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/ai/langgraph/nodes/food_location_agent.js

   No issues

Codebase Scan Log: server/ai/langgraph/nodes/food_metadata_agent.js

   No issues

Codebase Scan Log: server/ai/langgraph/nodes/generate_metadata.js

   No issues

Codebase Scan Log: server/ai/langgraph/nodes/handle_collectible.js

1. AI branding in comments

Flag: Lines 12-15 (block-doc).

Excerpt: /** / * System prompt that enforces the CollectibleOutputSchema JSON structure.

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. AI branding in comments

Flag: Lines 83-90 (block-doc).

Excerpt: /** / * Run the agent loop with tool calling support.

Why it reads AI-ish: Explicit AI attribution/branding; Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. AI branding in comments

Flag: Lines 96-96 (line).

Excerpt: // Call the LLM

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

4. AI branding in comments

Flag: Lines 106-106 (line).

Excerpt: // Check if the LLM wants to call tools

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

5. Verbose header / docblock

Flag: Lines 150-165 (block-doc).

Excerpt: /** / * Handle collectible analysis node for LangGraph pipeline.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/ai/langgraph/nodes/identify_collectible.js

   No issues

Codebase Scan Log: server/ai/langgraph/nodes/location_intelligence_agent.js

   No issues

Codebase Scan Log: server/ai/langgraph/nodes/valuate_collectible.js

1. Verbose header / docblock

Flag: Lines 5-10 (block-doc).

Excerpt: /** / * Safe wrapper for googleSearchTool to standardize logging and error handling.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 41-46 (block-doc).

Excerpt: /** / * Sanitize a price string/number to a valid float.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. AI branding in comments

Flag: Lines 148-148 (line).

Excerpt: // 4. Synthesize with LLM

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/ai/langgraph/state.js

1. AI-sounding comment

Flag: Lines 21-21 (line).

Excerpt: // --- Step 1: Router Output ---

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. AI-sounding comment

Flag: Lines 24-25 (line).

Excerpt: // --- Step 2: POI & Search Outputs --- / // The full, rich output from the photoPOIIdentifier tool

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

3. AI-sounding comment

Flag: Lines 45-46 (line).

Excerpt: // --- Step 3: Narrative/Final Output --- / // The final JSON result from the Scenery or Collectible agent

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/ai/langgraph/utils.js

   No issues

Codebase Scan Log: server/ai/modelCapabilities.js

   No issues

Codebase Scan Log: server/ai/openaiClient.js

   No issues

Codebase Scan Log: server/ai/poi/foodPlaces.js

   No issues

Codebase Scan Log: server/ai/poi/foodPlaces.test.js

   No issues

Codebase Scan Log: server/ai/poi/geoUtils.js

   No issues

Codebase Scan Log: server/ai/poi/googlePlaces.js

   No issues

Codebase Scan Log: server/ai/poi/googlePlaces.test.js

   No issues

Codebase Scan Log: server/ai/poi/osmTrails.js

   No issues

Codebase Scan Log: server/ai/prompts/classify_image.js

   No issues

Codebase Scan Log: server/ai/prompts/decide_scene_label.js

   No issues

Codebase Scan Log: server/ai/prompts/food_metadata_agent.js

   No issues

Codebase Scan Log: server/ai/prompts/generate_metadata.js

   No issues

Codebase Scan Log: server/ai/prompts/location_intelligence_agent.js

   No issues

Codebase Scan Log: server/ai/README.md

   No issues

Codebase Scan Log: server/ai/schemas.js

1. Verbose header / docblock

Flag: Lines 36-44 (block-doc).

Excerpt: /** / * ConfidenceField - A generic wrapper that adds confidence scoring to any value.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 66-69 (line).

Excerpt: // TODO: Future work - Normalized Quality Tiers / // We need to implement per-category quality scales (e.g. Comics: CGC 0.5-10.0,

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 85-90 (block-doc).

Excerpt: /** / * CollectibleOutputSchema - The strict contract for AI collectible analysis

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. Verbose header / docblock

Flag: Lines 106-112 (block-doc).

Excerpt: /** / * Extract clean data from a validated collectible output.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/ai/service.js

1. Verbose header / docblock

Flag: Lines 403-415 (block-doc).

Excerpt: /** / * Generate caption, description and keywords for a photo using the LangGraph wor

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. AI branding in comments

Flag: Lines 460-460 (line).

Excerpt: // &gt;&gt;&gt; ADDED: normalize metadata fields the LLM expects (dateTime, cameraModel)

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

3. AI branding in comments

Flag: Lines 586-602 (block-doc).

Excerpt: /** / * Update AI metadata (caption, description, keywords, poi_analysis) for a

Why it reads AI-ish: Explicit AI attribution/branding; Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. AI-sounding comment

Flag: Lines 789-791 (line).

Excerpt: // Log error to audit system if we can extract runId from error context / // The runId is created inside processPhotoAI, so we need to parse it from logs

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

5. Verbose header / docblock

Flag: Lines 987-996 (block-doc).

Excerpt: /** / * Re-check and process all photos in the 'inprogress' state that are missing

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/assign_photos_supabase.js

   No issues

Codebase Scan Log: server/assign_photos_to_user.js

   No issues

Codebase Scan Log: server/babel.config.js

   No issues

Codebase Scan Log: server/check_db_structure.js

   No issues

Codebase Scan Log: server/check_keys.js

   No issues

Codebase Scan Log: server/check_stategraph.js

   No issues

Codebase Scan Log: server/check-coords.js

   No issues

Codebase Scan Log: server/check-env.js

   No issues

Codebase Scan Log: server/complete_migration_fix.js

   No issues

Codebase Scan Log: server/config/aiConfig.js

1. Verbose header / docblock

Flag: Lines 1-8 (block-doc).

Excerpt: /** / * AI Configuration Constants

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. AI branding in comments

Flag: Lines 12-21 (block-doc).

Excerpt: /** / * Confidence thresholds for AI analysis results.

Why it reads AI-ish: Explicit AI attribution/branding; Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/config/allowedOrigins.js

1. Verbose header / docblock

Flag: Lines 1-31 (block-doc).

Excerpt: /** / * CORS Origin Configuration (Centralized)

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 39-49 (block-doc).

Excerpt: /** / * Parse and return the complete list of allowed CORS origins.

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 104-126 (block-doc).

Excerpt: /** / * Resolve an incoming request Origin against the allowlist.

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. Verbose header / docblock

Flag: Lines 128-131 (line).

Excerpt: // SECURITY: Guard against missing origin or the literal "null" string. / // Browsers send Origin: null in privacy-sensitive contexts (sandboxed iframes,

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

5. Verbose header / docblock

Flag: Lines 160-165 (block-doc).

Excerpt: /** / * Check if an origin is allowed.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/config/cookieConfig.js

1. Verbose header / docblock

Flag: Lines 1-29 (block-doc).

Excerpt: /** / * Cookie Configuration for Authentication

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 63-70 (block-doc).

Excerpt: /** / * Determine the Secure flag based on environment and SameSite value.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 100-107 (block-doc).

Excerpt: /** / * Get the cookie options for clearing the auth cookie.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/config/env.validate.js

   No issues

Codebase Scan Log: server/create_admin_simple.js

1. Verbose header / docblock

Flag: Lines 1-15 (line).

Excerpt: // DEPRECATED: This script created admin users in the local 'users' table / // which has been removed in favor of Supabase Auth.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/db/index.js

   No issues

Codebase Scan Log: server/db/maintenance.js

   No issues

Codebase Scan Log: server/db/migrations/20251020000001_create_initial_tables.js

   No issues

Codebase Scan Log: server/db/migrations/20251020000002_add_photo_ai_fields.js

   No issues

Codebase Scan Log: server/db/migrations/20251022000003_add_storage_path.js

   No issues

Codebase Scan Log: server/db/migrations/20251102000004_add_ai_model_column.js

   No issues

Codebase Scan Log: server/db/migrations/20251103000005_add_ai_model_history.js

   No issues

Codebase Scan Log: server/db/migrations/20251111175749_create_collectibles_table.js

   No issues

Codebase Scan Log: server/db/migrations/20251121_enable_rls.js

   No issues

Codebase Scan Log: server/db/migrations/20251121000006_add_user_id_to_photos.js

   No issues

Codebase Scan Log: server/db/migrations/20251122_add_state_transition.js

   No issues

Codebase Scan Log: server/db/migrations/20251122_fix_user_id_uuid.js

   No issues

Codebase Scan Log: server/db/migrations/20251123165708_fix_split_brain_auth.js

1. Verbose header / docblock

Flag: Lines 6-9 (line).

Excerpt: // Drop the local 'users' table to eliminate split-brain authentication / // This table is redundant since we use Supabase Auth as the single source of tr

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/db/migrations/20251128072239_create_users_table.js

1. Verbose header / docblock

Flag: Lines 1-8 (block-doc).

Excerpt: /** / * Migration: Create users table for user preferences

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/db/migrations/20251128140907_create_collectibles_schema.js

1. Verbose header / docblock

Flag: Lines 1-17 (block-doc).

Excerpt: /** / * Migration: Create Collectibles Schema

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/db/migrations/20251212000001_create_contact_messages.js

1. Verbose header / docblock

Flag: Lines 1-6 (block-doc).

Excerpt: /** / * Migration: Create contact_messages table

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/db/migrations/20251221000001_add_classification_column.js

   No issues

Codebase Scan Log: server/db/migrations/20251221000002_add_condition_label_to_market_data.js

1. Verbose header / docblock

Flag: Lines 1-9 (block-doc).

Excerpt: /** / * Migration: Add condition_label to collectible_market_data

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/delete-all-photos.js

   No issues

Codebase Scan Log: server/env.js

1. AI-sounding comment

Flag: Lines 14-16 (line).

Excerpt: // If dotenv isn't available or load fails, don't crash here; callers / // should validate required env vars at runtime. Keep a console warn to

Why it reads AI-ish: Likely redundant narrating-the-code comment.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/extract-full-exif.js

   No issues

Codebase Scan Log: server/fix_migrations.js

   No issues

Codebase Scan Log: server/fix-gps-coordinates.js

   No issues

Codebase Scan Log: server/health-check.js

   No issues

Codebase Scan Log: server/inspect_collectibles.js

   No issues

Codebase Scan Log: server/inspect_user_schema.js

   No issues

Codebase Scan Log: server/knexfile.js

   No issues

Codebase Scan Log: server/lib/supabaseClient.js

1. Tutorial-style explanation

Flag: Lines 5-7 (line).

Excerpt: // Ensure environment variables are loaded when this module is required / // by using the centralized loader. This avoids multiple dotenv.config calls

Why it reads AI-ish: Tutorial / explanatory tone.

Fix: Delete. Delete entirely (file name + imports already communicate this). If you want a label, keep a single short line:  Worker entry point.

Codebase Scan Log: server/logger.js

   No issues

Codebase Scan Log: server/media/backgroundProcessor.js

1. Verbose header / docblock

Flag: Lines 1-12 (block-doc).

Excerpt: /** / * Background photo processor for streaming upload architecture.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 25-32 (block-doc).

Excerpt: /** / * Downloads a file from Supabase Storage and returns it as a Buffer.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 47-53 (block-doc).

Excerpt: /** / * Converts DMS (Degrees, Minutes, Seconds) array to decimal degrees.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. Verbose header / docblock

Flag: Lines 71-78 (block-doc).

Excerpt: /** / * Extracts EXIF metadata from an image buffer.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

5. Verbose header / docblock

Flag: Lines 145-150 (block-doc).

Excerpt: /** / * Calculates SHA256 hash of a buffer.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

6. Verbose header / docblock

Flag: Lines 155-162 (block-doc).

Excerpt: /** / * Generates a thumbnail and uploads it to Supabase Storage.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

7. Verbose header / docblock

Flag: Lines 234-247 (block-doc).

Excerpt: /** / * Process a photo that was uploaded via streaming.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/media/exif.js

1. Verbose header / docblock

Flag: Lines 8-15 (block-doc).

Excerpt: /** / * Extract comprehensive metadata from an image file using exiftool-vendored.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/media/image.js

1. Verbose header / docblock

Flag: Lines 12-19 (line).

Excerpt: // ============================================================================ / // CONCURRENCY LIMITING FOR IMAGE PROCESSING (DoS Protection)

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 32-37 (block-doc).

Excerpt: /** / * Execute a function with concurrency limiting.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 99-107 (block-doc).

Excerpt: /** / * Compute SHA256 hash of file content, optionally scoped to a user.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. Tutorial-style explanation

Flag: Lines 242-243 (line).

Excerpt: // Pre-check: Ensure resolved path starts with one of the allowed dirs / // This prevents passing obviously malicious paths to realpath

Why it reads AI-ish: Tutorial / explanatory tone.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

5. Verbose header / docblock

Flag: Lines 371-382 (block-doc).

Excerpt: /** / * Ingest a photo into the database with user-scoped deduplication.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/media/streamUploader.js

1. Verbose header / docblock

Flag: Lines 1-11 (block-doc).

Excerpt: /** / * Streaming upload module for direct-to-Supabase file uploads.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 85-90 (block-doc).

Excerpt: /** / * Validates MIME type for image uploads.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 117-131 (block-doc).

Excerpt: /** / * Parses multipart form data and streams file directly to Supabase Storage.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/media/uploader.js

   No issues

Codebase Scan Log: server/middleware/auth.js

1. Verbose header / docblock

Flag: Lines 15-31 (block-doc).

Excerpt: /** / * Middleware to verify Supabase JWT token and authenticate users

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/middleware/csrf.js

   No issues

Codebase Scan Log: server/middleware/imageAuth.js

1. Verbose header / docblock

Flag: Lines 19-35 (block-doc).

Excerpt: /** / * Middleware to authenticate image requests

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 64-69 (line).

Excerpt: // SECURITY: Only set Access-Control-Allow-Origin if we have a valid, non-"null" origin. / // This protects against misconfigurations where "null" could be treated as allo

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/middleware/security.js

1. Verbose header / docblock

Flag: Lines 9-14 (block-doc).

Excerpt: /** / * Environment-aware Content Security Policy (CSP) for Helmet.

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/MIGRATIONS.md

   No issues

Codebase Scan Log: server/openapi.yml

   No issues

Codebase Scan Log: server/package-lock.json

   No issues

Codebase Scan Log: server/package.json

   No issues

Codebase Scan Log: server/playwright-report/index.html

   No issues

Codebase Scan Log: server/prod-ca-2021.crt

   No issues

Codebase Scan Log: server/queue/index.js

1. Verbose header / docblock

Flag: Lines 34-43 (line).

Excerpt: // NOTE: Do not create the worker here. The worker process should be / // started explicitly via `startWorker()` (see worker.js). Creating a

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/README.md

   No issues

Codebase Scan Log: server/routes/auth.js

1. Verbose header / docblock

Flag: Lines 84-91 (block-doc).

Excerpt: /** / * POST /api/auth/session

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 115-120 (line).

Excerpt: // Token is valid - set httpOnly cookie / // Security configuration centralized in config/cookieConfig.js:

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 143-149 (block-doc).

Excerpt: /** / * POST /api/auth/logout

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/routes/clientError.js

   No issues

Codebase Scan Log: server/routes/collectibles.js

   No issues

Codebase Scan Log: server/routes/debug.js

1. AI-sounding comment

Flag: Lines 136-136 (line).

Excerpt: // Test if we can list files in the bucket

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. AI-sounding comment

Flag: Lines 145-145 (line).

Excerpt: // Test if we can create a test file

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/routes/display.js

1. Verbose header / docblock

Flag: Lines 46-53 (block-doc).

Excerpt: /** / * Middleware to handle thumbnail authentication

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 96-118 (block-doc).

Excerpt: /** / * NEW: ID-based image route (PREVENTS ERR_CACHE_READ_FAILURE)

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/routes/e2e.js

   No issues

Codebase Scan Log: server/routes/health.js

   No issues

Codebase Scan Log: server/routes/photos.js

1. Verbose header / docblock

Flag: Lines 139-142 (line).

Excerpt: // Use ID-based URL for photos to prevent ERR_CACHE_READ_FAILURE / // This eliminates the URL extension mismatch when HEIC is converted to JPEG

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 295-321 (block-doc).

Excerpt: /** / * GET /photos/:id/thumbnail-url

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 787-798 (line).

Excerpt: // --- Display endpoint: Serve images from Supabase Storage --- / // Use the specialized image authentication middleware which enforces

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/routes/privilege.js

   No issues

Codebase Scan Log: server/routes/public.js

1. Verbose header / docblock

Flag: Lines 1-6 (block-doc).

Excerpt: /** / * Public API Routes

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 42-49 (block-doc).

Excerpt: /** / * Validation rules for contact form submission

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 72-77 (block-doc).

Excerpt: /** / * Creates the public router with database dependency injection

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. Verbose header / docblock

Flag: Lines 84-89 (block-doc).

Excerpt: /** / * POST /contact

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/routes/uploads.js

1. Verbose header / docblock

Flag: Lines 8-28 (block-doc).

Excerpt: /** / * Streaming uploads router.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 36-44 (block-doc).

Excerpt: /** / * POST /upload

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/routes/users.js

1. Verbose header / docblock

Flag: Lines 1-8 (block-doc).

Excerpt: /** / * Users API Routes

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 17-23 (block-doc).

Excerpt: /** / * Factory function to create users router.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/runner.js

   No issues

Codebase Scan Log: server/sanity-check-db.js

   No issues

Codebase Scan Log: server/scripts/adopt-orphans.js

   No issues

Codebase Scan Log: server/scripts/backfill-users.js

1. Verbose header / docblock

Flag: Lines 2-7 (block-doc).

Excerpt: /** / * Backfill users table with user_ids from photos table

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/scripts/check-auth-state.js

   No issues

Codebase Scan Log: server/scripts/check-migrations.js

1. Verbose header / docblock

Flag: Lines 2-10 (block-doc).

Excerpt: /** / * server/scripts/check-migrations.js

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 15-20 (line).

Excerpt: // Preserve any pre-existing NODE_ENV so Jest (or other callers) can / // temporarily override it without the server/.env loader clobbering the

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 41-47 (line).

Excerpt: // IMPORTANT: Use the same environment selection logic as server/db/index.js / // Previously, this script had "auto-detect" logic that switched to 'production'

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/scripts/check-token.js

   No issues

Codebase Scan Log: server/scripts/check-user-photo-mismatch.js

   No issues

Codebase Scan Log: server/scripts/diagnose-photo-access.js

   No issues

Codebase Scan Log: server/scripts/fix_photo_92.js

   No issues

Codebase Scan Log: server/scripts/inspect-exif.js

1. Verbose header / docblock

Flag: Lines 2-7 (block).

Excerpt: /* / Inspect EXIF for a photo stored in Supabase by photo id or storage path.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. AI-sounding comment

Flag: Lines 46-46 (line).

Excerpt: // If parsing fails, leave as-is so we can still inspect the raw value

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/scripts/integration-runner.js

   No issues

Codebase Scan Log: server/scripts/list-finished-photos.js

   No issues

Codebase Scan Log: server/scripts/README.md

   No issues

Codebase Scan Log: server/scripts/set-admin-role.js

1. Verbose header / docblock

Flag: Lines 3-19 (block-doc).

Excerpt: /** / * Secure Admin Role Assignment Script

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/scripts/test-db-connection.js

   No issues

Codebase Scan Log: server/scripts/test-keys.js

1. Verbose header / docblock

Flag: Lines 1-8 (block-doc).

Excerpt: /** / * Local diagnostic script to test API keys

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/scripts/test-photo-access.js

   No issues

Codebase Scan Log: server/scripts/validate-keys.js

   No issues

Codebase Scan Log: server/scripts/verify-db-ssl.js

1. Verbose header / docblock

Flag: Lines 2-14 (block-doc).

Excerpt: /** / * Database SSL Connection Verification Script

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/scripts/verify-env.js

   No issues

Codebase Scan Log: server/scripts/verify-upload-config.js

1. Verbose header / docblock

Flag: Lines 1-6 (block-doc).

Excerpt: /** / * Verification Script: Test Supabase Service Role Key for Upload Permissions

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/server_photos.db

   No issues

Codebase Scan Log: server/server_photos.json

   No issues

Codebase Scan Log: server/server.js

1. Verbose header / docblock

Flag: Lines 88-100 (line).

Excerpt: // CRITICAL: Process lifecycle management for production environments / //

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 166-176 (line).

Excerpt: // Configure CORS origins early so preflight (OPTIONS) and error responses / // include the appropriate Access-Control-Allow-* headers before any

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 210-229 (line).

Excerpt: // Cookie parser for secure httpOnly cookie authentication / // CSRF PROTECTION ARCHITECTURE:

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. Verbose header / docblock

Flag: Lines 348-352 (line).

Excerpt: // Non-blocking Supabase connectivity smoke-check: runs once on startup and / // logs whether Supabase storage or DB is reachable. This is intentionally

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/services/collectiblesService.js

1. Verbose header / docblock

Flag: Lines 1-9 (block-doc).

Excerpt: /** / * Collectibles Service Layer

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 16-23 (block-doc).

Excerpt: /** / * Factory function to create a collectibles service instance.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 27-49 (block-doc).

Excerpt: /** / * Upsert a collectible record for a photo.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. Verbose header / docblock

Flag: Lines 149-156 (block-doc).

Excerpt: /** / * Get a collectible by photo ID for a specific user.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

5. Verbose header / docblock

Flag: Lines 165-175 (block-doc).

Excerpt: /** / * Get all collectibles for a user with optional filtering.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

6. Verbose header / docblock

Flag: Lines 194-201 (block-doc).

Excerpt: /** / * Delete a collectible by ID.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

7. Verbose header / docblock

Flag: Lines 212-225 (block-doc).

Excerpt: /** / * Add market data entry for a collectible.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

8. Verbose header / docblock

Flag: Lines 249-264 (block-doc).

Excerpt: /** / * Bulk insert market data records within a transaction.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

9. Verbose header / docblock

Flag: Lines 291-298 (block-doc).

Excerpt: /** / * Get market data history for a collectible.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

10. Verbose header / docblock

Flag: Lines 307-318 (block-doc).

Excerpt: /** / * Link an additional photo to a collectible.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

11. Verbose header / docblock

Flag: Lines 352-359 (block-doc).

Excerpt: /** / * Get all photos linked to a collectible.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

12. Verbose header / docblock

Flag: Lines 368-373 (block-doc).

Excerpt: /** / * Check if collectibles feature is enabled (no-throw version).

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/services/photosAi.js

1. Verbose header / docblock

Flag: Lines 8-13 (block-doc).

Excerpt: /** / * Add a job to the AI queue for a given photo.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/services/photosDb.js

   No issues

Codebase Scan Log: server/services/photosImage.js

1. Verbose header / docblock

Flag: Lines 27-32 (block-doc).

Excerpt: /** / * Compute hash for a photo buffer.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/services/photosState.js

1. Verbose header / docblock

Flag: Lines 8-18 (block-doc).

Excerpt: /** / * Transition a photo from one state to another.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/services/photosStorage.js

1. Verbose header / docblock

Flag: Lines 8-13 (block-doc).

Excerpt: /** / * Move a photo file from one path to another.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 25-31 (block-doc).

Excerpt: /** / * Upload a file or buffer to storage under a given path.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/services/userPreferences.js

1. Verbose header / docblock

Flag: Lines 1-8 (block-doc).

Excerpt: /** / * User Preferences Service

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 54-60 (block-doc).

Excerpt: /** / * Factory function to create a user preferences service instance.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 62-67 (block-doc).

Excerpt: /** / * Get user preferences (grading scales).

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. Verbose header / docblock

Flag: Lines 96-102 (block-doc).

Excerpt: /** / * Update user preferences (grading scales).

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

5. Verbose header / docblock

Flag: Lines 155-163 (block-doc).

Excerpt: /** / * Get a specific condition definition for a category and label.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

6. Verbose header / docblock

Flag: Lines 185-192 (block-doc).

Excerpt: /** / * Load default grading scales for specified categories.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/smoke-supabase.js

   No issues

Codebase Scan Log: server/temp.json

   No issues

Codebase Scan Log: server/test-db-connection.js

   No issues

Codebase Scan Log: server/test-immediate-exif.js

   No issues

Codebase Scan Log: server/tests/__mocks__/is-network-error.js

   No issues

Codebase Scan Log: server/tests/__mocks__/knex.js

   No issues

Codebase Scan Log: server/tests/__mocks__/langchainAgents.js

1. Verbose header / docblock

Flag: Lines 2-14 (block).

Excerpt: /* / Lightweight Jest mock for LangChain agents used in server AI integration tests

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/__mocks__/openai.js

   No issues

Codebase Scan Log: server/tests/__mocks__/p-retry.js

   No issues

Codebase Scan Log: server/tests/__mocks__/supabase.js

   No issues

Codebase Scan Log: server/tests/ai_contract.test.js

1. Verbose header / docblock

Flag: Lines 1-13 (block-doc).

Excerpt: /** / * AI Contract Tests - Sprint 2 + Sprint 5

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/ai-service-heic-regression.test.js

   No issues

Codebase Scan Log: server/tests/api.collectibles.history.test.js

1. Verbose header / docblock

Flag: Lines 1-6 (block-doc).

Excerpt: /** / * Integration Tests: Sprint 3 - Collectibles History API

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/auth-user-creation.test.js

1. Verbose header / docblock

Flag: Lines 1-13 (block-doc).

Excerpt: /** / * Test suite for automatic user creation during authentication

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/auth.bearer.test.js

1. Verbose header / docblock

Flag: Lines 1-13 (block-doc).

Excerpt: /** / * Tests for Bearer Token Authentication (Primary Auth Method)

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/auth.cookie.test.js

1. Verbose header / docblock

Flag: Lines 1-12 (block-doc).

Excerpt: /** / * Tests for configurable session cookie settings and authentication security

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 298-303 (line).

Excerpt: // Mount auth routes (includes rate limiting and CSRF protection internally) / // See routes/auth.js for authLimiter and verifyOrigin middleware

Why it reads AI-ish: Overly verbose comment block; Likely redundant narrating-the-code comment.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 619-627 (block-doc).

Excerpt: /** / * Tests for authenticateToken middleware - httpOnly cookie authentication

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/auth.rbac.test.js

   No issues

Codebase Scan Log: server/tests/auth.roles.test.js

1. Verbose header / docblock

Flag: Lines 1-12 (block-doc).

Excerpt: /** / * Role-based Access Control Security Tests

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/auth.routes.bearer.test.js

1. Verbose header / docblock

Flag: Lines 1-9 (block-doc).

Excerpt: /** / * Tests for Protected Routes with Bearer Token Authentication

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/auth.security.test.js

1. Verbose header / docblock

Flag: Lines 1-7 (block-doc).

Excerpt: /** / * Security-focused authentication tests

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/auth.timing.test.js

   No issues

Codebase Scan Log: server/tests/cache.etag.test.js

   No issues

Codebase Scan Log: server/tests/collectibles.db.test.js

1. Verbose header / docblock

Flag: Lines 1-12 (block-doc).

Excerpt: /** / * Collectibles Database Tests

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/collectibles.persistence.test.js

1. Verbose header / docblock

Flag: Lines 1-6 (block-doc).

Excerpt: /** / * Integration Tests: Sprint 2 - Collectibles Data Persistence

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. AI branding in comments

Flag: Lines 46-46 (line).

Excerpt: // Mock LLM response with new market_data format

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/tests/concurrency.test.js

1. Verbose header / docblock

Flag: Lines 1-6 (block-doc).

Excerpt: /** / * Concurrency Limiting Tests for Image Processing

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/concurrencyLimiter.test.js

   No issues

Codebase Scan Log: server/tests/config.allowedOrigins.test.js

1. AI-sounding comment

Flag: Lines 61-61 (trailing).

Excerpt: //192.168.1.1:5173');

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/tests/contract.openapi.test.js

   No issues

Codebase Scan Log: server/tests/cors.integration.test.js

1. Verbose header / docblock

Flag: Lines 1-19 (block-doc).

Excerpt: /** / * CORS Integration Tests

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/cors.production.test.js

1. Verbose header / docblock

Flag: Lines 1-11 (block-doc).

Excerpt: /** / * Production CORS Configuration Tests

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/csp.prod.test.js

   No issues

Codebase Scan Log: server/tests/csrf.test.js

   No issues

Codebase Scan Log: server/tests/db.test.js

   No issues

Codebase Scan Log: server/tests/display.cache.test.js

   No issues

Codebase Scan Log: server/tests/displayEndpoint.test.js

   No issues

Codebase Scan Log: server/tests/e2e-verify.test.js

   No issues

Codebase Scan Log: server/tests/env.validate.test.js

   No issues

Codebase Scan Log: server/tests/envKeys.test.js

1. Verbose header / docblock

Flag: Lines 4-8 (line).

Excerpt: // This test used to rely on server/.env directly, which is gitignored (secrets). / // To avoid committing secrets while still validating presence of required keys,

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/errors.downstream.test.js

   No issues

Codebase Scan Log: server/tests/fixtures/test-photo-with-compass.heic

   Skipped: binary file

Codebase Scan Log: server/tests/heic-refactor-validation.test.js

1. Verbose header / docblock

Flag: Lines 54-57 (line).

Excerpt: // Behavioral check: when sharp conversion fails and heic-convert fails, / // convertHeicToJpegBuffer should throw an Error containing both parts.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/heicConversion.integration.test.js

   No issues

Codebase Scan Log: server/tests/helpers/throw-uncaught.js

1. Verbose header / docblock

Flag: Lines 2-9 (block-doc).

Excerpt: /** / * Test helper: Simulates an uncaught exception to verify process lifecycle handl

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/idor_legacy.test.js

1. Verbose header / docblock

Flag: Lines 18-20 (line).

Excerpt: // Auth in this test harness uses Authorization: Bearer tokens (Supabase-style), not cookies. / // CSRF protections are handled via the token model and CORS, so we intentionall

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/imageAuth.test.js

   No issues

Codebase Scan Log: server/tests/integration.test.js

   No issues

Codebase Scan Log: server/tests/knexfile.test.js

   No issues

Codebase Scan Log: server/tests/logs.redaction.test.js

   No issues

Codebase Scan Log: server/tests/metadata.compass.test.js

   No issues

Codebase Scan Log: server/tests/migrations.verify.spec.js

   No issues

Codebase Scan Log: server/tests/osmTrails.test.js

   No issues

Codebase Scan Log: server/tests/performVisionMatching.test.js

   No issues

Codebase Scan Log: server/tests/photoPOIHelpers.test.js

1. Verbose header / docblock

Flag: Lines 47-66 (block).

Excerpt: /* / describe('normalizePOICategory', () =&gt; {

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/photoPOIIdentifier.google.test.js

   No issues

Codebase Scan Log: server/tests/photos-state.test.js

1. Verbose header / docblock

Flag: Lines 1-6 (block-doc).

Excerpt: /** / * Photos state management tests

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/photos.payload.test.js

   No issues

Codebase Scan Log: server/tests/photos.status.test.js

1. Verbose header / docblock

Flag: Lines 1-10 (block-doc).

Excerpt: /** / * Integration tests for GET /photos/status endpoint

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/photosAi.test.js

   No issues

Codebase Scan Log: server/tests/photosDb.test.js

   No issues

Codebase Scan Log: server/tests/photosImage.test.js

   No issues

Codebase Scan Log: server/tests/photosState.test.js

   No issues

Codebase Scan Log: server/tests/photosStorage.test.js

   No issues

Codebase Scan Log: server/tests/pollForAnalysis.js

1. Verbose header / docblock

Flag: Lines 2-10 (block-doc).

Excerpt: /** / * Polls the DB for AI metadata to appear for a photo.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/preferences.snapshot.test.js

1. Verbose header / docblock

Flag: Lines 1-8 (block-doc).

Excerpt: /** / * Preferences Snapshot Tests - Sprint 3

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/privilege.ownership.test.js

1. Verbose header / docblock

Flag: Lines 1-7 (block-doc).

Excerpt: /** / * Privilege Ownership Tests

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/process-lifecycle.test.js

1. Verbose header / docblock

Flag: Lines 1-24 (block-doc).

Excerpt: /** / * Process Lifecycle Test Suite

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/processPhotoAI.heic.test.js

   No issues

Codebase Scan Log: server/tests/processPhotoAI.test.js

   No issues

Codebase Scan Log: server/tests/ratelimit.headers.test.js

   No issues

Codebase Scan Log: server/tests/ratelimit.test.js

   No issues

Codebase Scan Log: server/tests/routes.public.test.js

1. Verbose header / docblock

Flag: Lines 1-9 (block-doc).

Excerpt: /** / * Tests for Public API Routes

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/security.body.test.js

   No issues

Codebase Scan Log: server/tests/security.cors.test.js

1. AI-sounding comment

Flag: Lines 199-199 (trailing).

Excerpt: //192.168.1.100:5173',

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/tests/security.test.js

   No issues

Codebase Scan Log: server/tests/security.trustproxy.test.js

   No issues

Codebase Scan Log: server/tests/server-listening.test.js

1. Verbose header / docblock

Flag: Lines 1-16 (block-doc).

Excerpt: /** / * Test to prevent regression of integration test failures due to

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/setup.js

1. Verbose header / docblock

Flag: Lines 69-73 (line).

Excerpt: // Provide LangSmith defaults so tests do not depend on local .env / // LangChain environment variables removed.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/storage.metadata.test.js

1. Verbose header / docblock

Flag: Lines 1-9 (block-doc).

Excerpt: /** / * Tests for Supabase Storage cache metadata on uploads.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 109-115 (block-doc).

Excerpt: /** / * Note: Testing streamToSupabase directly requires mocking Busboy and

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/supabase-ssl-config.test.js

1. Verbose header / docblock

Flag: Lines 1-15 (block-doc).

Excerpt: /** / * tests/supabase-ssl-config.test.js

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. AI-sounding comment

Flag: Lines 162-162 (trailing).

Excerpt: //postgres.&lt;ref&gt;:&lt;password&gt;@aws-1-us-east-1.pooler.supabase.com:5432/postgres\n' +

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/tests/test-db.js

   No issues

Codebase Scan Log: server/tests/test-env-ci.js

1. Tutorial-style explanation

Flag: Lines 1-4 (block-doc).

Excerpt: /** / * Simple test environment setup for CI

Why it reads AI-ish: Tutorial / explanatory tone.

Fix: Delete. Delete entirely (file name + imports already communicate this). If you want a label, keep a single short line:  Worker entry point.

Codebase Scan Log: server/tests/thumbnail-401-regression.test.js

1. Verbose header / docblock

Flag: Lines 12-27 (block-doc).

Excerpt: /** / * Regression Test for Thumbnail 401 Unauthorized Bug

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. AI-sounding comment

Flag: Lines 97-97 (line).

Excerpt: // STEP 1: User is authenticated (testToken exists)

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

3. AI-sounding comment

Flag: Lines 100-100 (line).

Excerpt: // STEP 2: User fetches their photos

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

4. AI-sounding comment

Flag: Lines 112-112 (line).

Excerpt: // STEP 3: For each photo with thumbnail, obtain signed URL

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

5. AI-sounding comment

Flag: Lines 125-126 (line).

Excerpt: // STEP 4 & 5: Simulate &lt;img&gt; tag request (NO Authorization header) / // Mock Supabase storage for this test

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/tests/thumbnail-rotation.test.js

   No issues

Codebase Scan Log: server/tests/thumbnailUrl.integration.test.js

1. AI-sounding comment

Flag: Lines 34-35 (line).

Excerpt: // If this succeeds, we can get the user_id from the auth middleware / // Otherwise, we'll use a default test user ID (1) that exists in Supabase

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. AI-sounding comment

Flag: Lines 37-38 (line).

Excerpt: // Auth worked, photos belong to the Supabase user / // We need to use their ID. Let's fetch an existing photo if any

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/tests/uploads.cleanup.test.js

   No issues

Codebase Scan Log: server/tests/uploads.limits.test.js

   No issues

Codebase Scan Log: server/tests/uploads.multipart.test.js

   No issues

Codebase Scan Log: server/tests/uploads.stream.test.js

1. Verbose header / docblock

Flag: Lines 1-9 (block-doc).

Excerpt: /** / * Integration tests for streaming upload pipeline.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/uploads.test.js

1. Verbose header / docblock

Flag: Lines 1-6 (block-doc).

Excerpt: /** / * Integration tests for the streaming upload router.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/urlSigning.stability.test.js

1. Verbose header / docblock

Flag: Lines 1-9 (block-doc).

Excerpt: /** / * URL Signing Stability Tests

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/tests/urlSigning.unit.test.js

   No issues

Codebase Scan Log: server/utils/featureFlags.js

1. Verbose header / docblock

Flag: Lines 1-9 (block-doc).

Excerpt: /** / * Feature Flags Utility for Collectibles Module

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/utils/pathValidator.js

1. Verbose header / docblock

Flag: Lines 5-11 (block-doc).

Excerpt: /** / * Validates that a file path is within the allowed temp directory.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Tutorial-style explanation

Flag: Lines 30-31 (line).

Excerpt: // Pre-check: Ensure resolved path starts with one of the allowed dirs / // This prevents passing obviously malicious paths to realpathSync

Why it reads AI-ish: Tutorial / explanatory tone.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: server/utils/urlSigning.js

1. Verbose header / docblock

Flag: Lines 3-16 (block-doc).

Excerpt: /** / * URL Signing Utility for Secure Thumbnail Access

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 46-61 (block-doc).

Excerpt: /** / * Generate HMAC-SHA256 signature for a thumbnail URL

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 81-98 (block-doc).

Excerpt: /** / * Sign a thumbnail URL with expiration and signature

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. Verbose header / docblock

Flag: Lines 124-143 (block-doc).

Excerpt: /** / * Verify a signed thumbnail URL

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

5. Verbose header / docblock

Flag: Lines 194-210 (block-doc).

Excerpt: /** / * Express middleware to validate signed thumbnail URLs

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: server/version.js

   No issues

Codebase Scan Log: server/worker.js

1. AI branding in comments

Flag: Lines 1-10 (block-doc).

Excerpt: /** / * Worker process entry point.

Why it reads AI-ish: Explicit AI attribution/branding; Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Tutorial-style explanation

Flag: Lines 13-15 (line).

Excerpt: // This file is the entry point for the worker process. / // It imports the worker instance from the queue module,

Why it reads AI-ish: Tutorial / explanatory tone; Likely redundant narrating-the-code comment.

Fix: Delete. Delete entirely (file name + imports already communicate this). If you want a label, keep a single short line:  Worker entry point.

Codebase Scan Log: server/working/dev.db

   Skipped: binary file

Codebase Scan Log: src/__mocks__/heic-to.js

   No issues

Codebase Scan Log: src/__mocks__/heic2any.js

   No issues

Codebase Scan Log: src/api.js

1. Verbose header / docblock

Flag: Lines 51-58 (block-doc).

Excerpt: /** / * Upsert (create or update) a collectible for a photo.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 100-105 (block-doc).

Excerpt: /** / * Set the current access token for API requests.

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 119-130 (block-doc).

Excerpt: /** / * Get headers for API requests with Bearer token authentication.

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. Verbose header / docblock

Flag: Lines 146-152 (block-doc).

Excerpt: /** / * Async version of getAuthHeaders that fetches fresh token from Supabase.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

5. Verbose header / docblock

Flag: Lines 201-219 (block-doc).

Excerpt: /** / * Wrapper around fetch that handles network-level failures gracefully.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

6. Verbose header / docblock

Flag: Lines 308-326 (block-doc).

Excerpt: /** / * Fetch a protected resource (image) using Bearer token authentication and retur

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

7. Verbose header / docblock

Flag: Lines 409-414 (block-doc).

Excerpt: /** / * Upload a photo to the server, optionally with a client-generated thumbnail.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

8. Verbose header / docblock

Flag: Lines 478-484 (block-doc).

Excerpt: /** / * Get lightweight photo status counts for Smart Routing.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/api.test.js

1. Verbose header / docblock

Flag: Lines 55-63 (block-doc).

Excerpt: /** / * Tests for Bearer Token Authentication

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/App_backup.jsx

   No issues

Codebase Scan Log: src/App.auth.test.jsx

   No issues

Codebase Scan Log: src/App.e2e.test.jsx

1. AI-sounding comment

Flag: Lines 57-57 (line).

Excerpt: // Keep a reference to the original showDirectoryPicker so we can restore it

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: src/App.jsx

1. Verbose header / docblock

Flag: Lines 23-32 (block-doc).

Excerpt: /** / * App - Root component with routing and error boundary

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/App.routing.test.jsx

   No issues

Codebase Scan Log: src/App.test.jsx

   No issues

Codebase Scan Log: src/assets/react.svg

   No issues

Codebase Scan Log: src/components/AiDebugConsole.jsx

1. Tutorial-style explanation

Flag: Lines 116-116 (line).

Excerpt: // If backend provided both system+user, format them clearly

Why it reads AI-ish: Tutorial / explanatory tone.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: src/components/AppHeader.jsx

1. Verbose header / docblock

Flag: Lines 7-15 (block-doc).

Excerpt: /** / * AppHeader - Mobile-first responsive navigation header

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/components/AppHeader.test.jsx

   No issues

Codebase Scan Log: src/components/AuthenticatedImage.jsx

1. Verbose header / docblock

Flag: Lines 1-17 (block-doc).

Excerpt: /** / * AuthenticatedImage Component

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 22-32 (block-doc).

Excerpt: /** / * @param {Object} props

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/components/AuthWrapper.test.tsx

   No issues

Codebase Scan Log: src/components/AuthWrapper.tsx

   No issues

Codebase Scan Log: src/components/Banner.jsx

   No issues

Codebase Scan Log: src/components/CollectibleDetailView.jsx

1. AI branding in comments

Flag: Lines 26-37 (block-doc).

Excerpt: /** / * CollectibleDetailView - Rich display of collectible data

Why it reads AI-ish: Explicit AI attribution/branding; Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/components/CollectibleEditorPanel.jsx

1. Verbose header / docblock

Flag: Lines 69-84 (block-doc).

Excerpt: /** / * CollectibleEditorPanel - AI-Augmented Data Entry Form for Collectibles

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/components/CollectibleEditorPanel.test.jsx

   No issues

Codebase Scan Log: src/components/FlipCard.jsx

1. Verbose header / docblock

Flag: Lines 3-15 (block-doc).

Excerpt: /** / * FlipCard Component

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/components/GlobalErrorBoundary.jsx

   No issues

Codebase Scan Log: src/components/LocationMapPanel.jsx

   No issues

Codebase Scan Log: src/components/LocationMapPanel.test.jsx

   No issues

Codebase Scan Log: src/components/LocationMapUtils.js

1. Verbose header / docblock

Flag: Lines 1-7 (block-doc).

Excerpt: /** / * Helper to extract lat/lon/heading from photo metadata.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/components/LoginForm.jsx

   No issues

Codebase Scan Log: src/components/LoginForm.tsx

   No issues

Codebase Scan Log: src/components/MetadataModal.jsx

   No issues

Codebase Scan Log: src/components/ModelSelect.tsx

   No issues

Codebase Scan Log: src/components/PhotoCard.jsx

1. Verbose header / docblock

Flag: Lines 68-76 (block-doc).

Excerpt: /** / * PhotoCard - A modern card component for displaying photo previews

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 102-108 (line).

Excerpt: // Get image URL - prefer thumbnail for performance, fallback to full image / // Thumbnails are much smaller and faster to load. Full image is only used if no

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/components/PhotoCard.test.jsx

   No issues

Codebase Scan Log: src/components/PhotoMetadataBack.jsx

1. Verbose header / docblock

Flag: Lines 3-11 (block-doc).

Excerpt: /** / * PhotoMetadataBack Component

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/components/PhotoTable.jsx

   No issues

Codebase Scan Log: src/components/PriceHistoryList.jsx

1. Verbose header / docblock

Flag: Lines 4-12 (block-doc).

Excerpt: /** / * PriceHistoryList - Ledger-style display of price history records

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/components/PriceRangeVisual.jsx

1. Verbose header / docblock

Flag: Lines 4-12 (block-doc).

Excerpt: /** / * PriceRangeVisual - Visual representation of price range with current value mar

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/components/PriceRangeVisual.test.jsx

   No issues

Codebase Scan Log: src/components/SmartRouter.jsx

1. Verbose header / docblock

Flag: Lines 6-26 (block-doc).

Excerpt: /** / * SmartRouter - Intelligent initial route handler

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/components/SmartRouter.test.jsx

   No issues

Codebase Scan Log: src/components/Thumbnail.jsx

1. Verbose header / docblock

Flag: Lines 1-12 (block-doc).

Excerpt: /** / * Thumbnail Component

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 84-101 (block-doc).

Excerpt: /** / * Thumbnail - Main component for displaying cached/generated thumbnails.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. AI-sounding comment

Flag: Lines 155-155 (line).

Excerpt: // Step 1: Check cache first

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

4. AI-sounding comment

Flag: Lines 169-169 (line).

Excerpt: // Step 2: Generate new thumbnail (handles both regular images and HEIC conversion)

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

5. AI-sounding comment

Flag: Lines 175-175 (line).

Excerpt: // Step 3: Cache the thumbnail for future use (fire and forget)

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: src/components/Toast.jsx

   No issues

Codebase Scan Log: src/config/apiConfig.js

1. Verbose header / docblock

Flag: Lines 5-10 (block-doc).

Excerpt: /** / * Get the API base URL from environment or fallback to localhost for dev.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 33-38 (block-doc).

Excerpt: /** / * Build a full API URL from a path.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/config/modelCatalog.ts

   No issues

Codebase Scan Log: src/contexts/AuthContext.d.ts

   No issues

Codebase Scan Log: src/contexts/AuthContext.jsx

1. Verbose header / docblock

Flag: Lines 95-101 (block-doc).

Excerpt: /** / * Check if the backend has an E2E test session cookie set.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/EditPage.jsx

1. AI branding in comments

Flag: Lines 253-254 (line).

Excerpt: // AI updated fields -&gt; update form fields immediately then mark done briefly / // Force form to reflect latest AI-generated values from the photo prop

Why it reads AI-ish: Explicit AI attribution/branding.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. AI-sounding comment

Flag: Lines 262-263 (line).

Excerpt: // setRecheckStatus('done') / // show 'done' for 2.5s then switch to idle (label 'Recheck AI again')

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: src/EditPage.test.jsx

1. AI-sounding comment

Flag: Lines 31-31 (line).

Excerpt: // Mock the ImageCanvasEditor so we can inspect props via rendered attributes

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: src/env.js

1. Verbose header / docblock

Flag: Lines 1-5 (line).

Excerpt: // Frontend environment variable checks / // In development we allow an empty `VITE_API_URL` so the app can use relative

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/hooks/useAIPolling.jsx

1. AI-sounding comment

Flag: Lines 16-16 (line).

Excerpt: // Save initial AI fields so we can check for actual changes

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: src/hooks/useAIPolling.test.jsx

   No issues

Codebase Scan Log: src/hooks/useLocalPhotoPicker.js

   No issues

Codebase Scan Log: src/hooks/usePhotoManagement.js

1. AI-sounding comment

Flag: Lines 38-39 (line).

Excerpt: // Track the previous view/page and activePhotoId so we can restore / // the actual previous screen when closing the full-page editor.

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

2. AI-sounding comment

Flag: Lines 266-266 (line).

Excerpt: // Save the current view and active photo so we can restore later.

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: src/hooks/usePhotoPrivileges.js

   No issues

Codebase Scan Log: src/hooks/useSignedThumbnails.js

1. Verbose header / docblock

Flag: Lines 4-17 (block-doc).

Excerpt: /** / * Custom hook to manage signed thumbnail URLs for photo rendering

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 145-150 (line).

Excerpt: // Filter photos that: / // - Have thumbnail property

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 227-239 (block-doc).

Excerpt: /** / * Helper function to get signed URL for a photo

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/hooks/useSignedThumbnails.test.js

   No issues

Codebase Scan Log: src/hooks/useThumbnailQueue.js

1. Verbose header / docblock

Flag: Lines 1-21 (block-doc).

Excerpt: /** / * useThumbnailQueue Hook

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 27-35 (block-doc).

Excerpt: /** / * Queue-based thumbnail processor with batched state updates

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 58-70 (block-doc).

Excerpt: /** / * Staging Buffer for Batched State Updates

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. Verbose header / docblock

Flag: Lines 78-86 (block-doc).

Excerpt: /** / * Cleanup Effect: Handle unmounting and Blob URL revocation

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

5. Verbose header / docblock

Flag: Lines 118-127 (block-doc).

Excerpt: /** / * Flush Loop Effect: Periodically batch-update React state

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

6. Verbose header / docblock

Flag: Lines 186-195 (block-doc).

Excerpt: /** / * Process a single thumbnail file

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

7. Verbose header / docblock

Flag: Lines 267-278 (block-doc).

Excerpt: /** / * Process queue with concurrency control

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

8. AI-sounding comment

Flag: Lines 327-327 (line).

Excerpt: // Store files in a ref so we can access current value without dependency

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: src/hooks/useThumbnailQueue.minimal.test.js

   No issues

Codebase Scan Log: src/hooks/useThumbnailQueue.test.js

1. Verbose header / docblock

Flag: Lines 1-8 (block-doc).

Excerpt: /** / * useThumbnailQueue Hook Unit Tests

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/ImageCanvasEditor.jsx

   No issues

Codebase Scan Log: src/index.css

   No issues

Codebase Scan Log: src/integration/api-auth.test.js

   No issues

Codebase Scan Log: src/integration/api-network-failure.test.js

   No issues

Codebase Scan Log: src/layouts/MainLayout.jsx

   No issues

Codebase Scan Log: src/main.jsx

   No issues

Codebase Scan Log: src/pages/LandingPage.test.tsx

   No issues

Codebase Scan Log: src/pages/LandingPage.tsx

   No issues

Codebase Scan Log: src/pages/PhotoEditPage.jsx

   No issues

Codebase Scan Log: src/pages/PhotoGalleryPage.jsx

1. Verbose header / docblock

Flag: Lines 14-22 (block-doc).

Excerpt: /** / * PhotoGalleryPage - Main gallery view showing the photo card grid

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/pages/ResetPasswordPage.jsx

1. Verbose header / docblock

Flag: Lines 16-20 (line).

Excerpt: // If not logged in, redirect to login (or show error) / // But wait, if they just clicked the link, Supabase might still be processing t

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/pages/ResetPasswordPage.test.jsx

1. AI-sounding comment

Flag: Lines 121-122 (line).

Excerpt: // We can't easily test the setTimeout navigation without using fake timers, / // but we can verify the success message is shown.

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: src/pages/SettingsPage.jsx

1. Verbose header / docblock

Flag: Lines 5-17 (block-doc).

Excerpt: /** / * SettingsPage - User preferences for collectibles grading scales

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/pages/SettingsPage.test.jsx

   No issues

Codebase Scan Log: src/pages/UploadPage.jsx

1. Verbose header / docblock

Flag: Lines 7-17 (block-doc).

Excerpt: /** / * UploadPage - Dedicated page for photo uploads

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/pages/UploadPage.test.jsx

   No issues

Codebase Scan Log: src/PhotoGallery.jsx

1. Verbose header / docblock

Flag: Lines 1-9 (block-doc).

Excerpt: /** / * PhotoGallery - Mobile-first virtualized responsive card grid

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/PhotoUploadForm.jsx

   No issues

Codebase Scan Log: src/PhotoUploadForm.test.jsx

   No issues

Codebase Scan Log: src/store.js

   No issues

Codebase Scan Log: src/store/uploadPickerSlice.js

   No issues

Codebase Scan Log: src/supabaseClient.js

   No issues

Codebase Scan Log: src/test/config-integrity.test.js

   No issues

Codebase Scan Log: src/test/MockAuthProvider.jsx

   No issues

Codebase Scan Log: src/test/setup.js

1. Verbose header / docblock

Flag: Lines 26-35 (block-doc).

Excerpt: /** / * Mock Web Worker for heic2any and other browser-only APIs.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/test/test-utils.jsx

   No issues

Codebase Scan Log: src/tests/authUtils.test.js

   No issues

Codebase Scan Log: src/Toolbar.jsx

   No issues

Codebase Scan Log: src/Toolbar.test.jsx

1. AI-sounding comment

Flag: Lines 71-73 (line).

Excerpt: // The Toolbar navigates using navigate('/upload'), so we can verify / // the navigation happened by checking that no error was thrown

Why it reads AI-ish: Assistant-y phrasing.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

Codebase Scan Log: src/utils.test.js

   No issues

Codebase Scan Log: src/utils/auth.js

   No issues

Codebase Scan Log: src/utils/clientImageProcessing.js

1. Verbose header / docblock

Flag: Lines 1-8 (block-doc).

Excerpt: /** / * Client Image Processing Utility

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 55-61 (block-doc).

Excerpt: /** / * Calculate scaled dimensions that fit within max bounds while preserving aspect

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 74-79 (block-doc).

Excerpt: /** / * Check if the file type is supported for client-side thumbnail generation

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. Verbose header / docblock

Flag: Lines 110-115 (block-doc).

Excerpt: /** / * Load an image from a Blob/File.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

5. Verbose header / docblock

Flag: Lines 159-168 (block-doc).

Excerpt: /** / * Generate a thumbnail from an image with memory-safe scaling.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

6. AI-sounding comment

Flag: Lines 170-171 (line).

Excerpt: // Step 1: Calculate safe dimensions / // For very large images, we need to scale in stages to avoid memory issues

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

7. AI-sounding comment

Flag: Lines 186-186 (line).

Excerpt: // Step 2: Create canvas with safe dimensions

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

8. AI-sounding comment

Flag: Lines 200-200 (line).

Excerpt: // Step 3: Configure high-quality scaling

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

9. AI-sounding comment

Flag: Lines 204-204 (line).

Excerpt: // Step 4: Draw scaled image

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

10. AI-sounding comment

Flag: Lines 216-216 (line).

Excerpt: // Step 5: Convert to blob

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

11. AI-sounding comment

Flag: Lines 231-231 (line).

Excerpt: // Step 6: Cleanup canvas to release memory

Why it reads AI-ish: Checklist / step-by-step structure.

Fix: Delete. Rewrite shorter and factual (no narration). Keep only non-obvious rationale.

12. Verbose header / docblock

Flag: Lines 238-247 (block-doc).

Excerpt: /** / * Convert HEIC to JPEG using multiple fallback strategies.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

13. Verbose header / docblock

Flag: Lines 304-313 (block-doc).

Excerpt: /** / * Generate a client-side thumbnail from an image file.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

14. Verbose header / docblock

Flag: Lines 390-397 (block-doc).

Excerpt: /** / * Batch process multiple files with rate limiting to avoid memory spikes.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

15. Verbose header / docblock

Flag: Lines 430-446 (block-doc).

Excerpt: /** / * Compress an image for upload to reduce transfer size and upload time.

Why it reads AI-ish: Overly verbose comment block.

Fix: Rewrite (keep rationale, drop narration). Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

16. Verbose header / docblock

Flag: Lines 551-557 (block-doc).

Excerpt: /** / * Compress multiple files for upload with progress callback.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/utils/clientImageProcessing.test.js

1. Verbose header / docblock

Flag: Lines 1-6 (block-doc).

Excerpt: /** / * Unit Tests for Client-Side Image Processing Utility

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/utils/formatFileSize.js

   No issues

Codebase Scan Log: src/utils/globalLog.js

   No issues

Codebase Scan Log: src/utils/GlobalLogDisplay.jsx

   No issues

Codebase Scan Log: src/utils/thumbnailCache.js

1. Verbose header / docblock

Flag: Lines 1-8 (block-doc).

Excerpt: /** / * Thumbnail Cache Utility

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

2. Verbose header / docblock

Flag: Lines 15-22 (block-doc).

Excerpt: /** / * Generate a unique cache key for a file based on its identity.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

3. Verbose header / docblock

Flag: Lines 30-35 (block-doc).

Excerpt: /** / * Retrieve a cached thumbnail from IndexedDB.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

4. Verbose header / docblock

Flag: Lines 55-61 (block-doc).

Excerpt: /** / * Save a thumbnail to IndexedDB cache.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

5. Verbose header / docblock

Flag: Lines 79-85 (block-doc).

Excerpt: /** / * Remove a cached thumbnail from IndexedDB.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

6. Verbose header / docblock

Flag: Lines 97-103 (block-doc).

Excerpt: /** / * Check if a thumbnail exists in cache without retrieving it.

Why it reads AI-ish: Overly verbose comment block.

Fix: Delete. Replace with 1 short line only if it adds value; otherwise delete. Example: Worker process entry point.

Codebase Scan Log: src/utils/thumbnailCache.test.js

   No issues

Codebase Scan Log: src/utils/toUrl.js

   No issues

Codebase Scan Log: src/utils/visionMessage.ts

   No issues

Codebase Scan Log: tailwind.config.js

   No issues

Codebase Scan Log: test_output.txt

   No issues

Codebase Scan Log: TESTING.md

   No issues

Codebase Scan Log: tsconfig.json

   No issues

Codebase Scan Log: vercel.json

   No issues

Codebase Scan Log: vite.config.js

   No issues

Codebase Scan Log: vitest.config.js

   No issues

Codebase Scan Log: vitest.minimal.config.js

   No issues

