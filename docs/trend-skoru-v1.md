# Trend Skoru (TS) v1

Bu dokuman, Trade Intelligence icindeki resmi proprietary metriğin ikinci halkasini tanimlar.

Metrik adi:

`Trend Skoru (TS)`

Amac:

Bir hissenin kisa ve orta vadeli fiyat akisinin, teknik yonunun ve trend teyidinin ne kadar guclu oldugunu 0-100 araliginda olcmek.

---

## 1. Kullanim Amaci

Trend Skoru su soruya cevap verir:

`Bu hisse su anda gercekten trend ureten bir yapi icinde mi?`

Bu skor:

- gunluk firsat tablolarinda
- trade tablolarinda
- radar listelerinde
- momentum filtrelerinde

kullanilacaktir.

---

## 2. Input Veriler

Trend Skoru v1 icin gerekli alanlar:

- `daily_return`
- `weekly_return`
- `monthly_return`
- `three_month_return`
- `ytd_return`
- `vs_sma50`
- `vs_sma200`
- `ta_summary`
- `supertrend_direction`

Bu alanlar BIST denetiminde yuksek doluluk oranina sahip oldugu icin v1 icin uygundur.

---

## 3. Ara Bilesenler

### 3.1 Getiri Bileseni

`G_t = 0.20 * D + 0.25 * W + 0.25 * M + 0.20 * Q + 0.10 * Y`

Burada:

- `D`: gunluk getiri normalize edilmis hali
- `W`: haftalik getiri normalize edilmis hali
- `M`: aylik getiri normalize edilmis hali
- `Q`: 3 aylik getiri normalize edilmis hali
- `Y`: YTD getiri normalize edilmis hali

Her alt bilesen `[-100, +100]` yerine uygun cap ile kirpilip `0-100` bandina normalize edilir.

---

### 3.2 Trend Konum Bileseni

`K_t = 0.45 * SMA50 + 0.55 * SMA200`

Burada:

- `SMA50`: fiyatin 50 gunluk ortalamaya gore konumu
- `SMA200`: fiyatin 200 gunluk ortalamaya gore konumu

Mantik:

- 50 gunluk ortalama kisa trendi
- 200 gunluk ortalama ana trendi

Bu nedenle 200 gunluk ortalama daha yuksek agirlik alir.

---

### 3.3 Teknik Teyit Bileseni

`T_t`

asagidaki kurallarla hesaplanir:

- `STRONG_BUY`  -> 100
- `BUY`         -> 75
- `NEUTRAL`     -> 50
- `SELL`        -> 25
- `STRONG_SELL` -> 0

---

### 3.4 Supertrend Teyidi

`S_t`

kurali:

- `▲` -> 100
- `—` -> 50
- `▼` -> 0

---

## 4. Ana Formul

Trend Skoru:

`TS = 0.42 * G_t + 0.28 * K_t + 0.20 * T_t + 0.10 * S_t`

Bu skor 0 ile 100 arasina clamp edilir.

`TS = clamp(TS, 0, 100)`

---

## 5. Yorum

- `80 - 100`: guclu trend
- `65 - 79` : pozitif trend
- `50 - 64` : kararsiz / gecis bolgesi
- `35 - 49` : zayif trend
- `0 - 34`  : negatif trend

---

## 6. v1 Tasarim Notu

Trend Skoru, bilincli olarak:

- finansal tablo verisine bakmaz
- analist verisine bakmaz
- sahiplik verisine bakmaz

Cunku bunlar trendin kendisi degil, ayrik katmanlardir.

Trend Skoru sadece:

- fiyat akisi
- teknik yon
- trend teyidi

olcer.

Bu, skoru daha temiz ve daha yorumlanabilir yapar.
