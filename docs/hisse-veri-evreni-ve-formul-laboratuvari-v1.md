# Hisse Veri Evreni ve Formul Laboratuvari v1

Bu belge, tek bir hisse icin bugun sistemde hangi verileri cekebildigimizi, hangilerinin daha guvenilir oldugunu ve bu veri katmanlarindan hangi yeni proprietary formulleri uretebilecegimizi toplar.

## Amac

Hedefimiz sadece:

- fiyat
- grafik
- teknik indikator

gostermek degil.

Hedefimiz:

- hisseyi cok katmanli okumak
- veriyi yorum motoruna cevirmek
- kendi matematiksel sistemimizi kurmak

## 1. Bugun Gercekten Cekebildigimiz Veri Katmanlari

### A. Piyasa ve Fiyat Katmani

Kaynak:

- `engine-python/api/bist_data.py`
- `/api/market/bist/stock/{symbol}`
- `/api/market/asset/{symbol}`

Alanlar:

- `last`
- `change`
- `change_percent`
- `open`
- `prev_close`
- `day_high`
- `day_low`
- `volume`
- `volume_usd`
- `market_cap`
- `market_cap_usd`
- `updated_at`

Kullanim:

- anlik fiyat davranisi
- gun ici hareket kalitesi
- likidite ve islenebilirlik

### B. Tarihsel Performans Katmani

Alanlar:

- `p1w`
- `p1m`
- `p3m`
- `p1y`
- `p5y`
- `ytd`
- `from_52w_low`
- `upside_52w`

Kullanim:

- momentum
- tasima gucu
- zirve/dip baglami
- goreli performans rejimi

### C. Teknik ve Trend Katmani

Alanlar:

- `ta_summary`
- `ta_buy`
- `ta_sell`
- `ta_neutral`
- `ma_recommendation`
- `ma_buy`
- `ma_sell`
- `rsi`
- `macd`
- `macd_signal`
- `stoch_k`
- `stoch_d`
- `cci`
- `adx`
- `williams_r`
- `momentum`
- `fifty_day_avg`
- `two_hundred_day_avg`
- `vs_sma50`
- `vs_sma200`
- `supertrend`
- `supertrend_direction`

Kullanim:

- trend gucu
- teyit seviyesi
- asiri isinma / erken toparlanma
- giris kalitesi

### D. Degerleme Katmani

Alanlar:

- `pe`
- `pb`
- `ev_ebitda`
- `dividend_yield`

Kullanim:

- pahali/ucuz sinyali
- kalite destekli deger
- value trap filtresi

### E. Sirket Kimligi ve Siniflama

Alanlar:

- `name`
- `sector`
- `industry`
- `website`
- `isin`

Kullanim:

- sektor modeli
- benzer sirket gruplari
- sektor goreli guc
- sektor spesifik faktor motorlari

### F. Analist ve Hedef Fiyat Katmani

Alanlar:

- `analyst_recommendation`
- `analyst_target`
- `analyst_upside`
- `analyst_count`
- `target_low`
- `target_high`
- `target_mean`
- `target_median`
- `rec_strong_buy`
- `rec_buy`
- `rec_hold`
- `rec_sell`
- `rec_strong_sell`

Kullanim:

- kurumsal beklenti farki
- hedef fiyat boslugu
- konsensus gucu
- “kalabalik trade” riski

### G. Sahiplik ve Halka Aciklik Katmani

Alanlar:

- `float_shares`
- `shares_outstanding`
- `public_float_pct`
- `foreign_ratio`
- `major_holders`
- `etf_holders`

Kullanim:

- halka aciklik kalitesi
- kurumsal tasiyici var mi
- tahtanin yogunlasma riski
- sert hareket / manipule edilebilirlik riski

### H. Temettu ve Sermaye Davranisi Katmani

Alanlar:

- `dividends`
- `dividend_event_count`
- `dividend_consistency_score`
- `dividend_yield`

Kullanim:

- temettu disiplini
- sermaye iadesi karakteri
- uzun vade tasima guveni

### I. Finansal Tablolar Katmani

Alanlar:

- `financials.total_assets`
- `financials.total_debt`
- `financials.total_equity`
- `financials.cash`
- `financials.net_debt`
- `financials.debt_to_equity`
- `financials.revenue`
- `financials.gross_profit`
- `financials.operating_income`
- `financials.net_income`
- `financials.ebitda`
- `financials.gross_margin`
- `financials.operating_margin`
- `financials.net_margin`
- `financials.ebitda_margin`
- `financials.roe`
- `financials.roa`
- `financials.operating_cashflow`
- `financials.capex`
- `financials.free_cashflow`

Kullanim:

- kalite
- marj trendi
- borcluluk
- nakit uretimi
- sermaye verimliligi

Not:

Toplu BIST akisinda bu alanlar bugun hala her hissede dolu degil. Bu katman cok degerli ama ilk etapta `cache + snapshot + quality gating` ile kullanilmali.

### J. KAP / Haber / Takvim Katmani

