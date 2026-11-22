import test from 'node:test';
import assert from 'node:assert/strict';
import { consentView, createConsentService } from '../src/services/consent.service.js';

const user = (consents) => ({ id: 'u1', app_metadata: { auth_version: 'v', registration: { consents } } });
const joined = { terms: true, privacy: true, personalization: true, version: '2026-11-18', agreedAt: '2026-11-18T01:00:00.000Z' };

test('가입 때 동의한 내용과 일시를 보여 준다', () => {
  const v = consentView(user(joined));
  assert.deepEqual(v.items.map((i) => [i.key, i.agreed, i.required]), [['terms', true, true], ['privacy', true, true], ['personalization', true, false]]);
  assert.equal(v.items[0].at, '2026-11-18T01:00:00.000Z');
  assert.match(v.aiNotice, /국외 외부 AI/);
});

test('가입 기록이 없는 계정은 동의 여부를 기록 없음(null)으로 보여 준다', () => {
  const v = consentView({ id: 'u2', app_metadata: {} });
  assert.deepEqual(v.items.map((i) => i.agreed), [null, null, null]);
});

function fake() {
  const calls = { deleted: 0, state: 0, patched: null };
  const db = {
    from: () => ({ delete: () => ({ eq: async () => { calls.deleted++; return { error: null }; } }) }),
    auth: { admin: { updateUserById: async (_id, patch) => { calls.patched = patch; return { error: null }; } } },
  };
  const change = async (_id, fn) => { calls.state++; fn({ sensitiveProfile: 'x' }); };
  return { calls, svc: createConsentService({ db, change, now: () => new Date('2026-11-22T00:00:00Z') }) };
}

test('선택 동의를 철회하려면 삭제 확인이 있어야 하고, 철회하면 맞춤정보를 지운다', async () => {
  const { calls, svc } = fake();
  await assert.rejects(() => svc.setPersonalization(user(joined), { agree: false }), (e) => e.code === 'CONFIRM_REQUIRED');
  assert.equal(calls.deleted, 0);
  const v = await svc.setPersonalization(user(joined), { agree: false, confirmDelete: true });
  assert.equal(calls.deleted, 1);
  assert.equal(calls.state, 1);
  const p = v.items.find((i) => i.key === 'personalization');
  assert.equal(p.agreed, false);
  assert.equal(calls.patched.app_metadata.registration.consents.personalization, false);
  assert.equal(calls.patched.app_metadata.registration.consents.terms, true); // 필수 동의는 그대로
  assert.equal(calls.patched.app_metadata.auth_version, 'v'); // 다른 계정 정보 보존
});

test('철회한 선택 동의는 다시 동의할 수 있고, 같은 상태 요청은 아무 것도 바꾸지 않는다', async () => {
  const { calls, svc } = fake();
  const off = user({ ...joined, personalization: false });
  const v = await svc.setPersonalization(off, { agree: true });
  assert.equal(v.items.find((i) => i.key === 'personalization').agreed, true);
  assert.equal(calls.deleted, 0);
  const again = fake();
  await again.svc.setPersonalization(user(joined), { agree: true });
  assert.equal(again.calls.patched, null);
});
