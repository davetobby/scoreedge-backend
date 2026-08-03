// cache.js
// Same "ensureFresh on-demand refresh" pattern you validated in FeedPulse.
// Render's free tier sleeps after inactivity, which pauses setInterval —
// so instead of relying purely on a background timer, every read checks
// whether the cache is stale and refreshes on-demand before responding.

class FreshCache {
  constructor({ maxAgeMs, refreshFn, label }) {
    this.maxAgeMs = maxAgeMs;
    this.refreshFn = refreshFn; // async () => data
    this.label = label;
    this.data = null;
    this.lastFetched = 0;
    this.inFlight = null; // dedupe concurrent refreshes
  }

  isStale() {
    return !this.data || Date.now() - this.lastFetched > this.maxAgeMs;
  }

  async ensureFresh() {
    if (!this.isStale()) return this.data;

    // If a refresh is already in flight, wait on that instead of starting a second one
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.refreshFn()
      .then((data) => {
        this.data = data;
        this.lastFetched = Date.now();
        return data;
      })
      .catch((err) => {
        console.error(`[cache:${this.label}] refresh failed:`, err.message);
        // Serve stale data rather than nothing if a refresh fails
        return this.data;
      })
      .finally(() => {
        this.inFlight = null;
      });

    return this.inFlight;
  }
}

module.exports = { FreshCache };
