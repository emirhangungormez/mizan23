# Trade Intelligence Sistem Raporu

## 1. Sistem Özeti

Trade Intelligence, yerel çalışan çok katmanlı bir piyasa zekâsı ve portföy karar destek sistemidir. Sistem; BIST, ABD hisseleri, kripto, emtia, fon ve kullanıcı portföyleri için veri toplar, skor üretir, öneri motorlarını çalıştırır, geçmiş doğrulama yapar ve sonuçları tek arayüzde birleştirir.

Ana hedef, ham piyasa verisini doğrudan göstermek değil; veriyi işleyip yorumlanabilir karar katmanlarına dönüştürmektir. Bu nedenle sistemin merkezinde üç kavram vardır:

- veri toplama ve zenginleştirme,
- skor ve öneri üretimi,
- geriye dönük doğrulama ve öğrenme.

Bu yapı yatırım tavsiyesi üretmek için değil, istatistiksel ve yazılımsal olarak disiplinli bir karar destek platformu kurmak için tasarlanmıştır.

## 2. Yazılım Mimarisi

Sistem iki ana katmandan oluşur:

- Frontend: Next.js 16 tabanlı kullanıcı arayüzü
- Engine: FastAPI tabanlı Python analiz motoru

Frontend, Python motoruna doğrudan gitmez; tüm çağrılar `/api/python/...` proxy katmanı üzerinden yapılır. Böylece uygulama tarafında tek veri kapısı korunur. Bu yapı [README.md](C:/Users/emirh/Desktop/trade-intelligence/README.md), [api-client.ts](C:/Users/emirh/Desktop/trade-intelligence/lib/api-client.ts) ve [app.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/app.py) içinde görülür.

Temel çalışma akışı şöyledir:

1. Arayüz bir ekran açar.
2. İlgili servis `fetchFromEngine` ile Python endpoint’ine gider.
3. Python motoru veri kaynağından veriyi toplar, zenginleştirir, skorlar.
4. Sonuç önbelleğe ve gerekirse snapshot dosyalarına yazılır.
5. Frontend bu çıktıyı kart, tablo, rozet ve öneri alanlarına dönüştürür.

## 3. Başlatma ve Operasyon Yapısı

Sistem Windows üzerinde tek komutla ayağa kalkacak şekilde hazırlanmıştır:

- `RUN_ALL.bat`
- `tools/run-all.ps1`

Bu bootstrap akışı:

- Node.js ve Python kontrolü yapar
- bağımlılıkları lock dosyalarına göre yükler
- `3000` ve `3003` portlarını temizler
- frontend ve engine süreçlerini başlatır
- health check bekler
- hızlı sistem doğrulaması yapar

Bu operasyon katmanı [run-all.ps1](C:/Users/emirh/Desktop/trade-intelligence/tools/run-all.ps1) içinde tanımlıdır.

Engine açılırken arka planda şu süreçler başlar:

- BIST background refresh
- benchmark refresh
- non-BIST analysis snapshot refresh

Bu akış [app.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/app.py) içindedir.

## 4. Veri Katmanı

Sistem tek bir veri kaynağına bağımlı değildir. Kategoriye göre farklı kaynaklar kullanılır:

- BIST ve yerel piyasa verileri: `borsapy`
- ABD, kripto, emtia gibi küresel veriler: `yfinance`
- kullanıcı verileri: yerel JSON ve lokal storage
- hesaplanmış snapshot’lar: `engine-python/storage/...`

Veri toplama merkezi [market_fetch.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/engine/data/market_fetch.py) dosyasıdır.

Burada şu önemli mekanizmalar vardır:

- TTL tabanlı cache
- stale snapshot fallback
- disk üstünde kalıcı analysis snapshot’ları
- batch fetch
- retry ve korumalı external fetch

Bu yüzden sistem “her istekte her şeyi baştan hesaplayan” bir yapı değil; “önceden hazırlayan, gerektiğinde tazeleyen, gerektiğinde cache’den servis eden” bir mimaridir.

## 5. Matematiksel Temel

Sistemde iki ayrı matematik ailesi vardır:

- genel deterministik analiz motoru
- kategoriye ve pazara özel proprietary skor motorları

### 5.1 Genel deterministik analiz motoru

Tekil varlık analizi için kullanılan genel motor [analysis.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/api/analysis.py) ve [score_engine.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/scoring/score_engine.py) içindedir.

Kullandığı ana göstergeler:

- Shannon Entropisi: fiyat hareketlerinin belirsizlik düzeyi
- Hurst Üssü: seri trend mi, mean-reverting mi, random walk mı
- Tarihsel volatilite: risk ve oynaklık seviyesi
- Rejim tespiti: bullish trend, bearish trend, sideways/range

Ham matematik modülleri:

