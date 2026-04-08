# Tahmin Motoru v1

Bu belge, sistemin yalnizca grafik okumasi yapmayan; teknik, makro, haber, sektor ve kurumsal izleri birlikte kullanan ilk cok faktorlu tahmin omurgasini tanimlar.

## Amac

Bir hissenin:

- sadece fiyat olarak guclu olup olmadigini degil
- gercekten devam potansiyeli tasiyip tasimadigini
- hangi zaman ufkunda daha anlamli oldugunu
- bugun giris icin uygun olup olmadigini

anlamak.

## Ana Prensip

Tek basina:

- gunluk artis
- grafik tepesi
- RSI
- TA ozeti

yeterli degildir.

Bir hissenin devami icin en az su katmanlar birlikte okunmalidir:

1. Trend ve teknik akis
2. Likidite ve islenebilirlik
3. Kalite ve yapisal guc
4. Deger destegi
5. Hakiki Alfa
6. Analist destegi
7. Haber / katalist akis
8. Kurumsal sahiplik izi
9. Sektor goreli gucu
10. Giris kalitesi

## Skor Katmanlari

### 1. Trend Skoru

Bakilan alanlar:

- gunluk degisim
- 1 hafta / 1 ay / 3 ay / YTD
- SMA50 ve SMA200 uzakligi
- TA summary
- supertrend

Soru:

`Hisse yukari gidiyor mu, yoksa sadece anlik sicrama mi yapiyor?`

### 2. Likidite Skoru

Bakilan alanlar:

- volume_usd
- market_cap_usd
- foreign_ratio

Soru:

`Bu hareket islenebilir mi, yoksa sığ bir tahtada mi oluyor?`

### 3. Kalite Skoru

Bakilan alanlar:

- 1 yillik tasima gucu
- buyukluk
- foreign ratio
- SMA200 konumu
- ADX
- RSI dengesi

Soru:

`Bu hisse sadece hizli bir trade araci mi, yoksa daha kaliteli bir yapi mi?`

### 4. Value Support

Bakilan alanlar:

- FK
- PD/DD
- 52 hafta yukari potansiyel
- temettu verimi

Soru:

`Fiyat pahali olsa bile altinda deger destegi var mi?`

### 5. Hakiki Alfa

Formul:

`HA = Hisse Gunluk Getirisi - Global Alpha Sepeti Getirisi`

Soru:

`Hisse sadece nominal olarak mi artti, yoksa dunya servet sepetine gore de guclu mu?`

### 6. Analist Destegi

Bakilan alanlar:

- analyst_recommendation
- analyst_upside
- analyst_count

Soru:

`Kurumsal analiz tarafinda bu hisse icin anlamli bir destek veya hedef farki var mi?`

### 7. Katalist / Haber Skoru

Bakilan alanlar:

- son KAP haber basliklari
- finansal rapor / faaliyet raporu
- yeni is iliskisi
- kredi derecelendirmesi
- geri alim / temettu / takvim olaylari

Soru:

`Fiyati itebilecek veya baskilayabilecek guncel olay akisi var mi?`

### 8. Kurumsal / Ownership Skoru

Bakilan alanlar:

- foreign_ratio
- ETF holders sayisi
- float_shares

Soru:

`Bu hissede daha kalici, daha kurumsal bir sahiplik izi var mi?`

### 9. Sektor Context

Bakilan alanlar:

- sector_relative_strength
- sector_peer_percentile
- sector_momentum_label

Soru:

`Hisse kendi sektorune gore onde mi, geride mi?`

Bu katman sayesinde sistem:

- sektor olarak onde gelen hisseleri
- sektor zayifken yalniz guclu duranlari
- sektor gucluyken geride kalanlari

ayri okuyabilir.

### 10. Giris Kalitesi

Bakilan alanlar:

- gunluk sicrama
- 1 haftalik uzama
- RSI
- SMA50 uzerine fazla acilma
- ADX teyidi
- Hakiki Alfa

Etiketler:

- `Uygun Giris`
- `Temkinli Giris`
- `Pullback Bekle`
- `Gec Kalinmis`

Soru:

`Kurulum guclu olsa bile su an kovalamak mantikli mi?`

## Modlara Etkisi

### Gunluk Firsatlar

En cok agirlik alanlar:

- trend
- hakiki alfa
- sektor context
- catalyst

### Trade Masasi

En cok agirlik alanlar:

- trend
- likidite
- hakiki alfa
- giris kalitesi
- catalyst
- sektor context

### Uzun Vade

En cok agirlik alanlar:

- kalite
- deger
- ownership
- analyst support
- sektor context

### Radar

En cok agirlik alanlar:

- erken trend
- hakiki alfa
- catalyst
- sektor baglami

## V1 Sinirlari

Su an hala eksik olan taraflar:

- sosyal medya / yatirimci yorum sentimenti
- haber metninin NLP ile gercek duygu analizi
- bilanconun toplu ve guvenilir doluluk orani
- petrol, faiz, kur gibi sektor-spesifik makro faktorlerin hisse bazli hassasiyeti
- outcome/backtest ile agirlik optimizasyonu

## V2 Yon

Bir sonraki surumde eklenecekler:

1. Haber basligi degil tam icerik sentiment skoru
2. Sektor ve endeks excess return motoru
3. Sektor-spesifik faktor modelleri
   Ornek:
   - TUPRS icin petrol crack spread / enerji marjlari
   - THYAO icin jet yakiti / dolar / turizm akisi
   - banka hisseleri icin faiz / net interest margin rejimi
4. Outcome tracker ile agirliklarin kalibrasyonu
5. `Tahmin Guveni` alani

## Sonuc

Bu motor artik sadece:

- `grafik guclu mu`

diye bakmaz.

Artik sunu okumaya calisir:

`Bu hisse teknik, reel, kurumsal, sektorel ve haber akisina gore gercekten devam potansiyeli tasiyor mu?`
