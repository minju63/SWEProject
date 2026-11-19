import { createHash } from 'node:crypto';

const MAX_TEXT = 600;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_USER = 6;
const CACHE_MS = 5 * 60_000;
const history = new Map();
const cache = new Map();

export const aiText = (value) => typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';

function numericClaims(value) {
  return [...value.matchAll(/\d[\d,.]*(?:\s*(?:억|만|천)?\s*원|\s*%|\s*세|\s*개월|\s*년|\s*월|\s*일)?/gu)]
    .map((match) => match[0].replace(/\s|,/g, '')).filter(Boolean);
}

export function groundedAiText(value, input) {
  const candidate = aiText(value);
  if (!candidate) return false;
  const allowedIds = new Set(input.evidence_ids ?? []);
  if ([...candidate.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/giu)]
    .some(([id]) => !allowedIds.has(id))) return false;
  if (/(?:https?:\/\/|[\w.+-]+@[\w.-]+\.[a-z]{2,})/iu.test(candidate)) return false;
  const sourceNumbers = new Set(numericClaims(JSON.stringify(input)));
  if (numericClaims(candidate).some((number) => !sourceNumbers.has(number))) return false;
  if (/(?:반드시|확정적으로|무조건)\s*(?:선정|지원|신청)/u.test(candidate)) return false;
  const policyNames = input.policy_titles ?? [input.policy?.title].filter(Boolean);
  const quotedNames = [...candidate.matchAll(/[「『“"]([^「『”"]{3,80})[」』”"]/gu)].map((match) => match[1]);
  if (quotedNames.some((name) => name.includes('정책') && !policyNames.includes(name))) return false;
  const factualSource = (input.facts ?? [input.policy?.title, input.policy?.target_summary,
    input.policy?.support_summary, input.policy?.support_content, input.policy?.benefit_type,
    input.policy?.application_method,
    ...(input.eligibility?.conditions ?? []).map((item) => JSON.stringify(item.policy_condition))])
    .filter(Boolean).join(' ');
  const neutral = /^(?:이|그|해당|정책|정책입니다|혜택|지원|지원해|지원하는|대상|관련|관련된|관련성이|있어|있습니다|합니다|받을|수|있어요|확인|필요|추가|신청|방법|기간|내용|조건|제공|제공합니다|입니다|이며|그리고|또한|통해|위해|대한|있는|하는|목적으로)$/u;
  const words = policyNames.reduce((remaining, name) => remaining.replace(name, ' '), candidate)
    .match(/[가-힣]{2,}/gu) ?? [];
  if (words.some((word) => {
    const stem = word.replace(/(?:들에게|들에게는|들을|들은|들이|들|에게|에서|으로|까지|부터|하고|하며|하는|합니다|입니다|에게는|에서는|자를|자는|자가|은|는|이|가|을|를|의|에|와|과|도|만|로)$/u, '');
    return !neutral.test(word) && stem.length >= 2 && !factualSource.includes(stem);
  })) return false;
  return true;
}

export function verdictConsistent(value, result) {
  const other = ['ELIGIBLE', 'CHECK', 'INELIGIBLE'].filter((item) => item !== result);
  if (other.some((item) => new RegExp(`\\b${item}\\b`, 'u').test(value))) return false;
  if (result === 'CHECK' && /(?:신청 가능|신청 불가|대상 아님|자격을 충족|자격이 없습니다)/u.test(value)) return false;
  if (result === 'ELIGIBLE' && /(?:신청 불가|대상 아님|자격이 없습니다)/u.test(value)) return false;
  if (result === 'INELIGIBLE' && /(?:신청 가능|모두 충족)/u.test(value)) return false;
  return true;
}

function checkLimit(userId, now) {
  if (!userId) return;
  const recent = (history.get(userId) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_USER) throw new Error('AI_RATE_LIMIT');
  recent.push(now);
  history.set(userId, recent);
  if (history.size > 1000) {
    for (const [key, times] of history) if (times.every((time) => now - time >= WINDOW_MS)) history.delete(key);
  }
}

export async function requestStructuredAI({ input, systemPrompt, schema, name, maxOutputTokens = 1000 },
  { fetchImpl = fetch, apiKey = process.env.OPENAI_API_KEY,
    model = process.env.OPENAI_MODEL || 'gpt-4.1-mini', timeoutMs = 12000, userId } = {}) {
  if (!apiKey) throw new Error('AI_NOT_CONFIGURED');
  const now = Date.now();
  const cacheKey = userId ? createHash('sha256').update(JSON.stringify({ userId, name, input })).digest('hex') : null;
  const cached = cacheKey && cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.value;
  checkLimit(userId, now);
  const task = (async () => {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model, store: false, max_output_tokens: maxOutputTokens,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(input) },
        ],
        text: { format: { type: 'json_schema', name, strict: true, schema } },
      }),
    });
    if (!response.ok) throw new Error('AI_REQUEST_FAILED');
    const body = await response.json();
    if (body.status !== 'completed') throw new Error('AI_INCOMPLETE');
    const content = body.output?.flatMap((item) => item.type === 'message' ? item.content ?? [] : []) ?? [];
    const output = content.find((item) => item.type === 'output_text')?.text;
    if (!output) throw new Error('INVALID_AI_JSON');
    try { return JSON.parse(output); } catch { throw new Error('INVALID_AI_JSON'); }
  })();
  if (cacheKey) cache.set(cacheKey, { value: task, expiresAt: now + CACHE_MS });
  try {
    const result = await task;
    if (cacheKey) cache.set(cacheKey, { value: result, expiresAt: now + CACHE_MS });
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    return result;
  } catch (error) {
    if (cacheKey) cache.delete(cacheKey);
    throw error;
  }
}
