# Global Alpha v2 Genisleme Notlari

Bu not, Global Alpha sepetinin hangi varliklarla genisletilmesi gerektigini tanimlar.

## Ana Karar

Petrol ve bugday ayni kategoride degerlendirilmemelidir.

- `Petrol`, cekirdek Global Alpha sepetine adaydir.
- `Bugday`, ana sepetten cok makro-rejim yan gostergesi olarak daha dogrudur.

## Neden Petrol?

Petrol:

- kuresel fiyat aktariminda cok gucludur
- enflasyon, lojistik, sanayi ve enerji maliyetlerini etkiler
- hisse, endeks ve ulke risk algisini dolayli olarak tasir
- ozellikle enerji, ulasim, havacilik, rafineri, kimya gibi sektorlerde dogrudan etkilidir

Bu nedenle `Global Alpha v2` icin petrol mantikli bir ek katmandir.

Onerilen sembol:

- `CL=F` veya uygun Brent proxy

Onerilen rol:

- `cekirdek GA varligi`

## Neden Bugday Ana Sepete Uygun Degil?

Bugday:

- kuresel acidan onemli olsa da servet proxy olarak petrol kadar merkezi degildir
- daha cok gida enflasyonu ve tarim rejimi sinyali tasir
- tum hisse evreni uzerinde genel servet havuzu etkisi daha sinirlidir

Bu nedenle bugdayi ana sepete koymak yerine su rollerde kullanmak daha dogrudur:

- makro stres gostergesi
- gida enflasyonu yan gostergesi
- tarim / gida sektor filtreleri

Onerilen sembol:

- `ZW=F` veya uygun wheat futures proxy

Onerilen rol:

- `makro rejim sidecar`

## Onerilen Yeni Yapi

### Cekirdek Global Alpha

- USD
- EUR
- Altin
- Gumus
- Bitcoin
- S&P 500
- Petrol

### Makro Rejim Sidecar

- Bugday
- Dogalgaz
- Bakir
- DXY
- ABD 10Y

## Matematiksel Yorum

Cekirdek GA:

- servet, likidite ve kuresel risk sermayesi referansi verir

Makro sidecar:

- mevcut rejimin hangi yone kaydigini anlatir
- fakat ana `Hakiki Alfa` formulunun merkezine zorla sokulmaz

Bu ayrim sayesinde:

- ana sepet daha temiz kalir
- makro sinyaller kaybolmaz
- sektor bazli tahminlerde sidecar verileri ek agirlik olarak kullanilabilir

## Uygulama Onerisi

1. `GA v2` icine petrol eklensin.
2. Bugday cekirdege eklenmesin.
3. Bugday, dogalgaz ve bakir icin ayri `Makro Rejim` payload'i uretilebilsin.
4. Bazi sektorlerde sidecar sinyaller skora etkilesin:
   - TUPRS, THYAO, PGSUS: petrol
   - gida / tarim hisseleri: bugday
   - sanayi / metal: bakir

## Kisa Sonuc

- `Petrol`: evet, buyuk ihtimalle eklenmeli.
- `Bugday`: evet takip edilmeli ama ana GA sepetine degil, makro yan katmana alinmali.
