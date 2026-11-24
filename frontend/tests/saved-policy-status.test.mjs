import test from 'node:test'
import assert from 'node:assert/strict'
import { savedPolicyStatus } from '../src/data/savedPolicyStatus.js'

test('saved policy filters use Korean dates and exclusive deadline categories', () => {
  const now = new Date('2026-11-23T16:00:00Z') // 24 November in Korea
  const open = (end) => ({ applicationStartDate: '2026-11-01', applicationEndDate: end })
  assert.equal(savedPolicyStatus(open('2026-11-23'), now), '마감')
  assert.equal(savedPolicyStatus(open('2026-11-24'), now), '마감 임박')
  assert.equal(savedPolicyStatus(open('2026-12-01'), now), '마감 임박')
  assert.equal(savedPolicyStatus(open('2026-12-02'), now), '신청 가능')
  assert.equal(savedPolicyStatus({ applicationStartDate: '2026-11-25', applicationEndDate: '2026-11-30' }, now), null)
  assert.equal(savedPolicyStatus({ isAlwaysOpen: true }, now), '신청 가능')
  assert.equal(savedPolicyStatus({}, now), null)
})
