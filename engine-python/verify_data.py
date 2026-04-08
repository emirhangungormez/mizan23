import borsapy as bp
from datetime import datetime, timedelta

print("=" * 80)
print("BORSAPY VERİ KONTROLÜ")
print("=" * 80)

# 1. TCMB POLİTİKA FAİZİ
print("\n1. POLİTİKA FAİZİ:")
print("-" * 40)
tcmb = bp.TCMB()
print(f"   tcmb.policy_rate = {tcmb.policy_rate}%")
print(f"   bp.policy_rate() = {bp.policy_rate()}%")

# 2. ENFLASYON
print("\n2. ENFLASYON (TÜFE):")
print("-" * 40)
inf = bp.Inflation()
latest = inf.latest()
print(f"   Yıllık: {latest['yearly_inflation']}%")
print(f"   Aylık: {latest['monthly_inflation']}%")
print(f"   Tarih: {latest['date']}")

# 3. USD/TRY
print("\n3. USD/TRY:")
print("-" * 40)
usd = bp.FX("USD")
usd_data = usd.info
print(f"   Son Fiyat: {usd_data.get('last', 'N/A')}")
print(f"   Değişim: {usd_data.get('change_percent', 'N/A')}%")

# 4. EUR/TRY
print("\n4. EUR/TRY:")
print("-" * 40)
eur = bp.FX("EUR")
eur_data = eur.info
print(f"   Son Fiyat: {eur_data.get('last', 'N/A')}")
print(f"   Değişim: {eur_data.get('change_percent', 'N/A')}%")

# 5. GRAM ALTIN
print("\n5. GRAM ALTIN:")
print("-" * 40)
gold = bp.FX("gram-altin")
gold_data = gold.info
print(f"   Son Fiyat: {gold_data.get('last', 'N/A')}")
print(f"   Değişim: {gold_data.get('change_percent', 'N/A')}%")

# 6. BIST 100
print("\n6. BIST 100:")
print("-" * 40)
bist = bp.Index("XU100")
bist_info = bist.info
print(f"   Son: {bist_info.get('last', 'N/A')}")
print(f"   Değişim: {bist_info.get('change_percent', 'N/A')}%")

# 7. ZAMAN DİLİMLERİNE GÖRE DEĞİŞİMLER
print("\n7. ZAMAN DİLİMLERİNE GÖRE DEĞİŞİMLER:")
print("-" * 40)

# USD için farklı periyodlar
print("\n   USD/TRY Tarihi Veriler:")
periods = {
    '1d': '1 Gün',
    '1w': '1 Hafta', 
    '1mo': '1 Ay',
    'ytd': 'Yıl Başından',
    '1y': '1 Yıl'
}

for period_code, period_name in periods.items():
    try:
        hist = usd.history(period=period_code)
        if not hist.empty and len(hist) >= 2:
            first_close = hist['Close'].iloc[0]
            last_close = hist['Close'].iloc[-1]
            change_pct = ((last_close - first_close) / first_close) * 100
            print(f"      {period_name:15s}: {first_close:.4f} → {last_close:.4f} ({change_pct:+.2f}%)")
    except Exception as e:
        print(f"      {period_name:15s}: Hata - {e}")

# BIST için farklı periyodlar
print("\n   BIST 100 Tarihi Veriler:")
for period_code, period_name in periods.items():
    try:
        hist = bist.history(period=period_code)
        if not hist.empty and len(hist) >= 2:
            first_close = hist['Close'].iloc[0]
            last_close = hist['Close'].iloc[-1]
            change_pct = ((last_close - first_close) / first_close) * 100
            print(f"      {period_name:15s}: {first_close:.2f} → {last_close:.2f} ({change_pct:+.2f}%)")
    except Exception as e:
        print(f"      {period_name:15s}: Hata - {e}")

# Altın için farklı periyodlar  
print("\n   Gram Altın Tarihi Veriler:")
for period_code, period_name in periods.items():
    try:
        hist = gold.history(period=period_code)
        if not hist.empty and len(hist) >= 2:
            first_close = hist['Close'].iloc[0]
            last_close = hist['Close'].iloc[-1]
            change_pct = ((last_close - first_close) / first_close) * 100
            print(f"      {period_name:15s}: {first_close:.2f} → {last_close:.2f} ({change_pct:+.2f}%)")
    except Exception as e:
        print(f"      {period_name:15s}: Hata - {e}")

print("\n" + "=" * 80)
print("KONTROL TAMAMLANDI")
print("=" * 80)
