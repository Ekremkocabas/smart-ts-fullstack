# Smart-TS — Operations Management Platform — PRD

## Project Identity & Vision
**Smart-TS** is a field service operations management platform currently deployed for **Smart-Tech BV**. The long-term vision is to evolve this into a **multi-company SaaS field service platform** with full **white-label capability** — meaning each company can have its own branding (logo, colors, company name), user base, and data, all running on the same infrastructure. The platform is designed from the ground up to support this model via the `instellingen` (settings) collection which already stores per-company theming and branding.

## Original Problem Statement
A full-stack Expo (React Native) + FastAPI + MongoDB operations management app for Smart-Tech BV field workers. Admin can create planning, workers fill in werkbons (work orders) in the field and sign digitally, then PDFs are automatically emailed.

## Implemented Features (with dates)

### Core (Previous Sessions)
- Worker login & auth, role-based access (admin/beheerder/werknemer)
- Planning system with workers assignment
- Three werkbon types: Uren, Oplevering, Project
- PDF generation & email (Resend) for all types
- Dynamic theming (company color + logo)
- Push notifications
- Admin panel (users, klanten, werven, teams, settings)
- Messaging/berichten system

### 2026-03-14 (This Session)
- **Productie Werkbon 1** — Completely new werkbon type for PUR insulation:
  - Page 1: Planning info (date, worker, start/eind/voorziene uur with auto-calc), klant/werf selection, werk beschrijving, PUR production (3 floors: m², cm dikte), schuurwerken/stofzuigen toggles with m², up to 4 work photos with GPS metadata, opmerking
  - Page 2: GPS capture, signature (name NOT auto-filled), date, selfie, send-to-client toggle, privacy notice
  - Backend: ProductieWerkbon model, CRUD endpoints, PDF generation, email sending
  - Navigation: Added as 4th type in werkbon creation modal

- **Standardized Page 2 for all werkbons** — Oplevering & Project now have 2-page structure:
  - Page 1: All job data
  - Page 2: GPS, signature (name NOT auto-filled), date, selfie, privacy notice, send-to-client toggle
  - Both screens have page indicator (2 dots) in header
  - Back button on page 2 returns to page 1

- **Planning Confirmation Timestamp** — Enhanced bevestig system:
  - Backend stores {worker_id, worker_naam, timestamp} in bevestigingen array
  - Admin planning view shows "BEVESTIGD" with timestamp
  - Worker planning tab passes worker_naam when confirming

- **Branding consistency** — Oplevering werkbon now uses theme primaryColor instead of hardcoded #F5A623

## Architecture
- **Backend:** FastAPI, MongoDB, Resend (email), ReportLab (PDF)
- **Frontend:** Expo (React Native), expo-router, expo-location, expo-image-picker
- **Collections:** users, werkbonnen, oplevering_werkbonnen, project_werkbonnen, productie_werkbonnen, planning, klanten, werven, instellingen

### Polymorphic Werkbon Schema
The `werkbonnen` collection is **polymorphic** — a single collection stores all work order types differentiated by a `type` field. Exact types currently in use:
| Type | Description |
|---|---|
| `uren` | Standard hours registration werkbon |
| `oplevering` | Project delivery/completion werkbon (2-page: data + signature/selfie) |
| `project` | General project werkbon (2-page: data + signature/selfie) |
| `productie` | PUR insulation production werkbon (2-page: data + signature/selfie) |

## Deployment
### Production (Railway)
- **Status:** ✅ LIVE & HEALTHY
- **Fix applied:** `emergentintegrations==0.1.0` removed from `requirements.txt` (was causing Railway build failures)
- **Production Backend URL:** `https://web-production-7bce.up.railway.app`
- **Health Endpoint:** `https://web-production-7bce.up.railway.app/api/health`
- **Health Response:** `{"status": "healthy", "database": "connected"}`
- **GitHub Repository:** `https://github.com/Ekremkocabas/smart-ts-fullstack`

### Local Development (Emergent)
- **Frontend Preview:** `https://werkbon-portal.preview.emergentagent.com`
- **Backend:** `http://0.0.0.0:8001`

## Credentials
- Admin: info@smart-techbv.be / Smart1988-
- Worker: davy@smart-techbv.be / Smart1234-

## Prioritized Backlog (P0/P1/P2)

### P0 (Critical — Must ship now)
- **PDF photo layout:** Work photos must be LARGE (max 2 per PDF page, extra pages created as needed) for all three werkbon types: Oplevering, Project, Productie. Selfie stays small near signature. *(IN PROGRESS)*

### P1 (Important — Next sprint)
- **Worker auto-fill:** Pre-fill assigned worker names when opening a werkbon from the planning screen. Field remains editable. *(NOT STARTED)*
- **Productie Werkbon in admin panel:** Admin must be able to list, view detail, and access PDF for Productie werkbons, same as existing types. *(NOT STARTED)*

### P2 (Enhancement — Later)
- **GitHub Actions APK build automation:** CI/CD workflow for auto-generating APKs is broken. Explicitly deprioritized by user — do NOT work on this unless instructed.
- 'Voorziene uur' auto-calculation enhancement for Project werkbon
- B2C Planning (create plan without full client record)
- Multi-company SaaS / white-label onboarding flow
