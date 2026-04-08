import borsapy as bp
from borsapy import Fund

# Get all funds from multiple searches
all_funds = []
seen_codes = set()
search_terms = ['', 'katilim', 'hisse', 'altin', 'degisken', 'serbest', 'borclanma', 'endeks', 'bist', 'yabanci']

for term in search_terms:
    try:
        results = bp.search_funds(term)
        if results:
            for f in results:
                code = f.get('fund_code', '')
                if code and code not in seen_codes:
                    seen_codes.add(code)
                    all_funds.append(f)
    except:
        continue

print(f"Toplam {len(all_funds)} fon bulundu\n")

# Sort by 1-year return (descending)
sorted_funds = sorted(
    [f for f in all_funds if f.get('return_1y') is not None], 
    key=lambda x: float(x.get('return_1y', 0) or 0), 
    reverse=True
)

print("=" * 80)
print("EN YÜKSEK YILLIK GETİRİ SAĞLAYAN 5 FON")
print("=" * 80)

for i, f in enumerate(sorted_funds[:5], 1):
    code = f.get('fund_code')
    name = f.get('name', code)
    fund_type = f.get('fund_type', '-')
    return_1y = f.get('return_1y', 0)
    
    print(f"\n{i}. {code}")
    print(f"   📛 Tam Adı: {name}")
    print(f"   📂 Fon Türü: {fund_type}")
    print(f"   📈 Yıllık Getiri: %{return_1y:.2f}")
    
    # Get detailed info
    try:
        fund = Fund(code)
        info = fund.info
        
        price = info.get('price', 0)
        daily_return = info.get('daily_return', 0)
        return_1m = info.get('return_1m', 0)
        return_3m = info.get('return_3m', 0)
        fund_size = info.get('fund_size', 0)
        investor_count = info.get('investor_count', 0)
        category = info.get('category', '-')
        allocation = info.get('allocation', [])
        
        print(f"   💰 Birim Fiyat: {price:.4f} TL")
        print(f"   📊 Günlük Getiri: %{daily_return or 0:.2f}")
        print(f"   📊 1 Aylık Getiri: %{return_1m or 0:.2f}")
        print(f"   📊 3 Aylık Getiri: %{return_3m or 0:.2f}")
        print(f"   💼 Fon Büyüklüğü: {fund_size:,.0f} TL" if fund_size else "")
        print(f"   👥 Yatırımcı Sayısı: {investor_count:,}" if investor_count else "")
        print(f"   🏷️ Kategori: {category}")
        
        if allocation:
            print("   📦 Varlık Dağılımı:")
            for a in allocation:
                asset_type = a.get('asset_type', '')
                weight = a.get('weight', 0)
                print(f"      - {asset_type}: %{weight:.2f}")
    except Exception as e:
        print(f"   ⚠️ Detay alınamadı: {e}")

print("\n" + "=" * 80)
