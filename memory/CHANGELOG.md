# CHANGELOG - Smart-Tech BV Werkbon App

## 2026-03-11 - Sprint 4 (Latest)

### New Features
- **Werkbon delete from list**: Trash icon button next to each werkbon card in list
- **Edit before signing**: 'Bewerken' button on concept werkbons → new edit screen `/werkbon/bewerken/[id]`
- **After 'Versturen' → navigate back**: After successful send, app navigates to werkbon list
- **Kopiëren (Duplicate) werkbon**: 'Kopiëren' button copies werkbon with current week
- **BTW nummer on klant**: BTW field added to klant form in admin panel + shows on PDF/email
- **Professional email**: Dutch disclaimer: 'Gelieve uw opmerkingen binnen 5 werkdagen...'
- **Weekly stats dashboard**: Shows this week's count + hours on werkbon list
- **Week filter chips**: Horizontal filter by week number on werkbon list
- **Backend**: POST /api/werkbonnen/{id}/dupliceer endpoint

## Previous Sessions
- Admin panel with Alle Werkbonnen tab + CSV export
- BTW nummer for clients
- Toast notification on PDF send
- Delete worker feature
- Welcome email improvements
- Digital signature flow
- PDF generation with ReportLab
- Full CRUD for teams, clients, sites, workers, werkbonnen
