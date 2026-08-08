// newsSource.js
// Same RSS-aggregation approach you already validated in FeedPulse — just
// pointed at football-specific feeds instead of general news, and tagged
// into categories so the News screen can filter by tab.

const Parser = require('rss-parser'); // npm install rss-parser
const parser = new Parser({ timeout: 8000 });

// Public RSS feeds — no API key needed, same free approach as FeedPulse's sources.
const FEEDS = [
  { url: 'https://www.espn.com/espn/rss/soccer/news', category: 'breaking' },
  { url: 'https://www.skysports.com/rss/12040', category: 'breaking' }, // Sky Sports football
  { url: 'https://www.skysports.com/rss/11095', category: 'transfers' }, // Sky Sports transfer news
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

  // Most recent first
  return articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

async function fetchAllCategories() {
  const categories = [...new Set(FEEDS.map((f) => f.category))];
  const results = await Promise.all(categories.map(fetchCategory));
  const combined = results.flat();

  // Same article can legitimately appear in more than one feed (e.g. a story
  // both feeds cover) — dedupe by id so the frontend never sees two entries
  // with the same key, which crashes FlatList.
  const seen = new Set();
  const deduped = combined.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  return deduped.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

// Naive relevance filter for follow-based notifications — checks if a team
// name appears in the article title. Good enough for an MVP; a proper
// implementation would tag articles by team ID via a smarter matching step.
function articlesMentioning(articles, teamName) {
  const needle = teamName.toLowerCase();
  return articles.filter((a) => a.title.toLowerCase().includes(needle));
}

module.exports = { fetchCategory, fetchAllCategories, articlesMentioning };
