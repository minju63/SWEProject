// 약관·동의 관리 (FR-MY-021): 약관·동의서·외부 AI 국외 전송 안내 전문, 내 동의 여부·일시, 선택 동의 철회·재동의
import './MyDesign.css';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { personalApi } from '../lib/api';

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

export default function ConsentScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const open = params.get('open');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    personalApi('/consents')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  async function change(agree) {
    setBusy(true);
    setMessage('');
    try {
      setData(await personalApi('/consents/personalization', 'PUT', agree ? { agree } : { agree, confirmDelete: true }));
      setConfirming(false);
      setMessage(agree ? '맞춤정보 수집·이용에 다시 동의했어요. 마이에서 맞춤정보를 입력해 주세요.' : '동의를 철회하고 맞춤정보를 삭제했어요.');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#eef0f5]">
      <div className="my-settings">
        <header className="my-header">
          <button onClick={() => navigate(-1)} className="-ml-2 grid size-10 place-items-center rounded-full" aria-label="뒤로 가기">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <h1 className="ml-1 text-[18px] font-black tracking-[-0.04em]">약관 및 동의 관리</h1>
        </header>
        <main className="px-5 pb-10 pt-5">
          {error && <p className="rounded-[16px] bg-white p-4 text-sm font-bold text-[#d92d20]">{error}</p>}
          {!data && !error && <p className="p-4 text-sm font-bold text-black/60">불러오는 중이에요.</p>}
          {data && (
            <>
              <section className="space-y-3">
                {data.items.map((item) => (
                  <details key={item.key} open={open === item.key} className="rounded-[20px] bg-white px-4 py-4">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-extrabold text-black/70">
                      <span>
                        {item.title}
                        <small className="ml-1 text-[11px] font-bold text-black/60">{item.required ? '필수' : '선택'}</small>
                      </span>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${item.agreed ? 'bg-[#e8f1ff] text-[#2468E0]' : 'bg-[#f1f2f4] text-black/60'}`}>
                        {item.agreed === null ? '기록 없음' : item.agreed ? '동의함' : '철회함'}
                      </span>
                    </summary>
                    <p className="mt-3 text-[13px] font-medium leading-6 text-black/60">{item.text}</p>
                    <p className="mt-2 text-xs font-bold text-black/60">
                      {item.agreed && item.at && `동의 일시 ${when(item.at)}`}
                      {item.agreed === false && item.revokedAt && `철회 일시 ${when(item.revokedAt)}`}
                      {data.version && item.agreed !== null && ` · 약관 버전 ${data.version}`}
                    </p>
                    {item.key === 'personalization' && item.agreed !== null && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => (item.agreed ? setConfirming(true) : change(true))}
                        className="mt-3 h-11 w-full rounded-[14px] bg-[#f1f3fb] text-sm font-black text-[#2468E0] disabled:opacity-50"
                      >
                        {item.agreed ? '동의 철회하기' : '다시 동의하기'}
                      </button>
                    )}
                  </details>
                ))}
                <div className="rounded-[20px] bg-white px-4 py-4">
                  <h2 className="text-sm font-extrabold text-black/70">AI 비서 국외 전송 안내</h2>
                  <p className="mt-2 text-[13px] font-medium leading-6 text-black/60">{data.aiNotice}</p>
                </div>
              </section>
              <p className="mt-4 px-1 text-xs font-medium leading-5 text-black/60">
                필수 동의를 철회하려면 회원 탈퇴가 필요해요. 설정 › 계정 설정 › 회원 탈퇴에서 진행할 수 있어요.
              </p>
              {message && <p role="status" className="mt-3 rounded-[14px] bg-white p-3 text-sm font-bold text-black/60">{message}</p>}
            </>
          )}
        </main>
        {confirming && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-6" role="dialog" aria-modal="true" aria-label="동의 철회 확인">
            <div className="w-full max-w-sm rounded-[22px] bg-white p-5">
              <h2 className="text-base font-black">맞춤정보 동의를 철회할까요?</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-black/60">
                철회하면 저장한 맞춤정보(생년월일·거주지역·현재 상태·관심 분야·민감 항목)가 삭제되고 다시 복구할 수 없어요. 검색·지도·캘린더는 계속 쓸 수 있어요.
              </p>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setConfirming(false)} className="h-11 flex-1 rounded-[14px] bg-[#f1f2f4] text-sm font-black text-black/60">
                  취소
                </button>
                <button type="button" disabled={busy} onClick={() => change(false)} className="h-11 flex-1 rounded-[14px] bg-[#2F7BF5] text-sm font-black text-white disabled:opacity-50">
                  {busy ? '처리 중…' : '철회하고 삭제'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
