import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE CLIENT ─────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "";
const supabase = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ─── FX RATES ────────────────────────────────────────────────────────────────
const DEFAULT_RATES = { USD_CZK: 23.2, EUR_CZK: 25.4, CZK_CZK: 1, lastUpdated: null };

// ─── DEFAULT PORTFOLIOS ──────────────────────────────────────────────────────
const DEFAULT_PORTFOLIOS = [
  { id: "p1", name: "Hlavní portfolio", color: "#6366f1", created: new Date().toISOString().slice(0,10) }
];

// ─── SAMPLE DATA ─────────────────────────────────────────────────────────────
const SAMPLE_TRANSACTIONS = [
  { id: "t1", portfolioId: "p1", type: "buy", ticker: "AAPL", name: "Apple Inc.", category: "stock", date: "2021-03-15", quantity: 10, price: 121.5, currency: "USD", fee: 1.5, notes: "" },
  { id: "t2", portfolioId: "p1", type: "buy", ticker: "VWCE", name: "Vanguard FTSE All-World ETF", category: "etf", date: "2021-06-01", quantity: 5, price: 95.2, currency: "EUR", fee: 2.0, notes: "" },
  { id: "t3", portfolioId: "p1", type: "buy", ticker: "BTC", name: "Bitcoin", category: "crypto", date: "2022-01-10", quantity: 0.05, price: 41200, currency: "USD", fee: 15, notes: "" },
  { id: "t4", portfolioId: "p1", type: "buy", ticker: "MSFT", name: "Microsoft Corp.", category: "stock", date: "2022-08-20", quantity: 8, price: 262, currency: "USD", fee: 1.5, notes: "" },
  { id: "t5", portfolioId: "p1", type: "dividend", ticker: "AAPL", name: "Apple Inc.", category: "stock", date: "2023-02-16", quantity: 0, price: 0, currency: "USD", fee: 0, dividendAmount: 23.2, notes: "Q1 dividend" },
  { id: "t6", portfolioId: "p1", type: "buy", ticker: "CEZ", name: "ČEZ, a.s.", category: "stock", date: "2022-05-10", quantity: 20, price: 720, currency: "CZK", fee: 50, notes: "" },
  { id: "t7", portfolioId: "p1", type: "buy", ticker: "ETH", name: "Ethereum", category: "crypto", date: "2023-03-01", quantity: 0.5, price: 1580, currency: "USD", fee: 8, notes: "" },
];

const SAMPLE_PRICES = {
  AAPL: { price: 213.5, currency: "USD", change1d: 1.23 },
  VWCE: { price: 118.4, currency: "EUR", change1d: 0.45 },
  BTC:  { price: 68400, currency: "USD", change1d: -2.1 },
  MSFT: { price: 415.2, currency: "USD", change1d: 0.88 },
  CEZ:  { price: 850,   currency: "CZK", change1d: 0.5 },
  ETH:  { price: 3250,  currency: "USD", change1d: 1.5 },
  KO:   { price: 71.2,  currency: "USD", change1d: 0.3 },
  JNJ:  { price: 152.4, currency: "USD", change1d: -0.2 },
  SPY:  { price: 528.0, currency: "USD", change1d: 0.6 },
  QQQ:  { price: 455.0, currency: "USD", change1d: 0.9 },
  NVDA: { price: 875.0, currency: "USD", change1d: 2.1 },
  O:    { price: 58.3,  currency: "USD", change1d: 0.1 },
  DAL:  { price: 48.5,  currency: "USD", change1d: -0.4 },
  IRM:  { price: 115.2, currency: "USD", change1d: 0.7 },
  MM0:  { price: 85.0,  currency: "CZK", change1d: 0.2 },
};

const SAMPLE_DIVIDENDS = [
  { ticker: "AAPL", date: "2025-08-15", amount: 0.25, perShare: true, currency: "USD" },
  { ticker: "MSFT", date: "2025-09-12", amount: 0.75, perShare: true, currency: "USD" },
  { ticker: "CEZ",  date: "2025-06-20", amount: 45,   perShare: true, currency: "CZK" },
];

const SAMPLE_EARNINGS = [
  { ticker: "AAPL", date: "2025-07-29", time: "after-close",    estimate: "1.42 EPS" },
  { ticker: "MSFT", date: "2025-07-23", time: "after-close",    estimate: "3.10 EPS" },
];

const FI_DEFAULTS = {
  monthlyExpenses: 50000,
  safeWithdrawalRate: 4,
  annualReturn: 7,
  monthlySaving: 10000,
  currency: "CZK",
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt = (n, currency = "CZK", decimals = 0) => {
  if (isNaN(n) || n === null || n === undefined) return "–";
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
};
const fmtPct = (n) => (isNaN(n) || n === null ? "–" : `${n >= 0 ? "+" : ""}${n.toFixed(2)} %`);
const fmtDate = (d) => { try { const dt=new Date(d); if(isNaN(dt)) return d||""; return dt.toLocaleDateString("cs-CZ",{day:"2-digit",month:"2-digit",year:"numeric"}); } catch { return d||""; } };
const daysSince = (dateStr) => Math.floor((Date.now() - new Date(dateStr)) / 86400000);
const toCZK = (amount, currency, rates) => {
  if (!amount || isNaN(amount)) return 0;
  if (currency === "CZK") return amount; // already CZK — no conversion!
  if (currency === "USD") return amount * (rates.USD_CZK || 23.2);
  if (currency === "EUR") return amount * (rates.EUR_CZK || 25.4);
  return amount; // unknown currency — return as-is
};

// Czech tickers that trade in CZK (Finnhub may return wrong currency)
const CZK_TICKERS_SET = new Set(["CEZ","CEZ.PR","MM0","MM0.PR","MONET.PR","FRA:TBK","TABAK.PR","KOFOL.PR","VIG.PR"]);
const getTickerCurrency = (ticker, priceObj) => {
  if (CZK_TICKERS_SET.has(ticker)) return "CZK";
  // Real estate and cash are typically stored in CZK
  if (priceObj?.category === "real_estate" || priceObj?.category === "cash") return "CZK";
  return priceObj?.currency || "USD";
};
const upColor = (n) => (n >= 0 ? "#22d3a0" : "#f87171");

// ─── FETCH FX RATES via exchangerate.host (free, no key) ─────────────────────
async function fetchLiveRates() {
  try {
    // Use a CORS-friendly free API
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/CZK");
    if (!res.ok) throw new Error("rate fetch failed");
    const data = await res.json();
    const rates = data.rates;
    return {
      USD_CZK: rates.USD ? parseFloat((1 / rates.USD).toFixed(3)) : null,
      EUR_CZK: rates.EUR ? parseFloat((1 / rates.EUR).toFixed(3)) : null,
      lastUpdated: new Date().toISOString(),
    };
  } catch {
    // Fallback: try another source
    try {
      const r2 = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!r2.ok) throw new Error();
      const d2 = await r2.json();
      return {
        USD_CZK: d2.rates?.CZK ? parseFloat(d2.rates.CZK.toFixed(3)) : null,
        EUR_CZK: d2.rates?.CZK && d2.rates?.EUR ? parseFloat((d2.rates.CZK / d2.rates.EUR).toFixed(3)) : null,
        lastUpdated: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }
}

// ─── CHARTS ──────────────────────────────────────────────────────────────────
const DonutChart = ({ data, size = 160 }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ color: "#8b9fc0", fontSize: 12 }}>Žádná data</div>;
  let cumulative = 0;
  const r = size / 2 - 20, cx = size / 2, cy = size / 2;
  const COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];
  const slices = data.map(d => {
    const pct = d.value / total;
    const start = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += pct;
    const end = cumulative * 2 * Math.PI - Math.PI / 2;
    const largeArc = pct > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    return { ...d, pct, path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z` };
  });
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
      <svg width={size} height={size}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={COLORS[i % COLORS.length]} opacity={0.9} />)}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="#0f172a" />
        <text x={cx} y={cy - 6} textAnchor="middle" fill="#f1f5f9" fontSize="11" fontWeight="600">ALOKACE</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="#94a3b8" fontSize="9">{data.filter(d=>d.value>0).length} pozic</text>
      </svg>
      <div style={{ flex: 1, minWidth: 140 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS[i % COLORS.length], flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: "#cbd5e1", flex: 1 }}>{s.label}</span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>{(s.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const BarChart = ({ data }) => {
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
  return (
    <div style={{ padding: "8px 0" }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 56, fontSize: 11, color: "#94a3b8", textAlign: "right", flexShrink: 0 }}>{d.label}</div>
          <div style={{ flex: 1, background: "#1e293b", borderRadius: 3, height: 18, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.abs(d.value) / max * 100}%`, background: d.value >= 0 ? "linear-gradient(90deg,#059669,#10b981)" : "linear-gradient(90deg,#dc2626,#ef4444)", borderRadius: 3, transition: "width 0.5s" }} />
          </div>
          <div style={{ width: 90, fontSize: 11, color: d.value >= 0 ? "#10b981" : "#ef4444", textAlign: "right", flexShrink: 0 }}>{fmt(d.value, "CZK", 0)}</div>
        </div>
      ))}
    </div>
  );
};

// ─── GROWTH CHART (from first transaction → now) ──────────────────────────────
const GrowthChart = ({ transactions, prices, rates, yearFilter, benchmarks={}, activeBenchmarks=[], benchmarkOptions=[], portfolioCurrentCZK=0 }) => {
  const buys = transactions.filter(t => t.type === "buy").sort((a,b) => new Date(a.date)-new Date(b.date));
  if (!buys.length) return <div style={{color:"#8b9fc0",fontSize:12}}>Žádné transakce</div>;

  const firstDate = new Date(buys[0].date);
  const now = new Date();

  const points = [];
  let cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  while (cursor <= now) {
    if (!yearFilter || cursor.getFullYear() === yearFilter) {
      const txSoFar = buys.filter(t => new Date(t.date) <= cursor);
      let invested = 0;
      const holdings = {};
      txSoFar.forEach(t => {
        invested += toCZK(t.quantity*t.price + (t.fee||0), t.currency, rates);
        holdings[t.ticker] = (holdings[t.ticker]||0) + t.quantity;
      });
      // For current month: use live prices. For historical: use invested cost as proxy
      const isCurrentMonth = cursor.getFullYear()===now.getFullYear() && cursor.getMonth()===now.getMonth();
      let current = 0;
      if (isCurrentMonth) {
        // Use actual current prices
        Object.entries(holdings).forEach(([ticker, qty]) => {
          const p = prices[ticker];
          if (p) current += toCZK(qty*p.price, getTickerCurrency(ticker,p), rates);
        });
      } else {
        // For past months: estimate value as invested × (current_value/total_invested ratio)
        // This gives a proportional estimate without needing historical prices
        current = invested; // will be scaled after all points computed
      }
      points.push({ label:`${cursor.getMonth()+1}/${String(cursor.getFullYear()).slice(2)}`, invested, current, date:new Date(cursor) });
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1);
  }
  // Use actual portfolio value from parent for last point
  const totalInvestedAll = points.length > 0 ? points[points.length-1].invested : 0;
  const actualCurrentVal = portfolioCurrentCZK > 0 ? portfolioCurrentCZK : (points[points.length-1]?.current || 0);
  const ratio = totalInvestedAll > 0 && actualCurrentVal > 0 ? actualCurrentVal / totalInvestedAll : 1;
  if (points.length > 1) {
    points.forEach((pt, i) => {
      // Scale each point: historical value ∝ amount invested × current ratio
      pt.current = pt.invested * ratio;
    });
    // Set last point to exact current value
    points[points.length-1].current = actualCurrentVal;
  }

  if (points.length < 2) return <div style={{color:"#8b9fc0",fontSize:12,padding:20}}>Nedostatek dat pro zvolený rok</div>;

  // Compute benchmark normalized values
  const benchmarkSeries = benchmarkOptions
    .filter(b => activeBenchmarks.includes(b.id) && benchmarks[b.id]?.length)
    .map(b => {
      const bData = benchmarks[b.id];
      const startDate = points[0].date;
      const endDate = points[points.length-1].date;
      const filtered = bData.filter(c => new Date(c.t) >= startDate && new Date(c.t) <= endDate);
      if (filtered.length < 2) return null;
      const basePrice = filtered[0].c;
      const portStart = points.find(p => p.current > 0)?.current || points[0].current || 1;
      return { ...b, pts: filtered.map(c => ({
        ratio: c.c / basePrice,
        ts: new Date(c.t),
      })), portStart, startDate, endDate };
    }).filter(Boolean);

  // Max value including benchmarks
  const maxVal = Math.max(
    ...points.map(v => Math.max(v.invested, v.current)),
    ...benchmarkSeries.flatMap(b => b.pts.map(p => b.portStart * p.ratio)),
    1
  );

  const w = 580, h = 180, pad = {t:10, b:28, l:66, r:10};
  const iW = w-pad.l-pad.r, iH = h-pad.t-pad.b;
  const xS = i => pad.l + (i/(points.length-1||1))*iW;
  const yS = v => pad.t + iH - (v/maxVal)*iH;
  const iPath = points.map((v,i)=>`${i===0?"M":"L"}${xS(i)},${yS(v.invested)}`).join(" ");
  const cPath = points.map((v,i)=>`${i===0?"M":"L"}${xS(i)},${yS(v.current)}`).join(" ");
  const aPath = cPath + ` L${xS(points.length-1)},${yS(0)} L${xS(0)},${yS(0)} Z`;
  const step = Math.max(1, Math.floor(points.length/8));

  const fmtK = v => v >= 1e6 ? (v/1e6).toFixed(1)+"M" : v >= 1e3 ? (v/1e3).toFixed(0)+"k" : v.toFixed(0);

  return (
    <div style={{overflowX:"auto"}}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",minWidth:300,height:"auto"}}>
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {[0,0.25,0.5,0.75,1].map(t=>(
          <g key={t}>
            <line x1={pad.l} y1={pad.t+iH*t} x2={w-pad.r} y2={pad.t+iH*t} stroke="#1e293b" strokeWidth="1"/>
            <text x={pad.l-4} y={pad.t+iH*t+4} textAnchor="end" fill="#8b9fc0" fontSize="8">{fmtK(maxVal*(1-t))}</text>
          </g>
        ))}
        {points.map((v,i) => i%step===0 && (
          <text key={i} x={xS(i)} y={h-4} textAnchor="middle" fill="#8b9fc0" fontSize="8">{v.label}</text>
        ))}
        <path d={aPath} fill="url(#ag)"/>
        <path d={iPath} fill="none" stroke="#334155" strokeWidth="1.5" strokeDasharray="4,3"/>
        <path d={cPath} fill="none" stroke="#6366f1" strokeWidth="2"/>
        <circle cx={xS(points.length-1)} cy={yS(points[points.length-1].current)} r="3" fill="#6366f1"/>
        {/* Benchmark lines */}
        {benchmarkSeries.map(b => {
          const startDate = b.startDate;
          const endDate = b.endDate;
          const totalMs = endDate - startDate || 1;
          const bPath = b.pts.map((p,i) => {
            const xPct = (p.ts - startDate) / totalMs;
            const bx = pad.l + xPct * iW;
            const by = yS(b.portStart * p.ratio);
            return `${i===0?"M":"L"}${bx},${by}`;
          }).join(" ");
          return <path key={b.id} d={bPath} fill="none" stroke={b.color} strokeWidth="1.8" opacity={0.9} strokeDasharray="6,2"/>;
        })}
      </svg>
      <div style={{display:"flex",gap:14,marginTop:6,fontSize:10,color:"#94a3b8",flexWrap:"wrap"}}>
        <span><span style={{color:"#6366f1"}}>──</span> Portfolio</span>
        <span><span style={{color:"#334155"}}>- -</span> Investováno</span>
        {benchmarkSeries.map(b=>(
          <span key={b.id}><span style={{color:b.color}}>- -</span> {b.label}</span>
        ))}
      </div>
    </div>
  );
};

// ─── FI GAUGE ────────────────────────────────────────────────────────────────
const FIGauge = ({ pct }) => {
  const clamped = Math.min(100, Math.max(0, pct));
  const angle = (clamped / 100) * 180 - 90;
  const r = 70, cx = 100, cy = 90;
  const arcX = cx + r * Math.cos((angle * Math.PI) / 180);
  const arcY = cy + r * Math.sin((angle * Math.PI) / 180);
  return (
    <svg viewBox="0 0 200 100" style={{ width: "100%", maxWidth: 260 }}>
      <defs>
        <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ef4444" /><stop offset="50%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <path d={`M${cx-r},${cy} A${r},${r} 0 0,1 ${cx+r},${cy}`} fill="none" stroke="#1e293b" strokeWidth="14" strokeLinecap="round" />
      <path d={`M${cx-r},${cy} A${r},${r} 0 0,1 ${arcX},${arcY}`} fill="none" stroke="url(#fg)" strokeWidth="14" strokeLinecap="round" />
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#f1f5f9" fontSize="22" fontWeight="700">{clamped.toFixed(0)}%</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#94a3b8" fontSize="9">FI Progress</text>
      <text x={cx-r} y={cy+18} textAnchor="middle" fill="#64748b" fontSize="8">0%</text>
      <text x={cx+r} y={cy+18} textAnchor="middle" fill="#64748b" fontSize="8">100%</text>
    </svg>
  );
};

// ─── FI PROJECTION CHART ──────────────────────────────────────────────────────
const FIProjectionChart = ({ currentCZK, monthlySaving, annualReturn, targetCZK }) => {
  const months = [];
  const monthlyReturn = annualReturn / 100 / 12;
  let balance = currentCZK;
  let reached = false;
  for (let m = 0; m <= 600 && !reached; m++) {
    months.push({ m, balance });
    if (balance >= targetCZK) reached = true;
    balance = balance * (1 + monthlyReturn) + monthlySaving;
  }
  if (months.length < 2) return null;
  const maxVal = Math.max(targetCZK * 1.1, months[months.length-1].balance);
  const w = 560, h = 140, pad = { t: 8, b: 28, l: 62, r: 8 };
  const iW = w - pad.l - pad.r, iH = h - pad.t - pad.b;
  const xS = (i) => pad.l + (i / (months.length - 1)) * iW;
  const yS = (v) => pad.t + iH - (v / maxVal) * iH;
  const path = months.map((p, i) => `${i===0?"M":"L"}${xS(i)},${yS(p.balance)}`).join(" ");
  const tY = yS(targetCZK);
  const step = Math.max(1, Math.floor(months.length / 6));
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", minWidth: 280, height: "auto" }}>
        {[0,0.25,0.5,0.75,1].map(t => (
          <g key={t}>
            <line x1={pad.l} y1={pad.t+iH*t} x2={w-pad.r} y2={pad.t+iH*t} stroke="#1e293b" strokeWidth="1"/>
            <text x={pad.l-4} y={pad.t+iH*t+4} textAnchor="end" fill="#8b9fc0" fontSize="8">{(maxVal*(1-t)/1000000).toFixed(1)}M</text>
          </g>
        ))}
        {months.filter((_,i)=>i%step===0).map((p,i)=>(
          <text key={i} x={xS(months.indexOf(months.filter((_,j)=>j%step===0)[i]))} y={h-4} textAnchor="middle" fill="#8b9fc0" fontSize="8">
            {Math.floor(p.m/12)}r
          </text>
        ))}
        <line x1={pad.l} y1={tY} x2={w-pad.r} y2={tY} stroke="#f59e0b" strokeWidth="1" strokeDasharray="4,3" />
        <text x={w-pad.r-2} y={tY-3} textAnchor="end" fill="#f59e0b" fontSize="8">FI cíl</text>
        <path d={path} fill="none" stroke="#10b981" strokeWidth="2" />
        <circle cx={xS(months.length-1)} cy={yS(months[months.length-1].balance)} r="3" fill="#10b981"/>
      </svg>
    </div>
  );
};

// ─── ANNUAL RETURN BAR CHART ─────────────────────────────────────────────────
const AnnualReturnChart = ({ transactions, prices, rates }) => {
  const buys = transactions.filter(t => t.type === "buy");
  if (!buys.length) return null;
  const firstYear = Math.min(...buys.map(t => new Date(t.date).getFullYear()));
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = firstYear; y <= currentYear; y++) years.push(y);

  const yearData = years.map(year => {
    const txSoFar = buys.filter(t => new Date(t.date).getFullYear() <= year);
    const txPrev = buys.filter(t => new Date(t.date).getFullYear() < year);
    const calc = (txList) => {
      let invested = 0; const h = {};
      txList.forEach(t => { invested += toCZK(t.quantity * t.price + t.fee, t.currency, rates); h[t.ticker] = (h[t.ticker]||0)+t.quantity; });
      let curr = 0;
      Object.entries(h).forEach(([tk,qty]) => { const p = prices[tk]; if(p) curr += toCZK(qty*p.price, p.currency, rates); });
      return { invested, curr };
    };
    const cur = calc(txSoFar);
    const prev = calc(txPrev);
    const gainCur = cur.curr - cur.invested;
    const gainPrev = prev.curr - prev.invested;
    return { year, gain: gainCur - gainPrev, pct: prev.curr > 0 ? ((cur.curr - prev.curr) / prev.curr * 100) : 0 };
  });

  const maxAbs = Math.max(...yearData.map(d => Math.abs(d.gain)), 1);
  const w = 400, h = 130, pad = { t: 8, b: 24, l: 50, r: 8 };
  const iW = w - pad.l - pad.r, iH = h - pad.t - pad.b;
  const barW = Math.max(8, (iW / years.length) - 6);
  const midY = pad.t + iH / 2;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", minWidth: 260, height: "auto" }}>
        <line x1={pad.l} y1={midY} x2={w-pad.r} y2={midY} stroke="#334155" strokeWidth="1"/>
        {yearData.map((d, i) => {
          const x = pad.l + (i / years.length) * iW + (iW / years.length - barW) / 2;
          const barH = Math.abs(d.gain) / maxAbs * (iH / 2);
          const y = d.gain >= 0 ? midY - barH : midY;
          return (
            <g key={d.year}>
              <rect x={x} y={y} width={barW} height={barH} fill={d.gain >= 0 ? "#10b981" : "#ef4444"} opacity={0.85} rx={2}/>
              <text x={x + barW/2} y={h-4} textAnchor="middle" fill="#8b9fc0" fontSize="8">{d.year}</text>
              <text x={x + barW/2} y={d.gain >= 0 ? y - 3 : y + barH + 10} textAnchor="middle" fill={d.gain >= 0 ? "#10b981" : "#ef4444"} fontSize="7">{d.pct.toFixed(1)}%</text>
            </g>
          );
        })}
        <text x={pad.l-4} y={pad.t+4} textAnchor="end" fill="#8b9fc0" fontSize="8">+</text>
        <text x={pad.l-4} y={pad.t+iH-2} textAnchor="end" fill="#8b9fc0" fontSize="8">–</text>
      </svg>
    </div>
  );
};

// ─── DCF / VALUATION ANALYZER ────────────────────────────────────────────────
const ValuationAnalyzer = ({ rates }) => {
  const [method, setMethod] = useState("dcf");
  const [ticker, setTicker] = useState("AAPL");
  const [tickerInput, setTickerInput] = useState("AAPL");
  const [currency, setCurrency] = useState("USD");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [livePrice, setLivePrice] = useState(null);
  const [priceError, setPriceError] = useState("");

  // DCF inputs
  const [dcf, setDcf] = useState({ currentPrice: 0, fcf: 100, shares: 15400, growthRate1: 12, growthRate2: 6, terminalRate: 3, discountRate: 10, years1: 5, years2: 5, cash: 162, debt: 108 });
  // Graham/Buffett
  const [graham, setGraham] = useState({ eps: 6.42, growthRate: 10, aaa_yield: 4.5, currentPrice: 0 });
  const [buffett, setBuffett] = useState({ bookValue: 4.0, roe: 35, requiredReturn: 15, years: 10, terminalPE: 15, currentPrice: 0, eps: 6.42 });
  // Technical
  const [tech, setTech] = useState({ prices52wHigh: 237.2, prices52wLow: 164.1, currentPrice: 0, ma50: 201.3, ma200: 195.8, rsi: 58, volume: 65, avgVolume: 58, pe: 33.2, sectorPE: 28 });

  // Fetch live price when ticker changes
  const fetchLivePrice = async (tk) => {
    if (!tk) return;
    setFetchingPrice(true); setPriceError(""); setLivePrice(null);
    try {
      // Try chart API first
      let price = null, curr = "USD";
      const res = await fetch(`/api/chart?ticker=${encodeURIComponent(tk)}&range=1d`);
      const data = await res.json();
      if (data.currentPrice && data.currentPrice > 0) {
        price = data.currentPrice;
        curr = data.currency || "USD";
      } else if (data.candles?.length) {
        price = data.candles[data.candles.length-1]?.c;
        curr = data.currency || "USD";
      }
      // Fallback: prices API
      if (!price || price === 0) {
        const res2 = await fetch("/api/prices", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({tickers:[tk.toUpperCase()]})
        });
        const d2 = await res2.json();
        const p2 = d2.prices?.[tk.toUpperCase()];
        if (p2?.price > 0) { price = p2.price; curr = p2.currency || "USD"; }
      }
      if (price && price > 0) {
        const p = parseFloat(price.toFixed(4));
        setLivePrice(p);
        setCurrency(curr);
        setDcf(prev=>({...prev, currentPrice:p}));
        setGraham(prev=>({...prev, currentPrice:p}));
        setBuffett(prev=>({...prev, currentPrice:p}));
        setTech(prev=>({...prev, currentPrice:p}));
        setPriceError("");
      } else {
        setPriceError("Cenu se nepodařilo načíst — zadej ručně do pole Aktuální cena");
      }
    } catch(e) { setPriceError("Chyba při načítání ceny: " + e.message); }
    setFetchingPrice(false);
  };

  const runDCF = () => {
    const d = dcf;
    let projectedFCF = d.fcf;
    let totalPV = 0;
    const discount = d.discountRate / 100;
    for (let i = 1; i <= d.years1; i++) {
      projectedFCF *= (1 + d.growthRate1 / 100);
      totalPV += projectedFCF / Math.pow(1 + discount, i);
    }
    for (let i = 1; i <= d.years2; i++) {
      projectedFCF *= (1 + d.growthRate2 / 100);
      totalPV += projectedFCF / Math.pow(1 + discount, d.years1 + i);
    }
    const terminalValue = projectedFCF * (1 + d.terminalRate / 100) / (discount - d.terminalRate / 100);
    const pvTerminal = terminalValue / Math.pow(1 + discount, d.years1 + d.years2);
    const equity = totalPV + pvTerminal + d.cash - d.debt;
    const intrinsic = equity / d.shares * 1000;
    const margin = ((intrinsic - d.currentPrice) / intrinsic * 100);
    return { intrinsic: intrinsic.toFixed(2), margin: margin.toFixed(1), verdict: margin > 20 ? "✅ Podhodnocená" : margin > 0 ? "⚠️ Mírně podhodnocená" : margin > -20 ? "🔶 Mírně nadhodnocená" : "❌ Nadhodnocená", pvOps: totalPV.toFixed(0), pvTerminal: pvTerminal.toFixed(0) };
  };

  const runGraham = () => {
    const g = graham;
    // Graham formula: V = EPS × (8.5 + 2g) × 4.4 / Y
    const intrinsic = g.eps * (8.5 + 2 * g.growthRate) * 4.4 / g.aaa_yield;
    const margin = ((intrinsic - g.currentPrice) / intrinsic * 100);
    const netNet = null; // requires balance sheet data
    return { intrinsic: intrinsic.toFixed(2), margin: margin.toFixed(1), verdict: margin > 33 ? "✅ Bezpečnostní marže OK" : margin > 0 ? "⚠️ Malá marže bezpečnosti" : "❌ Bez marže bezpečnosti" };
  };

  const runBuffett = () => {
    const b = buffett;
    // Owner earnings approach: project EPS growth
    let eps = b.eps;
    let totalPV = 0;
    const discount = b.requiredReturn / 100;
    for (let i = 1; i <= b.years; i++) {
      eps *= (1 + b.roe / 100 * 0.5); // simplified
      totalPV += eps / Math.pow(1 + discount, i);
    }
    const terminalVal = (eps * b.terminalPE) / Math.pow(1 + discount, b.years);
    const intrinsic = totalPV + terminalVal;
    const margin = ((intrinsic - b.currentPrice) / intrinsic * 100);
    const roe_ok = b.roe >= 15;
    return { intrinsic: intrinsic.toFixed(2), margin: margin.toFixed(1), roe_ok, verdict: margin > 25 ? "✅ Skvělá cena" : margin > 0 ? "⚠️ Přijatelná cena" : "❌ Příliš drahá" };
  };

  const runTechnical = () => {
    const t = tech;
    const signals = [];
    // Trend
    if (t.currentPrice > t.ma50 && t.ma50 > t.ma200) signals.push({ label: "Zlatý kříž (MA50>MA200)", val: "✅ Bullish", score: 2 });
    else if (t.currentPrice < t.ma50 && t.ma50 < t.ma200) signals.push({ label: "Mrtvý kříž (MA50<MA200)", val: "❌ Bearish", score: -2 });
    else signals.push({ label: "Trend MA", val: "⚠️ Smíšený", score: 0 });
    // RSI
    if (t.rsi < 30) signals.push({ label: `RSI ${t.rsi} – přeprodáno`, val: "✅ Kupní signál", score: 2 });
    else if (t.rsi > 70) signals.push({ label: `RSI ${t.rsi} – překoupeno`, val: "❌ Prodejní signál", score: -2 });
    else signals.push({ label: `RSI ${t.rsi} – neutrální`, val: "⚠️ Neutrální", score: 0 });
    // Volume
    const volRatio = t.volume / t.avgVolume;
    if (volRatio > 1.5) signals.push({ label: `Objem ${(volRatio*100).toFixed(0)}% prům.`, val: "✅ Zvýšená aktivita", score: 1 });
    else signals.push({ label: `Objem ${(volRatio*100).toFixed(0)}% prům.`, val: "⚠️ Normální", score: 0 });
    // 52W position
    const range52 = (t.currentPrice - t.prices52wLow) / (t.prices52wHigh - t.prices52wLow) * 100;
    if (range52 < 20) signals.push({ label: `52T rozsah: ${range52.toFixed(0)}%`, val: "✅ Blízko dna", score: 1 });
    else if (range52 > 80) signals.push({ label: `52T rozsah: ${range52.toFixed(0)}%`, val: "⚠️ Blízko vrcholu", score: -1 });
    else signals.push({ label: `52T rozsah: ${range52.toFixed(0)}%`, val: "📊 Střed pásma", score: 0 });
    // P/E vs sector
    const peRatio = t.pe / t.sectorPE;
    if (peRatio < 0.9) signals.push({ label: `P/E ${t.pe} vs sektor ${t.sectorPE}`, val: "✅ Pod sektorem", score: 1 });
    else if (peRatio > 1.3) signals.push({ label: `P/E ${t.pe} vs sektor ${t.sectorPE}`, val: "❌ Nad sektorem", score: -1 });
    else signals.push({ label: `P/E ${t.pe} vs sektor ${t.sectorPE}`, val: "⚠️ Na úrovni sektoru", score: 0 });

    const totalScore = signals.reduce((s, sg) => s + sg.score, 0);
    const verdict = totalScore >= 3 ? "✅ Silný nákupní signál" : totalScore >= 1 ? "⚠️ Mírně pozitivní" : totalScore <= -3 ? "❌ Silný prodejní signál" : totalScore <= -1 ? "⚠️ Mírně negativní" : "📊 Neutrální";
    return { signals, totalScore, verdict, range52: range52.toFixed(0) };
  };

  const calculate = () => {
    setLoading(true);
    setTimeout(() => {
      try {
        if (method === "dcf") setResult({ type: "dcf", ...runDCF() });
        else if (method === "graham") setResult({ type: "graham", ...runGraham() });
        else if (method === "buffett") setResult({ type: "buffett", ...runBuffett() });
        else setResult({ type: "tech", ...runTechnical() });
      } catch (e) { setResult({ error: "Chyba výpočtu: " + e.message }); }
      setLoading(false);
    }, 300);
  };

  const S2 = {
    card: { background: "#0d1424", border: "1px solid #1e293b", borderRadius: 8, padding: 16, marginBottom: 12 },
    label: { fontSize: 10, color: "#8b9fc0", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 },
    input: { background: "#0a0f1e", border: "1px solid #334155", borderRadius: 5, color: "#e2e8f0", padding: "6px 10px", fontSize: 12, fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
    select: { background: "#0a0f1e", border: "1px solid #334155", borderRadius: 5, color: "#e2e8f0", padding: "6px 10px", fontSize: 12, fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 },
    sectionTitle: { fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid #1e293b" },
    resultCard: (color) => ({ background: color + "11", border: `1px solid ${color}33`, borderRadius: 8, padding: 16, marginTop: 12 }),
    metricRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #0f172a", fontSize: 12 },
  };

  const fldNum = (key, label, state, setState, step = "1") => (
    <div>
      <div style={S2.label}>{label}</div>
      <input type="number" step={step} value={state[key]} onChange={e => setState(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))} style={S2.input} />
    </div>
  );

  return (
    <div>
      {/* Header + method select */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{flex:1,minWidth:120}}>
          <div style={S2.label}>Ticker / Název</div>
          <input value={tickerInput} onChange={e => setTickerInput(e.target.value.toUpperCase())}
            onKeyDown={e=>{ if(e.key==="Enter"){ setTicker(tickerInput); fetchLivePrice(tickerInput); }}}
            style={{ ...S2.input, width:"100%", textTransform:"uppercase" }} placeholder="AAPL, NVDA..."/>
        </div>
        <button onClick={()=>{ setTicker(tickerInput); fetchLivePrice(tickerInput); }}
          style={{background:"linear-gradient(135deg,#4f46e5,#6366f1)",color:"#fff",border:"none",
            borderRadius:6,padding:"8px 16px",cursor:"pointer",fontSize:12,fontFamily:"inherit",
            fontWeight:700,whiteSpace:"nowrap",marginBottom:1}}>
          {fetchingPrice?"⟳ Načítám...":"↻ Načíst cenu"}
        </button>
        {livePrice && (
          <div style={{padding:"6px 12px",background:"#10b98122",border:"1px solid #10b98144",
            borderRadius:8,fontSize:11,fontWeight:700,color:"#10b981",whiteSpace:"nowrap"}}>
            {ticker}: {livePrice.toFixed(2)} {currency}
          </div>
        )}
      </div>
      {priceError && <div style={{fontSize:11,color:"#f87171",marginBottom:8,padding:"6px 10px",background:"#f8717111",borderRadius:6}}>⚠ {priceError}</div>}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={S2.label}>Měna</div>
          <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...S2.select, width: 80 }}>
            {["USD","EUR","CZK"].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={S2.label}>Metoda analýzy</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["dcf","DCF"],["graham","Graham"],["buffett","Buffett"],["tech","Technická"]].map(([v,l]) => (
              <button key={v} style={{ background: method===v?"linear-gradient(135deg,#4f46e5,#6366f1)":"#1e293b", color: method===v?"#fff":"#94a3b8", border:"none", borderRadius:5, padding:"6px 12px", cursor:"pointer", fontSize:11, fontFamily:"inherit", fontWeight:600 }} onClick={() => { setMethod(v); setResult(null); }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Input panel */}
        <div>
          {method === "dcf" && (
            <div style={S2.card}>
              <div style={S2.sectionTitle}>DCF – Discounted Cash Flow</div>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>Výpočet vnitřní hodnoty na základě diskontovaných budoucích volných cash flow. Zlatý standard fundamentální analýzy.</div>
              <div style={S2.row}>
                {fldNum("currentPrice","Aktuální cena",dcf,setDcf,"0.01")}
                {fldNum("fcf","FCF (mil.)",dcf,setDcf,"0.1")}
                {fldNum("shares","Počet akcií (mil.)",dcf,setDcf,"0.1")}
                {fldNum("discountRate","Diskontní sazba (%)",dcf,setDcf,"0.1")}
                {fldNum("growthRate1",`Růst 1. fáze (${dcf.years1}r) %`,dcf,setDcf,"0.1")}
                {fldNum("growthRate2",`Růst 2. fáze (${dcf.years2}r) %`,dcf,setDcf,"0.1")}
                {fldNum("terminalRate","Terminální míra růstu %",dcf,setDcf,"0.1")}
                {fldNum("cash","Hotovost (mld.)",dcf,setDcf,"0.1")}
                {fldNum("debt","Dluh (mld.)",dcf,setDcf,"0.1")}
              </div>
            </div>
          )}
          {method === "graham" && (
            <div style={S2.card}>
              <div style={S2.sectionTitle}>Grahamova formule vnitřní hodnoty</div>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>V = EPS × (8.5 + 2g) × 4.4 / Y. Benjamin Graham – otec hodnotového investování. Vyžaduje marži bezpečnosti min. 33%.</div>
              <div style={S2.row}>
                {fldNum("currentPrice","Aktuální cena",graham,setGraham,"0.01")}
                {fldNum("eps","EPS (zisk/akcie)",graham,setGraham,"0.01")}
                {fldNum("growthRate","Oček. roční růst EPS %",graham,setGraham,"0.1")}
                {fldNum("aaa_yield","Výnos AAA dluhopisů %",graham,setGraham,"0.1")}
              </div>
              <div style={{ fontSize: 10, color: "#8b9fc0", padding: "8px", background: "#0a0f1e", borderRadius: 5 }}>
                💡 Graham preferoval akcie s P/E &lt; 15, P/B &lt; 1.5 a dividendovým výnosem &gt; 2/3 výnosu AAA dluhopisu.
              </div>
            </div>
          )}
          {method === "buffett" && (
            <div style={S2.card}>
              <div style={S2.sectionTitle}>Buffettův přístup – Owner Earnings</div>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>Buffett hledá podniky s trvale vysokou ROE, silným příkopem (moat) a nakupuje je se slevou. Klíčová kritéria: ROE &gt; 15%, stabilní growth, management integrity.</div>
              <div style={S2.row}>
                {fldNum("currentPrice","Aktuální cena",buffett,setBuffett,"0.01")}
                {fldNum("eps","EPS (zisk/akcie)",buffett,setBuffett,"0.01")}
                {fldNum("roe","ROE (%)",buffett,setBuffett,"0.1")}
                {fldNum("requiredReturn","Požadovaný výnos %",buffett,setBuffett,"0.1")}
                {fldNum("years","Horizont (roky)",buffett,setBuffett,"1")}
                {fldNum("terminalPE","Terminální P/E",buffett,setBuffett,"0.5")}
              </div>
            </div>
          )}
          {method === "tech" && (
            <div style={S2.card}>
              <div style={S2.sectionTitle}>Technická analýza</div>
              <div style={{ fontSize: 10, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>Analýza trendů, momentum indikátorů a tržní dynamiky. Kombinuje klouzavé průměry, RSI, objem a relativní pozici v 52T pásmu.</div>
              <div style={S2.row}>
                {fldNum("currentPrice","Aktuální cena",tech,setTech,"0.01")}
                {fldNum("ma50","MA50",tech,setTech,"0.01")}
                {fldNum("ma200","MA200",tech,setTech,"0.01")}
                {fldNum("rsi","RSI (0-100)",tech,setTech,"0.1")}
                {fldNum("prices52wHigh","52T maximum",tech,setTech,"0.01")}
                {fldNum("prices52wLow","52T minimum",tech,setTech,"0.01")}
                {fldNum("volume","Dnešní objem (mil.)",tech,setTech,"0.1")}
                {fldNum("avgVolume","Průměrný objem (mil.)",tech,setTech,"0.1")}
                {fldNum("pe","P/E akcie",tech,setTech,"0.1")}
                {fldNum("sectorPE","P/E sektoru",tech,setTech,"0.1")}
              </div>
            </div>
          )}
          <button onClick={calculate} style={{ background:"linear-gradient(135deg,#4f46e5,#6366f1)", color:"#fff", border:"none", borderRadius:6, padding:"10px 24px", cursor:"pointer", fontSize:12, fontFamily:"inherit", fontWeight:700, width:"100%", letterSpacing:"0.05em" }}>
            {loading ? "Počítám..." : "🔍 Vypočítat vnitřní hodnotu"}
          </button>
        </div>

        {/* Result panel */}
        <div>
          {result && !result.error && (
            <>
              {(result.type === "dcf" || result.type === "graham" || result.type === "buffett") && (
                <div style={S2.resultCard(result.margin > 0 ? "#10b981" : "#ef4444")}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>VÝSLEDEK ANALÝZY · {ticker}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: result.margin > 0 ? "#10b981" : "#ef4444", marginBottom: 4 }}>
                    {result.intrinsic} {currency}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>Vnitřní (férová) hodnota</div>
                  <div style={{ ...S2.metricRow }}>
                    <span style={{ color: "#94a3b8" }}>Aktuální cena</span>
                    <span style={{ color: "#f1f5f9", fontWeight: 600 }}>{(method==="dcf"?dcf:method==="graham"?graham:buffett).currentPrice} {currency}</span>
                  </div>
                  <div style={S2.metricRow}>
                    <span style={{ color: "#94a3b8" }}>Marže bezpečnosti</span>
                    <span style={{ color: result.margin > 0 ? "#10b981" : "#ef4444", fontWeight: 700 }}>{result.margin}%</span>
                  </div>
                  {result.pvOps && (
                    <div style={S2.metricRow}>
                      <span style={{ color: "#94a3b8" }}>PV provozní CF</span>
                      <span style={{ color: "#f1f5f9" }}>{fmt(parseFloat(result.pvOps)*1e6, currency, 0)}</span>
                    </div>
                  )}
                  {result.roe_ok !== undefined && (
                    <div style={S2.metricRow}>
                      <span style={{ color: "#94a3b8" }}>ROE kritérium</span>
                      <span style={{ color: result.roe_ok ? "#10b981":"#ef4444" }}>{result.roe_ok ? "✅ Splněno (≥15%)":"❌ Nesplněno"}</span>
                    </div>
                  )}
                  <div style={{ marginTop: 12, padding: "10px 14px", background: "#0a0f1e", borderRadius: 6, fontSize: 13, fontWeight: 700, textAlign: "center" }}>{result.verdict}</div>
                  {/* Visual margin bar */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, color: "#8b9fc0", marginBottom: 4 }}>Potenciál zhodnocení</div>
                    <div style={{ height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, result.margin))}%`, background: result.margin > 20 ? "linear-gradient(90deg,#059669,#10b981)" : result.margin > 0 ? "linear-gradient(90deg,#d97706,#f59e0b)" : "#ef4444", transition: "width 0.5s" }} />
                    </div>
                  </div>
                </div>
              )}
              {result.type === "tech" && (
                <div style={S2.card}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>TECHNICKÁ ANALÝZA · {ticker}</div>
                  <div style={{ marginBottom: 12, padding: "10px 14px", background: "#0a0f1e", borderRadius: 6, fontSize: 13, fontWeight: 700, textAlign: "center" }}>{result.verdict}</div>
                  {/* Score gauge */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "#8b9fc0" }}>Skóre:</div>
                    <div style={{ flex: 1, height: 8, background: "#1e293b", borderRadius: 4, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${(result.totalScore+6)/12*100}%`, background:"linear-gradient(90deg,#ef4444,#f59e0b,#10b981)", transition:"width 0.5s", minWidth:4 }} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight:700, color: result.totalScore>0?"#10b981":result.totalScore<0?"#ef4444":"#94a3b8" }}>{result.totalScore > 0 ? "+" : ""}{result.totalScore}/6</div>
                  </div>
                  {result.signals.map((sg, i) => (
                    <div key={i} style={S2.metricRow}>
                      <span style={{ color: "#94a3b8", fontSize: 11 }}>{sg.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>{sg.val}</span>
                    </div>
                  ))}
                  <div style={S2.metricRow}>
                    <span style={{ color: "#94a3b8" }}>Pozice v 52T pásmu</span>
                    <div style={{ flex: 1, margin: "0 8px", height: 4, background: "#1e293b", borderRadius: 2, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${result.range52}%`, background:"#6366f1" }} />
                    </div>
                    <span style={{ fontSize: 11, color:"#6366f1" }}>{result.range52}%</span>
                  </div>
                </div>
              )}
              {/* Disclaimer */}
              <div style={{ fontSize: 10, color: "#334155", marginTop: 10, lineHeight: 1.5, padding: "8px 12px", background: "#0d1424", borderRadius: 5, border: "1px solid #1e293b" }}>
                ⚠️ Pouze informativní výpočet. Není investiční doporučení. Výsledky závisí na přesnosti vstupních dat. Vždy proveď vlastní due diligence.
              </div>
            </>
          )}
          {result?.error && <div style={{ color: "#ef4444", padding: 12 }}>{result.error}</div>}
          {!result && (
            <div style={{ ...S2.card, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, color: "#334155", fontSize: 12, textAlign: "center", lineHeight: 1.7 }}>
              Vyber metodu analýzy,<br/>zadej vstupní parametry<br/>a klikni na Vypočítat
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// ─── CSV IMPORT MODAL ────────────────────────────────────────────────────────
const EXPECTED_COLS = ["type","ticker","name","category","date","quantity","price","currency","fee","dividendAmount","notes"];

const CSV_TEMPLATE = `type,ticker,name,category,date,quantity,price,currency,fee,dividendAmount,notes
buy,AAPL,Apple Inc.,stock,2024-01-15,10,185.50,USD,1.5,,
buy,VWCE,Vanguard FTSE All-World,etf,2024-02-01,3,105.20,EUR,2.0,,
buy,BTC,Bitcoin,crypto,2024-03-10,0.05,62000,USD,10,,
sell,AAPL,Apple Inc.,stock,2024-06-01,5,210.00,USD,1.5,,
dividend,AAPL,Apple Inc.,stock,2024-05-16,,,USD,,23.50,Q1 2024`;

// Try to auto-detect broker format and normalize columns
function detectAndParse(rows, headers) {
  const h = headers.map(x => x.toLowerCase().trim().replace(/[" ]/g,""));
  
  // Degiro format detection
  const isDegiro = h.includes("product") || h.includes("isin");
  // Trading212 detection  
  const isT212 = h.includes("action") && h.includes("shareid");
  // XTB detection
  const isXTB = h.includes("symbol") && h.includes("type") && h.includes("open price");
  // Interactive Brokers
  const isIB = h.includes("symbol") && h.includes("tradeprice");

  return rows.map((row, idx) => {
    const get = (keys) => {
      for (const k of keys) {
        const i = h.indexOf(k);
        if (i !== -1 && row[i] !== undefined) return (row[i]||"").toString().trim().replace(/^"|"$/g,"");
      }
      return "";
    };

    let tx = { id: `csv_${Date.now()}_${idx}` };

    if (isDegiro) {
      // Degiro: Date,Time,Product,ISIN,Description,FX,Change,,,,Order ID
      const desc = get(["description"]);
      const isDiv = /dividend|dividenda|div/i.test(desc);
      const isBuy = /koup|buy|nákup/i.test(desc) || parseFloat(get(["change","","quantity"])||"0") > 0;
      tx.type = isDiv ? "dividend" : isBuy ? "buy" : "sell";
      tx.ticker = get(["isin","product"]).split(" ")[0].toUpperCase() || "?";
      tx.name = get(["product","name"]);
      tx.category = "stock";
      tx.date = get(["date"]).replace(/\//g,"-").replace(/(\d{2})-(\d{2})-(\d{4})/,"$3-$2-$1");
      tx.quantity = Math.abs(parseFloat(get(["quantity","change"])||"0"));
      tx.price = parseFloat(get(["price","close price"])||"0");
      tx.currency = get(["fx","currency","mena"]) || "EUR";
      tx.fee = Math.abs(parseFloat(get(["fee","transaction costs"])||"0"));
      tx.dividendAmount = isDiv ? Math.abs(parseFloat(get(["change","amount"])||"0")) : 0;
    } else if (isT212) {
      // Trading 212: Action,Time,ISIN,Ticker,Name,No. of shares,Price / share,Currency (Price / share),...
      const action = get(["action"]).toLowerCase();
      tx.type = action.includes("buy") ? "buy" : action.includes("sell") ? "sell" : action.includes("dividend") ? "dividend" : "buy";
      tx.ticker = get(["ticker","shareid"]).toUpperCase();
      tx.name = get(["name","instrument name"]);
      tx.category = "stock";
      tx.date = get(["time","date"]).slice(0,10);
      tx.quantity = parseFloat(get(["no.ofshares","shares","quantity"])||"0");
      tx.price = parseFloat(get(["price/share","price"])||"0");
      tx.currency = get(["currency(price/share)","currency"]) || "USD";
      tx.fee = parseFloat(get(["charges","fee","commission"])||"0");
      tx.dividendAmount = tx.type==="dividend" ? parseFloat(get(["total","amount"])||"0") : 0;
    } else {
      // Native format or generic — map directly
      tx.type = (get(["type"])||"buy").toLowerCase();
      tx.ticker = get(["ticker","symbol","product"]).toUpperCase();
      tx.name = get(["name","product","company"]) || tx.ticker;
      const cat = get(["category","assetclass","type2"]).toLowerCase();
      tx.category = cat.includes("etf") ? "etf" : cat.includes("crypto") ? "crypto" : "stock";
      tx.date = get(["date","datetime","datum"]).slice(0,10);
      tx.quantity = parseFloat(get(["quantity","qty","shares","mnozstvi"])||"0");
      tx.price = parseFloat(get(["price","cena","closeprice","open price"])||"0");
      tx.currency = (get(["currency","mena","ccy"])||"USD").toUpperCase().slice(0,3);
      tx.fee = parseFloat(get(["fee","poplatek","commission","charges"])||"0");
      tx.dividendAmount = parseFloat(get(["dividendamount","dividend","amount"])||"0");
      tx.notes = get(["notes","poznamka","comment","remarks"]);
    }

    // Fix date format variations
    if (tx.date && tx.date.includes(".")) {
      const parts = tx.date.split(".");
      if (parts.length === 3) {
        tx.date = parts[2].length === 4
          ? `${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`
          : `20${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
      }
    }

    tx.notes = tx.notes || "";
    return tx;
  }).filter(t => t.ticker && t.ticker !== "?" && t.date && t.date.length >= 8);
}

