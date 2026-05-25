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
const fmtDate = (d) => new Date(d).toLocaleDateString("cs-CZ");
const daysSince = (dateStr) => Math.floor((Date.now() - new Date(dateStr)) / 86400000);
const toCZK = (amount, currency, rates) => {
  if (currency === "CZK") return amount;
  if (currency === "USD") return amount * (rates.USD_CZK || 23.2);
  if (currency === "EUR") return amount * (rates.EUR_CZK || 25.4);
  return amount;
};
const upColor = (n) => (n >= 0 ? "#10b981" : "#ef4444");

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
  if (total === 0) return <div style={{ color: "#475569", fontSize: 12 }}>Žádná data</div>;
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
const GrowthChart = ({ transactions, prices, rates, yearFilter }) => {
  const buys = transactions.filter(t => t.type === "buy").sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!buys.length) return <div style={{ color: "#475569", fontSize: 12 }}>Žádné transakce</div>;

  const firstDate = new Date(buys[0].date);
  const now = new Date();

  // Build monthly points
  const points = [];
  let cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  while (cursor <= now) {
    if (!yearFilter || cursor.getFullYear() === yearFilter) {
      const txSoFar = buys.filter(t => new Date(t.date) <= cursor);
      let invested = 0;
      const holdings = {};
      txSoFar.forEach(t => {
        invested += toCZK(t.quantity * t.price + t.fee, t.currency, rates);
        holdings[t.ticker] = (holdings[t.ticker] || 0) + t.quantity;
      });
      let current = 0;
      Object.entries(holdings).forEach(([ticker, qty]) => {
        const p = prices[ticker];
        if (p) current += toCZK(qty * p.price, p.currency, rates);
      });
      points.push({ label: `${cursor.getMonth() + 1}/${String(cursor.getFullYear()).slice(2)}`, invested, current, date: new Date(cursor) });
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  if (points.length < 2) return <div style={{ color: "#475569", fontSize: 12, padding: 20 }}>Nedostatek dat pro zvolený rok</div>;

  const maxVal = Math.max(...points.map(v => Math.max(v.invested, v.current)), 1);
  const w = 580, h = 160, pad = { t: 8, b: 28, l: 62, r: 8 };
  const iW = w - pad.l - pad.r, iH = h - pad.t - pad.b;
  const xS = (i) => pad.l + (i / (points.length - 1)) * iW;
  const yS = (v) => pad.t + iH - (v / maxVal) * iH;
  const iPath = points.map((v, i) => `${i === 0 ? "M" : "L"}${xS(i)},${yS(v.invested)}`).join(" ");
  const cPath = points.map((v, i) => `${i === 0 ? "M" : "L"}${xS(i)},${yS(v.current)}`).join(" ");
  const aPath = points.map((v, i) => `${i === 0 ? "M" : "L"}${xS(i)},${yS(v.current)}`).join(" ") +
    ` L${xS(points.length - 1)},${yS(0)} L${xS(0)},${yS(0)} Z`;

  // Show every N-th label
  const step = Math.max(1, Math.floor(points.length / 8));

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", minWidth: 300, height: "auto" }}>
        <defs>
          <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <g key={t}>
            <line x1={pad.l} y1={pad.t + iH * t} x2={w - pad.r} y2={pad.t + iH * t} stroke="#1e293b" strokeWidth="1" />
            <text x={pad.l - 4} y={pad.t + iH * t + 4} textAnchor="end" fill="#475569" fontSize="8">{(maxVal * (1 - t) / 1000).toFixed(0)}k</text>
          </g>
        ))}
        {points.map((v, i) => i % step === 0 && (
          <text key={i} x={xS(i)} y={h - 4} textAnchor="middle" fill="#475569" fontSize="8">{v.label}</text>
        ))}
        <path d={aPath} fill="url(#ag)" />
        <path d={iPath} fill="none" stroke="#334155" strokeWidth="1.5" strokeDasharray="4,3" />
        <path d={cPath} fill="none" stroke="#6366f1" strokeWidth="2" />
        <circle cx={xS(points.length-1)} cy={yS(points[points.length-1].current)} r="3" fill="#6366f1" />
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 6, fontSize: 10, color: "#94a3b8" }}>
        <span><span style={{ color: "#6366f1" }}>──</span> Hodnota portfolia</span>
        <span><span style={{ color: "#334155" }}>- -</span> Investováno</span>
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
            <text x={pad.l-4} y={pad.t+iH*t+4} textAnchor="end" fill="#475569" fontSize="8">{(maxVal*(1-t)/1000000).toFixed(1)}M</text>
          </g>
        ))}
        {months.filter((_,i)=>i%step===0).map((p,i)=>(
          <text key={i} x={xS(months.indexOf(months.filter((_,j)=>j%step===0)[i]))} y={h-4} textAnchor="middle" fill="#475569" fontSize="8">
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
              <text x={x + barW/2} y={h-4} textAnchor="middle" fill="#475569" fontSize="8">{d.year}</text>
              <text x={x + barW/2} y={d.gain >= 0 ? y - 3 : y + barH + 10} textAnchor="middle" fill={d.gain >= 0 ? "#10b981" : "#ef4444"} fontSize="7">{d.pct.toFixed(1)}%</text>
            </g>
          );
        })}
        <text x={pad.l-4} y={pad.t+4} textAnchor="end" fill="#475569" fontSize="8">+</text>
        <text x={pad.l-4} y={pad.t+iH-2} textAnchor="end" fill="#475569" fontSize="8">–</text>
      </svg>
    </div>
  );
};

