import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabase } from '../src/lib/supabase.js';
import { notifications } from '../src/services/notifications.service.js';
import { runDueAlarms } from '../src/jobs/alarms.js';
import { createNotifications } from '../src/services/notifications.service.js';
import { notificationSettings } from '../src/services/notification-settings.js';
import {
  manualResultDue,
  reconcileStoredResults,
  reconcileManualResults,
} from '../src/services/application-results.service.js';
const a = '11111111-1111-4111-8111-111111111111',
  b = '22222222-2222-4222-8222-222222222222';

test('disabled master suppresses due notifications before inserting any message', async () => {
  const oldFrom = supabase.from,
    oldSettings = notifications.settings;
  const updates = [];
  supabase.from = (table) => {
    assert.equal(table, 'saved_alarm');
    let patch;
    const q = {
      select() {
        return q;
      },
      eq() {
        return q;
      },
      lte() {
        return q;
      },
      limit() {
        return q;
      },
      update(value) {
        patch = value;
        updates.push(value);
        return q;
      },
      then(resolve) {
        resolve({
          data: patch
            ? []
            : [
                {
                  alarm_id: a,
                  bookmark: { user_id: a, policy: { policy_id: b, title: '테스트' } },
                },
              ],
          error: null,
        });
      },
    };
    return q;
  };
  notifications.settings = async (owner) => {
    assert.equal(owner, a);
    return { enabled: false, deadlines: true };
  };
  try {
    assert.deepEqual(await runDueAlarms(), { due: 1, sent: 0 });
    assert.deepEqual(updates, [{ status: 'CANCELLED' }]);
  } finally {
    supabase.from = oldFrom;
    notifications.settings = oldSettings;
  }
});
function fixture() {
  const rows = [
    {
      notification_id: a,
      user_id: a,
      type: 'DEADLINE',
      title: '내 알림',
      is_read: false,
      created_at: new Date().toISOString(),
    },
    {
      notification_id: b,
      user_id: b,
      type: 'DEADLINE',
      title: '다른 사람 알림',
      is_read: false,
      created_at: new Date().toISOString(),
    },
  ];
  const personals = new Map([
    [
      a,
      {
        manual: [],
        details: {},
        notificationSettings: { ...notificationSettings(), enabled: true, policyAlerts: false },
      },
    ],
    [b, { manual: [], details: {} }],
  ]);
  const db = {
    from(table) {
      let filters = [],
        patch = null,
        count = false;
      const q = {
        select(_, { count: kind } = {}) {
          count = !!kind;
          return q;
        },
        eq(k, v) {
          filters.push((r) => r[k] === v);
          return q;
        },
        gte(k, v) {
          filters.push((r) => r[k] >= v);
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return q;
        },
        update(v) {
          patch = v;
          return q;
        },
        async maybeSingle() {
          return { data: null };
        },
        then(resolve, reject) {
          try {
            assert.equal(table, 'notification');
            const result = rows.filter((r) => filters.every((f) => f(r)));
            if (patch) result.forEach((r) => Object.assign(r, patch));
            return Promise.resolve({ data: result, count: count ? result.length : null }).then(
              resolve,
              reject
            );
          } catch (e) {
            return Promise.reject(e).then(resolve, reject);
          }
        },
      };
      return q;
    },
  };
  const service = createNotifications({
    db,
    read: async (id) => structuredClone(personals.get(id)),
    change: async (id, fn) => fn(personals.get(id)),
  });
  return { service, rows, personals };
}
test('notification list/count/read-all are scoped to the authenticated owner', async () => {
  const f = fixture();
  const result = await f.service.list(a);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, '내 알림');
  assert.equal(result.unreadCount, 1);
  await f.service.read(a, b);
  assert.equal(f.rows[1].is_read, false);
  await f.service.read(a, 'all');
  assert.equal(f.rows[0].is_read, true);
  assert.equal(f.rows[1].is_read, false);
});
test('master notification switch persists without changing child preferences or another owner', async () => {
  const f = fixture(),
    original = await f.service.settings(a);
  await f.service.saveSettings(a, { ...original, enabled: false });
  const off = await f.service.settings(a);
  assert.equal(off.enabled, false);
  assert.equal(off.policyAlerts, false);
  assert.equal(off.deadlines, true);
  await f.service.saveSettings(a, { ...off, enabled: true });
  assert.equal((await f.service.settings(a)).policyAlerts, false);
  assert.equal(f.personals.get(b).notificationSettings, undefined);
  await assert.rejects(
    f.service.saveSettings(a, { enabled: 'true' }),
    (e) => e.code === 'INVALID_NOTIFICATION_SETTINGS'
  );
});
test('due application results update only the owner and stored dates; unknown dates stay unknown', async () => {
  const filters = [],
    changes = [];
  const db = {
    from(table) {
      assert.equal(table, 'user_application');
      const q = {
        update(v) {
          changes.push(v);
          return q;
        },
        eq(k, v) {
          filters.push([k, v]);
          return q;
        },
        lte(k, v) {
          filters.push([k, v]);
          return q;
        },
        then(resolve) {
          resolve({ error: null });
        },
      };
      return q;
    },
  };
  await reconcileStoredResults(a, { db, today: '2026-11-19' });
  assert.ok(filters.some(([k, v]) => k === 'user_id' && v === a));
  assert.ok(filters.some(([k, v]) => k === 'expected_result_date' && v === '2026-11-19'));
  assert.equal(changes[0].stage, 'RESULT');
  assert.equal(
    manualResultDue({ stage: '신청 완료', expectedResultDate: '미정' }, '2026-11-19'),
    false
  );
  const state = {
    manual: [
      { id: 'x', stage: '신청 완료', expectedResultDate: '2026-11-19' },
      { id: 'y', stage: '신청 완료', expectedResultDate: '2026-11-20' },
    ],
    details: {},
    notificationSettings: { enabled: false },
  };
  await reconcileManualResults(a, {
    today: '2026-11-19',
    read: async () => state,
    change: async (id, fn) => {
      assert.equal(id, a);
      fn(state);
    },
  });
  assert.equal(state.manual[0].stage, '결과 확인');
  assert.equal(state.manual[1].stage, '신청 완료');
  assert.equal(state.notificationSettings.enabled, false);
});
