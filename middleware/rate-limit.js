import { sendApiError } from '../utils/api-response.js';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_ANONYMOUS_LIMIT = 100;
const DEFAULT_AUTHENTICATED_LIMIT = 300;

const getRequestIdentity = (req) => {
  const userId = req.session?.user?._id;

  if (userId) {
    return {
      key: `user:${userId}`,
      limitType: 'authenticated'
    };
  }

  return {
    key: `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`,
    limitType: 'anonymous'
  };
};

const setRateLimitHeaders = (res, { limit, remaining, resetAt }) => {
  const resetSeconds = Math.ceil(resetAt / 1000);

  res.set('RateLimit-Limit', String(limit));
  res.set('RateLimit-Remaining', String(remaining));
  res.set('RateLimit-Reset', String(resetSeconds));
};

const pruneExpiredBuckets = (store, now) => {
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  }
};

export const createRateLimiter = ({
  windowMs = DEFAULT_WINDOW_MS,
  anonymousLimit = DEFAULT_ANONYMOUS_LIMIT,
  authenticatedLimit = DEFAULT_AUTHENTICATED_LIMIT,
  now = () => Date.now(),
  store = new Map()
} = {}) => {
  let nextPruneAt = now() + windowMs;

  return (req, res, next) => {
    const currentTime = now();

    if (currentTime >= nextPruneAt) {
      pruneExpiredBuckets(store, currentTime);
      nextPruneAt = currentTime + windowMs;
    }

    const { key, limitType } = getRequestIdentity(req);
    const limit = limitType === 'authenticated' ? authenticatedLimit : anonymousLimit;
    const existingBucket = store.get(key);
    const bucket = !existingBucket || existingBucket.resetAt <= currentTime
      ? { count: 0, resetAt: currentTime + windowMs }
      : existingBucket;

    bucket.count += 1;
    store.set(key, bucket);

    const remaining = Math.max(limit - bucket.count, 0);
    setRateLimitHeaders(res, {
      limit,
      remaining,
      resetAt: bucket.resetAt
    });

    if (bucket.count > limit) {
      const retryAfterSeconds = Math.max(Math.ceil((bucket.resetAt - currentTime) / 1000), 1);
      res.set('Retry-After', String(retryAfterSeconds));
      return sendApiError(res, 'too many requests', { status: 429 });
    }

    return next();
  };
};

export const apiRateLimiter = createRateLimiter();