// ─── DCF / VALUATION ANALYZER ────────────────────────────────────────────────
const ValuationAnalyzer = ({ rates }) => {
  const [method, setMethod] = useState("dcf");
  const [ticker, setTicker] = useState("AAPL");
  const [currency, setCurrency] = useState("USD");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // DCF inputs
  const [dcf, setDcf] = useState({ currentPrice: 213.5, fcf: 100, shares: 15400, growthRate1: 12, growthRate2: 6, terminalRate: 3, discountRate: 10, years1: 5, years2: 5, cash: 162, debt: 108 });
  // Graham/Buffett
  const [graham, setGraham] = useState({ eps: 6.42, growthRate: 10, aaa_yield: 4.5, currentPrice: 213.5 });
  const [buffett, setBuffett] = useState({ bookValue: 4.0, roe: 35, requiredReturn: 15, years: 10, terminalPE: 15, currentPrice: 213.5, eps: 6.42 });
  // Technical
  const [tech, setTech] = useState({ prices52wHigh: 237.2, prices52wLow: 164.1, currentPrice: 213.5, ma50: 201.3, ma200: 195.8, rsi: 58, volume: 65, avgVolume: 58, pe: 33.2, sectorPE: 28 });

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
    label: { fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 },
    input: { background: "#0a0f1e", border: "1px solid #334155", borderRadius: 5, color: "#e2e8f0", padding: "6px 10px", fontSize: 12, fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
    select: { background: "#0a0f1e", border: "1px solid #334155", borderRadius: 5, color: "#e2e8f0", padding: "6px 10px", fontSize: 12, fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
    row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 },
    sectionTitle: { fontSize: 10, fontWeight: 700, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid #1e293b" },
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
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <div style={S2.label}>Ticker / Název</div>
          <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} style={{ ...S2.input, width: 100 }} placeholder="AAPL" />
        </div>
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
              <div style={{ fontSize: 10, color: "#475569", padding: "8px", background: "#0a0f1e", borderRadius: 5 }}>
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
                    <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>Potenciál zhodnocení</div>
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
                    <div style={{ fontSize: 10, color: "#475569" }}>Skóre:</div>
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
  const catColor2 = { stock:"#6366f1", etf:"#10b981", crypto:"#f59e0b" };
  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div style={S.modal} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modalBox, maxWidth: step === "preview" ? 900 : 560 }}>
        
        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:"#f1f5f9" }}>📂 Hromadný import transakcí</div>
            <div style={{ fontSize:10, color:"#475569", marginTop:3 }}>CSV · Degiro · Trading 212 · XTB · Interactive Brokers</div>
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
              <div style={{ fontSize:11, color:"#475569", marginBottom:14 }}>nebo klikni pro výběr souboru</div>
              <div style={{ display:"inline-block", background:"#1e293b", color:"#94a3b8", padding:"7px 18px", borderRadius:6, fontSize:11, fontWeight:600 }}>Vybrat soubor</div>
              <input id="csv-file-input" type="file" accept=".csv,.txt" style={{ display:"none" }} onChange={e => handleFile(e.target.files[0])} />
            </div>

            {error && <div style={{ color:"#ef4444", fontSize:12, padding:"8px 12px", background:"#ef444411", borderRadius:6, marginBottom:14 }}>⚠ {error}</div>}

            {/* Supported formats */}
            <div style={{ background:"#0a0f1e", borderRadius:8, padding:14, marginBottom:16 }}>
              <div style={{ fontSize:10, color:"#475569", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Podporované formáty</div>
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
                    <span style={{ color:"#475569", fontSize:10, marginLeft:8 }}>{desc}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Template download */}
            <div style={{ display:"flex", gap:10, alignItems:"center", padding:"12px 14px", background:"#0d1424", border:"1px solid #1e293b", borderRadius:7 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, color:"#f1f5f9", fontWeight:600, marginBottom:2 }}>Stáhnout šablonu CSV</div>
                <div style={{ fontSize:10, color:"#475569" }}>Prázdná šablona s ukázkovými daty pro InvestTrack formát</div>
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
                    <th style={{ padding:"8px 10px", textAlign:"center", fontSize:10, color:"#475569", borderBottom:"1px solid #1e293b", width:36 }}>✓</th>
                    {["Typ","Ticker","Kategorie","Datum","Množství","Cena","Měna","Poplatek","Poznámka"].map(h => (
                      <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontSize:10, color:"#475569", borderBottom:"1px solid #1e293b", whiteSpace:"nowrap", letterSpacing:"0.06em", textTransform:"uppercase" }}>{h}</th>
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
                        <td style={{ padding:"7px 10px", color:"#475569", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.notes||"–"}</td>
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
function NewsTab({ portfolio, S }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState("vse");
  const [error, setError] = useState("");
  const [lastFetched, setLastFetched] = useState(null);

  const tickers = portfolio.positions.map(p => p.ticker).filter(t => !["VKLAD","VÝBĚR"].includes(t));

  // RSS feeds via allorigins proxy (CORS-free)
  const RSS_FEEDS = [
    { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL,MSFT,GOOGL&region=US&lang=en-US", label: "Yahoo Finance" },
    { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", label: "CNBC Markets" },
    { url: "https://feeds.bloomberg.com/markets/news.rss", label: "Bloomberg" },
  ];

  const fetchNews = async () => {
    setLoading(true);
    setError("");
    const allNews = [];

    // Fetch from multiple RSS via allorigins
    for (const feed of RSS_FEEDS) {
      try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(feed.url)}`;
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const data = await res.json();
        const parser = new DOMParser();
        const xml = parser.parseFromString(data.contents, "text/xml");
        const items = Array.from(xml.querySelectorAll("item")).slice(0, 15);
        items.forEach(item => {
          const title = item.querySelector("title")?.textContent || "";
          const link = item.querySelector("link")?.textContent || "";
          const pubDate = item.querySelector("pubDate")?.textContent || "";
          const desc = item.querySelector("description")?.textContent?.replace(/<[^>]*>/g,"").slice(0,200) || "";
          // Check which portfolio ticker this relates to
          const relatedTickers = tickers.filter(t =>
            title.toLowerCase().includes(t.toLowerCase()) ||
            desc.toLowerCase().includes(t.toLowerCase())
          );
          allNews.push({
            id: link + title,
            title: title.slice(0, 120),
            link,
            desc,
            date: pubDate ? new Date(pubDate) : new Date(),
            source: feed.label,
            tickers: relatedTickers,
            isPortfolio: relatedTickers.length > 0,
          });
        });
      } catch {}
    }

    // Deduplicate by title similarity
    const seen = new Set();
    const deduped = allNews.filter(n => {
      const key = n.title.slice(0, 40).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    deduped.sort((a, b) => b.date - a.date);

    if (deduped.length === 0) {
      setError("Nepodařilo se načíst novinky. Zkontroluj připojení k internetu.");
    }

    setNews(deduped.slice(0, 60));
    setLastFetched(new Date());
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
          {lastFetched && <div style={{ fontSize:10, color:"#475569", marginTop:2 }}>Aktualizováno: {lastFetched.toLocaleTimeString("cs-CZ")}</div>}
        </div>
        <button style={{ ...S.btn("primary"), padding:"7px 14px" }} onClick={fetchNews} disabled={loading}>
          {loading ? "⟳ Načítám..." : "↻ Aktualizovat"}
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
        {[
          ["vse", `Vše (${news.length})`],
          ["portfolio", `Moje portfolio (${portfolioNews})`],
          ...tickers.slice(0,8).map(t => [t, t]),
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
            <div style={{ color:"#475569", fontSize:12, textAlign:"center", padding:40 }}>
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
                  <div style={{ fontSize:9, color:"#475569", whiteSpace:"nowrap", flexShrink:0, marginTop:2 }}>
                    {n.date.toLocaleDateString("cs-CZ")}
                  </div>
                </div>
                {n.desc && <div style={{ fontSize:11, color:"#64748b", lineHeight:1.5, marginBottom:8 }}>{n.desc}...</div>}
                <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
                  <span style={{ fontSize:9, color:"#475569", background:"#1e293b", padding:"2px 8px", borderRadius:10 }}>{n.source}</span>
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
const MiniChart = ({ data, type="bar", color="#6366f1", label="", unit="", height=100 }) => {
  if (!data || data.length < 2) return <div style={{color:"#334155",fontSize:11,padding:20,textAlign:"center"}}>Nedostatek dat</div>;
  const vals = data.map(d => d.value);
  const min = Math.min(...vals); const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 420, h = height, pad = { t:8, b:28, l:52, r:8 };
  const iW = w-pad.l-pad.r, iH = h-pad.t-pad.b;
  const xS = i => pad.l + (i/(data.length-1))*iW;
  const yS = v => pad.t + iH - ((v-min)/range)*iH;
  const barW = Math.max(4, iW/data.length - 4);

  const fmtV = v => {
    const abs = Math.abs(v);
    if (abs >= 1e9) return (v/1e9).toFixed(1)+"B";
    if (abs >= 1e6) return (v/1e6).toFixed(1)+"M";
    if (abs >= 1e3) return (v/1e3).toFixed(1)+"K";
    return v.toFixed(1);
  };

  return (
    <div style={{overflowX:"auto"}}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{width:"100%",minWidth:260,height:"auto"}}>
        <defs>
          <linearGradient id={`g_${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
            <stop offset="100%" stopColor={color} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* Grid */}
        {[0,0.25,0.5,0.75,1].map(t=>(
          <g key={t}>
            <line x1={pad.l} y1={pad.t+iH*t} x2={w-pad.r} y2={pad.t+iH*t} stroke="#1e293b" strokeWidth="1"/>
            <text x={pad.l-4} y={pad.t+iH*t+4} textAnchor="end" fill="#475569" fontSize="8">
              {fmtV(max-(range*t))}{unit}
            </text>
          </g>
        ))}
        {/* Zero line */}
        {min < 0 && max > 0 && (
          <line x1={pad.l} y1={yS(0)} x2={w-pad.r} y2={yS(0)} stroke="#334155" strokeWidth="1.5" strokeDasharray="3,2"/>
        )}
        {type === "bar" && data.map((d,i) => {
          const bx = pad.l + (i/data.length)*iW + (iW/data.length - barW)/2;
          const isPos = d.value >= 0;
          const barH = Math.abs((d.value-0)/range * iH);
          const by = isPos ? yS(d.value) : yS(0);
          const c = d.value >= 0 ? color : "#ef4444";
          return (
            <g key={i}>
              <rect x={bx} y={by} width={barW} height={Math.max(1,barH)} fill={c} opacity={0.85} rx={2}/>
              <text x={bx+barW/2} y={h-4} textAnchor="middle" fill="#475569" fontSize="8">{d.label}</text>
            </g>
          );
        })}
        {type === "line" && (
          <>
            <path d={data.map((d,i)=>`${i===0?"M":"L"}${xS(i)},${yS(d.value)}`).join(" ")+
              ` L${xS(data.length-1)},${pad.t+iH} L${xS(0)},${pad.t+iH} Z`}
              fill={`url(#g_${label})`}/>
            <path d={data.map((d,i)=>`${i===0?"M":"L"}${xS(i)},${yS(d.value)}`).join(" ")}
              fill="none" stroke={color} strokeWidth="2"/>
            {data.map((d,i)=>(
              <g key={i}>
                <circle cx={xS(i)} cy={yS(d.value)} r="3" fill={color}/>
                <text x={xS(i)} y={h-4} textAnchor="middle" fill="#475569" fontSize="8">{d.label}</text>
              </g>
            ))}
          </>
        )}
        {type === "combo" && (
          <>
            {data.map((d,i) => {
              const bx = pad.l + (i/data.length)*iW + (iW/data.length - barW)/2;
              return <rect key={i} x={bx} y={yS(Math.max(d.value,0))} width={barW} height={Math.max(1,Math.abs(yS(0)-yS(d.value)))} fill={d.value>=0?color+"66":"#ef444466"} rx={2}/>;
            })}
            {data.map((d,i)=>(
              <text key={i} x={pad.l+(i/data.length)*iW+(iW/data.length)/2} y={h-4} textAnchor="middle" fill="#475569" fontSize="8">{d.label}</text>
            ))}
          </>
        )}
      </svg>
    </div>
  );
};

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
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{
            role: "user",
            content: `Pro akciový ticker ${t.toUpperCase()} vrať fundamentální finanční data za posledních 8-10 let jako JSON objekt BEZ jakéhokoliv textu, pouze čistý JSON.

Struktura:
{
  "ticker": "${t.toUpperCase()}",
  "name": "celý název společnosti",
  "sector": "sektor",
  "currency": "USD",
  "currentPrice": číslo,
  "marketCap": číslo v miliardách,
  "years": ["2016","2017","2018","2019","2020","2021","2022","2023","2024"],
  "revenue": [čísla v miliardách USD],
  "netIncome": [čísla v miliardách USD],
  "ebitda": [čísla v miliardách USD],
  "freeCashFlow": [čísla v miliardách USD],
  "eps": [čísla],
  "dividendPerShare": [čísla, 0 pokud neplatí],
  "peRatio": [čísla, null pokud záporné EPS],
  "totalDebt": [čísla v miliardách USD],
  "cashAndEquivalents": [čísla v miliardách USD],
  "sharesOutstanding": [čísla v miliardách],
  "roe": [procenta],
  "grossMargin": [procenta],
  "operatingMargin": [procenta],
  "netMargin": [procenta],
  "summary": "2-3 věty o fundamentální kvalitě společnosti"
}

Použij skutečná historická data. Pokud ticker neexistuje, vrať {"error": "Ticker nenalezen"}.`
          }]
        })
      });
      if (!resp.ok) {
        let errMsg = `HTTP ${resp.status}`;
        try { const eb = await resp.json(); errMsg = eb.error || JSON.stringify(eb); } catch {}
        setError(`API chyba: ${errMsg}`);
        setLoading(false);
        return;
      }
      const json = await resp.json();
      const text = json.content?.[0]?.text || "";
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
      <span style={{color:"#475569"}}>{label}</span>
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
          <div style={{fontSize:10,color:"#475569",marginBottom:5}}>Ticker akcie / ETF</div>
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
          <div style={{color:"#475569",fontSize:11,marginTop:6}}>AI analyzuje historická data posledních 10 let</div>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Header */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{fontSize:18,fontWeight:700,color:"#f1f5f9"}}>{data.ticker} — {data.name}</div>
              <div style={{fontSize:11,color:"#475569",marginTop:2}}>{data.sector} · {data.currency} · Tržní cap: <b style={{color:"#94a3b8"}}>{data.marketCap?.toFixed(1)}B</b></div>
              {data.summary && <div style={{fontSize:11,color:"#64748b",marginTop:6,maxWidth:600,lineHeight:1.5,fontStyle:"italic"}}>"{data.summary}"</div>}
            </div>
            <div style={{fontSize:22,fontWeight:800,color:"#6366f1"}}>{data.currentPrice} {data.currency}</div>
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
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
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
                <MiniChart data={mkData("revenue")} type="bar" color="#6366f1" label="rv" height={120}/>
              </ChartCard>
              <ChartCard title="EBITDA (mld. USD)" desc="Zisk před úroky, daněmi, odpisy a amortizací">
                <MiniChart data={mkData("ebitda")} type="bar" color="#3b82f6" label="eb" height={120}/>
              </ChartCard>
              <ChartCard title="Net Income — čistý zisk (mld. USD)" desc="Zisk po zdanění">
                <MiniChart data={mkData("netIncome")} type="combo" color="#10b981" label="ni" height={120}/>
              </ChartCard>
              <ChartCard title="Hrubá marže (%)" desc="Gross Margin — efektivita výroby/prodeje">
                <MiniChart data={mkData("grossMargin")} type="line" color="#f59e0b" label="gm" unit="%" height={120}/>
              </ChartCard>
            </div>
          )}

          {/* ZISKOVOST */}
          {activeChart==="profit" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <ChartCard title="EPS — zisk na akcii (USD)" desc="Earnings Per Share — klíčový ukazatel růstu">
                <MiniChart data={mkData("eps")} type="combo" color="#f59e0b" label="eps" height={130}/>
              </ChartCard>
              <ChartCard title="ROE — výnosnost vlastního kapitálu (%)" desc="Return on Equity — Buffett požaduje > 15%">
                <MiniChart data={mkData("roe")} type="line" color="#8b5cf6" label="roe" unit="%" height={130}/>
              </ChartCard>
              <ChartCard title="Provozní marže (%)" desc="Operating Margin — zisk z core businessu">
                <MiniChart data={mkData("operatingMargin")} type="line" color="#6366f1" label="om" unit="%" height={130}/>
              </ChartCard>
              <ChartCard title="Čistá marže (%)" desc="Net Margin — kolik centů ze $1 tržeb zůstane">
                <MiniChart data={mkData("netMargin")} type="line" color="#10b981" label="nm" unit="%" height={130}/>
              </ChartCard>
            </div>
          )}

          {/* FREE CASH FLOW */}
          {activeChart==="cashflow" && (
            <div>
              <ChartCard title="Free Cash Flow (mld. USD)" desc="Volný peněžní tok — peníze které firma skutečně generuje po investicích. Nejdůležitější ukazatel pro DCF ocenění.">
                <MiniChart data={mkData("freeCashFlow")} type="combo" color="#10b981" label="fcf" height={150}/>
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
                            <text x={x+bW} y={110} textAnchor="middle" fill="#475569" fontSize="7">{y.toString().slice(2)}</text>
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
                  })).filter(d=>d.value!==null)} type="line" color="#f59e0b" label="fcfy" unit="%" height={120}/>
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
                  })).filter(d=>d.value!==null)} type="line" color="#ec4899" label="pr" unit="%" height={120}/>
                </ChartCard>
                <ChartCard title="Roční růst dividendy (%)" desc="Dividend Growth Rate — čím vyšší a konzistentnější, tím lepší">
                  <MiniChart data={(data.years||[]).map((y,i)=>({
                    label:y.toString().slice(2),
                    value: i>0&&data.dividendPerShare?.[i-1]>0
                      ? ((data.dividendPerShare[i]-data.dividendPerShare[i-1])/data.dividendPerShare[i-1])*100 : null
                  })).filter(d=>d.value!==null)} type="combo" color="#10b981" label="dgr" unit="%" height={120}/>
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
                          <text x={x+bW} y={128} textAnchor="middle" fill="#475569" fontSize="7">{y.toString().slice(2)}</text>
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
                  }))} type="combo" color="#f59e0b" label="nd" height={120}/>
                </ChartCard>
                <ChartCard title="Debt/EBITDA poměr" desc="Počet let na splacení dluhu z EBITDA. Ideálně < 3x">
                  <MiniChart data={(data.years||[]).map((y,i)=>({
                    label:y.toString().slice(2),
                    value:data.ebitda?.[i]>0?((data.totalDebt?.[i]||0)/data.ebitda[i]):null
                  })).filter(d=>d.value!==null)} type="line" color="#ef4444" label="de" unit="x" height={120}/>
                </ChartCard>
              </div>
            </div>
          )}

          {/* POČET AKCIÍ */}
          {activeChart==="shares" && (
            <div>
              <ChartCard title="Počet akcií v oběhu (mld.)" desc="Klesající počet = buyback (firma vykupuje vlastní akcie = pozitivní pro akcionáře). Rostoucí = ředění (dilution = negativní).">
                <MiniChart data={mkData("sharesOutstanding")} type="combo" color="#6366f1" label="sh" height={150}/>
              </ChartCard>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <ChartCard title="Roční změna počtu akcií (%)" desc="Záporné = buyback (dobré), kladné = dilution (pozor!)">
                  <MiniChart data={(data.years||[]).map((y,i)=>({
                    label:y.toString().slice(2),
                    value:i>0&&data.sharesOutstanding?.[i-1]>0
                      ?((data.sharesOutstanding[i]-data.sharesOutstanding[i-1])/data.sharesOutstanding[i-1])*100:null
                  })).filter(d=>d.value!==null)} type="combo" color="#10b981" label="sc" unit="%" height={120}/>
                </ChartCard>
                <ChartCard title="EPS růst — vliv buybacků" desc="Buybacky zvyšují EPS i bez růstu tržeb — sleduj zda roste EPS rychleji než Net Income">
                  <MiniChart data={(data.years||[]).map((y,i)=>({
                    label:y.toString().slice(2),
                    value:i>0&&data.eps?.[i-1]>0?((data.eps[i]-data.eps[i-1])/data.eps[i-1])*100:null
                  })).filter(d=>d.value!==null)} type="combo" color="#f59e0b" label="eg" unit="%" height={120}/>
                </ChartCard>
              </div>
            </div>
          )}

          {/* VALUACE */}
          {activeChart==="valuation" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <ChartCard title="P/E ratio" desc="Price/Earnings — valuační násobek. Vysoký P/E = trh očekává růst nebo je akcie drahá">
                <MiniChart data={mkData("peRatio")} type="line" color="#f59e0b" label="pe" height={130}/>
              </ChartCard>
              <ChartCard title="Price/FCF (Tržní cap / FCF)" desc="Levnější alternativa k P/E — ukazuje kolik platíš za $1 volného cash flow">
                <MiniChart data={(data.years||[]).map((y,i)=>({
                  label:y.toString().slice(2),
                  value:data.freeCashFlow?.[i]>0?(data.marketCap/data.freeCashFlow[i]):null
                })).filter(d=>d.value!==null)} type="line" color="#6366f1" label="pf" height={130}/>
              </ChartCard>
              <ChartCard title="Revenue na akcii (USD)" desc="Tržby na akcii — roste díky organickému růstu i buybackům">
                <MiniChart data={(data.years||[]).map((y,i)=>({
                  label:y.toString().slice(2),
                  value:data.sharesOutstanding?.[i]>0?(data.revenue?.[i]/data.sharesOutstanding[i]):null
                })).filter(d=>d.value!==null)} type="line" color="#10b981" label="rs" height={130}/>
              </ChartCard>
              <ChartCard title="EBITDA marže (%)" desc="EBITDA / Revenue — provozní výkonnost před finančními náklady">
                <MiniChart data={(data.years||[]).map((y,i)=>({
                  label:y.toString().slice(2),
                  value:data.revenue?.[i]>0?(data.ebitda?.[i]/data.revenue[i])*100:null
                })).filter(d=>d.value!==null)} type="line" color="#8b5cf6" label="em" unit="%" height={130}/>
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
                      return <text key={y} x={30+(idx/(data.years.length-1))*380} y={135} textAnchor="middle" fill="#475569" fontSize="8">{y.toString().slice(2)}</text>;
                    })}
                    <text x={35} y={10} fill="#6366f1" fontSize="8">— Hrubá</text>
                    <text x={95} y={10} fill="#10b981" fontSize="8">— Provozní</text>
                    <text x={165} y={10} fill="#f59e0b" fontSize="8">— Čistá</text>
                  </svg>
                </div>
              </ChartCard>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <ChartCard title="Hrubá marže (%)" desc="Gross Margin">
                  <MiniChart data={mkData("grossMargin")} type="line" color="#6366f1" label="gm2" unit="%" height={110}/>
                </ChartCard>
                <ChartCard title="Čistá marže (%)" desc="Net Margin">
                  <MiniChart data={mkData("netMargin")} type="line" color="#f59e0b" label="nm2" unit="%" height={110}/>
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
          <div style={{fontSize:13,color:"#475569",marginBottom:6}}>Zadej ticker a klikni na Načíst grafy</div>
          <div style={{fontSize:11,color:"#334155"}}>AI načte historická fundamentální data za posledních 8-10 let</div>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginTop:20}}>
            <div style={{background:"#0d1424",border:"1px solid #1e293b",borderRadius:6,padding:"8px 14px",fontSize:11,color:"#475569"}}>📊 Revenue & EBITDA</div>
            <div style={{background:"#0d1424",border:"1px solid #1e293b",borderRadius:6,padding:"8px 14px",fontSize:11,color:"#475569"}}>💸 Free Cash Flow</div>
            <div style={{background:"#0d1424",border:"1px solid #1e293b",borderRadius:6,padding:"8px 14px",fontSize:11,color:"#475569"}}>📉 EPS & P/E</div>
            <div style={{background:"#0d1424",border:"1px solid #1e293b",borderRadius:6,padding:"8px 14px",fontSize:11,color:"#475569"}}>🏦 Dluh & Hotovost</div>
            <div style={{background:"#0d1424",border:"1px solid #1e293b",borderRadius:6,padding:"8px 14px",fontSize:11,color:"#475569"}}>🔄 Buybacky & Ředění</div>
            <div style={{background:"#0d1424",border:"1px solid #1e293b",borderRadius:6,padding:"8px 14px",fontSize:11,color:"#475569"}}>💰 Dividendový růst</div>
          </div>
        </div>
      )}
    </div>
  );
};


