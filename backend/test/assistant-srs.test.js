import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const assistant = await import('../src/services/assistant.service.js');
const { AI_TIMEOUT_MS } = await import('../src/services/ai-common.service.js');
const { supabase } = await import('../src/lib/supabase.js');
const opsLog = await import('../src/lib/opsLog.js');

const { keepsFacts, definitionGrounded, dropUnknownCitations, sanitizeExtraction, profileWithQuestion } = assistant;

// ---------------------------------------------------------------- NFR-COM-001: AI 응답 제한 시간
test('AI 호출 제한 시간은 10초 안에 대체 결과까지 보여줄 수 있게 10초보다 짧다', () => {
  assert.ok(AI_TIMEOUT_MS > 0 && AI_TIMEOUT_MS < 10_000);
});

// ---------------------------------------------------------------- AI-REQ-COM-005: 생성 결과 검증
const original = '**청년 월세 지원**은 3건 중 첫 번째예요. 월 20만원을 지원해요.';

test('원문의 숫자와 정책명을 그대로 두고 말투만 바꾼 문장은 통과한다', () => {
  assert.equal(keepsFacts(original, '**청년 월세 지원**은 3건 중 첫 번째랍니다. 월 20만원을 지원해 드려요.'), true);
});

test('원문의 숫자나 정책명이 빠지면 거부한다', () => {
  assert.equal(keepsFacts(original, '**청년 월세 지원**을 월 지원해 드려요.'), false);
  assert.equal(keepsFacts(original, '청년 월세 지원은 3건 중 첫 번째, 월 20만원이에요.'), false);
});

test('없던 숫자·정책명·주소·정책 번호·확정 표현을 만들면 거부한다', () => {
  assert.equal(keepsFacts(original, `${original} 최대 12개월 동안 받을 수 있어요.`), false);
  assert.equal(keepsFacts(original, `${original} **청년 도약계좌**도 있어요.`), false);
  assert.equal(keepsFacts(original, `${original} 자세한 내용은 https://example.com 에서 보세요.`), false);
  assert.equal(keepsFacts(original, `${original} 정책 번호 123e4567-e89b-12d3-a456-426614174000`), false);
  assert.equal(keepsFacts(original, `${original} 반드시 선정돼요.`), false);
});

test('정책 종류 설명에 근거 글에 없는 숫자·주소가 있으면 거부한다', () => {
  const source = '월세\n- 청년 월세 지원: 월 20만원, 12개월';
  assert.equal(definitionGrounded('월세 부담을 덜어 주는 현금 지원이에요. 월 20만원을 줘요.', source), true);
  assert.equal(definitionGrounded('월세 부담을 덜어 주는 지원이에요. 최대 50만원이에요.', source), false);
  assert.equal(definitionGrounded('자세한 건 www.example.com 을 보세요.', source), false);
});

test('목록에 없는 정책 번호를 인용한 카드·출처·이유는 뺀다', () => {
  const known = new Set(['a', 'b']);
  const { answer, dropped } = dropUnknownCitations(
    {
      type: 'recommend',
      cards: [{ policy_id: 'a' }, { policy_id: 'x' }],
      sources: [{ policy_id: 'b' }, { policy_id: 'y' }],
      why_items: [{ policy_id: 'x' }],
      policy_id: 'x',
      context: { picks: ['a', 'x'] },
    },
    known
  );
  assert.deepEqual(answer.cards, [{ policy_id: 'a' }]);
  assert.deepEqual(answer.sources, [{ policy_id: 'b' }]);
  assert.deepEqual(answer.why_items, []);
  assert.equal(answer.policy_id, undefined);
  assert.deepEqual(answer.context.picks, ['a']);
  assert.equal(dropped, 4);
});

test('모두 목록에 있는 정책이면 아무것도 빼지 않는다', () => {
  const { dropped } = dropUnknownCitations({ cards: [{ policy_id: 'a' }], sources: [{ policy_id: 'a' }] }, new Set(['a']));
  assert.equal(dropped, 0);
});

// ---------------------------------------------------------------- AI-REQ-COM-004: 소득·가구·주거 형태 추출
const allowed = { guNames: ['사하구'], statuses: ['대학생(휴학)'], categories: ['주거·생활'] };

test('AI가 뽑은 가구·주거·소득 값은 허용된 값만 남긴다', () => {
  const out = sanitizeExtraction(
    {
      intent: 'recommend',
      household_type: '1인 거주',
      housing_type: '월세',
      home_ownership: '무주택',
      lives_separately: true,
      income_group: '차상위계층',
    },
    allowed
  );
  assert.equal(out.conditions.household_type, '1인 거주');
  assert.equal(out.conditions.housing_type, '월세');
  assert.equal(out.conditions.home_ownership, '무주택');
  assert.equal(out.conditions.lives_separately, true);
  assert.deepEqual(out.conditions.special_targets, ['차상위계층']);
});

test('허용 목록 밖의 값이나 월 소득 금액은 버린다', () => {
  const out = sanitizeExtraction(
    { household_type: '아무나', housing_type: '펜트하우스', home_ownership: '몰라', lives_separately: 'yes', income_group: '월 300만원' },
    allowed
  );
  assert.equal(out.conditions.household_type, null);
  assert.equal(out.conditions.housing_type, null);
  assert.equal(out.conditions.home_ownership, null);
  assert.equal(out.conditions.lives_separately, null);
  assert.deepEqual(out.conditions.special_targets, []);
});

