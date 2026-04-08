const ENGINE_URL = 'http://localhost:8000';
let chartInstance = null;
let lineSeries = null;

// Simple Cache
async function fetchEngine(endpoint, cacheTimeMs = 300000) {
    const url = `${ENGINE_URL}${endpoint}`;
    const cacheKey = `vanilla_cache_${endpoint}`;
    
    if (cacheTimeMs > 0) {
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp < cacheTimeMs) {
                    return parsed.data;
                }
            }
        } catch(e) {}
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const data = await response.json();

    if (cacheTimeMs > 0) {
        try { localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data })); } catch(e) {}
    }
    
    return data;
}

// Formatters
const fmtNum = (n, dec=2) => new Intl.NumberFormat('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
const fmtCurr = (n) => '₺' + fmtNum(n, 2);
const fmtPct = (n) => `${n > 0 ? '+' : ''}${fmtNum(n, 2)}%`;

function initChart() {
    const cont = document.getElementById('tv-chart');
    if (!cont) return;

    chartInstance = LightweightCharts.createChart(cont, {
        width: cont.clientWidth,
        height: 180,
        layout: {
            background: { type: 'solid', color: 'transparent' },
            textColor: '#a0a0a0',
            fontFamily: 'Inter'
        },
        grid: {
            vertLines: { visible: false },
            horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
        },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
        crosshair: {
            vertLine: { color: '#4f46e5', labelBackgroundColor: '#4f46e5' },
            horzLine: { color: '#4f46e5', labelBackgroundColor: '#4f46e5' }
        }
    });

    lineSeries = chartInstance.addLineSeries({
        color: '#4f46e5',
        lineWidth: 2,
        crosshairMarkerRadius: 4,
    });
}

function updateChart(historicalData) {
    if (!lineSeries) return;
    const tvData = historicalData.map(d => ({
        time: d.date.split('T')[0],
        value: d.close
    }));
    lineSeries.setData(tvData);
    chartInstance.timeScale().fitContent();
}

async function loadDashboard() {
    const statusDot = document.getElementById('status-dot');
    const tBody = document.getElementById('portfolio-body');
    const totalValEl = document.getElementById('total-value');
    const totalPlEl = document.getElementById('total-pl');

    try {
        await fetchEngine('/api/health', 0);
        statusDot.className = 'dot online';
    } catch {
        statusDot.className = 'dot loading';
        return; // engine offline
    }

    try {
        const data = await fetchEngine('/api/market/analysis/bist-stocks');
        let totalValue = 0;
        let html = '';

        // Fake some portfolio rows out of top 5 for demonstration
        const mockPort = data.all.slice(0, 5).map((s, i) => {
            const qty = (i + 1) * 100;
            const cost = s.last * (1 - (s.change_percent / 100)); // calculate previous close as cost
            const val = s.last * qty;
            const pnl = val - (cost * qty);
            totalValue += val;
            return { ...s, qty, cost, val, pnl };
        });

        // Compute total P/L
        const totalInvested = mockPort.reduce((sum, s) => sum + (s.cost * s.qty), 0);
        const totalPnL = totalValue - totalInvested;
        const totalPnLPct = (totalPnL / totalInvested) * 100;

        totalValEl.textContent = fmtCurr(totalValue);
        totalPlEl.textContent = `${fmtCurr(totalPnL)} (${fmtPct(totalPnLPct)})`;
        totalPlEl.className = `summary-value ${totalPnL >= 0 ? 'profit' : 'loss'}`;

        mockPort.forEach(stock => {
            const isProfit = stock.pnl >= 0;
            const pClass = isProfit ? 'profit' : 'loss';
            
            html += `
            <tr class="table-row">
                <td style="font-weight: 600;">${stock.symbol}</td>
                <td>${fmtNum(stock.last)}</td>
                <td>${stock.qty}</td>
                <td>${fmtNum(stock.cost)}</td>
                <td>$${fmtNum(stock.val)}</td>
                <td class="${pClass}">${fmtCurr(stock.pnl)} (${fmtPct(stock.change_percent)})</td>
                <td style="text-align: right; color:var(--text-sec); cursor: pointer;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
                    &nbsp;x
                </td>
            </tr>
            `;
        });
        tBody.innerHTML = html;

        // Render Bottom Gainers/Losers
        document.getElementById('top-gainers-list').innerHTML = data.gainers.slice(0,3).map(g => 
            `<div class="stat-item"><span style="color:white">${g.symbol}</span><span>${fmtPct(g.change_percent)}</span></div>`
        ).join('');
        
        document.getElementById('top-losers-list').innerHTML = data.losers.slice(0,3).map(l => 
            `<div class="stat-item"><span style="color:var(--text-sec)">${l.symbol}</span><span>${fmtPct(l.change_percent)}</span></div>`
        ).join('');

        // Fetch fake history for chart from the first stock
        const firstAssetInfo = await fetchEngine(`/api/market/asset/${mockPort[0].symbol}?period=1mo`);
        document.getElementById('chart-symbol-title').textContent = `${mockPort[0].symbol} - Last 1 Month`;
        if(firstAssetInfo.historical) updateChart(firstAssetInfo.historical);

    } catch (e) {
        console.error(e);
        tBody.innerHTML = `<tr><td colspan="7" style="text-align:center">Error loading portfolio: ${e.message}</td></tr>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    loadDashboard();
    document.getElementById('refresh-btn').onclick = loadDashboard;
    
    // Resize chart dynamically
    const ro = new ResizeObserver(() => {
        if(chartInstance && document.getElementById('tv-chart')) {
            chartInstance.applyOptions({ width: document.getElementById('tv-chart').clientWidth });
        }
    });
    ro.observe(document.getElementById('tv-chart'));
});
