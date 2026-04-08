import tokenize
from pathlib import Path
p=Path('C:/Users/emirh/Desktop/trade-intelligence/engine-python/engine/data/market_fetch.py')
with p.open('rb') as f:
    tokens = list(tokenize.tokenize(f.readline))
stack=[]
for tok in tokens:
    if tok.type==tokenize.NAME and tok.string=='try':
        stack.append(('try', tok.start[0]))
    if tok.type==tokenize.NAME and tok.string=='except':
        if stack:
            # pop last try
            stack.pop()
        else:
            print('Found except without try at', tok.start)

if stack:
    print('Unmatched try(s):')
    for s in stack:
        print(s)
else:
    print('All try matched')
