import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const { suggestionRateLimit } = await import('../src/middlewares/suggestion-rate-limit.js');
const { list } = await import('../src/controllers/policy.controller.js');
const { errorHandler } = await import('../src/middlewares/error.js');

test('자동완성 요청은 사용자별로 제한하고 다른 사용자의 요청에는 영향을 주지 않는다', () => {
  const request = { user: { id: 'rate-limit-user-a' } };
  let continued = 0;
  for (let i = 0; i < 120; i++) suggestionRateLimit(request, null, () => { continued += 1; });
  assert.equal(continued, 120);
  assert.throws(() => suggestionRateLimit(request, null, () => {}),
    (error) => error.status === 429 && error.code === 'RATE_LIMITED');
  suggestionRateLimit({ user: { id: 'rate-limit-user-b' } }, null, () => { continued += 1; });
  assert.equal(continued, 121);
});

test('비정상적으로 긴 검색어는 DB 조회 전에 거부한다', async () => {
  await assert.rejects(list({ query: { q: 'a'.repeat(201) }, user: { id: 'test-user' } }, {}),
    (error) => error.status === 400 && error.code === 'INVALID_QUERY');
});

test('서버 오류 로그에 예외 메시지의 사용자 입력값을 남기지 않는다', () => {
  const original = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  try {
    let body;
    errorHandler(new Error('password=private-input'), {}, {
      status() { return this; }, json(value) { body = value; },
    });
    assert.equal(body.code, 'INTERNAL_ERROR');
    assert.equal(JSON.stringify(calls).includes('private-input'), false);
  } finally {
    console.error = original;
  }
});
