import * as policyRepo from '../repositories/policy.repository.js';
import { getSimilarPolicies } from './policy-similar.service.js';
import { normalizedPolicyTitle } from './policy-similarity.service.js';
import { policyStatus } from './policy-status.service.js';
import { aiText, groundedAiText, requestStructuredAI } from './ai-common.service.js';
import { aiPolicyFacts, comparisonGroundingInput, verifiedComparison } from './policy-compare-ai-facts.service.js';
import { POLICY_COMPARE_CANDIDATES_SYSTEM_PROMPT } from '../prompts/policy-compare-candidates.prompt.js';

const RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { recommendations: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    properties: {
      policy_id: { type: 'string' }, reason: { type: 'string' },
      similarities: { type: 'array', items: { type: 'string' } },
      comparison_points: { type: 'array', items: { type: 'string' } },
      evidence_ids: { type: 'array', items: { type: 'string' } },
    },
    required: ['policy_id', 'reason', 'similarities', 'comparison_points', 'evidence_ids'],
  } } },
  required: ['recommendations'],
};

function comparisonPoints(base, candidate) {
  return verifiedComparison(base, candidate).differences
    .slice(0, 4).map((item) => `${item.topic}: ${item.policy_a} / ${item.policy_b}`.slice(0, 260));
}

function compactFacts(policy, result) {
  const facts = aiPolicyFacts(policy, result);
  return { ...facts,
    target_summary: facts.target_summary?.slice(0, 240) ?? null,
    support_summary: facts.support_summary?.slice(0, 240) ?? null,
    support_content: facts.support_content?.slice(0, 300) ?? null,
    policy_conditions: facts.policy_conditions?.slice(0, 300) ?? null,
  };
}

export function candidateAiInput(base, candidates) {
  return {
    base_policy: compactFacts(base, base.eligibility_result),
    candidates: candidates.map((candidate) => ({
      ...compactFacts(candidate, candidate.eligibility_result),
      similarity_score: candidate.similarity_score,
      verified_similarities: candidate.reasons ?? [],
      verified_comparison_points: comparisonPoints(base, candidate),
      evidence_ids: [base.policy_id, candidate.policy_id],
    })),
  };
}

function enriched(base, candidate, aiItem = null) {
  const baseFacts = aiPolicyFacts(base, base.eligibility_result);
  const candidateFacts = aiPolicyFacts(candidate, candidate.eligibility_result);
  const grounding = comparisonGroundingInput(baseFacts, candidateFacts, candidate.reasons);
  const validText = (value) => groundedAiText(value, grounding) &&
    !/(?:현재 신청 가능|무조건 신청 가능)/u.test(value) &&
    !(candidate.eligibility_result !== 'ELIGIBLE' && /신청 가능/u.test(value)) &&
    !(candidate.recruitment_status === '마감' && /(?:모집 중|현재 신청)/u.test(value));
  const reasons = candidate.reasons ?? [];
  const points = comparisonPoints(base, candidate);
  const reason = aiItem && validText(aiItem.reason) ? aiText(aiItem.reason)
    : reasons.slice(0, 2).join(' · ') || '실제 정책의 지원 내용을 비교해 보세요.';
  const similarities = Array.isArray(aiItem?.similarities)
    ? aiItem.similarities.filter((item) => typeof item === 'string' && reasons.includes(item)) : [];
  const differences = Array.isArray(aiItem?.comparison_points)
    ? aiItem.comparison_points.filter((item) => typeof item === 'string' && points.includes(item)) : [];
  const evidenceIds = [base.policy_id, candidate.policy_id];
  return {
    ...candidate,
    recommendation_reason: reason,
    similarities: similarities.length ? similarities : reasons.slice(0, 3),
    comparison_points: differences.length ? differences : points.slice(0, 3),
    evidence_ids: [...new Set([...evidenceIds,
      ...(Array.isArray(aiItem?.evidence_ids) ? aiItem.evidence_ids.filter((id) => evidenceIds.includes(id)) : [])])],
  };
}

export function validateCandidateRecommendations(raw, base, candidates) {
  if (!raw || !Array.isArray(raw.recommendations)) throw new Error('INVALID_AI_JSON');
  const byId = new Map(candidates.map((item) => [item.policy_id, item]));
  const seen = new Set();
  const selected = [];
  const baseTitle = normalizedPolicyTitle(base.title);
  for (const item of raw.recommendations.slice(0, 20)) {
    if (!item || typeof item.policy_id !== 'string' || typeof item.reason !== 'string' ||
      !Array.isArray(item.similarities) || !Array.isArray(item.comparison_points) ||
      !Array.isArray(item.evidence_ids)) continue;
    const candidate = byId.get(item.policy_id);
    if (!candidate || candidate.policy_id === base.policy_id || seen.has(candidate.policy_id) ||
      normalizedPolicyTitle(candidate.title) === baseTitle) continue;
    seen.add(candidate.policy_id);
    selected.push(enriched(base, candidate, item));
    if (selected.length === 3) break;
  }
  for (const candidate of candidates) {
    if (selected.length === Math.min(3, candidates.length)) break;
    if (!seen.has(candidate.policy_id)) {
      seen.add(candidate.policy_id);
      selected.push(enriched(base, candidate));
    }
  }
  return selected;
}

export async function getAiCompareCandidates(policyId, userId) {
  const [similar, index] = await Promise.all([
    getSimilarPolicies(policyId, userId, { limit: 6 }),
    policyRepo.findSimilarityIndex(),
  ]);
  const byId = new Map(index.map((item) => [item.policy_id, item]));
  const indexedBase = byId.get(policyId);
  const base = { ...indexedBase, ...policyStatus(indexedBase),
    eligibility_result: similar.base_eligibility_result };
  const candidates = similar.items.map((item) => ({ ...byId.get(item.policy_id), ...item }));
  if (!candidates.length) return { status: 'empty', items: [] };
  const fallback = (errorCode = null) => ({ status: 'fallback', error_code: errorCode,
    items: candidates.slice(0, 3).map((item) => enriched(base, item)) });
  try {
    const raw = await requestStructuredAI({ input: candidateAiInput(base, candidates),
      systemPrompt: POLICY_COMPARE_CANDIDATES_SYSTEM_PROMPT, schema: RESPONSE_SCHEMA,
      name: 'policy_compare_candidates', maxOutputTokens: 1200 }, { userId, timeoutMs: 20000 });
    return { status: 'ok', items: validateCandidateRecommendations(raw, base, candidates) };
  } catch (error) {
    const allowed = ['AI_NOT_CONFIGURED', 'AI_RATE_LIMIT', 'AI_INCOMPLETE',
      'AI_REQUEST_FAILED', 'INVALID_AI_JSON'];
    return fallback(error.name === 'TimeoutError' ? 'AI_TIMEOUT'
      : allowed.includes(error.message) ? error.message : 'AI_ERROR');
  }
}
