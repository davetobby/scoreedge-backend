// routes/news.js
const express = require('express');
const router = express.Router();
const { FreshCache } = require('../services/cache');
const newsSource = require('../services/newsSource');

const newsCache = new FreshCache({
  maxAgeMs: 15 * 60 * 1000,
  label: 'news-all',
  refreshFn: newsSource.fetchAllCategories,
});

router.get('/', async (req, res) => {
  try {
    const all = await newsCache.ensureFresh();
    const { category } = req.query;
    const filtered = category ? all.filter((a) => a.category === category) : all;
    res.json({ articles: filtered.slice(0, 50) });
  } catch (err) {
    res.status(502).json({ error: 'Failed to load news' });
  }
});

module.exports = router;
