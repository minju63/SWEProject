import { AppError } from '../utils/response.js';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;
const requests = new Map();

export function searchRecordRateLimit(req, _res, next) {
  const now = Date.now();
  const userId = req.user.id;
  let entry = requests.get(userId);
  if (!entry || now - entry.startedAt >= WINDOW_MS) {
    entry = { startedAt: now, count: 0 };
    requests.set(userId, entry);
  }
  if (entry.count >= MAX_REQUESTS)
    throw new AppError(429, 'RATE_LIMITED', '잠시 후 다시 시도해 주세요.');
  entry.count += 1;

  if (requests.size > 1000) {
    for (const [id, value] of requests) {
      if (now - value.startedAt >= WINDOW_MS) requests.delete(id);
    }
  }
  next();
}
