import * as cheerio from "cheerio";

const SOURCE_URL = "https://www.4may.net/Mnews/138173";
const SITE_ORIGIN = "https://www.4may.net";
const MAX_NEWS = 30;

function normalizeUrl(href) {
  try {
    const url = new URL(href, SITE_ORIGIN);
    if (url.hostname.endsWith("4may.net") && /\/Mnews\/\d+/i.test(url.pathname)) {
      url.hash = "";
      return url.href;
    }
  } catch {}
  return null;
}

function collectNews(html) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  // Collect real article links in source order. Cheerio handles nested tags,
  // unlike a regex that only matches plain text inside an <a> element.
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") || "";
    const url = normalizeUrl(href);
    if (!url || /\/Mnews\/138173(?:[/?#]|$)/i.test(url)) return;

    const title = $(element).text().replace(/\s+/g, " ").trim();
    if (title.length < 10 || title.length > 240) return;
    if (/^(الرئيسية|اتصل بنا|المزيد|اقرأ المزيد|صحيفة 4 مايو|اخبار وتقارير)$/i.test(title)) return;
    if (seen.has(url)) return;

    seen.add(url);
    items.push({ title, url });
  });

  return items.slice(0, MAX_NEWS);
}

export default async function handler(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");

  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return response.status(204).end();
  }

  try {
    const upstream = await fetch(SOURCE_URL, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; 4MayNewsSync/1.0)",
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "ar,en;q=0.8"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!upstream.ok) throw new Error(`المصدر الأصلي أعاد الحالة ${upstream.status}`);
    const html = await upstream.text();
    const items = collectNews(html);

    if (!items.length) {
      throw new Error("لم أتمكن من استخراج عناوين الأخبار من صفحة المصدر؛ لم يتم عرض أخبار وهمية.");
    }

    return response.status(200).json({
      success: true,
      source: SOURCE_URL,
      updatedAt: new Date().toISOString(),
      count: items.length,
      items,
      error: null
    });
  } catch (error) {
    return response.status(502).json({
      success: false,
      source: SOURCE_URL,
      updatedAt: null,
      count: 0,
      items: [],
      error: error?.message || "تعذر الاتصال بالمصدر الأصلي"
    });
  }
}
