// Vercel Serverless Function — Yahoo Finance price fetcher
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

  // Filter out non-stock tickers
  const stockTickers = tickers.filter(t => !["VKLAD","VÝBĚR",""].includes(t));
  if (stockTickers.length === 0) return res.status(200).json({ prices: {} });

  const results = {};
  const errors = [];

  // Fetch in batches of 10
  const batches = [];
  for (let i = 0; i < stockTickers.length; i += 10) {
    batches.push(stockTickers.slice(i, i + 10));
  }

  for (const batch of batches) {
    const symbols = batch.join(",");
    try {
      // Yahoo Finance v8 API
      const url = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symbols)}&range=1d&interval=1d`;
      const r1 = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (r1.ok) {
        const data = await r1.json();
        const sparkData = data?.spark?.result || [];
        sparkData.forEach(item => {
          const symbol = item.symbol;
          const response = item.response?.[0];
          const meta = response?.meta;
          if (meta && meta.regularMarketPrice) {
            results[symbol] = {
              price: parseFloat(meta.regularMarketPrice.toFixed(2)),
              currency: meta.currency || "USD",
              change1d: meta.previousClose
                ? parseFloat(((meta.regularMarketPrice - meta.previousClose) / meta.previousClose * 100).toFixed(2))
                : 0,
              lastUpdated: new Date().toISOString(),
            };
          }
        });
      }

      // Fallback: Yahoo v7 quote API for missing tickers
      const missing = batch.filter(t => !results[t]);
      if (missing.length > 0) {
        const url2 = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(missing.join(","))}`;
        const r2 = await fetch(url2, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
          },
          signal: AbortSignal.timeout(8000),
        });
        if (r2.ok) {
          const d2 = await r2.json();
          const quotes = d2?.quoteResponse?.result || [];
          quotes.forEach(q => {
            if (q.regularMarketPrice) {
              results[q.symbol] = {
                price: parseFloat(q.regularMarketPrice.toFixed(2)),
                currency: q.currency || "USD",
                change1d: q.regularMarketChangePercent
                  ? parseFloat(q.regularMarketChangePercent.toFixed(2))
                  : 0,
                lastUpdated: new Date().toISOString(),
              };
            }
          });
        }
      }
    } catch(e) {
      errors.push(`Batch ${symbols}: ${e.message}`);
    }
  }

  // Log any errors but still return partial results
  if (errors.length) console.warn("Price fetch errors:", errors);

  return res.status(200).json({
    prices: results,
    errors: errors.length ? errors : undefined,
    fetched: Object.keys(results).length,
    requested: stockTickers.length,
  });
}