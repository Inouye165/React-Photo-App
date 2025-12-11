# Roadmap

This document outlines completed milestones, current priorities, and future plans for the React Photo App.

---

## ✅ Recently Completed (Sept–Nov 2025)

### Security & Reliability
- [x] **Row-Level Security (RLS)** - Supabase RLS ensures strict data isolation between users
- [x] **httpOnly Cookie Auth** - Eliminated token leakage from localStorage/URL params
- [x] **CSRF Protection** - Token + Origin validation on all state-changing requests
- [x] **SSL Certificate Validation** - Enforced `rejectUnauthorized: true` for production DB connections
- [x] **Session Recovery** - Invalid refresh tokens trigger automatic cleanup and re-login
- [x] **Concurrency Limits** - Rate limiting prevents upload storms

### Scalability & Performance
- [x] **Zero-Disk Streaming Uploads** - Direct streaming to Supabase Storage via Busboy (no tmpdir bottlenecks)
- [x] **Background Processing** - BullMQ + Redis offload heavy tasks (HEIC conversion, thumbnails, AI)
- [x] **Hash-Based Integrity** - SHA-256 validation during upload stream
- [x] **Dynamic Model Selection** - AI provider failover and load balancing

### AI & Intelligence
- [x] **LangGraph Pipeline** - Orchestrated AI workflow (EXIF → GPS → Analysis → POI → Valuation)
- [x] **Food Detective Agent** - Cross-references dishes with nearby restaurants via Google Places
- [x] **Collectibles Valuation** - Estimates worth of memorabilia based on image + condition
- [x] **Location Intelligence** - Identifies landmarks, trails, and points of interest from GPS coords

### Developer Experience
- [x] **Comprehensive Test Suite** - 86 tests covering frontend, backend, and security
- [x] **Stress Testing** - 20x runs to catch race conditions and flaky tests
- [x] **CI/CD Pipeline** - Automated tests, CSP validation, security scans
- [x] **Migration System** - SQL migrations with rollback support

---

## 🚧 Current Focus (Dec 2025)

### UI Polish
- [x] **Gallery View Redesign** - Virtualized grid with react-virtuoso for smooth scrolling at 1000+ photos
- [x] **Mobile-Responsive Layouts** - Touch-friendly 44px targets, mobile-first Tailwind styling
- [ ] **Keyboard Navigation** - Arrow keys, shortcuts, accessibility improvements
- [ ] **Loading States** - Better feedback during AI processing and uploads

### Mobile PWA
- [x] **Native Camera Roll Access** - One-tap photo selection from mobile device gallery
- [x] **Client-Side Compression** - Images optimized before upload (max 2048px, 85% quality)
- [x] **PWA Manifest** - Add to Home Screen support for iOS and Android
- [x] **Responsive Header** - Icons-only on mobile, full labels on desktop

### Feature Completeness
- [ ] **Batch Operations** - Select multiple photos for delete, tag, or re-analyze
- [ ] **Search & Filters** - Full-text search across captions, keywords, locations
- [ ] **Export Functionality** - Download originals, share links, generate reports

---

## 🎯 Planned Features

### Q1 2026: Enhanced Intelligence
- [ ] **Advanced Search** - Natural language queries ("show me food photos from last summer")
- [ ] **Facial Recognition** - Identify people across photo library (privacy-first, opt-in)
- [ ] **Event Detection** - Auto-group photos by trips, parties, occasions
- [ ] **Multi-Language AI** - Support Spanish, French, Japanese descriptions

### Q2 2026: Sharing & Collaboration
- [ ] **Family Albums** - Shared collections with role-based permissions
- [ ] **Public Galleries** - Generate shareable links for specific albums
- [ ] **Comments & Reactions** - Collaborative annotation on shared photos
- [ ] **Activity Feed** - See when family/friends add photos to shared albums

### Q3 2026: Mobile & Media Expansion
- [ ] **React Native App** - Native iOS/Android with offline support
- [ ] **Video Support** - MP4, MOV with scene detection and thumbnail generation
- [ ] **RAW Format Support** - Professional camera formats (CR2, NEF, ARW)
- [ ] **Audio Annotations** - Voice memos attached to photos

### Future Vision
- [ ] **Plugin System** - Custom AI models, third-party integrations
- [ ] **Print Fulfillment** - Direct ordering of photo books, prints, canvases
- [ ] **Cloud Backup Sync** - Two-way sync with Google Photos, iCloud, Dropbox
- [ ] **Timeline View** - Visual timeline with photo clusters and travel routes
- [ ] **3D Photo Support** - Depth maps, spatial photos from iPhone 15+

---

## 🐛 Known Limitations

### Current Constraints
- **English-Only AI:** Descriptions generated in English only (multi-language planned Q1 2026)
- **No Public Demo:** Requires self-hosted setup; no live demo site yet
- **Gallery UI Rough:** Focus has been on backend/security; frontend polish in progress
- **Single-User Focus:** Multi-user sharing not yet implemented

### Scale Testing
- **Tested:** Up to 1,000 photos per user
- **Target:** 10,000+ photos per user with sub-second query times
- **Stress Tested:** 20x CI runs, upload concurrency, race condition detection

### Browser Compatibility
- **Fully Supported:** Chrome 120+, Firefox 120+, Safari 17+, Edge 120+
- **Partial Support:** Older browsers may have CSP or cookie issues

---

## 📊 Performance Targets

| Metric | Current | Target (Q1 2026) |
|--------|---------|------------------|
| Upload Speed (10MB photo) | ~3 sec | ~2 sec |
| AI Processing Time | ~8 sec | ~5 sec |
| Gallery Load (1000 photos) | ~2 sec | ~1 sec |
| Search Query | ~500ms | ~200ms |
| Max Photos/User | 1,000 tested | 10,000+ |

---

## 🤝 How to Influence the Roadmap

Have a feature request or use case? Here's how to contribute:

1. **Open a GitHub Issue** - Describe your use case and why it matters
2. **Comment on Existing Issues** - Upvote features you'd find valuable
3. **Share Your Story** - How are you using the app? What's missing?

**Priority is given to:**
- Features that solve real pain points (not just "nice to have")
- Changes that improve security, privacy, or data integrity
- Enhancements that scale to 10,000+ photos

---

## 📈 Project Milestones

- **Sept 2025:** 2025 overhaul begins - backend-driven architecture
- **Oct 2025:** HEIC support, thumbnails, async processing with BullMQ
- **Nov 2025:** Supabase integration, security hardening, AI concierge features
- **Dec 2025:** UI polish, feature completeness, public release prep
- **Q1 2026:** Multi-language AI, advanced search, mobile app alpha
- **Q2 2026:** Family albums, sharing features, public galleries

---

**Last Updated:** November 2025  
**See Also:** [Product Story](docs/PRODUCT_STORY.md) for detailed engineering journey