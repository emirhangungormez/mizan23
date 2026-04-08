"use client";

import * as React from "react";
import Link from "next/link";
import { useDashboardStore } from "@/store/dashboard-store";
import type { BenchmarkData, MarketAnalysisData } from "@/lib/api-client";
import { fetchBistStocksAnalysis, fetchUsStocksAnalysis, fetchCommoditiesAnalysis, fetchCryptoAnalysis, fetchFundsAnalysis, fetchFundsSummary, checkEngineHealth, fetchBatchChanges, fetchDashboardIndicators, DashboardIndicator } from "@/lib/api-client";
import { usePerformanceCalculator } from "@/hooks/use-performance-calculator";
import type { Timeframe, Portfolio } from "@/store/portfolio-store";
import {
  RefreshCw,
  CheckCircle2,
  Clock,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  TrendingUp,
  Landmark,
  Package,
  Bitcoin,
  Banknote,
  Building2,
  DollarSign,
  TrendingDown,
  GripVertical,
  Wallet,
  Target,
  Settings2,
  Info,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MacroData } from "./macro-data";
import { GlobalAlphaBar } from "./global-alpha-bar";
import { Reorder, useDragControls } from "framer-motion";
import { MathUtils } from "@/lib/math-utils";
import { useUserStore, type User } from "@/store/user-store";
import { usePortfolioStore } from "@/store/portfolio-store";
import { TechnicalSignalsWidget } from "./technical-signals-widget";
// ==========================================
// Types
// ==========================================

interface DataItem {
  symbol: string;
  name?: string;
  last: number;
  currency?: "TRY" | "USD" | "NONE";
  change?: number;
  change_percent?: number;
  p1w?: number;
  p1m?: number;
  p3m?: number;
  p6m?: number;
  volume?: number;
}

type DashboardPeriod = 'daily' | 'weekly' | 'monthly' | 'ytd' | 'yearly' | 'five_years' | 'all';

interface ComparisonItem {
  label: string;
  benchmark?: number;
  user: number;
  color: string;
  borderColor: string;
}

// Helpers
const formatCurrency = (val: number | undefined, currency: string = "TRY") => {
  if (val === undefined || val === null) return currency === "USD" ? "$0.00" : "₺0.00";
  return new Intl.NumberFormat(currency === "USD" ? 'en-US' : 'tr-TR', {
    style: 'currency',
    currency: currency === "USD" ? "USD" : "TRY"
  }).format(val);
};

const formatName = (symbol: string, name: string | undefined) => {
  if (!name || name === symbol) return symbol;
  // Strip common suffixes if needed, or just return name
  return name;
};

// ==========================================
// Status Card - Inline
// ==========================================

