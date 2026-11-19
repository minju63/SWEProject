'use strict';
const { test } = require('node:test'),
  assert = require('node:assert/strict');
const C = require('./record-contract.cjs'),
  { dates } = require('./auto.cjs');
const { checkContract } = require('./check-contract.cjs');
const source = {
  source_url: 'https://www.busan.go.kr/nbgosi/view?sno=1',
  checked_at: '2026-11-19T00:00:00.000Z',
  extracted_text:
    '본인 무주택. 부산 거주 또는 부산 기업 면접. 중복지원 불가; 동일사업 수혜자 제외. 접수 2026-11-01 ~ 2026-12-31.',
};
test('both import paths use canonical condition keys, preserve OR, detach review notices and never approve', () => {
  const input = {
    required: [
      {
        operator: 'OR',
        conditions: [
          { operator: 'EQ', field: 'owns_home', subject: 'applicant', value: false },
          { operator: 'RAW', text: '부산 기업 면접' },
        ],
      },
      { operator: 'RAW', text: '전체 자격을 판정하지 않음' },
    ],
    exclusions: [{ operator: 'RAW', text: '중복지원 불가; 동일사업 수혜자 제외' }],
  };
  const result = C.conditions(input, source, ['source-id']);
  assert.equal(result.required.length, 1);
  assert.equal(result.required[0].operator, 'OR');
  assert.equal(result.required[0].conditions[0].text, '본인 무주택');
  assert.equal(result.required[0].conditions[0].operator, 'RAW');
  assert.equal(result.exclusions.length, 2);
  assert.equal(result.checked_at, source.checked_at);
  assert.deepEqual(result.review_ir, input);
  assert.equal(result.profile_contract.overall_verdict, 'CHECK');
  assert.equal(result.profile_contract.checks.length, 0);
  for (const key of ['all', 'any', 'exclude']) assert.equal(Object.hasOwn(result, key), false);
});
test('automatic conditions require official-body support; unsupported API claims remain audit data', () => {
  const result = C.automaticConditions(
    {
      sprtTrgtEtcCn: '본인 무주택',
      earnEtcCn: '소득 100% 이하',
      ptcpPrpTrgtCn: '중복지원 불가; 동일사업 수혜자 제외',
    },
    source,
    []
  );
  assert.equal(result.required.length, 1);
  assert.equal(result.required[0].text, '본인 무주택');
  assert.equal(result.exclusions.length, 2);
  assert.equal(result.api_conditions.income, '소득 100% 이하');
  assert.equal(result.collection.human_reviewed, false);
});
test('only a full range supported by official text becomes dates; relative/monthly/unknown remain explanations', () => {
  const exact = C.period('20261101 ~ 20261231', source, dates);
  assert.equal(exact.application_end_date, '2026-12-31');
  assert.equal(exact.application_period_unknown_reason, null);
  for (const raw of [
    '상시',
    '매월 10일까지',
    '전입일부터 3개월 이내',
    '2026년 2월 ~ 12월, 예산 소진 시까지',
    '20261101 ~ 20261230',
  ]) {
    const result = C.period(raw, source, dates);
    assert.equal(result.application_start_date, null);
    assert.equal(result.application_end_date, null);
    assert.equal(result.is_always_open, false);
    assert.ok(result.application_period_unknown_reason.includes(raw));
  }
});
test('conditional closure is preserved and mixed cooling/heating periods cannot become one date range', () => {
  const budget = C.period(
    '20261101 ~ 20261231',
    { ...source, extracted_text: source.extracted_text + ' 예산 소진 시 마감' },
    dates
  );
  assert.match(budget.application_period_unknown_reason, /예산 소진/);
  const split = C.period(
    '20261101 ~ 20261231',
    {
      ...source,
      extracted_text: source.extracted_text + ' 냉방은 별도 접수, 난방은 예산 소진 시까지',
    },
    dates
  );
  assert.equal(split.application_start_date, null);
  assert.equal(split.application_end_date, null);
});
test('record validation rejects legacy JSON, unsupported URLs and invalid document shapes', () => {
  const record = {
    collection_domain: 'HOUSING',
    item_type: 'POLICY',
    official_url: source.source_url,
    eligibility_verified: false,
    eligibility_conditions: C.conditions({}, source),
    ...C.period('', source, dates),
    application_process: ['온라인 신청'],
    required_documents: [{ key: 'doc', name: '신청서', required: true, confirmed: true }],
  };
  C.assertRecord(record);
  for (const official_url of [
    'https://blog.naver.com/one',
    'https://www.korea.kr/news/one',
    'https://www.myhome.go.kr/html/content/MyHomeGuideRH109.html',
    'https://young.busan.go.kr/cmm/fms/FileDown.do?id=1',
    'https://evil.example/notice',
  ])
    assert.throws(() => C.assertRecord({ ...record, official_url }), /Official/);
  assert.throws(() => C.assertRecord({ ...record, eligibility_verified: true }), /contract/);
  assert.throws(
    () =>
      C.assertRecord({
        ...record,
        eligibility_conditions: { ...record.eligibility_conditions, all: [] },
      }),
    /contract/
  );
  assert.throws(() => C.assertRecord({ ...record, required_documents: ['신청서'] }), /document/);
  assert.throws(
    () =>
      C.assertRecord({
        ...record,
        required_documents: [...record.required_documents, ...record.required_documents],
      }),
    /document/
  );
});
test('live contract audit only reads HOUSING and validates the current DB column names', async () => {
  const calls = [],
    properties = Object.fromEntries(
      [
        'eligibility_conditions',
        'eligibility_verified',
        'application_period_unknown_reason',
        'application_process',
        'required_documents',
      ].map((k) => [k, {}])
    );
  const io = {
    db: async (table, query, method) => {
      calls.push({ table, query, method });
      assert.equal(method, undefined);
      return table ? [{ item_type: 'EVENT' }] : { definitions: { policy: { properties } } };
    },
  };
  const result = await checkContract('', {}, io);
  assert.equal(result.db_writes, 0);
  assert.equal(result.events, 1);
  assert.equal(result.status, 'CONTRACT_MATCH');
  assert.match(calls[1].query, /collection_domain=eq.HOUSING/);
  delete properties.application_period_unknown_reason;
  await assert.rejects(checkContract('', {}, io), /Missing live policy columns/);
});
