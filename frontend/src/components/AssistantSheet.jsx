import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchRecommend, sendChat } from '../api/assistant';
import { fetchCategories } from '../api/policies';
import { fetchProfile, fetchBookmarks, addBookmark, removeBookmark } from '../api/me';
import { useAuthStore } from '../store/authStore';
import { useAssistantStore, loadHistory, saveHistory } from '../store/assistantStore';
import { useToastStore } from '../store/toastStore';
import { ELIGIBILITY_LABEL, dDayText } from '../utils/format';
import SharkAvatar from './SharkAvatar.jsx';
import { HeartIcon } from './icons.jsx';

// 정책 상세 화면이 준비되면 true 로 바꾼다 (그 전에는 상세 보기를 누를 수 없게 한다)
const DETAIL_ENABLED = true;

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

const mmdd = (iso) => {
  const d = String(iso ?? '')
    .slice(0, 10)
    .split('-');
  return d.length === 3 ? `${d[1]}.${d[2]}` : '';
};

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" className="src-icon">
      <path
        d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// 출처 한 줄: 카드 안에 넣는다 (기관 「이름」 공고 · 수집 MM.DD · 원문 보기)
function SourceLine({ source, kind = '공고' }) {
  if (!source) return null;
  const date = mmdd(source.collected_at);
  const verb = source.glossary ? '갱신' : source.lookup ? '조회' : '수집';
  return (
    <p className="card-source">
      <LinkIcon />
      <span>
        {source.organization ? `${source.organization} ` : ''}
        {source.title && `「${source.title}」${kind ? ` ${kind}` : ''}`}
        {date && ` · ${verb} ${date}`}
        {source.url && (
          <>
            {' · '}
            <a href={source.url} target="_blank" rel="noreferrer">
              원문 보기 ›
            </a>
          </>
        )}
      </span>
    </p>
  );
}

function PolicyCardInChat({ card, source, categoryName, onDetail, onBookmark }) {
  const badge = ELIGIBILITY_LABEL[card.eligibility];
  const urgent = card.d_day != null && card.d_day <= 7;
  // 충족(✓)·불충족(✕)으로 판단된 조건만 보여 준다. '확인 필요'뿐이면 대신 정책 설명을 보여 준다
  const judged = (card.conditions ?? []).filter((c) => c.mark !== 'check');
  return (
    <div className="chat-card">
      <div className="chat-card-top">
        <span className="chat-card-tags">
          <span className={badge.className}>{badge.text}</span>
          {categoryName && <span className="cat-pill">{categoryName}</span>}
          {card.similar && <span className="similar-pill">비슷한 혜택</span>}
        </span>
        <span className={`chat-dday${urgent ? ' chat-dday-urgent' : ''}`}>
          {dDayText(card.d_day, card.recruitment_status)}
        </span>
      </div>
      <strong>{card.title}</strong>
      {judged.length > 0 ? (
        <ul className="chat-conds">
          {judged.map((c, i) => (
            <li key={i} className={`cond-${c.mark}`}>
              {MARK[c.mark]} {c.label}
            </li>
          ))}
        </ul>
      ) : (
        card.support_content && <p className="chat-desc">{card.support_content}</p>
      )}
      <div className="chat-card-actions">
        <button
          type="button"
          className={card.bookmarked ? 'btn-heart on' : 'btn-heart'}
          onClick={() => onBookmark(card)}
        >
          <HeartIcon size={15} /> 찜
        </button>
        <button
          type="button"
          className="btn-detail"
          disabled={!DETAIL_ENABLED}
          title={DETAIL_ENABLED ? undefined : '상세 화면은 준비 중이에요'}
          onClick={() => onDetail(card.policy_id)}
        >
          상세 보기
        </button>
      </div>
      <SourceLine source={source} />
    </div>
  );
}

