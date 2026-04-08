# BIST100 Adil Deger Kapsama v1

## Amac

Bu dokuman, `Adil Deger` motorunun BIST100 icinde bugun gercekten kac sirket icin kullanilabilir oldugunu netlestirir.

Amac:
- `tum BIST` evrenini korumak
- ama `Adil Deger` kapsamasini ozellikle `BIST100` uzerinden olcmek
- hangi kapsamin kaba tahmin, hangisinin daha guvenilir oldugunu ayirmak

## Sonuc Ozeti

2026-04-03 tarihli audit sonucuna gore:

- `BIST100 toplam`: `100`
- `fiyat + piyasa degeri bulunan`: `99`
- `en az 1 degerleme ayagi ile tahmini adil deger uretilebilir`: `87`
- `en az 2 degerleme ayagi ile daha guvenilir adil deger uretilebilir`: `59`

Bu sayilarin anlami:

- `87/100`
  Bu grup icin sistem kaba bir `adil deger araligi` uretebilir.

- `59/100`
  Bu grup icin sistem daha anlamli ve daha savunulabilir bir `v1/v2 fair value` cikartabilir.

## Hangi Ayaklar Kullaniliyor

Sanayi / hizmet / uretim tipi sirketlerde:
- `Net Kar`
- `Ozkaynak`
- `EBITDA`
- `Serbest Nakit Akimi`

Banka tarafinda:
- `P/B tabanli banka modeli`
- `P/E tabanli banka modeli`
- gerekli durumlarda `proxy implied equity / implied earnings`

## Bugunku Fiili Durum

Bugun icin en guclu kapsama ayaklari:
- `Ozkaynak`
- `Net Kar`

Hala zayif kalan alanlar:
- `EBITDA`
- `Serbest Nakit Akimi`

Yani bugunku v2 fair value motoru, BIST100 icinde en cok:
- `book value`
- `earnings`

uzerinden ayakta duruyor.

## Neden 100/100 Degil

Ana nedenler:
- bankalar ve finansallar icin farkli veri formu
- borsapy tarafinda bazi sembollerde finansal tablo hic gelmiyor
- bazi hisselerde veri satir adlari Turkce ve heterojen
- bazi hisselerde sadece tek ayak dolu geliyor

Eksik kalan tipik gruplar:
- bankalar
- sigorta ve finansal kurumlarin bir kismi
- veri saglayici tarafinda tablo vermeyen ozel semboller

## Ornek Yeterli Kapsam Grubu

Adil deger icin bugun kullanilabilir ornekler:
- `AEFES`
- `AGHOL`
- `AKSA`
- `AKSEN`
- `ASELS`
- `BIMAS`
- `CCOLA`
- `CIMSA`

## Ornek Eksik Grup

V1/V2 kapsami zayif kalan ornekler:
- `AKBNK`
- `GARAN`
- `HALKB`
- `ISCTR`
- `TSKB`
- `VAKBN`
- `YKBNK`

## Kullanim Kurali

Urun icinde `Adil Deger` su sekilde okunmali:

- `BIST100 + 2 ayak ve uzeri`
  Daha guvenilir fair value bandi

- `BIST100 + 1 ayak`
  Tahmini adil deger araligi

- `Veri yetersiz`
  Hukum verilmemeli

## Sonraki Asama

Kapsamayi artirmak icin sonraki teknik adimlar:

1. `EBITDA` ve `FCF` satir eslemelerini daha da guclendirmek
2. bankalar icin ayri finansal veri kontrati eklemek
3. sigorta ve holdingler icin sektor-ozel valuation mantigi yazmak
4. `bull / base / bear` fair value araligi uretmek
5. her hisse icin `fair value confidence` seviyesini UI'da gostermek
