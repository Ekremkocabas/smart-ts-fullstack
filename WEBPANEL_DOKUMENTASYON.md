# 📋 SMART-TECH BV WEBPANEL DOKÜMANTASİYONU

## 🔐 GİRİŞ (Login)
- **URL:** Ana sayfa (/)
- **E-mail:** info@smart-techbv.be
- **Şifre:** Smart1988-
- **Ne olmalı:** Giriş yaptıktan sonra Dashboard sayfasına yönlendirilmeli

---

## 📊 DASHBOARD
**URL:** /admin/dashboard

### Kartlar:
| Kart | Ne Göstermeli |
|------|---------------|
| Actieve Werknemers | Sistemdeki aktif çalışan sayısı (worker + onderaannemer) |
| Actieve Teams | Toplam team sayısı |
| Actieve Werven | Toplam şantiye sayısı |
| Klanten | Toplam müşteri sayısı |
| Ongelezen Berichten | Okunmamış mesaj sayısı |

### Butonlar:
- **Navigasyon menüsü (sol):** Tüm sayfalara erişim

---

## 📅 PLANNING
**URL:** /admin/planning

### Ne Yapmalı:
- Haftalık planlama görüntüleme
- Team ve werknemer planlarını görme
- Planlama ekleme/düzenleme

### Butonlar:
- **< / > Hafta değiştirme:** Önceki/sonraki haftaya geçiş
- **+ Nieuwe planning:** Yeni planlama ekleme

---

## 👥 WERKNEMERS
**URL:** /admin/werknemers

### Ne Yapmalı:
- Tüm çalışanları listele
- Çalışan ekleme/düzenleme/silme
- Aktif/inaktif durumu

### Butonlar:
- **+ Nieuwe werknemer:** Yeni çalışan ekleme
- **Düzenle ikonu (kalem):** Çalışan bilgilerini düzenle
- **Sil ikonu (çöp):** Çalışan silme

---

## 👨‍👩‍👧‍👦 TEAMS
**URL:** /admin/teams

### Ne Yapmalı:
- Tüm teamları listele
- Team oluşturma/düzenleme
- Team üyelerini yönetme

### Butonlar:
- **+ Nieuw team:** Yeni team oluşturma
- **Düzenle ikonu:** Team bilgilerini düzenle
- **Sil ikonu:** Team silme

---

## 🏢 KLANTEN (Müşteriler)
**URL:** /admin/klanten

### Ne Yapmalı:
- Tüm müşterileri listele
- Müşteri ekleme/düzenleme
- Uurtarief (saat ücreti) belirleme
- İletişim bilgileri

### Butonlar:
- **+ Nieuwe klant:** Yeni müşteri ekleme
- **Düzenle ikonu:** Müşteri bilgilerini düzenle
- **Sil ikonu:** Müşteri silme

---

## 🏗️ WERVEN (Şantiyeler)
**URL:** /admin/werven

### Ne Yapmalı:
- Tüm şantiyeleri listele
- Şantiye ekleme/düzenleme
- Adres ve GPS bilgileri

### Butonlar:
- **+ Nieuwe werf:** Yeni şantiye ekleme
- **Düzenle ikonu:** Şantiye bilgilerini düzenle
- **Sil ikonu:** Şantiye silme

---

## 📝 WERKBONNEN
**URL:** /admin/werkbonnen

### Sekmeler:
1. **Werkbonnen (Uren):** Saat bazlı werkbonlar
2. **Productie:** Üretim werkbonları (m² bazlı)

### Her Werkbon İçin Butonlar:
- **👁️ Görüntüle:** Werkbon detaylarını aç
- **📥 PDF:** PDF olarak indir
- **📧 Verzenden:** E-mail olarak gönder
- **🗑️ Sil:** Werkbon silme

### Filtreler:
- Tarih aralığı
- Durum (concept, ondertekend, verzonden)
- Werknemer, Klant, Werf

---

## 💬 BERICHTEN (Mesajlar)
**URL:** /admin/berichten

### Sekmeler:
1. **Werknemers:** Çalışanlara gönderilen mesajlar
2. **Onderaannemers:** Taşeronlara gönderilen mesajlar
3. **Archief:** Arşivlenmiş mesajlar
4. **Per Werknemer:** Her çalışanın mesaj klasörü (YENİ)

### Butonlar:
- **+ Nieuw bericht:** Yeni mesaj oluştur
- **📌 Vastpinnen:** Mesajı sabitle
- **📁 Archiveren:** Mesajı arşivle
- **🗑️ Verwijderen:** Mesajı sil
- **📎 Bijlage:** Dosya eki aç/indir

