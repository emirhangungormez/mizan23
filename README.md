# mizan23

Professional local-first market intelligence, recommendation, and portfolio decision-support platform.

Yerel çalışan, çoklu piyasa destekli, öneri ve portföy karar destek platformu.

![mizan23 dashboard](./docs/images/dashboard-home.png)

## İçindekiler

- [Türkçe](#türkçe)
- [English](#english)
- [Visuals](#visuals)

---

## Türkçe

<details open>
<summary><strong>1. Genel Bakış</strong></summary>

`mizan23`, yalnızca fiyat gösteren bir piyasa ekranı değildir. Sistem;

- BIST, ABD, kripto, emtia, fon ve döviz piyasalarını aynı çalışma alanında toplar
- ham fiyat verisini skora, skoru olasılığa, olasılığı aksiyona dönüştürür
- portföy hedef planı, favori listeleri, sonuç raporu ve profil bazlı kullanım ayrımı sunar
- geçmiş snapshot ve sonuç takibi ile kendi önerilerini tarihsel olarak doğrular

Ana modüller:

- Piyasa tabloları
- Analiz ve tavsiye motoru
- Varlık detay sayfaları
- Portföy ve hedef planlama
- Sonuç raporu
- Favoriler yönetimi
- Profil bazlı kullanım

</details>

<details open>
<summary><strong>2. Desteklenen Piyasalar</strong></summary>

| Piyasa | Kapsam | Ana Kullanım |
|---|---|---|
| BIST | Hisse, endeks, sektör, proprietary skorlar | Ana karar motoru, tavsiye, sonuç raporu |
| ABD | Hisse evreni, analist hedefleri, history tabanlı sinyal | Skor, aksiyon, adil değer yakınsaması |
| Kripto | Büyük ve orta ölçekli çiftler | Skor, BTC’ye göre alfa, referans bant |
| Emtia | Enerji, metal, kıymetli emtia | Trend, taktik skor, göreli hareket |
| Fon | Yatırım ve emeklilik fonları | İstikrar, büyüme, dönemsel performans |
| Döviz / FX | Temel döviz sepeti | Takip, çapraz piyasa bağlamı |

</details>

<details open>
<summary><strong>3. Mimari</strong></summary>

![mizan23 markets](./docs/images/markets-bist.png)

Sistem iki ana katmandan oluşur:

1. `Next.js` frontend
2. `FastAPI` tabanlı Python engine

İstek akışı:

1. Kullanıcı arayüzde işlem yapar
2. İstekler Next.js içindeki `/api/python/...` proxy katmanına gider
3. Proxy, Python engine’e iletir
4. Python engine veri toplar, skorları üretir, cache/snapshot kullanır
5. Sonuç tekrar frontend’e döner

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

</details>

<details open>
<summary><strong>4. Veri Kaynakları</strong></summary>

| Kaynak | Ne İçin Kullanılıyor | Piyasalar | Not |
|---|---|---|---|
| `borsapy` | BIST veri evreni, taramalar, şirket/piyasa yapısı | BIST, fonların bir kısmı | BIST tarafındaki ana yapı taşlarından biri |
| `yfinance` | History, ABD hisseleri, benchmark, bazı hedef/veri zenginleştirmeleri | ABD, kripto, emtia, benchmark | Rate-limit riskine karşı cache/snapshot ile kullanılır |
| Yerel proprietary snapshot’lar | Sonuç raporu, hızlı açılış, tekrar kullanım | Tüm desteklenen piyasalar | Engine tarafından üretilir |
| Yerel kalıcı JSON/SQLite | Profil, favori, portföy ve engine içi kalıcı durum | Uygulama geneli | Yerel ve paylaşımlı kullanım için |
| Frontend persisted state | UI tercihleri, kısa süreli kullanıcı deneyimi | Arayüz | Zustand persist / session cache |

Teşekkür:

Bu platformun özellikle BIST tarafında daha sistematik gelişebilmesini mümkün kılan `borsapy` ekosisteminin geliştiricilerine ayrıca teşekkür ederiz.

</details>

<details open>
<summary><strong>5. Sistemin Kullandığı Veri Türleri</strong></summary>

| Veri Türü | Açıklama |
|---|---|
| Fiyat geçmişi | Günlük ve dönemsel OHLC / kapanış serileri |
| Getiri serileri | Günlük, haftalık, aylık, YTD, yıllık ve ufuk bazlı getiriler |
| Trend yapısı | Hareketli ortalamalar, yön, konum ve teyit mantığı |
| Teknik özet | Al / izle / zayıf görünüm benzeri teknik özetler |
| Volatilite | Gerçekleşen oynaklık ve risk yoğunluğu |
| Entropy | Gürültü ve rastlantısallık ölçüsü |
| Hurst | Süreklilik veya ortalamaya dönüş eğilimi |
| Rejim | Trend, kararsızlık, sıkışma gibi piyasa rejimleri |
| Hacim / likidite | İşlem yapılabilirlik ve hareket kalitesi |
| Analist hedefleri | Özellikle ABD tarafında hedef fiyat desteği |
| Adil değer / referans bant | İç model veya kategoriye uygun kıyas bandı |
| Hakiki alfa | Referans sepet / benchmark üstü performans |
| Portföy işlemleri | Alış, satış, maliyet, hedef ve gerçekleşen sonuçlar |

</details>

<details open>
<summary><strong>6. Proprietary Formül Aileleri</strong></summary>

Sistem, farklı piyasalara göre farklı formül aileleri kullanır. Ama temel yaklaşım aynıdır:

`veri -> skor -> olasılık -> aksiyon`

### 6.1 BIST ana skor ailesi

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

### 6.2 BIST için sadeleştirilmiş karar mantığı

`Toplam Sinyal = w1 * Trend + w2 * Hakiki Alfa + w3 * Kalite + w4 * Likidite - cezalar`

Buradaki cezalar şunları içerebilir:

- aşırı uzama
- düşük güven
- eksik veri
- zayıf rejim

### 6.3 Olasılık katmanı

Ham skor doğrudan son karar değildir. Sistem skoru, ufuk bazlı olasılık alanlarına dönüştürür:

- `probability_positive`
- `probability_outperform`
- `expected_return_pct`
- `expected_excess_return_pct`
- `risk_forecast_pct`
- `calibration_confidence`

### 6.4 Kripto / emtia / fon yaklaşımı

Bu piyasalarda hisse tipi değerleme her zaman doğru değildir. Bu yüzden:

- kriptoda `referans bant`, `BTC’ye göre alfa`, `uzama riski`
- emtiada `trend + taktik hareket + korunma mantığı`
- fonlarda `istikrar + büyüme + dönemsel süreklilik`

kullanılır.

Daha detaylı teknik notlar:

- [`docs/hakiki-alfa-v1.md`](./docs/hakiki-alfa-v1.md)
- [`docs/trend-skoru-v1.md`](./docs/trend-skoru-v1.md)
- [`docs/firsat-skoru-v1.md`](./docs/firsat-skoru-v1.md)
- [`docs/proprietary-score-family-v1.md`](./docs/proprietary-score-family-v1.md)
- [`docs/tahmin-motoru-v1.md`](./docs/tahmin-motoru-v1.md)

</details>

<details open>
<summary><strong>7. Tavsiye Motoru</strong></summary>

Tavsiye motoru artık dönem bazlı çalışır. Ana ufuklar:

- `1 Gün`
- `5 Gün`
- `30 Gün`
- `6 Ay`
- `1 Yıl`
- `2 Yıl` görünür olabilir, ancak aktif kalibrasyon çekirdeği daha kısa/orta ufuklarda yoğunlaşır

Karar üretiminde kullanılan ana bileşenler:

- skor
- olasılık
- beklenen getiri
- beklenen alfa
- risk tahmini
- veri güveni

Örnek karar mantığı:

- güçlü aday: yüksek pozitif olasılık + pozitif beklenen alfa
- izleme adayı: orta olasılık + kabul edilebilir risk
- zayıf aday: düşük olasılık veya negatif beklenen alfa

Bu motor:

- analiz sayfasında liste üretir
- piyasa tablolarında aksiyon üretir
- portföy tarafında hedef ve conviction mantığını besler

</details>

<details open>
<summary><strong>8. Portföy, Hedef Planı ve Favoriler</strong></summary>

Portföy tarafında sistem:

- alış/satış işlemlerini saklar
- canlı kâr/zarar takibi yapar
- hedef planı üretir
- pozisyon bazlı `Tut / İzle / Kâr Al / Zararı Kes` benzeri kararlar üretir
- kapanmış işlemlerden istatistiksel sepet raporu çıkarır

Favoriler tarafında:

- kullanıcı/profil bazlı listeler tutulur
- piyasa tablolarındaki yıldız aksiyonu ile hızlı ekleme yapılır
- listeler ayrı sayfada skor öncelikli tabloda izlenir

</details>

<details open>
<summary><strong>9. Sonuç Raporu</strong></summary>

Sonuç raporu, sistemin sadece öneri üretmesini değil, önerilerinin tarihsel doğruluğunu ölçmesini sağlar.

Ana yaklaşım:

- geçmiş snapshot’lar okunur
- seçilen dönem için o günün adayları bulunur
- ileri tarihte gerçekten ne olduğu ölçülür
- doğru / yanlış tahmin, alfa isabeti, ortalama getiri gibi metrikler üretilir

Sonuç raporunda:

- bugünün aday listesi
- geçmiş doğrulama
- yükseliş modeli
- düşüş modeli
- skora uyan varlıklar
- skora ters davranan varlıklar

aynı anda görülebilir.

</details>

<details open>
<summary><strong>10. Kurulum</strong></summary>

### Gereksinimler

- Windows
- Node.js LTS
- Python 3.11+
- İnternet erişimi

### Tavsiye edilen kurulum

```powershell
git clone https://github.com/emirhangungormez/mizan23.git
cd mizan23
.\mizan23.bat
```

Başlatıcı şunları yapmaya çalışır:

- Python bulur, gerekirse kurulum yönlendirir
- Git yoksa kurmayı dener
- `.git` metadata yoksa repoyu bootstrap etmeye çalışır
- frontend ve backend bağımlılıklarını kurar
- engine ve frontend’i başlatır
- sağlık kontrolü yapar

</details>

<details open>
<summary><strong>11. LAN ve Çoklu Cihaz Kullanımı</strong></summary>

`mizan23`, aynı ağ içindeki birden fazla cihazda açılabilecek şekilde çalıştırılabilir.

Örnek:

- ana bilgisayar: `http://localhost:3000`
- aynı ağdaki diğer cihazlar: `http://<yerel-ip>:3000`

Bu model:

- aynı ev / aynı ofis ağında kullanım
- farklı cihazlardan aynı sisteme erişim
- profil bazlı ayrım

için tasarlanmıştır.

Not:

- bu yapı parola tabanlı çok kullanıcılı kimlik sistemi değildir
- ayrım, profil / kullanım kümesi mantığı üzerindedir

</details>

<details open>
<summary><strong>12. Güvenlik Modeli</strong></summary>

Mevcut güvenlik yaklaşımı:

- yerel ağ odaklı kullanım
- proxy katmanı
- yönetim anahtarı ile korunan mutasyon endpoint’leri
- açık sağlık ve iç sistem sağlık ayrımı

Bu proje şu anda:

- güvenilir cihaz
- güvenilir ağ
- yerel / küçük grup kullanımı

senaryoları için uygundur.

Kurumsal çok kullanıcılı dağıtım için ayrıca:

- kimlik doğrulama
- rol bazlı yetki
- şifreli saklama
- audit log

gereklidir.

</details>

<details open>
<summary><strong>13. Sorun Giderme</strong></summary>

### `Sağlık kontrolleri bekleniyor`

Bu genelde şu anlama gelir:

- backend açılıyor ama geç cevap veriyor
- frontend açılıyor ama backend hazır değil
- veya engine açılışta düşüyor

Yeni başlatıcı artık:

- hangi servis bekleniyor
- kaç saniyedir bekleniyor
- süreç düşerse son log satırlarını

ekranda gösterir.

### `Python bulunamadı`

- Python 3.11+ kurulu olmalı
- başlatıcı yaygın kurulum yollarını da kontrol eder
- gerekirse kurulum sonrası `mizan23.bat` yeniden çalıştırılmalıdır

### `Git bulunamadı`

- Git for Windows kurulu olmalı
- başlatıcı bunu da kurmaya çalışabilir

</details>

---

## English

<details>
<summary><strong>1. Overview</strong></summary>

`mizan23` is a local-first, multi-market intelligence and portfolio decision-support platform.

It is designed to combine:

- ranked market tables
- horizon-based recommendation logic
- proprietary scoring
- fair value / reference band comparisons
- portfolio target planning
- favorites and watchlists
- profile-based usage
- historical outcome validation

</details>

<details>
<summary><strong>2. Supported Markets</strong></summary>

| Market | Coverage | Primary Use |
|---|---|---|
| BIST | Equities, indices, sectors, proprietary score stack | Main decision engine |
| US equities | Broad stock universe and analyst-target enrichment | Score + action + fair value context |
| Crypto | Major and mid-cap pairs | Score + BTC-relative alpha + reference band |
| Commodities | Energy and metals | Tactical trend and relative movement |
| Funds | Mutual and pension funds | Stability and horizon performance |
| FX | Core FX universe | Context and cross-market tracking |

</details>

<details>
<summary><strong>3. Architecture</strong></summary>

The platform runs on two core layers:

1. `Next.js` frontend
2. `FastAPI` Python engine

Requests are routed through the internal `/api/python/...` proxy layer before reaching the engine.

This keeps:

- request flow centralized
- browser access controlled
- caching and fallback logic unified

</details>

<details>
<summary><strong>4. Data Sources</strong></summary>

| Source | Used For | Markets | Notes |
|---|---|---|---|
| `borsapy` | BIST market universe, screener, structural data | BIST | One of the most important building blocks on the BIST side |
| `yfinance` | History, analyst targets, benchmarks, cross-market enrichment | US, crypto, commodities, benchmarks | Used with snapshots and cache protection |
| Local proprietary snapshots | Historical outcome and fast re-use | All supported markets | Generated by the engine |
| Local JSON / SQLite | Persistent local state | Portfolio, profiles, engine support data | Local-first persistence |

Special thanks to the maintainers and contributors of the `borsapy` ecosystem for making structured BIST-side development meaningfully more practical.

</details>

<details>
<summary><strong>5. Formula System</strong></summary>

The core model pattern is:

`data -> score -> probability -> action`

Key proprietary BIST score families include:

- `Hakiki Alfa`
- `Trend Score`
- `Liquidity Score`
- `Quality Score`
- `Opportunity Score`
- `Trade Score`
- `Long-Term Score`
- `Radar Score`

The platform then transforms these into:

- positive probability
- outperform probability
- expected return
- expected excess return
- risk forecast
- calibration confidence

</details>

<details>
<summary><strong>6. Recommendation Engine</strong></summary>

The recommendation engine is horizon-based rather than purely label-based.

Primary horizons:

- `1 Day`
- `5 Days`
- `30 Days`
- `6 Months`
- `1 Year`

The output is driven by a combination of:

- score
- probability
- expected return
- expected alpha
- risk
- confidence

</details>

<details>
<summary><strong>7. Portfolio and Outcomes</strong></summary>

Portfolio features include:

- transaction history
- live PnL
- target planning
- conviction logic
- statistical portfolio reporting

Outcome reports provide:

- current candidates
- historical validation
- rising / weakening models
- correct vs incorrect predictions
- score-compliant vs score-resistant assets

</details>

<details>
<summary><strong>8. Setup</strong></summary>

```powershell
git clone https://github.com/emirhangungormez/mizan23.git
cd mizan23
.\mizan23.bat
```

The launcher attempts to:

- detect or bootstrap Python
- detect or bootstrap Git
- install frontend dependencies
- install Python dependencies
- start backend and frontend
- run health checks

</details>

<details>
<summary><strong>9. LAN Usage</strong></summary>

`mizan23` can be used across multiple devices on the same local network.

Example:

- local machine: `http://localhost:3000`
- same network devices: `http://<local-ip>:3000`

</details>

---

## Visuals

### Product Screens

| Area | Preview |
|---|---|
| Dashboard | ![Dashboard](./docs/images/dashboard-home.png) |
| BIST Markets | ![BIST Markets](./docs/images/markets-bist.png) |
| Asset Detail | ![Asset Detail](./docs/images/asset-detail-financials.png) |

These screenshots are taken from the live product and are intended to represent the current UI rather than placeholder mockups.
