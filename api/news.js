import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const response = await fetch('https://www.4may.net/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`فشل الجلب من الموقع الأصلي: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const newsList = [];

    $('a').each((i, element) => {
      const title = $(element).text().trim();
      let href = $(element).attr('href');

      if (title && title.length > 15 && href) {
        if (!href.startsWith('http')) {
          href = `https://www.4may.net${href.startsWith('/') ? '' : '/'}${href}`;
        }

        if (!newsList.some(item => item.title === title)) {
          newsList.push({
            title: title,
            url: href
          });
        }
      }
    });

    return res.status(200).json({
      success: true,
      count: newsList.length,
      data: newsList.slice(0, 15)
    });

  } catch (error) {
    console.error('Error fetching news:', error);
    return res.status(500).json({
      success: false,
      message: 'فشل في سحب الأخبار المتزامنة',
      error: error.message
    });
  }
}

