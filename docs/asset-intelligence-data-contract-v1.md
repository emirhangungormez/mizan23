# Asset Intelligence Data Contract v1

Bu dokuman, Trade Intelligence icindeki piyasa tablolarinin ve gelecekteki proprietary analiz motorunun veri omurgasini tanimlar.

Ana hedef:

- ham veriyi gostermek yerine arka planda kullanmak
- kendi matematiksel sistemimizi kurmak
- kullaniciya dogrudan yorum, siniflama ve aksiyon uretmek

Bu nedenle piyasa tablolarinin amaci:

`veri gostermek` degil,
`veri toplamak, dogrulamak, hesaplamak ve proprietary cikti uretmek`

olmalidir.

---

## 1. Urun Yonelimi

Gelecekte kullaniciya su tarz tablolar gostermek istiyoruz:

- bugun alinabilecek hisseler
- bu hafta alinmasi uygun hisseler
- uzun sure tutulabilecek hisseler
- trade odakli alip satilabilecek hisseler
- goreli olarak pahali / ucuz kalan hisseler
- Hakiki Alfa ureten hisseler

Yani ham F/K, PD/DD, RSI, hacim gibi kolonlar son hedef degildir.

Bunlar sadece input verileridir.

Asil hedef tablolar:

- `Gunluk Aksiyon Tablosu`
- `Haftalik Firsat Tablosu`
- `Uzun Vade Kalite Tablosu`
- `Trade / Rotasyon Tablosu`
- `Ek Analiz / Yatirim Tavsiyesi` sayfasi

---

## 2. Temel Kural

Sistemde analizde kullanilan hicbir alan statik olmamalidir.

Izin verilen durumlar:

- canli veri
- cache'lenmis canli veri
- canli veriden turetilmis proprietary veri

Izin verilmeyen durumlar:

- elle girilmis sabit oranlar
- guncellenmeyen statik kolonlar
- placeholder veri ile karar uretmek

Tek istisna:

- metodoloji sabitleri
- formule ait agirliklar
- deneysel v1 parametreleri

Bunlar da belgelenmis olmalidir.

---

## 3. Mevcut Durum Denetimi

Bu bolum, su anki piyasa tablolarinda hangi verilerin dinamik geldiginin ozetidir.

### 3.1 BIST Tablosu

Kaynak:

- `engine-python/api/bist_data.py`
- ana kaynak `borsapy`
- arka planda cache/store mantigi var

Durum:

- `fiyat`, `gunluk degisim`, `hacim`, `market cap`, `FK`, `PD/DD`, `FD/FAVOK`, `temettu`, `52 hafta`, `SMA50`, `SMA200`, `TA sinyalleri`, `analist`, `major holders`, `dividends`, `financials`, `news`, `calendar`, `ETF holders`, `supertrend`
  dinamik veya dinamik olarak cekilmeye calisilan alanlar

Not:

- tum alanlar her hisse icin garanti degil
- veri dinamik ama bazi alanlar `provider sparse` olabilir
- yani statik degil, fakat eksik gelebilir

### 3.2 ABD / Kripto / Emtia / Fon Tablolari

Kaynaklar:

- `MarketService`
- `engine-python/api/market.py`
- `yfinance`
- `borsapy`
- bazi ozel market fetch mekanizmalari

Durum:

- fiyat ve degisim alanlari dinamik
- ama BIST kadar derin veri contract'i henuz yok
- su anda daha cok market overview seviyesi var

### 3.3 UI Tarafinda Dikkat Edilecekler

Asagidaki seyler is mantigi acisindan zayif kabul edilmeli:

- veriyi gosteren ama karar uretmeyen tablolar
- tum hisseleri kolon kolon sergileyen yapilar
- provider'dan gelen ham metric'leri oldugu gibi sunmak

Bu yapilar zamanla suya donusmeli:

- skor
- sinif
- zaman ufku
- risk seviyesi
- aksiyon onerisi

---

## 4. Bir Varlik Icın Aslinda Hangi Verilere Ihtiyacimiz Var

Bir hisse ya da varlik icin ihtiyacimiz olan veriler 10 ana grupta toplanmali.

### 4.1 Kimlik Verileri

- symbol
- name
- market
- asset_type
- exchange
- sector
- industry
- currency
- isin

### 4.2 Fiyat ve Likidite Verileri

- last_price
- open
- high
- low
- prev_close
- volume
- turnover_amount
- average_volume_20d
- average_volume_90d
- volume_usd
- market_cap
- market_cap_usd
- shares_outstanding
- free_float

### 4.3 Getiri ve Momentum Verileri

- daily_return
- weekly_return
- monthly_return
- three_month_return
- ytd_return
- one_year_return
- five_year_return
- relative_strength_vs_index
- relative_strength_vs_sector
- price_acceleration
- momentum_rank

### 4.4 Degerleme Verileri

- pe
- forward_pe
- pb
- ps
- ev_ebitda
- ev_sales
- dividend_yield
- earnings_yield
- free_cashflow_yield

### 4.5 Karlilik ve Kalite Verileri

- revenue
- revenue_growth
- gross_profit
- gross_margin
- ebitda
- ebitda_margin
- operating_income
- operating_margin
- net_income
- net_margin
- roe
- roa
- roic
- free_cash_flow

### 4.6 Bilanço ve Dayaniklilik Verileri

- total_assets
- total_liabilities
- total_equity
- total_debt
- net_debt
- cash
- debt_to_equity
- current_ratio
- quick_ratio
- interest_coverage

