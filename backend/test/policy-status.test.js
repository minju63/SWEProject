import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePolicyStatus, policyStatus } from '../src/services/policy-status.service.js';

const policy = { item_type: 'POLICY', application_start_date: '2026-11-17',
  application_end_date: '2026-11-17', is_always_open: false };

test('KST 시작일 00:00과 마감일 23:59 경계를 계산한다', () => {
  assert.equal(calculatePolicyStatus(policy, new Date('2026-11-16T14:59:59Z')).recruitment_status, '모집 예정');
  assert.equal(calculatePolicyStatus(policy, new Date('2026-11-16T15:00:00Z')).recruitment_status, '모집 중');
  const deadline = calculatePolicyStatus(policy, new Date('2026-11-17T14:59:00Z'));
  assert.equal(deadline.recruitment_status, '모집 중');
  assert.equal(deadline.d_day, 0);
  assert.equal(deadline.deadline_at, '2026-11-17T14:59:00.000Z');
  assert.equal(deadline.deadline_time_notice, '마감 시각 미기재, 원문 확인 필요');
  const closed = calculatePolicyStatus(policy, new Date('2026-11-17T14:59:01Z'));
  assert.equal(closed.recruitment_status, '마감');
  assert.equal(closed.d_day, -1);
});

test('상시, 기간 미정, 종료일만 있는 정책을 구분한다', () => {
  assert.equal(calculatePolicyStatus({ ...policy, is_always_open: true }).recruitment_status, '상시');
  assert.equal(calculatePolicyStatus({ item_type: 'POLICY' }).recruitment_status, '기간 미정');
  const endOnly = calculatePolicyStatus({ application_end_date: '2026-11-18' },
    new Date('2026-11-16T15:00:00Z'));
  assert.equal(endOnly.recruitment_status, '모집 중');
  assert.equal(endOnly.d_day, 1);
});

test('행사는 기존 DB 뷰에서 계산한 별도 상태를 유지한다', () => {
  const event = { item_type: 'EVENT', application_end_date: '2026-11-17' };
  const view = { recruitment_status: '진행 중', d_day: 1 };
  assert.equal(policyStatus(event, view), view);
});
