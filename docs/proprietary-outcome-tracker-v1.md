# Proprietary Outcome Tracker v1

Bu dokuman, snapshot arşivi uzerinden proprietary skorlarin sonradan nasil olculecegini tanimlar.

Amac:

`Bugun verdigimiz skorlar yarin ve sonraki gunlerde gercekten ise yariyor mu?`

---

## 1. Temel Mantik

Her is gunu sistem bir BIST proprietary snapshot kaydeder.

Bu kayitta:

- firsat skoru
- trade skoru
- uzun vade skoru
- radar skoru
- hakiki alfa
- kapanisa yakin fiyat

yer alir.

Sonraki snapshot geldiginde ayni hisse icin fark hesaplanir.

---

## 2. Ilk Outcome Metrikleri

v1'de su ciktilar uretilir:

- `future_return_pct`
- `hit`
- `avg_return_pct`
- `median_return_pct`
- `hit_rate`
- `positive_count`
- `negative_count`

---

## 3. V1 Segmentler

Ilk segmentler:

- `Top Firsat 20`
- `Top Trade 20`
- `Top Uzun Vade 20`
- `Top Hakiki Alfa 20`

---

## 4. Ufuklar

Ilk resmi ufuklar:

- `1 gun`
- `5 gun`
- `20 gun`

Snapshot uygun degilse bir sonraki mevcut snapshot kullanilir.

---

## 5. Ilk Karar Amaci

Bu tracker'in ilk amaci tavsiye vermek degil, kalibrasyon yapmaktir.

Yani soru sunlar olacak:

- yuksek FS gercekten daha iyi sonuc verdi mi?
- yuksek HA gercekten reel ustunluk olctu mu?
- trade skoru hizli sonucu daha iyi yakaladi mi?
- uzun vade skoru erken davranip noise mu uretiyor?

---

## 6. V2 Yonu

Sonraki asamada:

- benchmark'a gore excess return
- max drawdown
- precision@k
- decile analysis
- sector-adjusted outcome

eklenmelidir.