function parseCsv(text) {
  // Handle both comma and semicolon delimiters
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [], error: "Soubor je prázdný nebo má jen jeden řádek" };
  
  const delim = lines[0].includes(";") ? ";" : ",";
  const splitLine = (line) => {
    const result = [];
    let cur = "", inQuote = false;
    for (const ch of line) {
      if (ch === '"' ) { inQuote = !inQuote; }
      else if (ch === delim && !inQuote) { result.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    result.push(cur.trim());
    return result;
  };

  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(l => splitLine(l));
  return { headers, rows, error: null };
}

function CsvImportModal({ onClose, onImport, S }) {
  const [step, setStep] = useState("upload"); // upload | preview | done
  const [parsed, setParsed] = useState([]);
  const [selected, setSelected] = useState({});
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [detectedFormat, setDetectedFormat] = useState("native");
  const fileRef = useState(null);

  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const { headers, rows, error: parseError } = parseCsv(text);
      if (parseError) { setError(parseError); return; }
      
      // Detect format
      const h = headers.map(x => x.toLowerCase().trim().replace(/[" ]/g,""));
      const fmt = h.includes("product") || h.includes("isin") ? "Degiro"
        : h.includes("action") && h.includes("shareid") ? "Trading 212"
        : h.includes("symbol") && h.includes("tradeprice") ? "Interactive Brokers"
        : h.includes("symbol") && h.includes("open price") ? "XTB"
        : "InvestTrack / vlastní";
      setDetectedFormat(fmt);

      const txs = detectAndParse(rows, headers);
      if (!txs.length) { setError("Nepodařilo se načíst žádné transakce. Zkontroluj formát souboru."); return; }
      
      setParsed(txs);
      const sel = {};
      txs.forEach(t => sel[t.id] = true);
      setSelected(sel);
      setStep("preview");
      setError("");
    };
    reader.readAsText(file, "UTF-8");
  };

  const toggleAll = (val) => {
    const sel = {};
    parsed.forEach(t => sel[t.id] = val);
    setSelected(sel);
  };

  const doImport = () => {
    const toImport = parsed.filter(t => selected[t.id]);
    if (!toImport.length) return;
    onImport(toImport);
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "investtrack-sablona.csv";
    a.click();
  };

  const typeColor = { buy:"#10b981", sell:"#ef4444", dividend:"#8b5cf6" };
  const typeLabel = { buy:"Nákup", sell:"Prodej", dividend:"Dividenda" };
  const catColor2 = { stock:"#6366f1", etf:"#10b981", crypto:"#f59e0b", real_estate:"#f97316", cash:"#22d3a0" };
  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div style={S.modal} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modalBox, maxWidth: step === "preview" ? 900 : 560 }}>
        
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:"#f1f5f9" }}>📂 Hromadný import transakcí</div>
            <div style={{ fontSize:10, color:"#8b9fc0", marginTop:3 }}>CSV · Degiro · Trading 212 · XTB · Interactive Brokers</div>
          </div>
          <button style={{ ...S.btn("outline"), padding:"4px 10px" }} onClick={onClose}>✕</button>
        </div>

        {/* Steps indicator */}
        <div style={{ display:"flex", gap:0, marginBottom:20 }}>
          {[["upload","1. Nahrát"],["preview","2. Náhled & úpravy"],["done","3. Importováno"]].map(([s,l],i) => (
            <div key={s} style={{ flex:1, textAlign:"center", padding:"6px 0", fontSize:10, fontWeight:600,
              color: step===s?"#6366f1": (step==="preview"&&s==="upload")||(step==="done") ?"#10b981":"#334155",
              borderBottom: step===s?"2px solid #6366f1":"2px solid #1e293b",
              letterSpacing:"0.05em", textTransform:"uppercase" }}>
              {l}
            </div>
          ))}
        </div>

        {/* STEP 1 – Upload */}
        {step === "upload" && (
          <>
            {/* Drop zone */}
            <div
              style={{ border:"2px dashed #334155", borderRadius:10, padding:"36px 20px", textAlign:"center", cursor:"pointer", marginBottom:16, transition:"border-color 0.2s" }}
              onClick={() => document.getElementById("csv-file-input").click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor="#6366f1"; }}
              onDragLeave={e => { e.currentTarget.style.borderColor="#334155"; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor="#334155"; handleFile(e.dataTransfer.files[0]); }}
            >
              <div style={{ fontSize:32, marginBottom:10 }}>📁</div>
              <div style={{ fontSize:13, color:"#94a3b8", fontWeight:600, marginBottom:6 }}>Přetáhni CSV soubor sem</div>
              <div style={{ fontSize:11, color:"#8b9fc0", marginBottom:14 }}>nebo klikni pro výběr souboru</div>
              <div style={{ display:"inline-block", background:"#1e293b", color:"#94a3b8", padding:"7px 18px", borderRadius:6, fontSize:11, fontWeight:600 }}>Vybrat soubor</div>
              <input id="csv-file-input" type="file" accept=".csv,.txt" style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])} />
            </div>

            {error && <div style={{ color:"#ef4444", fontSize:12, padding:"8px 12px", background:"#ef444411", borderRadius:6, marginBottom:14 }}>⚠ {error}</div>}

            {/* Supported formats */}
            <div style={{ background:"#0a0f1e", borderRadius:8, padding:14, marginBottom:16 }}>
              <div style={{ fontSize:10, color:"#8b9fc0", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Podporované formáty</div>
              {[
                ["InvestTrack šablona","Přímý import, nejspolehlivější","#10b981"],
                ["Degiro","Automatická detekce sloupců","#6366f1"],
                ["Trading 212","Automatická detekce sloupců","#6366f1"],
                ["XTB / Interactive Brokers","Automatická detekce sloupců","#6366f1"],
                ["Vlastní CSV","Pokud obsahuje: ticker, date, quantity, price, currency","#f59e0b"],
              ].map(([name,desc,col],i) => (
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:7 }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:col, marginTop:4, flexShrink:0 }}/>
                  <div>
                    <span style={{ color:"#e2e8f0", fontSize:11, fontWeight:600 }}>{name}</span>
                    <span style={{ color:"#8b9fc0", fontSize:10, marginLeft:8 }}>{desc}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Template download */}
            <div style={{ display:"flex", gap:10, alignItems:"center", padding:"12px 14px", background:"#0d1424", border:"1px solid #1e293b", borderRadius:7 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, color:"#f1f5f9", fontWeight:600, marginBottom:2 }}>Stáhnout šablonu CSV</div>
                <div style={{ fontSize:10, color:"#8b9fc0" }}>Prázdná šablona s ukázkovými daty pro InvestTrack formát</div>
              </div>
              <button style={{ ...S.btn("outline"), whiteSpace:"nowrap", padding:"7px 14px" }} onClick={downloadTemplate}>📥 Šablona</button>
            </div>
          </>
        )}

        {/* STEP 2 – Preview */}
        {step === "preview" && (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8 }}>
              <div style={{ fontSize:11, color:"#94a3b8" }}>
                Soubor: <b style={{color:"#f1f5f9"}}>{fileName}</b> · 
                Formát: <b style={{color:"#6366f1"}}>{detectedFormat}</b> · 
                Nalezeno: <b style={{color:"#10b981"}}>{parsed.length} transakcí</b>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button style={{ ...S.btn("outline"), padding:"5px 10px", fontSize:10 }} onClick={() => toggleAll(true)}>Vybrat vše</button>
                <button style={{ ...S.btn("outline"), padding:"5px 10px", fontSize:10 }} onClick={() => toggleAll(false)}>Odznačit vše</button>
              </div>
            </div>

            <div style={{ overflowX:"auto", maxHeight:"45vh", overflowY:"auto", border:"1px solid #1e293b", borderRadius:6, marginBottom:14 }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead style={{ position:"sticky", top:0, background:"#0d1424" }}>
                  <tr>
                    <th style={{ padding:"8px 10px", textAlign:"center", fontSize:10, color:"#8b9fc0", borderBottom:"1px solid #1e293b", width:36 }}>✓</th>
                    {["Typ","Ticker","Kategorie","Datum","Množství","Cena","Měna","Poplatek","Poznámka"].map(h => (
                      <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontSize:10, color:"#8b9fc0", borderBottom:"1px solid #1e293b", whiteSpace:"nowrap", letterSpacing:"0.06em", textTransform:"uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((t, i) => {
                    const isInvalid = !t.date || t.date.length < 8 || (!t.quantity && t.type!=="dividend");
                    return (
                      <tr key={t.id} style={{ background: isInvalid ? "#ef444408" : i%2===0 ? "#0a0f1e" : "transparent", opacity: selected[t.id] ? 1 : 0.4 }}>
                        <td style={{ padding:"7px 10px", textAlign:"center" }}>
                          <input type="checkbox" checked={!!selected[t.id]} onChange={e => setSelected(prev => ({...prev,[t.id]:e.target.checked}))} style={{ cursor:"pointer", accentColor:"#6366f1" }} />
                        </td>
                        <td style={{ padding:"7px 10px" }}>
                          <span style={{ display:"inline-block", padding:"2px 6px", borderRadius:3, fontSize:10, fontWeight:600, background:(typeColor[t.type]||"#94a3b8")+"22", color:typeColor[t.type]||"#94a3b8" }}>
                            {typeLabel[t.type]||t.type}
                          </span>
                        </td>
                        <td style={{ padding:"7px 10px", fontWeight:700, color:"#f1f5f9" }}>{t.ticker}</td>
                        <td style={{ padding:"7px 10px" }}>
                          <span style={{ display:"inline-block", padding:"2px 6px", borderRadius:3, fontSize:10, fontWeight:600, background:(catColor2[t.category]||"#64748b")+"22", color:catColor2[t.category]||"#64748b" }}>
                            {t.category}
                          </span>
                        </td>
                        <td style={{ padding:"7px 10px", color: isInvalid?"#ef4444":"#94a3b8" }}>{t.date||"❌ chybí"}</td>
                        <td style={{ padding:"7px 10px", color:"#e2e8f0" }}>{t.quantity||"–"}</td>
                        <td style={{ padding:"7px 10px", color:"#e2e8f0" }}>{t.price||"–"}</td>
                        <td style={{ padding:"7px 10px", color:"#94a3b8" }}>{t.currency}</td>
                        <td style={{ padding:"7px 10px", color:"#64748b" }}>{t.fee||"–"}</td>
                        <td style={{ padding:"7px 10px", color:"#8b9fc0", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.notes||"–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
              <div style={{ fontSize:11, color:"#94a3b8" }}>
                Vybrán{selectedCount===1?"a":selectedCount>4?"o":""} <b style={{color:"#6366f1"}}>{selectedCount}</b> z {parsed.length} transakcí
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button style={{ ...S.btn("outline"), padding:"9px 16px" }} onClick={() => { setStep("upload"); setError(""); }}>← Zpět</button>
                <button style={{ ...S.btn("primary"), padding:"9px 20px" }} onClick={doImport} disabled={selectedCount===0}>
                  ✓ Importovat {selectedCount > 0 ? selectedCount : ""} transakcí
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// ─── NEWS TAB COMPONENT ───────────────────────────────────────────────────────
function NewsTab({ portfolio, S, t=T.cs }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState("vse");
  const [error, setError] = useState("");
  const [lastFetched, setLastFetched] = useState(null);

  const tickers = portfolio.positions.map(p => p.ticker).filter(t => !["VKLAD","VÝBĚR"].includes(t));

  const fetchNews = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/news", { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error("Server vrátil chybu " + res.status);
      const data = await res.json();
      if (!data.items || data.items.length === 0) {
        setError("Žádné novinky k dispozici. Zkus to znovu za chvíli.");
        setLoading(false);
        return;
      }
      const enriched = data.items.map(item => ({
        ...item,
        date: new Date(item.date),
        tickers: tickers.filter(t =>
          item.title.toLowerCase().includes(t.toLowerCase()) ||
          (item.desc||"").toLowerCase().includes(t.toLowerCase())
        ),
        isPortfolio: tickers.some(t =>
          item.title.toLowerCase().includes(t.toLowerCase()) ||
          (item.desc||"").toLowerCase().includes(t.toLowerCase())
        ),
      }));
      setNews(enriched);
      setLastFetched(new Date());
    } catch(e) {
      setError("Nepodařilo se načíst novinky: " + e.message);
    }
    setLoading(false);
  };

  useEffect(() => { fetchNews(); }, []);

  const filtered = activeFilter === "vse" ? news
    : activeFilter === "portfolio" ? news.filter(n => n.isPortfolio)
    : news.filter(n => n.tickers.includes(activeFilter));

  const portfolioNews = news.filter(n => n.isPortfolio).length;

  return (
    <>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700, color:"#f1f5f9" }}>📰 Novinky & Zprávy</div>
          {lastFetched && <div style={{ fontSize:10, color:"#8b9fc0", marginTop:2 }}>Aktualizováno: {lastFetched.toLocaleTimeString("cs-CZ")}</div>}
        </div>
        <button style={{ ...S.btn("primary"), padding:"7px 14px" }} onClick={fetchNews} disabled={loading}>
          {loading ? "⟳ Načítám..." : t.refresh}
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
        {[
          ["vse", `${t.all} (${news.length})`],
          ["portfolio", `${t.myPortfolio} (${portfolioNews})`],
          ...tickers.slice(0,8).map(tk => [tk, tk]),
        ].map(([val, label]) => (
          <button key={val} style={{ ...S.btn(activeFilter===val?"primary":"outline"), padding:"5px 12px", fontSize:10 }}
            onClick={() => setActiveFilter(val)}>{label}</button>
        ))}
      </div>

      {error && (
        <div style={{ color:"#ef4444", fontSize:12, padding:"12px 16px", background:"#ef444411", borderRadius:6, marginBottom:14, border:"1px solid #ef444433" }}>
          ⚠ {error}
          <div style={{ fontSize:10, color:"#64748b", marginTop:4 }}>Zkus kliknout na Aktualizovat. Některé RSS zdroje mohou být dočasně nedostupné.</div>
        </div>
      )}

      {loading && (
        <div style={{ display:"flex", gap:10, flexDirection:"column" }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ background:"#0d1424", border:"1px solid #1e293b", borderRadius:8, padding:16, animation:"pulse 1.5s infinite" }}>
              <div style={{ height:12, background:"#1e293b", borderRadius:4, width:"70%", marginBottom:8 }}/>
              <div style={{ height:8, background:"#1e293b", borderRadius:4, width:"40%" }}/>
            </div>
          ))}
        </div>
      )}

      {!loading && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtered.length === 0 && !error && (
            <div style={{ color:"#8b9fc0", fontSize:12, textAlign:"center", padding:40 }}>
              {activeFilter === "portfolio" ? "Žádné novinky o tvých akciích" : "Žádné novinky"}
            </div>
          )}
          {filtered.map((n, i) => (
            <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
              <div style={{ background:"#0d1424", border:`1px solid ${n.isPortfolio?"#6366f133":"#1e293b"}`, borderLeft:`3px solid ${n.isPortfolio?"#6366f1":"#1e293b"}`, borderRadius:8, padding:"14px 16px", cursor:"pointer", transition:"border-color 0.2s" }}
                onMouseEnter={e=>e.currentTarget.style.borderColor="#334155"}
                onMouseLeave={e=>e.currentTarget.style.borderColor=n.isPortfolio?"#6366f133":"#1e293b"}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:6 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:"#f1f5f9", lineHeight:1.4, flex:1 }}>{n.title}</div>
                  <div style={{ fontSize:9, color:"#8b9fc0", whiteSpace:"nowrap", flexShrink:0, marginTop:2 }}>
                    {n.date.toLocaleDateString("cs-CZ")}
                  </div>
                </div>
                {n.desc && <div style={{ fontSize:11, color:"#64748b", lineHeight:1.5, marginBottom:8 }}>{n.desc}...</div>}
                <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                  <span style={{ fontSize:9, color:"#8b9fc0", background:"#1e293b", padding:"2px 8px", borderRadius:10 }}>{n.source}</span>
                  {n.tickers.map(t => (
                    <span key={t} style={{ fontSize:9, color:"#6366f1", background:"#6366f111", padding:"2px 8px", borderRadius:10, fontWeight:700 }}>{t}</span>
                  ))}
                  {n.isPortfolio && <span style={{ fontSize:9, color:"#10b981", background:"#10b98111", padding:"2px 8px", borderRadius:10 }}>📊 tvé portfolio</span>}
                  <span style={{ fontSize:9, color:"#334155", marginLeft:"auto" }}>→ přejít na článek</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </>
  );
}


