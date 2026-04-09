# mizan23

![Local First](https://img.shields.io/badge/local--first-yes-16a34a)
![Markets](https://img.shields.io/badge/markets-BIST%20%7C%20US%20%7C%20Crypto%20%7C%20Commodities%20%7C%20Funds-0f172a)
![Model](https://img.shields.io/badge/model-deterministic%20quant-2563eb)
![Stack](https://img.shields.io/badge/stack-Next.js%20%2B%20FastAPI-7c3aed)
![Data](https://img.shields.io/badge/BIST-borsapy-059669)

Local-first market intelligence, stock analysis, quant scoring engine, recommendation workflow, and portfolio decision-support platform.

`mizan23` turns raw market data into score, probability, action, and historical validation across BIST, US equities, crypto, commodities, funds, and FX.

## Language

- [Türkçe](#türkçe)
- [English](#english)

![mizan23 dashboard](./docs/images/dashboard-home.png)

---

# Türkçe

## 1. Kısa Tanım

`mizan23`, yalnızca fiyat takip ekranı değildir. Bu sistem:

- piyasaları tarar
- varlıkları skorlar
- skoru olasılığa çevirir
- aksiyon önerisi üretir
- portföy hedef planı kurar
- geçmişte kendi tahminlerinin doğru olup olmadığını ölçer

Amaç, yatırımcının ya da analiz kullanıcısının farklı araçlar arasında dağılmadan tek bir karar çalışma alanında kalmasını sağlamaktır.

## 2. Hangi Problemi Çözüyor?

Çoğu piyasa aracı aşağıdakilerden sadece bir veya ikisini iyi yapar:

- fiyat izleme
- watchlist / favori listesi
- grafik
- screener
- portföy takibi
- geçmiş doğrulama

`mizan23`, bu parçalı deneyimi birleştirir. Sistem, “hangi varlık güçlü?”, “hangi zaman ufkunda güçlü?”, “mevcut portföy pozisyonum hâlâ modelle uyumlu mu?” ve “bu model geçmişte gerçekten işe yaradı mı?” sorularına tek yerden cevap vermeye çalışır.

## 3. Neden Farklı?

`mizan23`’ü sıradan bir piyasa panelinden ayıran ana farklar:

1. Zaman ufku odaklıdır.
   Sadece “güçlü” demez; sinyalin 1 gün mü, 5 gün mü, 30 gün mü, 6 ay mı, 1 yıl mı daha uygun olduğuna bakar.

2. Deterministik ve denetlenebilirdir.
   Kara kutu AI yerine açık formüller, skor aileleri, ceza kuralları ve doğrulama mantığı kullanır.

3. Sonuç takibi yapar.
   Sadece öneri üretmez; bu önerilerin geçmişte ne kadar doğru olduğunu ölçer.

4. Piyasaya özel mantık kullanır.
   BIST, ABD, kripto, emtia ve fonlar tek bir yüzeysel formüle zorlanmaz.

5. Local-first yaklaşımı vardır.
   Sistem kullanıcıya yakın çalışır; kişisel kullanım, aile kullanımı veya aynı ağdaki küçük ekipler için uygundur.

## 4. Kimler İçin Uygun?

Bu proje özellikle şunlar için uygundur:

- aktif yatırımcılar
- çoklu zaman ufkunda çalışan traderlar
- piyasaya yönelik ürün geliştiren yazılımcılar
- quant mantığını anlamak isteyen kullanıcılar
- aynı ağ içinde ortak bir sistem kullanan küçük gruplar

Şunlar için öncelikli olarak tasarlanmadı:

- yüksek frekanslı işlem
- broker otomasyonu
- kurumsal OMS / EMS katmanı
- tam yönetilen SaaS modeli

## 5. Sistem Ne Üretir?

Sistem aşağıdaki türde karar çıktıları üretir:

- `BIST / 5 Gün / Skor 82 / Olasılık 0.86 / Aksiyon: Güçlü`
- `ABD / UNH / Adil Değer 360 / Fiyat Farkı +9% / İzle`
- `Kripto / SOL / BTC’ye göre alfa +1.2 / Referans bant üzerinde`
- `Portföy / THYAO / Hedef %17 / Hedefe kadar tut`
- `Sonuç raporu / 1 Gün modeli / yön isabeti %61 / alfa isabeti %57`

Yani sistem yalnızca veri göstermez; yorumlanabilir karar çıktısı üretir:

- skor
- olasılık
- beklenen getiri
- beklenen alfa
- risk tahmini
- aksiyon
- tarihsel doğrulama

## 6. Bu Proje Ne Değildir?

- yatırım tavsiyesi değildir
- kesin tahmin sunduğunu iddia etmez
- “AI her şeyi bilir” yaklaşımıyla kurulmamıştır
- doğrudan emir iletim veya broker platformu değildir

## 7. Ürün Görselleri

### Anasayfa

![Dashboard](./docs/images/dashboard-home.png)

### BIST Piyasa Tabloları

![BIST Markets](./docs/images/markets-bist.png)

### Varlık Detay Sayfası

![Asset Detail](./docs/images/asset-detail-financials.png)

## 8. Desteklenen Piyasalar

| Piyasa | Kapsam | Ana Kullanım |
|---|---|---|
| BIST | Hisse, endeks, sektör, proprietary skor ailesi | Ana karar motoru |
| ABD | Hisse evreni, history, analist hedefleri | Skor, aksiyon, adil değer kıyası |
| Kripto | Büyük ve orta ölçekli çiftler | Skor, BTC göreli alfa, referans bant |
| Emtia | Enerji, metal, kıymetli emtia | Trend ve taktik yorum |
| Fon | Yatırım ve emeklilik fonları | İstikrar ve dönemsel performans |
| Döviz / FX | Temel döviz sepeti | Takip ve çapraz piyasa bağlamı |

## 9. Metodoloji Özeti

Sistemin genel akışı şudur:

`veri -> özellik -> skor -> olasılık -> aksiyon -> sonuç doğrulama`

Bu yapı akademik olarak şu fikirlere yakındır:

- feature engineering
- cross-market relative strength
- regime awareness
- risk-adjusted ranking
- walk-forward validation
- calibration-aware decision support

### 9.1 Kullanılan ana özellik katmanları

- fiyat geçmişi
- getiri serileri
- trend yapısı
- teknik özet
- volatilite
- entropy
- hurst
- rejim
- hacim / likidite
- analist hedefleri
- adil değer / referans bant
- hakiki alfa
- portföy işlem geçmişi

### 9.2 Olasılık katmanı

Ham skor doğrudan son karar değildir. Sistem skoru, ufuk bazlı olasılık alanlarına dönüştürür:

- `probability_positive`
- `probability_outperform`
- `expected_return_pct`
- `expected_excess_return_pct`
- `risk_forecast_pct`
- `calibration_confidence`

Bu katman, kullanıcıya sadece “güçlü” demek yerine, sinyalin güvenini ve taşıdığı beklenen getiriyi göstermeyi amaçlar.

## 10. Proprietary Formül Aileleri

### 10.1 BIST ana skor ailesi

| Skor | Amaç | Özet mantık |
|---|---|---|
| `Hakiki Alfa (HA)` | Göreli üstün performans ölçümü | Hissenin referans servet / benchmark sepetine göre üstünlüğü |
| `Trend Skoru` | Trend teyidi | Fiyat konumu, momentum, yön ve yapı |
| `Likidite Skoru` | Uygulanabilirlik | Hacim, işlem kalitesi, hareketin taşınabilirliği |
| `Kalite Skoru` | Yapısal sağlık | Finansal ve davranışsal dayanıklılık |
| `Fırsat Skoru` | Aksiyon kalitesi | Trend, kalite, alfa ve ceza/ödül katmanlarının birleşimi |
| `Trade Skoru` | Kısa vade uygunluğu | Daha çevik, daha yakın dönem odaklı yorum |
| `Uzun Vade Skoru` | Taşıma kalitesi | Daha düşük gürültü, daha yüksek yapısal kalite vurgusu |
| `Radar Skoru` | İzleme adayı üretimi | Erken sinyal ve gözlem listesi mantığı |

### 10.2 Sadeleştirilmiş karar formu

En genel haliyle sistemin karar mantığı şu yapıya benzer:

`Toplam Sinyal = Trend + Hakiki Alfa + Kalite + Likidite - ceza katmanları`

Ceza katmanları şunları içerebilir:

- aşırı uzama
- düşük güven
- eksik veri
- zayıf rejim

### 10.3 Hakiki Alfa mantığı

Hakiki Alfa, bir varlığın sadece nominal olarak yükselip yükselmediğine değil, referans servet sepetine göre gerçekten pay kazanıp kazanmadığına bakar.

Sade form:

`HA = varlık getirisi - referans sepet getirisi`

Detaylı not:

- [`docs/hakiki-alfa-v1.md`](./docs/hakiki-alfa-v1.md)

### 10.4 Piyasa türüne göre fark

BIST dışı piyasalarda aynı formül birebir kopyalanmaz:

- kriptoda `referans bant`, `BTC’ye göre alfa`, `uzama riski`
- emtiada `trend + taktik hareket + korunma mantığı`
- fonlarda `istikrar + büyüme + dönemsel süreklilik`

kullanılır.

Detaylı teknik notlar:

- [`docs/trend-skoru-v1.md`](./docs/trend-skoru-v1.md)
- [`docs/firsat-skoru-v1.md`](./docs/firsat-skoru-v1.md)
- [`docs/proprietary-score-family-v1.md`](./docs/proprietary-score-family-v1.md)
- [`docs/tahmin-motoru-v1.md`](./docs/tahmin-motoru-v1.md)
- [`docs/proprietary-outcome-tracker-v1.md`](./docs/proprietary-outcome-tracker-v1.md)

## 11. Veri Kaynakları

| Kaynak | Kullanım | Piyasalar | Not |
|---|---|---|---|
| `borsapy` | BIST veri evreni, tarama, şirket/piyasa yapısı | BIST | BIST tarafındaki ana yapı taşlarından biri |
| `yfinance` | History, benchmark, analist hedefi, zenginleştirme | ABD, kripto, emtia | Cache ve snapshot ile korunur |
| Yerel snapshot’lar | Sonuç raporu ve hızlı tekrar kullanım | Tüm desteklenen piyasalar | Engine üretir |
| Yerel JSON / SQLite | Profil, favori, portföy, kalıcı durum | Uygulama geneli | Local-first yaklaşım; gerçek çalışma verileri repoya dahil edilmez |

Teşekkür:

Özellikle BIST tarafında bu platformun daha sistematik gelişmesini mümkün kılan `borsapy` ekosisteminin geliştiricilerine teşekkür ederiz.

## 12. Mimari

Sistem iki ana katmandan oluşur:

1. `Next.js` frontend
2. `FastAPI` Python engine

İstek akışı:

1. Kullanıcı arayüzde işlem yapar
2. İstek `/api/python/...` proxy katmanına gider
3. Proxy Python engine'e iletir
4. Engine veri toplar, skor üretir, cache ve snapshot kullanır
5. Sonuç frontend’e döner

Ana klasörler:

- [`app`](./app)
- [`components`](./components)
- [`services`](./services)
- [`store`](./store)
- [`lib`](./lib)
- [`engine-python/api`](./engine-python/api)
- [`engine-python/engine`](./engine-python/engine)
- [`engine-python/scoring`](./engine-python/scoring)
- [`engine-python/storage`](./engine-python/storage)
- [`docs`](./docs)

## 13. Akademik / Teknik Okuma Yolu

Bu repo bir AI, araştırmacı ya da teknik inceleyici tarafından okunacaksa şu sırayla incelenmesi önerilir:

1. Bu README
2. [`docs/sistem-raporu-tr.md`](./docs/sistem-raporu-tr.md)
3. [`docs/proprietary-score-family-v1.md`](./docs/proprietary-score-family-v1.md)
4. [`docs/hakiki-alfa-v1.md`](./docs/hakiki-alfa-v1.md)
5. [`engine-python/scoring`](./engine-python/scoring)
6. [`engine-python/api`](./engine-python/api)
7. [`app/(dashboard)`](./app/(dashboard))

Bu sıralama, sistemin hem ürün mantığını hem de hesaplama omurgasını anlamayı kolaylaştırır.

## 14. Kurulum

### Gereksinimler

- Windows
- Node.js LTS
- Python 3.11+
- internet erişimi

### Önerilen kurulum

```powershell
git clone https://github.com/emirhangungormez/mizan23.git
cd mizan23
.\mizan23.bat
```

Başlatıcı şunları yapmaya çalışır:

- Python bulur veya kurulum yönlendirir
- Git bulur veya kurmaya çalışır
- bağımlılıkları yükler
- frontend ve backend'i başlatır
- sağlık kontrolü yapar

## 15. LAN Kullanımı

`mizan23`, aynı ağ içindeki cihazlarda açılabilir.

Örnek:

- ana bilgisayar: `http://localhost:3000`
- aynı ağdaki diğer cihazlar: `http://<yerel-ip>:3000`

Bu yapı parola tabanlı çok kullanıcılı kimlik sistemi değildir; profil bazlı ayrım mantığıyla çalışır.

## 16. Güvenlik Notu

Bu proje şu an:

- güvenilir cihaz
- güvenilir ağ
- yerel / küçük grup kullanımı

senaryoları için uygundur.

Kurumsal çok kullanıcılı dağıtım için ayrıca:

- kimlik doğrulama
- rol bazlı yetki
- audit log
- daha güçlü veri koruması

gerekir.

## 17. Sorun Giderme

### `Sağlık kontrolleri bekleniyor`

Bu genelde şu anlama gelir:

- backend açılıyor ama geç cevap veriyor
- frontend açılıyor ama backend hazır değil
- veya engine açılışta düşüyor

Başlatıcı artık hangi servisin beklendiğini ve gerekirse son log satırlarını gösterir.

## 18. Issues, Öneriler ve Katkı

Bu repo için:

- hata bildirimi açabilirsiniz
- öneri sunabilirsiniz
- formül iyileştirme fikirleri paylaşabilirsiniz
- veri kaynağı veya metodoloji önerisinde bulunabilirsiniz

Lütfen GitHub Issues üzerinden:

- hatanın ne olduğunu
- hangi ekran veya modülde olduğunu
- mümkünse ekran görüntüsü ve log çıktısını

paylaşın.

---

# English

## 1. What Is mizan23?

`mizan23` is a local-first market intelligence platform that turns raw market data into score, probability, action, and historical validation.

It is designed to bring the following workflows into one place:

- market screening
- recommendation generation
- asset detail analysis
- portfolio tracking
- favorites and watchlists
- outcome validation

## 2. Why Does It Exist?

Most market tools do one thing well, but not everything together:

- price monitoring
- charting
- watchlists
- screening
- portfolio tracking
- historical validation

`mizan23` exists to combine them into one deterministic workspace.

The goal is not to produce magical AI predictions. The goal is to build a transparent, inspectable, and repeatable market decision system.

## 3. Why Is It Different?

1. It is horizon-aware.
   It tries to map signals to time horizons instead of using only binary strong/weak labels.

2. It is deterministic.
   It uses explicit formulas, score families, confidence penalties, and validation logic rather than opaque black-box output.

3. It tracks outcomes.
   It does not stop at recommendations; it also checks whether those recommendations were statistically valid later.

4. It uses market-specific logic.
   BIST, US equities, crypto, commodities, and funds are not forced into one naïve formula.

5. It is local-first.
   It is designed to run on your machine or local network.

## 4. Who Is It For?

This project is primarily for:

- active investors
- traders working across multiple horizons
- developers building market tools
- quant-curious users who prefer transparent formulas
- small local teams or families sharing one system

## 5. What Does It Output?

Typical outputs include:

- `BIST / 5 Days / Score 82 / Probability 0.86 / Action: Strong`
- `US / UNH / Fair Value 360 / Price Gap +9% / Watch`
- `Crypto / SOL / BTC-relative alpha +1.2 / Above reference band`
- `Portfolio / THYAO / Target 17% / Hold to target`
- `Outcome report / 1-day model / direction hit-rate 61% / alpha hit-rate 57%`

The platform is meant to produce interpretable decision outputs:

- score
- probability
- expected return
- expected alpha
- risk forecast
- action
- historical validation

## 6. What This Project Is Not

- not financial advice
- not a certainty engine
- not an AI oracle
- not a broker execution platform

## 7. Product Screens

### Dashboard

![Dashboard](./docs/images/dashboard-home.png)

### BIST Markets

![BIST Markets](./docs/images/markets-bist.png)

### Asset Detail

![Asset Detail](./docs/images/asset-detail-financials.png)

## 8. Supported Markets

| Market | Coverage | Primary Use |
|---|---|---|
| BIST | Equities, indices, sectors, proprietary scoring | Main decision engine |
| US equities | Broad stock universe and analyst-target enrichment | Score, action, fair value comparison |
| Crypto | Major and mid-cap pairs | Score, BTC-relative alpha, reference band |
| Commodities | Energy and metals | Tactical trend interpretation |
| Funds | Mutual and pension funds | Stability and horizon performance |
| FX | Core FX universe | Cross-market context |

## 9. Methodology Summary

The general flow is:

`data -> features -> score -> probability -> action -> outcome validation`

The model family is conceptually close to:

- feature engineering
- cross-market relative strength
- regime awareness
- risk-adjusted ranking
- walk-forward validation
- calibration-aware decision support

### Probability layer

The system can produce:

- `probability_positive`
- `probability_outperform`
- `expected_return_pct`
- `expected_excess_return_pct`
- `risk_forecast_pct`
- `calibration_confidence`

## 10. Proprietary Formula Families

Main BIST score families:

- `Hakiki Alfa`
- `Trend Score`
- `Liquidity Score`
- `Quality Score`
- `Opportunity Score`
- `Trade Score`
- `Long-Term Score`
- `Radar Score`

Simplified decision structure:

`Total Signal = Trend + Alpha + Quality + Liquidity - penalty layers`

Penalty layers may include:

- overextension
- low confidence
- missing data
- weak regime

Reference technical notes:

- [`docs/hakiki-alfa-v1.md`](./docs/hakiki-alfa-v1.md)
- [`docs/trend-skoru-v1.md`](./docs/trend-skoru-v1.md)
- [`docs/firsat-skoru-v1.md`](./docs/firsat-skoru-v1.md)
- [`docs/proprietary-score-family-v1.md`](./docs/proprietary-score-family-v1.md)
- [`docs/tahmin-motoru-v1.md`](./docs/tahmin-motoru-v1.md)

## 11. Data Sources

| Source | Used For | Markets | Notes |
|---|---|---|---|
| `borsapy` | BIST universe, screening, structured market data | BIST | One of the core building blocks on the BIST side |
| `yfinance` | History, analyst targets, benchmarks, enrichment | US, crypto, commodities | Protected with cache and snapshots |
| Local snapshots | Outcome reports and fast re-use | All supported markets | Generated by the engine |
| Local JSON / SQLite | Profiles, favorites, portfolio state | App-wide | Local-first persistence; live user data is not meant to be committed |

Special thanks to the maintainers and contributors of the `borsapy` ecosystem.

## 12. Architecture

The platform runs on two main layers:

1. `Next.js` frontend
2. `FastAPI` Python engine

Requests flow through the internal `/api/python/...` proxy layer before reaching the engine.

## 13. Reading Guide for Reviewers and AI Systems

Recommended reading order:

1. This README
2. [`docs/sistem-raporu-tr.md`](./docs/sistem-raporu-tr.md)
3. [`docs/proprietary-score-family-v1.md`](./docs/proprietary-score-family-v1.md)
4. [`docs/hakiki-alfa-v1.md`](./docs/hakiki-alfa-v1.md)
5. [`engine-python/scoring`](./engine-python/scoring)
6. [`engine-python/api`](./engine-python/api)
7. [`app/(dashboard)`](./app/(dashboard))

This sequence helps both humans and AI systems understand the product logic first, then the technical implementation.

## 14. Setup

```powershell
git clone https://github.com/emirhangungormez/mizan23.git
cd mizan23
.\mizan23.bat
```

The launcher attempts to:

- detect or bootstrap Python
- detect or bootstrap Git
- install dependencies
- start frontend and backend
- run health checks

## 15. LAN Usage

`mizan23` can be used across multiple devices on the same local network.

Example:

- local machine: `http://localhost:3000`
- same network devices: `http://<local-ip>:3000`

## 16. Security Note

The current security model is suitable for:

- trusted devices
- trusted local networks
- local or small-group usage

### Yerel veri dosyalari / Local state files

- `data/users.json`
- `data/favorites.json`
- `data/portfolios.json`

Bu dosyalar calisma sirasinda yerelde olusur ve repoya gonderilmemelidir. Repo icinde yalnizca `.example` dosyalari bulunur.

These files are created locally at runtime and should stay out of version control. The repository only includes `.example` files.

## 17. Issues, Suggestions, and Contributions

You can use GitHub Issues to:

- report bugs
- suggest improvements
- propose formula changes
- discuss methodology
- recommend new data sources

Please include:

- what happened
- which module or screen was affected
- logs or screenshots if available
