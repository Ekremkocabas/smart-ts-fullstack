# Smart-TS Otomatik Android APK Build Özeti

## Tetikleme Kuralları
- `develop` branch push → `preview` APK build
- `main` branch push → `production` APK build
- İsteğe bağlı manuel tetikleme → GitHub Actions içinden `workflow_dispatch`

## Oluşturulan / Kullanılan Dosyalar
- `.github/workflows/android-build.yml`
- `frontend/eas.json`
- `frontend/credentials.json`
- `frontend/credentials/smartts.jks.base64`

## Gerekli GitHub Secret
- `EXPO_TOKEN`

## Sistem Nasıl Çalışır?
1. GitHub Action repo'yu alır
2. `frontend` içinde Yarn bağımlılıklarını kurar
3. `smartts.jks.base64` dosyasından Android keystore'u üretir
4. Branch'e göre doğru EAS profilini seçer
5. Android APK build başlatır ve tamamlanmasını bekler
6. Sonuç bilgisini GitHub Actions summary alanına ve metadata artifact'ine yazar

## APK Linki Nerede Görülür?
- GitHub Actions run özeti içinde
- Expo / EAS build detay sayfasında
- Workflow artifact'i içindeki `build-result.json` dosyasında

## Artık Manuel Gerekmeden Yapılanlar
- `eas build --platform android --profile preview`
- `eas build --platform android --profile production`
- Branch'e göre profil seçimi
- Keystore hazırlama

## Not
Bu kurulum mevcut Android package name ayarını değiştirmez ve mevcut Expo / EAS yapısını korur.