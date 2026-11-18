import { useAppState } from '../app/AppState'
export function WorkspaceFeedback() {
  const { message, busy, dismissMessage } = useAppState()
  if (!message && !busy) return null
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[90] w-[calc(100%-40px)] max-w-[440px] -translate-x-1/2">
      <div className="pointer-events-auto rounded-2xl border border-black/[0.06] bg-white px-4 py-3 text-xs font-semibold shadow-[0_8px_30px_rgba(23,25,35,0.12)]">
        {busy && (
          <p role="status" className="flex items-center gap-2 text-[#2F7BF5]">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 animate-spin rounded-full border-2 border-[#2F7BF5]/20 border-t-[#2F7BF5]"
            />
            계정 데이터를 확인하고 있어요.
          </p>
        )}
        {message && (
          <div role="alert" className="flex items-start justify-between gap-3">
            <p className="leading-5 text-black/60">{message}</p>
            <button
              onClick={dismissMessage}
              className="shrink-0 rounded-lg bg-[#f1f3fb] px-2 py-1 text-[11px] font-extrabold text-[#2F7BF5]"
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
