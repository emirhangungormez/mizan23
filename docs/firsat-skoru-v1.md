# Firsat Skoru (FS) v1

Metrik adi:

`Firsat Skoru (FS)`

Bu skor, kullaniciya gosterilecek ana aksiyon skorudur.

Amac:

Trend, likidite, kalite ve reel goreli performans katmanlarini birlestirip:

`Bu hisse bugun veya yakin vadede ne kadar dikkat cekici bir firsat?`

sorusuna cevap vermek.

---

## 1. Input Skorlar

Firsat Skoru v1 su resmi alt skorlarla hesaplanir:

- `TS` : Trend Skoru
- `LS` : Likidite Skoru
- `KS` : Kalite Skoru
- `HA` : Hakiki Alfa

Ek v1 yardimci alan:

- `VS` : Deger sinyali / valuation support

Not:

Deger sinyali su an resmi ayri dokuman olarak tanimlanmamis olsa da,
v1 icinde yardimci bir destek bileseni olarak kullanilabilir.

---

## 2. Hakiki Alfa Donusumu

Hakiki Alfa dogrudan yuzdelik skor degildir.

Bu nedenle once normalize edilir:

`HA_n = normalize(HA)`

Pratikte:

- ciddi pozitif HA -> yuksek puan
- sifira yakin HA -> orta puan
- negatif HA -> dusuk puan

---

## 3. Ana Formul

Ilk resmi form:

`FS = 0.30 * TS + 0.22 * LS + 0.20 * KS + 0.18 * HA_n + 0.10 * VS`

Sonuc:

`FS = clamp(FS, 0, 100)`

---

## 4. Yorum

- `85 - 100`: bugun alinabilir
- `75 - 84` : bu hafta uygun
- `62 - 74` : izlenmeli / kademeli
- `50 - 61` : erken / teyit lazim
- `0 - 49`  : bekle

---

## 5. Uretilecek Aksiyon Katmanlari

Firsat Skoru tek basina gosterilmez.

Yaninda su ciktilar da uretilir:

### 5.1 Gunluk Aksiyon

- `Bugun Alinabilir`
- `Bu Hafta Uygun`
- `Izlenmeli`
- `Bekle`

### 5.2 Zaman Ufku

- `Bugun`
- `Bu hafta`
- `1-4 hafta`
- `Takip`

### 5.3 Guven Aciklamasi

Kisa metin uretilir.

Ornek:

- momentum, reel performans ve likidite birlikte guclu
- teknik iyi ama reel alpha zayif
- kalite iyi ancak trend teyidi eksik

---

## 6. Ilk Uygulama Kurali

Bir hisse:

- `FS` yuksek olsa bile
- `HA <= 0`

ise

ust seviye firsat listesinde dikkat notu ile gosterilmelidir.

Yani:

`Hakiki Alfa`, Firsat Skoru icinde sadece agirlik degil,
ayni zamanda ust filtre olarak da kullanilmalidir.

---

## 7. Trade ve Uzun Vade Turevleri

Firsat Skoru ana skordur.

Bundan tureyen baska skorlar:

- `Trade Uygunluk Skoru`
- `Uzun Vade Uygunluk Skoru`
- `Radar Skoru`

olabilir.

Ama ana referans skor:

`Firsat Skoru (FS)`

olacaktir.

---

## 8. Sistem Karari

Bu dokumanla birlikte:

- Trend Skoru
- Likidite Skoru
- Kalite Skoru
- Hakiki Alfa
- Firsat Skoru

Trade Intelligence icindeki ilk resmi proprietary skor ailesi olarak kabul edilir.
