// Vercel Serverless Function — Historical price data for candlestick chart
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { ticker, range = "1y", interval } = req.query;
  if (!ticker) return res.status(400).json({ error: "Chybí ticker" });

  // Map range to Yahoo Finance params
  const rangeMap = {
    "1d":  { range: "1d",   interval: "5m"  },
    "1mo": { range: "1mo",  interval: "1d"  },
    "ytd": { range: "ytd",  interval: "1d"  },
    "1y":  { range: "1y",   interval: "1wk" },
    "10y": { range: "10y",  interval: "1mo" },
    "max": { range: "max",  interval: "1mo" },
  };

  const params = rangeMap[range] || rangeMap["1y"];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${params.range}&interval=${params.interval}&includePrePost=false`;

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com/",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: `Yahoo Finance: HTTP ${r.status}` });
    }

    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) return res.status(404).json({ error: "Ticker nenalezen" });

    const timestamps = result.timestamps || result.timestamp || [];
    const quotes = result.indicators?.quote?.[0] || {};
    const { open, high, low, close, volume } = quotes;
    const meta = result.meta || {};

    // Build OHLCV candles
    const candles = timestamps.map((ts, i) => ({
      t: ts * 1000, // ms
      o: open?.[i] != null ? parseFloat(open[i].toFixed(4)) : null,
      h: high?.[i] != null ? parseFloat(high[i].toFixed(4)) : null,
      l: low?.[i] != null ? parseFloat(low[i].toFixed(4)) : null,
      c: close?.[i] != null ? parseFloat(close[i].toFixed(4)) : null,
      v: volume?.[i] || 0,
    })).filter(c => c.o != null && c.c != null);

    res.setHeader("Cache-Control", "s-maxage=300");
    return res.status(200).json({
      candles,
      currency: meta.currency || "USD",
      shortName: meta.shortName || ticker,
      currentPrice: meta.regularMarketPrice,
      previousClose: meta.previousClose || meta.chartPreviousClose,
    });
  } catch(e) {
    return res.status(500).json({ error: "Chyba: " + e.message });
  }
}
