// 벡터 검색용 조각 만들기: 정책·용어를 "섹션"으로 나눈 짧은 글로 바꾼다 (AI-REQ-COM-007).
// 허용된 공개 텍스트만 쓴다(정책 공고 내용, 용어 사전). 사용자 정보는 들어가지 않는다.
import { createHash } from 'node:crypto';
import { GLOSSARY } from '../data/glossary.js';

const MIN_LEN = 6;
const MAX_LEN = 1200; // 너무 긴 글은 앞부분만 (임베딩 입력 한도·비용)
const clean = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const meaningful = (v) => {
  const t = clean(v);
  return t.length >= MIN_LEN && !/^[\d\s-]+$/.test(t); // 숫자뿐인 관리 코드는 뺀다
};
export const hashOf = (text) => createHash('sha1').update(text).digest('hex');

function conditionTexts(policy) {
  const conditions = policy.eligibility_conditions;
  const walk = (list) =>
    (Array.isArray(list) ? list : []).flatMap((c) =>
      c?.conditions ? walk(c.conditions) : c?.text ? [c.text] : []
    );
  return [...walk(conditions?.required), ...walk(conditions?.exclusions)];
}

export function policyChunks(policy) {
  const title = clean(policy.title);
  const parts = [
    ['개요', [title, policy.support_summary]],
    ['지원 내용', [title, policy.support_content]],
    ['대상·조건', [title, policy.target_summary, policy.income_condition, ...conditionTexts(policy)]],
    ['신청 방법', [title, policy.application_method]],
  ];
  return parts
    .map(([section, values]) => {
      const [head, ...rest] = values;
      const body = rest.filter(meaningful).map(clean).join(' ');
      return { section, body, content: `${head}\n${body}`.slice(0, MAX_LEN) };
    })
    .filter((c) => meaningful(c.body))
    .map(({ section, content }) => ({
      kind: 'POLICY',
      ref_id: policy.policy_id,
      section,
      content,
      content_hash: hashOf(content),
    }));
}

export function termChunks() {
  return GLOSSARY.map((g) => {
    const content = clean(`${g.term} ${g.aliases.join(' ')} ${g.summary}`).slice(0, MAX_LEN);
    return { kind: 'TERM', ref_id: g.term, section: '설명', content, content_hash: hashOf(content) };
  });
}
