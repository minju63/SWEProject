import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { supabase } = await import('../src/lib/supabase.js');
const { presetFireAt } = await import('../src/services/bookmark-alarm.service.js');
const { insertBookmark } = await import('../src/repositories/user.repository.js');

test('기본 찜 알림은 KST 마감일 기준 D1과 M30 시각을 계산한다', () => {
  assert.equal(presetFireAt('D1', '2099-01-10', '09:00:00'), '2099-01-09T00:00:00.000Z');
  assert.equal(presetFireAt('M30', '2099-01-10'), '2099-01-10T14:29:00.000Z');
  assert.equal(presetFireAt('UNKNOWN', '2099-01-10'), null);
});

test('찜 저장은 기존 기본 알림 설정을 사용하고 재저장해도 알림을 중복 생성하지 않는다', async () => {
  const inserted = [];
  const presets = new Set();
  const from = mock.method(supabase, 'from', (table) => ({
    select() { return this; }, eq() { return this; },
    upsert(value) { assert.equal(table, 'user_bookmark'); assert.equal(value.user_id, 'trusted-user'); return this; },
    insert(rows) { assert.equal(table, 'saved_alarm'); inserted.push(...rows); rows.forEach((row) => presets.add(row.preset_code)); return this; },
    single: async () => ({ data: { bookmark_id: 'bookmark-1', policy_id: 'policy-1' }, error: null }),
    maybeSingle: async () => ({ data: table === 'policy'
      ? { application_end_date: '2099-01-10', is_always_open: false }
      : { default_presets: ['D1', 'M30'], day_alarm_time: '09:00:00', deadline_enabled: true }, error: null }),
    then(resolve, reject) {
      return Promise.resolve({ data: table === 'saved_alarm'
        ? [...presets].map((preset_code) => ({ preset_code })) : [], error: null }).then(resolve, reject);
    },
  }));
  try {
    await insertBookmark('trusted-user', 'policy-1', 'DETAIL');
    await insertBookmark('trusted-user', 'policy-1', 'DETAIL');
    assert.deepEqual(inserted.map((row) => row.preset_code), ['D1', 'M30']);
    assert.ok(inserted.every((row) => row.bookmark_id === 'bookmark-1' && row.kind === 'PRESET'));
  } finally {
    from.mock.restore();
  }
});