### Per Werknemer Sekmesi:
- Sol: Çalışan listesi (tıkla seç)
- Sağ: Seçili çalışanın mesajları

---

## 📈 RAPPORTEN
**URL:** /admin/rapporten

### Kartlar:
| Kart | Ne Göstermeli |
|------|---------------|
| Totaal uren | Toplam çalışma saati |
| Totaal werkbonnen | Toplam werkbon sayısı |
| Actieve werknemers | Aktif çalışan sayısı (sistemdeki tüm worker + onderaannemer) |
| Actieve werven | Toplam şantiye sayısı |

### Sekmeler:
1. **Per werknemer:** Çalışan bazlı rapor
2. **Per team:** Team bazlı rapor
3. **Per werf:** Şantiye bazlı rapor
4. **Per klant:** Müşteri bazlı rapor
5. **Status overzicht:** Durum özeti

### Butonlar:
- **Exporteer CSV:** Raporu CSV olarak indir

---

## ⚙️ INSTELLINGEN (Ayarlar)
**URL:** /admin/instellingen

### Sekmeler:
1. **Bedrijfsgegevens:** Şirket bilgileri
2. **E-mail instellingen:** E-mail ayarları (SMTP)
3. **PDF instellingen:** PDF şablonu ayarları
4. **App instellingen:** Mobil uygulama ayarları

### Kaydet Butonu:
Her değişiklik sonrası "Opslaan" butonuna tıklanmalı

---

## 📱 MOBİL UYGULAMA (APP)

### Login:
- Çalışanlar kendi e-mail/şifreleriyle giriş yapar
- "Worker" veya "Onderaannemer" rolü olanlar

### Ana Menü:
1. **Planning:** Kendi planlamasını görme
2. **Werkbon:** Werkbon doldurma (Uren, Productie, Oplevering, Project)
3. **Berichten:** Mesajları okuma (HENÜZ EKLENMEDİ)
4. **Profiel:** Profil düzenleme

### Werkbon Türleri:
1. **Uren Werkbon:** Saatlik çalışma kaydı (haftalık)
2. **Productie Werkbon:** m² bazlı üretim kaydı + fotoğraflar
3. **Oplevering Werkbon:** Teslim belgesi + fotoğraflar + imzalar
4. **Project Werkbon:** Proje bazlı kayıt + müşteri imzası

---

## 🚨 BİLİNEN SORUNLAR

| Sorun | Durum | Açıklama |
|-------|-------|----------|
| Rapporten sayıları | ✅ DÜZELTİLDİ | Actieve werknemers ve werven artık doğru gösterilmeli |
| PDF indirme | ✅ DÜZELTİLDİ | /api/werkbonnen/{id}/pdf endpoint'i eklendi |
| GridFS | ✅ DÜZELTİLDİ | Fotoğraflar artık GridFS'te saklanıyor |
| Berichten per werknemer | ✅ EKLENDI | Yeni tab eklendi |
| Mobile Berichten | ❌ EKSİK | Mobil uygulamada mesaj modülü henüz yok |
| Push Notifications | ❌ EKSİK | Bildirimler henüz yok |
| Dosya yönetimi (per werknemer) | ❌ EKSİK | Her çalışan için ayrı dosya klasörü sistemi henüz yok |

---

## 🔧 API ENDPOİNTLERİ

### Auth:
- `POST /api/auth/login` - Giriş
- `GET /api/auth/users` - Kullanıcı listesi
- `POST /api/auth/register` - Kayıt

### Werkbonnen:
- `GET /api/werkbonnen` - Uren werkbon listesi
- `GET /api/werkbonnen/{id}/pdf` - PDF indirme
- `POST /api/werkbonnen/{id}/verzenden` - E-mail gönderme
- `GET /api/productie-werkbonnen` - Productie werkbon listesi
- `GET /api/productie-werkbonnen/{id}/pdf` - Productie PDF indirme
- `GET /api/oplevering-werkbonnen` - Oplevering listesi
- `GET /api/project-werkbonnen` - Project listesi

### Files (GridFS):
- `GET /api/files/{file_id}` - Dosya indirme
- `POST /api/files/upload` - Dosya yükleme
- `DELETE /api/files/{file_id}` - Dosya silme

### Diğer:
- `GET /api/klanten` - Müşteri listesi
- `GET /api/werven` - Şantiye listesi
- `GET /api/teams` - Team listesi
- `GET /api/berichten` - Mesaj listesi
- `GET /api/planning` - Planlama listesi
- `GET /api/dashboard/stats` - Dashboard istatistikleri