- [entropy.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/engine/math/entropy.py)
- [hurst.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/engine/math/hurst.py)
- [volatility.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/engine/math/volatility.py)
- [regime.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/engine/math/regime.py)

Genel skor motorunun mantığı:

- yüksek Hurst: trend kalıcılığı artar, skor yükselir
- düşük entropy: tahmin edilebilirlik artar, skor yükselir
- düşük volatilite: istikrar artar, skor yükselir
- bullish regime: ilave pozitif katkı

Bu katmanın amacı doğrudan “al/sat tavsiyesi” vermek değil, sayısal ortamın kalitesini ölçmektir.

### 5.2 Olasılık katmanı

Genel analiz motorunda yukarı, aşağı ve yatay olasılıkları da üretilir. Bu olasılıklar sınıflandırıcı değildir; entropy, hurst ve regime üzerinden yumuşak şekilde türetilir. Bu nedenle model “kesin tahmin” değil, olasılıksal yön eğilimi üretir. Bu yapı [analysis.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/api/analysis.py) içindedir.

## 6. BIST Proprietary Skor Motoru

BIST tarafı sistemin ana karar omurgasıdır. Bu motor [proprietary_scores.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/scoring/proprietary_scores.py) içinde tanımlıdır.

Bu motorda tek bir skor yoktur. Çok faktörlü alt skorlar hesaplanır:

- `trend_score`
- `liquidity_score`
- `quality_score`
- `value_support_score`
- `analyst_support_score`
- `catalyst_score`
- `ownership_score`
- `sector_context_score`
- `public_float_risk_score`
- `financial_resilience_score`
- `capital_discipline_score`
- `adil_deger_skoru`
- `temettu_guven_skoru`
- `temettu_tuzagi_riski`
- `temettu_takvim_firsati`
- `hakiki_alfa`

Bu alt skorlar daha sonra dört ana kullanım skoruna çevrilir:

- `fırsat_skoru`
- `trade_skoru`
- `uzun_vade_skoru`
- `radar_skoru`

Her mod için ağırlıklar farklıdır. Örneğin:

- `trade` modunda trend, likidite, hakiki alfa ve giriş kalitesi daha baskındır
- `uzun_vade` modunda kalite, dayanıklılık, sermaye disiplini ve adil değer daha baskındır
- `radar` modunda dengeden sapma, RSI dengesi ve erken sinyal kalitesi daha etkilidir

Ek olarak sistem şu iki katmanı da uygular:

- veri kapsamına bağlı güven/ceza katmanı
- geçmiş outcome belleğine dayalı küçük kalibrasyon katmanı

Yani skorlar sadece bugünkü veriden üretilmez; veri kalitesi zayıfsa yukarı yönlü skorlar kısılır, hisse tarihsel olarak modele uyumluysa sınırlı pozitif kalibrasyon alır.

## 7. Hakiki Alfa ve Adil Değer

### 7.1 Hakiki alfa

Hakiki alfa, varlığın çıplak günlük değişimini değil; referans piyasaya göre üstün veya zayıf performansını ölçer.

Mantık:

- BIST: küresel referans setine göre göreli konum
- ABD: S&P 500 referansı
- Kripto: Bitcoin referansı

Bu yapı BIST tarafında [proprietary_scores.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/scoring/proprietary_scores.py), diğer piyasalarda [market_fetch.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/engine/data/market_fetch.py) içinde bulunur.

### 7.2 Adil değer

Kategoriye göre adil değer mantığı değişir:

- BIST: şirket verileri, kalite, finansal dayanıklılık, sermaye disiplini, sektör bağlamı ve diğer iç sinyallerden oluşan proprietary adil değer snapshot’ı
- ABD: analist hedeflerinin mean/median/low/high birleşiminden üretilen fair value
- Kripto: klasik adil değer yerine 90 günlük referans bant
- Emtia ve fon: tam adil değer yerine skor öncelikli yaklaşım

Dolayısıyla sistem tüm pazarlarda aynı “valuation” dilini kullanmaz. Kategoriye uygun bir karşılaştırma dili kullanır.

## 8. Tavsiye ve Analiz Bölümü

Tavsiye ve analiz ekranının frontend’i [analysis/page.tsx](C:/Users/emirh/Desktop/trade-intelligence/app/(dashboard)/analysis/page.tsx), servis katmanı [market.service.ts](C:/Users/emirh/Desktop/trade-intelligence/services/market.service.ts), backend özet üretimi ise [bist_data.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/api/bist_data.py) içindedir.

Bu ekran BIST proprietary snapshot’ından türetilen hafif bir overview payload kullanır:

- `advice.buy_now`
- `advice.buy_week`
- `advice.hold`
- `advice.sell`
- `portfolio_candidates`
- `upcoming_dividends`
- `opposite_pairs`

