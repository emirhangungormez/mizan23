# KAP ve Sahiplik Motoru v1

Bu belge, Borsapy uzerinden gelen KAP akisi, halka aciklik ve sahiplik verilerinin nasil yorum katmanina cevrildigini tanimlar.

## Amaç

Bir hisseyi sadece fiyat ve teknik ile degil, su sorularla da okumak:

- Sirketin guncel KAP akisinda fiyatlayici bir olay var mi?
- Halka aciklik yapisi saglikli mi?
- Kurumsal sahiplik izi var mi?
- Tahta yogun ve dar bir ortaklik yapisina mi sahip?
- Temettu ve sahiplik tarafinda guven veren bir duzen var mi?

## Kullanilan Veri Alanlari

### KAP / Haber

- `news`
- `calendar`

Sinifladigimiz ornek basliklar:

- pozitif:
  - `Yeni Is Iliskisi`
  - `Finansal Rapor`
  - `Faaliyet Raporu`
  - `Kredi Derecelendirmesi`
  - `Geri Alim`
  - `Gelecege Donuk Degerlendirmeler`
- negatif:
  - `Islem Yasagi`
  - `Devre Kesici`
  - `Sermaye Artirimi`
  - `Haber ve Soylentilere Iliskin Aciklama`
- notr:
  - `Sirket Genel Bilgi Formu`
  - `BISTECH Duyurusu`
  - rutin bildirimler

### Sahiplik / Ortaklik Yapisi

- `foreign_ratio`
- `float_shares`
- `shares_outstanding`
- `public_float_pct`
- `major_holders`
- `etf_holders`
- `dividends`

## Uretilen Skorlar

### 1. KAP Etki Skoru

Kod karsiligi:

- `catalyst_score`
- `kap_etki_skoru`

Mantik:

- pozitif KAP basliklari skoru yukari iter
- negatif ve riskli basliklar skoru asagi ceker
- yakin tarihli finansal takvim / temettu takvimi hafif destek verir

Soru:

`Sirketin son olay akisinda fiyatlayici bir hikaye var mi?`

### 2. Sahiplik Kalitesi Skoru

Kod karsiligi:

- `ownership_score`
- `sahiplik_kalitesi_skoru`

Mantik:

- yuksek `foreign_ratio` pozitif
- ETF sahipligi pozitif
- makul `public_float_pct` pozitif
- asiri yogun ana ortak yapisi negatif
- temettu gecmisi daha istikrarliysa pozitif

Soru:

`Bu hissede daha saglikli ve daha kurumsal bir tasiyici taban var mi?`

## Yorumlama Ornekleri

### Yuksek KAP Etki + Dusuk Sahiplik Kalitesi

Anlam:

- hikaye guclu olabilir
- ama tahta yapisi kirilgan olabilir
- hizli hareket eder, risk de yuksek olabilir

### Dusuk KAP Etki + Yuksek Sahiplik Kalitesi

Anlam:

- heyecan az olabilir
- ama yapi daha saglam olabilir
- uzun vade veya kademeli toplama icin daha anlamli olabilir

### Yuksek KAP Etki + Yuksek Sahiplik Kalitesi

Anlam:

- hem olay akisi var
- hem sahiplik zemini destekli
- bu en degerli kombinasyonlardan biridir

## Neden Onemli

Iki hisse ayni teknik gorunume sahip olabilir.

Ama:

- biri dusuk halka acik ve tek elde yogunlasmis olabilir
- digeri yabanci / ETF / temettu destegiyle daha saglikli olabilir

Ayni sekilde:

- biri sessiz bir grafikte yukseliyor olabilir
- digeri ise arkasinda yeni is iliskisi, faaliyet raporu, kredi notu gibi gercek katalist tasiyor olabilir

Bu farki sadece grafik okuyarak anlamak zordur.

## V1 Sinirlari

- KAP basligi okunuyor, tam metin NLP analizi yok
- major holders verisi tum hisselerde dolu degil
- halka aciklik bazen `float_shares / shares_outstanding` ile tahmin ediliyor
- haberlerin zamansal agirligi henuz lineer degil

## V2 Yon

1. KAP basliklarini daha ince siniflandirma
2. KAP icerigine NLP sentiment
3. Haber tazelik agirligi
4. Sık devre kesici / islem yasagi davranis skoru
5. Sektore gore farkli sahiplik normalleri

## Sonuc

Bu motorla sistem artik sunu da sorar:

`Bu hareketin arkasinda sadece grafik mi var, yoksa KAP ve sahiplik tarafinda da gercek bir zemin var mi?`