Alanlar:

- `news`
- `calendar.earnings_date`
- `calendar.dividend_date`
- `calendar.ex_dividend_date`

Kullanim:

- olay akisi
- katalist takibi
- finansal rapor / faaliyet raporu sinyali
- kredi notu / yeni is / geri alim / islem yasagi filtreleri

### K. Proprietary Katmanlar

Halihazirda uretilen alanlar:

- `trend_score`
- `liquidity_score`
- `quality_score`
- `value_support_score`
- `hakiki_alfa`
- `firsat_skoru`
- `trade_skoru`
- `uzun_vade_skoru`
- `radar_skoru`
- `analyst_support_score`
- `catalyst_score`
- `kap_etki_skoru`
- `ownership_score`
- `sahiplik_kalitesi_skoru`
- `sector_context_score`
- `signals`
- `score_drivers`
- `mode_weights`
- `data_quality`

## 2. Hemen Acabilecegimiz Ek Veri Katmanlari

Sistemde izi bulunan ama tam urunlestirilmemis alanlar:

### A. Company ETL / KAP DB Katmani

Kod izleri:

- `engine-python/engine/storage/db.py`
- `engine-python/engine/data/company_financials.py`
- `engine-python/engine/data/kap_etl.py`

Alanlar:

- `company_profile`
- `company_shareholders`
- `company_subsidiaries`
- `foundation_year`
- `headquarters`
- `revenue_segments`
- `export_revenue_ratio`
- `foreign_currency_revenue_ratio`
- `government_dependency_ratio`
- `top_customer_concentration`
- `capex`
- `depreciation_amortization`
- `working_capital_change`
- `interest_expense`
- `interest_income`
- `free_float_ratio`
- `public_float_ratio`
- `historical_capital_actions`
- `dividend_policy_text`
- `share_buyback_history`

Bu katman cok kritik cunku artik sadece piyasa verisi degil:

- is modelini
- gelir kalitesini
- musteride yogunlasma riskini
- doviz hassasiyetini
- sermaye davranisini

olcmeye baslariz.

### B. Asset Details / Tarihsel Derinlik

Endpoint:

- `/api/market/asset/{symbol}`

Bu endpoint daha derin ama canli cagrisinda yavas kalabiliyor.

Bu nedenle:

- UI’da direkt her seferinde cagirmak yerine
- snapshot / cache / on-demand refresh

daha dogru.

### C. Company Financial Analysis

Endpoint:

- `/api/market/company/{symbol}/financials`

Bu da daha zengin ama daha agir.

Kullanim sekli:

- detay sayfasinda lazy load
- gece job’lari ile local cache
- skorlama motorunda cached read

olmali.

## 3. Veri Kalitesi ve Mimari Notlari

Bugun pratikte veri 3 gruba ayriliyor:

### 1. Guclu ve hizli

- fiyat
- getiriler
- temel teknik indikatorler
- sektor/industry
- yabanci oran

Bunlar gunluk skor motorunda dogrudan kullanilabilir.

### 2. Degerli ama kismen eksik

- analist verileri
- ETF holders
- major holders
- KAP basliklari

Bunlar kullanilabilir ama `coverage / confidence` ile agirliklanmali.

### 3. Cok degerli ama cache gerektiren

- sirket finansallari
- KAP ETL ile gelen profile/subsidiary/shareholder yapisi
- revenue segmentation
- capital actions

Bunlar da esas kurumsal motoru guclendirir ama mutlaka snapshot/cached olmalidir.

## 4. Yeni Formul Aileleri

Buradaki hedef tek skor degil; farkli karar sorularina farkli matematikler kurmak.

### 1. Kurumsal Zemin Skoru (KZS)

Input:

- `foreign_ratio`
- `public_float_pct`
- `major_holders`
- `etf_holders`
- `dividend_consistency_score`

Soru:

`Bu hissenin altinda saglam bir tasiyici taban var mi?`

Mantik:

- orta-yuksek halka aciklik pozitif
- yabanci ilgisi pozitif
- ETF sahipligi pozitif
- asiri ortak yogunlasmasi negatif
- duzenli temettu pozitif

Kullanim:

- uzun vade
- manipule tahta filtresi
- risk ayarlamasi

### 2. KAP Katalist Skoru (KKS)

Input:

- `news`
- `calendar`
- gerekirse ileride tam metin NLP

Soru:

`Hareketin arkasinda yeni bir olay akisi var mi?`

Mantik:

- yeni is, faaliyet raporu, finansal rapor, kredi derecelendirmesi pozitif
- devre kesici, islem yasagi, bedelli, soylenti baskisi negatif
- tarihsel tazelik agirligi eklenebilir

Kullanim:

- trade
- radar
- haber destekli momentum filtresi

### 3. Halka Aciklik Risk Skoru (HARS)

Input:

- `public_float_pct`
- `volume_usd`
- `major_holders`
- `foreign_ratio`

Soru:

`Bu hissede sert hareketlerin yapisal riski yuksek mi?`

