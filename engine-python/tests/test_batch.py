from engine.data.market_fetch import market_fetcher

# Test 5Y period for critical symbols
print('Testing 5Y period...')
r = market_fetcher.get_batch_changes(['XU100', 'XUTUM', 'XU050', 'gram-altin', 'ons-altin', 'USD', 'EUR', 'BRENT'], '5y')
for item in r:
    print(f"{item['symbol']}: {item['change_percent']}% ({item['source']})")

print('\nTesting 1Y period...')
r = market_fetcher.get_batch_changes(['XU100', 'XUTUM', 'XU050', 'gram-altin', 'ons-altin', 'USD', 'EUR', 'BRENT'], '1y')
for item in r:
    print(f"{item['symbol']}: {item['change_percent']}% ({item['source']})")

print('\nTesting 1W period...')
r = market_fetcher.get_batch_changes(['XU100', 'XUTUM', 'XU050', 'gram-altin', 'ons-altin', 'USD', 'EUR', 'BRENT'], '1w')
for item in r:
    print(f"{item['symbol']}: {item['change_percent']}% ({item['source']})")
