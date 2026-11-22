// 문장을 숫자 벡터로 바꾸는 OpenAI 임베딩 호출 (AI 비서 벡터 검색, AI-REQ-COM-007).
// 별도 SDK 없이 fetch 로 부른다. 키가 없거나 EMBEDDING_ENABLED=false 이면 꺼지고, 호출한 쪽은 규칙 기반 검색으로 대신한다.
// 보내는 것: 정책·용어의 공개 텍스트, 개인정보를 가린 질문. 계정·프로필 정보는 보내지 않는다 (NFR-017·023).

const ENDPOINT = 'https://api.openai.com/v1/embeddings';
export const EMBEDDING_DIM = 1536; // text-embedding-3-small
const modelName = () => process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

export const isEmbeddingEnabled = () =>
  Boolean(process.env.OPENAI_API_KEY) && process.env.EMBEDDING_ENABLED !== 'false';

async function request(input, timeoutMs) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: modelName(), input }),
  });
  if (!res.ok) throw new Error(`OpenAI 임베딩 ${res.status}`);
  const data = await res.json();
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// 여러 문장을 한꺼번에 (조각 생성용). 100개씩 나눠 보낸다
export async function embedTexts(texts, { timeoutMs = 30000 } = {}) {
  const out = [];
  for (let i = 0; i < texts.length; i += 100)
    out.push(...(await request(texts.slice(i, i + 100), timeoutMs)));
  return out;
}

// 질문 하나: 같은 질문은 잠깐 기억해 다시 부르지 않는다 (응답 속도·비용)
const cache = new Map();
const CACHE_MAX = 200;
export async function embedQuery(text, { timeoutMs = 4000 } = {}) {
  if (!isEmbeddingEnabled() || timeoutMs < 500) return null;
  const key = text.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);
  try {
    const [vector] = await request([text.trim()], timeoutMs);
    cache.set(key, vector);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return vector;
  } catch (e) {
    console.warn('[임베딩] 실패, 규칙 기반 검색으로 대체:', e.message);
    return null;
  }
}

export function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
