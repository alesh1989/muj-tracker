// Vercel Serverless Function — RSS news proxy
export const config = { runtime: "nodejs" };

const FEEDS = [
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL,MSFT,GOOGL&region=US&lang=en-US", label: "Yahoo Finance" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", label: "MarketWatch" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", label: "CNBC" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", label: "WSJ" },
  { url: "https://rss.cnn.com/rss/money_news_international.rss", label: "CNN Business" },
];

function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const get = (tag) => {
      const m = item.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`));
      return m ? (m[1] || m[2] || "").trim() : "";
    };
    const title = get("title");
    const link = get("link") || item.match(/<link\s*\/?>(.*?)<\/link>|<link>(.*?)<\/link>/)?.[1] || "";
    const pubDate = get("pubDate");
    const desc = get("description").replace(/<[^>]*>/g, "").slice(0, 250);
    if (title) items.push({ title, link: link.trim(), pubDate, desc });
  }
  return items;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const allNews = [];

  await Promise.allSettled(FEEDS.map(async (feed) => {
    try {
      const r = await fetch(feed.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; InvestTrack/1.0)" },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) return;
      const xml = await r.text();
      const items = parseRSS(xml);
      items.slice(0, 15).forEach(item => {
        allNews.push({
          title: item.title.slice(0, 140),
          link: item.link,
          desc: item.desc,
          date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          source: feed.label,
        });
      });
    } catch(e) {
      console.warn("Feed error:", feed.label, e.message);
    }
  }));

  // Deduplicate
  const seen = new Set();
  const deduped = allNews.filter(n => {
    const key = n.title.slice(0, 50).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 60);

  res.setHeader("Cache-Control", "s-maxage=300"); // cache 5 min
  return res.status(200).json({ items: deduped });
}
