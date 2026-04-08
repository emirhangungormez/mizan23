from pathlib import Path
p=Path('C:/Users/emirh/Desktop/trade-intelligence/engine-python/engine/data/market_fetch.py')
s=p.read_text()
lines=s.splitlines()
balance=0
for i,l in enumerate(lines, start=1):
    stripped=l.strip()
    # Skip lines where 'try:' is in string or comment? naive
    if stripped.startswith('try:'):
        balance+=1
        print(i, 'TRY')
    if stripped.startswith('except') or stripped.startswith('finally'):
        balance-=1
        print(i, 'EX/FIN')
    if balance<0:
        print('NEGATIVE at', i)
        break
print('Final balance at line', i, 'is', balance)
# print surrounding lines near error line 1097
for j in range(1080,1110):
    print(j, lines[j-1])
