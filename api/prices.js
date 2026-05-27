// Vercel Serverless Function — Stock prices via multiple sources
export const config = { runtime: "nodejs" };

const KNOWN_NAMES = {
  "AAPL":"Apple Inc.", "MSFT":"Microsoft Corp.", "NVDA":"NVIDIA Corp.",
  "GOOGL":"Alphabet Inc.", "AMZN":"Amazon.com", "META":"Meta Platforms",
  "TSLA":"Tesla, Inc.", "INTC":"Intel Corp.", "UMC":"United Microelectronics",
  "KO":"Coca-Cola Co.", "JNJ":"Johnson & Johnson", "O":"Realty Income",
  "SPY":"SPDR S&P 500 ETF", "QQQ":"Invesco QQQ", "VWCE":"Vanguard All-World",
  "VTI":"Vanguard Total Stock", "CEZ":"ČEZ, a.s.", "MM0":"Moneta Money Bank",
  "FRA:TBK":"Philip Morris ČR", "RCL":"Royal Caribbean", "IRM":"Iron Mountain",
  "DAL":"Delta Air Lines", "AHT":"Ashford Hospitality", "BTC":"Bitcoin",
  "ETH":"Ethereum", "BTC-USD":"Bitcoin", "ETH-USD":"Ethereum",
  "JPM":"JPMorgan Chase", "BAC":"Bank of America", "WMT":"Walmart",
  "COST":"Costco", "HD":"Home Depot", "V":"Visa", "MA":"Mastercard",
  "NFLX":"Netflix", "DIS":"Walt Disney", "SBUX":"Starbucks",
};

async function fetchYahooChart(symbol) {
  const variants = [symbol];
  if (symbol.includes(":")) variants.push(symbol.split(":")[1]);
  // Czech stocks
  if (symbol === "CEZ") variants.push("CEZ.PR");
  if (symbol === "MM0") variants.push("MM0.PR");

  for (const sym of variants) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
          "Accept": "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const data = await r.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) continue;
      const price = meta.regularMarketPrice;
      const prev = meta.previousClose || meta.chartPreviousClose || price;
      return {
        price: parseFloat(price.toFixed(4)),
        currency: meta.currency || "USD",
        change1d: parseFloat(((price - prev) / prev * 100).toFixed(2)),
        shortName: meta.shortName || meta.longName || KNOWN_NAMES[symbol] || symbol,
        source: "Yahoo",
      };
    } catch {}
  }
  return null;
}

async function fetchStooq(symbol) {
  // Stooq symbol mapping
  const symMap = {
    "CEZ": "cez.pl", "MM0": "mm0.pl", "FRA:TBK": "tbk.f",
  };
  const stooqSym = symMap[symbol] || (symbol.toLowerCase() + ".us");
  try {
    const url = `https://stooq.com/q/l/?s=${stooqSym}&f=sd2t2ohlcv&h&e=csv`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const text = await r.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return null;
    const parts = lines[1].split(",");
    // Symbol,Date,Time,Open,High,Low,Close,Volume
    if (parts.length < 7) return null;
    const close = parseFloat(parts[6]);
    const open = parseFloat(parts[3]);
    if (isNaN(close) || close <= 0) return null;
    return {
      price: close,
      currency: ["CEZ","MM0"].includes(symbol) ? "CZK" : "EUR",
      change1d: open > 0 ? parseFloat(((close - open) / open * 100).toFixed(2)) : 0,
      shortName: KNOWN_NAMES[symbol] || symbol,
      source: "Stooq",
    };
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let body;
  try {
    if (typeof req.body === "string") body = JSON.parse(req.body);
    else if (req.body && typeof req.body === "object") body = req.body;
    else {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    }
  } catch(e) { return res.status(400).json({ error: "Invalid JSON" }); }

  const { tickers } = body;
  if (!tickers?.length) return res.status(200).json({ prices: {}, names: KNOWN_NAMES });

  const stockTickers = [...new Set(tickers.filter(t => t && !["VKLAD","VÝBĚR",""].includes(t)))];
  const results = {};

  // Fetch all in parallel
  await Promise.allSettled(stockTickers.map(async (ticker) => {
    // Try Yahoo first
    let data = await fetchYahooChart(ticker);
    // Fallback to Stooq for European stocks
    if (!data || data.price === 0) {
      data = await fetchStooq(ticker);
    }
    if (data) {
      // Always use known name if available (more accurate than Yahoo shortName)
      if (KNOWN_NAMES[ticker]) data.shortName = KNOWN_NAMES[ticker];
      results[ticker] = { ...data, lastUpdated: new Date().toISOString() };
    } else {
      // Return name only, price 0
      results[ticker] = {
        price: 0, currency: "USD", change1d: 0,
        shortName: KNOWN_NAMES[ticker] || ticker,
        lastUpdated: new Date().toISOString(), source: "fallback"
      };
    }
  }));

  res.setHeader("Cache-Control", "s-maxage=300");
  return res.status(200).json({
    prices: results,
    names: KNOWN_NAMES,
    fetched: Object.values(results).filter(r => r.price > 0).length,
    requested: stockTickers.length,
  });
}
