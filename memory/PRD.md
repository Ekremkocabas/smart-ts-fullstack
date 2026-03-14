# Smart-TS - PRD / Handoff

## Probleemstelling
Mevcut timesheet uygulaması, planlama, mesajlaşma, çoklu werkbon tipleri ve mobil kullanım odaklı tam operasyon yönetim sistemine dönüştürüldü. Son turda özellikle **Oplevering werkbon** akışı gerçek kullanıma uygun hale getirildi ve mobil APK test build’i tekrar hazırlandı.

## Mimari
- **Frontend:** Expo React Native (SDK 54), Expo Router, TypeScript
- **Backend:** FastAPI + MongoDB
- **PDF:** ReportLab
- **Mail:** Resend
- **Preview URL:** `https://ops-manager-15.preview.emergentagent.com`
- **Admin web panel:** `https://ops-manager-15.preview.emergentagent.com/admin/login`

## Uygulamada Olan Ana Modüller
1. Standart uren werkbon
2. Oplevering werkbon
3. Project werkbon
4. Planning / dispatch
5. Messaging / berichten
6. Dynamic theme + push notifications
7. Admin exportleri (CSV/PDF)

## Bu Forkta Doğrulanan Çalışan Loginler
- **Worker preview/app:** `davy@smart-techbv.be / Smart1234-`
- **Admin web panel:** `hr@smart-techbv.be / Smart1234-`
- **Ekrem hesabı:** `ekremkocabas@live.be / cf5ef946ba`

## Bu Turda Yapılanlar

### 1. Oplevering werkbon yeniden tasarlandı
- `Geen schade` / `Schade aanwezig` net butonları eklendi
- `Schade aanwezig` seçilirse foto zorunlu doğrulaması eklendi
- 5 adet yıldız değerlendirme alanı eklendi:
  - Kwaliteit van afwerking
  - Netheid werkplek
  - Communicatie
  - Stiptheid
  - Algemene tevredenheid
- Müşteri imza alanı eklendi
- İmza alanında opsiyonel `Ook naar klant mailen` seçeneği eklendi
- İstenirse müşteri e-mail alanı doldurulabiliyor

### 2. Backend Oplevering PDF + mail akışı eklendi
- Oplevering werkbon create endpoint’i zengin payload kabul edecek şekilde genişletildi
- Oplevering için ayrı PDF üretimi eklendi
- Oplevering PDF mail servisi eklendi
- PDF varsayılan olarak beheerder / şirket mailine gidiyor
- Toggle açıksa müşteri mailine de gönderiliyor

### 3. APK build ayarı düzeltildi
- `frontend/eas.json` preview profili artık çalışan preview backend’e bakıyor:
  - `https://ops-manager-15.preview.emergentagent.com`
- Bu önemliydi çünkü eski APK / build profili bozuk Railway backend’e bakıyordu

## Teknik Olarak Güncellenen Dosyalar
- `/app/frontend/app/werkbon/oplevering.tsx`
- `/app/backend/server.py`
- `/app/frontend/app/admin/login.tsx`
- `/app/frontend/eas.json`
- `/app/.github/workflows/android-build.yml`

## Test Özeti
- Worker login backend ve preview üzerinde çalışıyor
- Admin web panel login çalışıyor
- Oplevering form render test başarılı
- Oplevering create backend test başarılı
- Oplevering PDF mail gönderimi backend test başarılı
- Browser üzerinden end-to-end oplevering submit başarılı
- Test raporu: `/app/test_reports/iteration_7.json`

## Build Durumu
- Yeni Android preview APK build başlatıldı
- EAS build URL:
  - `https://expo.dev/accounts/smarttechbv/projects/smart-ts/builds/4f05938f-d0f4-4d1f-a947-5d11905762fd`
- Build ID:
  - `4f05938f-d0f4-4d1f-a947-5d11905762fd`

## P0 Backlog
- [ ] Railway canlı backend’i güncelle
- [ ] Final APK’yı Railway backend’e bağla
- [ ] GitHub Actions Android build akışındaki kalan CI hatalarını stabilize et

## P1 Backlog
- [ ] Oplevering / project werkbon admin görüntüleme ekranlarını genişlet
- [ ] Müşteri e-mail toggle davranışını admin ayarlarına bağla

## P2 Backlog
- [ ] Multi-tenant / company_id mimarisi
- [ ] EAS Update uyumluluğunu tamamlama