// 용어 답변: 용어 라벨 + 이름 + 설명 + 출처를 한 카드에 담는다
function TermCard({ answer }) {
  const source = answer.sources?.[0];
  return (
    <div className="term-card">
      <div className="term-head">
        <span className="term-label">용어</span>
        {answer.ai_generated && <span className="ai-label">AI 요약</span>}
        <strong>{answer.term.name}</strong>
      </div>
      <RichText text={answer.term.summary} />
      <SourceLine source={source} kind="" />
    </div>
  );
}

// 이 조건이 있는 내 맞춤 혜택: 작은 목록
function RelatedBox({ title, cards, onDetail }) {
  if (!cards?.length) return null;
  return (
    <div className="related-box">
      <p>{title}</p>
      {cards.map((c) => {
        const badge = ELIGIBILITY_LABEL[c.eligibility];
        const urgent = c.d_day != null && c.d_day <= 7;
        return (
          <button
            key={c.policy_id}
            type="button"
            disabled={!DETAIL_ENABLED}
            onClick={() => onDetail(c.policy_id)}
          >
            <span className={badge.className}>{badge.text}</span>
            <strong>{c.title}</strong>
            <em className={urgent ? 'chat-dday-urgent' : ''}>
              {dDayText(c.d_day, c.recruitment_status)}
            </em>
          </button>
        );
      })}
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
              · {String(s.collected_at).slice(0, 10)}{' '}
              {s.glossary ? '갱신' : s.lookup ? '조회' : '수집'}
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
  // 찜 상태는 서버의 최신 찜 목록으로 판단한다. 대화에 남아 있던 카드 값은 오래됐을 수 있다
  const bookmarks = useQuery({
    queryKey: ['bookmarks'],
    queryFn: fetchBookmarks,
    enabled: Boolean(user),
    staleTime: 0,
  });
  const bookmarkedIds = bookmarks.data
    ? new Set(bookmarks.data.map((b) => b.policy?.policy_id))
    : null;
  const isRecommend = request?.mode === 'recommend';
  // { role: 'user'|'bot', text?, answer? }. 추천으로 열면 새 대화, 그 밖에는 최근 대화를 이어간다 (FR-A19)
  const [messages, setMessages] = useState(() => (isRecommend ? [] : loadHistory()));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(isRecommend);
  const [notice, setNotice] = useState(() => !noticeAcked()); // 국외 AI 전송 고지 (NFR-023)
  const [position, setPosition] = useState(null); // 현재 위치는 이 화면 메모리에만 둔다
  const [context, setContext] = useState(null);
  const bodyRef = useRef(null);
  const startY = useRef(null);
  const [dragY, setDragY] = useState(0); // 손잡이를 잡고 내리는 거리(px)
  const [dragging, setDragging] = useState(false);

  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: fetchProfile,
    enabled: Boolean(user),
  });
  const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const categoryNames = new Map(
    (categories.data ?? []).map((c) => [c.category_id, c.category_name])
  );
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
    if (!busy) saveHistory(messages);
  }, [messages, busy]);

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
      else if (answer.context) setContext(answer.context); // 다음 질문("전부 보여줘")에서 이어 쓴다
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

  // 화면의 하트 값만 바꾼다 (서버 응답을 기다리지 않는다)
  const markCards = (policyId, bookmarked) =>
    setMessages((ms) =>
      ms.map((m) =>
        m.answer?.cards
          ? {
              ...m,
              answer: {
                ...m.answer,
                cards: m.answer.cards.map((c) =>
                  c.policy_id === policyId ? { ...c, bookmarked } : c
                ),
              },
            }
          : m
      )
    );

  // 누르는 즉시 색을 바꾸고, 서버 저장은 뒤에서 한다. 실패하면 원래대로 되돌린다
  const bookmark = async (card) => {
    if (!user) return showToast('로그인하면 찜할 수 있어요');
    const next = !card.bookmarked;
    markCards(card.policy_id, next);
    queryClient.setQueryData(['bookmarks'], (cur) =>
      Array.isArray(cur)
        ? next
          ? [...cur, { policy: { policy_id: card.policy_id } }]
          : cur.filter((b) => b.policy?.policy_id !== card.policy_id)
        : cur
    );
    if (next) showToast('찜했어요! 캘린더에 마감일이 추가됐어요');
    try {
      if (next) await addBookmark(card.policy_id, 'CHAT');
      else await removeBookmark(card.policy_id);
      queryClient.invalidateQueries({ queryKey: ['home'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    } catch (e) {
      markCards(card.policy_id, !next);
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
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
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 0.18s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sheet-handle"
          onPointerDown={(e) => {
            startY.current = e.clientY;
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (startY.current == null) return;
            setDragY(Math.max(0, e.clientY - startY.current)); // 위로는 올라가지 않는다
          }}
          onPointerUp={(e) => {
            if (startY.current == null) return;
            const moved = e.clientY - startY.current;
            startY.current = null;
            setDragging(false);
            if (moved > 100) {
              // 충분히 내렸으면 끝까지 내려가며 닫는다
              setDragY(window.innerHeight);
              setTimeout(closeChat, 180);
            } else {
              setDragY(0); // 덜 내렸으면 제자리로
            }
          }}
          onPointerCancel={() => {
            startY.current = null;
            setDragging(false);
            setDragY(0);
          }}
        >
          <span />
        </div>
        <header className="sheet-head">
          <SharkAvatar size={44} />
          <div>
            <strong>Dr.부</strong>
            <p>
              <i
                className={`dot ${hasProfile ? 'dot-on' : 'dot-limited'}${busy ? ' dot-busy' : ''}`}
              />
              <span>AI 혜택 비서 · {hasProfile ? '내 정보 반영 중' : '내 정보 없이 답변 중'}</span>
            </p>
          </div>
          {messages.length > 0 && (
            <button type="button" className="sheet-new" onClick={() => setMessages([])}>
              새 대화
            </button>
          )}
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
                {m.answer.term && <TermCard answer={m.answer} />}
                {m.answer.message && (
                  <div className="chat-bot">
                    <RichText text={m.answer.message} />
                  </div>
                )}
                {m.answer.term ? (
                  <RelatedBox
                    title={m.answer.cardsTitle}
                    cards={m.answer.cards}
                    onDetail={(id) => goto(`/policies/${id}`)}
                  />
                ) : (
                  <>
                    {m.answer.cardsTitle && (
                      <p className="chat-cards-title">{m.answer.cardsTitle}</p>
                    )}
                    {m.answer.cards?.map((c, idx) => (
                      <PolicyCardInChat
                        key={c.policy_id}
                        card={{
                          ...c,
                          rank: idx + 1,
                          bookmarked: bookmarkedIds ? bookmarkedIds.has(c.policy_id) : c.bookmarked,
                        }}
                        source={m.answer.sources?.find((x) => x.policy_id === c.policy_id)}
                        categoryName={categoryNames.get(c.category_id)}
                        onDetail={(id) => goto(`/policies/${id}`)}
                        onBookmark={bookmark}
                      />
                    ))}
                  </>
                )}
                {m.answer.places && (
                  <PlaceCards answer={m.answer} position={position} onOpen={openMap} />
                )}
                {m.answer.from_dictionary ? (
                  <p className="ai-caution">
                    우리 용어 사전에 없어서 네이버 백과사전의 설명을 쉬운 말로{' '}
                    {m.answer.ai_generated ? '요약' : '옮겨'} 왔어요. 중요한 내용은 공식 사이트에서
                    꼭 확인해 주세요.
                  </p>
                ) : (
                  m.answer.ai_generated && (
                    <p className="ai-caution">
                      우리 용어 사전에 없어서 AI가 일반적인 뜻을 설명했어요. 정확하지 않을 수 있으니
                      중요한 내용은 공식 사이트에서 꼭 확인해 주세요.
                    </p>
                  )
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
                {!m.answer.term && (
                  <Sources
                    sources={m.answer.sources?.filter(
                      (x) => !m.answer.cards?.some((card) => card.policy_id === x.policy_id)
                    )}
                  />
                )}
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
