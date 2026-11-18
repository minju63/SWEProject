// src/screens/minju/AiSheet.tsx
// lucide-react, ./index 대신 ./icons 사용
import { useState } from "react"
import {
  X,
  Heart,
  Sparkles,
  ImagePlus,
  ArrowUp,
  Check,
  HelpCircle,
  AlertCircle,
  ChevronRight,
  Hannuni,
} from "./icons"

const PICKS = [
  {
    n: 1,
    title: "청년 월세 지원",
    days: 4,
    why: "부산 거주 · 무주택 · 관심분야 주거",
    liked: true,
  },
  { n: 2, title: "청년 교통비 지원", days: 8, why: "사하구 거주 · 19~34세" },
  {
    n: 3,
    title: "청년 이사비 지원",
    days: 11,
    why: "최근 전입 시 최대 40만 원",
  },
]
const QUESTIONS = ["왜 이걸 추천했어?", "장학금도 추천해줘", "중위소득이 뭐야?"]

function Answer() {
  const [liked, setLiked] = useState(true)
  return (
    <>
      <p className="max-w-[268px] self-end rounded-[20px] rounded-tr-[6px] bg-[#2F7BF5] px-4 py-3 text-[13.5px] leading-[1.55] text-white shadow-[0_6px_16px_rgba(47,123,245,0.25)]">
        사하구 사는 휴학생인데 월세 지원 받을 수 있어?
      </p>
      <p className="max-w-[310px] rounded-[20px] rounded-tl-[6px] bg-white px-4 py-3 text-[13.5px] leading-[1.6] text-[#18202F] shadow-[0_6px_20px_rgba(47,123,245,0.08)]">
        <b>청년 월세 지원</b>은 나이·거주지 조건을 충족해서 신청할 수 있어요.
        다만 <b>소득 기준(중위 60% 이하)</b>은 직접 확인이 필요해요. 마감은{" "}
        <span className="font-semibold text-[#EF4E6C]">10월 9일 18시</span>예요.
      </p>

      <article className="flex flex-col gap-3 rounded-[22px] bg-white p-4 shadow-[0_6px_20px_rgba(47,123,245,0.08)]">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-0.5 rounded-full bg-[#FFF4D9] px-2 py-0.5 text-[11px] font-bold text-[#C98A0C]">
            <AlertCircle size={11} strokeWidth={2.6} />
            확인 필요
          </span>
          <span className="rounded-full bg-[#4F9DF7]/15 px-2 py-0.5 text-[11px] font-bold text-[#2F7BF5]">
            주거·생활
          </span>
          <span className="ml-auto rounded-full bg-[#FDE9ED] px-2 py-0.5 text-[11px] font-bold text-[#EF4E6C]">
            D-4
          </span>
        </div>
        <h3 className="text-[15.5px] font-bold text-[#18202F]">
          청년 월세 지원
        </h3>
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 rounded-[12px] bg-[#E3F6EE] px-3 py-2 text-[12.5px] font-semibold text-[#1E9E6A]">
            <Check size={14} strokeWidth={2.8} />
            나이 19~34세 충족 · <Check size={14} strokeWidth={2.8} />
            부산 거주 충족
          </span>
          <span className="flex items-center gap-1.5 rounded-[12px] bg-[#FFF4D9] px-3 py-2 text-[12.5px] font-semibold text-[#C98A0C]">
            <HelpCircle size={14} strokeWidth={2.6} />
            소득 조건 확인 필요
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setLiked(!liked)}
            className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[12px] text-[13px] font-bold ${
              liked
                ? "bg-[#FDE9ED] text-[#EF4E6C]"
                : "bg-[#F1F4F9] text-[#5F6B80]"
            }`}
          >
            <Heart size={15} fill={liked ? "#EF4E6C" : "none"} />
            {liked ? "찜함" : "찜하기"}
          </button>
          <button className="flex h-10 flex-1 items-center justify-center gap-0.5 rounded-[12px] bg-[#F1F4F9] text-[13px] font-bold text-[#5F6B80]">
            상세 보기
            <ChevronRight size={15} />
          </button>
        </div>
      </article>
      <p className="px-1 text-[11px] text-[#9AA4B5]">
        🔗 출처: 부산광역시 청년플랫폼 공고 (2026.09.15)
      </p>
    </>
  )
}

function Term() {
  const rows = [
    { title: "청년 월세 지원", days: 4 },
    { title: "청년 전세자금 대출이자 지원", days: 19 },
  ]
  return (
    <>
      <p className="max-w-[268px] self-end rounded-[20px] rounded-tr-[6px] bg-[#2F7BF5] px-4 py-3 text-[13.5px] leading-[1.55] text-white shadow-[0_6px_16px_rgba(47,123,245,0.25)]">
        중위소득 60%가 뭐야?
      </p>
      <article className="flex max-w-[330px] flex-col gap-2.5 rounded-[20px] rounded-tl-[6px] border border-[#CFE0FC] bg-white p-4 shadow-[0_6px_20px_rgba(47,123,245,0.08)]">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#F1EBFD] px-2 py-0.5 text-[11px] font-bold text-[#8A63E8]">
            용어
          </span>
          <h3 className="text-[16px] font-bold text-[#18202F]">
            기준 중위소득
          </h3>
        </div>
        <p className="text-[13.5px] leading-[1.6] text-[#18202F]">
          우리나라 가구를 소득 순서로 줄 세웠을 때 딱 가운데에 있는 가구의
          소득이에요.
        </p>
        <p className="text-[13.5px] leading-[1.6] text-[#18202F]">
          <b>60% 이하</b>는 내 가구 소득이 그 가운데 값의 60%보다 적거나 같다는
          뜻이에요. 금액은 가구원 수마다 다르고 매년 바뀌어요.
        </p>
        <p className="text-[11px] text-[#9AA4B5]">
          🔗 출처: 보건복지부 기준 중위소득 고시
        </p>
      </article>
      <section className="flex flex-col rounded-[22px] bg-white px-4 pt-3.5 shadow-[0_6px_20px_rgba(47,123,245,0.08)]">
        <h4 className="pb-1 text-[13px] font-bold text-[#5F6B80]">
          이 조건이 있는 내 맞춤 혜택
        </h4>
        {rows.map((r, i) => (
          <button
            key={r.title}
            className={`flex items-center gap-2 py-3 text-left ${
              i ? "border-t border-[#EEF1F6]" : ""
            }`}
          >
            <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-[#FFF4D9] px-2 py-0.5 text-[11px] font-bold text-[#C98A0C]">
              <AlertCircle size={11} strokeWidth={2.6} />
              확인 필요
            </span>
            <b className="min-w-0 flex-1 truncate text-[14px] text-[#18202F]">
              {r.title}
            </b>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                r.days <= 7
                  ? "bg-[#FDE9ED] text-[#EF4E6C]"
                  : "bg-[#EAF2FE] text-[#2F7BF5]"
              }`}
            >
              D-{r.days}
            </span>
            <ChevronRight size={15} className="shrink-0 text-[#9AA4B5]" />
          </button>
        ))}
      </section>
    </>
  )
}

