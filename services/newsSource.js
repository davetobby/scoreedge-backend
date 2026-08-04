// newsSource.js
const Parser = require('rss-parser');
const parser = new Parser({ timeout: 8000 });

const FEEDS = [
  { url: 'https://www.espn.com/espn/rss/soccer/news', category: 'breaking' },
  { url: 'https://www.skysports.com/rss/12040', category: 'breaking' },
  { url: 'https://www.skysports.com/rss/11095', category: 'transfers' },
  { url: 'https://www.theguardian.com/football/rss', category: 'match-reports' },
  { url: 'https://www.bbc.co.uk/sport/football/rss.xml', category: 'club-news' },
];

async function fetchCategory(category) {
  const feeds = FEEDS.filter((f) => f.category === category);
  const results = await Promise.allSettled(feeds.map((f) => parser.parseURL(f.url)));

  const articles = [];
  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') {
      console.error(`[newsSource] failed to fetch ${feeds[i].url}:`, result.reason?.message);
      return;
    }
    for (const item of result.value.items ?? []) {
      articles.push({
        id: item.guid || item.link,
        title: item.title,
        summary: (item.contentSnippet || '').slice(0, 200),
        link: item.link,
        image: item.enclosure?.url ?? null,
        source: result.value.title,
        category,
        publishedAt: item.isoDate || item.pubDate,
      });
    }
  });

  return articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

async function fetchAllCategories() {
  const categories = [...new Set(FEEDS.map((f) => f.category))];
  const results = await Promise.all(categories.map(fetchCategory));
  return results.flat().sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

function articlesMentioning(articles, teamName) {
  const needle = teamName.toLowerCase();
  return articles.filter((a) => a.title.toLowerCase().includes(needle));
}

module.exports = { fetchCategory, fetchAllCategories, articlesMentioning };
