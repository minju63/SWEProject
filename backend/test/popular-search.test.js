import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { recordPopularSearchKeyword } = await import('../src/controllers/policy.controller.js');
const { searchRecordRateLimit } = await import('../src/middlewares/search-record-rate-limit.js');

test('인기 검색어 기록은 두 글자 미만과 잘못된 입력을 거절한다', async () => {
  for (const keyword of [' ㄷ ', '  ', 123, 'a'.repeat(81)]) {
    await assert.rejects(recordPopularSearchKeyword({ body: { keyword } }, {}),
      (error) => error.status === 400 && error.code === 'INVALID_KEYWORD');
  }
});

test('인기 검색어 기록 요청은 사용자별로 제한한다', () => {
  const request = { user: { id: 'popular-search-test-user-a' } };
  let passed = 0;
  for (let i = 0; i < 30; i++) searchRecordRateLimit(request, null, () => { passed += 1; });
  assert.equal(passed, 30);
  assert.throws(() => searchRecordRateLimit(request, null, () => {}),
    (error) => error.status === 429 && error.code === 'RATE_LIMITED');
  searchRecordRateLimit({ user: { id: 'popular-search-test-user-b' } }, null, () => { passed += 1; });
  assert.equal(passed, 31);
});
