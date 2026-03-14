# Smart-Tech BV Operations Management App — PRD

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

## Credentials
- Admin: info@smart-techbv.be / Smart1988-
- Worker: davy@smart-techbv.be / Smart1234-

## Prioritized Backlog (P0/P1/P2)

### P0 (Critical)
- Live Railway deployment still pointing to wrong repo (blocked on user action)

### P1 (Important)
- PDF photo display: Work photos should be LARGE (max 2 per PDF page) for Oplevering & Project werkbons
- Worker auto-fill: Pre-fill assigned worker names in werkbons from planning
- GitHub Actions APK build automation (broken)

### P2 (Enhancement)
- Productie Werkbon in admin panel view/list
- 'Voorziene uur' auto-calculation enhancement for Project werkbon
- B2C Planning (create plan without full client record)
