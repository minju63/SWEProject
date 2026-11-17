// OpenAI 호출 (AI 비서 Dr.부). 별도 SDK 없이 fetch 로 Chat Completions 를 부른다.
// .env 의 OPENAI_API_KEY 와 OPENAI_MODEL 이 모두 채워져 있어야 켜진다. 비어 있으면 규칙 기반으로만 답한다.
// 사용자 질문은 개인정보를 가린 뒤에만 보낸다 (assistant.service 의 maskPersonalInfo).

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
// 질문 하나에 쓸 수 있는 LLM 시간은 assistant.service 가 정한다 (AI 응답 95%가 10초 이내, NFR-001·AI-REQ-02)

export const isLlmEnabled = () => Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL);

async function complete(messages, { json = false, maxTokens = 400, timeoutMs } = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      messages,
      max_completion_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// 실패하거나 꺼져 있으면 null 을 돌려줘서 호출한 쪽이 규칙 기반 결과로 대신하게 한다
export async function askJson(system, user, timeoutMs) {
  if (!isLlmEnabled() || timeoutMs < 500) return null;
  try {
    return JSON.parse(
      await complete(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        { json: true, timeoutMs }
      )
    );
  } catch (err) {
    console.warn('[llm] 실패, 규칙 기반으로 대체:', err.message);
    return null;
  }
}

export async function askText(system, user, timeoutMs) {
  if (!isLlmEnabled() || timeoutMs < 500) return null;
  try {
    return (
      (
        await complete([
          { role: 'system', content: system },
          { role: 'user', content: user },
        ])
      ).trim() || null
    );
  } catch (err) {
    console.warn('[llm] 실패, 규칙 기반으로 대체:', err.message);
    return null;
  }
}
