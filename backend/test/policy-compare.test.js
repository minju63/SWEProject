import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
const { buildPolicyComparison, getPolicyComparison } = await import('../src/services/policy-compare.service.js');

const policy = (policy_id, title, ages) => ({
  policy_id, title, eligibility_verified: true,
  eligibility_conditions: { all: [{ field: 'age', op: 'between', value: ages }] },
});

test('기준 정책과 비교 정책은 각각 독립적으로 자격 판정한다', () => {
  const birthYear = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric',
  }).format(new Date())) - 26;
  const result = buildPolicyComparison(policy('a', '청년 월세', [20, 34]),
    policy('b', '청년 전세', [30, 39]), { birth_date: `${birthYear}-01-01` });
  assert.equal(result.base.policy_id, 'a');
  assert.equal(result.comparison.policy_id, 'b');
  assert.equal(result.eligibility.base.result, 'ELIGIBLE');
  assert.equal(result.eligibility.comparison.result, 'INELIGIBLE');
});

test('같은 ID와 중복 수집된 같은 이름은 비교 전에 거부한다', async () => {
  const base = policy('a', '청년 월세 지원', [20, 34]);
  assert.throws(() => buildPolicyComparison(base, base, null), (error) => error.code === 'SAME_POLICY');
  assert.throws(() => buildPolicyComparison(base, policy('b', '청년-월세 지원', [20, 34]), null),
    (error) => error.code === 'SAME_POLICY');
  await assert.rejects(getPolicyComparison('a', 'a', 'trusted-user'),
    (error) => error.code === 'SAME_POLICY');
});
