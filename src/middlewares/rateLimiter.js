const rateLimitMap = new Map();
const WINDOW_MS = 60000;
const MAX_REQUESTS = 50;

// Periodically drop stale IP entries to avoid unbounded memory growth.
setInterval(() => {
  const now = Date.now();

  for (const [ip, timestamps] of rateLimitMap.entries()) {
    const recent = timestamps.filter((ts) => now - ts < WINDOW_MS);
    if (recent.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, recent);
    }
  }
}, WINDOW_MS).unref();

function rateLimiter(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }

  const timestamps = rateLimitMap.get(ip).filter((ts) => now - ts < WINDOW_MS);
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);

  if (timestamps.length > MAX_REQUESTS) {
    return res.status(429).json({
      error: "Too many requests",
    });
  }

  return next();
}

module.exports = rateLimiter;
