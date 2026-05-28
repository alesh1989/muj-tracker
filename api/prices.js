// Vercel Serverless Function — Stock prices via Finnhub
// Finnhub free: 60 req/min — zvládne 50 tickerů v pohodě
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
  "ABBV":"AbbVie", "PFE":"Pfizer", "MRK":"Merck", "LLY":"Eli Lilly",
  "XOM":"ExxonMobil", "CVX":"Chevron", "NEE":"NextEra Energy",
  "PG":"Procter & Gamble", "UNH":"UnitedHealth", "CRM":"Salesforce",
};

// Map non-standard tickers to Finnhub format
const TICKER_MAP = {
  "FRA:TBK": "TABAK.PR",   // Philip Morris CR on Prague exchange
  "CEZ": "CEZ.PR",          // CEZ on Prague exchange
  "MM0": "MONET.PR",        // Moneta Money Bank on Prague exchange
  "BTC": "BINANCE:BTCUSDT",
  "ETH": "BINANCE:ETHUSDT",
  "BTC-USD": "BINANCE:BTCUSDT",
  "ETH-USD": "BINANCE:ETHUSDT",
};

// Czech stocks that need CZK currency
const CZK_TICKERS = ["CEZ","MM0","FRA:TBK","MONET.PR","CEZ.PR","TABAK.PR"];


// Detekce evropských burz
const isEuropean = (t) => /\.(L|DE|PA|AS|MI|MA|BR|VX|HE|OL|ST|CO|LS|AT|WA|F|BE|DU|MU|SG|HM|VI)$/i.test(t);

// Odhad měny z burzy (fallback)
function detectCurrency(ticker) {
  if (/\.L$/i.test(ticker)) return "GBP";
  if (/\.(DE|F|BE|DU|MU|SG|HM|PA|AS|MI|MA|BR|HE|LS|AT|VI)$/i.test(ticker)) return "EUR";
  if (/\.VX$/i.test(ticker)) return "CHF";
  if (/\.OL$/i.test(ticker)) return "NOK";
  if (/\.ST$/i.test(ticker)) return "SEK";
  if (/\.CO$/i.test(ticker)) return "DKK";
  if (/\.WA$/i.test(ticker)) return "PLN";
  if (/\.PR$/i.test(ticker)) return "CZK";
  return "EUR";
}

// Yahoo Finance v8 — funguje bez API klíče, pokrývá všechny světové burzy
async function fetchYahoo(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    const price = meta.regularMarketPrice;
    if (!price || price === 0) return null;
    const prevClose = meta.chartPreviousClose || meta.previousClose || price;
    const change1d = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
    // LSE quotes v GBp (pence) — převedeme na GBP
    const rawCurrency = meta.currency || detectCurrency(ticker);
    let finalPrice = price;
    let finalCurrency = rawCurrency;
    if (rawCurrency === "GBp") { finalPrice = price / 100; finalCurrency = "GBP"; }
    const shortName = meta.longName || meta.shortName || ticker;
    return {
      price: parseFloat(finalPrice.toFixed(4)),
      currency: finalCurrency,
      change1d: parseFloat(change1d.toFixed(2)),
      shortName,
      source: "Yahoo",
      lastUpdated: new Date().toISOString(),
    };
  } catch { return null; }
}

async function fetchFinnhub(symbol, apiKey) {
  const finnSym = TICKER_MAP[symbol] || symbol;
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(finnSym)}&token=${apiKey}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json();
    // Finnhub: c=current, o=open, h=high, l=low, pc=prev close, dp=change%
    if (!d?.c || d.c === 0) return null;
    return {
      price: parseFloat(d.c.toFixed(4)),
      currency: CZK_TICKERS.includes(symbol) || CZK_TICKERS.includes(TICKER_MAP[symbol]||"") ? "CZK" : "USD",
      change1d: d.dp != null ? parseFloat(d.dp.toFixed(2)) : 0,
      shortName: KNOWN_NAMES[symbol] || symbol,
      source: "Finnhub",
      lastUpdated: new Date().toISOString(),
    };
  } catch { return null; }
}