function StatusCard({
  label,
  value,
  icon: Icon,
  status
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  status?: "good" | "bad" | "neutral";
}) {
  const colors = {
    good: "text-emerald-500 bg-emerald-500/10",
    bad: "text-red-500 bg-red-500/10",
    neutral: "text-muted-foreground bg-muted/50"
  };

  return (
    <div className="bg-card border rounded-lg p-3 flex items-center gap-3 flex-1 min-w-0">
      <div className={cn("size-9 rounded-lg flex items-center justify-center shrink-0", colors[status || "neutral"])}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-lg font-bold truncate">{value}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
      </div>
    </div>
  );
}
const ASSET_DESCRIPTIONS: Record<string, string> = {
  // Endeksler
  "XU100": "BIST 100; Türkiye sermaye piyasalarının ana performans göstergesidir.; Endeksin yükselmesi, ülkeye yabancı sermaye girişinin arttığını ve ekonomiye genel güvenin yükseldiğini gösterir.; Sermaye çıkışı, TL varlıklara ilginin azalması ve genel bir durgunluk beklentisini simgeler.",
  "XU030": "BIST 30; Borsanın en likit ve en büyük 30 şirketini kapsayan çekirdek endekstir.; Kurumsal yatırımcı iştahının arttığını ve sanayi devlerine güvenin pekiştiğini gösterir.; Yabancı yatırımcının çekildiğini veya büyük sermaye gruplarında satış baskısı olduğunu ifade eder.",
  "XBANK": "BIST Banka; Ekonominin finansal gücünü temsil eden bankacılık sektörü performansıdır.; Kredi hacminin genişleyeceğini ve banka karlılıklarının artacağını müjdeler.; Yükselen faiz baskısını veya ekonomik yavaşlama nedeniyle borç ödeme risklerini işaret eder.",
  "XUSIN": "BIST Sınai; Üretim ve ihracat odaklı sanayi şirketlerinin karmasıdır.; İhracat gelirlerinin arttığını ve çarkların hızla döndüğünü gösterir.; Girdi maliyetlerinin arttığını veya küresel talep daralmasıyla karların azaldığını temsil eder.",
  "XU050": "BIST 50; Piyasanın en büyük 50 şirketini kapsayan derinlik endeksidir.; Yatırımın genele yayıldığını ve borsa derinliğinin arttığını gösterir.; Yatırımcıların defansa çekildiğini ve sadece en büyük hisselere odaklandığını simgeler.",
  "XUTUM": "BIST Tüm; Borsadaki tüm şirketlerin genel performansıdır.; Piyasanın tamamına yayılan bir 'boğa' coşkusunu ve güveni yansıtır.; Pazar genelinde yaygın bir durgunluk veya satış dalgasının hâkim olduğunu gösterir.",
  "^GSPC": "S&P 500; Dünyanın en büyük 500 Amerikan şirketini kapsayan küresel barometredir.; Küresel risk iştahının arttığını ve dünya piyasalarında alış rüzgarı estiğini gösterir.; Global bir resesyon korkusunu veya FED faizlerinin tüm dünyayı baskıladığını simgeler.",
  "^DJI": "Dow Jones; Geleneksel Amerikan devlerinin sanayi endeksidir.; ABD reel sektörünün sağlam olduğunu ve üretim gücünü koruduğunu ifade eder.; Endüstriyel devlerin maliyet ve talep baskısı altında olduğunu gösterir.",
  "^IXIC": "Nasdaq; Teknoloji ve inovasyonun merkez üssüdür.; Teknoloji devrimine olan inancı ve düşük faiz ortamının teknoloji hisselerini uçurduğunu belirtir.; Faiz artışlarının teknoloji yatırımlarını ve yüksek değerli şirketleri vurduğunu simgeler.",
  "^RUT": "Russell 2000; ABD yerel ekonomisinin gerçek nabzını tutan küçük şirketler endeksidir.; ABD iç piyasasının canlı olduğunu ve halkın harcama iştahını gösterir.; İç piyasada likidite sıkışıklığı ve yerel işletmelerin zorlandığını temsil eder.",

  // Döviz ve Makro
  "DXY": "Dolar Endeksi; Doların dünyadaki 6 ana para birimine karşı değeridir.; Doların küresel hakimiyetinin arttığını, emtiaları ve gelişen ülke paralarını baskıladığını gösterir.; Küresel risk iştahının arttığını ve paranın diğer varlıklara (borsa, kripto) aktığını simgeler.",
  "EUR/USD": "Euro/Dolar; Küresel ticaretin ana paritesidir.; Avrupa'nın ekonomik gücünü veya doların dünyada değer kaybettiğini gösterir.; Doların liderliğinin pekiştiğini ve küresel ticarette ABD'nin daha baskın olduğunu simgeler.",
  "USD": "Dolar/TL; Türkiye ekonomisinin en kritik maliyet göstergesidir.; İthalat maliyetlerini arttırarak enflasyonu tetikler ve şirketlerin borç yükünü zorlar.; Enflasyon baskısını azaltır ve maliyet kalemlerini düşürerek ekonomiye nefes aldırır.",
  "EUR": "Euro/TL; İhracatımızın yarısını yaptığımız Avrupa pazarının göstergesidir.; İhracatçıların TL bazında gelirini arttırırken ithal girdileri pahalılaştırır.; Avrupa talebinin zayıfladığını veya Euro'nun küresel gücünü kaybettiğini yansıtır.",
  "GBP": "Sterlin/TL; İngiltere ile olan ticari ve finansal bağların ölçüsüdür.; İngiltere ekonomisine güveni ve Sterling'in TL karşısındaki değer kazancını gösterir.; Brexit sonrası belirsizliklerin veya İngiltere ekonomik verilerinin zayıflığını fısıldar.",
  "CHF": "İsviçre Frangı; Krizlerin ve belirsizliklerin en büyük güvenli limanıdır.; Jeopolitik risklerin veya küresel korkuların arttığını gösterir.; Piyasaların huzurlu olduğunu ve yatırımcıların risk almaya başladığını simgeler.",

  // Emtialar & Madenler
  "gram-altin": "Gram Altın; Yerli yatırımcının en temel birikim ve koruma kalkanıdır.; Dolar/TL veya Ons Altın'daki yükselişle değerlenir, tasarrufları korur.; Piyasa iyimserliğinin arttığını ve paranın borsaya kaydığını ifade eder.",
  "ons-altin": "Ons Altın; Dünyanın merkeziyetsiz ve basılamayan tek değeridir.; Savaş, enflasyon ve jeopolitik krizlerde yatırımcıyı koruyan en sağlam limandır.; Küresel barış ortamını ve paranın faiz getiren varlıklara yöneldiğini simgeler.",
  "gram-gumus": "Gümüş (gr); Altına kıyasla daha spekülatif ve endüstriyel bir güvenli limandır.; Teknolojik üretim talebi ve küresel gümüş arzına göre fiyatlanır.; Sanayideki büyüme beklentilerini ve dijital dönüşüm iştahını yansıtır.",
  "BRENT": "Brent Petrol; Kuzey Denizi menşeli, deniz yoluyla taşınan ve küresel fiyatlamada ana kriter olan petroldür.; Türkiye akaryakıt fiyatlarını doğrudan belirler, cari açık ve enerji maliyetlerini yukarı iter.; Küresel arz fazlasını veya dünyada sanayi talebinin zayıfladığını simgeleyerek maliyetleri düşürür.",
  "CL": "Ham Petrol; ABD merkezli, kara yoluyla taşınan ve Teksas bölgesinden çıkan yüksek kaliteli petroldür.; ABD iç piyasasında benzin üretim maliyetlerini düşürür ve reel sektörü canlandırır.; Kaya gazı üretiminde karlılığın azaldığını ve ABD ekonomisinde yavaşlama sinyalini temsil eder.",
  "NG": "Doğalgaz; Özellikle elektrik üretimi ve hanehalkı ısınması için stratejik enerji kaynağıdır.; Isınma ve elektrik maliyetlerini fırlatır, sanayi üretiminde dışa bağımlılık baskısını artırır.; Cari dengeye olumlu yansır ve hanehalkı alım gücünü destekleyen bir maliyet düşüşü yaratır.",
  "HG": "Bakır; 'Doktor Bakır' lakaplı, küresel ekonomik büyümenin en dürüst göstergesidir.; Sanayi ve inşaat sektöründe güçlü bir genişleme olduğunu ve küresel talebin canlılığını müjdeler.; Dünya genelinde bir resesyonun veya sanayi üretiminde sert bir frenlemenin habercisidir.",
  "PL": "Platin; Özellikle otomotiv emisyon sistemleri ve lüks mücevheratın ana metalidir.; Otomotiv sektöründeki teknolojik dönüşümü ve yüksek katma değerli üretimi sembolize eder.; Sanayi talebinin zayıfladığını ve otomotiv üretim bandında yavaşlamayı haber verir.",
  // =F'li semboller (eski uyumluluk için)
  "SI=F": "Gümüş; Emtia piyasalarındaki spekülatif iştahın merkezidir.; Çok sert ve hızlı fiyat hareketleriyle yüksek getiri beklentisini simgeler.; Likidite sıkışıklığının ve riskli emtialardan çıkışın en net göstergesidir.",
  "GC=F": "Altın; Kurumsal fonların enflasyondan korunma alanıdır.; Küresel enflasyonun kalıcı olacağına dair derin bir endişeyi yansıtır.; Enflasyonun kontrol altına alınacağı inancını ve güçlü dolar iştahını simgeler.",
  "CL=F": "Ham Petrol; ABD merkezli, kara yoluyla taşınan ve Teksas bölgesinden çıkan yüksek kaliteli petroldür.; ABD iç piyasasında benzin üretim maliyetlerini düşürür ve reel sektörü canlandırır.; Kaya gazı üretiminde karlılığın azaldığını ve ABD ekonomisinde yavaşlama sinyalini temsil eder.",
  "BZ=F": "Brent Petrol; Kuzey Denizi menşeli, deniz yoluyla taşınan ve küresel fiyatlamada ana kriter olan petroldür.; Türkiye akaryakıt fiyatlarını doğrudan belirler, cari açık ve enerji maliyetlerini yukarı iter.; Küresel arz fazlasını veya dünyada sanayi talebinin zayıfladığını simgeleyerek maliyetleri düşürür.",
  "NG=F": "Doğalgaz; Özellikle elektrik üretimi ve hanehalkı ısınması için stratejik enerji kaynağıdır.; Isınma ve elektrik maliyetlerini fırlatır, sanayi üretiminde dışa bağımlılık baskısını artırır.; Cari dengeye olumlu yansır ve hanehalkı alım gücünü destekleyen bir maliyet düşüşü yaratır.",
  "HG=F": "Bakır; 'Doktor Bakır' lakaplı, küresel ekonomik büyümenin en dürüst göstergesidir.; Sanayi ve inşaat sektöründe güçlü bir genişleme olduğunu ve küresel talebin canlılığını müjdeler.; Dünya genelinde bir resesyonun veya sanayi üretiminde sert bir frenlemenin habercisidir.",
  "PL=F": "Platin; Özellikle otomotiv emisyon sistemleri ve lüks mücevheratın ana metalidir.; Otomotiv sektöründeki teknolojik dönüşümü ve yüksek katma değerli üretimi sembolize eder.; Sanayi talebinin zayıfladığını ve otomotiv üretim bandında yavaşlamayı haber verir.",
  // Türkçe isim eşlemeleri
  "Gram Altın": "Gram Altın; İç piyasadaki kuyumcu ve tasarruf fiyatıdır.; Hanehalkının refahını korumak için defansa çekildiğini gösterir.; Türk Lirası varlıklara (borsa, mevduat) olan güvenin arttığını ifade eder.",
  "Ons Altın": "Ons Altın; Küresel piyasaların 'korku barometresi'dir.; Dünya siyasetinde veya ekonomisinde bir şeylerin 'ters gittiğini' fısıldar.; Küresel stabilitenin sağlandığını ve risklerin azaldığını temsil eder.",
  "Altın": "Altın; Dünyanın en eski ve güvenilir değer saklama aracıdır.; Enflasyon ve ekonomik belirsizlik dönemlerinde tasarrufları korur.; Piyasalarda güvenin arttığını ve risk iştahının yükseldiğini gösterir.",
  "Gümüş": "Gümüş; Yeni nesil teknoloji ve güneş enerjisinin ana metalidir.; Teknolojik dönüşüme olan talebi ve yatırım iştahını simgeler.; Kısa vadeli kar realizasyonunu ve emtia piyasalarındaki geri çekilmeyi gösterir.",
  "Bakır": "Bakır; Elektrikli araçlardan inşaata kadar her alanda 'yeni petrol' olarak görülür.; Teknolojik altyapı yatırımlarının ve elektrifikasyonun hızlandığını temsil eder.; Arz fazlasını veya inşaat sektöründe küresel bir durgunluk sinyalini fısıldar.",
  "Platin": "Platin; Özellikle otomotiv emisyon sistemleri ve lüks mücevheratın ana metalidir.; Otomotiv sektöründeki teknolojik dönüşümü ve yüksek katma değerli üretimi sembolize eder.; Sanayi talebinin zayıfladığını ve otomotiv üretim bandında yavaşlamayı haber verir.",
  "Doğalgaz": "Doğalgaz; Özellikle elektrik üretimi ve hanehalkı ısınması için stratejik enerji kaynağıdır.; Isınma ve elektrik maliyetlerini fırlatır, sanayi üretiminde dışa bağımlılık baskısını artırır.; Cari dengeye olumlu yansır ve hanehalkı alım gücünü destekleyen bir maliyet düşüşü yaratır.",
  "Ham Petrol": "Ham Petrol; ABD merkezli, kara yoluyla taşınan ve Teksas bölgesinden çıkan yüksek kaliteli petroldür.; ABD iç piyasasında benzin üretim maliyetlerini düşürür ve reel sektörü canlandırır.; Kaya gazı üretiminde karlılığın azaldığını ve ABD ekonomisinde yavaşlama sinyalini temsil eder.",
  "Brent Petrol": "Brent Petrol; Kuzey Denizi menşeli, deniz yoluyla taşınan ve küresel fiyatlamada ana kriter olan petroldür.; Türkiye akaryakıt fiyatlarını doğrudan belirler, cari açık ve enerji maliyetlerini yukarı iter.; Küresel arz fazlasını veya dünyada sanayi talebinin zayıfladığını simgeleyerek maliyetleri düşürür.",
  // Büyük harfli varyantlar (eski uyumluluk için)
  "PLATIN": "Platin; Endüstriyel otomotiv devlerinin ve yatırım fonlarının hammadde tercihidir.; Küresel otomobil satışlarının ve imalat sanayiindeki kalitenin arttığını gösterir.; İmalat sanayi endekslerinde (PMI) bir daralma beklentisini yansıtır.",
  "BAKIR": "Bakır; Elektrikli araçlardan inşaata kadar her alanda 'yeni petrol' olarak görülür.; Teknolojik altyapı yatırımlarının ve elektrifikasyonun hızlandığını temsil eder.; Arz fazlasını veya inşaat sektöründe küresel bir durgunluk sinyalini fısıldar.",
  "PETROL": "Petrol; Küresel lojistik ve ulaşım sisteminin can damarı olan enerji kaynağıdır.; Tüm taşıma maliyetlerini yukarı çekerek dünya genelinde enflasyonist baskı yaratır.; Ulaşım ve lojistik giderlerini azaltarak şirket kar marjlarını ve küresel ticareti rahatlatır.",

  // Kripto Varlıklar
  "BTC": "Bitcoin; Finansal sistemin dışındaki 'Dijital Altın'dır.; Modern finansal sisteme güvenin azaldığını ve teknolojik adaptasyonu gösterir.; Paranın güvenli liman olan nakit dolara ve geleneksel varlıklara kaçışını simgeler.",
  "ETH": "Ethereum; Yeni nesil internetin ve akıllı kontratların ana ağıdır.; Blokzincir projelerinin ve merkeziyetsiz finansın (DeFi) canlandığını müjdeler.; Ağdaki işlem hacminin düştüğünü ve projelerin yavaşladığını yansıtır.",
  "SOL": "Solana; Blokzincir dünyasının en hızlı ve çevik ağıdır.; Yeni nesil uygulamaların bu teknolojiye akın ettiğini gösterir.; Rekabetin sertleştiğini veya ağ güvenliğine dair soru işaretlerini temsil eder.",
  "XRP": "Ripple; Bankalar arası global transferin hızlı köprüsüdür.; Kurumsal finansın kripto paraları benimseme hızını gösterir.; Regülatör baskılarının ve yasal belirsizliklerin yarattığı stresi simgeler.",
  "DOGE": "Dogecoin; Kripto dünyasının neşesi ve 'hype' barometresidir.; Sosyal medyadaki coşkunun ve küçük yatırımcı iştahının zirvesini temsil eder.; Spekülatif köpüğün sönmeye başladığını ve realizasyon dönemini ifade eder.",
  "BNB": "Binance Coin; Dünyanın en büyük borsa ekosisteminin yakıtıdır.; Borsa içi hacmin arttığını ve yeni arzlara (Launchpool) yoğun ilgi olduğunu gösterir.; Merkezi borsalara olan regülasyon baskılarını ve hacim daralmasını temsil eder.",

  // Fon Yönetim Şirketleri
  "İŞ PORTFÖY": "İş Portföy Yönetimi; Türkiye'nin en büyük özel portföy yönetim şirketidir.; İş Bankası güvencesiyle uzun vadeli ve istikrarlı bir yönetim anlayışı sunar.; Fonun köklü bir geçmişe ve geniş bir kurumsal altyapıya sahip olduğunu gösterir.",
  "AK PORTFÖY": "Ak Portföy Yönetimi; Yenilikçi ve tematik fonlarıyla bilinen lider şirkettir.; Teknoloji ve sürdürülebilirlik gibi global trendleri yatırımcısına anında sunar.; Modern ve vizyoner bir yatırım stratejisinin devrede olduğunu gösterir.",
  "YAPI KREDİ": "Yapı Kredi Portföy; Karma ve değişken fon yönetimi konusunda uzman bir ekibe sahiptir.; Bankacılık tecrübesini esnek ve çevik bir portföy yönetimi ile birleştirir.; Profesyonel denge ve getiri odaklı bir yönetimi temsil eder.",
  "GARANTİ": "Garanti BBVA Portföy; Türkiye'nin en geniş teknolojik altyapısına sahip kurumlarından biridir.; Bireysel ve emeklilik fonlarında büyük bir ölçek ekonomisi ve güven sunar.; Kurumsal standartlarda ve güvenli bir limanda olduğunuzu gösterir.",
  "TEB PORTFÖY": "TEB Portföy; Global dev BNP Paribas tecrübesini yerel piyasa ile birleştirir.; Uluslararası yatırım standartları ve yabancı varlık yönetiminde fark yaratır.; Dünyayı tanıyan ve global vizyonla yönetilen bir portföyü temsil eder.",
  "ZİRAAT": "Ziraat Portföy; Kamu güvencesiyle yönetilen Türkiye'nin en büyük portföy yöneticisidir.; Muhafazakar ve dengeli stratejileriyle geniş kitlelere güven aşılar.; İstikrarlı ve kamu destekli bir yönetim gücünü sembolize eder.",
  "VAKIF": "Vakıf Portföy; Kamu tecrübesi ve katılım finansı konusundaki uzmanlığıyla ön plandadır.; Kira sertifikaları ve etik yatırım ilkeleriyle yönetilen fonlarda güçlüdür.; Hassas ve güven odaklı bir yatırım anlayışını ifade eder.",
  "KUVEYT TÜRK": "Kuveyt Türk Portföy; Katılım finans ilkelerine %100 uyumlu yönetim anlayışına sahiptir.; Faizsiz finans dünyasındaki derin tecrübesini fon dünyasına yansıtır.; İslami finans prensiplerinden ödün vermeyen köklü bir yapıyı simgeler.",
  "KT PORTFÖY": "KT Portföy; Katılım finans prensipleri çerçevesinde profesyonel varlık yönetimi sunar.; Yenilikçi katılım fonlarıyla İslami finans araçlarını çeşitlendirir.; Faiz hassasiyeti olan yatırımcılar için güvenilir bir çözüm ortağıdır.",
  "QNB": "QNB Portföy; Global finans gücünü yerel piyasa analiziyle harmanlayan bir yöneticidir.; Özellikle endeks ve değişken fonlarda dinamik bir yönetim sergiler.; Küresel ağ desteğiyle profesyonel bir fon yönetimi sunar.",
  "DENİZ": "Deniz Portföy; Müşteri odaklı ve esnek yatırım stratejileriyle bilinen bir kurumdur.; Farklı varlık sınıflarında risk yönetimi odaklı bir yaklaşım benimser.; Pazar dinamiklerine hızlı uyum sağlayan bir yapısı vardır.",
  "MARMARA CAPITAL": "Marmara Capital; Butik bir başarı hikayesi ve 'Değer Yatırımı' uzmanıdır.; Şirketleri detaylı analiz ederek sadece en iyilere odaklanan bir butik anlayıştır.; Sayıdan ziyade niteliğe ve derin analize dayalı bir yönetimi gösterir.",
  "İSTANBUL PORTFÖY": "İstanbul Portföy; Bağımsız yapısıyla borsa endeksini yenme başarısı üzerine odaklanır.; Banka dışı en büyük bağımsız yapı olması sayesinde daha çevik kararlar alabilir.; Getiri odaklı ve borsa dinamiklerine çok hakim bir yönetimi temsil eder.",
  "AZİMUT": "Azimut Portföy; Global tecrübeyi Türkiye piyasasına entegre eden İtalyan kökenli devdir.; Avrupa standartlarında bir varlık yönetimi ve çok geniş bir fon yelpazesi sunar.; Küresel bir vizyonla Türkiye pazarında fırsat arayan profesyonel bir güçtür.",

  // Fon Tiplerine Göre Tanımlar
  "Para Piyasası": "Para Piyasası Fonu; Mevduat benzeri, günlük kazanç sağlayan düşük riskli fondur.; Faizlerin cazip olduğu dönemlerde nakit koruması ve günlük neta sağlar.; Paranın borsa veya altın gibi daha yüksek riskli alanlara kayması gerektiğini gösterir.",
  "Hisse Senedi": "Hisse Senedi Fonu; Borsa İstanbul'un büyümesine doğrudan ortak olan yönetim türüdür.; Şirket karlılıklarına ve ülkenin kalkınmasına olan güçlü inancı simgeler.; Piyasada kar satışı beklentisini veya ekonomik yavaşlama darbesini yansıtır.",
  "Kıymetli Madenler": "Kıymetli Madenler Fonu; Altın ve gümüş ağırlıklı, enflasyona duyarlı varlık sepetidir.; Kur artışı ve enflasyona karşı portföyün defans hattını oluşturur.; Dünya genelinde faizlerin yükseldiğini ve emtiaların baskı altında kaldığını gösterir.",
  "Katılım": "Katılım Fonu; Faizsiz finans ilkeleriyle yönetilen hassas yatırım türüdür.; Helal kazanç odaklı kira sertifikaları ve etik hisse senetlerine yatırım yapar.; Faizsiz piyasa talebinin ve bu alandaki yatırımcı bilincinin arttığını gösterir.",
  "Değişken": "Değişken Fon; Yatırım uzmanının piyasa şartlarına göre aktif varlık değiştirdiği stratejidir.; Sizin yerinize en iyi varlığı (altın, borsa vb.) seçen profesyonel bir yaklaşımdır.; Stratejinin piyasa dalgalarına karşı koruma sağlama gücünü temsil eder.",
  "Eurobond": "Eurobond Fonu; Döviz bazlı borçlanma araçlarına (tahviller) yatırım yapan türdür.; Dolar/Euro getirisi sağlarken aynı zamanda Türkiye risk priminden (CDS) beslenir.; Türkiye'nin borçlanma iştahını ve döviz getirisi arayışını simgeler.",
  "Altın Fonu": "Altın Fonu; Fiziki altın veya altın dayanaklı varlıklara yatırım yapan fondur.; Enflasyona ve TL değer kaybına karşı güçlü koruma sağlar.; Altın fiyatlarındaki düşüşlerden doğrudan etkilenir.",
  "Borçlanma": "Borçlanma Araçları Fonu; Devlet ve şirket tahvillerine yatırım yapan sabit getirili fondur.; Faiz ortamının yüksek olduğu dönemlerde stabil ve öngörülebilir getiri sağlar.; Faizlerin düşmesiyle değer kazanır, yükselmesiyle kayıp yaşatabilir.",
  "Borçlanma Araçları": "Borçlanma Araçları Fonu; Devlet ve şirket tahvillerine yatırım yapan sabit getirili fondur.; Faiz ortamının yüksek olduğu dönemlerde stabil ve öngörülebilir getiri sağlar.; Faizlerin düşmesiyle değer kazanır, yükselmesiyle kayıp yaşatabilir.",
  "Serbest": "Serbest Fon; Esnek yatırım stratejisi ile farklı varlık sınıflarına yatırım yapan fondur.; Piyasa koşullarına göre hızlı pozisyon değiştirme kabiliyeti sunar.; Yüksek risk-getiri profiline sahip, volatil piyasalarda kayıp yaşatabilir.",
  "Karma": "Karma Fon; Hisse, tahvil ve diğer varlıkları bir arada tutan dengeli fondur.; Çeşitlendirilmiş yapısı sayesinde risk dağılımı sağlar.; Tek bir varlık sınıfındaki rallileri tam yakalayamayabilir.",
  "Fon Sepeti": "Fon Sepeti; Birden fazla fona yatırım yaparak ultra-çeşitlendirme sağlayan fondur.; Profesyonel fon seçimi ile en iyi fonlara dolaylı erişim sunar.; Yönetim maliyeti katmanları nedeniyle getiri kaybı yaşanabilir.",
  "Kira Sertifikası": "Kira Sertifikası Fonu; İslami finans prensiplerine uygun sukuk yatırımı yapan fondur.; Faizsiz gelir arayan yatırımcılar için etik ve helal bir alternatif sunar.; Sukuk piyasasındaki likidite sıkışıklığından etkilenebilir.",
  "Sukuk": "Sukuk Fonu; Kira sertifikalarına yatırım yapan faiz hassasiyetli fondur.; İslami finans ilkelerine bağlı kalarak düzenli gelir hedefler.; Piyasa likiditesi ve sukuk arzındaki değişimlerden etkilenir.",

  // Popüler Fon Kodları ve Tam İsimleri
  "YHZ": "YHZ - Yapı Kredi Portföy BIST Teknoloji Ağ. Hisse Senedi Fonu; Yerli teknoloji şirketlerine ve yazılım devlerine yatırım yapar.; Teknoloji sektöründeki inovasyon ve dijitalleşme hızıyla değer kazanır.; Sektörel daralmalar ve teknoloji hisselerindeki volatiliteden etkilenir.",
  "TTE": "TTE - İş Portföy BIST Teknoloji Ağ. Hisse Senedi Fonu; Borsa İstanbul'daki teknoloji ve bilişim şirketlerine odaklanan bir fondur.; Teknoloji endeksindeki yükseliş ve dijital dönüşüm projeleriyle beslenir.; Teknoloji hisselerindeki kar satışları ve yüksek faiz ortamından olumsuz etkilenir.",
  "AES": "AES - Ak Portföy Avrupa Yabancı Hisse Senedi Fonu; Avrupa'nın en büyük ve köklü şirketlerine (LVMH, SAP, ASML vb.) yatırım yapar.; Döviz bazlı getiri ve Avrupa ekonomisindeki toparlanma ile yükselir.; Euro/TL paritesindeki düşüş ve Avrupa piyasalarındaki durgunluk riskidir.",
  "GMI": "GMI - Azimut Portföy G-20 Ülkeleri Yabancı Hisse Senedi Fonu; G20 ülkelerinin dev şirketlerine yatırım yaparak küresel çeşitlendirme sağlar.; Küresel büyüme ve dünya piyasalarındaki pozitif hava ile getiri sunar.; Küresel resesyon korkusu ve gelişmiş ülke piyasalarındaki satışlardan etkilenir.",
  "RBH": "RBH - Albatros Portföy Katılım Hisse Senedi Fonu; Faizsiz finans ilkelerine uygun seçilmiş katılım hisselerine yatırım yapar.; Sorumlu yatırım ve helal kazanç odaklı bir büyüme stratejisi izler.; Katılım endeksindeki genel düşüş ve piyasa likidite sorunlarından etkilenir.",
  "MAC": "MAC - Marmara Capital Portföy Hisse Senedi Fonu; Değer yatırımı odaklı, derin analizle seçilmiş hisselere yatırım yapar.; Seçici ve yoğunlaştırılmış portföy yapısıyla endeks üzeri getiri hedefler.; Seçilen hisselerdeki spesifik riskler ve BIST genel düşüşü etkileyicidir.",
  "IDH": "IDH - İstanbul Portföy İhracatçı Şirketler Hisse Senedi Fonu; Gelirlerinin büyük kısmı döviz olan ihracatçı dev şirketlerine yatırım yapar.; Döviz kurlarındaki artış ve ihracat kanallarındaki büyüme ile güçlenir.; Küresel ticaretteki yavaşlama ve kur stagnasyonundan olumsuz etkilenebilir.",
  "KPV": "KPV - Kuveyt Türk Portföy Katılım Serbest Fon; Faizsiz finans prensiplerine uygun, esnek ve katılım odaklı bir strateji izler.; Katılım bankacılığı güvencesiyle döviz ve kira sertifikası getirisi harmanlanır.; Faizsiz piyasa araçlarındaki arz kısıtı ve döviz baskısından etkilenebilir.",
  "KTF": "KTF - Kuveyt Türk Portföy Kısa Vadeli Kira Sertifikaları Katılım Fonu; Hazine ve özel sektör kira sertifikalarına (sukuk) yatırım yapan likit bir fondur.; Mevduata alternatif, düşük riskli ve faizsiz düzenli getiri hedefler.; Sukuk piyasasındaki likidite dalgalanmaları ve kar payı oranlarındaki düşüşten etkilenir.",
  "ZPF": "ZPF - Ziraat Portföy Katılım Endeksi Hisse Senedi Fonu; BIST Katılım Endeksi'ndeki dev şirketlerin büyümesine ortak olan bir fondur.; Kamu bankası güvencesiyle seçilen helal kazanç odaklı hisselerden beslenir.; Katılım endeksi genelindeki sert satışlar ve makro ekonomik yavaşlamadan etkilenir.",
  "KPF": "KPF - Kuveyt Türk Portföy Katılım Hisse Senedi Fonu; Katılım finans prensiplerine uygun yüksek potansiyelli hisse senetlerine odaklanır.; Aktif yönetimle piyasadan pozitif ayrışan katılım hisselerini portföye dahil eder.; Hisse senedi piyasasının genel volatilitesi ve sektörel risklerden korunma ihtiyacı duyar.",
  "KZL": "KZL - Kuveyt Türk Portföy Altın Katılım Fonu; Portföyünün tamamını altın ve altına dayalı kira sertifikalarında değerlendirir.; Hem altın fiyat artışından hem de kira sertifikası getirisinden çifte kazanç hedefler.; Ons altın fiyatlarındaki düşüş ve Dolar/TL kurundaki gerilemeden doğrudan etkilenir.",
  "MPS": "MPS - Mükafat Portföy Katılım Hisse Senedi Fonu; Faizsiz finansal kriterlere tam uyumlu şirketlerin hisselerine yatırım yapan butik bir fondur.; Nitelikli hisse seçimiyle uzun vadeli sermaye kazancı ve helal getiri vizyonu taşır.; Borsa İstanbul'daki hacim daralması ve katılım dışı kalan sektör kısıtlamaları getiri potansiyelini sınırlayabilir.",
};

