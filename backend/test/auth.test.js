import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

// 실제 프로젝트 키나 DB를 사용하지 않는 인증/소유권 테스트.
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { supabase } = await import('../src/lib/supabase.js');
const { requireAuth } = await import('../src/middlewares/auth.js');
const { default: policyRoutes } = await import('../src/routes/policy.routes.js');
const { errorHandler } = await import('../src/middlewares/error.js');
const userRepo = await import('../src/repositories/user.repository.js');
const me = await import('../src/controllers/me.controller.js');

test('Bearer 토큰이 없거나 잘못되면 API가 거부한다', async () => {
  for (const authorization of [undefined, 'Basic abc', 'Bearer ']) {
    await assert.rejects(
      requireAuth({ headers: { authorization } }, null, () => {}),
      (error) => error.status === 401 && error.code === 'UNAUTHORIZED'
    );
  }
  const getUser = mock.method(supabase.auth, 'getUser', async () => ({ data: { user: null }, error: null }));
  try {
    await assert.rejects(
      requireAuth({ headers: { authorization: 'Bearer invalid' } }, null, () => {}),
      (error) => error.status === 401 && error.code === 'INVALID_TOKEN'
    );
  } finally {
    getUser.mock.restore();
  }
});

test('사용자 ID는 요청값이 아니라 검증된 토큰에서 얻는다', async () => {
  const getUser = mock.method(supabase.auth, 'getUser', async (token) => {
    assert.equal(token, 'valid');
    return { data: { user: { id: 'trusted-user' } }, error: null };
  });
  try {
    const req = { headers: { authorization: 'Bearer valid' }, query: { userId: 'other-user' } };
    let continued = false;
    await requireAuth(req, null, () => { continued = true; });
    assert.equal(req.user.id, 'trusted-user');
    assert.equal(continued, true);
  } finally {
    getUser.mock.restore();
  }
});

test('검색·상세의 정책 라우트는 로그인 전 모두 401을 반환한다', async () => {
  const app = express();
  app.use('/api/v1', policyRoutes);
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const port = server.address().port;
    for (const path of ['/categories', '/search-filters', '/policies', '/policies/suggestions?q=일자리',
      '/policies/00000000-0000-0000-0000-000000000000',
      '/policies/00000000-0000-0000-0000-000000000000/explanation',
      '/policies/00000000-0000-0000-0000-000000000000/similar',
      '/policies/00000000-0000-0000-0000-000000000000/compare-candidates',
      '/policies/00000000-0000-0000-0000-000000000000/compare/11111111-1111-4111-8111-111111111111',
      '/policies/00000000-0000-0000-0000-000000000000/compare/11111111-1111-4111-8111-111111111111/summary',
      '/policies/00000000-0000-0000-0000-000000000000/eligibility']) {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1${path}`);
      assert.equal(response.status, 401, path);
      assert.equal((await response.json()).code, 'UNAUTHORIZED');
    }
    const viewResponse = await fetch(`http://127.0.0.1:${port}/api/v1/policies/00000000-0000-0000-0000-000000000000/view`, { method: 'POST' });
    assert.equal(viewResponse.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('프로필·찜 조회와 저장은 검증된 사용자 ID로 제한한다', async () => {
  const filters = [];
  const writes = [];
  const from = mock.method(supabase, 'from', (table) => {
    const query = {
      select() { return this; },
      eq(field, value) { filters.push({ table, field, value }); return this; },
      in(field, value) { filters.push({ table, field, value }); return this; },
      maybeSingle: async () => ({ data: { user_id: 'trusted-user' }, error: null }),
      upsert(row) { writes.push({ table, row }); return this; },
      single: async () => ({ data: { user_id: 'trusted-user' }, error: null }),
      delete() { return this; },
      then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
    };
    return query;
  });
  try {
    await userRepo.findProfile('trusted-user');
    await userRepo.findBookmarkedPolicyIds('trusted-user', ['policy-1']);
    await userRepo.deleteBookmark('trusted-user', 'policy-1');
    await userRepo.upsertProfile('trusted-user', { user_id: 'other-user', region_code: '26' });
    await userRepo.insertBookmark('trusted-user', 'policy-1', 'SEARCH');
    assert.ok(filters.some((item) => item.table === 'user_profile' &&
      item.field === 'user_id' && item.value === 'trusted-user'));
    assert.ok(filters.some((item) => item.table === 'user_bookmark' &&
      item.field === 'user_id' && item.value === 'trusted-user'));
    assert.ok(filters.some((item) => item.table === 'user_bookmark' &&
      item.field === 'policy_id' && item.value.includes('policy-1')));
    assert.ok(writes.every((item) => item.row.user_id === 'trusted-user'));

    let body;
    await me.getProfile({ user: { id: 'trusted-user' }, params: { userId: 'other-user' } },
      { status() { return this; }, json(value) { body = value; } });
    assert.equal(body.data.user_id, 'trusted-user');
  } finally {
    from.mock.restore();
  }
});