// ─── ANALYZA TAB WRAPPER ──────────────────────────────────────────────────────
function AnalyzaTab({ rates, S }) {
  const [subTab, setSubTab] = useState("fundamenty");
  const SUB = [
    { id:"fundamenty", label:"📈 Fundamentální grafy" },
    { id:"oceneni", label:"🔍 Ocenění (DCF/Graham)" },
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
      {subTab==="fundamenty" && <FundamentalCharts S={S} />}
      {subTab==="oceneni" && <ValuationAnalyzer rates={rates} />}
    </>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
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
  const [filterCat, setFilterCat] = useState("all");
  const [sortKey, setSortKey] = useState("value"); // value|name|gain|gainpct|yoc|annret|weight|change1d
  const [sortDir, setSortDir] = useState("desc"); // asc|desc
  const [viewMode, setViewMode] = useState("table"); // table|heatmap|cards
  const [chartYear, setChartYear] = useState(null); // null = all time
  const [loaded, setLoaded] = useState(false);
  const [ratesStatus, setRatesStatus] = useState("idle"); // idle | loading | ok | error

  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | ok | error | offline
  const [darkMode, setDarkMode] = useState(true);
  const [fontSize, setFontSize] = useState(13); // 11-17

  // ─── PERSIST — localStorage + Supabase sync ──────────────────────────────
  // Load: Supabase má přednost, localStorage jako fallback
  useEffect(() => {
    const load = async () => {
      // 1. Nejdřív načti z localStorage (okamžité zobrazení)
      try {
        const tx = localStorage.getItem("inv_transactions");
        const pr = localStorage.getItem("inv_prices");
        const ra = localStorage.getItem("inv_rates");
        const di = localStorage.getItem("inv_dividends");
        const ea = localStorage.getItem("inv_earnings");
        const fi = localStorage.getItem("inv_fiSettings");
        const po = localStorage.getItem("inv_portfolios");
        const ap = localStorage.getItem("inv_activePortfolioId");
        if (tx) setTransactions(JSON.parse(tx));
        if (pr) setPrices(JSON.parse(pr));
        if (ra) setRates(JSON.parse(ra));
        if (di) setDividends(JSON.parse(di));
        if (ea) setEarnings(JSON.parse(ea));
        if (fi) setFiSettings(JSON.parse(fi));
        if (po) setPortfolios(JSON.parse(po));
        if (ap) setActivePortfolioId(JSON.parse(ap));
        const dm = localStorage.getItem("inv_darkMode");
        const fs = localStorage.getItem("inv_fontSize");
        if (dm !== null) setDarkMode(JSON.parse(dm));
        if (fs !== null) setFontSize(JSON.parse(fs));
      } catch {}

      // 2. Pokud je Supabase nakonfigurováno, načti z cloudu (přepíše localStorage)
      if (supabase) {
        setSyncStatus("syncing");
        try {
          const { data, error } = await supabase
            .from("portfolio_data")
            .select("data")
            .eq("id", "main")
            .single();
          if (!error && data?.data && Object.keys(data.data).length > 0) {
            const d = data.data;
            if (d.transactions) { setTransactions(d.transactions); localStorage.setItem("inv_transactions", JSON.stringify(d.transactions)); }
            if (d.prices)       { setPrices(d.prices);             localStorage.setItem("inv_prices",       JSON.stringify(d.prices)); }
            if (d.rates)        { setRates(d.rates);               localStorage.setItem("inv_rates",        JSON.stringify(d.rates)); }
            if (d.dividends)    { setDividends(d.dividends);       localStorage.setItem("inv_dividends",    JSON.stringify(d.dividends)); }
            if (d.earnings)     { setEarnings(d.earnings);         localStorage.setItem("inv_earnings",     JSON.stringify(d.earnings)); }
            if (d.fiSettings)   { setFiSettings(d.fiSettings);     localStorage.setItem("inv_fiSettings",   JSON.stringify(d.fiSettings)); }
            if (d.portfolios)   { setPortfolios(d.portfolios);     localStorage.setItem("inv_portfolios",   JSON.stringify(d.portfolios)); }
            if (d.activePortfolioId) { setActivePortfolioId(d.activePortfolioId); localStorage.setItem("inv_activePortfolioId", JSON.stringify(d.activePortfolioId)); }
            setSyncStatus("ok");
          } else {
            setSyncStatus("ok");
          }
        } catch { setSyncStatus("error"); }
      } else {
        setSyncStatus("offline");
      }
      setLoaded(true);
    };
    load();
  }, []);

  // Debounced save — ukládá 1,5s po poslední změně aby nespamoval DB
  const saveTimerRef = useRef(null);
  const saveToCloud = useCallback((newData) => {
    // Vždy ulož do localStorage okamžitě
    Object.entries(newData).forEach(([k, v]) => {
      try { localStorage.setItem(`inv_${k}`, JSON.stringify(v)); } catch {}
    });
    // Do Supabase s debounce
    if (!supabase) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSyncStatus("syncing");
      try {
        const { error } = await supabase
          .from("portfolio_data")
          .upsert({ id: "main", data: newData, updated_at: new Date().toISOString() });
        setSyncStatus(error ? "error" : "ok");
      } catch { setSyncStatus("error"); }
    }, 1500);
  }, []);

  // Sleduj změny a ulož
  useEffect(() => {
    if (!loaded) return;
    saveToCloud({ transactions, prices, rates, dividends, earnings, fiSettings, portfolios, activePortfolioId });
  }, [transactions, prices, rates, dividends, earnings, fiSettings, loaded]);

  // Realtime sync — při změně z jiného zařízení se data obnoví
  useEffect(() => {
    if (!supabase || !loaded) return;
    const channel = supabase
      .channel("portfolio_changes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "portfolio_data", filter: "id=eq.main" },
        (payload) => {
          const d = payload.new?.data;
          if (!d) return;
          // Pouze přijmi pokud jsou data novější
          if (d.transactions) setTransactions(d.transactions);
          if (d.prices)       setPrices(d.prices);
          if (d.dividends)    setDividends(d.dividends);
          if (d.earnings)     setEarnings(d.earnings);
          if (d.fiSettings)   setFiSettings(d.fiSettings);
          setSyncStatus("ok");
        })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loaded]);

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
    transactions.filter(t => !t.portfolioId || t.portfolioId === activePortfolioId),
    [transactions, activePortfolioId]
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
        holdings[t.ticker].totalQty -= t.quantity;
      } else if (t.type === "dividend" && t.dividendAmount) {
        totalDividendsCZK += toCZK(t.dividendAmount, t.currency, rates);
      } else if (t.type === "deposit") {
        totalInvestedCZK += toCZK(t.amount || 0, t.currency, rates);
      } else if (t.type === "withdraw") {
        totalInvestedCZK -= toCZK(t.amount || 0, t.currency, rates);
      }
    });
    let totalCurrentCZK = 0;
    const positions = Object.values(holdings).map(h => {
      const p = prices[h.ticker];
      const currentPrice = p?.price || 0;
      const currentCurrency = p?.currency || "USD";
      const currentValueCZK = toCZK(h.totalQty * currentPrice, currentCurrency, rates);
      const gainCZK = currentValueCZK - h.totalCostCZK;
      const gainPct = h.totalCostCZK > 0 ? (gainCZK / h.totalCostCZK) * 100 : 0;
      const avgCostCZK = h.totalQty > 0 ? h.totalCostCZK / h.totalQty : 0;
      const threeYearsAgo = new Date(); threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      const testedLots = h.lots.filter(l => new Date(l.date) <= threeYearsAgo);
      const testedQty = testedLots.reduce((s, l) => s + l.quantity, 0);
      const testedCostCZK = testedLots.reduce((s, l) => s + l.costCZK, 0);
      const testedValueCZK = toCZK(testedQty * currentPrice, currentCurrency, rates);
      const earliestLot = h.lots.length > 0 ? h.lots.reduce((a, b) => a.date < b.date ? a : b) : null;
      const daysHeld = earliestLot ? daysSince(earliestLot.date) : 0;
      const daysToTest = earliestLot ? Math.max(0, 1095 - daysSince(earliestLot.date)) : 0;
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
        ? lastDivs.reduce((s,t)=>s+(t.dividendAmount||0),0) / h.totalQty * (4 / lastDivs.length) : 0;
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
    return { positions, totalInvestedCZK, totalCurrentCZK, totalGainCZK, totalGainPct, totalDividendsCZK, testedTotal, totalDayChange, totalAnnualDiv, portfolioYield, portfolioYoC };
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
  const [newTx, setNewTx] = useState({ type:"buy", ticker:"", name:"", category:"stock", date:new Date().toISOString().slice(0,10), quantity:"", price:"", currency:"USD", fee:"", dividendAmount:"", notes:"" });

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
    setNewTx({ type:"buy", ticker:"", name:"", category:"stock", date:new Date().toISOString().slice(0,10), quantity:"", price:"", currency:"USD", fee:"", dividendAmount:"", amount:"", notes:"" });
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
  const S = {
    app: { minHeight:"100vh",
      background: darkMode ? "#0a0f1e" : "#f1f5f9",
      color: darkMode ? "#e2e8f0" : "#1e293b",
      fontFamily:"'IBM Plex Mono','Courier New',monospace", fontSize },
    // Light mode overrides applied via inline styles where needed
    nav: { background: darkMode ? "#0d1424" : "#ffffff", borderBottom: darkMode ? "1px solid #1e293b" : "1px solid #e2e8f0", position:"sticky", top:0, zIndex:100 },
    navTop: { padding:"0 20px", display:"flex", alignItems:"center", justifyContent:"space-between", borderBottom: darkMode ? "1px solid #0f172a" : "1px solid #e2e8f0" },
    navTabs: { padding:"0 20px", display:"flex", alignItems:"center", gap:0, overflowX:"auto" },
    logo: { fontSize:13, fontWeight:700, color:"#6366f1", letterSpacing:"0.1em", whiteSpace:"nowrap", padding:"12px 0" },
    navBtn: (active) => ({ background:"none", border:"none", padding:"12px 14px", cursor:"pointer", fontSize:10, fontFamily:"inherit", color:active?"#6366f1":"#64748b", borderBottom:active?"2px solid #6366f1":"2px solid transparent", transition:"all 0.2s", whiteSpace:"nowrap", letterSpacing:"0.06em", textTransform:"uppercase" }),
    main: { padding:"20px", maxWidth:1200, margin:"0 auto" },
    card: { background: darkMode ? "#0d1424" : "#ffffff", border: darkMode ? "1px solid #1e293b" : "1px solid #e2e8f0", borderRadius:8, padding:20, marginBottom:16 },
    statCard: (accent="#6366f1") => ({ background: darkMode ? "#0d1424" : "#ffffff", border: darkMode ? "1px solid #1e293b" : "1px solid #e2e8f0", borderRadius:8, padding:18, borderLeft:`3px solid ${accent}` }),
    label: { fontSize:10, color:"#475569", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 },
    badge: (color) => ({ display:"inline-block", padding:"2px 7px", borderRadius:4, fontSize:10, fontWeight:600, background:color+"22", color, letterSpacing:"0.05em", textTransform:"uppercase" }),
    btn: (v="primary") => ({ background:v==="primary"?"linear-gradient(135deg,#4f46e5,#6366f1)":v==="danger"?"#dc262622":"#1e293b", color:v==="primary"?"#fff":v==="danger"?"#ef4444":"#94a3b8", border:v==="outline"?"1px solid #334155":"none", borderRadius:6, padding:"8px 16px", cursor:"pointer", fontSize:11, fontFamily:"inherit", fontWeight:600, letterSpacing:"0.05em", transition:"all 0.2s" }),
    input: { background: darkMode ? "#0a0f1e" : "#f8fafc", border: darkMode ? "1px solid #334155" : "1px solid #cbd5e1", borderRadius:6, color: darkMode ? "#e2e8f0" : "#1e293b", padding:"8px 12px", fontSize:12, fontFamily:"inherit", width:"100%", boxSizing:"border-box" },
    select: { background: darkMode ? "#0a0f1e" : "#f8fafc", border: darkMode ? "1px solid #334155" : "1px solid #cbd5e1", borderRadius:6, color: darkMode ? "#e2e8f0" : "#1e293b", padding:"8px 12px", fontSize:12, fontFamily:"inherit", width:"100%", boxSizing:"border-box" },
    table: { width:"100%", borderCollapse:"collapse" },
    th: { textAlign:"left", padding:"10px 12px", fontSize:10, color:"#475569", borderBottom:"1px solid #1e293b", letterSpacing:"0.08em", textTransform:"uppercase" },
    td: { padding:"11px 12px", borderBottom:"1px solid #0f172a", fontSize:12 },
    modal: { position:"fixed", inset:0, background:"#000b", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000, padding:20, backdropFilter:"blur(2px)" },
    modalBox: { background: darkMode ? "#0d1424" : "#ffffff", border: darkMode ? "1px solid #334155" : "1px solid #e2e8f0", borderRadius:12, padding:28, width:"100%", maxWidth:520, maxHeight:"90vh", overflowY:"auto" },
    sectionTitle: { fontSize:10, fontWeight:700, color:"#475569", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:14, paddingBottom:7, borderBottom:"1px solid #1e293b" },
  };

  const catColor = { stock:"#6366f1", etf:"#10b981", crypto:"#f59e0b" };
  const catLabel = { stock:"Akcie", etf:"ETF", crypto:"Crypto" };

  const TABS = ["dashboard","portfolio","transakce","cashflow","dividendy","novinky","analyza","fi","nastaveni"];
  const TAB_LABELS = { dashboard:"Přehled", portfolio:"Portfolio", transakce:"Transakce", cashflow:"Vklady/Výběry", dividendy:"Dividendy", novinky:"Novinky", analyza:"Analýza", fi:"FI Kalkulačka", nastaveni:"Nastavení" };
  const filtered = filterCat === "all" ? portfolio.positions : portfolio.positions.filter(p => p.category === filterCat);

  if (!loaded) return (
    <div style={{ ...S.app, display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh" }}>
      <div style={{ color:"#6366f1" }}>Načítám data...</div>
    </div>
  );

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* NAV - two rows */}
      <nav style={S.nav}>
        <div style={S.navTop}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={S.logo}>📈 INVESTTRACK</div>
            {/* Portfolio switcher */}
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              {portfolios.map(p => (
                <button key={p.id}
                  style={{ background: activePortfolioId===p.id ? p.color+"33" : "transparent",
                    border: `1px solid ${activePortfolioId===p.id ? p.color : "#1e293b"}`,
                    borderRadius:6, padding:"4px 12px", cursor:"pointer", fontSize:10,
                    color: activePortfolioId===p.id ? p.color : "#475569",
                    fontFamily:"inherit", fontWeight:600, transition:"all 0.2s", whiteSpace:"nowrap" }}
                  onClick={() => setActivePortfolioId(p.id)}>
                  {p.name}
                </button>
              ))}
              <button style={{ background:"none", border:"1px dashed #334155", borderRadius:6,
                padding:"4px 10px", cursor:"pointer", fontSize:11, color:"#475569", fontFamily:"inherit" }}
                onClick={() => setShowPortfolioMgr(true)} title="Spravovat portfolia">⚙</button>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            {ratesStatus === "loading" && <span style={{ fontSize:10, color:"#f59e0b" }}>↻ kurzy...</span>}
            {ratesStatus === "ok" && <span style={{ fontSize:10, color:"#10b981" }}>✓ kurzy</span>}
            {ratesStatus === "error" && <span style={{ fontSize:10, color:"#ef4444" }}>kurzy offline</span>}
            <span style={{ fontSize:10, color:"#334155" }}>USD {rates.USD_CZK} · EUR {rates.EUR_CZK}</span>
            <span style={{ fontSize:10, padding:"2px 8px", borderRadius:10,
              background: syncStatus==="ok"?"#10b98122":syncStatus==="syncing"?"#f59e0b22":syncStatus==="error"?"#ef444422":"#1e293b",
              color: syncStatus==="ok"?"#10b981":syncStatus==="syncing"?"#f59e0b":syncStatus==="error"?"#ef4444":"#475569" }}>
              {syncStatus==="ok"?"☁ sync OK":syncStatus==="syncing"?"↻ ukládám...":syncStatus==="error"?"⚠ sync chyba":"💾 lokálně"}
            </span>
            {/* Font size controls */}
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <button style={{ ...S.btn("outline"), padding:"3px 8px", fontSize:14, lineHeight:1 }}
                onClick={() => setFontSize(s => Math.max(11, s-1))} title="Zmenšit písmo">A-</button>
              <span style={{ fontSize:10, color:"#475569", width:22, textAlign:"center" }}>{fontSize}</span>
              <button style={{ ...S.btn("outline"), padding:"3px 8px", fontSize:14, lineHeight:1 }}
                onClick={() => setFontSize(s => Math.min(17, s+1))} title="Zvětšit písmo">A+</button>
            </div>
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

      <main style={S.main}>

        {/* ─── DASHBOARD ────────────────────────────────────────────────── */}
        {tab === "dashboard" && (
          <>
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:17, fontWeight:700, color:"#f1f5f9", marginBottom:4 }}>Přehled — <span style={{color:"#6366f1"}}>{portfolios.find(p=>p.id===activePortfolioId)?.name||"Portfolio"}</span></div>
              <div style={{ fontSize:10, color:"#475569" }}>
                {fmtDate(new Date().toISOString())} · USD/CZK: <b style={{color:"#94a3b8"}}>{rates.USD_CZK}</b> · EUR/CZK: <b style={{color:"#94a3b8"}}>{rates.EUR_CZK}</b>
                {rates.lastUpdated && <span style={{marginLeft:8}}>· kurzy {fmtDate(rates.lastUpdated)}</span>}
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
                  <div style={{ fontSize:17, fontWeight:700, color:s.accent }}>{s.value}</div>
                  {s.sub && <div style={{ fontSize:11, color:s.accent, marginTop:2 }}>{s.sub}</div>}
                </div>
              ))}
            </div>

            {/* CHARTS */}
            <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16, marginBottom:16 }}>
              <div style={S.card}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div style={S.sectionTitle}>Vývoj portfolia</div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    <button style={{ ...S.btn(chartYear===null?"primary":"outline"), padding:"4px 8px", fontSize:10 }} onClick={() => setChartYear(null)}>Vše</button>
                    {availableYears.map(y => (
                      <button key={y} style={{ ...S.btn(chartYear===y?"primary":"outline"), padding:"4px 8px", fontSize:10 }} onClick={() => setChartYear(y)}>{y}</button>
                    ))}
                  </div>
                </div>
                <GrowthChart transactions={activeTransactions} prices={prices} rates={rates} yearFilter={chartYear} />
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>Alokace</div>
                <DonutChart data={[
                  { label:"Akcie", value:portfolio.positions.filter(p=>p.category==="stock").reduce((s,p)=>s+p.currentValueCZK,0) },
                  { label:"ETF", value:portfolio.positions.filter(p=>p.category==="etf").reduce((s,p)=>s+p.currentValueCZK,0) },
                  { label:"Crypto", value:portfolio.positions.filter(p=>p.category==="crypto").reduce((s,p)=>s+p.currentValueCZK,0) },
                ].filter(d=>d.value>0)} />
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
              <div style={S.card}>
                <div style={S.sectionTitle}>Top pozice (CZK)</div>
                <BarChart data={portfolio.positions.sort((a,b)=>b.currentValueCZK-a.currentValueCZK).slice(0,6).map(p=>({ label:p.ticker, value:p.currentValueCZK }))} />
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>Roční výnosy</div>
                <AnnualReturnChart transactions={activeTransactions} prices={prices} rates={rates} />
              </div>
            </div>

            {/* UPCOMING */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div style={S.card}>
                <div style={S.sectionTitle}>📅 Nadcházející dividendy</div>
                {dividends.sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,5).map((d,i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid #0f172a" }}>
                    <div>
                      <span style={S.badge("#8b5cf6")}>{d.ticker}</span>
                      <span style={{ marginLeft:8, color:"#94a3b8", fontSize:11 }}>{fmtDate(d.date)}</span>
                    </div>
                    <div style={{ color:"#8b5cf6", fontWeight:600, fontSize:12 }}>{d.perShare?`${d.amount} ${d.currency}/ks`:fmt(d.amount,d.currency,2)}</div>
                  </div>
                ))}
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>📊 Nadcházející earnings</div>
                {earnings.sort((a,b)=>new Date(a.date)-new Date(b.date)).map((e,i) => (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid #0f172a" }}>
                    <div>
                      <span style={S.badge("#f59e0b")}>{e.ticker}</span>
                      <span style={{ marginLeft:8, color:"#94a3b8", fontSize:11 }}>{fmtDate(e.date)}</span>
                      <span style={{ marginLeft:6, fontSize:10, color:"#64748b" }}>{e.time==="after-close"?"po zavření":"před otevřením"}</span>
                    </div>
                    <div style={{ color:"#94a3b8", fontSize:11 }}>{e.estimate}</div>
                  </div>
                ))}
                {earnings.length===0 && <div style={{ color:"#475569", fontSize:11 }}>Žádné nadcházející earnings</div>}
              </div>
            </div>
          </>
        )}

        {/* ─── PORTFOLIO TAB ─────────────────────────────────────────────── */}
        {tab === "portfolio" && (
          <>
            {/* Summary stats row */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:14 }}>
              {[
                {label:"Počet pozic",value:portfolio.positions.length,accent:"#6366f1",fmt:v=>v},
                {label:"Portfolio yield",value:portfolio.portfolioYield?.toFixed(2)+"%",accent:"#10b981",fmt:v=>v},
                {label:"Yield on Cost",value:portfolio.portfolioYoC?.toFixed(2)+"%",accent:"#8b5cf6",fmt:v=>v},
                {label:"Roční dividendy",value:fmt(portfolio.totalAnnualDiv,"CZK",0),accent:"#f59e0b",fmt:v=>v},
                {label:"Přijaté dividendy",value:fmt(portfolio.totalDividendsCZK,"CZK",0),accent:"#ec4899",fmt:v=>v},
                {label:"Denní změna",value:fmt(portfolio.totalDayChange,"CZK",0),accent:upColor(portfolio.totalDayChange),fmt:v=>v},
              ].map((s,i)=>(
                <div key={i} style={S.statCard(s.accent)}>
                  <div style={S.label}>{s.label}</div>
                  <div style={{fontSize:15,fontWeight:700,color:s.accent}}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Controls */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, flexWrap:"wrap", gap:8 }}>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {["all","stock","etf","crypto"].map(c => (
                  <button key={c} style={{ ...S.btn(filterCat===c?"primary":"outline"), padding:"5px 10px", fontSize:10 }} onClick={() => setFilterCat(c)}>
                    {c==="all"?"Vše":catLabel[c]}
                  </button>
                ))}
              </div>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <span style={{ fontSize:10, color:"#475569" }}>Řadit:</span>
                <select value={sortKey} onChange={e=>setSortKey(e.target.value)} style={{ ...S.select, width:"auto", padding:"4px 8px", fontSize:10 }}>
                  <option value="value">Hodnota</option>
                  <option value="name">Název</option>
                  <option value="weight">Váha %</option>
                  <option value="gain">Zisk CZK</option>
                  <option value="gainpct">Zisk %</option>
                  <option value="annret">Roční výnos</option>
                  <option value="yoc">YoC %</option>
                  <option value="divyield">Div. výnos %</option>
                  <option value="change1d">Denní změna</option>
                  <option value="days">Dnů drženo</option>
                </select>
                <button style={{ ...S.btn("outline"), padding:"4px 10px", fontSize:11 }}
                  onClick={()=>setSortDir(d=>d==="asc"?"desc":"asc")}>
                  {sortDir==="asc"?"↑ Vzestupně":"↓ Sestupně"}
                </button>
                <div style={{ display:"flex", gap:4 }}>
                  {[["table","☰"],["heatmap","▦"],["cards","⊞"]].map(([m,icon])=>(
                    <button key={m} style={{ ...S.btn(viewMode===m?"primary":"outline"), padding:"4px 10px", fontSize:12 }}
                      onClick={()=>setViewMode(m)} title={m}>{icon}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* SORTED POSITIONS */}
            {(() => {
              const sortFns = {
                value: p=>p.currentValueCZK, name: p=>p.ticker, weight: p=>p.weight,
                gain: p=>p.gainCZK, gainpct: p=>p.gainPct, annret: p=>p.annualizedReturn,
                yoc: p=>p.yoc, divyield: p=>p.divYield, change1d: p=>p.change1d, days: p=>p.daysHeld,
              };
              const sortedFiltered = [...(filterCat==="all"?portfolio.positions:portfolio.positions.filter(p=>p.category===filterCat))]
                .sort((a,b)=>{
                  const fn = sortFns[sortKey]||sortFns.value;
                  const av=fn(a), bv=fn(b);
                  if(typeof av==="string") return sortDir==="asc"?av.localeCompare(bv):bv.localeCompare(av);
                  return sortDir==="asc"?(av-bv):(bv-av);
                });

              // TABLE VIEW
              if(viewMode==="table") return (
                <div style={{ overflowX:"auto" }}>
                  <table style={S.table}>
                    <thead><tr>
                      {[
                        {k:"name",l:"Ticker"},{k:"value",l:"Hodnota"},{k:"weight",l:"Váha %"},
                        {k:"gain",l:"Zisk/Ztráta"},{k:"gainpct",l:"Zisk %"},{k:"annret",l:"Roční výnos"},
                        {k:"yoc",l:"YoC"},{k:"divyield",l:"Div. výnos"},{k:"change1d",l:"Denní %"},
                        {k:"days",l:"Dnů"},{"k":"3l",l:"3L test"}
                      ].map(h=>(
                        <th key={h.k} style={{...S.th,cursor:h.k!=="3l"?"pointer":"default",color:sortKey===h.k?"#6366f1":"#475569",userSelect:"none"}}
                          onClick={()=>{if(h.k==="3l")return;if(sortKey===h.k)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortKey(h.k);setSortDir("desc");}}}>
                          {h.l}{sortKey===h.k?(sortDir==="asc"?" ↑":" ↓"):""}
                        </th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {sortedFiltered.map(p => (
                        <tr key={p.ticker} style={{ borderLeft:`2px solid ${catColor[p.category]||"#334155"}` }}>
                          <td style={S.td}>
                            <div style={{fontWeight:700,color:"#f1f5f9"}}>{p.ticker}</div>
                            <div style={{fontSize:9,color:"#475569"}}>{p.name?.slice(0,18)}</div>
                            <span style={S.badge(catColor[p.category]||"#64748b")}>{catLabel[p.category]}</span>
                          </td>
                          <td style={S.td}>
                            <div style={{fontWeight:600,color:"#f1f5f9"}}>{fmt(p.currentValueCZK,"CZK",0)}</div>
                            <div style={{fontSize:10,color:"#475569"}}>{p.totalQty.toFixed(p.category==="crypto"?4:2)} ks</div>
                          </td>
                          <td style={S.td}>
                            <div style={{fontSize:11,color:"#6366f1",fontWeight:600}}>{p.weight?.toFixed(1)}%</div>
                            <div style={{width:40,height:4,background:"#1e293b",borderRadius:2,marginTop:3,overflow:"hidden"}}>
                              <div style={{width:`${Math.min(100,p.weight||0)}%`,height:"100%",background:"#6366f1",borderRadius:2}}/>
                            </div>
                          </td>
                          <td style={{...S.td,color:upColor(p.gainCZK)}}>
                            <div>{fmt(p.gainCZK,"CZK",0)}</div>
                          </td>
                          <td style={{...S.td,color:upColor(p.gainPct),fontWeight:600}}>{fmtPct(p.gainPct)}</td>
                          <td style={{...S.td,color:upColor(p.annualizedReturn)}}>{fmtPct(p.annualizedReturn)}</td>
                          <td style={{...S.td,color:"#8b5cf6",fontWeight:600}}>
                            {p.yoc>0?p.yoc.toFixed(2)+"%":"–"}
                          </td>
                          <td style={{...S.td,color:"#10b981"}}>
                            {p.divYield>0?p.divYield.toFixed(2)+"%":"–"}
                          </td>
                          <td style={{...S.td,color:upColor(p.change1d)}}>{fmtPct(p.change1d)}</td>
                          <td style={{...S.td,color:"#475569",fontSize:11}}>{p.daysHeld}d</td>
                          <td style={S.td}>
                            {p.daysToTest>0
                              ?<span style={{color:"#f59e0b",fontSize:10}}>{p.daysToTest}d</span>
                              :<span style={{color:"#10b981",fontSize:10}}>✓</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );

              // HEATMAP VIEW
              if(viewMode==="heatmap") return (
                <div>
                  <div style={{fontSize:10,color:"#475569",marginBottom:10}}>Velikost = váha v portfoliu · Barva = zisk/ztráta</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {sortedFiltered.map(p=>{
                      const size=Math.max(60,Math.min(200,(p.weight||1)*8+60));
                      const intensity=Math.min(1,Math.abs(p.gainPct)/30);
                      const bg=p.gainPct>=0
                        ?`rgba(16,185,129,${0.15+intensity*0.5})`
                        :`rgba(239,68,68,${0.15+intensity*0.5})`;
                      const border=p.gainPct>=0?"#10b981":"#ef4444";
                      return(
                        <div key={p.ticker} style={{width:size,height:size,background:bg,border:`1px solid ${border}33`,borderRadius:8,padding:8,display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",cursor:"default",transition:"transform 0.1s"}}
                          onMouseEnter={e=>e.currentTarget.style.transform="scale(1.05)"}
                          onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
                          <div style={{fontSize:Math.max(9,Math.min(14,size/7)),fontWeight:700,color:"#f1f5f9",textAlign:"center"}}>{p.ticker}</div>
                          <div style={{fontSize:Math.max(8,Math.min(12,size/8)),color:p.gainPct>=0?"#10b981":"#ef4444",fontWeight:600}}>{fmtPct(p.gainPct)}</div>
                          {size>80&&<div style={{fontSize:8,color:"#94a3b8",marginTop:2}}>{p.weight?.toFixed(1)}%</div>}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{display:"flex",gap:16,marginTop:12,fontSize:10,color:"#94a3b8"}}>
                    <span style={{color:"#10b981"}}>█ Zisk</span><span style={{color:"#ef4444"}}>█ Ztráta</span><span>Větší plocha = větší váha v portfoliu</span>
                  </div>
                </div>
              );

              // CARDS VIEW
              return (
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
                  {sortedFiltered.map(p=>(
                    <div key={p.ticker} style={{background:"#0d1424",border:`1px solid ${catColor[p.category]||"#1e293b"}22`,borderTop:`3px solid ${catColor[p.category]||"#334155"}`,borderRadius:8,padding:14}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                        <div>
                          <div style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>{p.ticker}</div>
                          <div style={{fontSize:10,color:"#475569"}}>{p.name?.slice(0,20)}</div>
                        </div>
                        <span style={S.badge(catColor[p.category]||"#64748b")}>{catLabel[p.category]}</span>
                      </div>
                      {[
                        ["Hodnota",fmt(p.currentValueCZK,"CZK",0),"#f1f5f9"],
                        ["Váha",p.weight?.toFixed(1)+"%","#6366f1"],
                        ["Zisk/Ztráta",fmt(p.gainCZK,"CZK",0)+` (${fmtPct(p.gainPct)})`,upColor(p.gainPct)],
                        ["Roční výnos",fmtPct(p.annualizedReturn),upColor(p.annualizedReturn)],
                        ["YoC",p.yoc>0?p.yoc.toFixed(2)+"%":"–","#8b5cf6"],
                        ["Div. výnos",p.divYield>0?p.divYield.toFixed(2)+"%":"–","#10b981"],
                        ["DGR1",p.dgr1!=null?fmtPct(p.dgr1):"–",upColor(p.dgr1||0)],
                        ["Denní %",fmtPct(p.change1d),upColor(p.change1d)],
                        ["Break-even",fmt(p.breakEven,"CZK",0),"#94a3b8"],
                        ["3L test",p.daysToTest>0?`${p.daysToTest} dní`:"✓ Prošlo",p.daysToTest>0?"#f59e0b":"#10b981"],
                      ].map(([l,v,c],i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #0f172a",fontSize:11}}>
                          <span style={{color:"#475569"}}>{l}</span>
                          <span style={{color:c,fontWeight:600}}>{v}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        )}

        {/* ─── TRANSAKCE ─────────────────────────────────────────────────── */}
        {tab === "transakce" && (
          <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:"#f1f5f9" }}>Historie transakcí</div>
                <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>Portfolio: <b style={{color:"#6366f1"}}>{portfolios.find(p=>p.id===activePortfolioId)?.name}</b> · {activeTransactions.filter(t=>t.type==="buy"||t.type==="sell").length} obchodů · {activeTransactions.filter(t=>t.type==="dividend").length} dividend</div>
              </div>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <button style={{ ...S.btn("outline") }} onClick={() => {
                  // Auto-suggest dividends from history
                  const tickers = [...new Set(activeTransactions.filter(t=>t.type==="dividend").map(t=>t.ticker))];
                  let added = 0;
                  tickers.forEach(ticker => {
                    const suggestion = suggestDividends(ticker, portfolio.positions);
                    if (suggestion) {
                      // Check if not already exists for that date+ticker
                      const exists = dividends.some(d => d.ticker===ticker && d.date===suggestion.date);
                      if (!exists) { setDividends(prev => [...prev, suggestion]); added++; }
                    }
                  });
                  alert(`Automaticky přidáno ${added} navrhovaných dividend na základě historického vzoru.`);
                }}>🤖 Auto-dividendy</button>
                <button style={{ ...S.btn("outline") }} onClick={() => setShowCsvImport(true)}>📂 Import CSV</button>
                <button style={{ ...S.btn("outline") }} onClick={() => {
                  // Export CSV
                  const headers = ["type","ticker","name","category","date","quantity","price","currency","fee","dividendAmount","amount","notes"];
                  const rows = activeTransactions.map(t => headers.map(h => {
                    const v = t[h] ?? "";
                    return String(v).includes(",") ? `"${v}"` : v;
                  }).join(","));
                  const csv = [headers.join(","), ...rows].join("\n");
                  const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `transakce-${portfolios.find(p=>p.id===activePortfolioId)?.name||"export"}-${new Date().toISOString().slice(0,10)}.csv`;
                  a.click();
                }}>📤 Export CSV</button>
                <button style={{ ...S.btn("danger"), border:"1px solid #dc262644" }} onClick={() => setShowDeleteAll(true)}>🗑 Smazat vše</button>
                <button style={S.btn("primary")} onClick={() => setShowAddTx(true)}>+ Přidat</button>
              </div>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={S.table}>
                <thead><tr>
                  {["Datum","Typ","Ticker","Kategorie","Množství","Cena","Poplatek","Celkem CZK","Poznámka",""].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {[...activeTransactions].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t => {
                    const totalCZK = t.type==="dividend" ? toCZK(t.dividendAmount||0, t.currency, rates) : toCZK(t.quantity*t.price+(t.fee||0), t.currency, rates);
                    const typeColor = {buy:"#10b981",sell:"#ef4444",dividend:"#8b5cf6"}[t.type]||"#94a3b8";
                    const typeLabel = {buy:"Nákup",sell:"Prodej",dividend:"Dividenda"}[t.type]||t.type;
                    return (
                      <tr key={t.id}>
                        <td style={S.td}>{fmtDate(t.date)}</td>
                        <td style={S.td}><span style={S.badge(typeColor)}>{typeLabel}</span></td>
                        <td style={{ ...S.td, fontWeight:600, color:"#f1f5f9" }}>{t.ticker}</td>
                        <td style={S.td}><span style={S.badge(catColor[t.category]||"#64748b")}>{catLabel[t.category]||t.category}</span></td>
                        <td style={S.td}>{t.type==="dividend"?"–":t.quantity}</td>
                        <td style={S.td}>{t.type==="dividend"?fmt(t.dividendAmount,t.currency,2):`${t.price} ${t.currency}`}</td>
                        <td style={S.td}>{t.fee?`${t.fee} ${t.currency}`:"–"}</td>
                        <td style={{ ...S.td, fontWeight:600 }}>{fmt(totalCZK,"CZK",0)}</td>
                        <td style={{ ...S.td, color:"#64748b" }}>{t.notes||"–"}</td>
                        <td style={S.td}><button style={{ ...S.btn("danger"), padding:"3px 8px" }} onClick={() => setTransactions(prev=>prev.filter(x=>x.id!==t.id))}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ─── DIVIDENDY ─────────────────────────────────────────────────── */}
        {/* ─── CASHFLOW / VKLADY & VÝBĚRY ────────────────────────────────── */}
        {tab === "cashflow" && (
          <>
            <div style={{ fontSize:16, fontWeight:700, color:"#f1f5f9", marginBottom:14 }}>💰 Vklady & Výběry</div>
            {(() => {
              const flows = activeTransactions.filter(t => t.type==="deposit"||t.type==="withdraw");
              const totalDeposits = flows.filter(t=>t.type==="deposit").reduce((s,t)=>s+toCZK(t.amount||0,t.currency,rates),0);
              const totalWithdraws = flows.filter(t=>t.type==="withdraw").reduce((s,t)=>s+toCZK(t.amount||0,t.currency,rates),0);
              const netCash = totalDeposits - totalWithdraws;
              const roi = netCash > 0 ? ((portfolio.totalCurrentCZK - netCash) / netCash * 100) : 0;
              return (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12, marginBottom:16 }}>
                    {[
                      {label:"Celkové vklady",value:fmt(totalDeposits,"CZK",0),accent:"#10b981"},
                      {label:"Celkové výběry",value:fmt(totalWithdraws,"CZK",0),accent:"#ef4444"},
                      {label:"Čistý vklad",value:fmt(netCash,"CZK",0),accent:"#6366f1"},
                      {label:"ROI na vložený kapitál",value:roi.toFixed(1)+"%",accent:roi>=0?"#10b981":"#ef4444"},
                      {label:"Aktuální hodnota portfolia",value:fmt(portfolio.totalCurrentCZK,"CZK",0),accent:"#f59e0b"},
                      {label:"Absolutní zisk",value:fmt(portfolio.totalCurrentCZK-netCash,"CZK",0),accent:portfolio.totalCurrentCZK>=netCash?"#10b981":"#ef4444"},
                    ].map((s,i)=>(
                      <div key={i} style={S.statCard(s.accent)}>
                        <div style={S.label}>{s.label}</div>
                        <div style={{fontSize:17,fontWeight:700,color:s.accent}}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={S.card}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
                      <div style={S.sectionTitle}>Historie vkladů a výběrů</div>
                      <button style={S.btn("primary")} onClick={()=>{ setNewTx(p=>({...p,type:"deposit"})); setShowAddTx(true); }}>+ Přidat vklad/výběr</button>
                    </div>
                    {flows.length===0 ? (
                      <div style={{color:"#475569",fontSize:12,padding:20,textAlign:"center"}}>
                        Zatím žádné vklady ani výběry.<br/>
                        <button style={{...S.btn("primary"),marginTop:12}} onClick={()=>{setNewTx(p=>({...p,type:"deposit"}));setShowAddTx(true);}}>+ Přidat první vklad</button>
                      </div>
                    ) : (
                      <table style={S.table}>
                        <thead><tr>{["Datum","Typ","Částka","Měna","Částka CZK","Poplatek","Poznámka",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                        <tbody>
                          {[...flows].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t=>(
                            <tr key={t.id}>
                              <td style={S.td}>{fmtDate(t.date)}</td>
                              <td style={S.td}>
                                <span style={{...S.badge(t.type==="deposit"?"#10b981":"#ef4444")}}>
                                  {t.type==="deposit"?"💰 Vklad":"💸 Výběr"}
                                </span>
                              </td>
                              <td style={{...S.td,fontWeight:600,color:t.type==="deposit"?"#10b981":"#ef4444"}}>
                                {t.type==="deposit"?"+":"-"}{(t.amount||0).toLocaleString("cs-CZ")}
                              </td>
                              <td style={S.td}>{t.currency}</td>
                              <td style={{...S.td,fontWeight:600}}>{fmt(toCZK(t.amount||0,t.currency,rates),"CZK",0)}</td>
                              <td style={S.td}>{t.fee?fmt(t.fee,t.currency,2):"–"}</td>
                              <td style={{...S.td,color:"#64748b"}}>{t.notes||"–"}</td>
                              <td style={S.td}><button style={{...S.btn("danger"),padding:"3px 8px"}} onClick={()=>setTransactions(prev=>prev.filter(x=>x.id!==t.id))}>✕</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div style={S.card}>
                    <div style={S.sectionTitle}>Vývoj čistého vkladu vs. hodnota portfolia</div>
                    {(() => {
                      const allTx = [...activeTransactions].sort((a,b)=>new Date(a.date)-new Date(b.date));
                      if(!allTx.length) return <div style={{color:"#475569",fontSize:12}}>Žádná data</div>;
                      const months=[];
                      const first=new Date(allTx[0].date);
                      const now=new Date();
                      let cur=new Date(first.getFullYear(),first.getMonth(),1);
                      while(cur<=now){
                        const txSoFar=allTx.filter(t=>new Date(t.date)<=cur);
                        let dep=0,wit=0,inv=0;
                        const h={};
                        txSoFar.forEach(t=>{
                          if(t.type==="deposit") dep+=toCZK(t.amount||0,t.currency,rates);
                          else if(t.type==="withdraw") wit+=toCZK(t.amount||0,t.currency,rates);
                          else if(t.type==="buy"){inv+=toCZK(t.quantity*t.price+(t.fee||0),t.currency,rates);h[t.ticker]=(h[t.ticker]||0)+t.quantity;}
                          else if(t.type==="sell"&&h[t.ticker]) h[t.ticker]-=t.quantity;
                        });
                        let portVal=0;
                        Object.entries(h).forEach(([tk,qty])=>{const p=prices[tk];if(p)portVal+=toCZK(qty*p.price,p.currency,rates);});
                        months.push({label:`${cur.getMonth()+1}/${String(cur.getFullYear()).slice(2)}`,net:dep-wit,inv,portVal});
                        cur=new Date(cur.getFullYear(),cur.getMonth()+1,1);
                      }
                      if(months.length<2) return null;
                      const maxV=Math.max(...months.map(m=>Math.max(m.net,m.portVal)),1);
                      const w=560,h2=140,pad={t:8,b:24,l:56,r:8};
                      const iW=w-pad.l-pad.r,iH=h2-pad.t-pad.b;
                      const xS=(i)=>pad.l+(i/(months.length-1))*iW;
                      const yS=(v)=>pad.t+iH-(v/maxV)*iH;
                      const step=Math.max(1,Math.floor(months.length/8));
                      const netPath=months.map((m,i)=>`${i===0?"M":"L"}${xS(i)},${yS(m.net)}`).join(" ");
                      const portPath=months.map((m,i)=>`${i===0?"M":"L"}${xS(i)},${yS(m.portVal)}`).join(" ");
                      return(
                        <div style={{overflowX:"auto"}}>
                          <svg viewBox={`0 0 ${w} ${h2}`} style={{width:"100%",minWidth:300,height:"auto"}}>
                            <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity="0.15"/><stop offset="100%" stopColor="#10b981" stopOpacity="0"/></linearGradient></defs>
                            {[0,.25,.5,.75,1].map(t=>(
                              <g key={t}>
                                <line x1={pad.l} y1={pad.t+iH*t} x2={w-pad.r} y2={pad.t+iH*t} stroke="#1e293b" strokeWidth="1"/>
                                <text x={pad.l-4} y={pad.t+iH*t+4} textAnchor="end" fill="#475569" fontSize="8">{(maxV*(1-t)/1000).toFixed(0)}k</text>
                              </g>
                            ))}
                            {months.filter((_,i)=>i%step===0).map((m,i)=>(
                              <text key={i} x={xS(months.findIndex(x=>x===m))} y={h2-4} textAnchor="middle" fill="#475569" fontSize="8">{m.label}</text>
                            ))}
                            <path d={netPath+` L${xS(months.length-1)},${yS(0)} L${xS(0)},${yS(0)} Z`} fill="url(#cg)"/>
                            <path d={netPath} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4,3"/>
                            <path d={portPath} fill="none" stroke="#6366f1" strokeWidth="2"/>
                          </svg>
                          <div style={{display:"flex",gap:16,marginTop:6,fontSize:10,color:"#94a3b8"}}>
                            <span><span style={{color:"#6366f1"}}>──</span> Hodnota portfolia</span>
                            <span><span style={{color:"#10b981"}}>- -</span> Čistý vklad</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </>
              );
            })()}
          </>
        )}

        {tab === "dividendy" && (
          <>
            <div style={{ fontSize:16, fontWeight:700, color:"#f1f5f9", marginBottom:14 }}>📅 Dividendový kalendář</div>
            {(() => {
              const now = new Date();
              const selYear = now.getFullYear();
              const MONTHS_CS = ["Leden","Únor","Březen","Duben","Květen","Červen","Červenec","Srpen","Září","Říjen","Listopad","Prosinec"];
              // Build monthly dividend data
              const monthlyData = Array.from({length:12},(_,mi)=>{
                const received = activeTransactions.filter(t=>t.type==="dividend"&&new Date(t.date).getFullYear()===selYear&&new Date(t.date).getMonth()===mi)
                  .reduce((s,t)=>s+toCZK(t.dividendAmount||0,t.currency,rates),0);
                const upcoming = dividends.filter(d=>new Date(d.date).getFullYear()===selYear&&new Date(d.date).getMonth()===mi)
                  .reduce((s,d)=>{
                    const pos=portfolio.positions.find(p=>p.ticker===d.ticker);
                    return s+(pos&&d.perShare?toCZK(d.amount*pos.totalQty,d.currency,rates):0);
                  },0);
                return {month:mi,label:MONTHS_CS[mi],received,upcoming,total:received+upcoming};
              });
              const totalReceived=monthlyData.reduce((s,m)=>s+m.received,0);
              const totalUpcoming=monthlyData.reduce((s,m)=>s+m.upcoming,0);
              const maxMonth=Math.max(...monthlyData.map(m=>m.total),1);
              const annualEst=dividends.reduce((s,d)=>{const pos=portfolio.positions.find(p=>p.ticker===d.ticker);return s+(pos&&d.perShare?toCZK(d.amount*pos.totalQty*4,d.currency,rates):0);},0);
              return (
                <>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(148px,1fr))",gap:12,marginBottom:16}}>
                    {[
                      {label:"Přijato "+selYear,value:fmt(totalReceived,"CZK",0),accent:"#10b981"},
                      {label:"Očekáváno do konce roku",value:fmt(totalUpcoming,"CZK",0),accent:"#6366f1"},
                      {label:"Celkem "+selYear,value:fmt(totalReceived+totalUpcoming,"CZK",0),accent:"#8b5cf6"},
                      {label:"Roční odhad (4× kv.)",value:fmt(annualEst,"CZK",0),accent:"#f59e0b"},
                    ].map((s,i)=>(
                      <div key={i} style={S.statCard(s.accent)}>
                        <div style={S.label}>{s.label}</div>
                        <div style={{fontSize:17,fontWeight:700,color:s.accent}}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* MONTHLY CALENDAR GRID */}
                  <div style={S.card}>
                    <div style={S.sectionTitle}>Měsíční přehled {selYear}</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))",gap:10,marginBottom:16}}>
                      {monthlyData.map(m=>{
                        const isCurrentMonth=m.month===now.getMonth()&&selYear===now.getFullYear();
                        const isPast=new Date(selYear,m.month+1,1)<=now;
                        const hasDivs=dividends.filter(d=>new Date(d.date).getMonth()===m.month&&new Date(d.date).getFullYear()===selYear);
                        return(
                          <div key={m.month} style={{background:isCurrentMonth?"#1e2d4a":"#0a0f1e",border:`1px solid ${isCurrentMonth?"#6366f1":"#1e293b"}`,borderRadius:8,padding:12}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                              <div style={{fontSize:11,fontWeight:700,color:isCurrentMonth?"#6366f1":"#94a3b8"}}>{m.label}</div>
                              {isPast&&m.month<now.getMonth()?(
                                <span style={{fontSize:9,color:"#10b981",background:"#10b98111",padding:"1px 6px",borderRadius:10}}>✓ přijato</span>
                              ):m.upcoming>0?(
                                <span style={{fontSize:9,color:"#f59e0b",background:"#f59e0b11",padding:"1px 6px",borderRadius:10}}>očekáváno</span>
                              ):null}
                            </div>
                            {/* Bar */}
                            <div style={{height:4,background:"#1e293b",borderRadius:2,marginBottom:8,overflow:"hidden"}}>
                              <div style={{height:"100%",width:`${(m.total/maxMonth)*100}%`,background:m.received>0?"linear-gradient(90deg,#059669,#10b981)":"linear-gradient(90deg,#4338ca,#6366f1)",borderRadius:2}}/>
                            </div>
                            {m.received>0&&<div style={{fontSize:11,color:"#10b981",fontWeight:600}}>{fmt(m.received,"CZK",0)}</div>}
                            {m.upcoming>0&&<div style={{fontSize:11,color:"#6366f1"}}>{fmt(m.upcoming,"CZK",0)} <span style={{fontSize:9,color:"#475569"}}>oček.</span></div>}
                            {m.total===0&&<div style={{fontSize:10,color:"#334155"}}>–</div>}
                            {hasDivs.map((d,i)=>(
                              <div key={i} style={{fontSize:9,color:"#475569",marginTop:4}}>{d.ticker} · {fmtDate(d.date)}</div>
                            ))}
                          </div>
                        );
                      })}
                    </div>

                    {/* Bar chart */}
                    <div style={S.sectionTitle}>Graf dividendového příjmu</div>
                    <div style={{display:"flex",gap:4,alignItems:"flex-end",height:100,padding:"0 4px"}}>
                      {monthlyData.map(m=>{
                        const isCurrentMonth=m.month===now.getMonth();
                        const recH=maxMonth>0?(m.received/maxMonth)*90:0;
                        const upH=maxMonth>0?(m.upcoming/maxMonth)*90:0;
                        return(
                          <div key={m.month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                            <div style={{width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:90,gap:1}}>
                              {upH>0&&<div style={{width:"100%",height:upH,background:"#4338ca44",borderRadius:"2px 2px 0 0",border:"1px solid #6366f133"}}/>}
                              {recH>0&&<div style={{width:"100%",height:recH,background:isCurrentMonth?"#059669":"#10b98177",borderRadius:upH>0?"0":"2px 2px 0 0"}}/>}
                              {recH===0&&upH===0&&<div style={{width:"100%",height:3,background:"#1e293b",borderRadius:2,marginTop:"auto"}}/>}
                            </div>
                            <div style={{fontSize:7,color:isCurrentMonth?"#6366f1":"#334155",textAlign:"center"}}>{m.label.slice(0,3)}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{display:"flex",gap:16,marginTop:8,fontSize:10,color:"#94a3b8"}}>
                      <span><span style={{color:"#10b981"}}>█</span> Přijato</span>
                      <span><span style={{color:"#4338ca44",border:"1px solid #6366f133",display:"inline-block",width:10,height:10}}></span> Očekáváno</span>
                    </div>
                  </div>

                  {/* AUTO-DIVIDEND SUGGESTIONS */}
                  {(() => {
                    const tickers = [...new Set(activeTransactions.filter(t=>t.type==="dividend").map(t=>t.ticker))];
                    const suggestions = tickers.map(t=>suggestDividends(t,portfolio.positions)).filter(Boolean);
                    if(!suggestions.length) return null;
                    return (
                      <div style={S.card}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                          <div style={S.sectionTitle}>🤖 Automatické návrhy dividend</div>
                          <button style={{...S.btn("primary"),padding:"5px 12px",fontSize:10}} onClick={()=>{
                            suggestions.forEach(s=>{
                              const exists=dividends.some(d=>d.ticker===s.ticker&&d.date===s.date);
                              if(!exists) setDividends(prev=>[...prev,s]);
                            });
                          }}>Přidat všechny návrhy</button>
                        </div>
                        <div style={{fontSize:10,color:"#475569",marginBottom:12}}>Na základě historického vzoru plateb — zkontroluj a uprav před potvrzením.</div>
                        {suggestions.map((s,i)=>{
                          const pos=portfolio.positions.find(p=>p.ticker===s.ticker);
                          const est=pos&&s.perShare?toCZK(s.amount*pos.totalQty,s.currency,rates):null;
                          const alreadyAdded=dividends.some(d=>d.ticker===s.ticker&&d.date===s.date);
                          return(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#0a0f1e",borderRadius:6,marginBottom:6,border:"1px solid #1e293b",opacity:alreadyAdded?0.5:1}}>
                              <span style={{...S.badge("#f59e0b"),flexShrink:0}}>{s.ticker}</span>
                              <span style={{fontSize:11,color:"#94a3b8",flex:1}}>oček. {fmtDate(s.date)} · {s.amount} {s.currency}/ks</span>
                              {est&&<span style={{fontSize:11,color:"#8b5cf6",fontWeight:600}}>{fmt(est,"CZK",0)}</span>}
                              {alreadyAdded
                                ? <span style={{fontSize:10,color:"#10b981"}}>✓ přidáno</span>
                                : <button style={{...S.btn("primary"),padding:"3px 10px",fontSize:10}} onClick={()=>setDividends(prev=>[...prev,s])}>+ Přidat</button>
                              }
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Upcoming dividends table */}
                  <div style={S.card}>
                    <div style={S.sectionTitle}>Nadcházející výplaty</div>
                    <table style={S.table}>
                      <thead><tr>{["Ticker","Datum","Dividenda/ks","Vaše ks","Odhadovaná výplata CZK",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {dividends.sort((a,b)=>new Date(a.date)-new Date(b.date)).map((d,i)=>{
                          const pos=portfolio.positions.find(p=>p.ticker===d.ticker);
                          const totalEst=pos&&d.perShare?toCZK(d.amount*pos.totalQty,d.currency,rates):null;
                          return(
                            <tr key={i}>
                              <td style={{...S.td,fontWeight:600,color:"#f1f5f9"}}>{d.ticker}</td>
                              <td style={S.td}>{fmtDate(d.date)}</td>
                              <td style={{...S.td,color:"#8b5cf6"}}>{d.amount} {d.currency}</td>
                              <td style={S.td}>{pos?pos.totalQty.toFixed(2):"–"}</td>
                              <td style={{...S.td,fontWeight:600,color:"#8b5cf6"}}>{totalEst?fmt(totalEst,"CZK",0):"–"}</td>
                              <td style={S.td}><button style={{...S.btn("danger"),padding:"3px 8px"}} onClick={()=>setDividends(prev=>prev.filter((_,j)=>j!==i))}>✕</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{marginTop:14,display:"flex",gap:8,flexWrap:"wrap"}}>
                      {[{label:"Ticker",id:"div_t",ph:"AAPL",type:"text"},{label:"Datum",id:"div_d",ph:"",type:"date"},{label:"Částka/ks",id:"div_a",ph:"0.25",type:"number"},{label:"Měna",id:"div_c",ph:"",type:"select",opts:["USD","EUR","CZK"]}].map(f=>(
                        <div key={f.id} style={{flex:1,minWidth:90}}>
                          <div style={{fontSize:10,color:"#475569",marginBottom:4}}>{f.label}</div>
                          {f.type==="select"?<select id={f.id} style={S.select}>{f.opts.map(o=><option key={o}>{o}</option>)}</select>:<input id={f.id} type={f.type} placeholder={f.ph} style={S.input}/>}
                        </div>
                      ))}
                      <div style={{display:"flex",alignItems:"flex-end"}}>
                        <button style={S.btn("primary")} onClick={()=>{
                          const t=document.getElementById("div_t").value,d=document.getElementById("div_d").value,a=parseFloat(document.getElementById("div_a").value),c=document.getElementById("div_c").value;
                          if(!t||!d||isNaN(a)) return;
                          setDividends(prev=>[...prev,{id:`div${Date.now()}`,ticker:t.toUpperCase(),date:d,amount:a,perShare:true,currency:c}]);
                        }}>Přidat</button>
                      </div>
                    </div>
                  </div>

                  {/* Earnings */}
                  <div style={S.card}>
                    <div style={S.sectionTitle}>📊 Earnings kalendář</div>
                    <table style={S.table}>
                      <thead><tr>{["Ticker","Datum","Čas","Odhad EPS",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {earnings.sort((a,b)=>new Date(a.date)-new Date(b.date)).map((e,i)=>(
                          <tr key={i}>
                            <td style={{...S.td,fontWeight:600}}>{e.ticker}</td>
                            <td style={S.td}>{fmtDate(e.date)}</td>
                            <td style={S.td}>{e.time==="after-close"?"Po zavření":"Před otevřením"}</td>
                            <td style={{...S.td,color:"#f59e0b"}}>{e.estimate}</td>
                            <td style={S.td}><button style={{...S.btn("danger"),padding:"3px 8px"}} onClick={()=>setEarnings(prev=>prev.filter((_,j)=>j!==i))}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap"}}>
                      {[{label:"Ticker",id:"e_t",ph:"MSFT",type:"text"},{label:"Datum",id:"e_d",ph:"",type:"date"},{label:"Odhad EPS",id:"e_e",ph:"1.42 EPS",type:"text"}].map(f=>(
                        <div key={f.id} style={{flex:1,minWidth:100}}>
                          <div style={{fontSize:10,color:"#475569",marginBottom:4}}>{f.label}</div>
                          <input id={f.id} type={f.type} placeholder={f.ph} style={S.input}/>
                        </div>
                      ))}
                      <div style={{display:"flex",alignItems:"flex-end"}}>
                        <button style={S.btn("primary")} onClick={()=>{
                          const t=document.getElementById("e_t").value,d=document.getElementById("e_d").value,e=document.getElementById("e_e").value;
                          if(!t||!d) return;
                          setEarnings(prev=>[...prev,{ticker:t.toUpperCase(),date:d,time:"after-close",estimate:e}]);
                        }}>Přidat</button>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </>
        )}

        {/* ─── NOVINKY ────────────────────────────────────────────────────── */}
        {tab === "novinky" && <NewsTab portfolio={portfolio} S={S} />}

        {/* ─── ANALÝZA ───────────────────────────────────────────────────── */}
        {tab === "analyza" && (
          <AnalyzaTab rates={rates} S={S} />
        )}

        {/* ─── FI ────────────────────────────────────────────────────────── */}
        {tab === "fi" && (
          <>
            <div style={{ fontSize:16, fontWeight:700, color:"#f1f5f9", marginBottom:14 }}>🎯 Kalkulačka finanční nezávislosti</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div>
                <div style={S.card}>
                  <div style={S.sectionTitle}>Parametry FI</div>
                  {[
                    { label:"Měsíční výdaje (CZK)", key:"monthlyExpenses", step:"100" },
                    { label:"Měsíční investice (CZK)", key:"monthlySaving", step:"100" },
                    { label:"Očekávaný roční výnos (%)", key:"annualReturn", step:"0.1" },
                    { label:"Bezpečná míra výběru / SWR (%)", key:"safeWithdrawalRate", step:"0.1" },
                  ].map(f => (
                    <div key={f.key} style={{ marginBottom:12 }}>
                      <div style={{ fontSize:11, color:"#475569", marginBottom:5 }}>{f.label}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <input type="number" step={f.step} value={fiSettings[f.key]||""} onChange={e=>setFiSettings(prev=>({...prev,[f.key]:parseFloat(e.target.value)||0}))} style={S.input}/>
                        {f.key==="annualReturn" && <div style={{ fontSize:10, color:"#475569", whiteSpace:"nowrap" }}>def. 7%</div>}
                        {f.key==="safeWithdrawalRate" && <div style={{ fontSize:10, color:"#475569", whiteSpace:"nowrap" }}>def. 4%</div>}
                      </div>
                    </div>
                  ))}
                  <div style={{ padding:14, background:"#0a0f1e", borderRadius:7, marginTop:4 }}>
                    {[
                      { label:"FI číslo (cíl):", value:fmt(fiCalc.target,"CZK",0), color:"#f1f5f9" },
                      { label:"Aktuální portfolio:", value:fmt(fiCalc.currentCZK,"CZK",0), color:"#6366f1" },
                      { label:"Zbývá:", value:fmt(Math.max(0,fiCalc.target-fiCalc.currentCZK),"CZK",0), color:"#ef4444" },
                      { label:"Pasivní příjem nyní:", value:`${fmt(fiCalc.passiveMonthly,"CZK",0)}/měs.`, color:"#10b981" },
                    ].map((r,i) => (
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #1e293b", fontSize:12 }}>
                        <span style={{ color:"#475569" }}>{r.label}</span>
                        <span style={{ color:r.color, fontWeight:700 }}>{r.value}</span>
                      </div>
                    ))}
                    {fiCalc.monthsLeft !== null && (
                      <div style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", fontSize:12 }}>
                        <span style={{ color:"#475569" }}>Odhadovaný čas ({fiSettings.annualReturn}% p.a.):</span>
                        <span style={{ color:"#10b981", fontWeight:700 }}>~{Math.floor(fiCalc.monthsLeft/12)} let {fiCalc.monthsLeft%12} měs.</span>
                      </div>
                    )}
                  </div>
                </div>
                {/* Projection table */}
                <div style={S.card}>
                  <div style={S.sectionTitle}>Projekce portfolia</div>
                  {[1,3,5,10,15,20,25,30].map(years => {
                    const r = (fiSettings.annualReturn||7)/100;
                    const m = fiSettings.monthlySaving||0;
                    const pv = fiCalc.currentCZK * Math.pow(1+r, years) + m*12 * ((Math.pow(1+r,years)-1)/r);
                    return (
                      <div key={years} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #0f172a", fontSize:11 }}>
                        <span style={{ color:"#94a3b8" }}>Za {years} let ({new Date().getFullYear()+years}):</span>
                        <span style={{ color:pv>=fiCalc.target?"#10b981":"#f1f5f9", fontWeight:600 }}>
                          {fmt(pv,"CZK",0)}{pv>=fiCalc.target?" ✓ FI!":""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <div style={S.card}>
                  <div style={S.sectionTitle}>FI Progress</div>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
                    <FIGauge pct={fiCalc.pct}/>
                  </div>
                  <div style={{ height:6, background:"#1e293b", borderRadius:3, overflow:"hidden", marginBottom:6 }}>
                    <div style={{ height:"100%", width:`${Math.min(100,fiCalc.pct)}%`, background:"linear-gradient(90deg,#ef4444,#f59e0b,#10b981)", transition:"width 0.8s" }}/>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:"#475569", marginBottom:16 }}>
                    <span>0</span><span>{fmt(fiCalc.target,"CZK",0)}</span>
                  </div>
                  <div style={S.sectionTitle}>Graf projekce portfolia</div>
                  <FIProjectionChart
                    currentCZK={fiCalc.currentCZK}
                    monthlySaving={fiSettings.monthlySaving||0}
                    annualReturn={fiSettings.annualReturn||7}
                    targetCZK={fiCalc.target}
                  />
                </div>
                {/* SWR sensitivity */}
                <div style={S.card}>
                  <div style={S.sectionTitle}>Citlivostní analýza SWR</div>
                  {[3,3.5,4,4.5,5].map(swr => {
                    const t2 = (fiSettings.monthlyExpenses*12)/(swr/100);
                    return (
                      <div key={swr} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #0f172a", fontSize:11 }}>
                        <span style={{ color:swr===fiSettings.safeWithdrawalRate?"#6366f1":"#94a3b8", fontWeight:swr===fiSettings.safeWithdrawalRate?700:400 }}>SWR {swr}%{swr===fiSettings.safeWithdrawalRate?" ◄":""}</span>
                        <span style={{ color:"#f1f5f9" }}>Cíl: {fmt(t2,"CZK",0)}</span>
                        <span style={{ color:(fiCalc.currentCZK/t2*100)>=100?"#10b981":"#94a3b8" }}>{(fiCalc.currentCZK/t2*100).toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ─── NASTAVENÍ ─────────────────────────────────────────────────── */}
        {tab === "nastaveni" && (
          <>
            <div style={{ fontSize:16, fontWeight:700, color:"#f1f5f9", marginBottom:14 }}>Nastavení</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              <div style={S.card}>
                <div style={S.sectionTitle}>☁ Supabase sync</div>
              <div style={{ padding:"12px 14px", background:"#0a0f1e", borderRadius:7, marginBottom:14, border:"1px solid #1e293b" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <div style={{ fontSize:12, color:"#f1f5f9", fontWeight:600 }}>Stav synchronizace</div>
                  <span style={{ fontSize:11, padding:"3px 10px", borderRadius:10,
                    background: syncStatus==="ok"?"#10b98122":syncStatus==="syncing"?"#f59e0b22":syncStatus==="error"?"#ef444422":"#1e293b",
                    color: syncStatus==="ok"?"#10b981":syncStatus==="syncing"?"#f59e0b":syncStatus==="error"?"#ef4444":"#475569", fontWeight:600 }}>
                    {syncStatus==="ok"?"☁ Synchronizováno":syncStatus==="syncing"?"↻ Ukládám...":syncStatus==="error"?"⚠ Chyba připojení":"💾 Pouze lokálně"}
                  </span>
                </div>
                {!supabase ? (
                  <div style={{ fontSize:11, color:"#64748b", lineHeight:1.7 }}>
                    Supabase není nakonfigurován. Data se ukládají pouze lokálně v tomto prohlížeči.<br/>
                    Pro synchronizaci mezi zařízeními přidej do souboru <code style={{color:"#6366f1"}}>.env</code>:<br/>
                    <code style={{color:"#10b981",fontSize:10}}>VITE_SUPABASE_URL=https://xxx.supabase.co</code><br/>
                    <code style={{color:"#10b981",fontSize:10}}>VITE_SUPABASE_KEY=tvuj-anon-klic</code>
                  </div>
                ) : (
                  <div style={{ fontSize:11, color:"#10b981" }}>
                    ✓ Supabase připojen — data se synchronizují mezi všemi zařízeními v reálném čase.
                  </div>
                )}
              </div>
              <div style={S.sectionTitle}>Kurzy měn</div>
                <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                  <button style={{ ...S.btn("primary"), flex:1 }} onClick={fetchRates}>
                    {ratesStatus==="loading"?"Načítám...":"↻ Aktualizovat kurzy online"}
                  </button>
                </div>
                {ratesStatus==="ok" && <div style={{ fontSize:11, color:"#10b981", marginBottom:10 }}>✓ Kurzy aktualizovány {rates.lastUpdated?fmtDate(rates.lastUpdated):""}</div>}
                {ratesStatus==="error" && <div style={{ fontSize:11, color:"#ef4444", marginBottom:10 }}>⚠ Nepodařilo se načíst kurzy – zadej ručně</div>}
                {[{label:"USD → CZK",key:"USD_CZK"},{label:"EUR → CZK",key:"EUR_CZK"}].map(f => (
                  <div key={f.key} style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, color:"#475569", marginBottom:5 }}>{f.label}</div>
                    <input type="number" step="0.01" value={rates[f.key]} onChange={e=>setRates(prev=>({...prev,[f.key]:parseFloat(e.target.value)}))} style={S.input}/>
                  </div>
                ))}
                <div style={{ fontSize:10, color:"#475569", marginTop:6 }}>Kurzy se automaticky aktualizují každé 4 hodiny.</div>
              </div>
              <div style={S.card}>
                <div style={S.sectionTitle}>Ruční update cen</div>
                {Object.entries(prices).map(([ticker, data]) => (
                  <div key={ticker} style={{ display:"flex", gap:6, alignItems:"center", marginBottom:8 }}>
                    <div style={{ width:54, fontSize:12, fontWeight:600, color:"#f1f5f9" }}>{ticker}</div>
                    <input type="number" step="0.01" value={data.price} onChange={e=>setPrices(prev=>({...prev,[ticker]:{...prev[ticker],price:parseFloat(e.target.value)||0}}))} style={{ ...S.input, width:100 }}/>
                    <span style={{ fontSize:11, color:"#475569", width:32 }}>{data.currency}</span>
                    <input type="number" step="0.01" value={data.change1d} onChange={e=>setPrices(prev=>({...prev,[ticker]:{...prev[ticker],change1d:parseFloat(e.target.value)||0}}))} style={{ ...S.input, width:65 }} placeholder="1D%"/>
                  </div>
                ))}
                <div style={{ marginTop:10, display:"flex", gap:6, flexWrap:"wrap" }}>
                  <div style={{ flex:1 }}><div style={{ fontSize:10, color:"#475569", marginBottom:4 }}>Ticker</div><input id="nt" type="text" placeholder="NVDA" style={S.input}/></div>
                  <div style={{ flex:1 }}><div style={{ fontSize:10, color:"#475569", marginBottom:4 }}>Měna</div><select id="nc" style={S.select}>{["USD","EUR","CZK"].map(o=><option key={o}>{o}</option>)}</select></div>
                  <div style={{ display:"flex", alignItems:"flex-end" }}>
                    <button style={S.btn("primary")} onClick={() => {
                      const t=document.getElementById("nt").value.toUpperCase(), c=document.getElementById("nc").value;
                      if(!t) return;
                      setPrices(prev=>({...prev,[t]:{price:0,currency:c,change1d:0}}));
                    }}>+ Ticker</button>
                  </div>
                </div>
              </div>
            </div>
            <div style={S.card}>
              <div style={S.sectionTitle}>Záloha a reset</div>
              <div style={{ fontSize:11, color:"#475569", marginBottom:12 }}>
                Data se automaticky ukládají do localStorage i do Supabase cloudu (pokud je nakonfigurován). Sync indikátor ☁ je v pravém horním rohu. Pro ruční zálohu použij export JSON.
              </div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                <button style={S.btn("outline")} onClick={() => {
                  const data = JSON.stringify({transactions,prices,rates,dividends,earnings,fiSettings},null,2);
                  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([data],{type:"application/json"})); a.download="investtrack-backup.json"; a.click();
                }}>📤 Exportovat zálohu JSON</button>
                <button style={S.btn("outline")} onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file"; input.accept = ".json";
                  input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      try {
                        const d = JSON.parse(ev.target.result);
                        if (d.transactions) setTransactions(d.transactions);
                        if (d.prices) setPrices(d.prices);
                        if (d.rates) setRates(d.rates);
                        if (d.dividends) setDividends(d.dividends);
                        if (d.earnings) setEarnings(d.earnings);
                        if (d.fiSettings) setFiSettings(d.fiSettings);
                        alert("✅ Záloha úspěšně obnovena!");
                      } catch { alert("❌ Chyba při načítání souboru."); }
                    };
                    reader.readAsText(file);
                  };
                  input.click();
                }}>📥 Importovat zálohu JSON</button>
                <button style={{ ...S.btn("danger"), border:"1px solid #dc2626" }} onClick={() => setShowDeleteAll(true)}>🗑 Smazat transakce</button>
                <button style={{ ...S.btn("danger"), border:"1px solid #dc2626" }} onClick={() => {
                  if(window.confirm("Opravdu resetovat VEŠKERÁ data včetně portfolií? Tato akce je nevratná.")) {
                    setTransactions([]);
                    setPortfolios(DEFAULT_PORTFOLIOS);
                    setActivePortfolioId("p1");
                    setDividends([]);
                    setEarnings([]);
                    localStorage.clear();
                  }
                }}>⚠ Reset všeho</button>
              </div>
            </div>
          </>
        )}
      </main>


      {/* ─── PORTFOLIO MANAGER MODAL ─────────────────────────────────────────── */}
      {showPortfolioMgr && (
        <div style={S.modal} onClick={e=>e.target===e.currentTarget&&setShowPortfolioMgr(false)}>
          <div style={{...S.modalBox, maxWidth:480}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>📁 Správa portfolií</div>
              <button style={{...S.btn("outline"),padding:"4px 10px"}} onClick={()=>setShowPortfolioMgr(false)}>✕</button>
            </div>
            {portfolios.map(p => (
              <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#0a0f1e",borderRadius:7,marginBottom:8,border:`1px solid ${activePortfolioId===p.id?p.color+"44":"#1e293b"}`}}>
                <div style={{width:12,height:12,borderRadius:"50%",background:p.color,flexShrink:0}}/>
                {editingPortfolioId===p.id ? (
                  <input autoFocus defaultValue={p.name} id={`pname_${p.id}`}
                    style={{...S.input,flex:1,padding:"4px 8px",fontSize:12}}
                    onKeyDown={e=>{if(e.key==="Enter"){setPortfolios(prev=>prev.map(x=>x.id===p.id?{...x,name:e.target.value}:x));setEditingPortfolioId(null);}if(e.key==="Escape")setEditingPortfolioId(null);}}/>
                ) : (
                  <span style={{flex:1,fontSize:12,color:activePortfolioId===p.id?"#f1f5f9":"#94a3b8",fontWeight:activePortfolioId===p.id?600:400}}>{p.name}</span>
                )}
                <span style={{fontSize:10,color:"#475569"}}>{transactions.filter(t=>t.portfolioId===p.id).length} tx</span>
                <button style={{...S.btn("outline"),padding:"3px 8px",fontSize:10}} onClick={()=>setActivePortfolioId(p.id)&&setShowPortfolioMgr(false)}>
                  {activePortfolioId===p.id?"✓ Aktivní":"Přepnout"}
                </button>
                <button style={{...S.btn("outline"),padding:"3px 8px",fontSize:10}} onClick={()=>setEditingPortfolioId(p.id)} title="Přejmenovat">✏</button>
                {portfolios.length>1&&(
                  <button style={{...S.btn("danger"),padding:"3px 8px",fontSize:10}} title="Smazat portfolio"
                    onClick={()=>{if(window.confirm(`Smazat portfolio "${p.name}" a všechny jeho transakce?`)){setTransactions(prev=>prev.filter(t=>t.portfolioId!==p.id));setPortfolios(prev=>prev.filter(x=>x.id!==p.id));if(activePortfolioId===p.id)setActivePortfolioId(portfolios.find(x=>x.id!==p.id)?.id);}}}
                  >🗑</button>
                )}
              </div>
            ))}
            <div style={{marginTop:16,padding:"14px",background:"#0a0f1e",borderRadius:7,border:"1px dashed #334155"}}>
              <div style={{fontSize:11,color:"#475569",marginBottom:10}}>Nové portfolio</div>
              <div style={{display:"flex",gap:8}}>
                <input id="new_pname" placeholder="Název portfolia" style={{...S.input,flex:1}}/>
                <select id="new_pcolor" style={{...S.select,width:100}}>
                  {["#6366f1","#10b981","#f59e0b","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"].map(c=>(
                    <option key={c} value={c} style={{background:c}}>{"● "+c}</option>
                  ))}
                </select>
                <button style={S.btn("primary")} onClick={()=>{
                  const name=document.getElementById("new_pname").value.trim();
                  const color=document.getElementById("new_pcolor").value;
                  if(!name)return;
                  const id="p"+Date.now();
                  setPortfolios(prev=>[...prev,{id,name,color,created:new Date().toISOString().slice(0,10)}]);
                  setActivePortfolioId(id);
                  document.getElementById("new_pname").value="";
                }}>+ Přidat</button>
              </div>
            </div>
            <div style={{marginTop:14,fontSize:10,color:"#334155",lineHeight:1.6}}>
              💡 Každé portfolio má vlastní transakce, dividendy a výpočty. Kurzy a ceny jsou sdílené.
            </div>
          </div>
        </div>
      )}

      {/* ─── DELETE ALL MODAL ─────────────────────────────────────────────────── */}
      {showDeleteAll && (
        <div style={S.modal} onClick={e=>e.target===e.currentTarget&&setShowDeleteAll(false)}>
          <div style={{...S.modalBox,maxWidth:420}}>
            <div style={{fontSize:14,fontWeight:700,color:"#ef4444",marginBottom:12}}>🗑 Smazat transakce</div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:20,lineHeight:1.7}}>
              Vyberte co chcete smazat z portfolia <b style={{color:"#f1f5f9"}}>{portfolios.find(p=>p.id===activePortfolioId)?.name}</b>:
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[
                {label:"Smazat pouze nákupy a prodeje",types:["buy","sell"],color:"#f59e0b"},
                {label:"Smazat pouze dividendy",types:["dividend"],color:"#8b5cf6"},
                {label:"Smazat pouze vklady a výběry",types:["deposit","withdraw"],color:"#10b981"},
                {label:"Smazat VŠECHNY transakce tohoto portfolia",types:["buy","sell","dividend","deposit","withdraw"],color:"#ef4444"},
              ].map((opt,i)=>(
                <button key={i} style={{...S.btn(i===3?"danger":"outline"),padding:"10px 14px",textAlign:"left",border:i===3?"1px solid #dc2626":"1px solid #334155"}}
                  onClick={()=>{
                    if(window.confirm(`Opravdu smazat: "${opt.label}"? Tato akce je nevratná.`)){
                      setTransactions(prev=>prev.filter(t=>t.portfolioId!==activePortfolioId||!opt.types.includes(t.type)));
                      setShowDeleteAll(false);
                    }
                  }}>
                  {opt.label}
                  <div style={{fontSize:10,color:"#475569",marginTop:2}}>
                    {activeTransactions.filter(t=>opt.types.includes(t.type)).length} záznamů
                  </div>
                </button>
              ))}
            </div>
            <button style={{...S.btn("outline"),width:"100%",marginTop:12}} onClick={()=>setShowDeleteAll(false)}>Zrušit</button>
          </div>
        </div>
      )}

      {/* ─── MODAL CSV IMPORT ──────────────────────────────────────────────── */}
      {showCsvImport && (
        <CsvImportModal
          onClose={() => setShowCsvImport(false)}
          onImport={(newTxs) => {
            setTransactions(prev => [...prev, ...newTxs.map(t => ({...t, portfolioId: activePortfolioId}))]);
            setShowCsvImport(false);
          }}
          S={S}
        />
      )}

      {/* ─── MODAL ADD TX ─────────────────────────────────────────────────── */}
      {showAddTx && (
        <div style={S.modal} onClick={e=>e.target===e.currentTarget&&setShowAddTx(false)}>
          <div style={S.modalBox}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
              <div style={{ fontSize:14, fontWeight:700, color:"#f1f5f9" }}>Nová transakce</div>
              <button style={{ ...S.btn("outline"), padding:"4px 10px" }} onClick={()=>setShowAddTx(false)}>✕</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                {label:"Typ",key:"type",type:"select",opts:[["buy","Nákup"],["sell","Prodej"],["dividend","Dividenda"],["deposit","Vklad"],["withdraw","Výběr"]]},
                {label:"Kategorie",key:"category",type:"select",opts:[["stock","Akcie"],["etf","ETF"],["crypto","Crypto"]]},
                ...(newTx.type!=="deposit"&&newTx.type!=="withdraw"?[
                  {label:"Ticker",key:"ticker",type:"text",placeholder:"AAPL"},
                  {label:"Název",key:"name",type:"text",placeholder:"Apple Inc."},
                ]:[]),
                {label:"Datum",key:"date",type:"date"},
                {label:"Měna",key:"currency",type:"select",opts:[["USD","USD"],["EUR","EUR"],["CZK","CZK"]]},
                ...(newTx.type==="deposit"||newTx.type==="withdraw"?[
                  {label:"Částka",key:"amount",type:"number",placeholder:"10000"},
                  {label:"Poplatek",key:"fee",type:"number",placeholder:"0"},
                ]:newTx.type==="dividend"?[
                  {label:"Částka dividendy",key:"dividendAmount",type:"number",placeholder:"25.00"},
                ]:[
                  {label:"Množství",key:"quantity",type:"number",placeholder:"10"},
                  {label:"Cena/ks",key:"price",type:"number",placeholder:"150.00"},
                  {label:"Poplatek",key:"fee",type:"number",placeholder:"1.5"},
                ]),
                {label:"Poznámka",key:"notes",type:"text",placeholder:"Volitelné",span:true},
              ].map(f => (
                <div key={f.key} style={f.span?{gridColumn:"1/-1"}:{}}>
                  <div style={{ fontSize:11, color:"#475569", marginBottom:5 }}>{f.label}</div>
                  {f.type==="select"
                    ?<select value={newTx[f.key]} onChange={e=>setNewTx(p=>({...p,[f.key]:e.target.value}))} style={S.select}>{f.opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
                    :<input type={f.type} placeholder={f.placeholder} value={newTx[f.key]} onChange={e=>setNewTx(p=>({...p,[f.key]:e.target.value}))} style={S.input}/>}
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8, marginTop:18 }}>
              <button style={{ ...S.btn("primary"), flex:1, padding:"11px" }} onClick={addTransaction}>Přidat transakci</button>
              <button style={{ ...S.btn("outline"), padding:"11px 16px" }} onClick={()=>setShowAddTx(false)}>Zrušit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
