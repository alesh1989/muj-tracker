// Vercel Serverless Function — Stock price fetcher
// Uses multiple free APIs with fallback
export const config = { runtime: "nodejs" };

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
  } catch(e) { return res.status(400).json({ error: "Invalid JSON: " + e.message }); }

  const { tickers } = body;
  if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
    return res.status(400).json({ error: "Chybí seznam tickerů" });
  }

  const stockTickers = [...new Set(tickers.filter(t =>
    t && !["VKLAD","VÝBĚR",""].includes(t)
  ))];

  if (stockTickers.length === 0) return res.status(200).json({ prices: {} });

  const results = {};

  // ── METHOD 1: Yahoo Finance (with proper headers) ────────────────────────
  try {
    const symbols = stockTickers.join(",");
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChangePercent,currency,shortName`;

    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://finance.yahoo.com",
        "Referer": "https://finance.yahoo.com/",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (r.ok) {
      const data = await r.json();
      const quotes = data?.quoteResponse?.result || [];
      quotes.forEach(q => {
        if (q.regularMarketPrice != null) {
          results[q.symbol] = {
            price: parseFloat(q.regularMarketPrice.toFixed(4)),
            currency: q.currency || "USD",
            change1d: q.regularMarketChangePercent != null
              ? parseFloat(q.regularMarketChangePercent.toFixed(2))
              : 0,
            lastUpdated: new Date().toISOString(),
            source: "Yahoo Finance",
          };
        }
      });
      console.log(`Yahoo: got ${Object.keys(results).length}/${stockTickers.length}`);
    }
  } catch(e) {
    console.warn("Yahoo Finance error:", e.message);
  }

  // ── METHOD 2: Fallback via yh-finance alternative endpoint ───────────────
  const missing = stockTickers.filter(t => !results[t]);
  if (missing.length > 0) {
    try {
      for (const ticker of missing.slice(0, 10)) {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
          const r = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
              "Accept": "application/json",
            },
            signal: AbortSignal.timeout(6000),
          });
          if (!r.ok) continue;
          const data = await r.json();
          const meta = data?.chart?.result?.[0]?.meta;
          if (meta?.regularMarketPrice) {
            results[ticker] = {
              price: parseFloat(meta.regularMarketPrice.toFixed(4)),
              currency: meta.currency || "USD",
              change1d: meta.previousClose
                ? parseFloat(((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2))
                : 0,
              lastUpdated: new Date().toISOString(),
              source: "Yahoo Chart",
            };
          }
        } catch {}
      }
    } catch(e) {
      console.warn("Yahoo Chart fallback error:", e.message);
    }
  }

  // ── METHOD 3: Alpha Vantage free tier (no key needed for basic) ──────────
  const stillMissing = stockTickers.filter(t => !results[t]);
  if (stillMissing.length > 0) {
    // Use Alpha Vantage if API key is set
    const avKey = process.env.ALPHA_VANTAGE_KEY;
    if (avKey) {
      for (const ticker of stillMissing.slice(0, 5)) {
        try {
          const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${avKey}`;
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) continue;
          const data = await r.json();
          const quote = data?.["Global Quote"];
          if (quote?.["05. price"]) {
            const price = parseFloat(quote["05. price"]);
            const prevClose = parseFloat(quote["08. previous close"] || price);
            results[ticker] = {
              price: parseFloat(price.toFixed(4)),
              currency: "USD",
              change1d: parseFloat(((price - prevClose) / prevClose * 100).toFixed(2)),
              lastUpdated: new Date().toISOString(),
              source: "Alpha Vantage",
            };
          }
        } catch {}
      }
    }
  }

  return res.status(200).json({
    prices: results,
    fetched: Object.keys(results).length,
    requested: stockTickers.length,
    missing: stockTickers.filter(t => !results[t]),
  });
}
