// fetchWithTimeout.js
// Same pattern used in FeedPulse: AbortController + setTimeout instead of
// AbortSignal.timeout(), since that API isn't reliably supported everywhere
// this code might run (and matches what you already know works).

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchWithTimeout };
