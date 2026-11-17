import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchRecommend, sendChat } from '../api/assistant';
import { fetchProfile, addBookmark } from '../api/me';
import { useAuthStore } from '../store/authStore';
import { useAssistantStore } from '../store/assistantStore';
import { useToastStore } from '../store/toastStore';
import { ELIGIBILITY_LABEL, dDayText } from '../utils/format';
import SharkAvatar from './SharkAvatar.jsx';

const MARK = { ok: '✓', no: '✕', check: '?' };

const NOTICE_KEY = 'chunghae.aiNoticeAck';
const noticeAcked = () => {
  try {
    return localStorage.getItem(NOTICE_KEY) === '1';
  } catch {
    return false;
  }
};

function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// **굵게** 만 표시한다 (그 밖의 마크다운·HTML 은 그대로 글자로 보여준다)
function RichText({ text }) {
  return text
    .split('\n')
    .map((line, i) => (
      <p key={i}>
        {line
          .split(/(\*\*[^*]+\*\*)/)
          .map((part, j) =>
            part.startsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : part
          )}
      </p>
    ));
}

function PolicyCardInChat({ card, onDetail, onBookmark }) {
  const badge = ELIGIBILITY_LABEL[card.eligibility];
  return (
    <div className="chat-card">
      <div className="chat-card-top">
        <span className={badge.className}>{badge.text}</span>
        <span className="dday">{dDayText(card.d_day, card.recruitment_status)}</span>
      </div>
      <strong>{card.title}</strong>
      {card.conditions?.length > 0 && (
        <ul className="chat-conds">
          {card.conditions.map((c, i) => (
            <li key={i} className={`cond-${c.mark}`}>
              {MARK[c.mark]} {c.label}
            </li>
          ))}
        </ul>
      )}
      <div className="chat-card-actions">
        <button
          type="button"
          className={card.bookmarked ? 'btn-heart on' : 'btn-heart'}
          onClick={() => onBookmark(card)}
        >
          ♥ {card.bookmarked ? '찜함' : '찜'}
        </button>
        <button type="button" className="btn-detail" onClick={() => onDetail(card.policy_id)}>
          상세 보기
        </button>
      </div>
    </div>
  );
}