export function AiSheet({
  onClose,
  variant = "recommend",
}: {
  onClose: () => void
  variant?: "recommend" | "answer" | "term"
}) {
  const [toast, setToast] = useState(variant === "answer")
  const questions =
    variant === "answer"
      ? ["필요한 서류 알려줘", "중위소득이 뭐야?"]
      : variant === "term"
        ? ["확정일자는 뭐야?", "나한테 맞는 정책 추천해줘"]
        : QUESTIONS
  return (
    <div className="absolute inset-0 z-50 flex flex-col">
      <style>
        {
          "@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}"
        }
      </style>
      <section className="relative flex h-full flex-col bg-[#F6F9FE] animate-[sheetUp_.32s_cubic-bezier(.2,.8,.2,1)]">

        {/* header */}
        <header className="flex shrink-0 items-center gap-2.5 border-b border-[#E6EBF3] px-[18px] pb-3 pt-1">
          <span className="flex size-10 items-center justify-center rounded-full bg-white shadow-[0_4px_12px_rgba(47,123,245,0.12)]">
            <Hannuni size={32} />
          </span>
          <div className="flex flex-1 flex-col gap-0.5">
            <b className="text-[16px] text-[#18202F]">한눈이</b>
            <span className="flex items-center gap-1.5 text-[11.5px] text-[#5F6B80]">
              <span className="size-1.5 rounded-full bg-[#1E9E6A]" />
              AI 혜택 비서 · 내 정보 반영 중
            </span>
          </div>
          <button
            aria-label="닫기"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full bg-white text-[#5F6B80] shadow-[0_4px_12px_rgba(47,123,245,0.1)]"
          >
            <X size={18} />
          </button>
        </header>

        {/* conversation */}
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-[18px] pb-16 pt-3 [scrollbar-width:none]">
          <span className="flex items-center gap-1 self-start rounded-full bg-[#EAF2FE] px-3 py-1.5 text-[11.5px] font-semibold text-[#2F7BF5]">
            <Sparkles size={12} fill="#2F7BF5" /> 홈 · AI 맞춤 추천에서 열었어요
          </span>

          {variant === "term" ? (
            <Term />
          ) : variant === "answer" ? (
            <Answer />
          ) : (
            <>
              <p className="max-w-[300px] rounded-[20px] rounded-tl-[6px] bg-white px-4 py-3 text-[13.5px] leading-[1.6] text-[#18202F] shadow-[0_6px_20px_rgba(47,123,245,0.08)]">
                <b>민주 님</b> 조건(
                <span className="font-semibold text-[#2F7BF5]">
                  사하구 · 25세 · 휴학생
                </span>
                )으로 찾은 오늘의 추천 <b>TOP 3</b>예요. 마감이 가까운 순서예요.
              </p>

              <ul className="flex flex-col rounded-[22px] bg-white px-4 shadow-[0_6px_20px_rgba(47,123,245,0.08)]">
                {PICKS.map((p, i) => (
                  <li
                    key={p.n}
                    className={`flex items-center gap-3 py-3.5 ${
                      i ? "border-t border-[#EEF1F6]" : ""
                    }`}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-[#2F7BF5] text-[13px] font-bold text-white">
                      {p.n}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <b className="truncate text-[15px] text-[#18202F]">
                          {p.title}
                        </b>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold ${
                            p.days <= 7
                              ? "bg-[#FDE9ED] text-[#EF4E6C]"
                              : "bg-[#EAF2FE] text-[#2F7BF5]"
                          }`}
                        >
                          D-{p.days}
                        </span>
                      </div>
                      <span className="truncate text-[12px] text-[#5F6B80]">
                        {p.why}
                      </span>
                    </div>
                    <button aria-label="찜">
                      <Heart
                        size={20}
                        color={p.liked ? "#EF4E6C" : "#C9D0DB"}
                        fill={p.liked ? "#EF4E6C" : "none"}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {questions.map((q) => (
              <button
                key={q}
                className="rounded-full border border-[#2F7BF5] bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#2F7BF5]"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {toast && (
          <button
            onClick={() => setToast(false)}
            className="absolute inset-x-[18px] bottom-[96px] z-10 flex items-center gap-2 rounded-[16px] bg-[#18202F]/95 px-4 py-3 text-left text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(24,32,47,0.3)]"
          >
            <Heart size={15} fill="#EF4E6C" color="#EF4E6C" /> 찜했어요!
            캘린더에 마감일이 추가됐어요
          </button>
        )}
        {/* input */}
        <div className="flex shrink-0 items-center gap-2 border-t border-[#E6EBF3] bg-white px-[14px] pb-[34px] pt-3">
          <button
            aria-label="사진"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F1F4F9] text-[#5F6B80]"
          >
            <ImagePlus size={19} />
          </button>
          <input
            className="h-10 min-w-0 flex-1 rounded-full bg-[#F1F4F9] px-4 text-[13.5px] outline-none placeholder:text-[#9AA4B5]"
            placeholder={
              variant === "term"
                ? "정책이나 어려운 용어를 물어보세요"
                : "한눈이에게 물어보세요"
            }
          />
          <button
            aria-label="보내기"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#2F7BF5] text-white shadow-[0_6px_14px_rgba(47,123,245,0.35)]"
          >
            <ArrowUp size={19} strokeWidth={2.6} />
          </button>
        </div>
      </section>
    </div>
  )
}

export default AiSheet