### 4.7 Teknik ve Rejim Verileri

- rsi
- macd
- macd_signal
- adx
- stochastic_k
- stochastic_d
- cci
- williams_r
- supertrend_direction
- vs_sma50
- vs_sma200
- volatility
- beta
- regime
- entropy
- hurst

### 4.8 Sahiplik ve Akis Verileri

- foreign_ratio
- float_shares
- major_holders
- etf_holders
- institutional_interest
- insider_activity if available

### 4.9 Olay ve Takvim Verileri

- earnings_date
- dividend_date
- ex_dividend_date
- KAP / news flow
- corporate actions

### 4.10 Makro ve Goreli Referans Verileri

- usd_return
- eur_return
- gold_return
- silver_return
- btc_return
- sp500_return
- global_alpha_return
- Hakiki Alfa
- relative_real_return

---

## 5. Zorunlu Proprietary Output Katmani

Topladigimiz veri son kullaniciya ham halde verilmek zorunda degil.

Asil cikti katmani su alanlari uretmelidir:

### 5.1 Gunluk Oneri

- `Bugun Alinabilir`
- `Bugun Izlenmeli`
- `Bugun Uzak Dur`

### 5.2 Zaman Ufku Onerisi

- `Gunluk Trade`
- `Haftalik Firsat`
- `Orta Vade Biriktir`
- `Uzun Vade Tut`

### 5.3 Strateji Tipi

- `Momentum`
- `Deger`
- `Defansif`
- `Kalite`
- `Donus Hikayesi`
- `Trade`

### 5.4 Risk Ciktilari

- risk score
- oynaklik skoru
- zayiflik uyarisi
- likidite uyarisi
- bilanco baskisi

### 5.5 Reel / Hakiki Performans Ciktilari

- Hakiki Alfa
- Altin karsisi getiri
- Dolar karsisi getiri
- Global Alpha sepeti karsisi getiri

---

## 6. Minimum Data Contract: Gunluk Hesap Icin Zorunlu Alanlar

Bir hisseyi sistem icinde anlamli sekilde puanlamak icin minimum zorunlu alanlar:

- symbol
- last_price
- daily_return
- volume
- market_cap
- pe or equivalent valuation signal
- pb or equivalent balance valuation signal
- roe or net_margin
- debt_to_equity or net_debt proxy
- vs_sma50
- vs_sma200
- rsi
- adx
- foreign_ratio if available
- sector
- news / event awareness if available
- Hakiki Alfa inputlari

Bu alanlardan biri provider'da yoksa:

- alternatif kaynak aranir
- yine yoksa null kalir
- ama null olan veri asla fake/default sabit deger ile doldurulmaz

---

## 7. Veri Frekansi

Frekanslari ayirmak gerekir.

### Gercek Zaman / Gun Ici

- fiyat
- hacim
- gunluk degisim

### Gun Sonu

- period returns
- teknik olcumler
- Hakiki Alfa
- relative strength
- proprietary signal scores

### Daha Yavas Veri

- bilanco
- temettu
- analist
- sahiplik
- makro para arzi

Bu nedenle sistem her veriyi ayni siklikta guncellemeye calismamali.

Dogru tasarim:

- hizli veri katmani
- gunluk hesap katmani
- yavas fundamental katmani

---

## 8. Piyasa Tablolari Icin Yeni Yapi Onerisi

Ham tablolar zamanla su tablolarla degistirilmelidir:

### 8.1 Piyasa Firsat Tablosu

Kolonlar:

- hisse
- proprietary score
- Hakiki Alfa
- zaman ufku
- aksiyon
- guven seviyesi

### 8.2 Trade Tablosu

Kolonlar:

- hisse
- momentum durumu
- teknik rejim
- volatilite
- likidite
- gunluk aksiyon

### 8.3 Uzun Vade Tablosu

Kolonlar:

- hisse
- kalite skoru
- bilanco skoru
- degerleme skoru
- Hakiki Alfa trendi
- uygunluk

### 8.4 Analiz Sayfasi

Bu sayfa kullaniciya proprietary tavsiye vermelidir.

Ornek ciktilar:

- bu hisse bugun alinabilir
- bu hisse izlenmeli ama teyit beklenmeli
- bu hisse uzun vade biriktirme adayi
- bu hisse sadece trade odakli uygun
- bu hissede reel getiri zayif

---

## 9. Veri Toplama Oncelik Sirasi

Asagidaki sirayla ilerlemeliyiz:

### Faz 1

- BIST verilerindeki tum alanlari tek tek denetle
- hangi alanlar dolu / bos / guvenilir cikar
- asset-level data contract sabitle

### Faz 2

- ABD / Kripto / Emtia icin ayni seviyede data contract kur
- her varlik sinifi icin zorunlu alanlari belirle

### Faz 3

- Hakiki Alfa
- Gunluk proprietary score
- zaman ufku siniflama

### Faz 4

- Tavsiye motoru
- analiz sayfasi
- ham tablolar yerine proprietary action tablolari

---

## 10. Bu Dokumanin Karari

Bu projede piyasa tablolarinin ana rolu:

`ham veri gostermek` degil,
`arka planda veri toplamak ve proprietary matematiksel cikti uretmek`

olarak kabul edilir.

Bu nedenle bundan sonraki tum gelistirmelerde su soru sorulmalidir:

`Bu alan kullaniciya gosterilmek icin mi var, yoksa sistemin proprietary hesaplarina input olmak icin mi var?`

Dogru cevap cogu zaman ikinci olmalidir.