function Sources({ sources }) {
  if (!sources?.length) return null;
  return (
    <ul className="chat-sources">
      {sources.map((s, i) => (
        <li key={i}>
          🔗 {s.organization ? `${s.organization} ` : ''}「{s.title}」
          {s.collected_at && (
            <>
              {' '}
              · {String(s.collected_at).slice(0, 10)} {s.glossary ? '갱신' : '수집'}
            </>
          )}
          {s.url && (
            <>
              {' '}
              ·{' '}
              <a href={s.url} target="_blank" rel="noreferrer">
                원문 보기 ›
              </a>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function PlaceCards({ answer, onOpen, position }) {
  let places = answer.places;
  if (answer.near_me && position) {
    places = [...places].sort((a, b) => distanceKm(position, a) - distanceKm(position, b));
  } else if (answer.near_me) {
    places = [...places].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }
  const shown = places.slice(0, 3).map((p) => ({
    ...p,
    km: answer.near_me && position ? distanceKm(position, p) : null,
  }));
  return (
    <div className="chat-card-list">
      {shown.map((p) => (
        <button
          key={p.place_id}
          type="button"
          className="chat-place"
          onClick={() => onOpen({ place: p.place_id })}
        >
          <strong>{p.name}</strong>
          <span>
            {p.category_name} · {p.address}
            {p.km != null &&
              ` · ${p.km < 1 ? `${Math.round(p.km * 1000)}m` : `${p.km.toFixed(1)}km`}`}
          </span>
        </button>
      ))}
      {shown.length > 0 && (
        <button
          type="button"
          className="chat-more"
          onClick={() => onOpen({ category: answer.map_query?.category, q: answer.map_query?.q })}
        >
          전체 보기 ›
        </button>
      )}
    </div>
  );
}

// 추천으로 열 때마다 새 대화로 시작하고(key 가 바뀌어 상태 초기화), 그 밖에는 열었던 대화를 이어간다
export default function AssistantSheet() {
  const { chatOpen, request } = useAssistantStore();
  if (!chatOpen) return null;
  const key =
    request?.mode === 'recommend' ? `rec-${request.categoryId ?? 'all'}-${request.at}` : 'free';
  return <ChatSheet key={key} />;
}

function ChatSheet() {
  const { request, closeChat } = useAssistantStore();
  const user = useAuthStore((s) => s.user);
  const showToast = useToastStore((s) => s.show);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isRecommend = request?.mode === 'recommend';
  const [messages, setMessages] = useState([]); // { role: 'user'|'bot', text?, answer? }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(isRecommend);
  const [notice, setNotice] = useState(() => !noticeAcked()); // 국외 AI 전송 고지 (NFR-023)
  const [position, setPosition] = useState(null); // 현재 위치는 이 화면 메모리에만 둔다
  const [context, setContext] = useState(null);
  const bodyRef = useRef(null);
  const startY = useRef(null);

  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    enabled: Boolean(user),
  });
  const hasProfile = Boolean(
    profile.data?.birth_date || profile.data?.region_code || profile.data?.current_status
  );

  const push = useCallback((msg) => setMessages((m) => [...m, msg]), []);

  const failMessage = useCallback(
    () =>
      push({
        role: 'bot',
        answer: {
          type: 'error',
          message: '답변을 가져오지 못했어요. 잠시 후 다시 물어봐 주세요.',
          suggestions: [],
        },
      }),
    [push]
  );

  // 홈 AI 맞춤 추천으로 열면 추천 TOP 3 를 첫 메시지로 보여준다 (FR-A08)
  useEffect(() => {
    if (!isRecommend) return;
    let cancelled = false;
    fetchRecommend(request.categoryId)
      .then(
        (answer) =>
          !cancelled &&
          setMessages([{ role: 'bot', tag: '홈 · AI 맞춤 추천에서 열었어요', answer }])
      )
      .catch(() => !cancelled && failMessage())
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [isRecommend, request, failMessage]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, busy]);

  const ask = async (text) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput('');
    push({ role: 'user', text: q });
    setBusy(true);
    // '내 근처' 질문이면 브라우저에서만 위치를 쓴다 (서버로 보내지 않음)
    if (/내\s*근처|가까운/.test(q) && !position && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {},
        { timeout: 5000, maximumAge: 60000 }
      );
    }
    try {
      const answer = await sendChat(q, context);
      if (answer.policy_id) setContext({ policyId: answer.policy_id });
      push({ role: 'bot', answer });
    } catch {
      failMessage();
    } finally {
      setBusy(false);
    }
  };

  const goto = (path) => {
    closeChat();
    navigate(path);
  };

  const openMap = ({ place, category, q }) => {
    const params = new URLSearchParams();
    if (place) params.set('place', place);
    else {
      if (category) params.set('category', category);
      if (q) params.set('q', q);
    }
    goto(`/map${params.size ? `?${params}` : ''}`);
  };

  const bookmark = async (card) => {
    if (!user) return showToast('로그인하면 찜할 수 있어요');
    try {
      await addBookmark(card.policy_id, 'CHAT');
      setMessages((ms) =>
        ms.map((m) =>
          m.answer?.cards
            ? {
                ...m,
                answer: {
                  ...m.answer,
                  cards: m.answer.cards.map((c) =>
                    c.policy_id === card.policy_id ? { ...c, bookmarked: true } : c
                  ),
                },
              }
            : m
        )
      );
      queryClient.invalidateQueries({ queryKey: ['home'] });
      showToast('찜했어요! 캘린더에 마감일이 추가됐어요');
    } catch (e) {
      showToast(e.message);
    }
  };

  const lastBotIndex = messages.map((m) => m.role).lastIndexOf('bot');

  return (
    <div className="sheet-dim" onClick={closeChat}>
      <section
        className="sheet"
        role="dialog"
        aria-label="Dr.부 대화창"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sheet-handle"
          onPointerDown={(e) => {
            startY.current = e.clientY;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerUp={(e) => {
            if (startY.current != null && e.clientY - startY.current > 60) closeChat();
            startY.current = null;
          }}
        >
          <span />
        </div>
        <header className="sheet-head">
          <SharkAvatar size={44} />
          <div>
            <strong>Dr.부</strong>
            <p>
              <i className={hasProfile ? 'dot-on' : 'dot-off'} /> AI 혜택 비서 ·{' '}
              {hasProfile ? '내 정보 반영 중' : '내 정보 없이 답변 중'}
            </p>
          </div>
          <button type="button" className="sheet-close" aria-label="닫기" onClick={closeChat}>
            ✕
          </button>
        </header>

        <div className="sheet-body" ref={bodyRef}>
          {notice && (
            <div className="ai-notice" role="note">
              <p>
                질문은 전화·이메일·주민번호 등 개인정보를 가린 뒤, 국외에 서버가 있는 외부 AI
                서비스(OpenAI)로 전송돼요. 현재 위치는 보내지 않아요.
              </p>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem(NOTICE_KEY, '1');
                  } catch {
                    // 저장 실패 시 이번 화면에서만 닫는다
                  }
                  setNotice(false);
                }}
              >
                확인했어요
              </button>
            </div>
          )}
          {messages.length === 0 && !busy && (
            <div className="chat-bot">
              <RichText
                text={
                  '안녕하세요! 정책이나 어려운 용어, 근처 장소를 물어보세요.\n예) "사하구 휴학생인데 월세 지원 받을 수 있어?"'
                }
              />
            </div>
          )}
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="chat-user">
                {m.text}
              </div>
            ) : (
              <div key={i} className="chat-turn">
                {m.tag && <span className="chat-tag">✦ {m.tag}</span>}
                {m.answer.term && (
                  <div className="chat-bot">
                    <span className="term-label">용어</span> <strong>{m.answer.term.name}</strong>
                    <RichText text={m.answer.term.summary} />
                  </div>
                )}
                {m.answer.message && (
                  <div className="chat-bot">
                    <RichText text={m.answer.message} />
                  </div>
                )}
                {m.answer.cardsTitle && <p className="chat-cards-title">{m.answer.cardsTitle}</p>}
                {m.answer.cards?.map((c, idx) => (
                  <PolicyCardInChat
                    key={c.policy_id}
                    card={{ ...c, rank: idx + 1 }}
                    onDetail={(id) => goto(`/policies/${id}`)}
                    onBookmark={bookmark}
                  />
                ))}
                {m.answer.places && (
                  <PlaceCards answer={m.answer} position={position} onOpen={openMap} />
                )}
                {m.answer.contacts && (
                  <ul className="chat-sources">
                    {m.answer.contacts.map((c) => (
                      <li key={c.url}>
                        🔗{' '}
                        <a href={c.url} target="_blank" rel="noreferrer">
                          {c.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <Sources sources={m.answer.sources} />
                {i === lastBotIndex && !busy && (
                  <div className="chat-suggest">
                    {m.answer.suggestions?.map((s) => (
                      <button key={s} type="button" onClick={() => ask(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
          {busy && <div className="chat-bot chat-typing">Dr.부가 찾아보는 중…</div>}
        </div>

        <form
          className="sheet-input"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            value={input}
            maxLength={300}
            onChange={(e) => setInput(e.target.value)}
            placeholder="정책이나 어려운 용어를 물어보세요"
          />
          <button type="submit" aria-label="보내기" disabled={busy || !input.trim()}>
            →
          </button>
        </form>
      </section>
    </div>
  );
}