// ─── MINI SVG LINE/BAR CHART ─────────────────────────────────────────────────
const MiniChart = ({ data, type="bar", color="#6c63ff", label="", unit="", height=140, darkMode=true }) => {
  const [tooltip, setTooltip] = useState(null); // {x, y, label, value}

  if (!data || data.length < 2) return <div style={{color:"#8b9fc0",fontSize:11,padding:20,textAlign:"center"}}>Nedostatek dat</div>;
  const vals = data.map(d => d.value);
  const min = Math.min(...vals, 0); const max = Math.max(...vals, 0.001);
  const range = max - min || 1;
  const w = 440, h = height, pad = { t:48, b:36, l:58, r:12 }; // t:48 = room for tooltip
  const iW = w-pad.l-pad.r, iH = h-pad.t-pad.b;
  const xS = i => pad.l + (i/(data.length-1||1))*iW;
  const yS = v => pad.t + iH - ((v-min)/range)*iH;
  const barW = Math.max(6, (iW/data.length) - 5);
  const bg = darkMode ? "#0f1628" : "#e8edf5";
  const gridColor = darkMode ? "#1e2d45" : "#d0d8e8";
  const labelColor = darkMode ? "#5a7399" : "#6a7fa0";
  const textColor = darkMode ? "#c8d8f0" : "#2a3a5a";
  const tooltipBg = darkMode ? "#1e2d45" : "#ffffff";
  const tooltipBorder = darkMode ? "#3d5580" : "#c0ccdd";

  const fmtV = v => {
    const abs = Math.abs(v);
    if (abs >= 1e9) return (v/1e9).toFixed(2)+"B";
    if (abs >= 1e6) return (v/1e6).toFixed(2)+"M";
    if (abs >= 1000) return (v/1000).toFixed(1)+"K";
    return Number.isInteger(v) ? v.toString() : v.toFixed(2);
  };

  // Convert SVG coords to container % for tooltip positioning
  const showTooltip = (e, d, svgX, svgY) => {
    const rect = e.currentTarget.closest("svg").getBoundingClientRect();
    const scaleX = rect.width / w;
    const scaleY = rect.height / h;
    const px = svgX * scaleX;
    const py = svgY * scaleY;
    setTooltip({ px, py, label: d.label, value: d.value });
  };

  return (
    <div style={{background:bg, borderRadius:12, padding:"8px 4px", overflowX:"auto", position:"relative"}}>
      {/* Tooltip — always visible, positioned inside chart */}
      {tooltip && (
        <div style={{
          position:"absolute", pointerEvents:"none", zIndex:50,
          left: "50%", top: 4,
          transform:"translateX(-50%)",
          background:tooltipBg, border:`1px solid ${tooltipBorder}`,
          borderRadius:10, padding:"7px 16px", whiteSpace:"nowrap",
          boxShadow:"0 6px 20px rgba(0,0,0,0.4)",
          display:"flex", alignItems:"center", gap:10,
        }}>
          <span style={{fontSize:11,color:labelColor,fontWeight:700}}>{tooltip.label}</span>
          <span style={{fontSize:14,color:tooltip.value>=0?color:"#f87171",fontWeight:800,letterSpacing:"0.02em"}}>
            {fmtV(tooltip.value)}{unit}
          </span>
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",minWidth:280,height:"auto",overflow:"visible"}}
        onMouseLeave={()=>setTooltip(null)}>
        <defs>
          <linearGradient id={`g_${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.5"/>
            <stop offset="100%" stopColor={color} stopOpacity="0.05"/>
          </linearGradient>
        </defs>
        {[0,0.25,0.5,0.75,1].map((t,i)=>{
          const v = max - range*t;
          return (
            <g key={i}>
              <line x1={pad.l} y1={pad.t+iH*t} x2={w-pad.r} y2={pad.t+iH*t} stroke={gridColor} strokeWidth="1"/>
              <text x={pad.l-6} y={pad.t+iH*t+4} textAnchor="end" fill={labelColor} fontSize="9" fontWeight="600">
                {fmtV(v)}{unit}
              </text>
            </g>
          );
        })}
        {min < 0 && max > 0 && (
          <line x1={pad.l} y1={yS(0)} x2={w-pad.r} y2={yS(0)} stroke={darkMode?"#4a6080":"#8899bb"} strokeWidth="1.5" strokeDasharray="4,3"/>
        )}

        {/* Tooltip crosshair vertical line */}
        {tooltip && type!=="line" && (
          <line x1={tooltip._svgX||0} y1={pad.t} x2={tooltip._svgX||0} y2={h-pad.b}
            stroke={color} strokeWidth="1" strokeDasharray="3,2" opacity="0.5"/>
        )}

        {type === "bar" && data.map((d,i) => {
          const bx = pad.l + (i/data.length)*iW + (iW/data.length-barW)/2;
          const isPos = d.value >= 0;
          const bH = Math.max(2, Math.abs((d.value-(min<0?0:min))/range*iH));
          const by = isPos ? yS(Math.max(d.value,0)) : yS(0);
          const c = d.value >= 0 ? color : "#f87171";
          const isHovered = tooltip?.label === d.label;
          const showVal = barW > 20;
          const centerX = bx + barW/2;
          return (
            <g key={i} style={{cursor:"pointer"}}
              onMouseEnter={e=>showTooltip(e, d, centerX, by)}
              onTouchStart={e=>{e.preventDefault();showTooltip(e.touches[0]||e, d, centerX, by);}}>
              {/* Invisible wider hit area for easy touch */}
              <rect x={bx-6} y={pad.t} width={barW+12} height={iH} fill="transparent"/>
              <rect x={bx} y={by} width={barW} height={bH}
                fill={c} opacity={isHovered?1:0.85} rx={3}
                style={{filter:isHovered?"brightness(1.3)":"none", transition:"all 0.15s"}}/>
              {showVal && (
                <text x={centerX} y={isPos?by-4:by+bH+11} textAnchor="middle"
                  fill={isHovered?c:textColor} fontSize="7.5" fontWeight="700">
                  {fmtV(d.value)}{unit}
                </text>
              )}
              <text x={centerX} y={h-6} textAnchor="middle" fill={isHovered?color:labelColor} fontSize="8.5" fontWeight={isHovered?"800":"600"}>{d.label}</text>
            </g>
          );
        })}

        {type === "line" && (
          <>
            <path d={data.map((d,i)=>`${i===0?"M":"L"}${xS(i)},${yS(d.value)}`).join(" ")+
              ` L${xS(data.length-1)},${h-pad.b} L${xS(0)},${h-pad.b} Z`}
              fill={`url(#g_${label})`}/>
            <path d={data.map((d,i)=>`${i===0?"M":"L"}${xS(i)},${yS(d.value)}`).join(" ")}
              fill="none" stroke={color} strokeWidth="2.5"/>
            {data.map((d,i)=>{
              const cx=xS(i), cy2=yS(d.value);
              const isHovered = tooltip?.label === d.label;
              return (
                <g key={i} style={{cursor:"pointer"}}
                  onMouseEnter={e=>showTooltip(e, d, cx, cy2)}
                  onTouchStart={e=>{e.preventDefault();showTooltip(e.touches[0]||e, d, cx, cy2);}}>
                  <circle cx={cx} cy={cy2} r={isHovered?6:3.5}
                    fill={color} stroke={bg} strokeWidth="1.5"
                    style={{transition:"r 0.15s"}}/>
                  {/* Wide invisible touch target */}
                  <circle cx={cx} cy={cy2} r="16" fill="transparent"/>
                  {!isHovered && <text x={cx} y={cy2-9} textAnchor="middle" fill={textColor} fontSize="8" fontWeight="700">{fmtV(d.value)}{unit}</text>}
                  <text x={cx} y={h-6} textAnchor="middle" fill={isHovered?color:labelColor} fontSize="8.5" fontWeight={isHovered?"800":"600"}>{d.label}</text>
                </g>
              );
            })}
            {/* Vertical crosshair for line */}
            {tooltip && (() => {
              const idx = data.findIndex(d=>d.label===tooltip.label);
              if(idx<0) return null;
              return <line x1={xS(idx)} y1={pad.t} x2={xS(idx)} y2={h-pad.b} stroke={color} strokeWidth="1" strokeDasharray="3,2" opacity="0.5"/>;
            })()}
          </>
        )}

        {type === "combo" && data.map((d,i) => {
          const bx = pad.l + (i/data.length)*iW + (iW/data.length-barW)/2;
          const isPos = d.value >= 0;
          const bH = Math.max(2, Math.abs(yS(0)-yS(d.value)));
          const by = isPos ? yS(d.value) : yS(0);
          const c = d.value >= 0 ? color : "#f87171";
          const isHovered = tooltip?.label === d.label;
          const centerX = bx + barW/2;
          return (
            <g key={i} style={{cursor:"pointer"}}
              onMouseEnter={e=>showTooltip(e, d, centerX, by)}
              onTouchStart={e=>{e.preventDefault();showTooltip(e.touches[0]||e, d, centerX, by);}}>
              <rect x={bx-6} y={pad.t} width={barW+12} height={iH} fill="transparent"/>
              <rect x={bx} y={by} width={barW} height={bH}
                fill={c} opacity={isHovered?1:0.82} rx={3}
                style={{filter:isHovered?"brightness(1.3)":"none",transition:"all 0.15s"}}/>
              <text x={centerX} y={isPos?by-4:by+bH+11} textAnchor="middle"
                fill={isHovered?c:textColor} fontSize="7.5" fontWeight="700">
                {fmtV(d.value)}{unit}
              </text>
              <text x={centerX} y={h-6} textAnchor="middle" fill={isHovered?color:labelColor} fontSize="8.5" fontWeight={isHovered?"800":"600"}>{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}


// ─── CANDLESTICK CHART COMPONENT ─────────────────────────────────────────────
function CandlestickChart({ ticker: initialTicker, S }) {
  const [ticker, setTicker] = useState(initialTicker || "AAPL");
  const [inputTicker, setInputTicker] = useState(initialTicker || "AAPL");
  const [range, setRange] = useState("1y");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tooltip, setTooltip] = useState(null);

  const RANGES = [
    { id:"1d", label:"1D" },
    { id:"1mo", label:"1M" },
    { id:"ytd", label:"YTD" },
    { id:"1y", label:"1R" },
    { id:"10y", label:"10R" },
    { id:"max", label:"Max" },
  ];

  const fetchChart = async (t, r) => {
    setLoading(true); setError(""); setTooltip(null);
    try {
      const res = await fetch(`/api/chart?ticker=${encodeURIComponent(t)}&range=${r}`);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
      setTicker(t.toUpperCase());
    } catch(e) {
      setError("Nepodařilo se načíst data: " + e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (initialTicker) {
      setInputTicker(initialTicker);
      fetchChart(initialTicker, range);
    }
  }, [initialTicker]);

  const darkBg = "#0f1628";
  const gridC = "#1e2d45";
  const upC = "#22d3a0";
  const dnC = "#f87171";
  const textC = "#c8d8f0";
  const mutedC = "#5a7399";

  // Chart dimensions
  const W = 580, H = 260, VOL_H = 50;
  const PAD = { t: 20, b: 36, l: 62, r: 10, volGap: 8 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;
  const totalH = H + VOL_H + PAD.volGap + PAD.b; // include bottom padding for X labels

  const candles = data?.candles || [];

  // Compute scales
  const visibleCandles = candles;
  const minL = visibleCandles.length ? Math.min(...visibleCandles.map(c => c.l)) : 0;
  const maxH = visibleCandles.length ? Math.max(...visibleCandles.map(c => c.h)) : 1;
  const priceRange = maxH - minL || 1;
  const maxVol = Math.max(...visibleCandles.map(c => c.v), 1);

  const xS = (i) => PAD.l + (i + 0.5) / visibleCandles.length * iW;
  const yS = (v) => PAD.t + iH - ((v - minL) / priceRange) * iH;
  const yVol = (v) => H + PAD.volGap + VOL_H - (v / maxVol) * VOL_H;

  const candleW = Math.max(1, Math.min(12, iW / visibleCandles.length - 1));

  // Format date based on range
  const fmtT = (ts) => {
    const d = new Date(ts);
    if (range === "1d") return d.toLocaleTimeString("cs-CZ", { hour:"2-digit", minute:"2-digit" });
    if (range === "1mo") return d.toLocaleDateString("cs-CZ", { day:"2-digit", month:"short" });
    if (range === "ytd" || range === "1y") return d.toLocaleDateString("cs-CZ", { month:"short", year:"2-digit" });
    if (range === "10y") return d.toLocaleDateString("cs-CZ", { month:"short", year:"numeric" });
    if (range === "max") return d.toLocaleDateString("cs-CZ", { year:"numeric" });
    return d.toLocaleDateString("cs-CZ", { month:"2-digit", year:"2-digit" });
  };

  // Two-line tick label: main + sub
  const fmtTSub = (ts) => {
    const d = new Date(ts);
    if (range === "1d") return d.toLocaleDateString("cs-CZ", { day:"2-digit", month:"2-digit" });
    if (range === "1mo") return null; // already has day+month
    if (range === "ytd" || range === "1y") return null;
    if (range === "10y" || range === "max") return null;
    return null;
  };

  const fmtPrice = (v) => v != null ? v.toFixed(2) : "–";

  // Tick marks on X axis — density varies by range
  const tickCount = range === "1d" ? 8 : range === "1mo" ? 7 : range === "ytd" ? 6 : range === "1y" ? 6 : range === "10y" ? 8 : 8;
  const xTicks = visibleCandles.length > 0
    ? visibleCandles.filter((_, i) => i % Math.max(1, Math.floor(visibleCandles.length / tickCount)) === 0)
    : [];

  // Y ticks
  const yTicks = [0, 0.2, 0.4, 0.6, 0.8, 1].map(t => minL + priceRange * (1 - t));

  // Price change
  const firstClose = candles[0]?.c;
  const lastClose = candles[candles.length - 1]?.c;
  const priceChange = firstClose && lastClose ? lastClose - firstClose : 0;
  const pctChange = firstClose ? (priceChange / firstClose * 100) : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap", alignItems:"flex-end" }}>
        <div style={{ flex:1, minWidth:140 }}>
          <div style={{ fontSize:10, color:mutedC, marginBottom:5 }}>Ticker</div>
          <div style={{ display:"flex", gap:6 }}>
            <input value={inputTicker} onChange={e=>setInputTicker(e.target.value.toUpperCase())}
              onKeyDown={e=>e.key==="Enter"&&fetchChart(inputTicker,range)}
              placeholder="AAPL" style={{...S.input, width:120, textTransform:"uppercase"}}/>
            <button style={{...S.btn("primary"),padding:"8px 14px"}}
              onClick={()=>fetchChart(inputTicker,range)}>
              {loading?"⟳":"📈"}
            </button>
          </div>
        </div>
        {/* Range buttons */}
        <div style={{ display:"flex", gap:4 }}>
          {RANGES.map(r=>(
            <button key={r.id}
              style={{...S.btn(range===r.id?"primary":"outline"),padding:"6px 12px",fontSize:11,fontWeight:700}}
              onClick={()=>{ setRange(r.id); fetchChart(ticker,r.id); }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{color:"#f87171",fontSize:12,padding:"8px 12px",background:"#f8717111",borderRadius:6,marginBottom:10}}>{error}</div>}

      {/* Stock info bar */}
      {data && (
        <div style={{ display:"flex", gap:16, marginBottom:10, alignItems:"baseline", flexWrap:"wrap" }}>
          <div style={{ fontSize:16, fontWeight:800, color:textC }}>{ticker}</div>
          <div style={{ fontSize:13, color:mutedC }}>{data.shortName}</div>
          {lastClose && (
            <>
              <div style={{ fontSize:18, fontWeight:700, color:textC }}>{fmtPrice(lastClose)} {data.currency}</div>
              <div style={{ fontSize:13, fontWeight:600, color:priceChange>=0?upC:dnC }}>
                {priceChange>=0?"+":""}{fmtPrice(priceChange)} ({pctChange>=0?"+":""}{pctChange.toFixed(2)}%)
              </div>
              <div style={{fontSize:10,color:mutedC}}>· {range.toUpperCase()}</div>
            </>
          )}
          {tooltip && (
            <div style={{ fontSize:11, color:mutedC, marginLeft:"auto" }}>
              {fmtT(tooltip.t)} · O:{fmtPrice(tooltip.o)} H:{fmtPrice(tooltip.h)} L:{fmtPrice(tooltip.l)} C:{fmtPrice(tooltip.c)}
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      {loading && (
        <div style={{ background:darkBg, borderRadius:12, height:300, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ color:"#6c63ff", fontSize:13 }}>⟳ Načítám historická data...</div>
        </div>
      )}

      {!loading && candles.length > 0 && (
        <div style={{ background:darkBg, borderRadius:12, padding:"12px 4px 4px", overflowX:"auto" }}
          onMouseLeave={()=>setTooltip(null)}>
          <svg viewBox={`0 0 ${W} ${totalH}`} style={{ width:"100%", minWidth:320, height:"auto" }}>
            {/* Grid lines */}
            {yTicks.map((v, i) => (
              <g key={i}>
                <line x1={PAD.l} y1={yS(v)} x2={W-PAD.r} y2={yS(v)} stroke={gridC} strokeWidth="1"/>
                <text x={PAD.l-6} y={yS(v)+4} textAnchor="end" fill={mutedC} fontSize="8.5" fontWeight="600">
                  {v.toFixed(v > 1000 ? 0 : 2)}
                </text>
              </g>
            ))}

            {/* X axis ticks */}
            {xTicks.map((c, i) => {
              const idx = candles.indexOf(c);
              const sub = fmtTSub(c.t);
              return (
                <g key={i}>
                  <line x1={xS(idx)} y1={H+PAD.volGap+VOL_H} x2={xS(idx)} y2={H+PAD.volGap+VOL_H+3}
                    stroke={mutedC} strokeWidth="1"/>
                  <text x={xS(idx)} y={H+PAD.volGap+VOL_H+12} textAnchor="middle" fill={mutedC} fontSize="8.5" fontWeight="600">
                    {fmtT(c.t)}
                  </text>
                  {sub && (
                    <text x={xS(idx)} y={H+PAD.volGap+VOL_H+22} textAnchor="middle" fill={mutedC} fontSize="7.5" opacity="0.7">
                      {sub}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Volume bars */}
            {visibleCandles.map((c, i) => (
              <rect key={`v${i}`}
                x={xS(i) - candleW/2} y={yVol(c.v)}
                width={candleW} height={H + PAD.volGap + VOL_H - yVol(c.v)}
                fill={c.c >= c.o ? upC : dnC} opacity={0.4}/>
            ))}

            {/* Candlesticks */}
            {visibleCandles.map((c, i) => {
              const isUp = c.c >= c.o;
              const color = isUp ? upC : dnC;
              const bodyTop = yS(Math.max(c.o, c.c));
              const bodyBot = yS(Math.min(c.o, c.c));
              const bodyH = Math.max(1, bodyBot - bodyTop);
              const isHovered = tooltip?.t === c.t;

              return (
                <g key={i} style={{cursor:"crosshair"}}
                  onMouseEnter={()=>setTooltip(c)}
                  onTouchStart={e=>{e.preventDefault();setTooltip(c);}}>
                  {/* Wide invisible touch zone */}
                  <rect x={xS(i)-Math.max(8,candleW/2+4)} y={PAD.t} width={Math.max(16,candleW+8)} height={iH} fill="transparent"/>
                  {/* High-low wick */}
                  <line x1={xS(i)} y1={yS(c.h)} x2={xS(i)} y2={yS(c.l)}
                    stroke={isHovered?"#ffffff":color} strokeWidth={isHovered?1.5:1}/>
                  {/* Body */}
                  <rect x={xS(i)-candleW/2} y={bodyTop} width={candleW} height={bodyH}
                    fill={isUp?"transparent":color}
                    stroke={color} strokeWidth={isHovered?1.5:1}
                    opacity={isHovered?1:0.9}/>
                  {isUp && <rect x={xS(i)-candleW/2} y={bodyTop} width={candleW} height={bodyH}
                    fill={color} opacity={isHovered?0.9:0.7}/>}
                </g>
              );
            })}

            {/* Crosshair vertical line when hovered */}
            {tooltip && (() => {
              const idx = candles.findIndex(c => c.t === tooltip.t);
              if (idx < 0) return null;
              return <line x1={xS(idx)} y1={PAD.t} x2={xS(idx)} y2={H+PAD.volGap+VOL_H}
                stroke="#ffffff" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.4"/>;
            })()}

            {/* Current price line - only show if within chart range */}
            {data?.currentPrice && data.currentPrice >= minL && data.currentPrice <= maxH && (
              <g>
                <line x1={PAD.l} y1={yS(data.currentPrice)} x2={W-PAD.r} y2={yS(data.currentPrice)}
                  stroke="#6c63ff" strokeWidth="1" strokeDasharray="4,3" opacity="0.6"/>
              </g>
            )}

            {/* Volume label */}
            <text x={PAD.l-6} y={H+PAD.volGap+8} textAnchor="end" fill={mutedC} fontSize="7">VOL</text>

            {/* Axes */}
            <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H} stroke={gridC} strokeWidth="1"/>
            <line x1={PAD.l} y1={H} x2={W-PAD.r} y2={H} stroke={gridC} strokeWidth="1"/>
          </svg>
          <div style={{ display:"flex", gap:16, padding:"4px 8px 8px", fontSize:10, color:mutedC }}>
            <span><span style={{color:upC}}>█</span> Růst</span>
            <span><span style={{color:dnC}}>█</span> Pokles</span>
            <span>· {range.toUpperCase()} · {candles.length} period</span>
          </div>
        </div>
      )}

      {!loading && candles.length === 0 && !error && (
        <div style={{ background:darkBg, borderRadius:12, height:200, display:"flex", alignItems:"center",
          justifyContent:"center", color:mutedC, fontSize:12 }}>
          Zadej ticker a klikni na 📈
        </div>
      )}
    </div>
  );
}

// ─── FUNDAMENTAL CHARTS COMPONENT ────────────────────────────────────────────
const FundamentalCharts = ({ S }) => {
  const [ticker, setTicker] = useState("AAPL");
  const [inputTicker, setInputTicker] = useState("AAPL");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [activeChart, setActiveChart] = useState("overview");

  const fetchFundamentals = async (t) => {
    setLoading(true); setError(""); setData(null);
    try {
      // Volá Vercel serverless proxy (api/claude.js) — skryje API klíč
      const resp = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: (() => {
                const cy = new Date().getFullYear();
                const sy = cy - 9;
                const yrs = Array.from({length:10},(_,i)=>String(sy+i));
                return `Dnešní datum je ${cy}. Pro akciový ticker ${t.toUpperCase()} vrať fundamentální finanční data od roku ${sy} do roku ${cy} jako JSON objekt BEZ jakéhokoliv textu nebo markdown, pouze čistý JSON.

DŮLEŽITÉ: Pole years MUSÍ obsahovat roky ${sy} až ${cy}. Pro rok ${cy} použij nejnovější dostupná data (TTM nebo fiskální rok ${cy}).

Struktura:
{
  "ticker": "${t.toUpperCase()}",
  "name": "celý název společnosti",
  "sector": "sektor",
  "currency": "USD",
  "currentPrice": číslo,
  "marketCap": číslo v miliardách,
  "years": ${JSON.stringify(yrs)},
  "revenue": [čísla v miliardách USD pro každý rok],
  "netIncome": [čísla v miliardách USD pro každý rok],
  "ebitda": [čísla v miliardách USD pro každý rok],
  "freeCashFlow": [čísla v miliardách USD pro každý rok],
  "eps": [čísla pro každý rok],
  "dividendPerShare": [čísla pro každý rok, 0 pokud neplatí],
  "peRatio": [čísla pro každý rok, null pokud záporné EPS],
  "totalDebt": [čísla v miliardách USD pro každý rok],
  "cashAndEquivalents": [čísla v miliardách USD pro každý rok],
  "sharesOutstanding": [čísla v miliardách pro každý rok],
  "roe": [procenta pro každý rok],
  "grossMargin": [procenta pro každý rok],
  "operatingMargin": [procenta pro každý rok],
  "netMargin": [procenta pro každý rok],
  "summary": "2-3 věty o fundamentální kvalitě společnosti v češtině"
}

Každé pole musí mít přesně 10 hodnot odpovídající rokům ${sy}-${cy}. Použij skutečná historická data. Pokud ticker neexistuje, vrať {"error": "Ticker nenalezen"}.`;
              })()
          }]
        })
      });
      if (!resp.ok) {
        let errMsg = `HTTP ${resp.status}`;
        try { const eb = await resp.json(); errMsg = eb.error || JSON.stringify(eb); } catch {}
        setError("API chyba: " + (typeof errMsg === "object" ? JSON.stringify(errMsg) : String(errMsg)));
        setLoading(false);
        return;
      }
      const json = await resp.json();
      // Handle API-level errors
      if (json.error) {
        const apiErr = typeof json.error === "object" ? (json.error.message || JSON.stringify(json.error)) : String(json.error);
        setError("API chyba: " + apiErr);
        setLoading(false);
        return;
      }
      const text = json.content?.[0]?.text || "";
      if (!text) {
        setError("Prázdná odpověď od API. Zkontroluj ANTHROPIC_API_KEY na Vercelu.");
        setLoading(false);
        return;
      }
      const cleaned = text.replace(/```json|```/g,"").trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.error) { setError(parsed.error); setLoading(false); return; }
      setData(parsed);
      setTicker(t.toUpperCase());
    } catch(e) {
      setError("Chyba při načítání dat: " + e.message);
    }
    setLoading(false);
  };

  const mkData = (key) => !data ? [] : (data.years||[]).map((y,i) => ({
    label: y.toString().slice(2),
    value: (data[key]||[])[i] ?? null
  })).filter(d => d.value !== null);

  const CHARTS = [
    { id:"overview", label:"Přehled" },
    { id:"revenue", label:"Revenue & Marže" },
    { id:"profit", label:"Ziskovost" },
    { id:"cashflow", label:"Free Cash Flow" },
    { id:"dividends", label:"Dividendy" },
    { id:"debt", label:"Dluh & Hotovost" },
    { id:"shares", label:"Počet akcií" },
    { id:"valuation", label:"Valuace" },
    { id:"margins", label:"Marže" },
  ];

  const StatRow = ({label, value, color="#94a3b8"}) => (
    <div style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #0f172a",fontSize:11}}>
      <span style={{color:"#8b9fc0"}}>{label}</span>
      <span style={{color,fontWeight:600}}>{value}</span>
    </div>
  );

  const ChartCard = ({title, children, desc}) => (
    <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:8,padding:16,marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4}}>{title}</div>
      {desc && <div style={{fontSize:10,color:"#334155",marginBottom:10}}>{desc}</div>}
      {children}
    </div>
  );

  const upC = v => v >= 0 ? "#10b981" : "#ef4444";

  return (
    <div>
      {/* Ticker search */}
      <div style={{display:"flex",gap:10,marginBottom:20,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:140}}>
          <div style={{fontSize:10,color:"#8b9fc0",marginBottom:5}}>Ticker akcie / ETF</div>
          <input value={inputTicker} onChange={e=>setInputTicker(e.target.value.toUpperCase())}
            onKeyDown={e=>e.key==="Enter"&&fetchFundamentals(inputTicker)}
            placeholder="AAPL, MSFT, NVDA..." style={S.input}/>
        </div>
        <button style={{...S.btn("primary"),padding:"9px 24px",fontSize:12}}
          onClick={()=>fetchFundamentals(inputTicker)} disabled={loading}>
          {loading?"⟳ Načítám...":"📊 Načíst grafy"}
        </button>
        {/* Quick tickers */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {["AAPL","MSFT","NVDA","JNJ","KO","O"].map(t=>(
            <button key={t} style={{...S.btn("outline"),padding:"6px 10px",fontSize:10,
              border:ticker===t?"1px solid #6366f1":"1px solid #334155",
              color:ticker===t?"#6366f1":"#64748b"}}
              onClick={()=>{setInputTicker(t);fetchFundamentals(t);}}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{color:"#ef4444",background:"#ef444411",border:"1px solid #ef444433",borderRadius:6,padding:"10px 14px",marginBottom:14,fontSize:12}}>⚠ {error}</div>}

      {loading && (
        <div style={{textAlign:"center",padding:60}}>
          <div style={{fontSize:32,marginBottom:12}}>⟳</div>
          <div style={{color:"#6366f1",fontSize:13,fontWeight:600}}>Načítám fundamentální data pro {inputTicker}...</div>
          <div style={{color:"#8b9fc0",fontSize:11,marginTop:6}}>AI analyzuje historická data posledních 10 let</div>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:"#f1f5f9"}}>{data.ticker} — {data.name}</div>
              <div style={{fontSize:11,color:"#8b9fc0",marginTop:2}}>{data.sector} · {data.currency} · Tržní cap: <b style={{color:"#94a3b8"}}>{data.marketCap?.toFixed(1)}B</b></div>
              {data.summary && <div style={{fontSize:11,color:"#64748b",marginTop:6,maxWidth:600,lineHeight:1.5,fontStyle:"italic"}}>"{data.summary}"</div>}
            </div>

          </div>

          {/* Chart tabs */}
          <div style={{display:"flex",gap:4,marginBottom:16,flexWrap:"wrap"}}>
            {CHARTS.map(c=>(
              <button key={c.id} style={{...S.btn(activeChart===c.id?"primary":"outline"),padding:"5px 12px",fontSize:10}}
                onClick={()=>setActiveChart(c.id)}>{c.label}</button>
            ))}
          </div>

          {/* OVERVIEW */}
          {activeChart==="overview" && (
            <div style={{display:"grid",gridTemplateColumns:window.innerWidth<768?"1fr":"1fr 1fr",gap:12}}>
              <div>
                <ChartCard title="Revenue (mld.)" desc="Roční tržby v miliardách USD">
                  <MiniChart data={mkData("revenue")} type="bar" color="#6366f1" label="rev"/>
                </ChartCard>
                <ChartCard title="Free Cash Flow (mld.)" desc="Volný peněžní tok — klíčový ukazatel zdraví firmy">
                  <MiniChart data={mkData("freeCashFlow")} type="bar" color="#10b981" label="fcf"/>
                </ChartCard>
              </div>
              <div>
                <ChartCard title="EPS (zisk na akcii)" desc="Earnings Per Share v USD">
                  <MiniChart data={mkData("eps")} type="line" color="#f59e0b" label="eps"/>
                </ChartCard>
                <ChartCard title="Klíčové ukazatele">
                  {data.years?.slice(-1).map(()=>(
                    <div key="k">
                      {[
                        ["Revenue (TTM)", `${data.revenue?.slice(-1)[0]?.toFixed(1)}B ${data.currency}","#f1f5f9`],
                        ["Net Income (TTM)", `${data.netIncome?.slice(-1)[0]?.toFixed(1)}B`, upC(data.netIncome?.slice(-1)[0]||0)],
                        ["FCF (TTM)", `${data.freeCashFlow?.slice(-1)[0]?.toFixed(1)}B`, upC(data.freeCashFlow?.slice(-1)[0]||0)],
                        ["EPS (TTM)", `${data.eps?.slice(-1)[0]?.toFixed(2)} ${data.currency}`, upC(data.eps?.slice(-1)[0]||0)],
                        ["P/E ratio", data.peRatio?.slice(-1)[0]?.toFixed(1)||"N/A", "#94a3b8"],
                        ["EBITDA (TTM)", `${data.ebitda?.slice(-1)[0]?.toFixed(1)}B`, "#94a3b8"],
                        ["Aktuální cena", data.currentPrice ? `${data.currentPrice} ${data.currency}` : "–", "#22d3a0"],
                        ["Dividenda/akcie", `${data.dividendPerShare?.slice(-1)[0]?.toFixed(2)||"0"} ${data.currency}`, "#8b5cf6"],
                        ["Čistá marže", `${data.netMargin?.slice(-1)[0]?.toFixed(1)||"N/A"}%`, "#10b981"],
                        ["ROE", `${data.roe?.slice(-1)[0]?.toFixed(1)||"N/A"}%`, upC(data.roe?.slice(-1)[0]||0)],
                        ["Celkový dluh", `${data.totalDebt?.slice(-1)[0]?.toFixed(1)||"N/A"}B`, "#ef4444"],
                        ["Hotovost", `${data.cashAndEquivalents?.slice(-1)[0]?.toFixed(1)||"N/A"}B`, "#10b981"],
                        ["Čistý dluh", `${((data.totalDebt?.slice(-1)[0]||0)-(data.cashAndEquivalents?.slice(-1)[0]||0)).toFixed(1)}B`, "#94a3b8"],
                      ].map(([l,v,c],i)=><StatRow key={i} label={l} value={v} color={c||"#94a3b8"}/>)}
                    </div>
                  ))}
                </ChartCard>
              </div>
            </div>
          )}

          {/* REVENUE & MARŽE */}
          {activeChart==="revenue" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <ChartCard title="Revenue — tržby (mld. USD)" desc="Celkové roční tržby">
                <MiniChart data={mkData("revenue")} type="bar" color="#6366f1" label="rv" height={165}/>
              </ChartCard>
              <ChartCard title="EBITDA (mld. USD)" desc="Zisk před úroky, daněmi, odpisy a amortizací">
                <MiniChart data={mkData("ebitda")} type="bar" color="#3b82f6" label="eb" height={165}/>
              </ChartCard>
              <ChartCard title="Net Income — čistý zisk (mld. USD)" desc="Zisk po zdanění">
                <MiniChart data={mkData("netIncome")} type="combo" color="#10b981" label="ni" height={165}/>
              </ChartCard>
              <ChartCard title="Hrubá marže (%)" desc="Gross Margin — efektivita výroby/prodeje">
                <MiniChart data={mkData("grossMargin")} type="line" color="#f59e0b" label="gm" unit="%" height={165}/>
              </ChartCard>
            </div>
          )}

          {/* ZISKOVOST */}
          {activeChart==="profit" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <ChartCard title="EPS — zisk na akcii (USD)" desc="Earnings Per Share — klíčový ukazatel růstu">
                <MiniChart data={mkData("eps")} type="combo" color="#f59e0b" label="eps" height={155}/>
              </ChartCard>
              <ChartCard title="ROE — výnosnost vlastního kapitálu (%)" desc="Return on Equity — Buffett požaduje > 15%">
                <MiniChart data={mkData("roe")} type="line" color="#8b5cf6" label="roe" unit="%" height={155}/>
              </ChartCard>
              <ChartCard title="Provozní marže (%)" desc="Operating Margin — zisk z core businessu">
                <MiniChart data={mkData("operatingMargin")} type="line" color="#6366f1" label="om" unit="%" height={155}/>
              </ChartCard>
              <ChartCard title="Čistá marže (%)" desc="Net Margin — kolik centů ze $1 tržeb zůstane">
                <MiniChart data={mkData("netMargin")} type="line" color="#10b981" label="nm" unit="%" height={155}/>
              </ChartCard>
            </div>
          )}

          {/* FREE CASH FLOW */}
          {activeChart==="cashflow" && (
            <div>
              <ChartCard title="Free Cash Flow (mld. USD)" desc="Volný peněžní tok — peníze které firma skutečně generuje po investicích. Nejdůležitější ukazatel pro DCF ocenění.">
                <MiniChart data={mkData("freeCashFlow")} type="combo" color="#10b981" label="fcf" height={165}/>
              </ChartCard>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <ChartCard title="FCF vs Net Income porovnání" desc="Ideálně by FCF měl být blízký nebo vyšší než Net Income">
                  <div style={{overflowX:"auto"}}>
                    <svg viewBox="0 0 420 120" style={{width:"100%",minWidth:260,height:"auto"}}>
                      {(data.years||[]).map((y,i)=>{
                        const n=data.netIncome?.[i]||0, f=data.freeCashFlow?.[i]||0;
                        const maxV=Math.max(...(data.netIncome||[]).concat(data.freeCashFlow||[]).map(Math.abs),1);
                        const bW=18, gap=42, x=20+i*gap;
                        const hN=Math.abs(n)/maxV*80, hF=Math.abs(f)/maxV*80;
                        return(
                          <g key={i}>
                            <rect x={x} y={90-hN} width={bW} height={hN} fill={n>=0?"#6366f166":"#ef444466"} rx={2}/>
                            <rect x={x+bW+2} y={90-hF} width={bW} height={hF} fill={f>=0?"#10b98166":"#ef444466"} rx={2}/>
                            <text x={x+bW} y={110} textAnchor="middle" fill="#8b9fc0" fontSize="7">{y.toString().slice(2)}</text>
                          </g>
                        );
                      })}
                      <line x1={20} y1={90} x2={400} y2={90} stroke="#334155" strokeWidth="1"/>
                      <text x={10} y={10} fill="#6366f1" fontSize="8">■ Net Income</text>
                      <text x={90} y={10} fill="#10b981" fontSize="8">■ FCF</text>
                    </svg>
                  </div>
                </ChartCard>
                <ChartCard title="FCF Yield (%)" desc="FCF / Tržní cap — čím vyšší, tím levnější akcie">
                  <MiniChart data={(data.years||[]).map((y,i)=>({
                    label:y.toString().slice(2),
                    value: data.marketCap&&data.freeCashFlow?.[i]
                      ? (data.freeCashFlow[i]/data.marketCap)*100 : null
                  })).filter(d=>d.value!==null)} type="line" color="#f59e0b" label="fcfy" unit="%" height={165}/>
                </ChartCard>
              </div>
            </div>
          )}

          {/* DIVIDENDY */}
          {activeChart==="dividends" && (
            <div>
              <ChartCard title="Dividenda na akcii (USD/rok)" desc="Roční dividenda na akcii — sleduj konzistentní růst (Dividend Aristocrats)">
                <MiniChart data={mkData("dividendPerShare")} type="bar" color="#8b5cf6" label="div" height={140}/>
              </ChartCard>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <ChartCard title="Dividend Payout Ratio (%)" desc="Kolik % zisku (EPS) firma vyplácí jako dividendu. Udržitelné: 30-70%">
                  <MiniChart data={(data.years||[]).map((y,i)=>({
                    label:y.toString().slice(2),
                    value: data.eps?.[i]&&data.eps[i]>0&&data.dividendPerShare?.[i]
                      ? (data.dividendPerShare[i]/data.eps[i])*100 : null
                  })).filter(d=>d.value!==null)} type="line" color="#ec4899" label="pr" unit="%" height={165}/>
                </ChartCard>
                <ChartCard title="Roční růst dividendy (%)" desc="Dividend Growth Rate — čím vyšší a konzistentnější, tím lepší">
                  <MiniChart data={(data.years||[]).map((y,i)=>({
                    label:y.toString().slice(2),
                    value: i>0&&data.dividendPerShare?.[i-1]>0
                      ? ((data.dividendPerShare[i]-data.dividendPerShare[i-1])/data.dividendPerShare[i-1])*100 : null
                  })).filter(d=>d.value!==null)} type="combo" color="#10b981" label="dgr" unit="%" height={165}/>
                </ChartCard>
              </div>
            </div>
          )}

          {/* DLUH */}
          {activeChart==="debt" && (
            <div>
              <ChartCard title="Celkový dluh vs. Hotovost (mld. USD)" desc="Červená = dluh, zelená = hotovost. Ideálně hotovost > dluh nebo Net Debt klesá">
                <div style={{overflowX:"auto"}}>
                  <svg viewBox="0 0 420 140" style={{width:"100%",minWidth:260,height:"auto"}}>
                    {(data.years||[]).map((y,i)=>{
                      const d=data.totalDebt?.[i]||0, c=data.cashAndEquivalents?.[i]||0;
                      const maxV=Math.max(...(data.totalDebt||[]).concat(data.cashAndEquivalents||[]),1);
                      const bW=18, gap=Math.min(50,380/(data.years?.length||1)), x=20+i*gap;
                      const hD=d/maxV*100, hC=c/maxV*100;
                      return(
                        <g key={i}>
                          <rect x={x} y={110-hD} width={bW} height={hD} fill="#ef444477" rx={2}/>
                          <rect x={x+bW+2} y={110-hC} width={bW} height={hC} fill="#10b98177" rx={2}/>
                          <text x={x+bW} y={128} textAnchor="middle" fill="#8b9fc0" fontSize="7">{y.toString().slice(2)}</text>
                        </g>
                      );
                    })}
                    <text x={15} y={12} fill="#ef4444" fontSize="9">■ Dluh</text>
                    <text x={65} y={12} fill="#10b981" fontSize="9">■ Hotovost</text>
                  </svg>
                </div>
              </ChartCard>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <ChartCard title="Net Debt (mld. USD)" desc="Čistý dluh = Celkový dluh − Hotovost. Záporný = více hotovosti než dluhu">
                  <MiniChart data={(data.years||[]).map((y,i)=>({
                    label:y.toString().slice(2),
                    value:(data.totalDebt?.[i]||0)-(data.cashAndEquivalents?.[i]||0)
                  }))} type="combo" color="#f59e0b" label="nd" height={165}/>
                </ChartCard>
                <ChartCard title="Debt/EBITDA poměr" desc="Počet let na splacení dluhu z EBITDA. Ideálně < 3x">
                  <MiniChart data={(data.years||[]).map((y,i)=>({
                    label:y.toString().slice(2),
                    value:data.ebitda?.[i]>0?((data.totalDebt?.[i]||0)/data.ebitda[i]):null
                  })).filter(d=>d.value!==null)} type="line" color="#ef4444" label="de" unit="x" height={165}/>
                </ChartCard>
              </div>
            </div>
          )}

          {/* POČET AKCIÍ */}
          {activeChart==="shares" && (
            <div>
              <ChartCard title="Počet akcií v oběhu (mld.)" desc="Klesající počet = buyback (firma vykupuje vlastní akcie = pozitivní pro akcionáře). Rostoucí = ředění (dilution = negativní).">
                <MiniChart data={mkData("sharesOutstanding")} type="combo" color="#6366f1" label="sh" height={165}/>
              </ChartCard>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <ChartCard title="Roční změna počtu akcií (%)" desc="Záporné = buyback (dobré), kladné = dilution (pozor!)">
                  <MiniChart data={(data.years||[]).map((y,i)=>({
                    label:y.toString().slice(2),
                    value:i>0&&data.sharesOutstanding?.[i-1]>0
                      ?((data.sharesOutstanding[i]-data.sharesOutstanding[i-1])/data.sharesOutstanding[i-1])*100:null
                  })).filter(d=>d.value!==null)} type="combo" color="#10b981" label="sc" unit="%" height={165}/>
                </ChartCard>
                <ChartCard title="EPS růst — vliv buybacků" desc="Buybacky zvyšují EPS i bez růstu tržeb — sleduj zda roste EPS rychleji než Net Income">
                  <MiniChart data={(data.years||[]).map((y,i)=>({
                    label:y.toString().slice(2),
                    value:i>0&&data.eps?.[i-1]>0?((data.eps[i]-data.eps[i-1])/data.eps[i-1])*100:null
                  })).filter(d=>d.value!==null)} type="combo" color="#f59e0b" label="eg" unit="%" height={165}/>
                </ChartCard>
              </div>
            </div>
          )}

          {/* VALUACE */}
          {activeChart==="valuation" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <ChartCard title="P/E ratio" desc="Price/Earnings — valuační násobek. Vysoký P/E = trh očekává růst nebo je akcie drahá">
                <MiniChart data={mkData("peRatio")} type="line" color="#f59e0b" label="pe" height={155}/>
              </ChartCard>
              <ChartCard title="Price/FCF (Tržní cap / FCF)" desc="Levnější alternativa k P/E — ukazuje kolik platíš za $1 volného cash flow">
                <MiniChart data={(data.years||[]).map((y,i)=>({
                  label:y.toString().slice(2),
                  value:data.freeCashFlow?.[i]>0?(data.marketCap/data.freeCashFlow[i]):null
                })).filter(d=>d.value!==null)} type="line" color="#6366f1" label="pf" height={155}/>
              </ChartCard>
              <ChartCard title="Revenue na akcii (USD)" desc="Tržby na akcii — roste díky organickému růstu i buybackům">
                <MiniChart data={(data.years||[]).map((y,i)=>({
                  label:y.toString().slice(2),
                  value:data.sharesOutstanding?.[i]>0?(data.revenue?.[i]/data.sharesOutstanding[i]):null
                })).filter(d=>d.value!==null)} type="line" color="#10b981" label="rs" height={155}/>
              </ChartCard>
              <ChartCard title="EBITDA marže (%)" desc="EBITDA / Revenue — provozní výkonnost před finančními náklady">
                <MiniChart data={(data.years||[]).map((y,i)=>({
                  label:y.toString().slice(2),
                  value:data.revenue?.[i]>0?(data.ebitda?.[i]/data.revenue[i])*100:null
                })).filter(d=>d.value!==null)} type="line" color="#8b5cf6" label="em" unit="%" height={155}/>
              </ChartCard>
            </div>
          )}

          {/* MARŽE */}
          {activeChart==="margins" && (
            <div>
              <ChartCard title="Vývoj marží v čase (%)" desc="Porovnání hrubé, provozní a čisté marže — sleduj trend a konzistenci">
                <div style={{overflowX:"auto"}}>
                  <svg viewBox="0 0 420 140" style={{width:"100%",minWidth:260,height:"auto"}}>
                    <defs>
                      {["#6366f1","#10b981","#f59e0b"].map((c,i)=>(
                        <linearGradient key={i} id={`mg${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={c} stopOpacity="0.2"/>
                          <stop offset="100%" stopColor={c} stopOpacity="0"/>
                        </linearGradient>
                      ))}
                    </defs>
                    {[["grossMargin","#6366f1",0],["operatingMargin","#10b981",1],["netMargin","#f59e0b",2]].map(([key,color,gi])=>{
                      const vals=(data.years||[]).map((_,i)=>data[key]?.[i]||0);
                      const maxM=Math.max(...(data.grossMargin||[]).concat(data.operatingMargin||[]).concat(data.netMargin||[]),1);
                      const iW=380, iH=110, padL=30;
                      const xS=i=>padL+(i/(vals.length-1))*iW;
                      const yS=v=>10+iH-(v/maxM)*iH;
                      const path=vals.map((v,i)=>`${i===0?"M":"L"}${xS(i)},${yS(v)}`).join(" ");
                      return <path key={key} d={path} fill="none" stroke={color} strokeWidth="1.5" opacity={0.9}/>;
                    })}
                    {(data.years||[]).filter((_,i)=>i%2===0).map((y,_,arr)=>{
                      const idx=data.years.indexOf(y);
                      return <text key={y} x={30+(idx/(data.years.length-1))*380} y={135} textAnchor="middle" fill="#8b9fc0" fontSize="8">{y.toString().slice(2)}</text>;
                    })}
                    <text x={35} y={10} fill="#6366f1" fontSize="8">— Hrubá</text>
                    <text x={95} y={10} fill="#10b981" fontSize="8">— Provozní</text>
                    <text x={165} y={10} fill="#f59e0b" fontSize="8">— Čistá</text>
                  </svg>
                </div>
              </ChartCard>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <ChartCard title="Hrubá marže (%)" desc="Gross Margin">
                  <MiniChart data={mkData("grossMargin")} type="line" color="#6366f1" label="gm2" unit="%" height={145}/>
                </ChartCard>
                <ChartCard title="Čistá marže (%)" desc="Net Margin">
                  <MiniChart data={mkData("netMargin")} type="line" color="#f59e0b" label="nm2" unit="%" height={145}/>
                </ChartCard>
              </div>
            </div>
          )}

          <div style={{fontSize:10,color:"#1e293b",marginTop:16,padding:"8px 12px",background:"#0d1424",borderRadius:5,border:"1px solid #1e293b"}}>
            ⚠ Data jsou generována AI a slouží pouze pro informační účely. Před investičním rozhodnutím ověř data z oficiálních zdrojů (SEC, výroční zprávy, Bloomberg).
          </div>
        </>
      )}

      {!data && !loading && !error && (
        <div style={{textAlign:"center",padding:60,color:"#334155"}}>
          <div style={{fontSize:40,marginBottom:12}}>📈</div>
          <div style={{fontSize:13,color:"#8b9fc0",marginBottom:6}}>Zadej ticker a klikni na Načíst grafy</div>
          <div style={{fontSize:11,color:"#334155"}}>AI načte historická fundamentální data za posledních 8-10 let</div>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginTop:20}}>
            <div style={{background:"#0d1424",border:"1px solid #1e293b",borderRadius:6,padding:"8px 14px",fontSize:11,color:"#8b9fc0"}}>📊 Revenue & EBITDA</div>
            <div style={{background:"#0d1424",border:"1px solid #1e293b",borderRadius:6,padding:"8px 14px",fontSize:11,color:"#8b9fc0"}}>💸 Free Cash Flow</div>
            <div style={{background:"#0d1424",border:"1px solid #1e293b",borderRadius:6,padding:"8px 14px",fontSize:11,color:"#8b9fc0"}}>📉 EPS & P/E</div>
            <div style={{background:"#0d1424",border:"1px solid #1e293b",borderRadius:6,padding:"8px 14px",fontSize:11,color:"#8b9fc0"}}>🏦 Dluh & Hotovost</div>
            <div style={{background:"#0d1424",border:"1px solid #1e293b",borderRadius:6,padding:"8px 14px",fontSize:11,color:"#8b9fc0"}}>🔄 Buybacky & Ředění</div>
            <div style={{background:"#0d1424",border:"1px solid #1e293b",borderRadius:6,padding:"8px 14px",fontSize:11,color:"#8b9fc0"}}>💰 Dividendový růst</div>
          </div>
        </div>
      )}
    </div>
  );
};


// ─── ANALYZA TAB WRAPPER ──────────────────────────────────────────────────────
function AnalyzaTab({ rates, S, t=T.cs, lang="cs" }) {
  const [subTab, setSubTab] = useState("graf");
  const SUB = [
    { id:"graf", label:"📈 Cenový graf" },
    { id:"fundamenty", label:t.fundamentalCharts },
    { id:"oceneni", label:t.valuation },
  ];
  return (
    <>
      <div style={{ fontSize:16, fontWeight:700, color:"#f1f5f9", marginBottom:12 }}>Analýza akcií</div>
      <div style={{ display:"flex", gap:6, marginBottom:20 }}>
        {SUB.map(s=>(
          <button key={s.id}
            style={{ ...S.btn(subTab===s.id?"primary":"outline"), padding:"8px 18px" }}
            onClick={()=>setSubTab(s.id)}>{s.label}</button>
        ))}
      </div>
      {subTab==="graf" && <CandlestickChart S={S} />}
      {subTab==="fundamenty" && <FundamentalCharts S={S} />}
      {subTab==="oceneni" && <ValuationAnalyzer rates={rates} />}
    </>
  );
}


// ─── AUTH CONTEXT & COMPONENTS ───────────────────────────────────────────────

// Login / Register screen
function AuthScreen({ onAuth, lang="cs", setLang }) {
  const [mode, setMode] = useState("login"); // login | register | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPass, setShowPass] = useState(false);

  const darkBg = "#13192b";
  const card = "#161d30";
  const accent = "#6c63ff";
  const text = "#e8f0fe";
  const muted = "#5a7399";
  const border = "rgba(255,255,255,0.07)";
  const nmShadow = "8px 8px 20px #0b1020, -5px -5px 14px #1e2a45";
  const nmInset = "inset 3px 3px 8px #0b1020, inset -3px -3px 8px #1e2a45";

  const handle = async () => {
    setLoading(true); setError(""); setSuccess("");
    try {
      if (mode === "reset") {
        // Send password reset email
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "?reset=true"
        });
        if (error) throw error;
        setSuccess("✓ Email s odkazem pro reset hesla byl odeslán na " + email + ". Zkontroluj i spam.");
        setLoading(false);
        return;
      }
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Fetch profile — retry once if RLS causes empty result
        let profile = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data: p, error: pe } = await supabase.from("user_profiles")
            .select("approved,role,display_name").eq("id", data.user.id).single();
          if (p) { profile = p; break; }
          await new Promise(r => setTimeout(r, 600)); // wait and retry
        }
        // If profile still missing, auto-approve (first user or trigger delay)
        if (!profile) {
          profile = { approved: true, role: "user", display_name: "" };
        }
        if (!profile.approved) {
          await supabase.auth.signOut();
          throw new Error("Váš účet čeká na schválení administrátorem.");
        }
        onAuth(data.user, profile);
      } else {
        // Register
        if (password !== password2) throw new Error("Hesla se neshodují.");
        if (password.length < 6) throw new Error("Heslo musí mít alespoň 6 znaků.");
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { display_name: name || "" } }
        });
        if (error) throw error;
        if (data?.user && name) {
          await supabase.from("user_profiles").update({ display_name: name }).eq("id", data.user.id);
        }
        setSuccess("✓ Účet vytvořen! Nyní se přihlaste.");
        setMode("login");
        setPassword(""); setPassword2("");
      }
    } catch(e) {
      const msg = e.message || "";
      if (msg.includes("Invalid login") || msg.includes("invalid_credentials")) setError("Špatný email nebo heslo.");
      else if (msg.includes("already registered") || msg.includes("already been registered")) setError("Tento email je již zaregistrován. Přihlaste se.");
      else if (msg.includes("Database error")) setError("Chyba databáze — zkontrolujte nastavení Supabase triggeru.");
      else setError(msg);
    }
    setLoading(false);
  };

  const inp = { width:"100%", boxSizing:"border-box", background:card, border:`1px solid ${border}`,
    borderRadius:12, color:text, padding:"12px 16px", fontSize:13,
    fontFamily:"inherit", boxShadow:nmInset, outline:"none", marginBottom:12 };

  const TABS = [["login",T[lang]?.login||"Přihlásit se"],["register",T[lang]?.register||"Registrace"]];

  return (
    <div style={{ minHeight:"100vh", background:darkBg, display:"flex", alignItems:"center",
      justifyContent:"center", fontFamily:"'IBM Plex Mono','Courier New',monospace", padding:20 }}>
      <div style={{ width:"100%", maxWidth:420 }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:28, fontWeight:800, color:accent, letterSpacing:"0.15em", marginBottom:6 }}>📈 INVESTTRACK</div>
            {setLang && (
              <button onClick={()=>setLang(l=>l==="cs"?"en":"cs")}
                style={{ background:"none", border:`1px solid ${border}`, borderRadius:8,
                  color:muted, cursor:"pointer", fontSize:11, fontFamily:"inherit",
                  padding:"3px 12px", marginTop:6, fontWeight:700 }}>
                {lang==="cs" ? "🇬🇧 EN" : "🇨🇿 CZ"}
              </button>
            )}
          <div style={{ fontSize:11, color:muted, letterSpacing:"0.08em" }}>{T[lang]?.appSubtitle||T.cs.appSubtitle}</div>
        </div>

        <div style={{ background:card, borderRadius:20, padding:32, boxShadow:nmShadow, border:`1px solid ${border}` }}>

          {mode === "reset" ? (
            /* ── RESET HESLA ── */
            <>
              <div style={{ fontSize:14, fontWeight:700, color:text, marginBottom:6 }}>🔑 Reset hesla</div>
              <div style={{ fontSize:11, color:muted, marginBottom:20, lineHeight:1.6 }}>
                Zadej svůj email a pošleme ti odkaz pro nastavení nového hesla.
              </div>
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Tvůj email"
                style={inp} type="email" onKeyDown={e=>e.key==="Enter"&&handle()}/>
              {error && <div style={{ color:"#f87171", fontSize:12, marginBottom:12, padding:"8px 12px", background:"#f8717118", borderRadius:8 }}>{error}</div>}
              {success && <div style={{ color:"#22d3a0", fontSize:12, marginBottom:12, padding:"8px 12px", background:"#22d3a018", borderRadius:8 }}>{success}</div>}
              <button onClick={handle} disabled={loading} style={{ width:"100%", padding:"13px",
                background:`linear-gradient(135deg,#5b52f0,${accent})`, color:"#fff", border:"none",
                borderRadius:12, cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:700,
                boxShadow:"0 6px 20px rgba(108,99,255,0.4)", opacity:loading?0.7:1 }}>
                {loading ? "⟳ Odesílám..." : "📧 Odeslat reset email"}
              </button>
              <button onClick={()=>{setMode("login");setError("");setSuccess("");}}
                style={{ width:"100%", marginTop:10, padding:"10px", background:"transparent",
                  color:muted, border:`1px solid ${border}`, borderRadius:12, cursor:"pointer",
                  fontSize:11, fontFamily:"inherit" }}>
                ← Zpět na přihlášení
              </button>
            </>
          ) : (
            /* ── LOGIN / REGISTER ── */
            <>
              {/* Tab switch */}
              <div style={{ display:"flex", background:darkBg, borderRadius:12, padding:4, marginBottom:24, boxShadow:nmInset }}>
                {TABS.map(([m,l])=>(
                  <button key={m} style={{ flex:1, padding:"9px", border:"none", borderRadius:10, cursor:"pointer",
                    fontFamily:"inherit", fontSize:11, fontWeight:700, letterSpacing:"0.05em",
                    background: mode===m ? `linear-gradient(135deg,#5b52f0,${accent})` : "transparent",
                    color: mode===m ? "#fff" : muted,
                    boxShadow: mode===m ? "0 4px 12px rgba(108,99,255,0.4)" : "none",
                    transition:"all 0.2s" }}
                    onClick={()=>{ setMode(m); setError(""); setSuccess(""); }}>
                    {l}
                  </button>
                ))}
              </div>

              {mode==="register" && (
                <input value={name} onChange={e=>setName(e.target.value)} placeholder="Jméno (volitelné)"
                  style={inp} type="text"/>
              )}
              <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"
                style={inp} type="email" onKeyDown={e=>e.key==="Enter"&&handle()}/>

              {/* Password with show/hide */}
              <div style={{ position:"relative", marginBottom:12 }}>
                <input value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder={mode==="register" ? "Heslo (min. 6 znaků)" : "Heslo"}
                  style={{...inp, marginBottom:0, paddingRight:48}}
                  type={showPass?"text":"password"} onKeyDown={e=>e.key==="Enter"&&handle()}/>
                <button onClick={()=>setShowPass(s=>!s)} style={{ position:"absolute", right:12, top:"50%",
                  transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer",
                  color:muted, fontSize:14 }}>{showPass?"🙈":"👁"}</button>
              </div>

              {mode==="register" && (
                <input value={password2} onChange={e=>setPassword2(e.target.value)}
                  placeholder="Heslo znovu" style={inp} type={showPass?"text":"password"}
                  onKeyDown={e=>e.key==="Enter"&&handle()}/>
              )}

              {error && <div style={{ color:"#f87171", fontSize:12, marginBottom:12, padding:"8px 12px",
                background:"#f8717118", borderRadius:8, border:"1px solid #f8717133" }}>{error}</div>}
              {success && <div style={{ color:"#22d3a0", fontSize:12, marginBottom:12, padding:"8px 12px",
                background:"#22d3a018", borderRadius:8, border:"1px solid #22d3a033" }}>{success}</div>}

              <button onClick={handle} disabled={loading} style={{ width:"100%", padding:"13px",
                background:`linear-gradient(135deg,#5b52f0,${accent})`, color:"#fff", border:"none",
                borderRadius:12, cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:700,
                letterSpacing:"0.06em", boxShadow:"0 6px 20px rgba(108,99,255,0.4)", transition:"all 0.2s",
                opacity: loading ? 0.7 : 1 }}>
                {loading ? "⟳ Načítám..." : mode==="login" ? "→ Přihlásit se" : "✓ Vytvořit účet"}
              </button>

              {/* Forgot password link */}
              {mode==="login" && (
                <button onClick={()=>{setMode("reset");setError("");setSuccess("");}}
                  style={{ width:"100%", marginTop:12, padding:"8px", background:"transparent",
                    color:muted, border:"none", cursor:"pointer", fontSize:11, fontFamily:"inherit",
                    textDecoration:"underline" }}>
                  Zapomněl jsem heslo
                </button>
              )}
            </>
          )}
        </div>

        <div style={{ textAlign:"center", marginTop:20, fontSize:10, color:"#2d3f5a" }}>
          Bezpečné přihlášení přes Supabase Auth · Data šifrována
        </div>
      </div>
    </div>
  );
}

// Admin panel
function AdminPanel({ currentUser, onClose, S }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePass, setInvitePass] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [msg, setMsg] = useState("");

  const loadUsers = async () => {
    setLoading(true);
    const { data } = await supabase.from("user_profiles").select("*").order("created_at");
    setUsers(data || []);
    setLoading(false);
  };

  useEffect(()=>{ loadUsers(); }, []);

  const approve = async (id, val) => {
    await supabase.from("user_profiles").update({ approved: val }).eq("id", id);
    loadUsers();
  };

  const setRole = async (id, role) => {
    await supabase.from("user_profiles").update({ role }).eq("id", id);
    loadUsers();
  };

  const createUser = async () => {
    if (!inviteEmail || !invitePass) return;
    setMsg("Vytvářím uživatele...");
    try {
      // Create via admin API through our proxy
      const res = await fetch("/api/admin-create-user", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ email: inviteEmail, password: invitePass, name: inviteName })
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setMsg(`✓ Uživatel ${inviteEmail} vytvořen a schválen.`);
      setInviteEmail(""); setInvitePass(""); setInviteName("");
      loadUsers();
    } catch(e) { setMsg("Chyba: " + e.message); }
  };

  const deleteUser = async (id, email) => {
    if (!window.confirm(`Smazat uživatele ${email}? Tato akce je nevratná.`)) return;
    // Delete all user data
    await supabase.from("transactions").delete().eq("user_id", id);
    await supabase.from("portfolios").delete().eq("user_id", id);
    await supabase.from("user_profiles").delete().eq("id", id);
    setMsg(`Uživatel ${email} smazán.`);
    loadUsers();
  };

  const roleColor = { admin:"#6c63ff", user:"#22d3a0" };

  return (
    <div style={S.modal} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{...S.modalBox, maxWidth:680}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:15,fontWeight:800,color:"#e8f0fe"}}>👥 Admin panel — správa uživatelů</div>
          <button style={{...S.btn("outline"),padding:"4px 10px"}} onClick={onClose}>✕</button>
        </div>

        {/* Create user */}
        <div style={{...S.card,marginBottom:16}}>
          <div style={S.sectionTitle}>Přidat nového uživatele</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:8}}>
            <div>
              <div style={{fontSize:10,color:"#5a7399",marginBottom:4}}>Jméno</div>
              <input value={inviteName} onChange={e=>setInviteName(e.target.value)} placeholder="Jan Novák" style={S.input}/>
            </div>
            <div>
              <div style={{fontSize:10,color:"#5a7399",marginBottom:4}}>Email</div>
              <input value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="jan@email.cz" style={S.input} type="email"/>
            </div>
            <div>
              <div style={{fontSize:10,color:"#5a7399",marginBottom:4}}>Heslo</div>
              <input value={invitePass} onChange={e=>setInvitePass(e.target.value)} placeholder="min. 6 znaků" style={S.input} type="password"/>
            </div>
            <div style={{display:"flex",alignItems:"flex-end"}}>
              <button style={S.btn("primary")} onClick={createUser}>+ Přidat</button>
            </div>
          </div>
          {msg && <div style={{marginTop:10,fontSize:11,color:msg.startsWith("✓")?"#22d3a0":"#f87171"}}>{msg}</div>}
        </div>

        {/* User list */}
        <div style={S.card}>
          <div style={S.sectionTitle}>Uživatelé ({users.length})</div>
          {loading ? <div style={{color:"#5a7399",fontSize:12}}>Načítám...</div> : (
            <table style={S.table}>
              <thead><tr>
                {["Jméno","Email","Role","Schválen","Registrace",""].map(h=><th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {users.map(u=>(
                  <tr key={u.id}>
                    <td style={S.td}>{u.display_name||"–"}</td>
                    <td style={S.td}>{u.email}</td>
                    <td style={S.td}>
                      <select value={u.role} disabled={u.id===currentUser.id}
                        onChange={e=>setRole(u.id,e.target.value)}
                        style={{...S.select,width:"auto",padding:"3px 8px",fontSize:10,
                          color:roleColor[u.role]||"#94a3b8"}}>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td style={S.td}>
                      {u.id===currentUser.id
                        ? <span style={{color:"#22d3a0",fontSize:11}}>✓ (ty)</span>
                        : <button style={{...S.btn(u.approved?"outline":"primary"),padding:"3px 10px",fontSize:10}}
                            onClick={()=>approve(u.id,!u.approved)}>
                            {u.approved?"✓ Schválen":"✕ Neschválen"}
                          </button>
                      }
                    </td>
                    <td style={{...S.td,color:"#5a7399",fontSize:11}}>{new Date(u.created_at).toLocaleDateString("cs-CZ")}</td>
                    <td style={S.td}>
                      {u.id!==currentUser.id && (
                        <button style={{...S.btn("danger"),padding:"3px 8px",fontSize:10}}
                          onClick={()=>deleteUser(u.id,u.email)}>🗑</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── TRANSLATIONS ─────────────────────────────────────────────────────────────
const T = {
  cs: {
    // Nav tabs
    dashboard:"Přehled", portfolio:"Portfolio", transakce:"Transakce",
    cashflow:"Vklady/Výběry", dividendy:"Dividendy", novinky:"Novinky",
    analyza:"Analýza", fi:"FI Kalkulačka", nastaveni:"Nastavení",
    // Dashboard
    currentValue:"Aktuální hodnota", invested:"Investováno",
    gainLoss:"Zisk / Ztráta", dayChange:"Denní změna",
    tested3y:"Prošlo 3L testem", dividendsReceived:"Přijaté dividendy",
    portfolioYield:"Portfolio yield", yieldOnCost:"Yield on Cost",
    annualDividends:"Roční dividendy",
    portfolioGrowth:"Vývoj portfolia", allocation:"Alokace",
    topPositions:"Top pozice (CZK)", annualReturns:"Roční výnosy",
    upcomingDividends:"Nadcházející dividendy", upcomingEarnings:"Nadcházející earnings",
    afterClose:"po zavření", beforeOpen:"před otevřením",
    // Portfolio
    positions:"Pozice portfolia", quantity:"Množství",
    avgPrice:"Prům. cena", currentPrice:"Akt. cena",
    valuesCZK:"Hodnota CZK", gainLossPct:"Zisk/Ztráta",
    annualReturn:"Roční výnos", daily:"Denní %",
    days:"Dnů", test3y:"3L test",
    all:"Vše", stocks:"Akcie", etf:"ETF", crypto:"Crypto",
    sortBy:"Řadit:", ascending:"↑ Vzestupně", descending:"↓ Sestupně",
    // Transactions
    transactions:"Historie transakcí", addTransaction:"+ Přidat",
    importCsv:"📂 Import CSV", exportCsv:"📤 Export CSV",
    deleteAll:"🗑 Smazat vše", autoDiv:"🤖 Auto-dividendy",
    date:"Datum", type:"Typ", ticker:"Ticker", category:"Kategorie",
    price:"Cena", fee:"Poplatek", totalCZK:"Celkem CZK", notes:"Poznámka",
    buy:"Nákup", sell:"Prodej", dividend:"Dividenda",
    deposit:"Vklad", withdraw:"Výběr",
    // Cashflow
    cashflowTitle:"Vklady & Výběry",
    totalDeposits:"Celkové vklady", totalWithdraws:"Celkové výběry",
    netDeposit:"Čistý vklad", roi:"ROI na vložený kapitál",
    portfolioValue:"Aktuální hodnota portfolia", absoluteGain:"Absolutní zisk",
    addDepositWithdraw:"+ Přidat vklad/výběr",
    // Dividends
    dividendCalendar:"Dividendový kalendář",
    receivedYear:"Přijato", expectedEoy:"Očekáváno do konce roku",
    totalYear:"Celkem", annualEst:"Roční odhad (4× kv.)",
    monthlyOverview:"Měsíční přehled", received:"přijato", expected:"očekáváno",
    upcomingPayments:"Nadcházející výplaty", earningsCalendar:"Earnings kalendář",
    // News
    newsTitle:"Novinky & Zprávy", updated:"Aktualizováno:", refresh:"↻ Aktualizovat",
    myPortfolio:"Moje portfolio", noNews:"Žádné novinky", loadingNews:"Načítám novinky...",
    readArticle:"→ přejít na článek", myPortfolioTag:"📊 tvé portfolio",
    // Analysis
    analysisTitle:"Analýza akcií", fundamentalCharts:"📈 Fundamentální grafy",
    valuation:"🔍 Ocenění (DCF/Graham)",
    loadCharts:"📊 Načíst grafy", loading:"⟳ Načítám...",
    // FI
    fiTitle:"Kalkulačka finanční nezávislosti",
    fiParams:"Parametry FI", monthlyExpenses:"Měsíční výdaje (CZK)",
    monthlyInvestment:"Měsíční investice (CZK)", annualReturn2:"Očekávaný roční výnos (%)",
    swr:"Bezpečná míra výběru / SWR (%)", fiNumber:"FI číslo (cíl):",
    currentPortfolio:"Aktuální portfolio:", remaining:"Zbývá:",
    passiveIncome:"Pasivní příjem nyní:", estimatedTime:"Odhadovaný čas",
    projection:"Projekce portfolia", fiProgress:"FI Progress",
    fiProjection:"Graf projekce portfolia", sensitivity:"Citlivostní analýza SWR",
    // Settings
    settingsTitle:"Nastavení", syncStatus:"Stav synchronizace",
    synced:"☁ Synchronizováno", saving:"↻ Ukládám...", syncError:"⚠ Chyba připojení",
    localOnly:"💾 Pouze lokálně", exchangeRates:"Kurzy měn", updateRates:"↻ Aktualizovat kurzy online",
    manualPrices:"Ruční update cen", backup:"Záloha a reset",
    exportJson:"📤 Exportovat zálohu JSON", importJson:"📥 Importovat zálohu JSON",
    deleteTransactions:"🗑 Smazat transakce", resetAll:"⚠ Reset všeho",
    // Auth
    appSubtitle:"Správa investičního portfolia", login:"Přihlásit se",
    register:"Registrace", name:"Jméno (volitelné)", email:"Email",
    password:"Heslo (min. 6 znaků)", passwordLogin:"Heslo",
    passwordRepeat:"Heslo znovu", forgotPassword:"Zapomněl jsem heslo",
    resetPassword:"🔑 Reset hesla", resetDesc:"Zadej svůj email a pošleme ti odkaz pro nastavení nového hesla.",
    sendReset:"📧 Odeslat reset email", backToLogin:"← Zpět na přihlášení",
    createAccount:"✓ Vytvořit účet", loggingIn:"⟳ Načítám...",
    sending:"⟳ Odesílám...", secureLogin:"Bezpečné přihlášení přes Supabase Auth · Data šifrována",
    // Admin
    adminPanel:"Admin panel — správa uživatelů", addUser:"Přidat nového uživatele",
    userList:"Uživatelé", approved:"Schválen", role:"Role", registration:"Registrace",
    // General
    save:"Uložit", cancel:"Zrušit", add:"Přidat", delete:"Smazat",
    confirm:"Potvrdit", close:"Zavřít", edit:"Upravit",
    months:["Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"],
  },
  en: {
    // Nav tabs
    dashboard:"Overview", portfolio:"Portfolio", transakce:"Transactions",
    cashflow:"Deposits/Withdrawals", dividendy:"Dividends", novinky:"News",
    analyza:"Analysis", fi:"FI Calculator", nastaveni:"Settings",
    // Dashboard
    currentValue:"Current Value", invested:"Invested",
    gainLoss:"Gain / Loss", dayChange:"Daily Change",
    tested3y:"Passed 3Y Test", dividendsReceived:"Dividends Received",
    portfolioYield:"Portfolio Yield", yieldOnCost:"Yield on Cost",
    annualDividends:"Annual Dividends",
    portfolioGrowth:"Portfolio Growth", allocation:"Allocation",
    topPositions:"Top Positions (CZK)", annualReturns:"Annual Returns",
    upcomingDividends:"Upcoming Dividends", upcomingEarnings:"Upcoming Earnings",
    afterClose:"after close", beforeOpen:"before open",
    // Portfolio
    positions:"Portfolio Positions", quantity:"Quantity",
    avgPrice:"Avg. Price", currentPrice:"Curr. Price",
    valuesCZK:"Value CZK", gainLossPct:"Gain/Loss",
    annualReturn:"Annual Return", daily:"Daily %",
    days:"Days", test3y:"3Y Test",
    all:"All", stocks:"Stocks", etf:"ETF", crypto:"Crypto",
    sortBy:"Sort:", ascending:"↑ Ascending", descending:"↓ Descending",
    // Transactions
    transactions:"Transaction History", addTransaction:"+ Add",
    importCsv:"📂 Import CSV", exportCsv:"📤 Export CSV",
    deleteAll:"🗑 Delete All", autoDiv:"🤖 Auto-Dividends",
    date:"Date", type:"Type", ticker:"Ticker", category:"Category",
    price:"Price", fee:"Fee", totalCZK:"Total CZK", notes:"Notes",
    buy:"Buy", sell:"Sell", dividend:"Dividend",
    deposit:"Deposit", withdraw:"Withdrawal",
    // Cashflow
    cashflowTitle:"Deposits & Withdrawals",
    totalDeposits:"Total Deposits", totalWithdraws:"Total Withdrawals",
    netDeposit:"Net Deposit", roi:"ROI on Invested Capital",
    portfolioValue:"Current Portfolio Value", absoluteGain:"Absolute Gain",
    addDepositWithdraw:"+ Add Deposit/Withdrawal",
    // Dividends
    dividendCalendar:"Dividend Calendar",
    receivedYear:"Received", expectedEoy:"Expected by Year End",
    totalYear:"Total", annualEst:"Annual Est. (4× quarterly)",
    monthlyOverview:"Monthly Overview", received:"received", expected:"expected",
    upcomingPayments:"Upcoming Payments", earningsCalendar:"Earnings Calendar",
    // News
    newsTitle:"News & Updates", updated:"Updated:", refresh:"↻ Refresh",
    myPortfolio:"My Portfolio", noNews:"No news available", loadingNews:"Loading news...",
    readArticle:"→ read article", myPortfolioTag:"📊 your portfolio",
    // Analysis
    analysisTitle:"Stock Analysis", fundamentalCharts:"📈 Fundamental Charts",
    valuation:"🔍 Valuation (DCF/Graham)",
    loadCharts:"📊 Load Charts", loading:"⟳ Loading...",
    // FI
    fiTitle:"Financial Independence Calculator",
    fiParams:"FI Parameters", monthlyExpenses:"Monthly Expenses (CZK)",
    monthlyInvestment:"Monthly Investment (CZK)", annualReturn2:"Expected Annual Return (%)",
    swr:"Safe Withdrawal Rate / SWR (%)", fiNumber:"FI Number (target):",
    currentPortfolio:"Current Portfolio:", remaining:"Remaining:",
    passiveIncome:"Passive Income Now:", estimatedTime:"Estimated Time",
    projection:"Portfolio Projection", fiProgress:"FI Progress",
    fiProjection:"Portfolio Projection Chart", sensitivity:"SWR Sensitivity Analysis",
    // Settings
    settingsTitle:"Settings", syncStatus:"Sync Status",
    synced:"☁ Synchronized", saving:"↻ Saving...", syncError:"⚠ Connection Error",
    localOnly:"💾 Local Only", exchangeRates:"Exchange Rates", updateRates:"↻ Update Rates Online",
    manualPrices:"Manual Price Update", backup:"Backup & Reset",
    exportJson:"📤 Export JSON Backup", importJson:"📥 Import JSON Backup",
    deleteTransactions:"🗑 Delete Transactions", resetAll:"⚠ Reset Everything",
    // Auth
    appSubtitle:"Investment Portfolio Manager", login:"Sign In",
    register:"Register", name:"Name (optional)", email:"Email",
    password:"Password (min. 6 chars)", passwordLogin:"Password",
    passwordRepeat:"Repeat Password", forgotPassword:"Forgot my password",
    resetPassword:"🔑 Reset Password", resetDesc:"Enter your email and we will send you a password reset link.",
    sendReset:"📧 Send Reset Email", backToLogin:"← Back to Login",
    createAccount:"✓ Create Account", loggingIn:"⟳ Loading...",
    sending:"⟳ Sending...", secureLogin:"Secure login via Supabase Auth · Data encrypted",
    // Admin
    adminPanel:"Admin Panel — User Management", addUser:"Add New User",
    userList:"Users", approved:"Approved", role:"Role", registration:"Registered",
    // General
    save:"Save", cancel:"Cancel", add:"Add", delete:"Delete",
    confirm:"Confirm", close:"Close", edit:"Edit",
    months:["January","February","March","April","May","June","July","August","September","October","November","December"],
  }
};

// ─── KNOWN TICKER NAMES ──────────────────────────────────────────────────────
const KNOWN_NAMES = {
  "CEZ":"ČEZ, a.s.", "MM0":"Moneta Money Bank", "FRA:TBK":"Philip Morris ČR",
  "INTC":"Intel Corporation", "TSLA":"Tesla, Inc.", "AAPL":"Apple Inc.",
  "MSFT":"Microsoft Corp.", "NVDA":"NVIDIA Corporation", "GOOGL":"Alphabet Inc.",
  "AMZN":"Amazon.com Inc.", "META":"Meta Platforms", "KO":"Coca-Cola Co.",
  "JNJ":"Johnson & Johnson", "O":"Realty Income Corp.", "SPY":"SPDR S&P 500 ETF",
  "QQQ":"Invesco QQQ Trust", "VTI":"Vanguard Total Stock", "VWCE":"Vanguard FTSE All-World",
  "UMC":"United Microelectronics", "RCL":"Royal Caribbean", "IRM":"Iron Mountain",
  "DAL":"Delta Air Lines", "AHT":"Ashford Hospitality Trust",
  "BTC":"Bitcoin", "ETH":"Ethereum", "BTC-USD":"Bitcoin", "ETH-USD":"Ethereum",
  "JPM":"JPMorgan Chase", "BAC":"Bank of America", "WMT":"Walmart",
  "COST":"Costco", "V":"Visa", "MA":"Mastercard", "NFLX":"Netflix",
  "DIS":"Walt Disney", "SBUX":"Starbucks", "SHOP":"Shopify",
  "SOFI":"SoFi Technologies", "PLTR":"Palantir", "AMD":"AMD",
  "BABA":"Alibaba", "NKE":"Nike", "PYPL":"PayPal",
};


// ─── DRAWDOWN ANALYSIS ───────────────────────────────────────────────────────
const DrawdownChart = ({ transactions, prices, rates, portfolioCurrentCZK=0 }) => {
  const buys = transactions.filter(t=>t.type==="buy").sort((a,b)=>new Date(a.date)-new Date(b.date));
  if (buys.length < 2) return null;
  // Check if we have any price data
  const hasPrices = buys.some(t => prices[t.ticker]?.price > 0);
  if (!hasPrices) return (
    <div style={{color:"#8b9fc0",fontSize:11,textAlign:"center",padding:20}}>
      Načítám ceny akcií... Drawdown bude dostupný po načtení cen.
    </div>
  );

  // Build monthly portfolio values
  const firstDate = new Date(buys[0].date);
  const now = new Date();
  const points = [];
  let cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  while (cursor <= now) {
    const txSoFar = buys.filter(t=>new Date(t.date)<=cursor);
    const holdings = {};
    let invested = 0;
    txSoFar.forEach(t=>{
      holdings[t.ticker]=(holdings[t.ticker]||0)+t.quantity;
      invested += toCZK(t.quantity*t.price+(t.fee||0), t.currency, rates);
    });
    let current = 0;
    Object.entries(holdings).forEach(([ticker,qty])=>{
      const p = prices[ticker];
      if(p) current += toCZK(qty*p.price, getTickerCurrency(ticker,p), rates);
    });
    points.push({ date:new Date(cursor), value:current||invested, invested, label:`${cursor.getMonth()+1}/${String(cursor.getFullYear()).slice(2)}` });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1);
  }

  // Use actual portfolio value
  const totalInvDD = points.length > 0 ? points[points.length-1].invested : 0;
  const actualValDD = portfolioCurrentCZK > 0 ? portfolioCurrentCZK : (points[points.length-1]?.value || 0);
  const ratioDD = totalInvDD > 0 && actualValDD > 0 ? actualValDD / totalInvDD : 1;
  points.forEach((pt,i) => {
    pt.value = pt.invested * ratioDD;
  });
  if (points.length > 0) points[points.length-1].value = actualValDD;
  // Calculate drawdown series
  let peak = 0;
  const ddPoints = points.map(p => {
    if (p.value > peak) peak = p.value;
    const dd = peak > 0 ? ((p.value - peak) / peak) * 100 : 0;
    return { ...p, dd, peak };
  });

  const maxDD = Math.min(...ddPoints.map(p=>p.dd));
  const maxDDDate = ddPoints.find(p=>p.dd===maxDD);
  const currentDD = ddPoints[ddPoints.length-1].dd;

  const w=580, h=120, pad={t:8,b:28,l:52,r:8};
  const iW=w-pad.l-pad.r, iH=h-pad.t-pad.b;
  const xS=i=>pad.l+(i/(ddPoints.length-1||1))*iW;
  const yS=v=>pad.t+iH-(v/Math.min(maxDD*1.1,-0.01))*iH;
  const step=Math.max(1,Math.floor(ddPoints.length/8));
  const ddPath=ddPoints.map((p,i)=>`${i===0?"M":"L"}${xS(i)},${yS(p.dd)}`).join(" ");
  const aPath=ddPath+` L${xS(ddPoints.length-1)},${pad.t+iH} L${xS(0)},${pad.t+iH} Z`;

  return (
    <div>
      <div style={{display:"flex",gap:20,marginBottom:10,flexWrap:"wrap"}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:9,color:"#5a7399",textTransform:"uppercase",letterSpacing:"0.08em"}}>Max. drawdown</div>
          <div style={{fontSize:16,fontWeight:700,color:"#f87171"}}>{maxDD.toFixed(1)}%</div>
          <div style={{fontSize:9,color:"#5a7399"}}>{maxDDDate?.label}</div>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:9,color:"#5a7399",textTransform:"uppercase",letterSpacing:"0.08em"}}>Aktuální DD</div>
          <div style={{fontSize:16,fontWeight:700,color:currentDD<-5?"#f87171":currentDD<-2?"#f59e0b":"#22d3a0"}}>{currentDD.toFixed(1)}%</div>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:9,color:"#5a7399",textTransform:"uppercase",letterSpacing:"0.08em"}}>Od ATH</div>
          <div style={{fontSize:16,fontWeight:700,color:"#8b9fc0"}}>{Math.abs(currentDD)<0.1?"✓ ATH":""+Math.abs(currentDD).toFixed(1)+"%"}</div>
        </div>
      </div>
      <div style={{overflowX:"auto"}}>
        <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",minWidth:280,height:"auto"}}>
          {[-5,-10,-20,-30].filter(v=>v>=maxDD*1.1).map(v=>(
            <g key={v}>
              <line x1={pad.l} y1={yS(v)} x2={w-pad.r} y2={yS(v)} stroke="#1e2d45" strokeWidth="1" strokeDasharray="3,2"/>
              <text x={pad.l-4} y={yS(v)+4} textAnchor="end" fill="#8b9fc0" fontSize="8">{v}%</text>
            </g>
          ))}
          <line x1={pad.l} y1={yS(0)} x2={w-pad.r} y2={yS(0)} stroke="#334155" strokeWidth="1"/>
          <path d={aPath} fill="#f8717122"/>
          <path d={ddPath} fill="none" stroke="#f87171" strokeWidth="1.5"/>
          {ddPoints.map((p,i)=>i%step===0&&(
            <text key={i} x={xS(i)} y={h-4} textAnchor="middle" fill="#8b9fc0" fontSize="8">{p.label}</text>
          ))}
          {/* Mark max drawdown */}
          {maxDDDate && (()=>{
            const idx=ddPoints.indexOf(maxDDDate);
            return <circle cx={xS(idx)} cy={yS(maxDDDate.dd)} r="4" fill="#f87171" stroke="#0f1628" strokeWidth="1.5"/>;
          })()}
        </svg>
      </div>
    </div>
  );
};


// ─── DIGRIN-STYLE DIVIDEND CHART ─────────────────────────────────────────────
function DigrínDividendChart({ transactions, rates, tickerNames, S, textMuted, textPrimary, border, bgCard, accent, lang }) {
  const [mode, setMode] = useState("quarterly"); // quarterly | yearly | monthly | bystock
  const [chartType, setChartType] = useState("stacked"); // stacked | grouped
  const [tooltip, setTooltip] = useState(null);

  const divTx = transactions.filter(t => t.type === "dividend");
  if (!divTx.length) return null;

  const DCOLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#3b82f6","#22d3a0","#f97316","#a78bfa","#f43f5e","#84cc16"];
  const allTickers = [...new Set(divTx.map(t => t.ticker))];

  const getAmt = (t) => toCZK(t.dividendAmount||0, t.currency||"CZK", rates);

  // Build period → ticker → amount
  const buildData = () => {
    const map = {};
    divTx.forEach(t => {
      const d = new Date(t.date);
      let key;
      if (mode === "quarterly") {
        const q = Math.floor(d.getMonth() / 3) + 1;
        key = `${d.getFullYear()} Q${q}`;
      } else if (mode === "yearly") {
        key = String(d.getFullYear());
      } else if (mode === "monthly") {
        key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      } else { // bystock
        key = t.ticker;
      }
      if (!map[key]) map[key] = {};
      map[key][t.ticker] = (map[key][t.ticker]||0) + getAmt(t);
    });
    return map;
  };

  const data = buildData();
  const periods = Object.keys(data).sort();
  const totalAll = divTx.reduce((s,t) => s+getAmt(t), 0);

  // Chart dimensions
  const cH = 180, cP = {t:14, b:32, l:58, r:12};
  const iH = cH - cP.t - cP.b;
  const nPeriods = periods.length;
  const bW = mode === "grouped"
    ? Math.max(4, Math.floor(480 / Math.max(nPeriods,1) / allTickers.length) - 1)
    : Math.max(6, Math.floor(520 / Math.max(nPeriods,1)) - 3);
  const groupW = chartType === "grouped" ? bW * allTickers.length + (allTickers.length-1)*1 : bW;
  const totalW = Math.max(560, nPeriods*(groupW+4) + cP.l + cP.r);

  const maxVal = chartType === "stacked"
    ? Math.max(...periods.map(p => Object.values(data[p]||{}).reduce((s,v)=>s+v,0)), 1)
    : Math.max(...periods.flatMap(p => Object.values(data[p]||{})), 1);

  const yS = v => cP.t + iH - (v/maxVal)*iH;
  const fmtK = v => v >= 1e6 ? (v/1e6).toFixed(1)+"M" : v >= 1e3 ? (v/1e3).toFixed(1)+"k" : v.toFixed(0);

  const modeLabels = [
    {id:"monthly", label:lang==="en"?"Monthly":"Měsíčně"},
    {id:"quarterly", label:lang==="en"?"Quarterly":"Kvartálně"},
    {id:"yearly", label:lang==="en"?"Yearly":"Ročně"},
    {id:"bystock", label:lang==="en"?"By Stock":"Dle akcie"},
  ];

  return (
    <div style={S.card}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={S.sectionTitle}>{lang==="en"?"Dividends":"Dividendy"}</div>
          <div style={{fontSize:11,color:textMuted}}>
            {lang==="en"?"Total received:":"Celkem přijato:"} <b style={{color:"#10b981"}}>{fmtK(totalAll)} Kč</b>
          </div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          {/* Mode toggle */}
          <div style={{display:"flex",gap:3}}>
            {modeLabels.map(m=>(
              <button key={m.id} onClick={()=>setMode(m.id)}
                style={{fontSize:10,padding:"4px 10px",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontWeight:mode===m.id?700:400,
                  background:mode===m.id?accent+"33":"transparent",
                  color:mode===m.id?accent:textMuted,
                  border:`1px solid ${mode===m.id?accent:border}`}}>
                {m.label}
              </button>
            ))}
          </div>
          {/* Grouped/Stacked toggle (not for bystock) */}
          {mode !== "bystock" && (
            <div style={{display:"flex",gap:3}}>
              {[["stacked",lang==="en"?"Stacked":"Skládaný"],["grouped",lang==="en"?"Grouped":"Skupinový"]].map(([v,l])=>(
                <button key={v} onClick={()=>setChartType(v)}
                  style={{fontSize:10,padding:"4px 10px",borderRadius:6,cursor:"pointer",fontFamily:"inherit",fontWeight:chartType===v?700:400,
                    background:chartType===v?"#33415533":"transparent",
                    color:chartType===v?textPrimary:textMuted,
                    border:`1px solid ${chartType===v?"#8b9fc0":border}`}}>
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{fontSize:11,color:textMuted,marginBottom:8,padding:"6px 10px",
          background:bgCard,borderRadius:8,border:`1px solid ${border}`}}>
          <b style={{color:textPrimary}}>{tooltip.period}</b>
          {Object.entries(tooltip.vals).sort((a,b)=>b[1]-a[1]).map(([tk,v])=>(
            <span key={tk} style={{marginLeft:10}}>
              <span style={{color:DCOLORS[allTickers.indexOf(tk)%DCOLORS.length]}}>{tickerNames[tk]||tk}</span>: {fmtK(v)} Kč
            </span>
          ))}
          {" · "}
          <b style={{color:"#10b981"}}>{lang==="en"?"Total:":"Celkem:"} {fmtK(Object.values(tooltip.vals).reduce((s,v)=>s+v,0))} Kč</b>
        </div>
      )}

      <div style={{overflowX:"auto"}} onMouseLeave={()=>setTooltip(null)}>
        <svg viewBox={`0 0 ${totalW} ${cH}`} style={{width:"100%",minWidth:300,height:"auto"}}>
          {/* Grid */}
          {[0,0.25,0.5,0.75,1].map((t,i)=>(
            <g key={i}>
              <line x1={cP.l} y1={cP.t+iH*t} x2={totalW-cP.r} y2={cP.t+iH*t} stroke={border} strokeWidth="1"/>
              <text x={cP.l-4} y={cP.t+iH*t+4} textAnchor="end" fill={textMuted} fontSize="8.5">{fmtK(maxVal*(1-t))}</text>
            </g>
          ))}

          {/* Bars */}
          {periods.map((p, pi) => {
            const pData = data[p]||{};
            const baseX = cP.l + pi*(groupW+4);
            const total = Object.values(pData).reduce((s,v)=>s+v,0);

            return (
              <g key={p}
                onMouseEnter={()=>setTooltip({period:p, vals:pData})}
                style={{cursor:"pointer"}}>
                {chartType === "stacked" ? (
                  // Stacked bars
                  (() => {
                    let yOff = 0;
                    return allTickers.map((tk,ti) => {
                      const val = pData[tk]||0;
                      if (!val) return null;
                      const barH = Math.max(1, (val/maxVal)*iH);
                      const y = cP.t + iH - yOff - barH;
                      yOff += barH;
                      return (
                        <rect key={tk} x={baseX} y={y} width={groupW} height={barH}
                          fill={DCOLORS[ti%DCOLORS.length]} opacity={0.88} rx={1}/>
                      );
                    });
                  })()
                ) : (
                  // Grouped bars
                  allTickers.map((tk,ti) => {
                    const val = pData[tk]||0;
                    if (!val) return null;
                    const barH = Math.max(1, (val/maxVal)*iH);
                    const x = baseX + ti*(bW+1);
                    return (
                      <rect key={tk} x={x} y={cP.t+iH-barH} width={bW} height={barH}
                        fill={DCOLORS[ti%DCOLORS.length]} opacity={0.85} rx={1}/>
                    );
                  })
                )}
                {/* Invisible hover zone */}
                <rect x={baseX} y={cP.t} width={groupW} height={iH} fill="transparent"/>
                {/* X label */}
                <text x={baseX+groupW/2} y={cH-8} textAnchor="middle" fill={textMuted} fontSize="8">
                  {mode==="monthly"?p.slice(2):p}
                </text>
                {/* Total label on top if stacked */}
                {chartType==="stacked" && total > 0 && (
                  <text x={baseX+groupW/2} y={yS(total)-3} textAnchor="middle" fill={textPrimary} fontSize="7.5" fontWeight="700">
                    {fmtK(total)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:8}}>
        {allTickers.map((tk,i)=>{
          const total = Object.values(data).reduce((s,p)=>s+(p[tk]||0),0);
          return (
            <span key={tk} style={{fontSize:10,color:textMuted,display:"flex",alignItems:"center",gap:4}}>
              <span style={{width:10,height:10,borderRadius:2,background:DCOLORS[i%DCOLORS.length],display:"inline-block",flexShrink:0}}/>
              <span style={{color:textPrimary}}>{tickerNames[tk]||tk}</span>
              <span style={{color:textMuted}}>({fmtK(total)} Kč)</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  // ─── AUTH STATE ────────────────────────────────────────────────────────
  const [authUser, setAuthUser] = useState(null);   // Supabase user object
  const [userProfile, setUserProfile] = useState(null); // {role, display_name, approved}
  const [authLoading, setAuthLoading] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false);

  // Check session on mount
  useEffect(() => {
    const check = async () => {
      if (!supabase) { setAuthLoading(false); return; }
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase.from("user_profiles")
          .select("approved,role,display_name").eq("id", session.user.id).single();
        if (profile?.approved) {
          setAuthUser(session.user);
          setUserProfile(profile);
        } else {
          await supabase.auth.signOut();
        }
      }
      setAuthLoading(false);
    };
    check();
    // Listen for auth changes
    const { data: { subscription } } = supabase?.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") { setAuthUser(null); setUserProfile(null); }
    }) || { data: { subscription: { unsubscribe: ()=>{} } } };
    return () => subscription?.unsubscribe();
  }, []);

  // ─── MULTI-PORTFOLIO STATE ─────────────────────────────────────────────
  const [portfolios, setPortfolios] = useState(DEFAULT_PORTFOLIOS);
  const [activePortfolioId, setActivePortfolioId] = useState("p1");
  const [showPortfolioMgr, setShowPortfolioMgr] = useState(false);
  const [editingPortfolioId, setEditingPortfolioId] = useState(null);

  const [transactions, setTransactions] = useState(SAMPLE_TRANSACTIONS);
  const [prices, setPrices] = useState(SAMPLE_PRICES);
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [dividends, setDividends] = useState(SAMPLE_DIVIDENDS);
  const [earnings, setEarnings] = useState(SAMPLE_EARNINGS);
  const [fiSettings, setFiSettings] = useState(FI_DEFAULTS);
  const [tab, setTab] = useState("dashboard");
  const [showAddTx, setShowAddTx] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [editTx, setEditTx] = useState(null); // transaction being edited
  const [filterCat, setFilterCat] = useState("all");
  const [sortKey, setSortKey] = useState("value"); // value|name|gain|gainpct|yoc|annret|weight|change1d
  const [sortDir, setSortDir] = useState("desc"); // asc|desc
  const [viewMode, setViewMode] = useState("table"); // table|heatmap|cards
  const [chartYear, setChartYear] = useState(null); // null = all time
  const [benchmarks, setBenchmarks] = useState({}); // {SPY: [{t, c}], ...}
  const [activeBenchmarks, setActiveBenchmarks] = useState([]); // ["SPY","GLD",...]
  const [loadingBenchmark, setLoadingBenchmark] = useState(false);

  const BENCHMARK_OPTIONS = [
    { id:"SPY",  label:"S&P 500",    color:"#f59e0b" },
    { id:"QQQ",  label:"NASDAQ 100", color:"#6366f1" },
    { id:"DIA",  label:"Dow Jones",  color:"#ec4899" },
    { id:"GLD",  label:"Zlato",      color:"#fbbf24" },
    { id:"BRK-B",label:"BRK.B",     color:"#22d3a0" },
  ];

  const fetchBenchmark = async (ticker) => {
    if (benchmarks[ticker]) return; // already loaded
    setLoadingBenchmark(true);
    try {
      const res = await fetch(`/api/chart?ticker=${encodeURIComponent(ticker)}&range=max`);
      const data = await res.json();
      if (data.candles?.length) {
        setBenchmarks(prev => ({ ...prev, [ticker]: data.candles }));
      }
    } catch(e) { console.warn("benchmark fetch:", e.message); }
    setLoadingBenchmark(false);
  };

  const toggleBenchmark = (id) => {
    setActiveBenchmarks(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      fetchBenchmark(id);
      return [...prev, id];
    });
  };
  const [loaded, setLoaded] = useState(false);
  const [divCalYear, setDivCalYear] = useState(new Date().getFullYear());
  const [txTypeFilter, setTxTypeFilter] = useState("all"); // filter for transactions tab
  const [hovCat, setHovCat] = useState(null);
  const [ratesStatus, setRatesStatus] = useState("idle"); // idle | loading | ok | error

  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | ok | error | offline
  const [darkMode, setDarkMode] = useState(true);
  const [fontSize, setFontSize] = useState(13); // 11-17
  const [lang, setLang] = useState("cs"); // cs | en

  // ─── PERSIST — per-user Supabase tables + localStorage fallback ──────────
  useEffect(() => {
    if (authLoading) return; // wait for auth check
    const load = async () => {
      const uid = authUser?.id;
      const lsKey = uid ? `user_${uid}` : "guest";

      // 1. localStorage (okamžité zobrazení)
      try {
        const tx = localStorage.getItem(`${lsKey}_tx`);
        const po = localStorage.getItem(`${lsKey}_portfolios`);
        const ap = localStorage.getItem(`${lsKey}_activePortfolio`);
        const di = localStorage.getItem(`${lsKey}_dividends`);
        const ea = localStorage.getItem(`${lsKey}_earnings`);
        const fi = localStorage.getItem(`${lsKey}_fi`);
        if (tx) { const parsed=JSON.parse(tx); setTransactions(parsed.map(t=>t.type==="dividend"&&!t.dividendAmountCZK&&t.dividendAmount?{...t,dividendAmountCZK:t.dividendAmount}:t)); }
        if (po) setPortfolios(JSON.parse(po));
        if (ap) setActivePortfolioId(JSON.parse(ap));
        if (di) setDividends(JSON.parse(di));
        if (ea) setEarnings(JSON.parse(ea));
        if (fi) setFiSettings(JSON.parse(fi));
        const dm = localStorage.getItem("inv_darkMode");
        const fs = localStorage.getItem("inv_fontSize");
        const lg = localStorage.getItem("inv_lang");
        if (dm !== null) setDarkMode(JSON.parse(dm));
        if (fs !== null) setFontSize(JSON.parse(fs));
        if (lg) setLang(lg);
      } catch {}

      if (!supabase || !uid) { setLoaded(true); setSyncStatus("offline"); return; }

      setSyncStatus("syncing");
      try {
        // Load user transactions from new per-user table
        const [txRes, portRes, divRes, earRes, fiRes, ratesRes, pricesRes] = await Promise.all([
          supabase.from("transactions").select("*").eq("user_id", uid).order("date"),
          supabase.from("portfolios").select("*").eq("user_id", uid).order("created_at"),
          supabase.from("user_dividends").select("data").eq("user_id", uid).single(),
          supabase.from("user_earnings").select("data").eq("user_id", uid).single(),
          supabase.from("user_fi_settings").select("data").eq("user_id", uid).single(),
          supabase.from("shared_data").select("data").eq("id", "rates").single(),
          supabase.from("shared_data").select("data").eq("id", "prices").single(),
        ]);

        // Transactions
        if (txRes.data?.length) {
          const txs = txRes.data.map(t => ({
            id: t.id, portfolioId: t.portfolio_id, type: t.type,
            ticker: t.ticker, name: t.name, category: t.category,
            date: t.date, quantity: t.quantity, price: t.price,
            currency: t.currency, fee: t.fee,
            dividendAmount: t.dividend_amount, dividendAmountCZK: t.type==="dividend" ? t.dividend_amount : undefined, amount: t.amount, notes: t.notes
          }));
          setTransactions(txs);
          localStorage.setItem(`${lsKey}_tx`, JSON.stringify(txs));
        }
        // Portfolios
        if (portRes.data?.length) {
          const ports = portRes.data.map(p => ({ id: p.id, name: p.name, color: p.color, created: p.created_at?.slice(0,10) }));
          setPortfolios(ports);
          setActivePortfolioId(ports[0].id);
          localStorage.setItem(`${lsKey}_portfolios`, JSON.stringify(ports));
        }
        if (divRes.data?.data) setDividends(divRes.data.data);
        if (earRes.data?.data) setEarnings(earRes.data.data);
        if (fiRes.data?.data && Object.keys(fiRes.data.data).length) setFiSettings(fiRes.data.data);
        // Shared rates & prices (may fail due to RLS - use localStorage fallback)
        if (ratesRes.data?.data && Object.keys(ratesRes.data.data).length) {
          setRates(ratesRes.data.data);
          localStorage.setItem("inv_rates", JSON.stringify(ratesRes.data.data));
        } else {
          const cached = localStorage.getItem("inv_rates");
          if (cached) try { setRates(JSON.parse(cached)); } catch {}
        }
        if (pricesRes.data?.data && Object.keys(pricesRes.data.data).length) {
          setPrices(pricesRes.data.data);
          localStorage.setItem("inv_prices", JSON.stringify(pricesRes.data.data));
        } else {
          const cached = localStorage.getItem("inv_prices");
          if (cached) try { setPrices(JSON.parse(cached)); } catch {}
        }

        setSyncStatus("ok");
      } catch(e) { console.error(e); setSyncStatus("error"); }
      setLoaded(true);
    };
    load();
  }, [authUser, authLoading]);

  // ─── SAVE PER-USER DATA ───────────────────────────────────────────────────
  const saveTimerRef = useRef(null);
  const saveUserData = useCallback(({ txs, ports, divs, ears, fi }) => {
    if (!supabase || !authUser) return;
    const uid = authUser.id;
    const lsKey = `user_${uid}`;
    if (txs !== undefined) { try { localStorage.setItem(`${lsKey}_tx`, JSON.stringify(txs)); } catch {} }
    if (ports !== undefined) { try { localStorage.setItem(`${lsKey}_portfolios`, JSON.stringify(ports)); } catch {} }
    if (divs !== undefined) { try { localStorage.setItem(`${lsKey}_dividends`, JSON.stringify(divs)); } catch {} }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus("syncing");
      try {
        const ops = [];
        // Save transactions: delete all + reinsert (simplest approach)
        if (txs !== undefined) {
          await supabase.from("transactions").delete().eq("user_id", uid);
          if (txs.length > 0) {
            const rows = txs.map(t => ({
              id: t.id, user_id: uid, portfolio_id: t.portfolioId || ports?.[0]?.id || "p1",
              type: t.type, ticker: t.ticker, name: t.name, category: t.category,
              date: t.date, quantity: t.quantity||null, price: t.price||null,
              currency: t.currency, fee: t.fee||null,
              dividend_amount: t.dividendAmount||null, amount: t.amount||null, notes: t.notes||null
            }));
            ops.push(supabase.from("transactions").insert(rows));
          }
        }
        // Save portfolios
        if (ports !== undefined) {
          await supabase.from("portfolios").delete().eq("user_id", uid);
          if (ports.length > 0) {
            ops.push(supabase.from("portfolios").insert(
              ports.map(p => ({ id: p.id, user_id: uid, name: p.name, color: p.color }))
            ));
          }
        }
        // Dividends, earnings, fi as JSONB
        if (divs !== undefined) ops.push(supabase.from("user_dividends").upsert({ id: uid, user_id: uid, data: divs }));
        if (ears !== undefined) ops.push(supabase.from("user_earnings").upsert({ id: uid, user_id: uid, data: ears }));
        if (fi !== undefined) ops.push(supabase.from("user_fi_settings").upsert({ id: uid, user_id: uid, data: fi }));
        await Promise.all(ops);
        setSyncStatus("ok");
      } catch(e) { console.error("save error", e); setSyncStatus("error"); }
    }, 1800);
  }, [authUser]);

  // Save shared rates+prices (admin only or anyone — rates are public)
  const saveShared = useCallback(async (key, value) => {
    try { localStorage.setItem(`inv_${key}`, JSON.stringify(value)); } catch {}
    if (!supabase) return;
    try {
      const { error } = await supabase.from("shared_data")
        .upsert({ id: key, data: value, updated_at: new Date().toISOString() });
      if (error) console.warn("shared_data save:", error.message);
    } catch(e) { console.warn("saveShared error:", e.message); }
  }, []);

  // Sleduj změny
  useEffect(() => { if (loaded && authUser) saveUserData({ txs: transactions }); }, [transactions, loaded]);
  useEffect(() => { if (loaded && authUser) saveUserData({ ports: portfolios }); }, [portfolios, loaded]);
  useEffect(() => { if (loaded && authUser) saveUserData({ divs: dividends }); }, [dividends, loaded]);
  useEffect(() => { if (loaded && authUser) saveUserData({ ears: earnings }); }, [earnings, loaded]);
  useEffect(() => { if (loaded && authUser) saveUserData({ fi: fiSettings }); }, [fiSettings, loaded]);
  useEffect(() => { if (loaded) saveShared("rates", rates); }, [rates, loaded]);
  useEffect(() => { if (loaded) saveShared("prices", prices); }, [prices, loaded]);

  // Persist theme/fontSize locally (not synced to cloud)
  useEffect(() => { try { localStorage.setItem("inv_darkMode", JSON.stringify(darkMode)); } catch {} }, [darkMode]);
  useEffect(() => { try { localStorage.setItem("inv_fontSize", JSON.stringify(fontSize)); } catch {} }, [fontSize]);
  useEffect(() => { try { localStorage.setItem("inv_lang", lang); } catch {} }, [lang]);

  // Realtime sync — shared rates/prices
  useEffect(() => {
    if (!supabase || !loaded) return;
    const channel = supabase
      .channel("shared_changes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shared_data" },
        (payload) => {
          if (payload.new?.id === "rates") setRates(payload.new.data);
          if (payload.new?.id === "prices") setPrices(payload.new.data);
        })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loaded]);

  // ─── AUTO FETCH PRICES ──────────────────────────────────────────────────
  const [pricesStatus, setPricesStatus] = useState("idle"); // idle|loading|ok|error

  const fetchPrices = useCallback(async (tickerList) => {
    const tickers = tickerList || Object.keys(prices).filter(t => !["VKLAD","VÝBĚR"].includes(t));
    if (tickers.length === 0) return;
    setPricesStatus("loading");
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (data.prices && Object.keys(data.prices).length > 0) {
        setPrices(prev => {
          const updated = { ...prev };
          Object.entries(data.prices).forEach(([ticker, info]) => {
            updated[ticker] = { ...updated[ticker], ...info };
          });
          return updated;
        });
        // Cache shortNames from API + apply server-side KNOWN_NAMES
        const newNames = { ...(data.names || {}) };
        Object.entries(data.prices).forEach(([tk, info]) => {
          if (info.shortName) newNames[tk] = info.shortName;
        });
        if (Object.keys(newNames).length) setTickerNames(prev => ({...prev,...newNames,...KNOWN_NAMES})); // KNOWN_NAMES always wins
        setPricesStatus("ok");
      } else {
        setPricesStatus("error");
      }
    } catch(e) {
      console.warn("fetchPrices error:", e.message);
      setPricesStatus("error");
    }
  }, [prices]);

  // Keyboard shortcut: N = new transaction, Escape = close modals
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); setShowAddTx(true); }
      if (e.key === "Escape") {
        setShowAddTx(false);
        setEditTx(null);
        setShowCsvImport(false);
        setShowDeleteAll(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Keyboard shortcut: N = new transaction, Escape = close modals
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); setShowAddTx(true); }
      if (e.key === "Escape") {
        setShowAddTx(false);
        setEditTx(null);
        setShowCsvImport(false);
        setShowDeleteAll(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Auto-fetch prices for portfolio tickers every 15 minutes
  useEffect(() => {
    if (!loaded) return;
    const portfolioTickers = [...new Set(
      activeTransactions.filter(t => t.type === "buy").map(t => t.ticker)
    )].filter(t => t && !["VKLAD","VÝBĚR"].includes(t));
    if (portfolioTickers.length === 0) return;
    // Auto-add missing tickers to prices
    const newTickers = portfolioTickers.filter(t => !prices[t]);
    if (newTickers.length > 0) {
      setPrices(prev => {
        const updated = { ...prev };
        newTickers.forEach(t => { updated[t] = { price: 0, currency: "USD", change1d: 0 }; });
        return updated;
      });
    }
    // Clean up .PR/.DE duplicate variants that were auto-added
    setPrices(prev => {
      const cleaned = { ...prev };
      Object.keys(cleaned).forEach(k => {
        // Remove .PR/.DE variants if the base ticker exists
        const base = k.replace(/\.(PR|DE|PL|F|AS|L)$/i, "");
        if (base !== k && cleaned[base] !== undefined) {
          delete cleaned[k];
        }
      });
      return cleaned;
    });
    // Initial fetch prices
    fetchPrices(portfolioTickers);
    // Lookup names for tickers without names
    const missingNames = portfolioTickers.filter(t => !tickerNames[t]);
    missingNames.forEach((t, i) => setTimeout(() => lookupTickerName(t), i * 100));
    // Refresh every 15 min
    const interval = setInterval(() => fetchPrices(portfolioTickers), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loaded, activePortfolioId]);

  // ─── TICKER NAME LOOKUP ─────────────────────────────────────────────────
  const [tickerNames, setTickerNames] = useState(KNOWN_NAMES); // pre-loaded with known names



  const lookupTickerName = useCallback(async (ticker) => {
    const tk = ticker.toUpperCase().trim();
    if (!tk || tickerNames[tk]) return;
    // 1. Hardcoded known names (instant)
    if (KNOWN_NAMES[tk]) {
      setTickerNames(prev => ({ ...prev, [tk]: KNOWN_NAMES[tk] }));
    }
    // 2. Try API for name (async, may update later)
    try {
      const res = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: [tk] }),
      });
      const data = await res.json();
      const info = data.prices?.[tk];
      if (info?.shortName && info.shortName !== tk) {
        if (!KNOWN_NAMES[tk]) setTickerNames(prev => ({ ...prev, [tk]: info.shortName }));
        return;
      }
      // 3. Fallback: chart API
      const res2 = await fetch(`/api/chart?ticker=${encodeURIComponent(tk)}&range=1d`);
      const data2 = await res2.json();
      if (data2?.shortName && data2.shortName !== tk) {
        if (!KNOWN_NAMES[tk]) setTickerNames(prev => ({ ...prev, [tk]: data2.shortName }));
      }
    } catch {}
  }, [tickerNames]);

  // ─── AUTO FETCH RATES ───────────────────────────────────────────────────
  const fetchRates = useCallback(async () => {
    setRatesStatus("loading");
    const newRates = await fetchLiveRates();
    if (newRates && newRates.USD_CZK && newRates.EUR_CZK) {
      setRates(prev => ({ ...prev, ...newRates }));
      setRatesStatus("ok");
    } else {
      setRatesStatus("error");
    }
  }, []);

  // Auto-fetch on load and every 4 hours
  useEffect(() => {
    if (!loaded) return;
    const lastFetch = rates.lastUpdated ? new Date(rates.lastUpdated) : null;
    const fourHours = 4 * 60 * 60 * 1000;
    if (!lastFetch || Date.now() - lastFetch > fourHours) {
      fetchRates();
    }
    const interval = setInterval(fetchRates, fourHours);
    return () => clearInterval(interval);
  }, [loaded]);

  // ─── ACTIVE PORTFOLIO TRANSACTIONS ────────────────────────────────────────
  const activeTransactions = useMemo(() =>
    transactions.filter(t => {
      if (!t.portfolioId) return activePortfolioId === portfolios[0]?.id; // legacy: assign to first portfolio
      return t.portfolioId === activePortfolioId;
    }),
    [transactions, activePortfolioId, portfolios]
  );

  // ─── PORTFOLIO CALCULATIONS ─────────────────────────────────────────────
  const portfolio = useMemo(() => {
    const holdings = {};
    let totalInvestedCZK = 0, totalDividendsCZK = 0;
    activeTransactions.forEach(t => {
      if (t.type === "buy") {
        if (!holdings[t.ticker]) holdings[t.ticker] = { ticker: t.ticker, name: t.name, category: t.category, lots: [], totalQty: 0, totalCostCZK: 0 };
        const costCZK = toCZK(t.quantity * t.price + (t.fee||0), t.currency, rates);
        holdings[t.ticker].lots.push({ date: t.date, quantity: t.quantity, price: t.price, currency: t.currency, costCZK });
        holdings[t.ticker].totalQty += t.quantity;
        holdings[t.ticker].totalCostCZK += costCZK;
        totalInvestedCZK += costCZK;
      } else if (t.type === "sell" && holdings[t.ticker]) {
        const sellQty = Math.min(t.quantity, holdings[t.ticker].totalQty);
        holdings[t.ticker].totalQty -= sellQty;
        // Reduce cost basis proportionally
        if (holdings[t.ticker].totalQty <= 0) {
          holdings[t.ticker].totalQty = 0;
        }
      } else if (t.type === "dividend" && t.dividendAmount) {
        // dividendAmount is already in CZK (converted at entry time)
        totalDividendsCZK += t.dividendAmountCZK || (t.currency==="CZK" ? t.dividendAmount||0 : toCZK(t.dividendAmount||0, t.currency||"USD", rates));
      } else if (t.type === "deposit") {
        // Deposits don't count as investment cost - they're cash inflows
      } else if (t.type === "withdraw") {
        // Withdrawals don't count either
      }
    });
    let totalCurrentCZK = 0;
    const positions = Object.values(holdings).map(h => {
      const p = prices[h.ticker];
      const currentPrice = p?.price || 0;
      const currentCurrency = getTickerCurrency(h.ticker, p);
      const currentValueCZK = toCZK(h.totalQty * currentPrice, currentCurrency, rates);
      const gainCZK = currentValueCZK - h.totalCostCZK;
      const gainPct = h.totalCostCZK > 0 ? (gainCZK / h.totalCostCZK) * 100 : 0;
      const avgCostCZK = h.totalQty > 0 ? h.totalCostCZK / h.totalQty : 0;
      const threeYearsAgo = new Date(); threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      const testedLots = h.lots.filter(l => new Date(l.date) <= threeYearsAgo);
      const testedQty = testedLots.reduce((s, l) => s + l.quantity, 0);
      const testedCostCZK = testedLots.reduce((s, l) => s + l.costCZK, 0);
      const testedValueCZK = toCZK(testedQty * currentPrice, currentCurrency, rates); // currentCurrency already CZK-aware
      const earliestLot = h.lots.length > 0 ? h.lots.reduce((a, b) => a.date < b.date ? a : b) : null;
      const daysHeld = earliestLot ? daysSince(earliestLot.date) : 0;
      const testDays = h.category === "real_estate" ? 3650 : 1095; // 10 years for real estate, 3 years for others
      const daysToTest = earliestLot ? Math.max(0, testDays - daysSince(earliestLot.date)) : 0;
      const years = daysHeld / 365;
      const annualizedReturn = years > 0.1 && h.totalCostCZK > 0 ? (Math.pow(currentValueCZK / h.totalCostCZK, 1/years) - 1) * 100 : 0;

      // Yield on Cost (YoC) — total dividends received / original cost
      const tickerDivs = transactions.filter(t => t.type === "dividend" && t.ticker === h.ticker);
      const totalDivReceivedCZK = tickerDivs.reduce((s,t) => s + toCZK(t.dividendAmount||0, t.currency, rates), 0);
      const yoc = h.totalCostCZK > 0 ? (totalDivReceivedCZK / h.totalCostCZK) * 100 : 0;

      // Dividend Growth Rate (DGR3) — compare last 3 years of dividends
      const now3 = new Date();
      const yr = (y) => tickerDivs.filter(t => new Date(t.date).getFullYear() === now3.getFullYear() - y).reduce((s,t)=>s+(t.dividendAmount||0),0);
      const divY0 = yr(0), divY1 = yr(1), divY2 = yr(2), divY3 = yr(3);
      const dgr1 = divY1 > 0 ? ((divY0 - divY1) / divY1) * 100 : null;
      const dgr3 = divY3 > 0 ? (Math.pow(divY0 / divY3, 1/3) - 1) * 100 : null;

      // Current div yield (annual div / current price) — estimate from last 4 divs
      const lastDivs = tickerDivs.slice(-4);
      const annualDivPerShare = lastDivs.length > 0 && h.totalQty > 0
        ? lastDivs.reduce((s,t)=>s+toCZK(t.dividendAmount||0,t.currency||"CZK",rates),0) / h.totalQty * (4 / lastDivs.length) : 0;
      const divYield = currentPrice > 0 && annualDivPerShare > 0 ? (annualDivPerShare / currentPrice) * 100 : 0;

      // Break-even price
      const breakEven = h.totalQty > 0 ? h.totalCostCZK / h.totalQty : 0;
      totalCurrentCZK += currentValueCZK;
      return { ...h, currentPrice, currentCurrency, currentValueCZK, gainCZK, gainPct, avgCostCZK, testedQty, testedCostCZK, testedValueCZK, daysHeld, daysToTest, annualizedReturn, change1d: p?.change1d ?? 0, yoc, dgr1, dgr3, divYield, annualDivPerShare, totalDivReceivedCZK, breakEven };
    }).filter(p => p.totalQty > 0.00001);
    // Add weight % to each position
    positions.forEach(p => { p.weight = totalCurrentCZK > 0 ? (p.currentValueCZK / totalCurrentCZK) * 100 : 0; });
    const totalGainCZK = totalCurrentCZK - totalInvestedCZK;
    const totalGainPct = totalInvestedCZK > 0 ? (totalGainCZK / totalInvestedCZK) * 100 : 0;
    const testedTotal = positions.reduce((s, p) => s + p.testedValueCZK, 0);
    const totalDayChange = positions.reduce((s, p) => s + (p.currentValueCZK * (p.change1d / 100)), 0);
    const totalAnnualDiv = positions.reduce((s, p) => s + toCZK(p.annualDivPerShare * p.totalQty, p.currentCurrency, rates), 0);
    const portfolioYield = totalCurrentCZK > 0 ? (totalAnnualDiv / totalCurrentCZK) * 100 : 0;
    const portfolioYoC = totalInvestedCZK > 0 ? (positions.reduce((s,p)=>s+p.totalDivReceivedCZK,0) / totalInvestedCZK) * 100 : 0;
    const totalDeposits = activeTransactions.filter(t=>t.type==="deposit").reduce((s,t)=>s+toCZK(t.amount||0,t.currency,rates),0);
    const totalWithdrawals = activeTransactions.filter(t=>t.type==="withdraw").reduce((s,t)=>s+toCZK(t.amount||0,t.currency,rates),0);
    return { positions, totalInvestedCZK, totalCurrentCZK, totalGainCZK, totalGainPct, totalDividendsCZK, testedTotal, totalDayChange, totalAnnualDiv, portfolioYield, portfolioYoC, totalDeposits, totalWithdrawals };
  }, [transactions, prices, rates]);

  // ─── FI CALCULATIONS ────────────────────────────────────────────────────
  const fiCalc = useMemo(() => {
    const annualExpenses = fiSettings.monthlyExpenses * 12;
    const target = annualExpenses / (fiSettings.safeWithdrawalRate / 100);
    const currentCZK = portfolio.totalCurrentCZK;
    const pct = (currentCZK / target) * 100;
    const monthlyReturn = (fiSettings.annualReturn || 7) / 100 / 12;
    const monthlySaving = fiSettings.monthlySaving || 0;
    let balance = currentCZK;
    let monthsLeft = null;
    for (let m = 0; m <= 600; m++) {
      if (balance >= target) { monthsLeft = m; break; }
      balance = balance * (1 + monthlyReturn) + monthlySaving;
    }
    const passiveMonthly = currentCZK * (fiSettings.safeWithdrawalRate / 100) / 12;
    return { target, currentCZK, pct, monthsLeft, passiveMonthly, annualExpenses };
  }, [portfolio.totalCurrentCZK, fiSettings]);

  // ─── AUTO-DIVIDEND HELPER ──────────────────────────────────────────────────
  // Generates suggested upcoming dividends based on history pattern
  const suggestDividends = useCallback((ticker, positions) => {
    const divHistory = activeTransactions
      .filter(t => t.type === "dividend" && t.ticker === ticker)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (divHistory.length < 2) return null;
    const last = divHistory[divHistory.length - 1];
    const prev = divHistory[divHistory.length - 2];
    const daysBetween = Math.round((new Date(last.date) - new Date(prev.date)) / 86400000);
    if (daysBetween < 20 || daysBetween > 400) return null;
    const nextDate = new Date(last.date);
    nextDate.setDate(nextDate.getDate() + daysBetween);
    const avgAmount = divHistory.slice(-4).reduce((s, d) => s + (d.dividendAmount || 0), 0) / Math.min(4, divHistory.length);
    const pos = positions.find(p => p.ticker === ticker);
    return {
      ticker,
      date: nextDate.toISOString().slice(0, 10),
      amount: avgAmount && pos?.totalQty > 0 ? parseFloat((avgAmount / pos.totalQty).toFixed(4)) : parseFloat(avgAmount.toFixed(4)),
      perShare: !!(pos?.totalQty > 0),
      currency: last.currency,
      autoSuggested: true,
    };
  }, [activeTransactions]);

  // ─── ADD TX STATE ───────────────────────────────────────────────────────
  const [newTx, setNewTx] = useState({ type:"buy", ticker:"", name:"", category:"stock", date:new Date().toISOString().slice(0,10), quantity:"", price:"", currency:"USD", fee:"", dividendAmount:"", dividendPerShare:"", divTax:"15", amount:"", notes:"" });

  const addTransaction = () => {
    const isFlow = newTx.type === "deposit" || newTx.type === "withdraw";
    if (!isFlow && !newTx.ticker) return;
    if (isFlow && !newTx.amount) return;
    const tx = { ...newTx, id:`t${Date.now()}`,
      portfolioId: activePortfolioId,
      ticker: isFlow ? (newTx.type === "deposit" ? "VKLAD" : "VÝBĚR") : newTx.ticker,
      name: isFlow ? (newTx.type === "deposit" ? "Vklad hotovosti" : "Výběr hotovosti") : newTx.name,
      category: isFlow ? "cash" : newTx.category,
      quantity: parseFloat(newTx.quantity)||0,
      price: parseFloat(newTx.price)||0,
      fee: parseFloat(newTx.fee)||0,
      dividendAmount: parseFloat(newTx.dividendAmount)||0,
      amount: parseFloat(newTx.amount)||0,
    };
    setTransactions(prev => [...prev, tx]);
    setNewTx({ type:"buy", ticker:"", name:"", category:"stock", date:new Date().toISOString().slice(0,10), quantity:"", price:"", currency:"USD", fee:"", dividendAmount:"", dividendPerShare:"", divTax:"15", amount:"", notes:"" });
    setShowAddTx(false);
  };

  // ─── AVAILABLE YEARS ────────────────────────────────────────────────────
  const availableYears = useMemo(() => {
    const buys = activeTransactions.filter(t => t.type === "buy");
    if (!buys.length) return [];
    const first = Math.min(...buys.map(t => new Date(t.date).getFullYear()));
    const cur = new Date().getFullYear();
    const arr = [];
    for (let y = first; y <= cur; y++) arr.push(y);
    return arr;
  }, [transactions]);

  // ─── STYLES ────────────────────────────────────────────────────────────
  // Neumorphism color palette
  const bg     = darkMode ? "#13192b" : "#e8edf5";
  const bgCard = darkMode ? "#161d30" : "#eef2f9";
  const textPrimary = darkMode ? "#e8f0fe" : "#1a2540";
  const textSec = darkMode ? "#8b9fc0" : "#4a5a7a";
  const textMuted = darkMode ? "#3d5080" : "#8899bb";
  const accent = "#6c63ff";
  const border = darkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.08)";
  // Neumorphism shadows
  const nmShadow = darkMode
    ? "6px 6px 14px #0b1020, -4px -4px 10px #1e2a45"
    : "6px 6px 14px #c5cad6, -4px -4px 10px #ffffff";
  const nmInset = darkMode
    ? "inset 3px 3px 8px #0b1020, inset -3px -3px 8px #1e2a45"
    : "inset 3px 3px 8px #c5cad6, inset -3px -3px 8px #ffffff";
  const nmBtn = darkMode
    ? "4px 4px 10px #0b1020, -3px -3px 8px #1e2a45"
    : "4px 4px 10px #c5cad6, -3px -3px 8px #ffffff";

  const S = {
    app: { minHeight:"100vh", background:bg, color:textPrimary,
      fontFamily:"'IBM Plex Mono','Courier New',monospace", fontSize },
    nav: { background:bgCard, boxShadow: darkMode ? "0 2px 20px #0b1020" : "0 2px 20px rgba(0,0,0,0.1)",
      position:"sticky", top:0, zIndex:100 },
    navTop: { padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between",
      borderBottom: `1px solid ${border}` },
    navTabs: { padding:"0 20px", display:"flex", alignItems:"center", gap:0, overflowX:"auto" },
    logo: { fontSize:13, fontWeight:800, color:accent, letterSpacing:"0.12em", whiteSpace:"nowrap", padding:"12px 0" },
    navBtn: (active) => ({ background:"none", border:"none", padding:"12px 14px", cursor:"pointer",
      fontSize:10, fontFamily:"inherit",
      color: active ? accent : textSec,
      borderBottom: active ? `2px solid ${accent}` : "2px solid transparent",
      transition:"all 0.2s", whiteSpace:"nowrap", letterSpacing:"0.06em", textTransform:"uppercase",
      fontWeight: active ? 700 : 400 }),
    main: { padding:"20px", maxWidth:1200, margin:"0 auto" },
    card: { background:bgCard, borderRadius:16, padding:20, marginBottom:16,
      boxShadow: nmShadow, border: `1px solid ${border}` },
    statCard: (ac="#6366f1") => ({ background:bgCard, borderRadius:14, padding:18,
      boxShadow: nmShadow, border:`1px solid ${border}`,
      borderTop:`3px solid ${ac}` }),
    label: { fontSize:10, color:textMuted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5, fontWeight:600 },
    badge: (color) => ({ display:"inline-block", padding:"2px 8px", borderRadius:6, fontSize:10,
      fontWeight:700, background:color+"28", color, letterSpacing:"0.04em", textTransform:"uppercase",
      border:`1px solid ${color}44` }),
    btn: (v="primary") => ({
      background: v==="primary" ? `linear-gradient(135deg,#5b52f0,${accent})` : v==="danger" ? "transparent" : bgCard,
      color: v==="primary" ? "#fff" : v==="danger" ? "#f87171" : textSec,
      border: v==="outline" ? `1px solid ${border}` : v==="danger" ? "1px solid #f8717144" : "none",
      borderRadius:10, padding:"8px 16px", cursor:"pointer", fontSize:11, fontFamily:"inherit",
      fontWeight:600, letterSpacing:"0.05em", transition:"all 0.2s",
      boxShadow: v==="primary" ? "0 4px 15px rgba(108,99,255,0.4)" : v==="outline"||v==="danger" ? nmBtn : "none",
    }),
    input: { background:bgCard, border:`1px solid ${border}`, borderRadius:10,
      color:textPrimary, padding:"9px 14px", fontSize:12, fontFamily:"inherit",
      width:"100%", boxSizing:"border-box", boxShadow:nmInset, outline:"none" },
    select: { background:bgCard, border:`1px solid ${border}`, borderRadius:10,
      color:textPrimary, padding:"9px 14px", fontSize:12, fontFamily:"inherit",
      width:"100%", boxSizing:"border-box", boxShadow:nmInset },
    table: { width:"100%", borderCollapse:"collapse" },
    th: { textAlign:"left", padding:"10px 14px", fontSize:10, color:textMuted,
      borderBottom:`1px solid ${border}`, letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:700 },
    td: { padding:"11px 14px", borderBottom:`1px solid ${border}`, fontSize:12, color:textPrimary },
    modal: { position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", display:"flex",
      alignItems:"center", justifyContent:"center", zIndex:1000, padding:20, backdropFilter:"blur(4px)" },
    modalBox: { background:bgCard, border:`1px solid ${border}`, borderRadius:20,
      padding:28, width:"100%", maxWidth:520, maxHeight:"90vh", overflowY:"auto", boxShadow:nmShadow },
    sectionTitle: { fontSize:10, fontWeight:800, color:textMuted, letterSpacing:"0.14em",
      textTransform:"uppercase", marginBottom:14, paddingBottom:8, borderBottom:`1px solid ${border}` },
  };

  const t = T[lang] || T.cs; // current translations
  const catColor = { stock:"#6366f1", etf:"#10b981", crypto:"#f59e0b", cash:"#22d3a0", real_estate:"#f97316" };
  const catLabel = { stock:t.stocks, etf:t.etf, crypto:t.crypto, cash:lang==="en"?"Cash":"Hotovost", real_estate:lang==="en"?"Real Estate":"Nemovitosti" };

  const TABS = ["dashboard","portfolio","transakce","cashflow","dividendy","novinky","analyza","fi","dane","report","nastaveni"];
  const TAB_LABELS = { dashboard:t.dashboard, portfolio:t.portfolio, transakce:t.transakce, cashflow:t.cashflow, dividendy:t.dividendy, novinky:t.novinky, analyza:t.analyza, fi:t.fi, dane:"🧾 Daně ČR", report:"📄 Report", nastaveni:t.nastaveni };
  const filtered = filterCat === "all" ? portfolio.positions : portfolio.positions.filter(p => p.category === filterCat);

  // ─── MOBILE DETECTION ────────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Auth loading spinner
  if (authLoading) return (
    <div style={{ minHeight:"100vh", background:"#13192b", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"monospace" }}>
      <div style={{ color:"#6c63ff", fontSize:13 }}>⟳ Ověřuji přihlášení...</div>
    </div>
  );

  // Show login screen if not authenticated (and supabase is configured)
  if (supabase && !authUser) return (
    <AuthScreen onAuth={(user, profile) => { setAuthUser(user); setUserProfile(profile); }} lang={lang} setLang={setLang} />
  );

  if (!loaded) return (
    <div style={{ ...S.app, display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
      <div style={{ color:"#6c63ff" }}>Načítám data...</div>
    </div>
  );

  const fontScale = fontSize / 13;

  return (
    <div style={{...S.app}}>
      <style>{`
        :root { font-size: ${fontSize}px; }
        * { font-family: 'IBM Plex Mono', 'Courier New', monospace; box-sizing: border-box; }
        #root > div { zoom: ${fontScale.toFixed(3)}; }
        body { background: ${bg}; margin: 0; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: ${bg}; }
        ::-webkit-scrollbar-thumb { background: ${darkMode?"#2d3f5a":"#b0bdd0"}; border-radius: 3px; }
        input:focus, select:focus { outline: 2px solid #6c63ff44 !important; border-color: #6c63ff !important; }
        button:hover { opacity: 0.88; transform: translateY(-1px); }
        button:active { transform: translateY(0); opacity: 1; }
        tr:hover td { background: ${darkMode?"rgba(108,99,255,0.05)":"rgba(108,99,255,0.03)"}; }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* NAV - two rows */}
      <nav style={S.nav}>
        <div style={S.navTop}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={S.logo}>📈 INVESTTRACK</div>
            {/* User badge */}
            {authUser && (
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ fontSize:10, padding:"4px 10px", borderRadius:8,
                  background: userProfile?.role==="admin" ? "#6c63ff22" : "#22d3a018",
                  color: userProfile?.role==="admin" ? "#6c63ff" : "#22d3a0",
                  border: `1px solid ${userProfile?.role==="admin" ? "#6c63ff44" : "#22d3a044"}`,
                  fontWeight:700 }}>
                  {userProfile?.role==="admin" ? "⚡ Admin" : "👤 User"}
                  {userProfile?.display_name ? ` · ${userProfile.display_name.split(" ")[0]}` : ""}
                </div>
                {userProfile?.role==="admin" && (
                  <button style={{ ...S.btn("outline"), padding:"4px 10px", fontSize:10 }}
                    onClick={()=>setShowAdmin(true)}>👥 Uživatelé</button>
                )}
                <button style={{ ...S.btn("outline"), padding:"4px 10px", fontSize:10 }}
                  onClick={async ()=>{ await supabase?.auth.signOut(); setAuthUser(null); setUserProfile(null); setTransactions([]); setPortfolios(DEFAULT_PORTFOLIOS); setLoaded(false); }}
                  title="Odhlásit se">⏻ Odhlásit</button>
              </div>
            )}
            {/* Portfolio switcher */}
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              {portfolios.map(p => (
                <button key={p.id}
                  style={{ background: activePortfolioId===p.id ? p.color+"33" : "transparent",
                    border: `1px solid ${activePortfolioId===p.id ? p.color : "#1e293b"}`,
                    borderRadius:6, padding:"4px 12px", cursor:"pointer", fontSize:10,
                    color: activePortfolioId===p.id ? p.color : "#8b9fc0",
                    fontFamily:"inherit", fontWeight:600, transition:"all 0.2s", whiteSpace:"nowrap" }}
                  onClick={() => setActivePortfolioId(p.id)}>
                  {p.name}
                </button>
              ))}
              <button style={{ background:"none", border:"1px dashed #334155", borderRadius:6,
                padding:"4px 10px", cursor:"pointer", fontSize:11, color:"#8b9fc0", fontFamily:"inherit" }}
                onClick={() => setShowPortfolioMgr(true)} title="Spravovat portfolia">⚙</button>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            {ratesStatus === "loading" && <span style={{ fontSize:10, color:"#f59e0b" }}>↻ kurzy...</span>}
            {ratesStatus === "ok" && <span style={{ fontSize:10, color:"#10b981" }}>✓ kurzy</span>}
            {pricesStatus === "loading" && <span style={{ fontSize:10, color:"#f59e0b" }}>↻ ceny...</span>}
            {pricesStatus === "ok" && <span style={{ fontSize:10, color:"#10b981" }}>✓ ceny</span>}
            {pricesStatus === "error" && <span style={{ fontSize:10, color:"#ef4444" }}>⚠ ceny</span>}
            {ratesStatus === "error" && <span style={{ fontSize:10, color:"#ef4444" }}>kurzy offline</span>}
            {!isMobile && (
              <span style={{ fontSize:10, fontWeight:700, color: darkMode?"#8ba8d0":"#4a6080",
                background: darkMode?"#1e2d45":"#d8e4f4",
                padding:"3px 10px", borderRadius:8 }}>
                USD <b style={{color: darkMode?"#c8d8f0":"#1a2540"}}>{rates.USD_CZK}</b>
                &nbsp;·&nbsp;EUR <b style={{color: darkMode?"#c8d8f0":"#1a2540"}}>{rates.EUR_CZK}</b>
              </span>
            )}
            <span style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:8,
              background: syncStatus==="ok"?(darkMode?"#064e3b":"#d1fae5"):syncStatus==="syncing"?(darkMode?"#451a03":"#fef3c7"):syncStatus==="error"?(darkMode?"#450a0a":"#fee2e2"):(darkMode?"#1e2d45":"#d8e4f4"),
              color: syncStatus==="ok"?"#10b981":syncStatus==="syncing"?"#f59e0b":syncStatus==="error"?"#ef4444":(darkMode?"#8ba8d0":"#4a6080") }}>
              {syncStatus==="ok"?"☁ sync OK":syncStatus==="syncing"?"↻ ukládám...":syncStatus==="error"?"⚠ chyba":"💾 lokálně"}
            </span>
            {/* Font size controls */}
            {!isMobile && (
              <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                <button style={{ ...S.btn("outline"), padding:"3px 8px", fontSize:14, lineHeight:1 }}
                  onClick={() => setFontSize(s => Math.max(11, s-1))} title="Zmenšit písmo">A-</button>
                <span style={{ fontSize:10, color:textMuted, width:22, textAlign:"center" }}>{fontSize}</span>
                <button style={{ ...S.btn("outline"), padding:"3px 8px", fontSize:14, lineHeight:1 }}
                  onClick={() => setFontSize(s => Math.min(17, s+1))} title="Zvětšit písmo">A+</button>
              </div>
            )}
            {/* Language toggle */}
            <button style={{ ...S.btn("outline"), padding:"4px 10px", fontSize:11, fontWeight:700,
              color: lang==="cs" ? textMuted : accent }}
              onClick={() => setLang(l => l==="cs" ? "en" : "cs")}
              title={lang==="cs" ? "Switch to English" : "Přepnout do češtiny"}>
              {lang==="cs" ? "🇬🇧" : "🇨🇿"}
            </button>
            {/* Dark/light toggle */}
            <button style={{ ...S.btn("outline"), padding:"5px 10px", fontSize:14 }}
              onClick={() => setDarkMode(d => !d)} title={darkMode ? "Světlý režim" : "Tmavý režim"}>
              {darkMode ? "☀" : "🌙"}
            </button>
            <button style={{ ...S.btn("primary"), padding:"6px 14px" }} onClick={() => setShowAddTx(true)}>+ Transakce</button>
          </div>
        </div>
        <div style={S.navTabs}>
          {TABS.map(t => <button key={t} style={S.navBtn(tab===t)} onClick={() => setTab(t)}>{TAB_LABELS[t]}</button>)}
        </div>
      </nav>

      <main style={{...S.main, paddingBottom: isMobile ? 80 : 20}}>

        {/* ─── DASHBOARD ────────────────────────────────────────────────── */}
        {tab === "dashboard" && (
          <>
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:17, fontWeight:700, color:"#f1f5f9", marginBottom:4 }}>{t.dashboard} — <span style={{color:"#6366f1"}}>{portfolios.find(p=>p.id===activePortfolioId)?.name||"Portfolio"}</span></div>
              <div style={{ fontSize:10, color:"#8b9fc0" }}>
                {fmtDate(new Date().toISOString())}
                {rates.lastUpdated && <span style={{marginLeft:8,color:textMuted}}>· kurzy {fmtDate(rates.lastUpdated)}</span>}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))", gap:12, marginBottom:16 }}>
              {[
                { label:"Aktuální hodnota", value:fmt(portfolio.totalCurrentCZK,"CZK",0), accent:"#6366f1" },
                { label:"Investováno", value:fmt(portfolio.totalInvestedCZK,"CZK",0), accent:"#3b82f6" },
                { label:"Zisk / Ztráta", value:fmt(portfolio.totalGainCZK,"CZK",0), sub:fmtPct(portfolio.totalGainPct), accent:upColor(portfolio.totalGainCZK) },
                { label:"Denní změna", value:fmt(portfolio.totalDayChange,"CZK",0), accent:upColor(portfolio.totalDayChange) },
                { label:"Prošlo 3L testem", value:fmt(portfolio.testedTotal,"CZK",0), accent:"#f59e0b" },
                { label:"Přijaté dividendy", value:fmt(portfolio.totalDividendsCZK,"CZK",0), accent:"#8b5cf6" },
              ].map((s,i) => (
                <div key={i} style={S.statCard(s.accent)}>
                  <div style={S.label}>{s.label}</div>
                  <div style={{ fontSize:16, fontWeight:800, color:s.accent, letterSpacing:"0.03em" }}>{s.value}</div>
                  {s.sub && <div style={{ fontSize:11, color:s.accent, marginTop:2 }}>{s.sub}</div>}
                </div>
              ))}
            </div>

            {/* Growth chart + Allocation */}
            <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"2fr 1fr", gap:14, marginBottom:14 }}>
              <div style={S.card}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8, flexWrap:"wrap", gap:6 }}>
                  <div style={S.sectionTitle}>Vývoj portfolia</div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    <button style={{ ...S.btn(chartYear===null?"primary":"outline"), padding:"4px 8px", fontSize:10 }} onClick={() => setChartYear(null)}>Vše</button>
                    {availableYears.map(y => (
                      <button key={y} style={{ ...S.btn(chartYear===y?"primary":"outline"), padding:"4px 8px", fontSize:10 }} onClick={() => setChartYear(y)}>{y}</button>
                    ))}
                  </div>
                </div>
                {/* Benchmark toggles */}
                <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
                  <span style={{ fontSize:10, color:textMuted }}>Benchmark:</span>
                  {BENCHMARK_OPTIONS.map(b => (
                    <button key={b.id} onClick={() => toggleBenchmark(b.id)}
                      style={{ fontSize:10, padding:"3px 10px", borderRadius:8, cursor:"pointer",
                        border:`1px solid ${activeBenchmarks.includes(b.id)?b.color:border}`,
                        background: activeBenchmarks.includes(b.id)?b.color+"22":"transparent",
                        color: activeBenchmarks.includes(b.id)?b.color:textMuted,
                        fontFamily:"inherit", fontWeight:activeBenchmarks.includes(b.id)?700:400 }}>
                      {activeBenchmarks.includes(b.id)?"✓ ":""}{b.label}
                    </button>
                  ))}
                  {loadingBenchmark && <span style={{fontSize:10,color:textMuted}}>⟳</span>}
                </div>
                <GrowthChart transactions={activeTransactions} prices={prices} rates={rates}
                  yearFilter={chartYear} benchmarks={benchmarks}
                  activeBenchmarks={activeBenchmarks} benchmarkOptions={BENCHMARK_OPTIONS}
                  portfolioCurrentCZK={portfolio.totalCurrentCZK} />
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>Alokace</div>
                {(() => {
                  const cats = {};
                  portfolio.positions.forEach(p => {
                    // Use currentValueCZK if available, otherwise cost basis
                    const val = p.currentValueCZK > 0 ? p.currentValueCZK : p.totalCostCZK;
                    cats[p.category]=(cats[p.category]||0)+val;
                  });
                  const total = Object.values(cats).reduce((s,v)=>s+v,0)||1;
                  const entries = Object.entries(cats).filter(([,v])=>v>0);
                  const rad=80,cx=120,cy=95,tw=240,th=190;
                  let angle=-Math.PI/2;
                  const slices = entries.map(([cat,val])=>{
                    const slice=val/total*Math.PI*2;
                    const x1=cx+rad*Math.cos(angle),y1=cy+rad*Math.sin(angle);
                    angle+=slice;
                    const x2=cx+rad*Math.cos(angle),y2=cy+rad*Math.sin(angle);
                    return {cat,val,slice,x1,y1,x2,y2,large:slice>Math.PI?1:0};
                  });
                  return (
                    <div>
                      {/* Tooltip on hover */}
                      {hovCat && (
                        <div style={{fontSize:11,fontWeight:700,color:catColor[hovCat.cat]||accent,
                          background:bgCard,borderRadius:8,padding:"4px 10px",marginBottom:6,
                          border:`1px solid ${catColor[hovCat.cat]||border}55`,textAlign:"center"}}>
                          {catLabel[hovCat.cat]||hovCat.cat}: {fmt(hovCat.val,"CZK",0)} · {(hovCat.val/total*100).toFixed(1)}%
                        </div>
                      )}
                      <svg viewBox={`0 0 ${tw} ${th}`} style={{width:"100%",height:"auto"}}
                        onMouseLeave={()=>setHovCat(null)}>
                        {/* Donut slices */}
                        {slices.map(s=>{
                          const isHov = hovCat?.cat===s.cat;
                          const r = isHov ? rad+5 : rad;
                          const color=catColor[s.cat]||"#64748b";
                          return (
                            <path key={s.cat}
                              d={`M${cx},${cy} L${s.x1},${s.y1} A${r},${r} 0 ${s.large},1 ${s.x2},${s.y2} Z`}
                              fill={color} opacity={isHov?1:0.85}
                              style={{cursor:"pointer",transition:"all 0.12s"}}
                              onMouseEnter={()=>setHovCat(s)}>
                              <title>{catLabel[s.cat]||s.cat}: {(s.val/total*100).toFixed(1)}%</title>
                            </path>
                          );
                        })}
                        {/* Center hole */}
                        <circle cx={cx} cy={cy} r={rad*0.52} fill={bgCard}/>
                        {/* Center labels */}
                        <text x={cx} y={cy-5} textAnchor="middle" fill={textPrimary} fontSize="9" fontWeight="700">
                          {lang==="en"?"ALLOC":"ALOKACE"}
                        </text>
                        <text x={cx} y={cy+9} textAnchor="middle" fill={textMuted} fontSize="8">
                          {portfolio.positions.length} {lang==="en"?"pos.":"poz."}
                        </text>
                      </svg>
                      {/* Legend below chart — 2 columns */}
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 12px",marginTop:4}}>
                        {entries.map(([cat,val])=>(
                          <div key={cat} style={{display:"flex",alignItems:"center",gap:6,
                            cursor:"pointer",padding:"2px 4px",borderRadius:4,
                            background:hovCat?.cat===cat?catColor[cat]+"22":"transparent"}}
                            onMouseEnter={()=>setHovCat({cat,val})}
                            onMouseLeave={()=>setHovCat(null)}>
                            <div style={{width:10,height:10,borderRadius:2,background:catColor[cat]||"#64748b",flexShrink:0}}/>
                            <span style={{fontSize:10,color:textPrimary,fontWeight:600}}>{catLabel[cat]||cat}</span>
                            <span style={{fontSize:10,color:catColor[cat]||textMuted,fontWeight:700,marginLeft:"auto"}}>
                              {(val/total*100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Top positions + Annual returns */}
            <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:14, marginBottom:14 }}>
              <div style={S.card}>
                <div style={S.sectionTitle}>Top pozice (CZK)</div>
                {[...portfolio.positions].sort((a,b)=>(b.currentValueCZK||b.totalCostCZK)-(a.currentValueCZK||a.totalCostCZK)).slice(0,6).map(p=>{
                  const dispVal = p.currentValueCZK > 0 ? p.currentValueCZK : p.totalCostCZK;
                  const maxV=Math.max(...portfolio.positions.map(x=>x.currentValueCZK>0?x.currentValueCZK:x.totalCostCZK),1);
                  return (
                    <div key={p.ticker} style={{marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                        <span style={{fontSize:11,fontWeight:700,color:textPrimary}}>{p.ticker}</span>
                        <span style={{fontSize:11,color:textSec}}>{p.currentValueCZK>0?fmt(p.currentValueCZK,"CZK",0):`${fmt(p.totalCostCZK,"CZK",0)} (nákup)`}</span>
                      </div>
                      <div style={{background:darkMode?"#0a0f1e":"#e8edf5",borderRadius:4,height:6}}>
                        <div style={{width:`${maxV>0?(dispVal/maxV*100).toFixed(1):0}%`,height:6,borderRadius:4,background:catColor[p.category]||accent}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>{lang==="en"?"Annual Returns":"Roční výnosy"}</div>
                {(() => {
                  const allBuys = activeTransactions.filter(t=>t.type==="buy");
                  if (!allBuys.length) return <div style={{color:textMuted,fontSize:11}}>Žádná data</div>;
                  const txYears = [...new Set(allBuys.map(t=>new Date(t.date).getFullYear()))].sort();
                  const now = new Date();
                  const allYears = txYears.length ?
                    Array.from({length: now.getFullYear()-txYears[0]+1}, (_,i)=>txYears[0]+i) : [];
                  if (!allYears.length) return <div style={{color:textMuted,fontSize:11}}>Žádná data</div>;
                  // Correct: annual return = portfolio performance during each calendar year
                  // Uses all holdings acquired UP TO end of that year vs cost at start of year
                  const getPortfolioAtDate = (upToDate) => {
                    // All buys up to this date
                    const buysUntil = allBuys.filter(t=>new Date(t.date)<=upToDate);
                    const h={};
                    buysUntil.forEach(t=>{h[t.ticker]=(h[t.ticker]||0)+t.quantity;});
                    // Subtract sells up to this date
                    activeTransactions.filter(t=>t.type==="sell"&&new Date(t.date)<=upToDate)
                      .forEach(t=>{if(h[t.ticker]) h[t.ticker]=Math.max(0,h[t.ticker]-(t.quantity||0));});
                    // Cost = all invested up to this date
                    const cost = buysUntil.reduce((s,t)=>s+toCZK(t.quantity*t.price+(t.fee||0),t.currency,rates),0);
                    // Value = current prices × holdings (best proxy we have without historical prices)
                    let val = 0;
                    Object.entries(h).forEach(([tk,qty])=>{
                      const p=prices[tk];
                      if(p&&qty>0) val+=toCZK(qty*p.price,getTickerCurrency(tk,p),rates);
                    });
                    return {cost, val, holdings: h};
                  };
                  // For current year: use actual portfolio value
                  // For past years: estimate by scaling — portfolio grew by (currentVal/currentCost) ratio
                  const totalCostNow = allBuys.reduce((s,t)=>s+toCZK(t.quantity*t.price+(t.fee||0),t.currency,rates),0);
                  const totalValNow = portfolio.totalCurrentCZK > 0 ? portfolio.totalCurrentCZK : totalCostNow;
                  const overallMultiple = totalCostNow > 0 ? totalValNow / totalCostNow : 1;

                  const returns = allYears.map(y=>{
                    const startOfYear = new Date(y, 0, 1);
                    const endOfYear = y === now.getFullYear() ? now : new Date(y, 11, 31);
                    // Portfolio cost at start vs end of year
                    const atStart = getPortfolioAtDate(new Date(y-1, 11, 31));
                    const atEnd = getPortfolioAtDate(endOfYear);
                    if(atEnd.cost === 0) return null;
                    // Estimated portfolio value at start and end using current prices × overall ratio
                    // This is the best we can do without historical prices
                    const valStart = atStart.cost * overallMultiple;
                    const valEnd = y === now.getFullYear()
                      ? totalValNow  // use actual current value for current year
                      : atEnd.cost * overallMultiple;
                    // New capital added during the year
                    const newCapital = atEnd.cost - atStart.cost;
                    // Simple Dietz return: (End - Start - NewCapital) / (Start + NewCapital/2)
                    const base = valStart + newCapital / 2;
                    const ret = base > 0 ? (valEnd - valStart - newCapital) / base * 100 : 0;
                    return {year:String(y), ret, valStart, valEnd, newCapital};
                  }).filter(r=>r&&Math.abs(r.ret)<300);
                  const maxR=Math.max(...returns.map(r=>Math.abs(r.ret)),1);
                  const bW=Math.max(18,Math.floor(280/returns.length)-4);
                  const cH=110,cPad={t:12,b:22,l:4,r:4};
                  const iHr=cH-cPad.t-cPad.b;
                  return (
                    <div style={{position:"relative"}}>
                      <svg viewBox={`0 0 ${returns.length*(bW+4)+8} ${cH}`} style={{width:"100%",height:"auto"}}>
                        <line x1={0} y1={cPad.t+iHr/2} x2={returns.length*(bW+4)+8} y2={cPad.t+iHr/2} stroke={border} strokeWidth="1"/>
                        {returns.map((r,i)=>{
                          const x=4+i*(bW+4);
                          const barH=Math.max(2,Math.abs(r.ret)/maxR*(iHr/2));
                          const isPos=r.ret>=0;
                          const y=isPos?cPad.t+iHr/2-barH:cPad.t+iHr/2;
                          return (
                            <g key={r.year} style={{cursor:"pointer"}}>
                              <rect x={x} y={y} width={bW} height={barH} fill={isPos?"#10b981":"#ef4444"} rx={3} opacity={0.85}>
                                <title>{r.year}: {r.ret.toFixed(1)}%</title>
                              </rect>
                              <text x={x+bW/2} y={cH-4} textAnchor="middle" fill={textMuted} fontSize="8.5">{r.year.slice(2)}</text>
                              <text x={x+bW/2} y={isPos?y-3:y+barH+10} textAnchor="middle" fill={isPos?"#10b981":"#ef4444"} fontSize="8" fontWeight="700">{r.ret.toFixed(1)}%</text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Upcoming dividends + earnings */}
            <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:14 }}>
              <div style={S.card}>
                <div style={S.sectionTitle}>📅 {lang==="en"?"Upcoming Dividends":"Nadcházející dividendy"}</div>
                {dividends.sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,5).map((d,i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${border}` }}>
                    <div>
                      <span style={S.badge("#8b5cf6")}>{d.ticker}</span>
                      <span style={{ marginLeft:8, color:textMuted, fontSize:11 }}>{fmtDate(d.date)}</span>
                    </div>
                    <div style={{ color:"#8b5cf6", fontWeight:600, fontSize:12 }}>{fmt(d.amount,d.currency,2)}</div>
                  </div>
                ))}
                {dividends.length===0 && <div style={{color:textMuted,fontSize:11}}>-</div>}
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>📊 {lang==="en"?"Upcoming Earnings":"Nadcházející earnings"}</div>
                {earnings.sort((a,b)=>new Date(a.date)-new Date(b.date)).map((e,i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:`1px solid ${border}` }}>
                    <div>
                      <span style={S.badge("#f59e0b")}>{e.ticker}</span>
                      <span style={{ marginLeft:8, color:textMuted, fontSize:11 }}>{fmtDate(e.date)}</span>
                    </div>
                    <div style={{ color:textMuted, fontSize:11 }}>{e.estimate}</div>
                  </div>
                ))}
                {earnings.length===0 && <div style={{color:textMuted,fontSize:11}}>-</div>}
              </div>
            </div>
          </>
        )}

        {/* ─── PORTFOLIO ─────────────────────────────────────────────────── */}
        {tab === "portfolio" && (
          <>
            {/* Portfolio fundamental metrics */}
            {(() => {
              const stockPos = portfolio.positions.filter(p=>p.category==="stock"||p.category==="etf");
              const totalStockVal = stockPos.reduce((s,p)=>s+p.currentValueCZK,0)||1;
              const wAvg = (fn) => {
                const vals = stockPos.map(p=>({w:p.currentValueCZK/totalStockVal,v:fn(p)})).filter(x=>x.v&&x.v>0);
                if(!vals.length) return null;
                return vals.reduce((s,x)=>s+x.w*x.v,0);
              };
              const gm = (tk,key) => prices[tk]?.[key]||null;
              const metrics = [
                {l:"P/E",v:wAvg(p=>gm(p.ticker,"pe")),fmt:v=>v.toFixed(1),accent:"#6366f1",info:"Price/Earnings"},
                {l:"Forw. P/E",v:wAvg(p=>gm(p.ticker,"forwardPe")),fmt:v=>v.toFixed(1),accent:"#3b82f6",info:"Forward P/E"},
                {l:"P/B",v:wAvg(p=>gm(p.ticker,"pb")),fmt:v=>v.toFixed(2),accent:"#8b5cf6",info:"Price/Book"},
                {l:"P/S",v:wAvg(p=>gm(p.ticker,"ps")),fmt:v=>v.toFixed(2),accent:"#ec4899",info:"Price/Sales"},
                {l:"ROE",v:wAvg(p=>gm(p.ticker,"roe")),fmt:v=>v.toFixed(1)+"%",accent:"#10b981",info:"Return on Equity"},
                {l:"ROA",v:wAvg(p=>gm(p.ticker,"roa")),fmt:v=>v.toFixed(1)+"%",accent:"#22d3a0",info:"Return on Assets"},
                {l:"Net Margin",v:wAvg(p=>gm(p.ticker,"netMargin")),fmt:v=>v.toFixed(1)+"%",accent:"#f59e0b",info:"Čistá marže"},
                {l:"Beta",v:wAvg(p=>gm(p.ticker,"beta")),fmt:v=>v.toFixed(2),accent:"#f97316",info:"Tržní beta"},
              ];
              const hasData = metrics.some(m=>m.v!==null);
              if(!hasData) return null;
              return (
                <div style={{...S.card,marginBottom:12}}>
                  <div style={S.sectionTitle}>{lang==="en"?"Portfolio Metrics":"Fundamentální metriky portfolia"}</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:10}}>
                    {metrics.map((m,i)=>(
                      <div key={i} title={m.info} style={{background:darkMode?"#0a0f1e":"#f8fafc",borderRadius:10,padding:"10px 12px",border:`1px solid ${m.accent}33`,textAlign:"center"}}>
                        <div style={{fontSize:9,color:textMuted,textTransform:"uppercase",marginBottom:4}}>{m.l}</div>
                        <div style={{fontSize:16,fontWeight:800,color:m.v!==null?m.accent:textMuted}}>{m.v!==null?m.fmt(m.v):"–"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Summary stats */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:14 }}>
              {[
                {label:lang==="en"?"Positions":"Počet pozic",value:portfolio.positions.length,accent:"#6366f1",fmt:v=>v},
                {label:lang==="en"?"Portfolio Value":"Hodnota portfolia",value:fmt(portfolio.totalCurrentCZK,"CZK",0),accent:"#10b981",fmt:v=>v},
                {label:lang==="en"?"Invested":"Investováno",value:fmt(portfolio.totalInvestedCZK,"CZK",0),accent:"#3b82f6",fmt:v=>v},
                {label:lang==="en"?"Total Return":"Celkový výnos",value:fmtPct(portfolio.totalGainPct),accent:upColor(portfolio.totalGainPct),fmt:v=>v},
              ].map((s,i)=>(
                <div key={i} style={S.statCard(s.accent)}>
                  <div style={S.label}>{s.label}</div>
                  <div style={{fontSize:15,fontWeight:700,color:s.accent}}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* View toggle + filters */}
            <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
              <div style={{ display:"flex", gap:4 }}>
                {["all","stock","etf","crypto","real_estate"].map(c=>(
                  <button key={c} style={{ ...S.btn(filterCat===c?"primary":"outline"), padding:"5px 10px", fontSize:10 }}
                    onClick={()=>setFilterCat(c)}>
                    {c==="all"?(lang==="en"?"All":"Vše"):catLabel[c]||c}
                  </button>
                ))}
              </div>
              <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
                {[["table","☰"],["cards","⊞"],["heatmap","▦"]].map(([v,icon])=>(
                  <button key={v} style={{ ...S.btn(viewMode===v?"primary":"outline"), padding:"5px 10px", fontSize:14 }}
                    onClick={()=>setViewMode(v)}>{icon}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:6, alignItems:"center", fontSize:10, color:textMuted }}>
                <span>{lang==="en"?"Sort:":"Řadit:"}</span>
                <select value={sortKey} onChange={e=>setSortKey(e.target.value)} style={{ ...S.select, width:"auto", padding:"4px 8px", fontSize:10 }}>
                  {[["value",lang==="en"?"Value":"Hodnota"],["gain",lang==="en"?"Gain":"Zisk"],["gainpct","%"],["annret",lang==="en"?"Ann.Ret":"Roč.výn"],["change1d","1D%"],["weight",lang==="en"?"Weight":"Váha"],["yoc","YoC"],["days",lang==="en"?"Days":"Dny"]].map(([k,l])=>(
                    <option key={k} value={k}>{l}</option>
                  ))}
                </select>
                <button style={{ ...S.btn("outline"), padding:"4px 8px", fontSize:10 }} onClick={()=>setSortDir(d=>d==="asc"?"desc":"asc")}>
                  {sortDir==="asc"?"↑":"↓"}
                </button>
              </div>
            </div>

            {/* TABLE VIEW */}
            {viewMode==="table" && (
              <div style={{ overflowX:"auto" }}>
                <table style={S.table}>
                  <thead><tr>
                    {[
                      {k:"name",l:"Ticker"},{k:"value",l:lang==="en"?"Value":"Hodnota"},{k:"weight",l:lang==="en"?"Weight%":"Váha %"},
                      {k:"gain",l:lang==="en"?"Gain/Loss":"Zisk/Ztráta"},{k:"gainpct",l:lang==="en"?"Gain %":"Zisk %"},
                      {k:"annret",l:lang==="en"?"Ann.Return":"Roční výnos"},{k:"yoc",l:"YoC"},
                      {k:"divyield",l:lang==="en"?"Div.Yield":"Div. výnos"},{k:"change1d",l:lang==="en"?"Daily %":"Denní %"},
                      {k:"days",l:lang==="en"?"Days":"Dnů"},{k:"3l",l:"3L"},{k:"price1",l:lang==="en"?"Price/sh":"Cena/ks"}
                    ].map(h=>(
                      <th key={h.k} style={{ ...S.th, cursor:"pointer" }} onClick={()=>{ setSortKey(h.k); setSortDir(d=>d==="asc"?"desc":"asc"); }}>
                        {h.l}{sortKey===h.k?(sortDir==="asc"?" ↑":" ↓"):""}
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filtered.sort((a,b)=>{
                      const v = {value:"currentValueCZK",gain:"gainCZK",gainpct:"gainPct",annret:"annualizedReturn",yoc:"yoc",change1d:"change1d",weight:"weight",days:"daysToTest",divyield:"divYield"}[sortKey]||"currentValueCZK";
                      return sortDir==="asc"?(a[v]||0)-(b[v]||0):(b[v]||0)-(a[v]||0);
                    }).map(p=>{
                      const typeColor = {buy:"#10b981",sell:"#ef4444",dividend:"#8b5cf6",deposit:"#22d3a0",withdraw:"#f59e0b"};
                      const isPos = p.gainCZK >= 0;
                      return (
                        <tr key={p.ticker} style={{ borderLeft:`2px solid ${catColor[p.category]||"#334155"}` }}>
                          <td style={S.td}>
                            <div style={{fontWeight:700,color:textPrimary}}>{p.ticker}</div>
                            <div style={{fontSize:9,color:textMuted}}>{(tickerNames[p.ticker]||KNOWN_NAMES[p.ticker]||p.name||"")?.slice(0,20)}</div>
                            <span style={S.badge(catColor[p.category]||"#64748b")}>{catLabel[p.category]||p.category}</span>
                          </td>
                          <td style={S.td}>
                            <div style={{fontWeight:600,color:textPrimary}}>{fmt(p.currentValueCZK,"CZK",0)}</div>
                            <div style={{fontSize:10,color:textMuted}}>{p.totalQty.toFixed(p.category==="crypto"?4:2)} ks</div>
                          </td>
                          <td style={S.td}>
                            <div style={{color:accent,fontWeight:600}}>{p.weight?.toFixed(1)}%</div>
                            <div style={{background:border,borderRadius:3,height:4,marginTop:3}}>
                              <div style={{width:`${p.weight||0}%`,height:4,borderRadius:3,background:accent}}/>
                            </div>
                          </td>
                          <td style={{...S.td,color:isPos?"#22d3a0":"#f87171",fontWeight:600}}>{fmt(p.gainCZK,"CZK",0)}</td>
                          <td style={{...S.td,color:isPos?"#22d3a0":"#f87171",fontWeight:700}}>{fmtPct(p.gainPct)}</td>
                          <td style={{...S.td,color:(p.annualizedReturn||0)>=0?"#22d3a0":"#f87171",fontWeight:600}}>{p.annualizedReturn!=null&&p.annualizedReturn!==0?fmtPct(p.annualizedReturn):"–"}</td>
                          <td style={{...S.td,color:"#8b5cf6"}}>{p.yoc!=null?p.yoc.toFixed(2)+"%":"–"}</td>
                          <td style={{...S.td,color:"#8b5cf6"}}>{p.divYield!=null?p.divYield.toFixed(2)+"%":"–"}</td>
                          <td style={{...S.td,color:upColor(p.change1d),fontWeight:600}}>{p.change1d!=null?(p.change1d>=0?"+":"")+p.change1d.toFixed(2)+"%":"–"}</td>
                          <td style={S.td}>{p.daysToTest>0?<span style={{color:"#f59e0b",fontSize:10}}>{p.daysToTest}d</span>:<span style={{color:"#10b981",fontSize:10}}>✓</span>}</td>
                          <td style={S.td}>{p.daysToTest>0?<span style={{color:"#f59e0b",fontSize:10}}>{p.daysToTest}d</span>:<span style={{color:"#10b981",fontSize:10}}>✓</span>}</td>
                          <td style={{...S.td,color:textSec,fontSize:11}}>
                            {p.currentPrice>0?`${p.currentPrice.toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})} ${p.currentCurrency}`:"–"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* CARDS VIEW */}
            {viewMode==="cards" && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 }}>
                {filtered.sort((a,b)=>b.currentValueCZK-a.currentValueCZK).map(p=>(
                  <div key={p.ticker} style={{ ...S.card, borderTop:`3px solid ${catColor[p.category]||accent}`, marginBottom:0 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div>
                        <div style={{ fontWeight:700, color:textPrimary, fontSize:14 }}>{p.ticker}</div>
                        <div style={{ fontSize:10, color:textMuted }}>{(tickerNames[p.ticker]||KNOWN_NAMES[p.ticker]||p.name||"")?.slice(0,22)}</div>
                      </div>
                      <span style={S.badge(catColor[p.category]||"#64748b")}>{catLabel[p.category]||p.category}</span>
                    </div>
                    <div style={{ fontSize:18, fontWeight:800, color:textPrimary, margin:"8px 0" }}>{fmt(p.currentValueCZK,"CZK",0)}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11 }}>
                      <span style={{ color:p.gainCZK>=0?"#22d3a0":"#f87171", fontWeight:600 }}>{fmtPct(p.gainPct)}</span>
                      <span style={{ color:textMuted }}>{p.totalQty.toFixed(2)} ks</span>
                    </div>
                    {p.yoc!=null&&p.yoc>0&&<div style={{ fontSize:10, color:"#8b5cf6", marginTop:4 }}>YoC: {p.yoc.toFixed(2)}%</div>}
                  </div>
                ))}
              </div>
            )}

            {/* HEATMAP VIEW */}
            {viewMode==="heatmap" && (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))", gap:8 }}>
                {filtered.sort((a,b)=>b.currentValueCZK-a.currentValueCZK).map(p=>{
                  const heat = Math.max(-1,Math.min(1,p.gainPct/100));
                  const bg = heat>=0?`rgba(16,185,129,${0.1+heat*0.7})`:`rgba(248,113,113,${0.1+Math.abs(heat)*0.7})`;
                  return (
                    <div key={p.ticker} style={{ background:bg, borderRadius:10, padding:"12px 10px", textAlign:"center" }}>
                      <div style={{ fontWeight:700, color:textPrimary, fontSize:13 }}>{p.ticker}</div>
                      <div style={{ fontSize:11, color:textMuted, marginBottom:4 }}>{fmt(p.currentValueCZK,"CZK",0)}</div>
                      <div style={{ fontWeight:700, color:p.gainPct>=0?"#22d3a0":"#f87171" }}>{fmtPct(p.gainPct)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ─── TRANSAKCE ───────────────────────────────────────────────────────── */}
        {tab === "transakce" && (
          <>
            {/* Header row */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
              <div style={{fontSize:16,fontWeight:700,color:textPrimary}}>{lang==="en"?"Transactions":"Historie transakcí"}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button style={S.btn("primary")} onClick={()=>setShowAddTx(true)}>+ {lang==="en"?"Add":"Přidat"}</button>
                <button style={S.btn("outline")} onClick={()=>setShowCsvImport(true)}>📂 CSV</button>
                <button style={S.btn("outline")} onClick={()=>{
                  const headers=["type","ticker","name","category","date","quantity","price","currency","fee","dividendAmount","amount","notes"];
                  const rows=activeTransactions.map(t=>headers.map(h=>{const v=t[h]??"";return String(v).includes(",")?'"'+v+'"':v;}).join(","));
                  const csv=[headers.join(","),...rows].join("\n");
                  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
                  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="transakce-"+new Date().toISOString().slice(0,10)+".csv";a.click();
                }}>📤 Export</button>
                <button style={{...S.btn("danger"),border:"1px solid #dc262644"}} onClick={()=>setShowDeleteAll(true)}>🗑</button>
              </div>
            </div>

            {/* Filter bar */}
            {(() => {
              // Distinct type colors — fully differentiated
              const TX_TYPE_COLORS = {
                buy:"#3b82f6",        // modrá — nákup
                sell:"#ef4444",       // červená — prodej
                dividend:"#a855f7",   // fialová — dividenda
                deposit:"#10b981",    // zelená — vklad
                withdraw:"#f97316",   // oranžová — výběr
              };
              const TX_CAT_COLORS = {
                stock:"#6366f1",      // indigo — akcie
                etf:"#06b6d4",        // azurová — ETF (odlišena od cash)
                crypto:"#f59e0b",     // žlutá — crypto
                real_estate:"#f97316",// oranžová — nemovitosti
                cash:"#84cc16",       // limetková — hotovost (odlišena od ETF)
              };
              const TX_TYPE_LABELS = {buy:lang==="en"?"Buy":"Nákup",sell:lang==="en"?"Sell":"Prodej",dividend:lang==="en"?"Dividend":"Dividenda",deposit:lang==="en"?"Deposit":"Vklad",withdraw:lang==="en"?"Withdrawal":"Výběr"};
              const TX_CAT_LABELS = {stock:lang==="en"?"Stocks":"Akcie",etf:"ETF",crypto:"Crypto",real_estate:lang==="en"?"Real Estate":"Nemovitosti",cash:lang==="en"?"Cash":"Hotovost"};

              const [txFilter, setTxFilter] = [txTypeFilter, setTxTypeFilter];

              const filtered = [...activeTransactions]
                .filter(t => {
                  if(!txFilter||txFilter==="all") return true;
                  if(Object.keys(TX_TYPE_COLORS).includes(txFilter)) return t.type===txFilter;
                  return t.category===txFilter;
                })
                .sort((a,b)=>new Date(b.date)-new Date(a.date));

              return (
                <>
                  {/* Filter chips */}
                  <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:10,color:textMuted,marginRight:2}}>{lang==="en"?"Filter:":"Filtr:"}</span>
                    {["all","buy","sell","dividend","deposit","withdraw","stock","etf","crypto","real_estate","cash"].map(f=>{
                      const isType = Object.keys(TX_TYPE_COLORS).includes(f);
                      const color = f==="all"?accent:isType?TX_TYPE_COLORS[f]:TX_CAT_COLORS[f]||"#64748b";
                      const label = f==="all"?(lang==="en"?"All":"Vše"):isType?(TX_TYPE_LABELS[f]||f):(TX_CAT_LABELS[f]||f);
                      const active = txFilter===f;
                      return (
                        <button key={f} onClick={()=>setTxFilter(active?"all":f)}
                          style={{fontSize:10,padding:"3px 10px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",
                            fontWeight:active?700:400,
                            background:active?color+"33":"transparent",
                            color:active?color:textMuted,
                            border:`1px solid ${active?color:border}`,
                            transition:"all 0.15s"}}>
                          {label}
                        </button>
                      );
                    })}
                    {txFilter&&txFilter!=="all"&&(
                      <span style={{fontSize:10,color:textMuted}}>
                        · {filtered.length} {lang==="en"?"records":"záznamů"}
                      </span>
                    )}
                  </div>

                  {/* Table */}
                  <div style={{overflowX:"auto"}}>
                    <table style={S.table}>
                      <thead><tr>
                        {["",lang==="en"?"Date":"Datum","Typ",lang==="en"?"Ticker":"Ticker","Kat.",lang==="en"?"Qty":"Mn.",lang==="en"?"Price":"Cena",lang==="en"?"Fee":"Popl.",lang==="en"?"Total CZK":"CZK",""].map((h,i)=>(
                          <th key={i} style={S.th}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {filtered.map((t,_fi)=>{
                          const seqId = (() => {
                            const allSorted=[...activeTransactions].sort((a,b)=>new Date(a.date)-new Date(b.date));
                            return allSorted.findIndex(x=>x.id===t.id)+1;
                          })();
                          const tc=TX_TYPE_COLORS[t.type]||"#94a3b8";
                          const cc = TX_CAT_COLORS[t.category]||"#64748b";
                          const tl = TX_TYPE_LABELS[t.type]||t.type;
                          const cl = TX_CAT_LABELS[t.category]||t.category;
                          // dividendAmount stored in CZK if auto-calculated, else convert
                          const getDivCZK=(t)=>{
                            if(t.dividendAmountCZK) return t.dividendAmountCZK;
                            const amt=t.dividendAmount||0;
                            // If currency CZK or amount looks like CZK (>100 for most), use direct
                            if(t.currency==="CZK") return amt;
                            return toCZK(amt,t.currency||"USD",rates);
                          };
                          const totalCZK = t.type==="dividend"?getDivCZK(t)
                            :(t.type==="deposit"||t.type==="withdraw")?toCZK(t.amount||0,t.currency,rates)
                            :toCZK((t.quantity||0)*(t.price||0)+(t.fee||0),t.currency,rates);
                          const isDepWith = t.type==="deposit"||t.type==="withdraw";
                          const rowBg = t.type==="buy"?"#3b82f608":t.type==="deposit"?"#10b98108":t.type==="sell"?"#ef444408":t.type==="withdraw"?"#f9731608":"transparent";
                          return (
                            <tr key={t.id} style={{background:rowBg,borderLeft:`3px solid ${tc}`}}>
                              <td style={{...S.td,color:textMuted,fontSize:10,minWidth:28}}>{seqId}</td>
                              <td style={S.td}>{fmtDate(t.date)}</td>
                              <td style={S.td}>
                                <span style={{...S.badge(tc),minWidth:62,textAlign:"center",display:"inline-block"}}>{tl}</span>
                              </td>
                              <td style={S.td}>
                                {isDepWith
                                  ? <span style={{color:textMuted,fontSize:11}}>–</span>
                                  : <><b style={{color:textPrimary}}>{t.ticker}</b><div style={{fontSize:9,color:textMuted}}>{(tickerNames[t.ticker]||KNOWN_NAMES[t.ticker]||t.name||"")?.slice(0,16)}</div></>}
                              </td>
                              <td style={S.td}>
                                <span style={{...S.badge(cc),minWidth:52,textAlign:"center",display:"inline-block"}}>{cl}</span>
                              </td>
                              <td style={S.td}>{isDepWith||t.type==="dividend"?"–":t.quantity}</td>
                              <td style={S.td}>
                                {t.type==="dividend"?fmt(getDivCZK(t),"CZK",0):isDepWith?fmt(t.amount||0,t.currency,0):`${(t.price||0).toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:4})} ${t.currency==="CZK"?"Kč":t.currency}`}
                              </td>
                              <td style={S.td}>{t.fee?`${(t.fee||0).toLocaleString("cs-CZ",{minimumFractionDigits:2,maximumFractionDigits:2})} ${t.currency==="CZK"?"Kč":t.currency}`:"–"}</td>
                              <td style={{...S.td,fontWeight:600,color:t.type==="sell"||t.type==="withdraw"?"#f87171":"#22d3a0"}}>{fmt(totalCZK,"CZK",0)}</td>
                              <td style={S.td}>
                                <div style={{display:"flex",gap:4}}>
                                  <button style={{...S.btn("outline"),padding:"3px 8px",fontSize:11}} onClick={()=>setEditTx({...t})}>✏</button>
                                  <button style={{...S.btn("danger"),padding:"3px 8px"}} onClick={()=>{if(window.confirm("Smazat?"))setTransactions(prev=>prev.filter(x=>x.id!==t.id));}}>✕</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}

            {/* Delete all modal */}
            {showDeleteAll && (
              <div style={S.modal}>
                <div style={S.modalBox}>
                  <div style={{fontSize:15,fontWeight:700,marginBottom:14,color:textPrimary}}>🗑 {lang==="en"?"Delete transactions":"Smazat transakce"}</div>
                  {[
                    {label:lang==="en"?"All transactions":"Všechny transakce",types:["buy","sell","dividend","deposit","withdraw"]},
                    {label:lang==="en"?"Buys & Sells only":"Jen nákupy a prodeje",types:["buy","sell"]},
                    {label:lang==="en"?"Dividends only":"Jen dividendy",types:["dividend"]},
                    {label:lang==="en"?"Deposits/Withdrawals only":"Jen vklady/výběry",types:["deposit","withdraw"]},
                  ].map((opt,i)=>(
                    <button key={i} style={{...S.btn("danger"),display:"block",width:"100%",textAlign:"left",marginBottom:8,padding:"10px 14px"}}
                      onClick={()=>{
                        setTransactions(prev=>prev.filter(t=>{
                          const pid=t.portfolioId||activePortfolioId;
                          if(pid!==activePortfolioId) return true;
                          return !opt.types.includes(t.type);
                        }));
                        setShowDeleteAll(false);
                      }}>
                      {opt.label}
                    </button>
                  ))}
                  <button style={{...S.btn("outline"),width:"100%",padding:"10px"}} onClick={()=>setShowDeleteAll(false)}>{lang==="en"?"Cancel":"Zrušit"}</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ─── CASHFLOW ────────────────────────────────────────────────────────── */}
        {tab === "cashflow" && (
          <>
            <div style={{ fontSize:16, fontWeight:700, color:textPrimary, marginBottom:14 }}>{lang==="en"?"Deposits & Withdrawals":"Vklady & Výběry"}</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12, marginBottom:16 }}>
              {[
                {label:lang==="en"?"Total Deposits":"Celkové vklady",value:fmt(portfolio.totalDeposits||0,"CZK",0),accent:"#10b981"},
                {label:lang==="en"?"Total Withdrawals":"Celkové výběry",value:fmt(portfolio.totalWithdrawals||0,"CZK",0),accent:"#ef4444"},
                {label:lang==="en"?"Net Deposit":"Čistý vklad",value:fmt((portfolio.totalDeposits||0)-(portfolio.totalWithdrawals||0),"CZK",0),accent:"#3b82f6"},
                {label:lang==="en"?"Portfolio Value":"Hodnota portfolia",value:fmt(portfolio.totalCurrentCZK,"CZK",0),accent:"#6366f1"},
              ].map((s,i)=>(
                <div key={i} style={S.statCard(s.accent)}>
                  <div style={S.label}>{s.label}</div>
                  <div style={{fontSize:15,fontWeight:700,color:s.accent}}>{s.value}</div>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={S.sectionTitle}>{lang==="en"?"Cash Flow History":"Historie vkladů a výběrů"}</div>
              <table style={S.table}>
                <thead><tr>
                  {[lang==="en"?"Date":"Datum",lang==="en"?"Type":"Typ",lang==="en"?"Amount":"Částka",lang==="en"?"Note":"Poznámka"].map(h=><th key={h} style={S.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {activeTransactions.filter(t=>t.type==="deposit"||t.type==="withdraw").sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t=>(
                    <tr key={t.id}>
                      <td style={S.td}>{fmtDate(t.date)}</td>
                      <td style={S.td}><span style={S.badge(t.type==="deposit"?"#22d3a0":"#f87171")}>{t.type==="deposit"?(lang==="en"?"Deposit":"Vklad"):(lang==="en"?"Withdrawal":"Výběr")}</span></td>
                      <td style={{...S.td,fontWeight:600,color:t.type==="deposit"?"#22d3a0":"#f87171"}}>{fmt(t.amount||0,t.currency,0)} {t.currency}</td>
                      <td style={{...S.td,color:textMuted}}>{t.notes||"–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ─── DIVIDENDY ───────────────────────────────────────────────────────── */}
        {tab === "dividendy" && (
          <>
            <div style={{ fontSize:16, fontWeight:700, color:textPrimary, marginBottom:14 }}>{lang==="en"?"Dividend Calendar":"Dividendový kalendář"}</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:16 }}>
              {(() => {
                const now2 = new Date();
                const yearDiv = activeTransactions.filter(t=>t.type==="dividend"&&new Date(t.date).getFullYear()===divCalYear);
                // dividendAmount is stored in CZK after conversion at entry time
                // Use totalDividendsCZK from portfolio for current year
                const received = yearDiv.reduce((s,t)=>s+toCZK(t.dividendAmount||0,t.currency||"CZK",rates),0);
                const upcoming = dividends.filter(d=>new Date(d.date).getFullYear()===divCalYear).reduce((s,d)=>s+toCZK(d.amount||0,d.currency,rates),0);
                const annualEst = received * 4;
                return [
                  {label:(lang==="en"?"Received":"Přijato")+" "+divCalYear,value:fmt(received,"CZK",0),accent:"#10b981"},
                  {label:lang==="en"?"Expected EOY":"Očekáváno do konce roku",value:fmt(upcoming,"CZK",0),accent:"#8b5cf6"},
                  {label:(lang==="en"?"Total":"Celkem")+" "+divCalYear,value:fmt(received+upcoming,"CZK",0),accent:"#6366f1"},
                  {label:lang==="en"?"Annual Est.":"Roční odhad (4× kv.)",value:fmt(annualEst,"CZK",0),accent:"#f59e0b"},
                ].map((s,i)=>(
                  <div key={i} style={S.statCard(s.accent)}>
                    <div style={S.label}>{s.label}</div>
                    <div style={{fontSize:14,fontWeight:700,color:s.accent}}>{s.value}</div>
                  </div>
                ));
              })()}
            </div>

            {/* Digrin-style Dividend Chart */}
            <DigrínDividendChart
              transactions={activeTransactions}
              rates={rates}
              tickerNames={{...tickerNames,...KNOWN_NAMES}}
              S={S} textMuted={textMuted} textPrimary={textPrimary}
              border={border} bgCard={bgCard} accent={accent} lang={lang}
            />

            {/* Monthly calendar */}
            <div style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={S.sectionTitle}>{lang==="en"?"Monthly Overview":"Měsíční přehled"} {divCalYear}</div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <button style={{...S.btn("outline"),padding:"3px 10px",fontSize:12}}
                    onClick={()=>setDivCalYear(y=>{
                      const yrs=[...new Set(activeTransactions.filter(t=>t.type==="buy").map(t=>new Date(t.date).getFullYear()))];
                      return Math.max(y-1,yrs.length?Math.min(...yrs):y-1);
                    })}>◀</button>
                  <span style={{fontSize:12,fontWeight:700,color:textPrimary,minWidth:40,textAlign:"center"}}>{divCalYear}</span>
                  <button style={{...S.btn("outline"),padding:"3px 10px",fontSize:12}}
                    onClick={()=>setDivCalYear(y=>Math.min(y+1,new Date().getFullYear()))}>▶</button>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                {(lang==="en"?T.en.months:T.cs.months).map((monthName,mi)=>{
                  const now3=new Date();
                  const received2=activeTransactions.filter(t=>t.type==="dividend"&&new Date(t.date).getFullYear()===divCalYear&&new Date(t.date).getMonth()===mi).reduce((s,t)=>s+toCZK(t.dividendAmount||0,t.currency||"CZK",rates),0);
                  const upcoming2=dividends.filter(d=>new Date(d.date).getMonth()===mi&&new Date(d.date).getFullYear()===divCalYear).reduce((s,d)=>s+toCZK(d.amount||0,d.currency,rates),0);
                  const isCurrentMonth=mi===now3.getMonth()&&divCalYear===now3.getFullYear();
                  const isPast=new Date(divCalYear,mi+1,1)<=now3;
                  return (
                    <div key={mi} style={{background:isCurrentMonth?accent+"22":darkMode?"#0a0f1e":"#f8fafc",borderRadius:8,padding:"8px 10px",border:`1px solid ${isCurrentMonth?accent:border}`}}>
                      <div style={{fontSize:10,fontWeight:700,color:isCurrentMonth?accent:textMuted,marginBottom:4}}>{monthName}</div>
                      {received2>0&&<div style={{fontSize:11,color:"#10b981",fontWeight:600}}>{fmt(received2,"CZK",0)}</div>}
                      {upcoming2>0&&<div style={{fontSize:10,color:"#8b5cf6"}}>{fmt(upcoming2,"CZK",0)} {lang==="en"?"exp.":"oček."}</div>}
                      {received2===0&&upcoming2===0&&<div style={{fontSize:10,color:textMuted}}>–</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ─── NOVINKY ─────────────────────────────────────────────────────────── */}
        {tab === "novinky" && <NewsTab portfolio={portfolio} S={S} t={t} />}

        {/* ─── ANALYZA ─────────────────────────────────────────────────────────── */}
        {tab === "analyza" && (
          <AnalyzaTab rates={rates} S={S} t={t} lang={lang} />
        )}

        {/* ─── FI ──────────────────────────────────────────────────────────────── */}
        {tab === "fi" && (
          <>
            <div style={{ fontSize:16, fontWeight:700, color:textPrimary, marginBottom:14 }}>🎯 {lang==="en"?"FI Calculator":"Kalkulačka finanční nezávislosti"}</div>
            <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:16 }}>
              <div style={S.card}>
                <div style={S.sectionTitle}>{lang==="en"?"FI Parameters":"Parametry FI"}</div>
                {[
                  {label:lang==="en"?"Monthly Expenses (CZK)":"Měsíční výdaje (CZK)",key:"monthlyExpenses",type:"number"},
                  {label:lang==="en"?"Monthly Investment (CZK)":"Měsíční investice (CZK)",key:"monthlySavings",type:"number"},
                  {label:lang==="en"?"Expected Annual Return (%)":"Očekávaný roční výnos (%)",key:"annualReturn",type:"number"},
                  {label:"SWR (%)",key:"swr",type:"number"},
                ].map(f=>(
                  <div key={f.key} style={{marginBottom:12}}>
                    <div style={S.label}>{f.label}</div>
                    <input type={f.type} value={fiSettings[f.key]||""} onChange={e=>setFiSettings(p=>({...p,[f.key]:parseFloat(e.target.value)||0}))} style={S.input}/>
                  </div>
                ))}
                {(() => {
                  const swr=fiSettings.swr||4;
                  const exp=fiSettings.monthlyExpenses||50000;
                  const fiNum=exp*12/(swr/100);
                  const curr=portfolio.totalCurrentCZK||0;
                  const monthly=fiSettings.monthlySavings||10000;
                  const rate=(fiSettings.annualReturn||7)/100/12;
                  let months2=0;
                  let val=curr;
                  while(val<fiNum&&months2<600){val=val*(1+rate)+monthly;months2++;}
                  return (
                    <div style={{marginTop:16,padding:12,background:darkMode?"#0a0f1e":"#f8fafc",borderRadius:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{color:textMuted,fontSize:11}}>{lang==="en"?"FI Number:":"FI číslo:"}</span>
                        <span style={{color:accent,fontWeight:700}}>{fmt(fiNum,"CZK",0)}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{color:textMuted,fontSize:11}}>{lang==="en"?"Current:":"Aktuálně:"}</span>
                        <span style={{color:textPrimary,fontWeight:700}}>{fmt(curr,"CZK",0)}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                        <span style={{color:textMuted,fontSize:11}}>{lang==="en"?"Remaining:":"Zbývá:"}</span>
                        <span style={{color:"#f59e0b",fontWeight:700}}>{fmt(Math.max(0,fiNum-curr),"CZK",0)}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between"}}>
                        <span style={{color:textMuted,fontSize:11}}>{lang==="en"?"Est. Time:":"Odhadovaný čas:"}</span>
                        <span style={{color:"#10b981",fontWeight:700}}>{months2<600?`${Math.floor(months2/12)}r ${months2%12}m`:"∞"}</span>
                      </div>
                      <div style={{marginTop:10,background:border,borderRadius:4,height:8}}>
                        <div style={{width:`${Math.min(100,(curr/fiNum*100)).toFixed(1)}%`,height:8,borderRadius:4,background:accent}}/>
                      </div>
                      <div style={{fontSize:10,color:textMuted,textAlign:"center",marginTop:4}}>{(curr/fiNum*100).toFixed(1)}% {lang==="en"?"to FI":"do FI"}</div>
                    </div>
                  );
                })()}
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>{lang==="en"?"Portfolio Projection":"Projekce portfolia"}</div>
                {(() => {
                  const swr=fiSettings.swr||4;
                  const exp=fiSettings.monthlyExpenses||50000;
                  const fiNum=exp*12/(swr/100);
                  const monthly=fiSettings.monthlySavings||10000;
                  const rate=(fiSettings.annualReturn||7)/100/12;
                  const curr=portfolio.totalCurrentCZK||0;
                  const pts=[];
                  let val2=curr;
                  for(let i=0;i<=30;i++){
                    pts.push({y:i,v:val2});
                    for(let m=0;m<12;m++){val2=val2*(1+rate)+monthly;}
                  }
                  const maxV2=Math.max(...pts.map(p=>p.v),fiNum,1);
                  const w2=300,h2=180,pad2={t:10,b:24,l:56,r:10};
                  const iW2=w2-pad2.l-pad2.r,iH2=h2-pad2.t-pad2.b;
                  const xS2=i=>pad2.l+(i/30)*iW2;
                  const yS2=v=>pad2.t+iH2-(v/maxV2)*iH2;
                  const path2=pts.map((p,i)=>`${i===0?"M":"L"}${xS2(p.y)},${yS2(p.v)}`).join(" ");
                  const fiY=pts.find(p=>p.v>=fiNum)?.y;
                  return (
                    <svg viewBox={`0 0 ${w2} ${h2}`} style={{width:"100%",height:"auto"}}>
                      {[0,0.25,0.5,0.75,1].map(t3=>(
                        <g key={t3}>
                          <line x1={pad2.l} y1={pad2.t+iH2*t3} x2={w2-pad2.r} y2={pad2.t+iH2*t3} stroke="#1e293b" strokeWidth="1"/>
                          <text x={pad2.l-4} y={pad2.t+iH2*t3+4} textAnchor="end" fill="#8b9fc0" fontSize="8">{(maxV2*(1-t3)/1e6).toFixed(1)}M</text>
                        </g>
                      ))}
                      <line x1={pad2.l} y1={yS2(fiNum)} x2={w2-pad2.r} y2={yS2(fiNum)} stroke="#10b981" strokeWidth="1" strokeDasharray="4,3"/>
                      <text x={w2-pad2.r} y={yS2(fiNum)-4} textAnchor="end" fill="#10b981" fontSize="8">FI {(fiNum/1e6).toFixed(1)}M</text>
                      <path d={path2} fill="none" stroke={accent} strokeWidth="2"/>
                      {fiY!=null&&<circle cx={xS2(fiY)} cy={yS2(fiNum)} r="4" fill="#10b981"/>}
                      {[0,5,10,15,20,25,30].map(y=>(
                        <text key={y} x={xS2(y)} y={h2-4} textAnchor="middle" fill="#8b9fc0" fontSize="8">{y}r</text>
                      ))}
                    </svg>
                  );
                })()}
              </div>
            </div>
          </>
        )}

        {/* ─── DANĚ ČŘ ────────────────────────────────────────────────────────── */}
        {tab === "dane" && (
          <>
            <div style={{fontSize:16,fontWeight:700,color:textPrimary,marginBottom:14}}>
              🧾 {lang==="en"?"Czech Tax Overview":"Daňový přehled pro ČR"}
            </div>
            {/* Use state directly, no IIFE wrapper */}
            {(() => {
              const taxYears = [...new Set(activeTransactions.map(t=>new Date(t.date).getFullYear()))].sort((a,b)=>b-a);
              const taxYear = taxYears.length > 0 && !taxYears.includes(divCalYear) ? taxYears[0] : divCalYear;
              const yearTx = activeTransactions.filter(t=>new Date(t.date).getFullYear()===taxYear);

              // Dividendy
              const divs = yearTx.filter(t=>t.type==="dividend");
              const divGross = divs.reduce((s,t)=>{
                const perShare = t.dividendPerShare||0;
                const qty = t.quantity||1;
                return s + toCZK(perShare*qty, t.currency||"CZK", rates);
              },0);
              const divNet = divs.reduce((s,t)=>s+toCZK(t.dividendAmount||0,t.currency||"CZK",rates),0);
              const divTaxPaid = divGross - divNet;

              // ── Prodeje — §10 ZDP ──────────────────────────────────────────────────
              // Pravidla ČR:
              // 1. Časový test: akcie držené 3+ roky (1095 dní) → osvobozeno
              // 2. Hodnotový limit: celkové příjmy z prodeje < 100 000 Kč/rok → osvobozeno
              // 3. Ztráty z prodejů lze kompenzovat se zisky v témže roce
              // FIFO: první koupené = první prodané (pro výpočet doby držení)
              const sells = yearTx.filter(t=>t.type==="sell");
              const taxableSells = sells.map(sell=>{
                // FIFO: vezmi nákupy seřazené od nejstaršího
                const buyTx = activeTransactions
                  .filter(b=>b.type==="buy" && b.ticker===sell.ticker && new Date(b.date)<=new Date(sell.date))
                  .sort((a,b)=>new Date(a.date)-new Date(b.date));
                // FIFO cost + doba držení pro prodaný počet kusů
                let remaining = sell.quantity||0;
                let costCZK = 0;
                let oldestBuyDate = null;
                let newestBuyDate = null;
                for (const buy of buyTx) {
                  if (remaining <= 0) break;
                  const usedQty = Math.min(remaining, buy.quantity||0);
                  const costPerShare = toCZK(buy.price+(buy.fee||0)/Math.max(buy.quantity,1), buy.currency, rates);
                  costCZK += usedQty * costPerShare;
                  if (!oldestBuyDate) oldestBuyDate = buy.date;
                  newestBuyDate = buy.date;
                  remaining -= usedQty;
                }
                const revenueCZK = toCZK((sell.quantity||0)*(sell.price||0), sell.currency, rates);
                const gainCZK = revenueCZK - costCZK;
                // Doba držení = od NEJSTARŠÍHO nákupu (FIFO)
                const daysHeld = oldestBuyDate
                  ? Math.floor((new Date(sell.date)-new Date(oldestBuyDate))/86400000) : 0;
                // Časový test: 3+ roky = osvobozeno
                // Real estate: 10 year time test; other assets: 3 years
                const sellTx = activeTransactions.find(t=>t.type==="sell"&&t.ticker===sell.ticker);
                const isRealEstate = activeTransactions.filter(b=>b.type==="buy"&&b.ticker===sell.ticker).some(b=>b.category==="real_estate");
                const timeExempt = isRealEstate ? daysHeld >= 3650 : daysHeld >= 1095;
                return {
                  ticker:sell.ticker, date:sell.date, qty:sell.quantity,
                  revenueCZK, costCZK, gainCZK, daysHeld,
                  timeExempt,
                  oldestBuyDate, newestBuyDate,
                };
              });

              // Celkové příjmy z prodeje (hrubé, bez ohledu na zisk/ztrátu)
              const totalSellRevenue = taxableSells.reduce((s,t)=>s+t.revenueCZK,0);
              // Hodnotový limit: pokud celkové příjmy < 100 000 Kč → vše osvobozeno
              const valueExempt = totalSellRevenue < 100000;

              // Zdanitelné vs osvobozené prodeje
              const taxableSellsList = taxableSells.filter(s => !s.timeExempt && !valueExempt);
              const exemptByTime = taxableSells.filter(s => s.timeExempt);
              const exemptByValue = valueExempt ? taxableSells.filter(s => !s.timeExempt) : [];

              // Základ daně z prodejů = zisky - ztráty (§10 odst. 1 písm. b) — lze kompenzovat v rámci roku)
              const sellGains = taxableSellsList.filter(s=>s.gainCZK>0).reduce((s,t)=>s+t.gainCZK,0);
              const sellLosses = taxableSellsList.filter(s=>s.gainCZK<0).reduce((s,t)=>s+t.gainCZK,0);
              const netSellGain = Math.max(0, sellGains + sellLosses); // ztráty kompenzují zisky

              // Základ daně celkem
              // Dividendy: srážková daň obvykle již sražena u zdroje — nezahrnujeme do §10
              // Pokud dividendy ze zahraničí bez srážky → §8
              const divUnwithheld = divs.filter(t=>(t.divTax||15)===0).reduce((s,t)=>s+toCZK((t.dividendPerShare||0)*(t.quantity||1),t.currency||"CZK",rates),0);
              const totalTaxBase = netSellGain + divUnwithheld;
              const estimatedTax = totalTaxBase * 0.15;

              // Status badge helper
              const exemptStatus = (s) => {
                if (s.timeExempt) return {text:"✓ Časový test (3+ roky)", color:"#10b981"};
                if (valueExempt) return {text:"✓ Limit < 100 000 Kč", color:"#10b981"};
                return {text:"⚠ Zdanitelné", color:"#f59e0b"};
              };

              return (
                <div>
                  {/* Year selector */}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
                    <span style={{fontSize:12,color:textMuted}}>{lang==="en"?"Tax year:":"Daňový rok:"}</span>
                    {taxYears.map(y=>(
                      <button key={y} style={{...S.btn(taxYear===y?"primary":"outline"),padding:"4px 12px",fontSize:11}}
                        onClick={()=>setDivCalYear(y)}>{y}</button>
                    ))}
                  </div>

                  {/* Summary cards */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:10,marginBottom:16}}>
                    {[
                      {l:lang==="en"?"Dividend Income (gross)":"Hrubé dividendy",v:fmt(divGross,"CZK",0),c:"#8b5cf6"},
                      {l:lang==="en"?"Tax withheld on div.":"Sražená daň z div.",v:fmt(divTaxPaid,"CZK",0),c:"#f87171"},
                      {l:lang==="en"?"Taxable sell gains":"Zdanitelné zisky z prodeje",v:fmt(taxableSellGain,"CZK",0),c:"#f59e0b"},
                      {l:lang==="en"?"Exempt sell gains (3y+)":"Osvobozené zisky (3+ roky)",v:fmt(exemptSellGain,"CZK",0),c:"#10b981"},
                      {l:lang==="en"?"Est. total tax (15%)":"Odhadovaná daň (15%)",v:fmt(estimatedTax,"CZK",0),c:"#ef4444"},
                    ].map((s,i)=>(
                      <div key={i} style={{...S.statCard(s.c)}}>
                        <div style={S.label}>{s.l}</div>
                        <div style={{fontSize:15,fontWeight:700,color:s.c}}>{s.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Dividends table */}
                  <div style={{...S.card,marginBottom:12}}>
                    <div style={S.sectionTitle}>{lang==="en"?"Dividend Income":"Příjmy z dividend"} {taxYear}</div>
                    <div style={{fontSize:11,color:textMuted,marginBottom:10}}>
                      {lang==="en"?"Foreign dividends are typically subject to 15% withholding tax (may vary by tax treaty). Report on §8 of Czech tax return.":"Zahraniční dividendy podléhají srážkové dani 15% (dle smlouvy o zamezení dvojího zdanění). Uvádí se v §8 daňového přiznání."}
                    </div>
                    {divs.length > 0 ? (
                      <table style={S.table}>
                        <thead><tr>
                          {["Datum","Ticker","Měna","Hrubá div.","Daň %","Čistá div. (CZK)","Poznámka"].map(h=><th key={h} style={S.th}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {divs.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t=>{
                            const gross = toCZK((t.dividendPerShare||0)*(t.quantity||1),t.currency||"CZK",rates);
                            const net = toCZK(t.dividendAmount||0,t.currency||"CZK",rates);
                            return (
                              <tr key={t.id}>
                                <td style={S.td}>{fmtDate(t.date)}</td>
                                <td style={S.td}><b style={{color:textPrimary}}>{t.ticker}</b></td>
                                <td style={S.td}>{t.currency||"CZK"}</td>
                                <td style={S.td}>{t.dividendPerShare?`${t.dividendPerShare} ${t.currency}/ks`:"–"}</td>
                                <td style={S.td}>{t.divTax||15}%</td>
                                <td style={{...S.td,color:"#10b981",fontWeight:600}}>{fmt(net,"CZK",0)}</td>
                                <td style={{...S.td,color:textMuted,fontSize:10}}>§8 daň. přiznání</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : <div style={{color:textMuted,fontSize:11}}>{lang==="en"?"No dividends in this year":"Žádné dividendy v tomto roce"}</div>}
                  </div>

                  {/* Sells table */}
                  <div style={S.card}>
                    <div style={S.sectionTitle}>{lang==="en"?"Capital Gains from Sales":"Příjmy z prodeje cenných papírů"} {taxYear}</div>
                    <div style={{fontSize:11,color:textMuted,marginBottom:10}}>
                      {lang==="en"?"Gains from stocks held less than 3 years are taxable (§10). Stocks held 3+ years are exempt.":"Zisky z prodeje akcií držených méně než 3 roky jsou zdanitelné (§10). Akcie držené 3+ roky jsou osvobozeny."}
                    </div>
                    {taxableSells.length > 0 ? (
                      <table style={S.table}>
                        <thead><tr>
                          {["Datum prodeje","Ticker","Počet","Příjem (CZK)","Náklad FIFO (CZK)","Zisk/Ztráta","Nákup (FIFO)","Drženo dní","Status"].map(h=><th key={h} style={S.th}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {taxableSells.map((s,i)=>{
                            const st = exemptStatus(s);
                            return (
                              <tr key={i}>
                                <td style={S.td}>{fmtDate(s.date)}</td>
                                <td style={S.td}><b style={{color:textPrimary}}>{s.ticker}</b></td>
                                <td style={S.td}>{s.qty}</td>
                                <td style={S.td}>{fmt(s.revenueCZK,"CZK",0)}</td>
                                <td style={S.td}>{fmt(s.costCZK,"CZK",0)}</td>
                                <td style={{...S.td,color:s.gainCZK>=0?"#10b981":"#f87171",fontWeight:600}}>{fmt(s.gainCZK,"CZK",0)}</td>
                                <td style={{...S.td,fontSize:10,color:textMuted}}>{s.oldestBuyDate||"–"}</td>
                                <td style={S.td}>{s.daysHeld}d ({(s.daysHeld/365).toFixed(1)}r)</td>
                                <td style={S.td}><span style={{color:st.color,fontSize:10,fontWeight:600}}>{st.text}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : <div style={{color:textMuted,fontSize:11}}>Žádné prodeje v {taxYear}</div>}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ─── PDF REPORT ──────────────────────────────────────────────────────── */}
        {tab === "report" && (
          <>
            <div style={{fontSize:16,fontWeight:700,color:textPrimary,marginBottom:14}}>
              📄 {lang==="en"?"Annual Report":"Výroční report"}
            </div>
            <div style={{...S.card,marginBottom:12}}>
              <div style={S.sectionTitle}>{lang==="en"?"Generate PDF Report":"Generovat PDF report"}</div>
              <div style={{fontSize:12,color:textMuted,marginBottom:16,lineHeight:1.7}}>
                {lang==="en"?"Generate a comprehensive annual report including portfolio summary, top positions, dividend history, annual returns, and tax overview.":"Vygeneruj komplexní výroční report obsahující přehled portfolia, top pozice, historii dividend, roční výnosy a daňový přehled."}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginBottom:16}}>
                {[
                  {label:lang==="en"?"Portfolio Value":"Hodnota portfolia",value:fmt(portfolio.totalCurrentCZK,"CZK",0),accent:"#6366f1"},
                  {label:lang==="en"?"Total Return":"Celkový výnos",value:fmtPct(portfolio.totalGainPct),accent:upColor(portfolio.totalGainPct)},
                  {label:lang==="en"?"Positions":"Pozice",value:portfolio.positions.length,accent:"#8b5cf6"},
                  {label:lang==="en"?"Total Dividends":"Celk. dividendy",value:fmt(portfolio.totalDividendsCZK,"CZK",0),accent:"#10b981"},
                ].map((s,i)=>(
                  <div key={i} style={{...S.statCard(s.accent),textAlign:"center"}}>
                    <div style={S.label}>{s.label}</div>
                    <div style={{fontSize:16,fontWeight:700,color:s.accent}}>{s.value}</div>
                  </div>
                ))}
              </div>
              <button style={{...S.btn("primary"),padding:"12px 24px",fontSize:13,width:"100%"}}
                onClick={()=>{
                  // Generate report as HTML and open print dialog
                  const reportDate = new Date().toLocaleDateString("cs-CZ");
                  const rows = portfolio.positions.sort((a,b)=>b.currentValueCZK-a.currentValueCZK).map(p=>`
                    <tr>
                      <td>${p.ticker}</td>
                      <td>${(tickerNames[p.ticker]||p.name||"").slice(0,25)}</td>
                      <td style="text-align:right">${p.totalQty.toFixed(2)}</td>
                      <td style="text-align:right">${fmt(p.currentValueCZK,"CZK",0)}</td>
                      <td style="text-align:right;color:${p.gainPct>=0?"#16a34a":"#dc2626"}">${fmtPct(p.gainPct)}</td>
                      <td style="text-align:right">${p.annualizedReturn?fmtPct(p.annualizedReturn):"–"}</td>
                    </tr>`).join("");
                  const divRows = activeTransactions.filter(t=>t.type==="dividend")
                    .sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,20).map(t=>`
                    <tr>
                      <td>${t.date}</td>
                      <td>${t.ticker}</td>
                      <td style="text-align:right">${fmt(toCZK(t.dividendAmount||0,t.currency||"CZK",rates),"CZK",0)}</td>
                    </tr>`).join("");
                  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
                    <title>InvestTrack Report ${reportDate}</title>
                    <style>
                      body{font-family:sans-serif;color:#1e293b;padding:40px;max-width:900px;margin:0 auto}
                      h1{color:#4f46e5;border-bottom:3px solid #4f46e5;padding-bottom:10px}
                      h2{color:#334155;margin-top:30px}
                      table{width:100%;border-collapse:collapse;margin:10px 0}
                      th{background:#f1f5f9;padding:8px;text-align:left;font-size:12px;border:1px solid #e2e8f0}
                      td{padding:7px 8px;border:1px solid #e2e8f0;font-size:12px}
                      .stat{display:inline-block;margin:8px 16px 8px 0;padding:10px 16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0}
                      .stat-label{font-size:10px;color:#64748b;text-transform:uppercase}
                      .stat-value{font-size:18px;font-weight:700;color:#4f46e5}
                      @media print{body{padding:20px}}
                    </style></head><body>
                    <h1>📈 InvestTrack — Výroční Report</h1>
                    <p style="color:#64748b">${reportDate} · ${portfolios.find(p=>p.id===activePortfolioId)?.name||"Portfolio"}</p>
                    <div>
                      <div class="stat"><div class="stat-label">Aktuální hodnota</div><div class="stat-value">${fmt(portfolio.totalCurrentCZK,"CZK",0)}</div></div>
                      <div class="stat"><div class="stat-label">Investováno</div><div class="stat-value">${fmt(portfolio.totalInvestedCZK,"CZK",0)}</div></div>
                      <div class="stat"><div class="stat-label">Zisk/Ztráta</div><div class="stat-value" style="color:${portfolio.totalGainCZK>=0?"#16a34a":"#dc2626"}">${fmt(portfolio.totalGainCZK,"CZK",0)}</div></div>
                      <div class="stat"><div class="stat-label">Celkový výnos</div><div class="stat-value">${fmtPct(portfolio.totalGainPct)}</div></div>
                      <div class="stat"><div class="stat-label">Dividendy</div><div class="stat-value">${fmt(portfolio.totalDividendsCZK,"CZK",0)}</div></div>
                    </div>
                    <h2>Pozice portfolia</h2>
                    <table><thead><tr><th>Ticker</th><th>Název</th><th>Množství</th><th>Hodnota</th><th>Výnos %</th><th>Roční výnos</th></tr></thead>
                    <tbody>${rows}</tbody></table>
                    <h2>Poslední dividendy (20)</h2>
                    <table><thead><tr><th>Datum</th><th>Ticker</th><th>Částka (CZK)</th></tr></thead>
                    <tbody>${divRows}</tbody></table>
                    <p style="margin-top:40px;color:#94a3b8;font-size:11px">Generováno InvestTrack · ${reportDate} · Pouze informativní, není investiční doporučení.</p>
                    </body></html>`;
                  const w = window.open("","_blank");
                  w.document.write(html);
                  w.document.close();
                  setTimeout(()=>w.print(),500);
                }}>
                📄 {lang==="en"?"Generate & Print PDF Report":"Generovat a tisknout PDF report"}
              </button>
              <div style={{fontSize:11,color:textMuted,marginTop:10,textAlign:"center"}}>
                {lang==="en"?"Opens print dialog — save as PDF using your browser":"Otevře dialog tisku — ulož jako PDF pomocí prohlížeče"}
              </div>
            </div>
          </>
        )}

        {/* ─── DANĚ ČR ─────────────────────────────────────────────────────────── */}
        {/* ─── NASTAVENI ────────────────────────────────────────────────────────── */}
        {tab === "nastaveni" && (
          <>
            <div style={{ fontSize:16, fontWeight:700, color:textPrimary, marginBottom:14 }}>{lang==="en"?"Settings":"Nastavení"}</div>

            {/* Sync status */}
            <div style={{...S.card,marginBottom:12}}>
              <div style={S.sectionTitle}>{lang==="en"?"Sync Status":"Stav synchronizace"}</div>
              <div style={{fontSize:12,color:syncStatus==="ok"?"#10b981":syncStatus==="error"?"#f87171":textMuted}}>
                {syncStatus==="ok"?(lang==="en"?"✓ Synced to cloud":"✓ Synchronizováno"):syncStatus==="syncing"?(lang==="en"?"↻ Saving...":"↻ Ukládám..."):syncStatus==="error"?(lang==="en"?"⚠ Sync error":"⚠ Chyba"):lang==="en"?"💾 Local only":"💾 Pouze lokálně"}
              </div>
            </div>

            {/* Exchange rates */}
            <div style={{...S.card,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={S.sectionTitle}>{lang==="en"?"Exchange Rates":"Kurzy měn"}</div>
                <button style={{...S.btn("outline"),padding:"5px 12px",fontSize:11}} onClick={fetchRates}>
                  {ratesStatus==="loading"?"⟳...":"↻ "+(lang==="en"?"Update rates":"Aktualizovat kurzy")}
                </button>
              </div>
              {[["USD/CZK","USD_CZK"],["EUR/CZK","EUR_CZK"]].map(([label,key])=>(
                <div key={key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <span style={{fontSize:11,color:textMuted,width:70}}>{label}</span>
                  <input type="number" step="0.001" value={rates[key]||""} onChange={e=>setRates(r=>({...r,[key]:parseFloat(e.target.value)||0}))} style={{...S.input,width:100}}/>
                </div>
              ))}
            </div>

            {/* Prices */}
            <div style={{...S.card,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={S.sectionTitle}>{lang==="en"?"Stock Prices":"Ceny akcií"}</div>
                <button style={{...S.btn("primary"),padding:"6px 14px",fontSize:11}}
                  onClick={()=>{ const tks=[...new Set(activeTransactions.filter(t=>t.type==="buy").map(t=>t.ticker))].filter(t=>t&&!["VKLAD","VÝBĚR"].includes(t)); fetchPrices(tks); }}
                  disabled={pricesStatus==="loading"}>
                  {pricesStatus==="loading"?"⟳ "+(lang==="en"?"Loading...":"Načítám..."):"↻ "+(lang==="en"?"Update from Yahoo":"Aktualizovat ceny z Yahoo")}
                </button>
              </div>
              {pricesStatus==="ok"&&<div style={{fontSize:11,color:"#22d3a0",marginBottom:10}}>✓ {lang==="en"?"Prices updated":"Ceny aktualizovány"}</div>}
              {pricesStatus==="error"&&<div style={{fontSize:11,color:"#f87171",marginBottom:10}}>⚠ {lang==="en"?"Could not fetch prices":"Nepodařilo se načíst ceny"}</div>}
              <div style={S.sectionTitle}>{lang==="en"?"Manual Price Update":"Ruční update cen"}</div>
              {Object.entries(prices).filter(([,v])=>v?.price!==undefined).map(([ticker,data])=>(
                <div key={ticker} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,color:textPrimary,minWidth:80}}>{ticker}</span>
                  <input type="number" step="0.01" value={data.price} onChange={e=>setPrices(prev=>({...prev,[ticker]:{...prev[ticker],price:parseFloat(e.target.value)||0}}))} style={{...S.input,width:110}}/>
                  <select value={data.currency||"USD"} onChange={e=>setPrices(prev=>({...prev,[ticker]:{...prev[ticker],currency:e.target.value}}))} style={{...S.select,width:80}}>
                    {["USD","EUR","CZK","GBP"].map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                  {data.lastUpdated&&<span style={{fontSize:9,color:textMuted}}>{new Date(data.lastUpdated).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"})}</span>}
                  <button style={{...S.btn("danger"),padding:"3px 8px",fontSize:10}} onClick={()=>setPrices(prev=>{const n={...prev};delete n[ticker];return n;})}>✕</button>
                </div>
              ))}
              <div style={{display:"flex",gap:8,marginTop:10}}>
                <input placeholder="Ticker" style={{...S.input,width:100}} id="newTickerInput"/>
                <select id="newTickerCurrency" style={{...S.select,width:80}}>
                  {["USD","EUR","CZK","GBP"].map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <button style={S.btn("primary")} onClick={()=>{
                  const t2=document.getElementById("newTickerInput").value.toUpperCase();
                  const c2=document.getElementById("newTickerCurrency").value;
                  if(t2){setPrices(prev=>({...prev,[t2]:{price:0,currency:c2,change1d:0}}));document.getElementById("newTickerInput").value="";}
                }}>+ {lang==="en"?"Add":"Ticker"}</button>
              </div>
            </div>

            {/* Backup */}
            <div style={S.card}>
              <div style={S.sectionTitle}>{lang==="en"?"Backup & Reset":"Záloha a reset"}</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button style={S.btn("outline")} onClick={()=>{
                  const data={transactions:activeTransactions,prices,rates,dividends,earnings,fiSettings,portfolios};
                  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
                  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`investtrack-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();
                }}>📤 {lang==="en"?"Export JSON":"Exportovat zálohu JSON"}</button>
                <button style={{...S.btn("danger")}} onClick={()=>{ if(window.confirm(lang==="en"?"Reset everything? Cannot be undone!":"Smazat všechna data? Tato akce je nevratná!")) { setTransactions([]); setPrices({}); setPortfolios(DEFAULT_PORTFOLIOS); setActivePortfolioId("p1"); }}}>⚠ {lang==="en"?"Reset All":"Reset všeho"}</button>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ─── MODALS ─────────────────────────────────────────────────────────────── */}
      {showAdmin && userProfile?.role==="admin" && (
        <AdminPanel currentUser={authUser} onClose={()=>setShowAdmin(false)} S={S} />
      )}

      {/* Add Transaction Modal */}
      {showAddTx && (
        <div style={S.modal} onClick={e=>e.target===e.currentTarget&&setShowAddTx(false)}>
          <div style={S.modalBox}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:16,color:textPrimary}}>+ {lang==="en"?"Add Transaction":"Přidat transakci"}</div>
            {[
              {label:lang==="en"?"Type":"Typ",key:"type",type:"select",opts:[["buy",lang==="en"?"Buy":"Nákup"],["sell",lang==="en"?"Sell":"Prodej"],["dividend",lang==="en"?"Dividend":"Dividenda"],["deposit",lang==="en"?"Deposit":"Vklad"],["withdraw",lang==="en"?"Withdrawal":"Výběr"]],onChange:(v)=>{ if(v==="deposit"||v==="withdraw") setNewTx(p=>({...p,type:v,category:"cash",ticker:"",name:""})); else setNewTx(p=>({...p,type:v,category:p.category==="cash"?"stock":p.category})); }},
              {label:lang==="en"?"Category":"Kategorie",key:"category",type:"select",opts:[["stock",lang==="en"?"Stock":"Akcie"],["etf","ETF"],["crypto","Crypto"],["real_estate",lang==="en"?"Real Estate":"Nemovitosti"],["cash",lang==="en"?"Cash":"Hotovost"]],onChange:(v)=>{ if(v==="crypto") setNewTx(p=>({...p,category:"crypto",ticker:p.ticker||"BTC-USD",name:p.name||"Bitcoin",currency:"USD"})); else if(v==="real_estate") setNewTx(p=>({...p,category:"real_estate",currency:"CZK"})); else setNewTx(p=>({...p,category:v})); }},
              {label:"Ticker",key:"ticker",type:"text",placeholder:"AAPL"},
              {label:`${lang==="en"?"Name":"Název"} ${tickerNames[newTx.ticker?.toUpperCase()]?"(auto: "+tickerNames[newTx.ticker?.toUpperCase()]+")":""}`,key:"name",type:"text",placeholder:"Apple Inc."},
              {label:lang==="en"?"Date":"Datum",key:"date",type:"date"},
              {label:lang==="en"?"Quantity":"Množství",key:"quantity",type:"number",placeholder:"10"},
              {label:lang==="en"?"Price":"Cena",key:"price",type:"number",placeholder:"150.00"},
              {label:lang==="en"?"Currency":"Měna",key:"currency",type:"select",opts:[["USD","USD"],["EUR","EUR"],["CZK","CZK"],["GBP","GBP"]]},
              {label:lang==="en"?"Fee":"Poplatek",key:"fee",type:"number",placeholder:"0"},
              {label:lang==="en"?"Gross Div/share":"Hrubá div./akcie",key:"dividendPerShare",type:"number",placeholder:"0.47"},
              {label:lang==="en"?"Tax (%)":"Daň (%)",key:"divTax",type:"number",placeholder:"15"},
              {label:lang==="en"?"Net div. total (CZK, auto)":"Čistá div. celkem (Kč, auto)",key:"dividendAmount",type:"number",placeholder:"auto"},
              {label:lang==="en"?"Amount":"Částka",key:"amount",type:"number",placeholder:"5000"},
              {label:lang==="en"?"Note":"Poznámka",key:"notes",type:"text",placeholder:""},
            ].filter(f=>f.key!=="dividendPerShare"||newTx.type==="dividend")
             .filter(f=>f.key!=="divTax"||newTx.type==="dividend")
             .filter(f=>f.key!=="dividendAmount"||newTx.type==="dividend")
             .filter(f=>f.key!=="amount"||newTx.type==="deposit"||newTx.type==="withdraw")
             .filter(f=>f.key!=="fee"||newTx.type!=="dividend")
             .filter(f=>!["ticker","name"].includes(f.key)||!["deposit","withdraw"].includes(newTx.type))
             .filter(f=>!["quantity","price"].includes(f.key)||!["dividend","deposit","withdraw"].includes(newTx.type))
             .map(f=>(
              <div key={f.key} style={{marginBottom:10}}>
                <div style={S.label}>{f.label}</div>
                {f.type==="select"
                  ?<select value={newTx[f.key]||""} onChange={e=>{ if(f.onChange) f.onChange(e.target.value); else setNewTx(p=>({...p,[f.key]:e.target.value})); }} style={S.select}>{f.opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
                  :<input type={f.type} placeholder={f.placeholder} value={newTx[f.key]||""}
                    onChange={e=>{
                      const val=f.key==="ticker"?e.target.value.toUpperCase():e.target.value;
                      setNewTx(p=>({...p,[f.key]:val}));
                      if(f.key==="dividendPerShare"||f.key==="divTax"){
                        const perShare=parseFloat(f.key==="dividendPerShare"?e.target.value:newTx.dividendPerShare)||0;
                        const tax=parseFloat(f.key==="divTax"?e.target.value:newTx.divTax)||15;
                        const holdQty=activeTransactions.filter(t=>t.type==="buy"&&t.ticker===newTx.ticker).reduce((s,t)=>s+(t.quantity||0),0);
                        const qty=parseFloat(newTx.quantity)||holdQty||1;
                        const net=toCZK(perShare*qty*(1-tax/100),newTx.currency,rates);
                        setNewTx(p=>({...p,[f.key]:e.target.value,dividendAmount:net.toFixed(2)}));
                      }
                    }}
                    onBlur={f.key==="ticker"?(e=>{
                      const tk=e.target.value.toUpperCase();
                      if(tk&&!["VKLAD","VÝBĚR"].includes(tk)){
                        lookupTickerName(tk);
                        const known=tickerNames[tk]||activeTransactions.find(t=>t.ticker===tk)?.name;
                        if(known) setNewTx(p=>({...p,name:known}));
                      }
                    }):undefined}
                    list={f.key==="ticker"?"tx-ticker-list":undefined}
                    style={S.input}/>}
              {f.key==="ticker"&&<datalist id="tx-ticker-list">
                {[...new Set(activeTransactions.map(t=>t.ticker).filter(Boolean))].sort().map(tk=>(
                  <option key={tk} value={tk}/>
                ))}
              </datalist>}
              </div>
            ))}
            {newTx.type==="dividend"&&newTx.dividendPerShare&&(
              <div style={{fontSize:11,color:textMuted,marginBottom:10,padding:"6px 10px",background:darkMode?"#0a0f1e":"#f8fafc",borderRadius:8}}>
                {(()=>{
                  const ps=parseFloat(newTx.dividendPerShare)||0;
                  const tax=parseFloat(newTx.divTax)||15;
                  const hq=activeTransactions.filter(t=>t.type==="buy"&&t.ticker===newTx.ticker).reduce((s,t)=>s+(t.quantity||0),0);
                  const qty=parseFloat(newTx.quantity)||hq||0;
                  const gross=ps*qty;
                  const net=toCZK(gross*(1-tax/100),newTx.currency,rates);
                  return `${qty} ks × ${ps} = ${gross.toFixed(2)} ${newTx.currency} → ${net.toFixed(0)} Kč (daň ${tax}%)`;
                })()}
              </div>
            )}
            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button style={{...S.btn("primary"),flex:1,padding:"11px"}} onClick={()=>{
                let divAmount=parseFloat(newTx.dividendAmount)||0;
                if(newTx.type==="dividend"&&newTx.dividendPerShare){
                  const perShare=parseFloat(newTx.dividendPerShare)||0;
                  const tax=parseFloat(newTx.divTax)||15;
                  const hq=activeTransactions.filter(t=>t.type==="buy"&&t.ticker===newTx.ticker).reduce((s,t)=>s+(t.quantity||0),0)-activeTransactions.filter(t=>t.type==="sell"&&t.ticker===newTx.ticker).reduce((s,t)=>s+(t.quantity||0),0);
                  const qty=parseFloat(newTx.quantity)||hq||1;
                  divAmount=toCZK(perShare*qty*(1-tax/100),newTx.currency,rates);
                }
                // Check for duplicate
                const isDup = activeTransactions.some(t =>
                  t.type===newTx.type && t.ticker===newTx.ticker &&
                  t.date===newTx.date && Math.abs((parseFloat(t.quantity)||0)-(parseFloat(newTx.quantity)||0))<0.001 &&
                  Math.abs((parseFloat(t.price)||0)-(parseFloat(newTx.price)||0))<0.001
                );
                if (isDup && !window.confirm("⚠ Zdá se, že tato transakce již existuje (stejný typ, ticker, datum, množství a cena). Opravdu přidat?")) return;
                const tx={id:Date.now().toString(),portfolioId:activePortfolioId,...newTx,
                  quantity:parseFloat(newTx.quantity)||0,price:parseFloat(newTx.price)||0,
                  fee:parseFloat(newTx.fee)||0,
                  dividendAmount:divAmount,
                  dividendAmountCZK: divAmount, // always CZK
                  currency: newTx.currency, // keep original currency for reference
                  dividendPerShare:parseFloat(newTx.dividendPerShare)||0,
                  amount:parseFloat(newTx.amount)||0};
                setTransactions(prev=>[...prev,tx]);
                if(tx.ticker&&!["VKLAD","VÝBĚR",""].includes(tx.ticker)){
                  if(!prices[tx.ticker]) setPrices(prev=>({...prev,[tx.ticker]:{price:tx.price||0,currency:tx.currency||"USD",change1d:0}}));
                  setTimeout(()=>{fetchPrices([tx.ticker]);lookupTickerName(tx.ticker);},300);
                }
                setNewTx({type:"buy",ticker:"",name:"",category:"stock",date:new Date().toISOString().slice(0,10),quantity:"",price:"",currency:"CZK",fee:"",dividendAmount:"",dividendPerShare:"",divTax:"15",amount:"",notes:""});
                setShowAddTx(false);
              }}>{lang==="en"?"Add Transaction":"Přidat transakci"}</button>
              <button style={{...S.btn("outline"),padding:"11px 16px"}} onClick={()=>setShowAddTx(false)}>{lang==="en"?"Cancel":"Zrušit"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editTx && (
        <div style={S.modal} onClick={e=>e.target===e.currentTarget&&setEditTx(null)}>
          <div style={S.modalBox}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:16,color:textPrimary}}>✏ {lang==="en"?"Edit Transaction":"Upravit transakci"}</div>
            {["date","ticker","quantity","price","currency","fee","dividendPerShare","divTax","dividendAmount","amount","notes"].map(key=>(
              <div key={key} style={{marginBottom:10}}>
                <div style={S.label}>{key}</div>
                <input value={editTx[key]||""} onChange={e=>setEditTx(p=>({...p,[key]:e.target.value}))} style={S.input} type={["quantity","price","fee","dividendPerShare","divTax","dividendAmount","amount"].includes(key)?"number":"text"}/>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button style={{...S.btn("primary"),flex:1,padding:"11px"}} onClick={()=>{
                setTransactions(prev=>prev.map(t=>t.id===editTx.id?{...t,...editTx,quantity:parseFloat(editTx.quantity)||0,price:parseFloat(editTx.price)||0,fee:parseFloat(editTx.fee)||0,dividendAmount:parseFloat(editTx.dividendAmount)||0,amount:parseFloat(editTx.amount)||0}:t));
                setEditTx(null);
              }}>{lang==="en"?"Save":"Uložit"}</button>
              <button style={{...S.btn("outline"),padding:"11px 16px"}} onClick={()=>setEditTx(null)}>{lang==="en"?"Cancel":"Zrušit"}</button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showCsvImport && (
        <div style={S.modal} onClick={e=>e.target===e.currentTarget&&setShowCsvImport(false)}>
          <div style={S.modalBox}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:12,color:textPrimary}}>📂 Import CSV</div>
            <div style={{fontSize:11,color:textMuted,marginBottom:12}}>Formáty: Degiro, Trading 212, XTB, Interactive Brokers, nebo vlastní (datum,ticker,typ,množství,cena,měna,poplatek)</div>
            <input type="file" accept=".csv" style={{color:textPrimary,marginBottom:12}} onChange={e=>{
              const file=e.target.files[0]; if(!file) return;
              const reader=new FileReader();
              reader.onload=ev=>{
                const text=ev.target.result;
                const lines2=text.trim().split("\n");
                const headers=lines2[0].split(",").map(h=>h.trim().toLowerCase().replace(/"/g,""));
                const imported=[];
                lines2.slice(1).forEach(line=>{
                  const cols=line.split(",").map(c=>c.trim().replace(/"/g,""));
                  const row={};
                  headers.forEach((h,i)=>{row[h]=cols[i]||"";});
                  const tx={id:Date.now().toString()+Math.random(),portfolioId:activePortfolioId,
                    type:(row.type||row.action||"buy").toLowerCase().includes("sell")?"sell":"buy",
                    ticker:(row.ticker||row.symbol||row.product||"").toUpperCase(),
                    name:row.name||row.description||"",
                    category:row.category||"stock",
                    date:row.date||row.time?.slice(0,10)||new Date().toISOString().slice(0,10),
                    quantity:parseFloat(row.quantity||row.qty||row.shares||0),
                    price:parseFloat(row.price||row.rate||0),
                    currency:row.currency||row.ccy||"USD",
                    fee:parseFloat(row.fee||row.commission||0),
                    dividendAmount:0,amount:0,notes:""};
                  if(tx.ticker&&tx.quantity>0) imported.push(tx);
                });
                if(imported.length>0){setTransactions(prev=>[...prev,...imported]);alert(`Importováno ${imported.length} transakcí`);}
                else alert("Nepodařilo se importovat žádné transakce. Zkontroluj formát CSV.");
              };
              reader.readAsText(file);
              setShowCsvImport(false);
            }}/>
            <button style={{...S.btn("outline"),width:"100%",padding:"10px"}} onClick={()=>setShowCsvImport(false)}>{lang==="en"?"Cancel":"Zrušit"}</button>
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      {isMobile && (
        <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:200,
          background:bgCard, borderTop:`1px solid ${border}`,
          display:"flex", alignItems:"center", justifyContent:"space-around",
          padding:"6px 0 10px", boxShadow:"0 -4px 20px rgba(0,0,0,0.3)" }}>
          {[["dashboard","🏠",t.dashboard],["portfolio","📊",t.portfolio],["transakce","📋",t.transakce],["dividendy","💰",t.dividendy],["analyza","🔍",t.analyza],["fi","🎯","FI"],["novinky","📰",t.novinky]].map(([tab2,icon,label])=>(
            <button key={tab2} style={{ background:tab===tab2?accent+"22":"none", border:"none", cursor:"pointer",
              display:"flex", flexDirection:"column", alignItems:"center", gap:2,
              padding:"4px 6px", borderRadius:10, color:tab===tab2?accent:textMuted, fontFamily:"inherit" }}
              onClick={()=>setTab(tab2)}>
              <span style={{ fontSize:18 }}>{icon}</span>
              <span style={{ fontSize:7, fontWeight:tab===tab2?700:400 }}>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}