# Smart-Tech BV Werkbon App - PRD

## Original Problem Statement
Bouw een mobiele werkbon-app voor Smart-Tech BV (constructiebedrijf). Werknemers kunnen digitale werkbonnen invullen, ondertekenen en als PDF versturen naar klanten.

## User Personas
- **Admin** (info@smart-techbv.be): Beheert werknemers, klanten, werven en ziet alle werkbonnen
- **Werknemer**: Maakt werkbonnen, vult uren in, ondertekent en verstuurt als PDF

## Core Requirements
1. Inloggen met bedrijfse-mail
2. Teamleden / werknemers beheer
3. Klanten & werven beheer (inclusief BTW nummer)
4. Werkbon aanmaken met weekoverzicht en uren per teamlid
5. Digitale handtekening van klant
6. PDF generatie en e-mail verzending
7. Admin overzicht van alle werkbonnen + CSV export

## Architecture
- **Frontend**: Expo (React Native), TypeScript, expo-router
- **Backend**: FastAPI (Python), port 8001
- **Database**: MongoDB
- **Email**: Resend.com (API key in backend .env)
- **PDF**: ReportLab (Python)
- **State**: Zustand store

## Key File Structure
```
/app/backend/server.py         - All FastAPI endpoints, PDF generation, email
/app/frontend/
  app/
    (tabs)/
      index.tsx                - Werkbon list with stats, week filter, delete buttons
      beheer.tsx               - Admin panel (workers, clients, settings)
    werkbon/
      [id].tsx                 - Werkbon detail (Bewerken/Ondertekenen/Versturen/Kopiëren)
      nieuw.tsx                - Create new werkbon
      bewerken/[id].tsx        - Edit existing werkbon
    handtekening/[id].tsx      - Digital signature screen
  store/appStore.ts            - Zustand state management
  context/AuthContext.tsx      - Auth context
```

## Admin Credentials
- Email: info@smart-techbv.be
- Password: smart123