function AssetRow({
  item,
  dragHandle,
  onHover,
  changeOverride,
  currency = "TRY"
}: {
  item: DataItem;
  dragHandle?: React.ReactNode;
  onHover: (desc: string | null) => void;
  changeOverride?: number | null;
  currency?: "TRY" | "USD";
}) {
  const changePercent = changeOverride === null ? null : (changeOverride !== undefined ? changeOverride : (item.change_percent ?? 0));
  const isPositive = typeof changePercent === "number" && changePercent > 0;
  const isNegative = typeof changePercent === "number" && changePercent < 0;
  const isNeutral = changePercent === null || changePercent === 0;

  const normalizeTurkish = (str: string) =>
    str.replace(/İ/g, 'i').replace(/I/g, 'ı').replace(/ı/g, 'i').toLowerCase();

  const itemNameNorm = normalizeTurkish(item.name || "");
  const itemSymbolNorm = normalizeTurkish(item.symbol || "");

  let description = (item.symbol ? ASSET_DESCRIPTIONS[item.symbol] : "") ||
    (item.symbol ? ASSET_DESCRIPTIONS[item.symbol.replace(".IS", "")] : "") ||
    (item.name ? ASSET_DESCRIPTIONS[item.name] : "") || "";

  // Fuzzy matching for Commodities and others if no direct match
  if (!description) {
    for (const [key, desc] of Object.entries(ASSET_DESCRIPTIONS)) {
      const keyNorm = normalizeTurkish(key);
      if (itemNameNorm.includes(keyNorm) || itemSymbolNorm.includes(keyNorm)) {
        description = desc;
        break;
      }
    }
  }

  // SPECIAL HANDLING FOR FUNDS: Build a deep, custom explanation
  const isFund =
    item.symbol.length === 3 ||
    itemNameNorm.includes('fon') ||
    itemSymbolNorm.includes('fon') ||
    item.symbol.includes('TRY');

  if (isFund) {
      let mGen = ""; let mRise = ""; let mFall = "";
      let tGen = ""; let tRise = ""; let tFall = "";

      // 1. Detect Manager (More aggressive search)
      const managers = ["İŞ PORTFÖY", "AK PORTFÖY", "YAPI KREDİ", "GARANTİ", "TEB PORTFÖY", "ZİRAAT", "VAKIF", "KUVEYT TÜRK", "KT PORTFÖY", "QNB", "DENİZ", "MARMARA CAPITAL", "İSTANBUL PORTFÖY", "AZİMUT"];
      for (const m of managers) {
        if (itemNameNorm.includes(normalizeTurkish(m)) || itemSymbolNorm.includes(normalizeTurkish(m))) {
          const descText = ASSET_DESCRIPTIONS[m] || "";
          const parts = descText.split(';');
          if (parts.length >= 3) {
            mGen = parts[1] || parts[0];
            mRise = parts[2] || "";
            mFall = parts[3] || "";
          }
          break;
        }
      }

      // 2. Detect Type (More aggressive search)
      const types = ["Para Piyasası", "Hisse Senedi", "Kıymetli Madenler", "Değişken", "Katılım", "Altın", "Borçlanma", "Serbest", "Karma", "Eurobond", "Kira Sertifikası", "Sukuk"];
      for (const t of types) {
        if (itemNameNorm.includes(normalizeTurkish(t)) || itemSymbolNorm.includes(normalizeTurkish(t))) {
          const descText = ASSET_DESCRIPTIONS[t] || "";
          const parts = descText.split(';');
          if (parts.length >= 3) {
            tGen = parts[1] || parts[0];
            tRise = parts[2] || "";
            tFall = parts[3] || "";
          }
          break;
        }
      }

      const title = item.name || item.symbol;
      const isParticipation = itemNameNorm.includes('katilim') || itemNameNorm.includes('kira') || itemNameNorm.includes('sukuk');

      // Check if we already have a detailed description from the code mapping
      const isDescriptionDetailed = description && description.split(';').length >= 3;

      if (!isDescriptionDetailed) {
        // Construct dynamic description only if we don't have a specific one
        const finalDesc = `${mGen || "Uzman portföy yönetimi"} aracılığıyla ${tGen || "stratejik varlık"} odaklı yönetilen bir yatırım fonudur. ${isParticipation ? "Faizsiz finans prensiplerine tam uyum gözetilmektedir." : "Varlık dağılımı piyasa dinamiklerine göre aktif olarak optimize edilir."}`;
        const finalRise = tRise || mRise || "Dayanak varlık performansının artması ve piyasa iştahının yükselmesiyle fon değeri olumlu etkilenir.";
        const finalFall = tFall || mFall || "Küresel volatilite, varlık fiyatlarındaki düzeltme ve likidite sıkışıklığı fon üzerinde baskı oluşturabilir.";

        description = `${title}; ${finalDesc}; ${finalRise}; ${finalFall}`;
      } else {
        // If it's detailed but was found via generic matching, ensure title is correct
        const parts = description.split(';');
        if (parts.length >= 4) {
          // It's already in the correct 4-part format
        } else {
          // Re-format if needed, but for our mappings it should be fine
        }
      }
  }

  return (
    <div
      className={cn(
        "flex items-center rounded group select-none relative transition-all",
        isPositive && "hover:bg-emerald-500/10",
        isNegative && "hover:bg-rose-500/10",
        isNeutral && "hover:bg-muted/50"
      )}
      onMouseEnter={() => description && onHover(description)}
    >
      <div className={cn(
        "absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full opacity-0 transition-opacity group-hover:opacity-100",
        isPositive && "bg-emerald-400",
        isNegative && "bg-rose-400",
        isNeutral && "bg-muted-foreground/30"
      )} />
      {dragHandle}
      <div className="flex-1 flex items-center min-w-0 px-2 py-1.5 gap-2">
        {/* Name Area - Full width priority */}
        <Link
          href={`/market/${item.symbol}`}
          className="flex-1 min-w-0 cursor-pointer overflow-hidden"
        >
          <p className={cn(
            "font-medium text-[13px] transition-colors truncate",
            isPositive && "group-hover:text-emerald-700 dark:group-hover:text-emerald-300",
            isNegative && "group-hover:text-rose-700 dark:group-hover:text-rose-300",
            isNeutral && "group-hover:text-primary"
          )}>
            {item.name || item.symbol}
          </p>
        </Link>

        {/* Price Area */}
        <Link
          href={`/market/${item.symbol}`}
          className="shrink-0 cursor-pointer"
        >
          <p className="text-[13px] font-medium font-mono tabular-nums text-right">
            {topLevelFormatCurrency(item.last, (item.currency as "TRY" | "USD") || currency)}
          </p>
        </Link>

        {/* Change Area - Tightened */}
        <Link
          href={`/market/${item.symbol}`}
          className="shrink-0 cursor-pointer"
        >
          <div className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold min-w-[56px] justify-center tabular-nums border transition-all",
            isPositive && "text-emerald-700 dark:text-emerald-200 bg-emerald-500/12 dark:bg-emerald-500/20 border-emerald-500/35",
            isNegative && "text-rose-700 dark:text-rose-200 bg-rose-500/12 dark:bg-rose-500/20 border-rose-500/35",
            isNeutral && "text-muted-foreground bg-muted/30 border-border/50"
          )}>
            <span>
              {changePercent === null ? "--" : `${isPositive ? "+" : ""}${changePercent.toFixed(1)}%`}
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}

