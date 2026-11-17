import { recordPopularSearchKeyword } from '../../api/policies';

let lastRecord = { keyword: '', userId: '', at: 0 };

export function recordConfirmedSearch(keyword, user, queryClient) {
  const normalized = keyword.replace(/\s+/g, ' ').trim();
  if (!user || [...normalized].length < 2 || [...normalized].length > 80) return;
  const now = Date.now();
  if (lastRecord.keyword === normalized && lastRecord.userId === user.id && now - lastRecord.at < 1000) return;
  lastRecord = { keyword: normalized, userId: user.id, at: now };
  void recordPopularSearchKeyword(normalized)
    .then(() => queryClient.invalidateQueries({ queryKey: ['popular-search-keywords'] }))
    .catch(() => { /* A failed count must not interrupt the search. */ });
}
