# Hakiki Alfa (HA) v1

Bu dokuman, Trade Intelligence icindeki ilk proprietary matematiksel metriği tanimlar.

Amac:
Bir hissenin sadece nominal olarak degil, dunya serveti ve deger saklama varliklari karsisinda gercekten pay kazanip kazanmadigini olcmek.

## Temel Fikir

Bir hisse fiyat olarak yukselmis olabilir. Ancak ayni gun veya ayni donemde:

- dolar gucleniyorsa
- altin yukseliyorsa
- bitcoin ya da benzer varliklar daha hizli prim yapiyorsa
- kuresel para ve servet havuzu genisliyorsa

bu hisse sahibine hakiki anlamda reel servet artisi saglamamis olabilir.

Bu nedenle sistemin ilk ana proprietary olcumu:

`Hakiki Alfa (HA)`

olacaktir.

## Tanim

Hakiki Alfa, bir varligin gunluk getirisinden, ayni gun kuresel servet referans sepetinin getirisinin cikarilmasidir.

En basit haliyle:

`HA_i,t = R_i,t - R_G,t`

Burada:

- `i`: ilgili hisse veya varlik
- `t`: gun
- `R_i,t`: hissenin gunluk getirisi
- `R_G,t`: Global Alpha sepetinin gunluk getirisi

## Global Alpha Sepeti

Ilk surumde referans sepet su varliklardan olusur:

- `USD`  : Dolar likiditesi / M2
- `EUR`  : Euro bolgesi M2
- `XAU`  : Altin
- `XAG`  : Gumus
- `BTC`  : Bitcoin
- `^GSPC`: S&P 500

Bu varliklarin agirligi her gun dinamik olarak, toplam buyukluklerine gore belirlenir.

`w_k,t = V_k,t / sum(V_*,t)`

Burada:

- `k`: sepet icindeki varlik
- `V_k,t`: ilgili varligin t gunundeki toplam buyuklugu veya market-size degeri

## Gunluk Sepet Getirisi

Global referans sepetin gunluk getirisi:

`R_G,t = sum(w_k,t-1 * R_k,t)`

Not:
Agirlikta bir onceki gun kullanilir. Boylece ayni gun hem agirligi hem getiriyi ayni anda kullanip ileriye bakan hata yapilmaz.

## Hissenin Gunluk Getirisi

Bir hissenin gunluk getirisi:

`R_i,t = (P_i,t / P_i,t-1) - 1`

Burada:

- `P_i,t`: t gunundeki kapanis fiyati

## Ana Formul

Son haliyle Hakiki Alfa:

`HA_i,t = ((P_i,t / P_i,t-1) - 1) - sum(w_k,t-1 * R_k,t)`

Bu form, her hisse icin her gun hesaplanir.

## Yorum

- `HA_i,t > 0` ise:
  Hisse, o gun dunya servet referans sepetinden daha iyi performans gostermistir.

- `HA_i,t = 0` ise:
  Hisse, referans servet genislemesi ile ayni hizda hareket etmistir.

- `HA_i,t < 0` ise:
  Hisse nominal olarak artsa bile, kuresel servet referansina gore goreli fakirlesme vardir.

## Birikimli Hakiki Alfa

Gunluk HA tek basina yeterli degildir. Zaman icindeki toplam etkisini gormek icin birikimli seri de tutulur.

Onerilen iki seri:

### 1. Toplam HA Puani

`CHA_i,T = sum(HA_i,t)` for `t = 1..T`

Bu seri hizli okunur ama geometrik etkiyi tam tasimaz.

### 2. Hakiki Servet Orani

`HSO_i,T = product((1 + R_i,t) / (1 + R_G,t))`

Bu seri daha gucludur.

Yorum:

- `HSO_i,T > 1`: hisse referans sepete gore servet payi kazandi
- `HSO_i,T < 1`: hisse referans sepete gore servet payi kaybetti

## Sistem Icindeki Kullanim

Hakiki Alfa, ileride su alanlarda kullanilabilir:

- hisse siralamasi
- alpha score
- reel getiri paneli
- portfoy kalite skoru
- momentum filtresi
- risk-adjusted proprietary sinyal

## Ilk Is Kurali

Bir hissenin sadece fiyat artmasi yeterli degildir.

Sistemin ilk temel kurali:

`Nominal getiri > 0` olsa bile
eger
`Hakiki Alfa <= 0`
ise
bu hareket reel anlamda guclu kabul edilmeyecektir.

## Hesaplama Frekansi

Bu deger:

- her is gunu
- gun sonu kapanis verisi ile
- tum hisseler icin
- otomatik olarak

hesaplanmalidir.

Opsiyonel sonraki asama:

- saatlik
- 4 saatlik
- haftalik

Hakiki Alfa turevleri uretilebilir.

## v1 Sinirlari

Bu ilk surumde bazi sinirlar vardir:

- tum varlik buyuklukleri ayni frekansta guncellenmeyebilir
- makro para arzi verileri fiyat verisi kadar hizli degildir
- S&P 500 buyuklugu dogrudan resmi tek kaynak yerine turetilmis olabilir
- altin ve gumus market-size verileri piyasadaki tahmini toplam deger mantigi tasir

Bu nedenle `Hakiki Alfa v1`, mutlak hakikat degil;
proprietary reel-goreli performans olcumu olarak kullanilacaktir.

## v2 Icın Olası Genisletmeler

- sepete `DXY` eklemek
- `global bond market` eklemek
- `global real estate proxy` eklemek
- enerji ve emtia alt sepeti olusturmak
- sektor bazli referans sepetler uretmek
- ulke bazli lokal Hakiki Alfa turetmek

## Kisa Ozet

Hakiki Alfa, projenin ilk ozel matematiksel degeridir.

Bu metrik su soruya cevap verir:

`Bu hisse gercekten dunya servetinden pay mi kazaniyor, yoksa sadece nominal olarak mi yukseliyor?`

Bu metrik bundan sonra sistemin cekirdek matematiksel omurgasinin ilk halkasi olarak kabul edilir.