// Add a helper since formatCurrency is defined inside the file scope but we need it here
function topLevelFormatCurrency(val: number | undefined, currency: string = "TRY") {
  if (typeof val !== 'number') return '---';

  if (currency === "NONE") {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(val);
  }

  // Use Intl.NumberFormat for robust currency formatting
  try {
    return new Intl.NumberFormat(currency === "USD" ? 'en-US' : 'tr-TR', {
      style: 'currency',
      currency: currency === "USD" || currency === "TRY" ? currency : "TRY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  } catch (e) {
    // Fallback if currency code is invalid
    const isUSD = currency === "USD";
    const formatted = val.toLocaleString(isUSD ? 'en-US' : 'tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return isUSD ? `$${formatted}` : (currency === "TRY" ? `₺${formatted}` : formatted);
  }
}

function shortenInsight(text: string, maxLength: number = 88) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trimEnd()}...`;
}

function SharedMarketInsight({ insight }: { insight: string | null }) {
  if (!insight) {
    return (
      <div className="border rounded-xl bg-card p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Info className="size-4" />
          <p className="text-sm font-medium">{"Detayı görmek için piyasa takibi alanında bir varlığın üstüne gel."}</p>
        </div>
      </div>
    );
  }

  const parts = insight.split(";").map((s) => s.trim()).filter(Boolean);
  let title = "Varl\u0131k";
  let desc = "";
  let rise = "";
  let fall = "";

  if (parts.length >= 4) {
    [title, desc, rise, fall] = parts;
  } else {
    [desc, rise, fall] = parts;
  }

  return (
    <div className="border rounded-xl bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 border-b pb-3">
        <Info className="size-4 text-primary" />
        <p className="text-sm font-semibold">{title}</p>
      </div>

      <p className="text-sm leading-6 text-foreground">
        {shortenInsight(desc, 180)}
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <ArrowUpRight className="size-3" />
            Pozitif Senaryo
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {rise ? shortenInsight(rise, 130) : "Belirgin bir pozitif senaryo bilgisi yok."}
          </p>
        </div>

        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">
            <ArrowDownRight className="size-3" />
            Risk
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {fall ? shortenInsight(fall, 130) : "Belirgin bir risk bilgisi yok."}
          </p>
        </div>
      </div>
    </div>
  );
}

function SortableAssetRow({
  item,
  onHover,
  isDraggingGroup,
  changeOverride,
  currency = "TRY"
}: {
  item: DataItem;
  onHover: (desc: string | null) => void;
  isDraggingGroup: boolean;
  changeOverride?: number | null;
  currency?: "TRY" | "USD";
}) {
  const controls = useDragControls();
  const [isDragging, setIsDragging] = React.useState(false);

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      className={cn(
        "relative rounded transition-colors",
        isDragging ? "bg-muted z-50 scale-[1.02]" : "hover:bg-muted/30"
      )}
    >
      <AssetRow
        item={item}
        changeOverride={changeOverride}
        currency={currency}
        onHover={(desc) => {
          if (!isDragging && !isDraggingGroup) {
            onHover(desc);
          }
        }}
        dragHandle={
          <div
            onPointerDown={(e) => controls.start(e)}
            className="pl-2 pr-0 cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-muted-foreground transition-colors touch-none py-2"
          >
            <GripVertical size={14} />
          </div>
        }
      />
    </Reorder.Item>
  );
}

function SortableWidget({
  id,
  children
}: {
  id: string;
  children: React.ReactElement<{ groupDragHandle?: React.ReactNode }>;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      className="min-h-0 self-start select-none"
      whileDrag={{ zIndex: 40 }}
    >
      {React.cloneElement(children, {
        groupDragHandle: (
          <button
            type="button"
            onPointerDown={(e) => controls.start(e)}
            className="flex size-5 shrink-0 items-center justify-center rounded border border-border/60 text-muted-foreground/70 transition-colors hover:text-foreground touch-none select-none cursor-grab active:cursor-grabbing"
            aria-label={"Kart\u0131 ta\u015f\u0131"}
          >
            <GripVertical className="size-3.5" />
          </button>
        )
      })}
    </Reorder.Item>
  );
}

// ==========================================
// Soft Color Palette for Card Customization
// ==========================================

const SOFT_COLORS = [
  { name: "default", bg: "bg-muted/30", border: "border-border", text: "text-foreground" },
  { name: "rose", bg: "bg-rose-50 dark:bg-rose-950/30", border: "border-rose-300 dark:border-rose-800", text: "text-rose-900 dark:text-rose-200" },
  { name: "amber", bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-300 dark:border-amber-800", text: "text-amber-900 dark:text-amber-200" },
  { name: "lime", bg: "bg-lime-50 dark:bg-lime-950/30", border: "border-lime-300 dark:border-lime-800", text: "text-lime-900 dark:text-lime-200" },
  { name: "cyan", bg: "bg-cyan-50 dark:bg-cyan-950/30", border: "border-cyan-300 dark:border-cyan-800", text: "text-cyan-900 dark:text-cyan-200" },
  { name: "violet", bg: "bg-violet-50 dark:bg-violet-950/30", border: "border-violet-300 dark:border-violet-800", text: "text-violet-900 dark:text-violet-200" },
  { name: "pink", bg: "bg-pink-50 dark:bg-pink-950/30", border: "border-pink-300 dark:border-pink-800", text: "text-pink-900 dark:text-pink-200" },
  { name: "sky", bg: "bg-sky-50 dark:bg-sky-950/30", border: "border-sky-300 dark:border-sky-800", text: "text-sky-900 dark:text-sky-200" },
];

function ColorPicker({
  selectedColor,
  onColorChange
}: {
  selectedColor: string;
  onColorChange: (color: string) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-4 h-4 rounded-full border-2 border-white/50 hover:scale-110 transition-transform"
        style={{
          background: selectedColor === "default" ? "var(--muted)" :
            selectedColor === "rose" ? "#fecdd3" :
              selectedColor === "amber" ? "#fde68a" :
                selectedColor === "lime" ? "#bef264" :
                  selectedColor === "cyan" ? "#67e8f9" :
                    selectedColor === "violet" ? "#c4b5fd" :
                      selectedColor === "pink" ? "#f9a8d4" :
                        selectedColor === "sky" ? "#7dd3fc" : "var(--muted)"
        }}
        title="Kart rengini değiştir"
      />
      {isOpen && (
        <div
          className="absolute left-0 top-6 z-50 bg-popover border rounded-lg p-2 flex gap-1.5 animate-in fade-in zoom-in-95"
          onMouseLeave={() => setIsOpen(false)}
        >
          {SOFT_COLORS.map((color) => (
            <button
              key={color.name}
              onClick={() => {
                onColorChange(color.name);
                setIsOpen(false);
              }}
              className={cn(
                "w-5 h-5 rounded-full border-2 transition-all hover:scale-110",
                color.name === selectedColor ? "ring-2 ring-primary ring-offset-1" : "",
                color.name === "default" ? "bg-muted border-border" : "",
                color.name === "rose" ? "bg-rose-200 border-rose-300" : "",
                color.name === "amber" ? "bg-amber-200 border-amber-300" : "",
                color.name === "lime" ? "bg-lime-200 border-lime-300" : "",
                color.name === "cyan" ? "bg-cyan-200 border-cyan-300" : "",
                color.name === "violet" ? "bg-violet-200 border-violet-300" : "",
                color.name === "pink" ? "bg-pink-200 border-pink-300" : "",
                color.name === "sky" ? "bg-sky-200 border-sky-300" : ""
              )}
              title={color.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const AssetGroup = React.memo(function AssetGroup({
  id,
  title,
  icon: Icon,
  items,
  iconColor,
  groupDragHandle,
  selectedPeriod,
  currentUser,
  onInsightChange,
  externalDragging,
  currency = "TRY"
}: {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: DataItem[];
  iconColor: string;
  groupDragHandle?: React.ReactNode;
  selectedPeriod: DashboardPeriod;
  currentUser: User | null;
  onInsightChange: (desc: string | null) => void;
  externalDragging?: boolean;
  currency?: "TRY" | "USD";
}) {
  const [mounted, setMounted] = React.useState(false);
  const [isStorageLoaded, setIsStorageLoaded] = React.useState(false);

  // Clear hovered description if card starts dragging
  React.useEffect(() => {
    if (externalDragging) {
      onInsightChange(null);
    }
  }, [externalDragging, onInsightChange]);

  // We keep track of the order of symbols
  const [orderedSymbols, setOrderedSymbols] = React.useState<string[]>([]);
  // Card color state
  const [cardColor, setCardColor] = React.useState("default");
  const [periodChanges, setPeriodChanges] = React.useState<Record<string, number>>({});
  const [resolvedPeriod, setResolvedPeriod] = React.useState<string | null>(null);
  const [isLoadingPeriod, setIsLoadingPeriod] = React.useState(false);
  // Cache Ref for instant switching
  const cacheRef = React.useRef<Record<string, Record<string, number>>>({});

  // Stable User ID (fallback to guest)
  const userId = React.useMemo(() => currentUser?.id || 'guest', [currentUser?.id]);

  // Load initial order and color on mount
  React.useEffect(() => {
    setMounted(true);

    // Load Order
    try {
      const storageKey = `dashboard_group_order_${userId}_${id}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOrderedSymbols(parsed);
        }
      }
    } catch (e) { console.error(e); }

    // Load card color
    try {
      const colorKey = `dashboard_card_color_${userId}_${id}`;
      const savedColor = localStorage.getItem(colorKey);
      if (savedColor) setCardColor(savedColor);
    } catch (e) { console.error(e); }

    setIsStorageLoaded(true);
  }, [userId, id]);

  // Memoize symbols to prevent unnecessary re-fetches when items reference changes but symbols don't
  const symbolString = React.useMemo(() => items.map(i => i.symbol).join(','), [items]);
  const marketPeriod = React.useMemo(() => {
    switch (selectedPeriod) {
      case 'weekly': return '1w';
      case 'monthly': return '1m';
      case 'ytd': return 'ytd';
      case 'yearly': return '1y';
      case 'five_years': return '5y';
      case 'all': return '1d';
      default: return '1d';
    }
  }, [selectedPeriod]);

  const marketPeriodLabel = React.useMemo(() => {
    switch (selectedPeriod) {
      case 'daily': return 'Gün';
      case 'weekly': return 'Hafta';
      case 'monthly': return 'Ay';
      case 'ytd': return 'YTD';
      case 'yearly': return 'Yıl';
      case 'five_years': return '5 Yıl';
      case 'all': return 'Tümü';
      default: return 'Gün';
    }
  }, [selectedPeriod]);

  const displayMarketPeriodLabel = React.useMemo(() => {
    switch (selectedPeriod) {
      case 'daily': return 'Gün';
      case 'weekly': return 'Hafta';
      case 'monthly': return 'Ay';
      case 'ytd': return 'YTD';
      case 'yearly': return 'Yıl';
      case 'five_years': return '5 Yıl';
      case 'all': return 'Tümü';
      default: return 'Gün';
    }
  }, [selectedPeriod]);

  void marketPeriodLabel;

  // Fetch period changes
  React.useEffect(() => {
    if (!mounted || items.length === 0) return;
    let cancelled = false;

    // 1. Always ensure '1d' is in cache from current items
    const dayMap: Record<string, number> = {};
    items.forEach(i => { dayMap[i.symbol] = i.change_percent || 0; });
    cacheRef.current["1d"] = dayMap;

    if (marketPeriod === "1d") {
      setPeriodChanges(dayMap);
      setResolvedPeriod("1d");
      setIsLoadingPeriod(false);
      return;
    }

    // Instant switch if cached
    if (cacheRef.current[marketPeriod]) {
      setPeriodChanges(cacheRef.current[marketPeriod]);
      setResolvedPeriod(marketPeriod);
      setIsLoadingPeriod(false);
      return;
    }

    setPeriodChanges({});
    setResolvedPeriod(null);
    setIsLoadingPeriod(true);

    const loadChanges = async () => {
      try {
        const symbols = items.map(i => i.symbol);
        const data = await fetchBatchChanges(symbols, marketPeriod);
        if (cancelled) return;

        const changeMap: Record<string, number> = {};
        data.results.forEach(r => {
          if (r.symbol) {
            changeMap[r.symbol.toLowerCase()] = r.change_percent;
            changeMap[r.symbol] = r.change_percent;
          }
        });

        const finalMap: Record<string, number> = {};
        items.forEach(item => {
          const sym = item.symbol;
          const symLower = sym.toLowerCase();
          if (changeMap[sym] !== undefined) {
            finalMap[sym] = changeMap[sym];
          } else if (changeMap[symLower] !== undefined) {
            finalMap[sym] = changeMap[symLower];
          }
        });

        if (cancelled) return;
        cacheRef.current[marketPeriod] = finalMap;
        setPeriodChanges(finalMap);
        setResolvedPeriod(marketPeriod);
      } catch (e) {
        if (cancelled) return;
        console.error(`[AssetGroup ${id}] Failed to fetch period changes:`, e);
        setPeriodChanges({});
        setResolvedPeriod(null);
      } finally {
        if (cancelled) return;
        setIsLoadingPeriod(false);
      }
    };

    loadChanges();
    return () => {
      cancelled = true;
    };
  }, [marketPeriod, symbolString, mounted, id, items]);

  // Sync new items (Only after storage is loaded)
  React.useEffect(() => {
    if (!mounted || !isStorageLoaded) return;

    // If we have no ordered symbols yet (first run for a new user/guest),
    // just initialize with the current item order.
    if (orderedSymbols.length === 0) {
      setOrderedSymbols(items.map(i => i.symbol));
      return;
    }

    const currentSymbolSet = new Set(orderedSymbols);
    const newSymbols = items.map(i => i.symbol).filter(s => !currentSymbolSet.has(s));

    if (newSymbols.length > 0) {
      setOrderedSymbols(prev => [...prev, ...newSymbols]);
    }
  }, [items, mounted, isStorageLoaded]); // We do want this to run when items change

  // Handle color change
  const handleColorChange = (color: string) => {
    setCardColor(color);
    try {
      const colorKey = `dashboard_card_color_${userId}_${id}`;
      localStorage.setItem(colorKey, color);
    } catch (e) { }
  };


  const colorConfig = SOFT_COLORS.find(c => c.name === cardColor) || SOFT_COLORS[0];

  const displayItems = React.useMemo(() => {
    if (items.length === 0) return [];

    const itemMap = new Map(items.map(i => [i.symbol, i]));
    const result: DataItem[] = [];
    const seen = new Set<string>();

    orderedSymbols.forEach(sym => {
      const item = itemMap.get(sym);
      if (item) {
        result.push(item);
        seen.add(sym);
      }
    });

    // Append any items that are present in data but not in our order list
    items.forEach(item => {
      if (!seen.has(item.symbol)) {
        result.push(item);
      }
    });

    return result;
  }, [orderedSymbols, items]);

  const displaySummary = React.useMemo(() => {
    const resolvedRows = displayItems.map((item) => {
      const resolvedChange =
        marketPeriod === "1d"
          ? periodChanges[item.symbol]
          : resolvedPeriod === marketPeriod && !isLoadingPeriod
            ? (periodChanges[item.symbol] ?? null)
            : null;

      return {
        symbol: item.symbol,
        name: item.name || item.symbol,
        change: typeof resolvedChange === "number" ? resolvedChange : item.change_percent ?? null,
      };
    });

    const rowsWithChange = resolvedRows.filter((row) => typeof row.change === "number") as Array<{
      symbol: string;
      name: string;
      change: number;
    }>;

    if (rowsWithChange.length === 0) {
      return {
        positiveCount: 0,
        negativeCount: 0,
        totalCount: displayItems.length,
        avgChange: null as number | null,
        leader: null as { symbol: string; name: string; change: number } | null,
      };
    }

    const positiveCount = rowsWithChange.filter((row) => row.change > 0).length;
    const negativeCount = rowsWithChange.filter((row) => row.change < 0).length;
    const avgChange = rowsWithChange.reduce((sum, row) => sum + row.change, 0) / rowsWithChange.length;
    const leader = rowsWithChange
      .slice()
      .sort((left, right) => right.change - left.change)[0] || null;

    return {
      positiveCount,
      negativeCount,
      totalCount: rowsWithChange.length,
      avgChange,
      leader,
    };
  }, [displayItems, isLoadingPeriod, marketPeriod, periodChanges, resolvedPeriod]);

  const handleReorder = (newOrder: DataItem[]) => {
    const newSymbols = newOrder.map(i => i.symbol);
    setOrderedSymbols(newSymbols);
    try {
      const storageKey = `dashboard_group_order_${userId}_${id}`;
      localStorage.setItem(storageKey, JSON.stringify(newSymbols));
    } catch (e) { }
  };

  return (
    <div className="border rounded-xl bg-card overflow-hidden flex-1 min-w-[180px] h-[21.5rem] min-h-[21.5rem] max-h-[21.5rem] flex flex-col transition-colors select-none">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50 shrink-0 bg-transparent">
        {groupDragHandle}
        <Icon className={cn("size-4 shrink-0", iconColor)} />
        <h3 className="text-sm font-medium tracking-tight truncate flex-1 text-foreground">
          {title}
        </h3>

        <span className="rounded border border-border/70 bg-background px-2 py-0.5 text-[10px] uppercase font-medium tracking-wide text-muted-foreground">
          {displayMarketPeriodLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-2 text-[11px]">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
          <span>
            Pozitif <span className="font-medium text-foreground">{displaySummary.positiveCount}/{displaySummary.totalCount}</span>
          </span>
          <span>
            Negatif <span className="font-medium text-foreground">{displaySummary.negativeCount}</span>
          </span>
          <span className={cn(
            "font-mono font-medium",
            displaySummary.avgChange == null
              ? "text-muted-foreground"
              : displaySummary.avgChange > 0
                ? "text-emerald-600"
                : displaySummary.avgChange < 0
                  ? "text-rose-600"
                  : "text-muted-foreground"
          )}>
            Ort {displaySummary.avgChange == null ? "-" : `${displaySummary.avgChange > 0 ? "+" : ""}${displaySummary.avgChange.toFixed(1)}%`}
          </span>
        </div>
        <div className="min-w-0 truncate text-right text-muted-foreground">
          {displaySummary.leader ? (
            <span>
              Öne çıkan <span className="font-medium text-foreground">{displaySummary.leader.symbol}</span>{" "}
              <span className={cn(
                "font-mono font-medium",
                displaySummary.leader.change > 0
                  ? "text-emerald-600"
                  : displaySummary.leader.change < 0
                    ? "text-rose-600"
                    : "text-muted-foreground"
              )}>
                {displaySummary.leader.change > 0 ? "+" : ""}
                {displaySummary.leader.change.toFixed(1)}%
              </span>
            </span>
          ) : (
            <span>Dönem verisi hazırlanıyor</span>
          )}
        </div>
      </div>
      <div className="p-1 flex-1 min-h-0 overflow-y-auto bg-transparent">
        {displayItems.length > 0 ? (
          <Reorder.Group
            axis="y"
            values={displayItems}
            onReorder={handleReorder}
            className="space-y-0.5 min-h-full"
          >
            {displayItems.map((item) => (
              <SortableAssetRow
                key={item.symbol}
                item={item}
                changeOverride={
                  marketPeriod === "1d"
                    ? periodChanges[item.symbol]
                    : resolvedPeriod === marketPeriod && !isLoadingPeriod
                      ? (periodChanges[item.symbol] ?? null)
                      : null
                }
                currency={currency}
                onHover={(desc) => {
                  if (!externalDragging) {
                    onInsightChange(desc);
                  }
                }}
                isDraggingGroup={Boolean(externalDragging)}
              />
            ))}

          </Reorder.Group>
        ) : (
          <div className="py-4 text-center text-xs text-foreground/70 dark:text-muted-foreground">
            Veri yok
          </div>
        )}
      </div>

    </div>
  );
});


