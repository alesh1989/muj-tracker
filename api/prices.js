// Vercel Serverless Function — Stock prices
// Uses Alpha Vantage (reliable, works from Vercel) + Yahoo fallback
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
  "COST":"Costco", "V":"Visa", "MA":"Mastercard", "NFLX":"Netflix",
  "DIS":"Walt Disney", "SBUX":"Starbucks", "SHOP":"Shopify",
};

// Map CZ/EU tickers to Yahoo format
const TICKER_MAP = {
  "CEZ": "CEZ.PR", "MM0": "MM0.PR", "FRA:TBK": "PHIA.AS",
};

async function fetchAlphaVantage(symbol, apiKey) {
  try {
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const data = await r.json();
    const q = data?.["Global Quote"];
    if (!q?.["05. price"]) return null;
    const price = parseFloat(q["05. price"]);
    const prevClose = parseFloat(q["08. previous close"] || price);
    const changePct = parseFloat(q["10. change percent"]?.replace("%","") || 0);
    return {
      price: parseFloat(price.toFixed(4)),
      currency: "USD",
      change1d: parseFloat(changePct.toFixed(2)),
      shortName: KNOWN_NAMES[symbol] || symbol,
      source: "AlphaVantage",
    };
  } catch { return null; }
}

async function fetchYahoo(symbol) {
  const sym = TICKER_MAP[symbol] || symbol;
  const variants = [sym];
  if (symbol.includes(":")) variants.push(symbol.split(":")[1]);

  for (const s of variants) {
    try {
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=5d`;
      const r = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://finance.yahoo.com",
          "Origin": "https://finance.yahoo.com",
        },
        signal: AbortSignal.timeout(10000),
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
        shortName: KNOWN_NAMES[symbol] || meta.shortName || meta.longName || s,
        source: "Yahoo",
      };
    } catch(e) {
      console.log(`Yahoo ${s} error: ${e.message}`);
    }
  }
  return null;
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
  const avKey = process.env.ALPHA_VANTAGE_KEY;
  const results = {};

  // Parallel fetch - Yahoo first, Alpha Vantage as fallback
  await Promise.allSettled(stockTickers.map(async (ticker) => {
    // 1. Try Yahoo Finance
    let data = await fetchYahoo(ticker);

    // 2. Try Alpha Vantage if Yahoo failed and key is available
    if ((!data || data.price === 0) && avKey) {
      data = await fetchAlphaVantage(ticker, avKey);
    }

    // 3. Use known name regardless
    const shortName = KNOWN_NAMES[ticker] || data?.shortName || ticker;

    results[ticker] = data
      ? { ...data, shortName, lastUpdated: new Date().toISOString() }
      : { price: 0, currency: "USD", change1d: 0, shortName, lastUpdated: new Date().toISOString(), source: "fallback" };
  }));

  res.setHeader("Cache-Control", "s-maxage=300");
  return res.status(200).json({
    prices: results,
    names: KNOWN_NAMES,
    fetched: Object.values(results).filter(r => r.price > 0).length,
    requested: stockTickers.length,
  });
}