### 8.1 Tavsiye sınıfları nasıl üretilir

Backend tarafındaki mevcut kural mantığı:

- `Bugün Al`: `fırsat >= 85` veya `trade >= 80` ve `hakiki_alfa > 0`
- `Bu Hafta Topla`: `fırsat >= 74` veya `trade >= 66` ve `hakiki_alfa >= -0.15`
- `Tut / Biriktir`: `uzun_vade >= 78` ve `hakiki_alfa >= 0`
- `Bugün Sat` veya `Kar Al / Azalt`: negatif hakiki alfa, zayıf kısa vade skoru veya aşırı ısınmış RSI/günlük hareket kombinasyonu

Bu eşikler [bist_data.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/api/bist_data.py) ve frontend tarafında görsel sunum için [analysis/page.tsx](C:/Users/emirh/Desktop/trade-intelligence/app/(dashboard)/analysis/page.tsx) içinde işlenir.

### 8.2 Portföye aday hisseler

Sepette eksik ama sisteme göre güçlü olan hisseler için ayrı bir bileşik skor kullanılır:

`0.26*fırsat + 0.14*trade + 0.22*uzun_vade + 0.12*finansal_dayanıklılık + 0.10*sermaye_disiplini + 0.16*portfolio_fit`

Bu bileşik skor yeterince yüksekse ve hakiki alfa pozitifteyse, hisse “sepete eklenebilir aday” olarak işaretlenir.

### 8.3 Yakın temettü ve zıt hisseler

Analiz ekranı sadece al/sat önerisi göstermez. Aynı zamanda:

- yaklaşan temettü fırsatlarını
- uzun dönem korelasyon zayıflığı veya ters hareket ilişkisi gösteren zıt hisse çiftlerini

ayrı araştırma blokları olarak sunar. Böylece ekran hem fırsat keşif motoru hem de portföy çeşitlendirme aracı olarak kullanılır.

## 9. BIST Dışı Piyasalar İçin Motorlar

BIST dışı taraflarda BIST motoru aynen kopyalanmamıştır. Her kategori için kendi veri yapısına uygun motor kullanılır. Bu karar [market_fetch.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/engine/data/market_fetch.py) içinde uygulanır.

### 9.1 ABD hisseleri

ABD tarafında:

- tarihsel getiri türevleri
- volatilite
- drawdown
- likidite
- S&P 500’e göre hakiki alfa
- analist hedeflerinden fair value

bir araya getirilir. Sonuç `market_signal`, `hakiki_alfa`, `adil_deger` olarak döner.

### 9.2 Kripto

Kriptoda klasik hisse tipi valuation yerine şu yapı kullanılır:

- momentum
- likidite
- istikrar
- yapı/rejim
- BTC referanslı hakiki alfa
- 90 günlük referans bant

Bu yüzden kripto tarafında “adil değer” kavramı daha çok “makul bölge / referans bant” olarak ele alınır.

### 9.3 Emtia

Emtiada skor daha çok taktik ve makro uyum odaklıdır:

- momentum
- likidite
- istikrar
- macro fit

### 9.4 Fonlar

Fonlarda temel yaklaşım:

- momentum
- consistency
- profile fit

Yani fon motoru “şirket analizi” değil, performans ve istikrar motorudur.

## 10. Portföy ve Sepet Motoru

Portföy analizi [portfolio.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/api/portfolio.py) ve [portfolio_learning.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/storage/portfolio_learning.py) içinde çalışır. Arayüz tarafı [portfolio-workspace.tsx](C:/Users/emirh/Desktop/trade-intelligence/components/portfolio/portfolio-workspace.tsx) içindedir.

Bu motor sadece açık pozisyon kâr-zararını göstermez. Her varlık için:

- mevcut fiyat
- maliyet
- gerçekleşmemiş getiri
- snapshot skorları
- hedef profil
- sistem hedefi
- manuel override
- conviction score
- holding action
- target action
- entry signal

üretilir.

### 10.1 Hedef planı

Her varlık için hedef profili seçilebilir:

- gün içi
- 1 ay
- 6 ay
- 1 yıl
- özel

Sistem her profil için otomatik hedef getiri önerir. Bu öneri baz hedefin üstüne veya altına skor gücüne göre çıkar veya iner. Kullanıcı isterse bunu manuel override edebilir; fakat sistem bunun “gerçek sistem hedefi değil, manuel hedef” olduğunu ayrıca işaretler.

### 10.2 Conviction ve aksiyon

Portföyde öneri sadece mevcut zarar/kâra bakmaz. Şu girdiler birleşir:

- fırsat
- trade
- uzun vade
- radar
- hakiki alfa
- mevcut PnL

