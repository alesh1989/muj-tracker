// Vercel Serverless Function — Multi-source stock price fetcher
export const config = { runtime: "nodejs" };

// Normalize ticker for different exchanges
function normalizeTicker(ticker) {
  // FRA:TBK -> TBK.F (Frankfurt), CEZ -> CEZ.PR (Prague), MM0 -> MM0.DE
  const map = {
    "FRA:TBK": "PM", // Philip Morris International (approximation)
    "CEZ": "CEZ.PR",
    "MM0": "MNETA.PR",
  };
  return map[ticker] || ticker;
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
  if (!tickers?.length) return res.status(200).json({ prices: {} });

  const stockTickers = [...new Set(tickers.filter(t =>
    t && !["VKLAD","VÝBĚR",""].includes(t)
  ))];

  const results = {};

  // ── Method 1: Yahoo Finance via chart endpoint (more reliable) ───────────
  await Promise.allSettled(stockTickers.map(async (ticker) => {
    const variants = [ticker]; // try original first
    if (ticker.includes(":")) variants.push(ticker.split(":")[1]); // FRA:TBK -> TBK

    for (const sym of variants) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
        const r = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) continue;
        const data = await r.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) continue;

        const price = meta.regularMarketPrice;
        const prev = meta.previousClose || meta.chartPreviousClose || price;
        results[ticker] = {
          price: parseFloat(price.toFixed(4)),
          currency: meta.currency || "USD",
          change1d: parseFloat(((price - prev) / prev * 100).toFixed(2)),
          shortName: meta.shortName || meta.longName || sym,
          lastUpdated: new Date().toISOString(),
          source: "Yahoo",
        };
        break; // found it, stop trying variants
      } catch {}
    }
  }));

  // ── Method 2: Stooq for missing (good for European stocks) ───────────────
  const missing = stockTickers.filter(t => !results[t]);
  if (missing.length > 0) {
    await Promise.allSettled(missing.map(async (ticker) => {
      try {
        // Stooq uses different format: CEZ.PL, MM0.DE etc
        const stooqMap = {
          "CEZ": "cez.pl", "MM0": "mm0.de", "FRA:TBK": "tbk.f",
        };
        const sym = stooqMap[ticker] || ticker.toLowerCase().replace(":", ".") + ".us";
        const url = `https://stooq.com/q/d/l/?s=${sym}&i=d`;
        const r = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(6000),
        });
        if (!r.ok) return;
        const text = await r.text();
        const lines = text.trim().split("\n");
        const lastLine = lines[lines.length - 1];
        const parts = lastLine.split(",");
        // Format: Date,Open,High,Low,Close,Volume
        if (parts.length >= 5 && !isNaN(parseFloat(parts[4]))) {
          const close = parseFloat(parts[4]);
          const open = parseFloat(parts[1]);
          results[ticker] = {
            price: close,
            currency: ticker === "CEZ" || ticker === "MM0" ? "CZK" : "EUR",
            change1d: open > 0 ? parseFloat(((close - open) / open * 100).toFixed(2)) : 0,
            shortName: ticker,
            lastUpdated: new Date().toISOString(),
            source: "Stooq",
          };
        }
      } catch {}
    }));
  }

  // ── Method 3: Fallback hardcoded names for known CZ stocks ───────────────
  const knownNames = {
    "CEZ": "ČEZ, a.s.", "MM0": "Moneta Money Bank",
    "FRA:TBK": "Philip Morris ČR", "RCL": "Royal Caribbean",
    "IRM": "Iron Mountain", "AHT": "Ashford Hospitality",
    "UMC": "United Microelectronics", "INTC": "Intel Corporation",
    "TSLA": "Tesla, Inc.", "AAPL": "Apple Inc.", "MSFT": "Microsoft Corp.",
    "NVDA": "NVIDIA Corporation", "GOOGL": "Alphabet Inc.",
    "AMZN": "Amazon.com Inc.", "META": "Meta Platforms",
    "BRK.B": "Berkshire Hathaway", "JPM": "JPMorgan Chase",
    "KO": "Coca-Cola Co.", "JNJ": "Johnson & Johnson",
    "O": "Realty Income Corp.", "SPY": "SPDR S&P 500 ETF",
    "QQQ": "Invesco QQQ Trust", "VTI": "Vanguard Total Stock",
    "VWCE": "Vanguard FTSE All-World", "BTC-USD": "Bitcoin",
    "ETH-USD": "Ethereum",
  };

  // Add known names to results that have prices but no names
  stockTickers.forEach(t => {
    if (results[t] && !results[t].shortName && knownNames[t]) {
      results[t].shortName = knownNames[t];
    }
    // For tickers with no price at all, at least return the name
    if (!results[t] && knownNames[t]) {
      results[t] = { price: 0, currency: "USD", change1d: 0, shortName: knownNames[t], lastUpdated: new Date().toISOString(), source: "fallback" };
    }
  });

  return res.status(200).json({
    prices: results,
    fetched: Object.keys(results).filter(t => results[t].price > 0).length,
    requested: stockTickers.length,
    missing: stockTickers.filter(t => !results[t] || results[t].price === 0),
  });
}
