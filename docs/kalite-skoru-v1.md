# Kalite Skoru (KS) v1

Metrik adi:

`Kalite Skoru (KS)`

Amac:

Bir hissenin daha uzun vadeli tasinabilirlik ve yapisal saglamlik hissini olcmek.

Bu skor su soruya cevap verir:

`Bu hisse sadece bugun hareketli mi, yoksa daha uzun sure tasinabilecek bir kalite izi veriyor mu?`

---

## 1. Input Veriler

Kalite Skoru v1 icin:

- `one_year_return`
- `market_cap_usd`
- `foreign_ratio`
- `vs_sma200`
- `adx`
- `rsi`

kullanilir.

Sebep:

- 1 yillik performans kalicilik izini verir
- market cap daha buyuk ve olgun yapilari destekler
- foreign ratio kurumsal ilgi proxysi sunar
- SMA200 ana trend konumunu verir
- ADX trend kalitesini olcer
- RSI asiri bozulma ya da asiri isinma durumunu filtreler

---

## 2. Ara Bilesenler

### 2.1 Kalicilik Bileseni

`C_t = normalize(one_year_return)`

Ama tek basina kullanilmaz.

Sebep:

tek basina yuksek 1Y getiri bazen sadece spekulatif sisme olabilir.

---

### 2.2 Yapisal Buyukluk Bileseni

`B_t = normalize(log(1 + market_cap_usd))`

---

### 2.3 Kurumsal Ilgi Bileseni

`F_t = normalize(foreign_ratio)`

---

### 2.4 Ana Trend Bileseni

`A_t = normalize(vs_sma200)`

---

### 2.5 Trend Kalitesi Bileseni

`D_t = normalize(adx)`

---

### 2.6 Denge Bileseni

`R_t`

RSI icin:

- `45 - 68` arasi -> yuksek puan
- `30 alti` veya `75 ustu` -> dusuk puan

Sebep:

uzun vadede cok bozulmus veya asiri isinmis yapilar daha kirilgan kabul edilir.

---

## 3. Ana Formul

Kalite Skoru:

`KS = 0.24 * C_t + 0.18 * B_t + 0.16 * F_t + 0.20 * A_t + 0.12 * D_t + 0.10 * R_t`

Sonuc:

`KS = clamp(KS, 0, 100)`

---

## 4. Yorum

- `80 - 100`: yuksek kalite
- `65 - 79` : tasinabilir kalite
- `50 - 64` : orta kalite
- `35 - 49` : zayif kalite
- `0 - 34`  : uzun vade icin zayif

---

## 5. v1 Notu

Kalite Skoru v1, henuz gercek bilanço kalitesi kullanmaz.

Sebep:

BIST toplu financials verisi su anda guvenilir degil.

Bu nedenle v1 Kalite Skoru:

- fiyat kaliciligi
- trend yapisi
- buyukluk
- kurumsal ilgi

uzerinden gider.

v2'de:

- net margin
- roe
- debt_to_equity
- free cash flow

gibi gercek kalite verileri eklenmelidir.