// ==========================================
// Top Movers Card
// ==========================================

function TopMovers({
  gainers,
  losers
}: {
  gainers: DataItem[];
  losers: DataItem[];
}) {
  const topGainer = gainers[0];
  const topLoser = losers[0];

  return (
    <div className="bg-card border rounded-lg overflow-hidden flex-1 min-w-[200px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
        <TrendingUp className="size-4 text-primary shrink-0" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider">
          Öne Çıkanlar
        </h3>
      </div>

      <div className="p-2 space-y-2">
        {topGainer && (
          <Link
            href={`/market/${topGainer.symbol}`}
            className="block bg-emerald-500/5 border border-emerald-500/20 rounded p-2 hover:bg-emerald-500/10 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase transition-colors">Yükselen</p>
                <p className="text-sm font-medium truncate group-hover:text-emerald-600 transition-colors">{topGainer.name || topGainer.symbol}</p>
              </div>
              <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs shrink-0">
                <ArrowUpRight className="size-3" />
                %{(topGainer.change_percent ?? 0).toFixed(2)}
              </span>
            </div>
          </Link>
        )}

        {topLoser && (
          <Link
            href={`/market/${topLoser.symbol}`}
            className="block bg-red-500/5 border border-red-500/20 rounded p-2 hover:bg-red-500/10 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] text-red-500 font-bold uppercase transition-colors">Düşen</p>
                <p className="text-sm font-medium truncate group-hover:text-red-500 transition-colors">{topLoser.name || topLoser.symbol}</p>
              </div>
              <span className="flex items-center gap-0.5 text-red-500 font-bold text-xs shrink-0">
                <ArrowDownRight className="size-3" />
                %{Math.abs(topLoser.change_percent ?? 0).toFixed(2)}
              </span>
            </div>
          </Link>
        )}

        {!topGainer && !topLoser && (
          <div className="py-4 text-center text-xs text-muted-foreground">
            Veri bekleniyor
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// Portfolio Summary Section
// ==========================================

function usePortfolioStats() {
  const currentUser = useUserStore(state => state.currentUser);
  const portfolios = usePortfolioStore(state => state.portfolios);
  const fetchPortfolios = usePortfolioStore(state => state.fetchPortfolios);
  const isPortfolioLoading = usePortfolioStore(state => state.isLoading);

  const {
    metrics: performanceMetrics,
    selectedTimeframe,
    setSelectedTimeframe,
    displayCurrency,
    toggleCurrency,
    totalValue,
    isFetchingQuotes
  } = usePerformanceCalculator();

  // Initialization: Load portfolios and sync period
  React.useEffect(() => {
    fetchPortfolios();

    if (currentUser) {
      const saved = localStorage.getItem(`welcome_period_${currentUser.id}`);
      const allowedTimeframes: Timeframe[] = ['1D', '1W', '1M', 'YTD', '1Y', '5Y', 'ALL'];
      if (saved && saved !== selectedTimeframe && allowedTimeframes.includes(saved as Timeframe)) {
        setSelectedTimeframe(saved as Timeframe);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]); // Stabilized anchor

  React.useEffect(() => {
    if (selectedTimeframe === 'YTD' || selectedTimeframe === '5Y') {
      setSelectedTimeframe('1Y');
      if (currentUser) {
        localStorage.setItem(`welcome_period_${currentUser.id}`, '1Y');
      }
    }
  }, [selectedTimeframe, currentUser, setSelectedTimeframe]);

  const [dataSource, setDataSource] = React.useState<string>('');
  const [lastUpdated, setLastUpdated] = React.useState<string>('');
  const [loading, setLoading] = React.useState(false);

  // Map shared timeframe to local period labels
  const period = React.useMemo((): DashboardPeriod => {
    switch (selectedTimeframe) {
      case '1D': return 'daily';
      case '1W': return 'weekly';
      case '1M': return 'monthly';
      case 'YTD': return 'ytd';
      case '1Y': return 'yearly';
      case '5Y': return 'five_years';
      case 'ALL': return 'all';
      default: return 'daily';
    }
  }, [selectedTimeframe]);

  const handlePeriodChange = (newPeriod: DashboardPeriod) => {
    let tf: Timeframe = '1D';
    switch (newPeriod) {
      case 'daily': tf = '1D'; break;
      case 'weekly': tf = '1W'; break;
      case 'monthly': tf = '1M'; break;
      case 'ytd': tf = 'YTD'; break;
      case 'yearly': tf = '1Y'; break;
      case 'five_years': tf = '5Y'; break;
      case 'all': tf = 'ALL'; break;
    }
    setSelectedTimeframe(tf);
    if (currentUser) {
      localStorage.setItem(`welcome_period_${currentUser.id}`, tf);
    }
  };


  // Local cache for benchmarks populated only from real backend responses
  const [benchmarkCache, setBenchmarkCache] = React.useState<Record<string, BenchmarkData>>({});

  const benchmarkData = benchmarkCache[period];
  const hasBenchmarkData = Boolean(benchmarkData);

  const oldestPortfolioDate = React.useMemo(() => {
    if (!portfolios || portfolios.length === 0) return null;
    const dates = portfolios.filter(p => p.created_at).map(p => new Date(p.created_at));
    if (dates.length === 0) return null;
    return new Date(Math.min(...dates.map(d => d.getTime()))).toISOString();
  }, [portfolios]);

  const fetchPeriodData = React.useCallback(async (p: DashboardPeriod, showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const { fetchBenchmarks } = await import('@/lib/api-client');
      const apiPeriod = p === 'five_years' ? '5y' : (p === 'ytd' ? 'ytd' : (p === 'yearly' ? 'yearly' : p));
      const data = await fetchBenchmarks(apiPeriod);

      setBenchmarkCache(prev => ({
        ...prev,
        [p]: data
      }));

      if (p === period) {
        setDataSource(data.from_cache ? 'cache' : 'live');
        setLastUpdated(data.last_updated || new Date().toISOString());
      }
    } catch (error) {
      console.warn(`Benchmark fetch failed for ${p}:`, error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [oldestPortfolioDate, period]);

  React.useEffect(() => {
    const periods: DashboardPeriod[] = ['daily', 'weekly', 'monthly', 'ytd', 'yearly', 'five_years', 'all'];
    periods.forEach(p => fetchPeriodData(p, false));
  }, [oldestPortfolioDate, fetchPeriodData]);

  const stats = React.useMemo(() => ({
    pl: performanceMetrics.profit,
    pct: performanceMetrics.percent,
    label: performanceMetrics.label
  }), [performanceMetrics]);

  const totalBalance = totalValue;

  const comparisons = React.useMemo<ComparisonItem[]>(() => [
    { label: "Enflasyon", benchmark: benchmarkData?.inflation, user: performanceMetrics.percent, color: "text-red-500", borderColor: "border-red-500/30" },
    { label: "Gram Altın", benchmark: benchmarkData?.gold, user: performanceMetrics.percent, color: "text-amber-500", borderColor: "border-amber-500/30" },
    { label: "BIST 100", benchmark: benchmarkData?.bist100, user: performanceMetrics.percent, color: "text-blue-500", borderColor: "border-blue-500/30" },
    { label: "Dolar (USD)", benchmark: benchmarkData?.usd, user: performanceMetrics.percent, color: "text-green-600", borderColor: "border-green-600/30" },
    { label: "Euro (EUR)", benchmark: benchmarkData?.eur, user: performanceMetrics.percent, color: "text-indigo-600", borderColor: "border-indigo-600/30" },
    { label: "Politika Faizi", benchmark: benchmarkData?.interest_rate, user: performanceMetrics.percent, color: "text-purple-500", borderColor: "border-purple-500/30" }
  ], [benchmarkData, performanceMetrics.percent]);

  return { totalBalance, stats, portfolios, currentUser, comparisons, period, handlePeriodChange, dataSource, lastUpdated, loading, benchmarkData, hasBenchmarkData, oldestPortfolioDate, displayCurrency, toggleCurrency, isLoading: isPortfolioLoading || isFetchingQuotes };
}

type PortfolioStatsData = ReturnType<typeof usePortfolioStats>;
type ComparisonBadgeItem = PortfolioStatsData["comparisons"][number];

function WelcomeBox({ data }: { data: PortfolioStatsData }) {
  const periodOptions: Array<{
    value: DashboardPeriod;
    label: string;
    short: string;
  }> = [
    { value: 'daily', label: 'Bugün', short: '1G' },
    { value: 'weekly', label: 'Hafta', short: '1H' },
    { value: 'monthly', label: 'Ay', short: '1A' },
    { value: 'yearly', label: 'Yıl', short: '1Y' },
    { value: 'all', label: 'Tümü', short: 'T' },
  ];

  const ComparisonBadge = ({ item }: { item: ComparisonBadgeItem }) => {
    const benchmark = typeof item.benchmark === "number" ? item.benchmark : null;
    const hasValue = benchmark !== null;
    const difference = hasValue ? item.user - benchmark : null;
    const isWinning = difference !== null ? difference > 0 : false;
    const isLosing = difference !== null ? difference < 0 : false;
    const isFlat = difference !== null ? Math.abs(difference) < 0.1 : false;
    const statusText = !hasValue
      ? "Referans bekleniyor"
      : isFlat
        ? "Başa baş"
        : isWinning
          ? `${MathUtils.round(Math.abs(difference!), 2)} puan önde`
          : `${MathUtils.round(Math.abs(difference!), 2)} puan geride`;

    return (
      <div className="border border-border/50 rounded-lg p-3 flex flex-col justify-between gap-2 transition-colors bg-muted/10 hover:bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">{item.label}</span>
          {!hasValue ? (
            <div className="p-0.5 rounded bg-muted text-muted-foreground">
              <Minus className="size-3" />
            </div>
          ) : isWinning ? (
            <div className="p-0.5 rounded bg-emerald-500/10 text-emerald-500">
              <ArrowUpRight className="size-3" />
            </div>
          ) : isLosing ? (
            <div className="p-0.5 rounded bg-red-500/10 text-red-500">
              <ArrowDownRight className="size-3" />
            </div>
          ) : (
            <div className="p-0.5 rounded bg-muted text-muted-foreground">
              <Minus className="size-3" />
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-tight text-muted-foreground">
            Referans
          </span>
          <span className="text-lg font-medium text-foreground">
            {hasValue ? `%${MathUtils.round(benchmark, 2)}` : "---"}
          </span>
          <span
            className={cn(
              "mt-1 text-[10px] font-medium uppercase tracking-tight",
              !hasValue && "text-muted-foreground",
              isWinning && "text-emerald-600",
              isLosing && "text-red-600",
              isFlat && "text-muted-foreground"
            )}
          >
            {statusText}
          </span>
        </div>
      </div>
    );
  };

  const { stats, currentUser, handlePeriodChange, comparisons, displayCurrency, toggleCurrency, period, hasBenchmarkData } = data;
  const currencySymbol = displayCurrency === 'USD' ? '$' : '₺';
  const locale = displayCurrency === 'USD' ? 'en-US' : 'tr-TR';

  return (
    <div className="bg-card border rounded-xl p-4 flex flex-col justify-between relative overflow-hidden group h-full">
      <div className="absolute top-0 right-0 p-4 opacity-[0.03] transition-opacity">
        <Zap className="size-28 text-primary" />
      </div>

      {currentUser && (
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h1 className="text-xl font-medium tracking-tight mb-1">
                {'Hoşgeldin, '}<span className="text-primary">{currentUser.name}</span>
              </h1>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">{'FİNANSAL ÖZET'}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={toggleCurrency} className="h-8 px-3 text-xs">
                <span>{displayCurrency}</span>
                <DollarSign className="size-3.5 ml-1.5 opacity-60" />
              </Button>
              <div className="flex flex-wrap items-center gap-1.5">
                {periodOptions.map((option) => {
                  const isActive = period === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handlePeriodChange(option.value)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                        isActive
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background text-muted-foreground border-border hover:bg-muted"
                      )}
                      aria-pressed={isActive}
                    >
                      <span className="hidden sm:inline">{option.label}</span>
                      <span className="sm:hidden">{option.short}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="text-foreground text-sm leading-relaxed font-medium mb-4">
            {stats.label === 'HEPSİ' ? 'Tüm zamanlarda' : stats.label + ' dönemde'} <span className="text-foreground text-xl font-bold tabular-nums">{currencySymbol}{MathUtils.formatMoney(stats.pl, displayCurrency)}</span> net kâr elde ettin.
          </p>

          <div className="flex items-stretch gap-3 flex-1">
            {/* Benchmark Cards */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 flex-1">
              {comparisons.map((item, idx: number) => (
                <ComparisonBadge key={idx} item={item} />
              ))}
            </div>

            {/* User Performance (Siz) */}
            <div className="flex flex-col justify-center min-w-[72px] text-right border-l border-border/50 pl-3">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-1">SİZ</span>
              <span className="text-2xl font-medium text-primary tracking-tighter tabular-nums">%{stats.pct}</span>
              <span className={cn(
                "text-[11px] font-bold tabular-nums opacity-80",
                stats.pl >= 0 ? "text-emerald-600" : "text-rose-600"
              )}>
                {stats.pl >= 0 ? "+" : "-"}{currencySymbol}{Math.abs(stats.pl).toLocaleString(locale, { maximumFractionDigits: displayCurrency === 'USD' ? 2 : 0 })}
              </span>
            </div>
          </div>

          {!hasBenchmarkData && (
            <p className="mt-3 text-[10px] text-muted-foreground uppercase tracking-wider">
              Kıyas verileri yükleniyor...
            </p>
          )}
        </div>
      )}
    </div>
  );
}
function StatsCards({ totalBalance, stats, portfolios, displayCurrency, isLoading }: Pick<PortfolioStatsData, "totalBalance" | "stats" | "portfolios" | "displayCurrency" | "isLoading">) {
  const currencySymbol = displayCurrency === 'USD' ? '$' : '₺';
  const locale = displayCurrency === 'USD' ? 'en-US' : 'tr-TR';
  
  // Show loading state when totalBalance is 0 and portfolios have assets (data is being fetched)
  const hasAssets = portfolios.some((p: Portfolio) => p.assets && p.assets.length > 0);
  const showLoadingState = (totalBalance === 0 && hasAssets) || isLoading;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-full">
      {/* Total Balance */}
      <div className="bg-card border rounded-xl p-4 flex flex-col justify-between group relative transition-colors hover:bg-muted/5 h-full min-h-[7rem]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Toplam Varlık</span>
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Wallet className="size-4" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2">
            {showLoadingState ? (
              <span className="text-[1.7rem] font-medium tabular-nums tracking-tight text-muted-foreground/50 animate-pulse">
                {currencySymbol}---
              </span>
            ) : (
              <span className="text-[1.7rem] font-medium tabular-nums tracking-tight">
                {currencySymbol}{MathUtils.formatMoney(totalBalance, displayCurrency)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge
              variant="outline"
              className={cn(
                "gap-1 rounded-md px-2 py-0.5 text-[11px]",
                showLoadingState
                  ? "bg-muted/50 text-muted-foreground border-muted"
                  : stats.pl >= 0
                    ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/20"
                    : "bg-rose-500/5 text-rose-600 border-rose-500/20"
              )}
            >
              {!showLoadingState && (stats.pl >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />)}
              <span className="font-bold tabular-nums">{showLoadingState ? '---' : MathUtils.formatPercent(stats.pct)}</span>
            </Badge>
            {!showLoadingState && (
              <span className={cn(
                "text-[11px] font-bold tabular-nums",
                stats.pl >= 0 ? "text-emerald-600/80" : "text-rose-600/80"
              )}>
                {stats.pl >= 0 ? "+" : "-"}{currencySymbol}{Math.abs(stats.pl).toLocaleString(locale, { maximumFractionDigits: displayCurrency === 'USD' ? 2 : 0 })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Portfolio Stats */}
      <div className="bg-card border rounded-xl p-4 flex flex-col justify-between transition-colors hover:bg-muted/5 h-full min-h-[7rem]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Portföy Durumu</span>
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
            <Target className="size-4" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Aktif</span>
            <p className="text-[1.7rem] font-medium tracking-tight leading-none mt-1">{portfolios.length}</p>
          </div>
          <div>
            <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">Kazanç</span>
            <p className={cn(
              "text-xl font-medium truncate mt-1",
              stats.pl >= 0 ? "text-emerald-600" : "text-rose-600"
            )}>
              {MathUtils.formatMoney(stats.pl, displayCurrency)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// Main Dashboard
// ==========================================

export function DashboardContent() {

  const { currentUser } = useUserStore();
  const {
    dashboardData,
    fetchDashboardData,
    refreshTrigger,
    hasHydrated,
  } = useDashboardStore();

  // ...existing code... (dashboard indicators removed)

  const [engineStatus, setEngineStatus] = React.useState<"good" | "bad" | "checking">("checking");
  const [latency, setLatency] = React.useState<number | null>(null);
  const [mounted, setMounted] = React.useState(false);

  // Market Analysis State (Reading from Global Store for persistence)
  // Market Analysis State (Reading from Global Store for persistence)
  const detailedAnalysis = useDashboardStore(state => state.detailedAnalysis);
  const setDetailedAnalysis = useDashboardStore(state => state.setDetailedAnalysis);
  const lastAnalysisTime = useDashboardStore(state => state.lastAnalysisTime);

  const [isLoadingAnalysis, setIsLoadingAnalysis] = React.useState(false);

  // Funds for top section
  const [fundsSummary, setFundsSummary] = React.useState<DataItem[]>([]);

  // Widget Order State
  const defaultOrder = ["bist", "us", "fx", "com", "crypto"];
  const [widgetOrder, setWidgetOrder] = React.useState(defaultOrder);

  // Load persisted order for current user
  React.useEffect(() => {
    setMounted(true);
    if (!currentUser) return;

    const storageKey = `dashboard_order_${currentUser.id}`;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Filter out funds if it exists in saved order
          setWidgetOrder(parsed.filter(key => key !== 'funds'));
        } else {
          // Reset to default on error/mismatch
          setWidgetOrder(defaultOrder);
        }
      } else {
        // No saved order for this user, use default
        setWidgetOrder(defaultOrder);
      }
    } catch (e) {
      console.error("Failed to load widget order", e);
    }
  }, [currentUser?.id]);

  // Save order on change
  React.useEffect(() => {
    if (mounted && currentUser) {
      const storageKey = `dashboard_order_${currentUser.id}`;
      localStorage.setItem(storageKey, JSON.stringify(widgetOrder));
    }
  }, [widgetOrder, mounted, currentUser?.id]);

  const performFullUpdate = React.useCallback(async (force = false) => {
    const start = Date.now();
    await fetchDashboardData(force);
    const health = await checkEngineHealth();
    setLatency(Date.now() - start);
    setEngineStatus(health.healthy ? "good" : "bad");
  }, [fetchDashboardData]);

  // Fetch market analysis data (separate from dashboard first-glance)
  const fetchMarketAnalysis = React.useCallback(async (force = false) => {
    setIsLoadingAnalysis(true);
    try {
      const [bist, us, commodities, crypto, funds] = await Promise.allSettled([
        fetchBistStocksAnalysis(force),
        fetchUsStocksAnalysis(force),
        fetchCommoditiesAnalysis(force),
        fetchCryptoAnalysis(force),
        fetchFundsAnalysis(force)
      ]);

      setDetailedAnalysis({
        bist: bist.status === 'fulfilled' ? bist.value : null,
        us: us.status === 'fulfilled' ? us.value : null,
        commodities: commodities.status === 'fulfilled' ? commodities.value : null,
        crypto: crypto.status === 'fulfilled' ? crypto.value : null,
        funds: funds.status === 'fulfilled' ? funds.value : null
      });
    } catch (e) {
      console.error("Market analysis fetch failed:", e);
    } finally {
      setIsLoadingAnalysis(false);
    }
  }, [setDetailedAnalysis]);

  // Fetch funds summary for top section
  const loadFundsSummary = React.useCallback(async () => {
    try {
      const response = await fetchFundsSummary();
      if (response?.funds) {
        setFundsSummary(response.funds.map(f => ({
          symbol: f.symbol,
          name: f.name,
          last: f.last,
          change_percent: f.change_percent
        })));
      }
    } catch (e) {
      console.error("Funds summary fetch failed:", e);
    }
  }, []);

  React.useEffect(() => {
    if (!hasHydrated) return;
    performFullUpdate();
    loadFundsSummary();
    fetchMarketAnalysis(); // Fetch comprehensive analysis data

    // Background Refresh Intervals
    const interval = setInterval(() => performFullUpdate(true), 60000); // Force refresh every minute
    const analysisInterval = setInterval(() => fetchMarketAnalysis(true), 120000); // Force analysis every 2 mins

    return () => {
      clearInterval(interval);
      clearInterval(analysisInterval);
    };
  }, [hasHydrated, performFullUpdate, loadFundsSummary, fetchMarketAnalysis]);

  React.useEffect(() => {
    if (!hasHydrated) return;
    if (refreshTrigger > 0) {
      performFullUpdate(true);
      fetchMarketAnalysis(true);
    }
  }, [hasHydrated, refreshTrigger, performFullUpdate, fetchMarketAnalysis]);

  // Naming & Mapping Logic
  // --------------------------------------------------------------------------
  const formatName = (symbol: string, rawName?: string) => {
    // Map complex symbols to user friendly names
    const map: Record<string, string> = {
      'XU100': 'BIST 100', 'XU030': 'BIST 30', 'XUTUM': 'BIST Tüm',
      'XBANK': 'Bankacılık', 'XUSIN': 'Sınai', 'XU050': 'BIST 50',
      'XBLSM': 'Bilişim', 'XTEKS': 'Tekstil', 'XGIDA': 'Gıda',
      'USD/TRY': 'Dolar (USD)', 'EUR/TRY': 'Euro (EUR)', 'GBP/TRY': 'Sterlin (GBP)',
      'GAU/TRY': 'Gram Altın', 'XAU/USD': 'Ons Altın', 'XAG/USD': 'Gümüş',
      'BTC-USD': 'BTC', 'ETH-USD': 'ETH', 'SOL-USD': 'SOL', 'XRP-USD': 'XRP', 'DOGE-USD': 'DOGE', 'BNB-USD': 'BNB',
      'BTC-TRY': 'Bitcoin (TL)', 'ETH-TRY': 'Ethereum (TL)',
      '^GSPC': 'S&P 500', '^DJI': 'Dow Jones', '^IXIC': 'Nasdaq',
      '^RUT': 'Russell 2000'
    };

    if (map[symbol]) return map[symbol];
    if (symbol.startsWith('XU')) return symbol.replace('XU', 'BIST ');
    if (rawName && rawName.length < 20) return rawName;
    return symbol;
  };

  const bistIndices = React.useMemo(() => {
    return (dashboardData?.indices || [])
      .filter(i => i && i.symbol && (i.symbol.startsWith('XU') || i.symbol.startsWith('XBANK')))
      .map(item => ({ ...item, name: formatName(item.symbol, item.name) }));
  }, [dashboardData]);

  const useAsFunds = React.useMemo(() => {
    // Placeholder for funds until backend integration
    // Using some indices as "Sector Funds" proxy for now
    return (dashboardData?.indices || [])
      .filter(i => i && !i.symbol.startsWith('XU030') && !i.symbol.startsWith('XU100'))
      .slice(0, 5)
      .map(i => ({ ...i, name: i.name ? i.name.replace('XU', 'Fon: ') : `Fon ${i.symbol}` }));
  }, [dashboardData]);

  const usMarkets = React.useMemo(() => {
    return (dashboardData?.us_markets || []).map(item => ({ ...item, name: formatName(item.symbol, item.name) }));
  }, [dashboardData]);

  const fxData = React.useMemo(() => {
    return (dashboardData?.fx || []).map(item => ({ ...item, name: formatName(item.symbol, item.name) }));
  }, [dashboardData]);

  const commodities = React.useMemo(() => {
    return (dashboardData?.commodities || []).map(item => ({ ...item, name: formatName(item.symbol, item.name) }));
  }, [dashboardData]);

  const allCrypto = React.useMemo(() => {
    return (dashboardData?.crypto || []).map(item => ({ ...item, name: formatName(item.symbol, item.name) }));
  }, [dashboardData]);

  const popularStocks = React.useMemo(() => {
    return (dashboardData?.stocks || []).map(item => ({ ...item, name: formatName(item.symbol, item.name) }));
  }, [dashboardData]);

  // Favorites Logic
  // --------------------------------------------------------------------------
  const [favorites, setFavorites] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (currentUser) {
      const saved = localStorage.getItem(`fav_assets_${currentUser.id}`);
      if (saved) setFavorites(JSON.parse(saved));
    }
  }, [currentUser]);

  const toggleFavorite = (symbol: string) => {
    if (!currentUser) return;
    const newFavs = favorites.includes(symbol)
      ? favorites.filter(s => s !== symbol)
      : [...favorites, symbol];
    setFavorites(newFavs);
    localStorage.setItem(`fav_assets_${currentUser.id}`, JSON.stringify(newFavs));
  };

  const favoriteItems = React.useMemo(() => {
    const all = [...bistIndices, ...popularStocks, ...allCrypto, ...fxData, ...usMarkets, ...commodities];
    return all.filter(i => favorites.includes(i.symbol));
  }, [favorites, bistIndices, popularStocks, allCrypto, fxData, usMarkets, commodities]);

  // Movers Logic (Enhanced)
  // --------------------------------------------------------------------------
  const getMovers = (items: DataItem[]) => {
    const clean = items.filter(i => i && typeof i.change_percent === 'number');
    const sorted = [...clean].sort((a, b) => (b.change_percent || 0) - (a.change_percent || 0));
    return {
      gainers: sorted.slice(0, 5),
      losers: sorted.slice(-5).reverse()
    };
  };

  const bistMovers = React.useMemo(() => getMovers([...bistIndices, ...popularStocks]), [bistIndices, popularStocks]);
  const cryptoMovers = React.useMemo(() => getMovers(allCrypto), [allCrypto]);
  const fundMovers = React.useMemo(() => getMovers(fundsSummary), [fundsSummary]);

  // Dynamic Analysis State (Persisted per user)
  const [analysisCategory, setAnalysisCategory] = React.useState('crypto');
  const [analysisDirection, setAnalysisDirection] = React.useState<'gainers' | 'losers'>('gainers');

  React.useEffect(() => {
    if (currentUser) {
      const savedCat = localStorage.getItem(`analysis_cat_${currentUser.id}`);
      const savedDir = localStorage.getItem(`analysis_dir_${currentUser.id}`);
      if (savedCat) setAnalysisCategory(savedCat);
      if (savedDir === 'gainers' || savedDir === 'losers') {
        setAnalysisDirection(savedDir);
      }
    }
  }, [currentUser]);

  const handleAnalysisCategoryChange = (val: string) => {
    setAnalysisCategory(val);
    if (currentUser) localStorage.setItem(`analysis_cat_${currentUser.id}`, val);
  };

  const handleAnalysisDirectionChange = (val: 'gainers' | 'losers') => {
    setAnalysisDirection(val);
    if (currentUser) localStorage.setItem(`analysis_dir_${currentUser.id}`, val);
  };

  // Use dedicated market analysis data from API instead of first-glance dashboard data
  const analysisList = React.useMemo(() => {
    let data: MarketAnalysisData | null = null;

    switch (analysisCategory) {
      case 'bist': data = detailedAnalysis.bist; break;
      case 'us': data = detailedAnalysis.us; break;
      case 'com': data = detailedAnalysis.commodities; break;
      case 'crypto': data = detailedAnalysis.crypto; break;
      case 'funds': data = detailedAnalysis.funds; break;
      case 'fx':
        // FX stays from dashboard for now (small static list)
        const fxMovers = getMovers(fxData);
        return analysisDirection === 'gainers' ? fxMovers.gainers : fxMovers.losers;
      default:
        return [];
    }

    if (!data) return [];

    // Return comprehensive data from API (up to 50 items)
    if (analysisDirection === 'gainers') {
      return (data.gainers || []).slice(0, 5);
    } else {
      return (data.losers || []).slice(0, 5);
    }
  }, [analysisCategory, analysisDirection, detailedAnalysis, fxData]);

  // Full list for scrollable view
  const analysisFullList = React.useMemo(() => {
    let data: MarketAnalysisData | null = null;

    switch (analysisCategory) {
      case 'bist': data = detailedAnalysis.bist; break;
      case 'us': data = detailedAnalysis.us; break;
      case 'com': data = detailedAnalysis.commodities; break;
      case 'crypto': data = detailedAnalysis.crypto; break;
      case 'funds': data = detailedAnalysis.funds; break;
      case 'fx':
        return fxData;
      default:
        return [];
    }

    if (!data) return [];
    return data.all || [];
  }, [analysisCategory, detailedAnalysis, fxData]);

  const cryptoWidgetItems = React.useMemo((): DataItem[] => {
    const majorCoins = ["BTC", "ETH", "SOL", "XRP", "DOGE", "BNB"];
    // Prioritize major coins
    const found: DataItem[] = [];
    for (const coin of majorCoins) {
      // Find all matches for this coin name (e.g. BTC in TRY and USDT)
      const matches = allCrypto.filter(c => c.name === coin);
      if (matches.length > 0) {
        // Prioritize USD/USDT pairs if available
        const usdMatch = matches.find(m => m.currency === "USD");
        const item = usdMatch || matches[0];
        found.push({ ...item });
      }
    }
    // If fewer than 5, fill with top volume items not already selected
    if (found.length < 5) {
      const foundSymbols = new Set(found.map(f => f.symbol));
      const others = allCrypto
        .filter(c => !foundSymbols.has(c.symbol))
        .slice(0, 5 - found.length)
        .map(c => ({ ...c }));
      return [...found, ...others];
    }
    return found;
  }, [allCrypto]);

  const portfolioData = usePortfolioStats();

  const renderWidget = React.useCallback((key: string) => {
    const props = {
      currentUser,
      selectedPeriod: portfolioData.period,
      onInsightChange: () => {},
      externalDragging: false
    };

    switch (key) {
      case 'bist': return <AssetGroup id="bist" {...props} title="BIST" icon={TrendingUp} iconColor="text-red-600 dark:text-red-400" items={bistIndices} currency="TRY" />;
      case 'us': return <AssetGroup id="us" {...props} title="ABD" icon={Building2} iconColor="text-slate-600 dark:text-slate-300" items={usMarkets} currency="USD" />;
      case 'fx': return <AssetGroup id="fx" {...props} title="FX" icon={Banknote} iconColor="text-emerald-600 dark:text-emerald-400" items={fxData} currency="TRY" />;
      case 'com': return <AssetGroup id="com" {...props} title={"EMT\u0130A"} icon={Package} iconColor="text-amber-500" items={commodities} currency="TRY" />;
      case 'crypto': return <AssetGroup id="crypto" {...props} title={"KR\u0130PTO"} icon={Bitcoin} iconColor="text-orange-500" items={cryptoWidgetItems} currency="USD" />;
      default: return null;
    }
  }, [currentUser, portfolioData.period, bistIndices, usMarkets, fxData, commodities, cryptoWidgetItems]);

  return (
    <div className="page-shell no-scrollbar overflow-y-auto flex h-[calc(100vh-4.75rem)] min-h-0 flex-col gap-3 pb-0 pt-3 lg:pb-0 lg:pt-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch shrink-0">
        {/* Left Side: Welcome Box */}
        <WelcomeBox data={portfolioData} />

        {/* Right Side: Stats + Macro Stack */}
        <div className="grid h-full min-h-0 grid-rows-2 gap-3">
          <div className="min-h-0">
            <StatsCards {...portfolioData} />
          </div>
          <div className="min-h-0">
            <MacroData period={portfolioData.period} startDate={portfolioData.oldestPortfolioDate} />
          </div>
        </div>
      </div>

      <Reorder.Group
        axis="x"
        values={widgetOrder}
        onReorder={setWidgetOrder}
        className="grid min-h-0 flex-1 auto-rows-fr items-stretch content-start gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-5"
      >
        {widgetOrder.map((key) => {
          const widget = renderWidget(key);
          if (!widget) return null;

          return (
            <SortableWidget
              key={key}
              id={key}
            >
              {widget}
            </SortableWidget>
          );
        })}
      </Reorder.Group>

      <div className="mt-auto">
        <GlobalAlphaBar key={portfolioData.period} period={portfolioData.period} />
      </div>
    </div>
  );
}