Buradan `conviction_score` türetilir. Ardından iki ayrı karar üretilir:

- `holding_action`: Tut, Sat, Kesin Sat gibi pozisyon yorumu
- `target_action`: Hedefe Kadar Tut, Kar Al, Kademeli Kar Al, Zararı Kes, Risk Azalt gibi hedef planı yorumu

Bu ayrım önemlidir; çünkü sistem artık sadece “hisse düşüyor, sat” demez. “Hedefe yakın ama skor zayıflıyor” gibi daha operasyonel tavsiyeler üretir.

## 11. Sonuç Raporu ve Öğrenme Katmanı

Sonuç raporu motoru [proprietary_outcomes.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/storage/proprietary_outcomes.py) içinde bulunur. Arayüzü [market/outcomes/page.tsx](C:/Users/emirh/Desktop/trade-intelligence/app/(dashboard)/market/outcomes/page.tsx) içindedir.

Bu katmanın amacı şudur:

- sistem geçmişte kimi güçlü buldu
- kimi zayıf buldu
- belirli bir ufukta gerçekten ne oldu
- model ne kadar doğruydu
- hangi hisseler modele sürekli uyuyor veya ters davranıyor

Sistem snapshot biriktirir, sonra şu dönem pencerelerinde değerlendirme yapar:

- 1 gün
- 5 gün
- 30 gün
- 6 ay
- 1 yıl
- 2 yıl

Bu raporda iki ayrı katman vardır:

- üst katman: geçmiş doğrulama
- alt katman: bugünün güncel aday listesi

Yani sistem hem “bugün kimi seçiyorum” hem de “geçmişte bu tip seçimlerimde ne kadar haklıydım” sorusunu aynı yerde cevaplar.

### 11.1 Skora uyum belleği

Outcome sistemi sadece rapor üretmez; hisse bazlı uyum profili de çıkarır. Eğer bir hisse sistem skorlarına tarihsel olarak düzenli biçimde uyuyorsa, bu bilgi küçük bir pozitif kalibrasyon olarak future scoring katmanına geri yazılır. Eğer sürekli aykırı davranıyorsa, bu da negatif kalibrasyon etkisi yaratır.

Bu yüzden sistem statik değil; geçmiş uyum davranışını sınırlı ölçüde öğrenen yarı-adaptif bir yapıdır.

## 12. Sepet Raporu

Portföy tarafına eklenen sepet raporu, kapanmış işlemler üzerinden motorun gerçek işlem başarısını ölçer. Bu katman [portfolio_learning.py](C:/Users/emirh/Desktop/trade-intelligence/engine-python/storage/portfolio_learning.py) içinde tanımlıdır.

Ölçtüğü metrikler:

- kapanmış işlem sayısı
- kazanma oranı
- Wilson güven aralığı
- ortalama gerçekleşen getiri
- medyan getiri
- profit factor
- expectancy
- ortalama ve medyan taşıma süresi
- giriş sinyali doğruluğu
- çıkış sinyali doğruluğu

Bu yapı sayesinde sistem sadece piyasada değil, kullanıcının kendi sepetindeki fiili işlem geçmişi üzerinde de doğrulanabilir hale gelir.

## 13. Güven, Veri Kalitesi ve Performans

Sistemde skor kadar veri kalitesi de önemlidir. Bu yüzden birçok alanda:

- input coverage
- score confidence
- confidence label
- fair value data band
- fair value confidence band

gibi kalite alanları tutulur.

Ayrıca performans için:

- memory cache
- session cache
- stale fallback
- persistent analysis snapshot
- background refresh

kullanılır. Bu sayede soğuk açılış dışında çoğu ekran hızlı döner.

## 14. Sistemin Güçlü Yönleri

- Tek bir sayısal skora indirgenmemiş çok katmanlı karar motoru
- Pazar türüne göre değişen özel modelleme
- Portföy hedef sistemi ve otomatik hedef önerisi
- Geriye dönük doğrulama ve öğrenme katmanı
- Yerel-first mimari, dış SaaS bağımlılığının düşük olması
- Aynı uygulamada hem araştırma, hem tarama, hem portföy, hem doğrulama katmanı olması

## 15. Dikkat Edilmesi Gereken Nokta

Bu sistem güçlü bir karar destek altyapısıdır; ancak prensip olarak probabilistik ve istatistiksel çalışır. Yani sistem “kesin gelecek tahmini” yapmaz. Sistem:

- veriyi normalize eder,
- faktörlere ayırır,
- puanlar,
- yorumlar,
- doğrular,
- zaman içinde kendini kalibre eder.

Dolayısıyla ürünün doğru tanımı şudur:

Karar destek, tarama, doğrulama ve portföy disiplin sistemi.

Yatırım tavsiye motoru değil, veri temelli karar motoru.