test('질문의 가구·주거·소득 조건은 그 질문의 임시 프로필에만 반영하고 저장된 프로필은 바꾸지 않는다', () => {
  const saved = { special_targets: ['장애인'] };
  const { profile, asked } = profileWithQuestion('차상위인데 혼자 사는 무주택자예요', saved, [], null);
  assert.equal(profile.household_type, '1인 거주');
  assert.equal(profile.home_ownership, '무주택');
  assert.deepEqual(profile.special_targets, ['장애인', '차상위계층']);
  assert.ok(asked.includes('1인 거주') && asked.includes('무주택') && asked.includes('차상위계층'));
  assert.deepEqual(saved, { special_targets: ['장애인'] });
});

test('AI 추출 값도 임시 프로필에 반영한다', () => {
  const { profile, asked } = profileWithQuestion(
    '질문',
    {},
    [],
    { age: null, household_type: '가족과 거주', housing_type: '전세', lives_separately: false, special_targets: ['기초생활수급자'] }
  );
  assert.equal(profile.household_type, '가족과 거주');
  assert.equal(profile.housing_type, '전세');
  assert.equal(profile.lives_separately, false);
  assert.deepEqual(profile.special_targets, ['기초생활수급자']);
  assert.ok(asked.includes('전세 거주') && asked.includes('부모와 함께 거주'));
});

test('"월세 지원" 같은 정책 주제어만으로 주거 형태를 읽지 않는다', () => {
  const { profile } = profileWithQuestion('청년 월세 지원 알려줘', {}, [], null);
  assert.equal(profile.housing_type, undefined);
});

// ---------------------------------------------------------------- NFR-COM-005: AI 로그에 시간·대체 여부
function stubInsert(handler) {
  const rows = [];
  const original = supabase.from;
  supabase.from = (table) => ({
    insert: async (row) => {
      rows.push({ table, row });
      return handler ? handler(row, rows.length) : { error: null };
    },
  });
  return { rows, restore: () => { supabase.from = original; } };
}
const tick = () => new Promise((r) => setTimeout(r, 20));

test('AI 로그에 걸린 시간과 대체 여부를 남긴다', async () => {
  opsLog.resetLogState();
  const stub = stubInsert();
  try {
    opsLog.logAi({ feature: 'POLICY_EXPLANATION', policyId: 'p1', durationMs: 1234.4, fallback: true });
    await tick();
    assert.equal(stub.rows[0].table, 'ai_execution_log');
    assert.equal(stub.rows[0].row.duration_ms, 1234);
    assert.equal(stub.rows[0].row.fallback, true);
    assert.equal(stub.rows[0].row.status, '성공');
    assert.ok(!('question' in stub.rows[0].row)); // 질문 원문 같은 값은 없다
  } finally {
    stub.restore();
  }
});

test('시간·대체 여부 컬럼이 아직 없는 DB에서는 예전 컬럼만으로 다시 기록한다', async () => {
  const stub = stubInsert((row, n) => (n === 1 ? { error: { message: 'column "duration_ms" of relation "ai_execution_log" does not exist' } } : { error: null }));
  opsLog.resetLogState();
  try {
    opsLog.logAi({ feature: 'ASSISTANT:recommend', durationMs: 50, fallback: false });
    await tick();
    assert.equal(stub.rows.length, 2);
    assert.ok('duration_ms' in stub.rows[0].row);
    assert.ok(!('duration_ms' in stub.rows[1].row));
    assert.equal(stub.rows[1].row.feature_type, 'ASSISTANT:recommend');
  } finally {
    stub.restore();
    opsLog.resetLogState();
  }
});

test('AI 오류는 질문·내용 없이 짧은 코드로만 기록한다', () => {
  assert.equal(opsLog.aiErrorCode(Object.assign(new Error('x'), { name: 'TimeoutError' })), 'AI_TIMEOUT');
  assert.equal(opsLog.aiErrorCode(new Error('AI_REQUEST_FAILED')), 'AI_REQUEST_FAILED');
  assert.equal(opsLog.aiErrorCode(new Error('아주 긴 오류 내용 질문 원문이 섞여 있을 수도 있다')), 'AI_ERROR');
  assert.equal(opsLog.aiErrorCode(null), null);
});

// ---------------------------------------------------------------- NFR-COM-026: 보안 감사 로그
test('운영자·배치의 데이터 변경을 작업자·시각·대상과 함께 감사 로그에 남긴다', async () => {
  const stub = stubInsert();
  try {
    await opsLog.logAudit({ action: 'POLICY_SYNC', table: 'policy', key: 'JOB 2026-11-24 added=3 failed=0' });
    await opsLog.logAudit({ actorUserId: 'u1', action: 'MANUAL_FIX', table: 'place', ok: false, errorCode: 'CONFLICT' });
    assert.equal(stub.rows[0].table, 'security_audit_log');
    assert.deepEqual(
      { ...stub.rows[0].row },
      { actor_user_id: null, action_type: 'POLICY_SYNC', target_table: 'policy', target_record_key: 'JOB 2026-11-24 added=3 failed=0', result: '성공', error_code: null }
    );
    assert.equal(stub.rows[1].row.actor_user_id, 'u1');
    assert.equal(stub.rows[1].row.result, '실패');
    assert.equal(stub.rows[1].row.error_code, 'CONFLICT');
  } finally {
    stub.restore();
  }
});
