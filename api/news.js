import * as cheerio from "cheerio";

const SOURCE_URL = "https://www.4may.net/Mnews/138173";
const SITE_ORIGIN = "https://www.4may.net";
const MAX_NEWS = 30;
const ARTICLE_PATH = /\/Mnews\/\d+/i;
const EXCLUDED_PATH = /\/Mnews\/138173(?:[/?#]|$)/i;

function normalizeUrl(href) {
  try {
    const url = new URL(href, SITE_ORIGIN);
    if (url.hostname !== "www.4may.net" && url.hostname !== "4may.net") return null;
    if (!ARTICLE_PATH.test(url.pathname) || EXCLUDED_PATH.test(url.pathname)) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function collectNews(html) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  // Prefer actual news lists/tickers when the source page has identifiable containers.
  const preferredSelectors = [
    ".news-ticker a[href]", ".breaking-news a[href]", ".latest-news a[href]",
    ".related-news a[href]", ".news-list a[href]", ".news-listing a[href]",
    ".newsTicker a[href]", "#news-ticker a[href]", "#newsTicker a[href]",
    ".owl-carousel a[href]", ".swiper-wrapper a[href]"
  ];

  const candidates = [];
  for (const selector of preferredSelectors) {
    $(selector).each((_, element) => candidates.push(element));
  }
  // Fall back to all article links on the source page if no known ticker/list selector matches.
  if (!candidates.length) $("a[href]").each((_, element) => candidates.push(element));
  // Also include remaining article links if a preferred container only contains a few items.
  $("a[href]").each((_, element) => candidates.push(element));

  for (const element of candidates) {
    const url = normalizeUrl($(element).attr("href") || "");
    if (!url || seen.has(url)) continue;

    const title = $(element).text().replace(/\s+/g, " ").trim();
    if (title.length < 10 || title.length > 240) continue;
    if (/^(الرئيسية|اتصل بنا|المزيد|اقرأ المزيد|صحيفة 4 مايو|اخبار وتقارير|أخبار وتقارير)$/i.test(title)) continue;

    seen.add(url);
    items.push({ title, url });
    if (items.length >= MAX_NEWS) break;
  }
  return items;
}

export default async function handler(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");

  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return response.status(204).end();
  }
  if (request.method !== "GET") {
    return response.status(405).json({ success: false, error: "طريقة الطلب غير مدعومة", items: [] });
  }

  try {
    const upstream = await fetch(SOURCE_URL, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ar-YE,ar;q=0.9,en;q=0.7",
        "referer": "https://www.4may.net/"
      },
      signal: AbortSignal.timeout(20000)
    });

    if (!upstream.ok) throw new Error(`المصدر الأصلي أعاد الحالة ${upstream.status}`);
    const html = await upstream.text();
    const items = collectNews(html);
    if (!items.length) throw new Error("لم يتم العثور على عناوين أخبار صالحة في صفحة المصدر.");

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
