import test from 'node:test';
import assert from 'node:assert/strict';
import { hasBlockingProfileMismatch, sortHomePreview } from '../src/services/home.service.js';

const checked = (status) => ({ status, profile_comparison: true });
const group = (operator, ...children) => ({ operator, children });

test('home excludes a confirmed blocking profile mismatch but preserves unknown alternatives', () => {
  assert.equal(hasBlockingProfileMismatch({ conditions: [group('AND', checked('UNSATISFIED'), { status: 'UNKNOWN' })] }), true);
  assert.equal(hasBlockingProfileMismatch({ conditions: [group('OR', checked('UNSATISFIED'), { status: 'UNKNOWN' })] }), false);
  assert.equal(hasBlockingProfileMismatch({ conditions: [group('OR', checked('UNSATISFIED'), checked('UNSATISFIED'))] }), true);
  assert.equal(hasBlockingProfileMismatch({ conditions: [{ status: 'UNSATISFIED' }] }), false);
  assert.equal(hasBlockingProfileMismatch({ conditions: [{ status: 'UNSATISFIED', partial_profile_check: true }] }), false);
  assert.equal(hasBlockingProfileMismatch({ conditions: [{ ...checked('UNSATISFIED'), exclusion: true }] }), false);
});

test('home sorts eligible policies first, then nearest deadline, then Korean title', () => {
  const item = (title, eligibility, d_day) => ({ title, eligibility: { result: eligibility }, d_day });
  const sorted = sortHomePreview([item('다', 'CHECK', 2), item('나', 'ELIGIBLE', 8),
    item('가', 'CHECK', 2), item('라', 'CHECK', null)]);
  assert.deepEqual(sorted.map((p) => p.title), ['나', '가', '다', '라']);
});
