# BIST Market Data Audit v1

Tarih: 2026-04-01

Bu dokuman, BIST piyasa tablosunun gercek veri kalitesini denetlemek icin hazirlanmistir.

Denetim kaynagi:

- endpoint: `/api/python/market/bist/all`
- toplam cache'lenmis hisse: `589`

Amac:

- hangi alanlar gercekten dinamik ve dolu
- hangi alanlar dinamik ama eksik
- hangi alanlar yalanci-dolu gorunup aslinda kullanisiz
- hangi alanlar proprietary analiz motorunda guvenle kullanilabilir

---

## 1. Ozet Sonuc

BIST tarafinda:

- fiyat
- hacim
- market cap
- kisa/orta donem getiri
- teknik indikatorler
- trend / supertrend

cok guclu durumda.

Ama:

- finansal tablolar
- major holders
- analist verileri
- temettu
- ETF holders

alanlari genis kapsama sahip degil.

En kritik bulgu:

`financials` objesi bircok hissede response icinde var gorunuyor ama ic alanlari gercekte neredeyse tamamen bos.

Bu nedenle UI'da veya proprietary formulde sadece obje varligina bakmak hatalidir.

---

## 2. Guclu Alanlar

Asagidaki alanlar BIST evreninde neredeyse tamamen dolu ve gunluk proprietary hesaplar icin guvenle kullanilabilir:

- `last` : %100
- `change_percent` : %100
- `volume` : %100
- `market_cap` : %100
- `ta_summary` : %100
- `rsi` : %100
- `shares_outstanding` : %100
- `float_shares` : %100
- `fifty_two_week_high` : %99.8
- `fifty_two_week_low` : %99.8
- `supertrend_direction` : %99.7
- `p1w` : %99.7
- `p1m` : %99.0
- `p3m` : %97.3
- `p1y` : %96.4
- `ytd` : %99.7
- `adx` : %99.2
- `sector` : %98.5
- `industry` : %98.5
- `website` : %98.5
- `pb` : %97.3
- `fifty_day_avg` : %98.1
- `two_hundred_day_avg` : %96.6
- `foreign_ratio` : %95.8
- `isin` : %93.5

Karar:

Bu alanlar `BIST Core Dynamic Data Layer` olarak kabul edilmelidir.

---

## 3. Orta Guven Alanlar

Asagidaki alanlar mevcut ama kapsama seviyesi dusuyor:

- `p5y` : %64.3
- `ev_ebitda` : %55.7
- `pe` : %41.3

Karar:

Bu alanlar formule dogrudan zorunlu input olmamali.

Dogru kullanim:

- mevcutsa bonus sinyal
- yoksa cezalandirma yok

---

## 4. Zayif Alanlar

Asagidaki alanlar su an tum evren icin guvenilir degil:

- `rec_buy` : %26.7
- `rec_hold` : %26.7
- `rec_sell` : %26.7
- `dividend_yield` : %25.8
- `etf_holders` : %24.8
- `analyst_count` : %21.1
- `analyst_recommendation` : %12.6
- `analyst_upside` : %12.6
- `analyst_target` : %11.2

Karar:

Bunlar ana tablo kolonlari olmaktan cikmali.

Dogru kullanim:

- detay sayfasinda yardimci bilgi
- varsa ek sinyal
- yoksa default tavsiye uretmemeli

---

## 5. Yalanci-Dolu Alanlar

Bu alanlar response icinde var gibi gorunuyor ama gercek kullanim acisindan bos:

### 5.1 Financials

Objenin doluluk hissi var ama nested alanlar:

- `financials.total_assets` : %0
- `financials.total_debt` : %0
- `financials.total_equity` : %0
- `financials.cash` : %0
- `financials.revenue` : %0
- `financials.net_income` : %0
- `financials.ebitda` : %0
- `financials.operating_cashflow` : %0
- `financials.capex` : %0

Karar:

`financials` su an BIST toplu tablo icin guvenilir input degildir.

### 5.2 Major Holders

- `major_holders` listesi response icinde var gibi
- ama `name` dolu olan kayit orani: `%0`

Karar:

Bu alan bugun icin usable degildir.

Yani:

`major_holders` teknik olarak var
ama analitik olarak yok kabul edilmelidir.

---

## 6. Proprietary Sistem Icin Kullanilacak Cekirdek BIST Veri Seti

Ilk surumde BIST proprietary modelleri icin zorunlu veri seti su olmalidir:

- symbol
- name
- last
- change_percent
- volume
- market_cap
- foreign_ratio
- float_shares
- p1w
- p1m
- p3m
- p1y
- ytd
- pb
- fifty_two_week_high
- fifty_two_week_low
- fifty_day_avg
- two_hundred_day_avg
- rsi
- adx
- ta_summary
- supertrend_direction
- sector
- industry
- isin

Opsiyonel bonus sinyaller:

- pe
- ev_ebitda
- dividend_yield
- analyst_* alanlari
- etf_holders

Bugun kullanilmamasi gereken alanlar:

- financials.*
- major_holders.*

---

## 7. UI ve Urun Karari

Bu audit sonucuna gore:

### Ana piyasa tablosunda kalabilir

- fiyat
- gunluk degisim
- donemsel getiri
- teknik sinyal
- trend / supertrend
- goreli guc
- proprietary score

### Ana piyasa tablosundan cikmali veya geri plana alinmali

- analyst recommendation
- analyst target
- rec buy/hold/sell
- ETF holder alanlari
- major holders
- financial summary alanlari

Sebep:

evren geneline yaygin ve guvenilir degiller.

---

## 8. Sonraki Teknik Adimlar

### Adim 1

Piyasa tablosunu ham veri tablosu olmaktan cikar.

### Adim 2

Su proprietary kolonlari ekle:

- Hakiki Alfa
- Gunluk Firsat Skoru
- Trade Uygunluk Skoru
- Uzun Vade Kalite Skoru
- Aksiyon

### Adim 3

Detay sayfasina gitmeye devam edilsin ama ana tablo artik karar tablosu olsun.

### Adim 4

Financials icin ayri, saglam bir kaynak/ETL lazim.

Su anki BIST toplu endpoint bunu guvenilir vermiyor.

---

## 9. Nihai Karar

BIST market verisi:

- teknik ve fiyat bazli analiz icin guclu
- toplu fundamental analiz icin henuz yetersiz

Bu nedenle sistemin ilk proprietary surumu:

- fiyat
- hacim
- momentum
- trend
- goreli guc
- Hakiki Alfa

uzerine kurulmalidir.

Fundamental quality layer ise ikinci fazda daha saglam veri kontrati ile eklenmelidir.
