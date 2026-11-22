import test from 'node:test';
import assert from 'node:assert/strict';
import { planNotifications } from '../src/jobs/contentNotifications.js';

const on = { enabled: true, recommendations: true, policyAlerts: true, eventAlerts: true, facilityAlerts: true };
const pol = (id, title) => ({ policy_id: id, title });

test('설정이 모두 켜져 있으면 맞춤·정책·문화행사·시설 알림을 각각 만든다', () => {
  const rows = planNotifications({
    settings: on,
    matched: [pol('a', '청년 월세 지원')],
    newPolicies: [pol('a', '청년 월세 지원'), pol('b', '교통비 지원')],
    newEvents: [pol('e', '작은 음악회')],
    myPlaces: [{ place_id: 'p1', name: '새 도서관' }],
    guName: '사하구',
  });
  assert.deepEqual(rows.map((r) => r.type), ['NEW_MATCH', 'POLICY', 'EVENT', 'FACILITY']);
  // 맞춤으로 이미 알린 정책은 정책 알림에서 뺀다
  assert.deepEqual(rows[1].ids, ['b']);
  assert.match(rows[3].title, /사하구에 새 시설 1곳/);
});

test('전체 알림이 꺼져 있거나 종류별 설정이 꺼져 있으면 보내지 않는다', () => {
  const args = { matched: [pol('a', 'x')], newPolicies: [pol('a', 'x')], newEvents: [pol('e', 'y')], myPlaces: [{ place_id: 'p', name: 'z' }], guName: '사하구' };
  assert.deepEqual(planNotifications({ ...args, settings: { ...on, enabled: false } }), []);
  const rows = planNotifications({ ...args, settings: { ...on, recommendations: false, policyAlerts: false } });
  assert.deepEqual(rows.map((r) => r.type), ['EVENT', 'FACILITY']);
});

test('3건 이상이면 이름은 두 개만 적고 나머지는 건수로 알린다', () => {
  const rows = planNotifications({ settings: on, newPolicies: [pol('1', 'A'), pol('2', 'B'), pol('3', 'C')] });
  assert.equal(rows[0].body, 'A, B 외 1건');
});
