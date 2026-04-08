# Ek Yapisal Skorlar v1

Bu belge, mevcut proprietary motorun ustune eklenen uc yeni yapisal skoru tanimlar:

- `Halka Aciklik Risk Skoru`
- `Finansal Dayaniklilik Skoru`
- `Sermaye Disiplini Skoru`

## 1. Halka Aciklik Risk Skoru

Kod alani:

- `halka_aciklik_risk_skoru`

Amac:

`Bu hissede tahta yapisi ve sahiplik dagilimi kaynakli yapisal risk ne kadar yuksek?`

Bakilan alanlar:

- `public_float_pct`
- `volume_usd`
- `foreign_ratio`
- `major_holders`

Mantik:

- dusuk halka aciklik risk artırır
- dusuk hacim risk artırır
- tek elde yogunlasmis ortaklik risk artırır
- daha saglikli yabanci ilgisi riski azaltir

Not:

Bu skor `iyi` degil, `risk` skorudur.
Yani yuksek skor = daha kirilgan yapi.

Kullanim:

- `Trade Masasi`
- `Gunluk Firsatlar`
- `Radar`

Bu modlarda yuksek risk, ana skoru asagi ceker.

## 2. Finansal Dayaniklilik Skoru

Kod alani:

- `finansal_dayaniklilik_skoru`

Amac:

`Makro baski, marj daralmasi veya sektor zorlugu geldiginde sirket ne kadar saglam kalabilir?`

Bakilan alanlar:

- `financials.debt_to_equity`
- `financials.net_margin`
- `financials.ebitda_margin`
- `financials.roe`
- `financials.roa`
- `financials.operating_cashflow`
- `financials.free_cashflow`
- `market_cap_usd`

Mantik:

- dusuk borcluluk pozitif
- saglikli marjlar pozitif
- pozitif ROE / ROA pozitif
- pozitif operasyonel nakit ve serbest nakit akisi pozitif
- daha buyuk olcek hafif tampon etkisi saglar

Kullanim:

- ozellikle `Uzun Vade`
- ikinci olarak genel kalite filtresi

## 3. Sermaye Disiplini Skoru

Kod alani:

- `sermaye_disiplini_skoru`

Amac:

`Yonetim hissedar sermayesine karsi nasil davraniyor?`

Bakilan alanlar:

- `dividend_consistency_score`
- `dividend_yield`
- `news`
- `historical_capital_actions`
- `share_buyback_history`

Mantik:

- duzenli temettu pozitif
- geri alim gecmisi pozitif
- bedelli / sulandirici sermaye artirimi negatif
- bedelsiz hafif pozitif

Kullanim:

- `Uzun Vade`
- `Kalite` yorumuna destek

## Ana Skorlara Etkisi

### Gunluk Firsatlar

- `halka_aciklik_risk_skoru` negatif etki

### Trade Masasi

- `halka_aciklik_risk_skoru` daha guclu negatif etki

### Uzun Vade

- `finansal_dayaniklilik_skoru` pozitif etki
- `sermaye_disiplini_skoru` pozitif etki
- `halka_aciklik_risk_skoru` hafif negatif etki

### Radar

- `halka_aciklik_risk_skoru` negatif etki

## Yorumlama

Ornekler:

- `Trade skoru yuksek ama halka aciklik risk skoru da yuksek`
  Anlam:
  hareket var, ama tahta kirilgan olabilir

- `Uzun vade skoru orta ama finansal dayaniklilik cok yuksek`
  Anlam:
  fiyat aksiyonu cok guclu olmasa da temel omurga saglam olabilir

- `Sermaye disiplini dusuk`
  Anlam:
  sirketin hissedar dostu davranis paterni zayif olabilir

## V2 Yon

Bir sonraki adimlarda:

- `historical_capital_actions` DB katmanindan gercek doldurulacak
- `share_buyback_history` aktif beslenecek
- finansal dayaniklilik backtest ile kalibre edilecek
- halka aciklik riski, devre kesici ve volatilite tarihiyle guclendirilecek
