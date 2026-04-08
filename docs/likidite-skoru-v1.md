# Likidite Skoru (LS) v1

Metrik adi:

`Likidite Skoru (LS)`

Amac:

Bir hissenin hareketinin ne kadar tasinabilir, saglikli ve uygulanabilir oldugunu olcmek.

Bu skor su soruya cevap verir:

`Bu hissedeki fiyat hareketi gercekten islenebilir mi, yoksa sığ bir yapi mi?`

---

## 1. Input Veriler

Likidite Skoru v1 icin:

- `volume_usd`
- `market_cap_usd`
- `foreign_ratio`

kullanilir.

Sebep:

- hacim islenebilirligi olcer
- market cap sermaye buyuklugunu olcer
- yabanci orani kurumsal ilgi / piyasa derinligi proxysi olarak kullanilir

---

## 2. Ara Bilesenler

### 2.1 Hacim Bileseni

`H_t = normalize(log(1 + volume_usd))`

Ama pratik v1 icin basit kural kullanilir:

- cok dusuk hacim -> dusuk puan
- yuksek hacim -> yuksek puan

---

### 2.2 Buyukluk Bileseni

`B_t = normalize(log(1 + market_cap_usd))`

Mantik:

- market cap buyudukce manipule edilmesi daha zor olur
- cok kucuk hisseler ayni getiriyle daha zayif guvenilirlik tasir

---

### 2.3 Kurumsal Ilgi Bileseni

`K_t = normalize(foreign_ratio)`

Bu alan tam hakikat degildir ama:

- kurumsal ilgi
- yabanci sermaye derinligi
- daha izlenen hisse olma ihtimali

icin uygun bir proxydir.

---

## 3. Ana Formul

Likidite Skoru:

`LS = 0.45 * H_t + 0.35 * B_t + 0.20 * K_t`

Sonuc:

`LS = clamp(LS, 0, 100)`

---

## 4. Yorum

- `80 - 100`: cok guclu likidite
- `65 - 79` : saglikli likidite
- `50 - 64` : sinirda / izlenmeli
- `35 - 49` : zayif likidite
- `0 - 34`  : sığ ve riskli

---

## 5. Uygulama Kurali

Bir hisse:

- Trend Skoru yuksek olsa bile
- Likidite Skoru dusukse

gunluk aksiyon tablosunda ust siralarda yer almamali.

Yani Likidite Skoru:

`hareketin uygulanabilirlik filtresi`

olarak kullanilacaktir.
