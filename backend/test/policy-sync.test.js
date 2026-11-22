import test from 'node:test';
import assert from 'node:assert/strict';
import { DOMAINS, mapRow, skipReason, scopeOf, periodOf, uuidOf } from '../src/jobs/policySync/youthPolicy.js';

// 온통청년 API 응답 한 건 (research/raw_2026-10-02/API_BUSANJIN.json 형식)
const row = (extra = {}) => ({
  plcyNo: '20261001005400113794',
  plcyNm: '게임사 프로젝트 현장교육 프로그램',
  plcyKywdNm: '보조금,인턴',
  lclsfNm: '일자리',
  mclsfNm: '취업',
  plcySprtCn: 'ㅇ 게임기업 신규채용 인건비 지원',
  plcyAplyMthdCn: 'ㅇ 신청절차\n사업공고 → 참여기업 신청서 제출',
  aplyPrdSeCd: '0057001',
  aplyYmd: '20260701 ~ 20261231',
  aplyUrlAddr: '',
  refUrlAddr1: 'https://www.kocca.kr/shortUrl/40Cq',
  refUrlAddr2: '',
  sprtTrgtMinAge: '19',
  sprtTrgtMaxAge: '35',
  earnCndSeCd: '0043001',
  earnMaxAmt: '0',
  earnEtcCn: '',
  addAplyQlfcCndCn: '게임산업 분야 취업을 희망하는 청년',
  zipCd: '11110,11140,11170,11200,11215,11230,11260,11290,11305,11320,11350,11380,26110,26140,26170,26200,26230,26260,26290,26320,26350,26380,26410,26440,26470,26500,26530,26710,27110,28110,29110,30110,31110',
  ...extra,
});
const empty = () => ({ titles: new Set(), urls: new Set(), externalIds: new Set() });
const ctx = (existing = empty()) => ({ today: '2026-11-22', existing });

test('지역 코드로 서비스 지역을 가린다', () => {
  assert.equal(scopeOf(row()), '26'); // 부산 전체 구·군 코드
  assert.equal(scopeOf(row({ zipCd: '11110,21110,22110,23110,24110,25110,26110,27110,28110,29110,30110,31110,36110,41110,43110,44110' })), 'KR');
  assert.equal(scopeOf(row({ zipCd: '26' })), '26');
  assert.equal(scopeOf(row({ zipCd: '26380' })), '26380');
  assert.equal(scopeOf(row({ zipCd: '11110' })), null);
  assert.equal(scopeOf(row({ zipCd: '' })), null); // 코드가 없으면 전국으로 보지 않는다
});

test('신청 기간 문자열을 날짜로 바꾼다', () => {
  assert.deepEqual(periodOf(row()), ['2026-07-01', '2026-12-31']);
  assert.deepEqual(periodOf(row({ aplyYmd: '' })), [null, null]);
});

test('새 정책이면 넣고, 마감·중복·지역 밖·기간 모름은 건너뛴다', () => {
  const cfg = DOMAINS.JOB;
  assert.equal(skipReason(row(), cfg, ctx()), null);
  assert.equal(skipReason(row({ aplyYmd: '20250101 ~ 20250131' }), cfg, ctx()), 'closed');
  assert.equal(skipReason(row({ aplyPrdSeCd: '0057003' }), cfg, ctx()), 'closed');
  assert.equal(skipReason(row({ zipCd: '11110' }), cfg, ctx()), 'out_of_scope');
  assert.equal(skipReason(row({ aplyYmd: '', aplyPrdSeCd: '0057001' }), cfg, ctx()), 'unknown_period');
  assert.equal(skipReason(row({ aplyYmd: '', aplyPrdSeCd: '0057002' }), cfg, ctx()), null); // 상시
  assert.equal(skipReason(row({ refUrlAddr1: '', aplyUrlAddr: '' }), cfg, ctx()), 'no_official_url');
  const e = empty();
  e.titles.add('게임사프로젝트현장교육프로그램');
  assert.equal(skipReason(row(), cfg, ctx(e)), 'duplicate');
  const e2 = empty();
  e2.externalIds.add('youthcenter:20261001005400113794');
  assert.equal(skipReason(row(), cfg, ctx(e2)), 'already_collected');
});

test('장학·금융은 금융 관련 정책만 받는다', () => {
  const cfg = DOMAINS.FINANCE;
  assert.equal(skipReason(row({ plcyNm: '청년 요리 교실', plcyKywdNm: '', mclsfNm: '교육' }), cfg, ctx()), 'other_topic');
  assert.equal(skipReason(row({ plcyNm: '청년 희망 저축계좌' }), cfg, ctx()), null);
});

test('API 한 건을 DB 행으로 바꾼다 (자격은 확인 필요로 둔다)', () => {
  const m = mapRow(row(), DOMAINS.JOB, new Date('2026-11-22T00:00:00Z'));
  assert.equal(m.policy.collection_domain, 'JOB');
  assert.equal(m.policy.eligibility_verified, false);
  assert.equal(m.policy.classification_status, '확인필요');
  assert.equal(m.policy.min_age, 19);
  assert.equal(m.policy.max_age, 35);
  assert.equal(m.policy.income_condition, '제한없음');
  assert.equal(m.policy.application_end_date, '2026-12-31');
  assert.equal(m.policy.is_always_open, false);
  assert.equal(m.policy.official_url, 'https://www.kocca.kr/shortUrl/40Cq');
  assert.equal(m.region, '26');
  assert.equal(m.subcategoryName, '채용·인턴');
  assert.equal(m.detail.job_type, '인턴십');
  assert.equal(m.source.external_id, 'youthcenter:20261001005400113794');
  assert.equal(m.policy.policy_id, uuidOf('policy:youthcenter:20261001005400113794')); // 다시 돌려도 같은 번호
  assert.match(m.policy.policy_id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('상시 모집은 마감일 없이 상시로 저장한다', () => {
  const m = mapRow(row({ aplyPrdSeCd: '0057002', aplyYmd: '' }), DOMAINS.JOB);
  assert.equal(m.policy.is_always_open, true);
  assert.equal(m.policy.application_end_date, null);
});
