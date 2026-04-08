# Trade Intelligence Roadmap

Bu dokuman, projeyi ham veri terminalinden proprietary karar motoruna tasimak icin resmi gelisim yolunu tanimlar.

Ana hedef:

`Ham veri gosteren sistem -> kendi matematiksel ciktilarini uretiyor -> kullaniciya aksiyon sunuyor`

---

## 1. Urun Vizyonu

Sistem kullaniciya sadece fiyat, oran ve haber gostermemelidir.

Sistem sunu uretmelidir:

- bugun alinabilir hisseler
- bu hafta uygun hisseler
- trade icin uygun hisseler
- uzun vade tasinabilir hisseler
- radar hisseleri
- reel olarak zayiflayan hisseler

Bu ciktilar:

- kendi formullerimiz
- kendi skor ailemiz
- kendi guven mekanigmiz
- kendi veri kontratimiz

uzerinden uretilmelidir.

---

## 2. Fazlar

### Faz 1: Guvenli Veri Zemini

Amaç:

`Matematikten once veri guvenilirligini resmi hale getirmek`

Teslimler:

- her veri alanina `source`
- her veri alanina `updated_at`
- her veri alanina `confidence`
- her metriğe `official / strong / proxy / weak` etiketi
- eksik veri oldugunda skor uretme filtresi
- Global Alpha bilesenleri icin source kalite matrisi

Basari Kriteri:

- sistem artik hangi veriye ne kadar guvendigini biliyor olacak
- skorlar kor atis degil, kalite etiketli uretilecek

### Faz 1.5: Proprietary Motor v1 Sertlestirme

Amaç:

`Mevcut v1 formullerini backend merkezli ve acik denetlenebilir hale getirmek`

Teslimler:

- Hakiki Alfa v1 backend standardizasyonu
- Trend Skoru v1 backend standardizasyonu
- Likidite Skoru v1 backend standardizasyonu
- Kalite Skoru v1 backend standardizasyonu
- Firsat Skoru v1 backend standardizasyonu
- hisse detay sayfasinda skor bloklari
- market tablolarinda yalnizca proprietary ciktilar

Basari Kriteri:

- ayni hisse ayni inputla her yerde ayni proprietary sonucu verecek

### Faz 2: Outcome ve Backtest Katmani

Amaç:

`Skorlarin gercekte ise yarayip yaramadigini olcmek`

Teslimler:

- gecmis gunluk skor snapshot arsivi
- her skor icin sonuc olcumu
- 1g / 5g / 20g sonra performans izleme
- precision / hit-rate / drawdown analizi
- agirlik kalibrasyonu

Basari Kriteri:

- skorlar sezgisel degil, veriyle kalibre edilmis olacak

### Faz 3: Tavsiye Motoru

Amaç:

`Skorlari kullaniciya aksiyon ve strateji onerisi olarak sunmak`

Teslimler:

- analiz sayfasi
- gunluk tavsiye tablosu
- trade masasi
- uzun vade biriktirme tablosu
- sat / azalt / bekle uyarilari
- portfoy baglamli tavsiye

Basari Kriteri:

- kullanici ham veriye bakmadan aksiyon alabilecek ozet cikti gorecek

### Faz 4: Kurumsal Kalite

Amaç:

`Sistemi dayanikli ve buyutulebilir hale getirmek`

Teslimler:

- scheduled jobs
- veri fallback zinciri
- source health monitor
- stale data alarmi
- endpoint health paneli
- veri snapshot arşivi
- test kapsami

Basari Kriteri:

- sistem veri bozulmalarinda sessizce yanlis sonuc uretmeyecek

---

## 3. Teknik Oncelik Sirasi

Resmi uygulama sirasi su olmalidir:

1. veri confidence katmani
2. Global Alpha kaynak sertlestirme
3. BIST skor motoru v1 tam backend standardizasyonu
4. skor snapshot kaydi
5. backtest ve kalibrasyon
6. analiz / tavsiye sayfasi

---

## 4. Hemen Baslanacak Isler

Bu roadmap ile birlikte hemen baslanacak isler:

1. Global Alpha ve proprietary skor payloadlarina confidence eklemek
2. BIST hisse proprietary skorlarinda data quality skoru uretmek
3. UI tarafinda bu guven seviyesini gostermeye hazir hale gelmek
4. sonrasinda historical snapshot katmanina gecmek

---

## 5. Sistem Prensibi

Trade Intelligence bundan sonra su ilke ile ilerler:

`once veri kalitesi, sonra proprietary matematik, sonra kullanici aksiyonu`

Bu ilke bozulmamalidir.