async function fetchFinnhubProfile(symbol, apiKey) {
  // Get company name from Finnhub profile
  try {
    const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.name || null;
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

  const { tickers, fetchNames } = body;
  if (!tickers?.length) return res.status(200).json({ prices: {}, names: KNOWN_NAMES });

  const stockTickers = [...new Set(tickers.filter(t => t && !["VKLAD","VÝBĚR",""].includes(t)))];
  const finnhubKey = process.env.FINNHUB_KEY;
  const avKey = process.env.ALPHA_VANTAGE_KEY;

  const results = {};
  const fetchedNames = { ...KNOWN_NAMES };

  if (finnhubKey) {
    // Finnhub: batch fetch all tickers in parallel (60/min limit — fine for 50 tickers)
    await Promise.allSettled(stockTickers.map(async (ticker) => {
      // Evropské burzy jdou rovnou na Yahoo, Finnhub je nemá
      let data = isEuropean(ticker) ? null : await fetchFinnhub(ticker, finnhubKey);
      const shortName = KNOWN_NAMES[ticker] || data?.shortName || ticker;
      const isCzkTicker = ["CEZ","MM0","FRA:TBK"].includes(ticker);
    if (data) {
      if (isCzkTicker) data.currency = "CZK";
      results[ticker] = { ...data, shortName, lastUpdated: new Date().toISOString() };
    } else {
      // Finnhub selhal — zkus Yahoo Finance (evropské ETF, neznámé tickery)
      const yahooData = await fetchYahoo(ticker);
      if (yahooData) {
        results[ticker] = { ...yahooData, shortName: yahooData.shortName || shortName };
        if (yahooData.shortName && yahooData.shortName !== ticker) fetchedNames[ticker] = yahooData.shortName;
      } else {
        results[ticker] = { price: 0, currency: isCzkTicker ? "CZK" : isEuropean(ticker) ? detectCurrency(ticker) : "USD", change1d: 0, shortName, lastUpdated: new Date().toISOString(), source: "fallback" };
      }
    }

      // Fetch company name and fundamentals if not in KNOWN_NAMES
      if (finnhubKey) {
        try {
          const profUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(TICKER_MAP[ticker]||ticker)}&token=${finnhubKey}`;
          const profR = await fetch(profUrl, {signal:AbortSignal.timeout(6000)});
          if (profR.ok) {
            const prof = await profR.json();
            if (prof?.name) { results[ticker].shortName = prof.name; fetchedNames[ticker] = prof.name; }
          }
          // Fetch basic financials for P/E, P/B, ROE etc.
          const metUrl = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(TICKER_MAP[ticker]||ticker)}&metric=all&token=${finnhubKey}`;
          const metR = await fetch(metUrl, {signal:AbortSignal.timeout(6000)});
          if (metR.ok) {
            const met = await metR.json();
            const m = met?.metric || {};
            if (Object.keys(m).length) {
              results[ticker].pe = m.peNormalizedAnnual || m.peBasicExclExtraTTM || null;
              results[ticker].forwardPe = m.forwardPE || null;
              results[ticker].pb = m.pbAnnual || m.pbQuarterly || null;
              results[ticker].ps = m.psAnnual || m.psTTM || null;
              results[ticker].roe = m.roeRfy ? m.roeRfy * 100 : (m.roeTTM ? m.roeTTM * 100 : null);
              results[ticker].roa = m.roaRfy ? m.roaRfy * 100 : (m.roaTTM ? m.roaTTM * 100 : null);
              results[ticker].netMargin = m.netProfitMarginAnnual || m.netProfitMarginTTM || null;
              results[ticker].beta = m["52WeekPriceReturnDaily"] ? null : m.beta || null;
            }
          }
        } catch(e) { console.warn("Finnhub profile/metrics error:", ticker, e.message); }
      }
    }));
  } else if (avKey) {
    // Fallback: Alpha Vantage (max 25/day on free tier — limit to first 25)
    const limited = stockTickers.slice(0, 25);
    await Promise.allSettled(limited.map(async (ticker) => {
      try {
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${avKey}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) return;
        const d = await r.json();
        const q = d?.["Global Quote"];
        if (!q?.["05. price"]) return;
        const price = parseFloat(q["05. price"]);
        const changePct = parseFloat(q["10. change percent"]?.replace("%","") || 0);
        results[ticker] = {
          price: parseFloat(price.toFixed(4)),
          currency: "USD",
          change1d: parseFloat(changePct.toFixed(2)),
          shortName: KNOWN_NAMES[ticker] || ticker,
          lastUpdated: new Date().toISOString(),
          source: "AlphaVantage",
        };
      } catch {}
    }));
    // Fill missing with fallback
    stockTickers.forEach(ticker => {
      if (!results[ticker]) {
        results[ticker] = { price: 0, currency: "USD", change1d: 0, shortName: KNOWN_NAMES[ticker] || ticker, lastUpdated: new Date().toISOString(), source: "fallback" };
      }
    });
  } else {
    // No API key — return names only
    stockTickers.forEach(ticker => {
      results[ticker] = { price: 0, currency: "USD", change1d: 0, shortName: KNOWN_NAMES[ticker] || ticker, lastUpdated: new Date().toISOString(), source: "no-key" };
    });
  }

  res.setHeader("Cache-Control", "s-maxage=300");
  return res.status(200).json({
    prices: results,
    names: fetchedNames,
    fetched: Object.values(results).filter(r => r.price > 0).length,
    requested: stockTickers.length,
    api: finnhubKey ? "finnhub" : avKey ? "alphavantage" : "none",
  });
}
