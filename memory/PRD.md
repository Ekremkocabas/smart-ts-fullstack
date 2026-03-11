# Werkbon App PRD

## Probleemstelling
Mobiele werkbon app voor een bouwbedrijf waarmee beheerders werknemers kunnen beheren en waarmee werknemers kunnen inloggen, werkbonnen invullen, laten ondertekenen en als PDF per mail versturen.

## Architectuur
- Frontend: Expo / React Native / expo-router / Zustand
- Backend: FastAPI
- Database: MongoDB
- E-mail: Resend
- PDF: ReportLab

## Geïmplementeerd

### Auth & Rollen
- Admin login werkt voor `info@smart-techbv.be`
- Werknemers kunnen inloggen met e-mail + wachtwoord
- Inactieve werknemers worden correct geblokkeerd bij login
- Werknemers zien geen Beheer-tab meer
- Gebruikers kunnen hun eigen wachtwoord wijzigen via Profiel

### Beheerder / Beheer-panel
- Werknemers aanmaken met tijdelijk wachtwoord
- Tijdelijk wachtwoord zichtbaar in modal na aanmaak
- Werknemers activeren/deactiveren
- Werknemers verwijderen
- `Info mail` knop per werknemer: genereert nieuw tijdelijk wachtwoord, zet werknemer actief en probeert opnieuw de welkom/info mail te sturen
- Teams beheren
- Klanten beheren inclusief:
  - naam
  - e-mail
  - telefoon
  - adres
  - uurtarief
  - prijsafspraak / notitie
- Werven beheren inclusief bewerken
- Bedrijfsinstellingen beheren
- PDF-instellingen beheren

### Werkbon-flow
- Werknemer kan werkbon aanmaken
- Klant + werf selectie werkt
- Werkbon detail toont uren en afkortingen (Z, V, BV, BF)
- Handtekening opslaan werkt
- Na ondertekenen gaat gebruiker terug naar detail en ziet direct `Versturen als PDF`
- `Versturen als PDF` roept backend aan

### PDF & Mail
- Backend genereert professionele PDF
- PDF bevat bedrijfsinfo, klant/werf info, uren, afkortingen, handtekening en samenvatting
- Prijsafspraak van klant wordt meegenomen in PDF/e-mail indien ingevuld
- PDF mailflow probeert te verzenden naar bedrijfsmail + klantmail
- Bij niet-geverifieerd Resend domein faalt dit netjes zonder 500-crash

## Belangrijke huidige beperking
- Directe mails naar werknemers/klanten via Resend werken pas volledig nadat domein `smart-techbv.be` in Resend is geverifieerd en `info@smart-techbv.be` als afzender daarop actief is.

## Backlog

### P0
- Resend domeinverificatie afronden en live maillevering opnieuw valideren
- UI end-to-end nog één keer nalopen op echte mobiele device via Expo Go

### P1
- Meer beheer-optimalisaties voor facturatievoorbereiding:
  - extra export-ready metadata voor factuur/boekhoud-koppeling
  - betere klantafspraken/prijsregels per project
- Werkbon detail uitbreiden met nog duidelijkere mailstatus

### P2
- AI/factuurassistent koppeling voorbereiden
- Externe factuursoftware integratie