# mizan23

`mizan23` is a local-first market intelligence and portfolio decision-support platform.

`mizan23`, yerelde çalışan bir piyasa zekâsı ve portföy karar destek platformudur.

It combines BIST, US equities, crypto, commodities, funds, FX, portfolio tracking, favorites, watchlists, historical outcomes, and probability-aware signals in one workspace.

Sistem; BIST, ABD hisseleri, kripto, emtia, fon, döviz, portföy yönetimi, favori listeleri, sonuç raporu ve olasılık tabanlı sinyalleri tek çalışma alanında birleştirir.

---

## Table of Contents / İçindekiler

1. [What mizan23 Is / mizan23 Nedir](#what-mizan23-is--mizan23-nedir)
2. [Core Product Areas / Ana Ürün Alanları](#core-product-areas--ana-ürün-alanları)
3. [Markets Covered / Kapsanan Piyasalar](#markets-covered--kapsanan-piyasalar)
4. [Architecture / Mimari](#architecture--mimari)
5. [Data Sources / Veri Kaynakları](#data-sources--veri-kaynakları)
6. [Data Types Used by the System / Sistemin Kullandığı Veri Türleri](#data-types-used-by-the-system--sistemin-kullandığı-veri-türleri)
7. [Proprietary Formula Family / Proprietary Formül Ailesi](#proprietary-formula-family--proprietary-formül-ailesi)
8. [How the Advice Engine Works / Tavsiye Motoru Nasıl Çalışır](#how-the-advice-engine-works--tavsiye-motoru-nasıl-çalışır)
9. [Portfolio and Target Planning / Portföy ve Hedef Planlama](#portfolio-and-target-planning--portföy-ve-hedef-planlama)
10. [Outcome Report / Sonuç Raporu](#outcome-report--sonuç-raporu)
11. [Search and Favorites / Arama ve Favoriler](#search-and-favorites--arama-ve-favoriler)
12. [Project Structure / Proje Yapısı](#project-structure--proje-yapısı)
13. [Installation / Kurulum](#installation--kurulum)
14. [One-Click Startup / Tek Tık Başlatma](#one-click-startup--tek-tık-başlatma)
15. [LAN Access / Yerel Ağ Erişimi](#lan-access--yerel-ağ-erişimi)
16. [Commands / Komutlar](#commands--komutlar)
17. [Health and Verification / Sağlık ve Doğrulama](#health-and-verification--sağlık-ve-doğrulama)
18. [Git Update Flow / Git Güncelleme Akışı](#git-update-flow--git-güncelleme-akışı)
19. [Troubleshooting / Sorun Giderme](#troubleshooting--sorun-giderme)
20. [Disclaimer / Sorumluluk Reddi](#disclaimer--sorumluluk-reddi)

---

## What mizan23 Is / mizan23 Nedir

### EN

`mizan23` is not just a market dashboard. It is a structured analysis system built around:

- multi-market screening
- proprietary scoring
- probability-aware recommendations
- fair value or reference band comparison
- portfolio target planning
- investor profile management
- favorites and watchlists
- historical outcome validation

### TR

`mizan23` sadece bir piyasa takip ekranı değildir. Şu omurgalar üzerine kurulmuş bir analiz sistemidir:

- çoklu piyasa taraması
- proprietary skor üretimi
- olasılık tabanlı öneriler
- adil değer veya referans bant karşılaştırması
- portföy hedef planlama
- yatırımcı profili yönetimi
- favoriler ve izleme listeleri
- geçmiş tahmin doğrulaması

---

## Core Product Areas / Ana Ürün Alanları

| Area | EN | TR |
|---|---|---|
| Market Tables | Ranked market lists with score, action, fair value/reference band, alpha, and horizon | Skor, aksiyon, adil değer/referans bant, alfa ve zaman ufku ile sıralanmış piyasa tabloları |
| Analysis & Advice | Horizon-based recommendation engine for BIST and other markets | BIST ve diğer piyasalar için zaman ufku bazlı tavsiye motoru |
| Asset Detail | Professional charting, score engine, financials, valuation, and insight panels | Profesyonel grafik, skor motoru, finansallar, değerleme ve içgörü panelleri |
| Portfolio | Transactions, live PnL, target plans, conviction analysis, and statistical portfolio report | İşlemler, canlı kâr/zarar, hedef planı, conviction analizi ve istatistiksel sepet raporu |
| Outcomes | Historical validation of system recommendations versus realized results | Sistem önerilerinin gerçekleşen sonuçlara göre geçmiş doğrulaması |
| Favorites | User-based watchlists with star-based adding and list management | Kullanıcı bazlı favori listeleri, yıldızla ekleme ve liste yönetimi |

---

## Markets Covered / Kapsanan Piyasalar

### EN

The current platform covers:

- BIST
- US equities
- Crypto
- Commodities
- Funds
- FX

### TR

Platform şu ana piyasa gruplarını kapsar:

- BIST
- ABD hisseleri
- Kripto
- Emtia
- Fon
- Döviz / FX

---

## Architecture / Mimari

### EN

The system has two main execution layers:

1. Next.js frontend
2. FastAPI Python engine

The frontend does not call the Python engine directly from arbitrary client code. Requests flow through the internal `/api/python/...` proxy layer first.

Key frontend folders:

- [app](c:/Users/emirh/Desktop/trade-intelligence/app)
- [components](c:/Users/emirh/Desktop/trade-intelligence/components)
- [services](c:/Users/emirh/Desktop/trade-intelligence/services)
- [store](c:/Users/emirh/Desktop/trade-intelligence/store)
- [lib](c:/Users/emirh/Desktop/trade-intelligence/lib)

Key backend folders:

- [engine-python/api](c:/Users/emirh/Desktop/trade-intelligence/engine-python/api)
- [engine-python/engine](c:/Users/emirh/Desktop/trade-intelligence/engine-python/engine)
- [engine-python/scoring](c:/Users/emirh/Desktop/trade-intelligence/engine-python/scoring)
- [engine-python/storage](c:/Users/emirh/Desktop/trade-intelligence/engine-python/storage)
- [engine-python/app.py](c:/Users/emirh/Desktop/trade-intelligence/engine-python/app.py)

### TR

Sistem iki ana çalışma katmanına sahiptir:

1. Next.js frontend
2. FastAPI tabanlı Python engine

Frontend, engine’e rastgele doğrudan istemci çağrıları yapmaz. İstekler önce uygulama içindeki `/api/python/...` proxy katmanından geçer.

Bu yapı sayesinde:

- veri akışı tek kapıdan yönetilir
- CORS akışı sadeleşir
- istemci ve motor ayrışır
- hata ve cache davranışları merkezi kalır

---

## Data Sources / Veri Kaynakları

Below is the practical source map used by the current system.

Aşağıdaki tablo, sistemin fiilen kullandığı veri kaynaklarını özetler.

| Source | Used For | Markets | Notes |
|---|---|---|---|
| `borsapy` | BIST market data, indexes, company and market structures | BIST | Primary structured source for BIST-side workflows |
| `yfinance` | US data, some cross-market enrichment, benchmark and history support | US, crypto, commodities, some benchmark layers | Used carefully with cache and fallback due to rate limits |
| `borsajs` | Frontend-side market data helpers | Select client-side flows | JS-side companion source |
| Local proprietary snapshots | Historical snapshots, outcome reports, cached analysis states | All supported markets | Generated by the engine and reused for fast reads |
| Local SQLite storage | Persistent engine-side storage | Portfolio, company, cached structured data | Stored under engine-side storage path |
| Frontend persisted stores | User, favorites, UI memory | Profiles, favorites, preferences | Stored through Zustand persist on client side |

### Important note / Önemli not

#### EN

`mizan23` does not depend on a single uniform source for every market. The source strategy is market-aware:

- BIST favors structured local/proprietary processing over shallow quote-only logic
- US and cross-market layers may use Yahoo Finance enrichment
- Crypto and commodities use category-specific signal logic instead of equity-style valuation logic

#### TR

`mizan23`, tüm piyasalar için tek tip veri kaynağına dayanmaz. Kaynak stratejisi piyasa türüne göre değişir:

- BIST tarafında yapılandırılmış ve proprietary işleme katmanı öndedir
- ABD ve bazı çapraz piyasa katmanlarında Yahoo Finance zenginleştirmesi kullanılır
- Kripto ve emtiada hisse tipi değerleme yerine kategoriye özel sinyal mantığı kullanılır

---

## Data Types Used by the System / Sistemin Kullandığı Veri Türleri

| Data Type | EN | TR |
|---|---|---|
| Price history | Daily or period-based price series | Günlük veya dönemsel fiyat serisi |
| Returns | Daily, weekly, monthly, quarterly, yearly returns | Günlük, haftalık, aylık, çeyreklik, yıllık getiriler |
| Trend position | Relative position to moving averages and directional structures | Hareketli ortalamalara ve yönsel yapılara göre konum |
| Technical summary | Buy / neutral / sell style technical state | Al / nötr / sat tipi teknik özet durumu |
| Volatility | Realized price variability | Gerçekleşmiş fiyat oynaklığı |
| Entropy | Noise and randomness estimate | Gürültü ve rastlantısallık ölçüsü |
| Hurst | Persistence or mean-reversion tendency | Devamlılık veya ortalamaya dönüş eğilimi |
| Regime | Market state classification | Piyasa rejimi sınıflaması |
| Volume / liquidity | Tradability and activity support | İşlem yapılabilirlik ve aktivite desteği |
| Analyst targets | External target-based valuation support | Dış hedef fiyat bazlı değerleme desteği |
| Fair value / reference band | Internal valuation or range logic | İç değerleme veya referans bant mantığı |
| Alpha benchmarks | Relative outperformance against reference baskets | Referans sepetlere göre göreli üstün performans |
| Portfolio transactions | Buy/sell records, cost basis, realized outcomes | Alış/satış kayıtları, maliyet bazları, gerçekleşen sonuçlar |

---

## Proprietary Formula Family / Proprietary Formül Ailesi

### EN

The platform has a proprietary score family. The clearest documented early family is:

1. `Hakiki Alfa (HA)`
2. `Trend Skoru (TS)`
3. `Likidite Skoru (LS)`
4. `Kalite Skoru (KS)`
5. `Fırsat Skoru (FS)`

These are not random labels. They are layered to answer different questions:

- `HA`: is the asset truly outperforming a broader wealth/reference basket?
- `TS`: is the asset in a real, confirmed trend?
- `LS`: is the move liquid and tradable?
- `KS`: is the asset structurally healthier / more carryable?
- `FS`: should this asset stand out as an actionable opportunity?

### TR

Platformun proprietary skor ailesi vardır. Erken ve en net dokümante edilmiş çekirdek aile şudur:

1. `Hakiki Alfa (HA)`
2. `Trend Skoru (TS)`
3. `Likidite Skoru (LS)`
4. `Kalite Skoru (KS)`
5. `Fırsat Skoru (FS)`

Bu skorlar rastgele adlandırmalar değildir. Her biri farklı bir soruya cevap verir:

- `HA`: varlık gerçekten daha geniş bir servet / referans sepetini yeniyor mu?
- `TS`: varlık teyitli ve gerçek bir trend içinde mi?
- `LS`: bu hareket yeterince likit ve uygulanabilir mi?
- `KS`: bu varlık yapısal olarak daha sağlıklı mı, taşınabilir mi?
- `FS`: bu varlık şu an aksiyon alınabilir bir fırsat olarak öne çıkmalı mı?

### Formula Summary Table / Formül Özeti Tablosu

| Formula | Intent | Simplified Structure |
|---|---|---|
| `Hakiki Alfa (HA)` | Measure real relative wealth gain, not just nominal price rise | `HA = Asset Return - Reference Basket Return` |
| `Trend Skoru (TS)` | Measure short and medium-term trend strength | weighted combination of returns, MA position, technical summary, supertrend |
| `Fırsat Skoru (FS)` | Main opportunity score shown to the user | `FS = 0.30*TS + 0.22*LS + 0.20*KS + 0.18*HA_n + 0.10*VS` |

### Hakiki Alfa / True Alpha

#### EN

The idea behind `Hakiki Alfa` is simple but important:

An asset may rise in nominal price, yet still fail to create real comparative wealth if global reference assets such as USD, gold, or benchmark baskets rise faster.

Core idea:

`HA_i,t = R_i,t - R_G,t`

Where:

- `R_i,t`: asset return at time `t`
- `R_G,t`: reference basket return at time `t`

This is the philosophical and mathematical core of "real" outperformance in the system.

#### TR

`Hakiki Alfa` fikri şudur:

Bir varlık nominal olarak yükselmiş olabilir; fakat dolar, altın, bitcoin veya referans sepet daha hızlı yükseliyorsa bu gerçek anlamda servet artışı sayılmayabilir.

Temel yapı:

`HA_i,t = R_i,t - R_G,t`

Burada:

- `R_i,t`: varlığın `t` anındaki getirisi
- `R_G,t`: referans sepetin `t` anındaki getirisi

Bu metrik, sistemdeki reel göreli performans fikrinin ana matematik omurgalarından biridir.

### Trend Skoru / Trend Score

#### EN

`Trend Skoru` is designed to answer:

`Is this asset in a genuine directional structure right now?`

Documented simplified structure:

`TS = 0.42 * G_t + 0.28 * K_t + 0.20 * T_t + 0.10 * S_t`

Where:

- `G_t`: return component
- `K_t`: moving-average position component
- `T_t`: technical confirmation
- `S_t`: supertrend confirmation

#### TR

`Trend Skoru`, şu soruya cevap vermek için tasarlanır:

`Bu varlık şu anda gerçekten yönlü bir trend yapısında mı?`

Dokümante edilen sade yapı:

`TS = 0.42 * G_t + 0.28 * K_t + 0.20 * T_t + 0.10 * S_t`

Burada:

- `G_t`: getiri bileşeni
- `K_t`: hareketli ortalama konum bileşeni
- `T_t`: teknik teyit
- `S_t`: supertrend teyidi

### Fırsat Skoru / Opportunity Score

#### EN

`Fırsat Skoru` is the user-facing actionable score:

`FS = 0.30 * TS + 0.22 * LS + 0.20 * KS + 0.18 * HA_n + 0.10 * VS`

Then:

`FS = clamp(FS, 0, 100)`

This score is the bridge between raw sub-scores and actual decision language.

#### TR

`Fırsat Skoru`, kullanıcıya en görünür şekilde sunulan ana aksiyon skorudur:

`FS = 0.30 * TS + 0.22 * LS + 0.20 * KS + 0.18 * HA_n + 0.10 * VS`

Ardından:

`FS = clamp(FS, 0, 100)`

Bu skor, alt skorları doğrudan karar diline bağlayan ana katmandır.

### Important note / Önemli not

#### EN

The platform has evolved beyond the earliest documented formulas, but those documents remain useful because they explain the internal logic and design philosophy of the score family.

#### TR

Platform, ilk dokümante edilmiş formüllerin ötesine geçmiş olsa da bu belgeler hâlâ önemlidir; çünkü sistemin iç mantığını ve tasarım felsefesini açıklar.

Reference docs:

- [Fırsat Skoru v1](c:/Users/emirh/Desktop/trade-intelligence/docs/firsat-skoru-v1.md)
- [Hakiki Alfa v1](c:/Users/emirh/Desktop/trade-intelligence/docs/hakiki-alfa-v1.md)
- [Proprietary Score Family v1](c:/Users/emirh/Desktop/trade-intelligence/docs/proprietary-score-family-v1.md)
- [Trend Skoru v1](c:/Users/emirh/Desktop/trade-intelligence/docs/trend-skoru-v1.md)

---

## How the Advice Engine Works / Tavsiye Motoru Nasıl Çalışır

### EN

The advice engine does not just show a score. It combines:

- score
- probability fields
- expected return context
- alpha context
- risk forecast
- time horizon
- category-aware logic

In BIST, the recommendation layer is the most advanced.  
For non-BIST markets, the engine uses market-specific signal logic:

- US: score + fair value + alpha + action
- Crypto: score + BTC-relative logic + reference band
- Commodities: tactical signal-first logic
- Funds: score-first and consistency-oriented logic

### TR

Tavsiye motoru yalnızca bir skor göstermez. Şunları birlikte okur:

- skor
- olasılık alanları
- beklenen getiri bağlamı
- alfa bağlamı
- risk tahmini
- zaman ufku
- kategoriye özel mantık

BIST tarafında tavsiye katmanı en gelişmiş haldedir.  
BIST dışı piyasalarda ise kategoriye göre özel sinyal mantığı kullanılır:

- ABD: skor + adil değer + alfa + aksiyon
- Kripto: skor + BTC göreli mantık + referans bant
- Emtia: taktik ve hareket odaklı sinyal mantığı
- Fon: skor ve istikrar odaklı mantık

---

## Portfolio and Target Planning / Portföy ve Hedef Planlama

### EN

The portfolio module supports:

- buy/sell transaction history
- average cost and live performance
- system-generated target plan
- manual override target
- target price and target percentage
- conviction and action logic
- statistical portfolio report

### TR

Portföy modülü şunları destekler:

- alış / satış işlem geçmişi
- ortalama maliyet ve canlı performans
- sistem tarafından üretilen hedef planı
- manuel hedef override
- hedef fiyat ve hedef yüzde
- conviction ve aksiyon mantığı
- istatistiksel sepet raporu

This is one of the most decision-critical parts of the platform.

Bu bölüm, platformun en kritik karar destek katmanlarından biridir.

---

## Outcome Report / Sonuç Raporu

### EN

The outcome report is not a decorative screen. It is the historical validation layer of the system.

It is designed to answer:

- Was the system right?
- In which horizon was it right?
- Which names fit the score logic over time?
- Which names consistently resisted the score logic?

### TR

Sonuç raporu süslü bir ekran değildir. Sistemin tarihsel doğrulama katmanıdır.

Şu sorulara cevap vermek için tasarlanmıştır:

- Sistem doğru muydu?
- Hangi zaman ufkunda doğruydu?
- Hangi hisseler zaman içinde skor mantığına uydu?
- Hangi hisseler skor mantığına sürekli ters davrandı?

The report uses:

- market tabs
- horizon tabs
- rising model
- falling model
- correct predictions
- wrong predictions
- historical observation windows
- today’s candidate lists

---

## Search and Favorites / Arama ve Favoriler

### EN

The search system is designed to expose supported assets across markets through a unified access point.  
Favorites complement portfolios by acting as lightweight watchlists without transaction commitment.

### TR

Arama sistemi, desteklenen piyasalardaki varlıklara tek birleşik giriş noktası sunmak için tasarlanmıştır.  
Favoriler ise portföyden farklı olarak işlem kaydı gerektirmeyen hafif izleme listeleri sağlar.

---

## Project Structure / Proje Yapısı

```text
mizan23/
├─ app/                    # Next.js route yapısı
├─ components/             # Arayüz bileşenleri
├─ hooks/                  # React hook'ları
├─ services/               # Frontend servis katmanı
├─ store/                  # Zustand store'ları
├─ lib/                    # Proxy ve yardımcı katmanlar
├─ engine-python/
│  ├─ api/                 # FastAPI router'ları
│  ├─ engine/              # Veri, cache, storage, math altyapısı
│  ├─ scoring/             # Skor ve olasılık katmanı
│  ├─ storage/             # Snapshot ve rapor verileri
│  └─ app.py               # Engine giriş noktası
├─ tools/                  # Başlatma ve doğrulama script'leri
├─ docs/                   # Teknik dokümanlar
├─ storage/                # Uygulama tarafı örnek/veri alanları
└─ RUN_ALL.bat             # Windows tek tık başlatma
```

---

## Installation / Kurulum

### EN

Recommended environment:

- Windows
- Node.js LTS
- Python 3.11
- Git

### TR

Önerilen çalışma ortamı:

- Windows
- Node.js LTS
- Python 3.11
- Git

---

## One-Click Startup / Tek Tık Başlatma

Use:

```powershell
.\RUN_ALL.bat
```

### EN

This is the recommended entry point for day-to-day usage and fresh-machine startup.

What it does:

- checks runtime tools
- checks whether the repo can be fast-forward updated
- pulls the latest code when the worktree is clean
- creates the Python virtual environment if needed
- syncs dependencies
- frees ports `3000` and `3003`
- starts frontend and backend
- waits for health checks
- runs quick verification
- opens the browser

### TR

Bu dosya hem günlük kullanım hem de yeni makinede ilk açılış için önerilen giriş noktasıdır.

Yaptıkları:

- çalışma araçlarını kontrol eder
- reponun güvenli şekilde güncellenip güncellenemeyeceğine bakar
- worktree temizse son kodu çeker
- gerekiyorsa Python sanal ortamını oluşturur
- bağımlılıkları senkronize eder
- `3000` ve `3003` portlarını temizler
- frontend ve backend’i başlatır
- sağlık kontrolü bekler
- hızlı doğrulama çalıştırır
- tarayıcıyı açar

Main script:

- [run-all.ps1](c:/Users/emirh/Desktop/trade-intelligence/tools/run-all.ps1)

---

## LAN Access / Yerel Ağ Erişimi

### EN

The application can run across the local network.  
Frontend binds to `0.0.0.0:3000` and engine binds to `0.0.0.0:3003`.

### TR

Uygulama yerel ağda da çalışabilir.  
Frontend `0.0.0.0:3000`, engine ise `0.0.0.0:3003` üzerinden bind olur.

Typical usage:

- `http://localhost:3000`
- `http://<LAN-IP>:3000`

If access fails from another device:

- run `RUN_ALL.bat` as administrator
- check firewall rules
- ensure both devices are on the same network

---

## Commands / Komutlar

Main scripts from [package.json](c:/Users/emirh/Desktop/trade-intelligence/package.json):

| Command | EN | TR |
|---|---|---|
| `npm run dev` | Starts frontend, engine, and browser open flow together | Frontend, engine ve tarayıcı açma akışını birlikte başlatır |
| `npm run dev:frontend` | Starts only Next.js frontend | Sadece Next.js frontend’i başlatır |
| `npm run dev:engine` | Starts only Python engine | Sadece Python engine’i başlatır |
| `npm run build` | Production build for frontend | Frontend için production build alır |
| `npm run start` | Production frontend start | Frontend’i production modda başlatır |
| `npm run lint` | Runs ESLint | ESLint çalıştırır |
| `npm run check:system` | Runs quick system verification | Hızlı sistem doğrulaması çalıştırır |

---

## Health and Verification / Sağlık ve Doğrulama

Engine health:

```powershell
Invoke-WebRequest http://127.0.0.1:3003/api/health
```

Quick verification:

```powershell
npm run check:system
```

### EN

Verification scripts should be kept aligned with active API routes.

### TR

Doğrulama script’leri aktif API yollarıyla senkron tutulmalıdır.

---

## Git Update Flow / Git Güncelleme Akışı

Repository:

- `https://github.com/emirhangungormez/mizan23`

Clone:

```powershell
git clone https://github.com/emirhangungormez/mizan23.git
cd mizan23
.\RUN_ALL.bat
```

Manual update flow:

```powershell
git add .
git commit -m "Mesaj"
git push origin main
```

`RUN_ALL.bat` can also pull the latest changes automatically when the worktree is clean.

`RUN_ALL.bat`, çalışma ağacı temiz olduğunda son değişiklikleri otomatik çekebilir.

---

## Troubleshooting / Sorun Giderme

### Port conflict / Port çakışması

- `3000` veya `3003` doluysa script eski süreci kapatmayı dener.

### LAN access issue / Yerel ağ erişim sorunu

- firewall kurallarını kontrol et
- cihazların aynı ağda olduğunu doğrula

### Repo not auto-updating / Repo otomatik çekilmiyor

- yerel değişiklik varsa script bilinçli olarak çekmez
- önce commit veya stash yap

### Frontend works but no data / Frontend açılıyor ama veri gelmiyor

- engine health kontrol et
- `.run/engine.err.log` dosyasına bak

---

## Disclaimer / Sorumluluk Reddi

### EN

This project is a decision-support system. It is not investment advice.

### TR

Bu proje bir karar destek sistemidir. Yatırım tavsiyesi vermez.
