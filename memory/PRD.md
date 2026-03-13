# Smart-TS (Smart Timesheet) - Product Requirements Document

## Original Problem Statement
Digitale werkbon (timesheet) applicatie voor een bouwbedrijf. Werknemers kunnen werkbonnen aanmaken, invullen, laten ondertekenen en als PDF versturen naar de klant.

## User Personas
- **Beheerder (Admin)**: info@smart-techbv.be - beheert klanten, werven, werknemers, bekijkt rapporten
- **Werknemer**: logt in, maakt werkbonnen aan, vult uren in, laat ondertekenen

## Core Requirements
1. Werkbon aanmaken met weeknummer, klant, werf, uren per teamlid per dag
2. Km-afstand registratie
3. Digitale handtekening
4. PDF generatie en e-mail verzending
5. Admin beheer (klanten, werven, werknemers, teams)
6. Rapport/overzicht per werknemer

## Architecture
- **Frontend**: Expo (React Native) + TypeScript + Zustand store
- **Backend**: FastAPI (Python) - Port 8001
- **Database**: MongoDB
- **PDF**: ReportLab
- **Email**: Resend.com
- **URL**: https://web-portal-debug.preview.emergentagent.com

## File Structure
```
/app/backend/server.py          # All API endpoints, PDF gen, email
/app/frontend/
  app/
    (auth)/login.tsx            # Login screen
    (tabs)/index.tsx            # Werkbonnen lijst
    (tabs)/beheer.tsx           # Admin beheer
    (tabs)/rapport.tsx          # Uren rapport
    (tabs)/profiel.tsx          # Profiel
    werkbon/[id].tsx            # Werkbon detail
    werkbon/bewerken/[id].tsx   # Werkbon bewerken
    werkbon/nieuw.tsx           # Nieuwe werkbon
    handtekening/[id].tsx       # Handtekening scherm
  store/appStore.ts             # Zustand state management
  utils/alerts.ts               # Cross-platform alert helper
```

## What's Been Implemented (CHANGELOG summary)
See CHANGELOG.md for full history.

## Prioritized Backlog

### P0 - Critical
- [ ] User's real werf data restoration (still partially missing)
- [ ] Delete Worker feature - needs final testing

### P1 - Important  
- [ ] Twilio SMS verificatie (infrastructure gebouwd, UI aanwezig, niet actief)
- [ ] PWA manifest voor betere home screen installatie
- [ ] Werf data herstel voor echte gebruiker

### P2 - Nice to have
- [ ] AI-gestuurde factuurkoppeling
- [ ] Bulk PDF export voor meerdere werkbonnen
- [ ] Push notificaties

## Key Credentials / Config
- Admin login: info@smart-techbv.be / smart123
- Backend: port 8001
- App URL: https://web-portal-debug.preview.emergentagent.com