Mantik:

- cok dusuk halka aciklik riskli
- dusuk hacim riskli
- tek ortak yogunlugu riskli
- yabanci/kurumsal taban riski azaltir

Kullanim:

- trade risk etiketi
- pozisyon buyuklugu ayari

### 4. Gelir Kalitesi Skoru (GKS)

Input:

- `revenue_segments`
- `export_revenue_ratio`
- `foreign_currency_revenue_ratio`
- `top_customer_concentration`
- `government_dependency_ratio`

Soru:

`Sirketin geliri cesitli ve saglikli mi, yoksa tek kaynaga mi bagli?`

Kullanim:

- uzun vade
- kalite motoru v2
- sektor-spesifik ayrisim

### 5. Sermaye Disiplini Skoru (SDS)

Input:

- `historical_capital_actions`
- `dividend_policy_text`
- `share_buyback_history`
- `dividends`

Soru:

`Yonetim hissedara karsi nasil davraniyor?`

Mantik:

- geri alim ve tutarli temettu pozitif
- sik sulandirici sermaye aksiyonlari negatif

Kullanim:

- uzun vade guven skoru
- kurumsal karakter sinifi

### 6. Finansal Dayaniklilik Skoru (FDS)

Input:

- `net_debt`
- `debt_to_equity`
- `operating_cashflow`
- `free_cashflow`
- `interest_expense`
- `interest_income`
- `ebitda_margin`

Soru:

`Makro baski veya sektor zorlugu geldiginde bu sirket ayakta kalir mi?`

Kullanim:

- dusen piyasada savunmaci hisse secimi
- risk primi ayari

### 7. Marj Rejimi Skoru (MRS)

Input:

- `gross_margin`
- `operating_margin`
- `net_margin`
- `ebitda_margin`
- dönemsel degisim

Soru:

`Sirket sadece ciro buyutuyor mu, yoksa karliligi da koruyor mu?`

Kullanim:

- kalite
- bilanço sonrasi reaksiyon motoru

### 8. Analist Ayrisma Skoru (AAS)

Input:

- `analyst_recommendation`
- `analyst_upside`
- `analyst_count`
- `target_mean`
- `target_median`

Soru:

`Piyasa fiyatı ile kurumsal beklenti arasinda anlamli fark var mi?`

Kullanim:

- hedef fiyat boslugu
- kalabalik konsensus riski
- ters kosede firsat arama

### 9. Sektor Liderligi Skoru (SLS)

Input:

- `sector_relative_strength`
- `sector_peer_percentile`
- `sector_momentum_label`
- `p1m`, `p3m`

Soru:

`Hisse sektorun liderlerinden mi, yoksa sektorun rüzgarını arkadan mı aliyor?`

Kullanim:

- momentum kalitesi
- lider/laggard rotasyonu

### 10. Yapisal Guven Skoru (YGS)

Bu bir ust skor olabilir.

Input:

- `Kurumsal Zemin`
- `Gelir Kalitesi`
- `Sermaye Disiplini`
- `Finansal Dayaniklilik`
- `Sahiplik Kalitesi`

Soru:

`Bu hisse sadece trade mi, yoksa gercekten tasinabilir bir kalite hikayesi mi?`

## 5. Mod Bazli Yeni Formul Yollari

### Gunluk Firsatlar v2

Agirlik:

- trend
- hakiki alfa
- KAP katalisti
- sektor liderligi
- giris kalitesi

### Trade Masasi v2

Agirlik:

- trend
- likidite
- KAP katalisti
- halka aciklik riski
- giris kalitesi

### Uzun Vade v2

Agirlik:

- kalite
- finansal dayaniklilik
- gelir kalitesi
- sermaye disiplini
- sahiplik kalitesi

### Radar v2

Agirlik:

- erken trend
- yeni KAP akisi
- sektor rotasyonu
- analist ayrisma

## 6. Uygulanabilir Teknik Yol Haritasi

### Faz 1

- bugunku snapshot alanlarini stabil hale getir
- `KAP Etki`, `Sahiplik Kalitesi`, `Sektor Konumu`nu UI’da yayginlastir

### Faz 2

- company ETL alanlarini gercek doldur
- `shareholders`, `subsidiaries`, `capital actions`, `buyback`, `dividend policy` alanlarini skorlama motoruna bagla

### Faz 3

- tam metin KAP NLP
- sektor spesifik faktor motorlari
- outcome/backtest ile agirlik kalibrasyonu

## 7. Sonuc

Bugun tek hisse icin zaten cok degerli bir veri tabani var.

Sadece cekebildigimiz verilerle bile su sorularin cevabini uretebiliriz:

- hareket guclu mu?
- guvenilir mi?
- haber destekli mi?
- kurumsal zemin saglam mi?
- halka aciklik riski var mi?
- sektorunde lider mi?
- uzun vade mi, trade mi, radar mi?

Asil siciprama, bu verileri tek tek gostermek degil; bunlari kendi proprietary matematiksel motorumuza cevirmek olacak.
