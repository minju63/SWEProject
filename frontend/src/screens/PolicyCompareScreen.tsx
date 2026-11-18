import PolicyNotFound from "../components/PolicyNotFound"
import { useNavigate, useParams } from "react-router"
import { accentTheme, AppShell, PolicyTags, ScreenHeader } from "../components/PolicyLayout"
import { useAppState } from "../app/AppState"
import { evaluateEligibility, verdictTextStyle } from "../data/eligibility"
import { resolveConditions } from "../data/conditions"
import { findPolicyById, getRequiredDocuments, policyCatalog } from "../data/policies"

export default function PolicyCompareScreen() {
  const { policyId = "", compareId = "" } = useParams()
  const navigate = useNavigate()
  const { profile, temporaryPolicyConditions, policySearch } = useAppState()
  const policyA = findPolicyById(policyId)
  const policyB = findPolicyById(compareId)
  if (!policyA || !policyB) return <PolicyNotFound title="비교할 정책을 찾을 수 없어요." />
  const effective = resolveConditions(profile, temporaryPolicyConditions, policySearch.myConditionsOnly)
  const verdictA = evaluateEligibility(policyA, effective, profile.region).overall
  const verdictB = evaluateEligibility(policyB, effective, profile.region).overall
  const rows = [
    ["지원 내용", policyA.description, policyB.description],
    ["지원 금액 또는 혜택", policyA.benefit, policyB.benefit],
    ["신청 기간", policyA.applicationPeriod, policyB.applicationPeriod],
    ["거주 조건", policyA.residenceCondition, policyB.residenceCondition],
    ["나이 조건", policyA.ageCondition, policyB.ageCondition],
    ["소득 조건", policyA.incomeCondition, policyB.incomeCondition],
    [
      "학적·취업 조건",
      policyA.employmentOrStudentCondition,
      policyB.employmentOrStudentCondition,
    ],
    ["신청 방법", policyA.applicationMethod, policyB.applicationMethod],
    [
      "필요 서류",
      getRequiredDocuments(policyA).join(", ") || '공식 공고 확인 필요',
      getRequiredDocuments(policyB).join(", ") || '공식 공고 확인 필요',
    ],
    ["내 조건 적합 여부", verdictA, verdictB],
  ]

  const changeComparison = () =>
    navigate(`/policies/${policyA.id}/compare/select`)

  return (
    <AppShell className={accentTheme}>
      <ScreenHeader
        title="정책 비교"
        action={
          <button
            onClick={changeComparison}
            className="text-xs font-extrabold text-[#2F7BF5]"
          >
            비교 정책 변경
          </button>
        }
      />
      <main className="px-5 pb-10 pt-5">
        <p className="text-sm font-semibold text-black/45">
          두 정책의 주요 조건과 혜택을 비교해보세요.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {[policyA, policyB].map((policy, index) => (
            <div
              key={policy.id}
              className="min-w-0 rounded-[20px] bg-white p-4"
            >
              <span className="text-[10px] font-black text-[#2F7BF5]">
                정책 {index === 0 ? "A" : "B"}
              </span>
              <h2 className="mt-2 min-h-12 text-sm font-black leading-snug">
                {policy.title}
              </h2>
              <div className="mt-3">
                <PolicyTags category={policy.category} region={policy.region} />
              </div>
            </div>
          ))}
        </div>

        <section
          className="mt-5 overflow-hidden rounded-[22px] bg-white"
          aria-label="정책 비교표"
        >
          <div className="grid grid-cols-[88px_1fr_1fr] bg-[#EAF2FE] text-xs font-black text-[#2F7BF5]">
            <div className="p-3">비교 항목</div>
            <div className="border-l border-[#2F7BF5]/10 p-3">정책 A</div>
            <div className="border-l border-[#2F7BF5]/10 p-3">정책 B</div>
          </div>
          {rows.map(([label, valueA, valueB]) => (
            <div
              key={label}
              className="grid grid-cols-[88px_1fr_1fr] border-t border-black/[0.06] text-xs leading-[18px]"
            >
              <div className="bg-[#fafafb] p-3 font-extrabold text-black/45">
                {label}
              </div>
              <div className="border-l border-black/[0.06] p-3 font-semibold text-black/65">
                {label === "내 조건 적합 여부" ? <span className={`font-black ${verdictTextStyle[valueA as keyof typeof verdictTextStyle]}`}>{valueA}</span> : valueA}
              </div>
              <div className="border-l border-black/[0.06] p-3 font-semibold text-black/65">
                {label === "내 조건 적합 여부" ? <span className={`font-black ${verdictTextStyle[valueB as keyof typeof verdictTextStyle]}`}>{valueB}</span> : valueB}
              </div>
            </div>
          ))}
        </section>

        <section className="mt-5 rounded-[22px] bg-[#EAF2FE] p-5">
          <h2 className="text-sm font-black text-[#2F7BF5]">AI 비교 요약</h2>
          <p className="mt-3 text-xs font-semibold leading-5 text-black/60">
            {policyA.title}은 {policyA.benefit}에 초점이 있고, {policyB.title}은{" "}
            {policyB.benefit}이 핵심이에요. 신청 기간과 소득 조건이 다르므로
            현재 상황과 준비 가능한 서류를 함께 확인해보세요.
          </p>
        </section>
        <p className="mt-4 text-[10px] font-medium leading-4 text-black/40">
          ※ 실제 신청 가능 여부와 세부 조건은 각 정책의 공식 공고를
          확인해주세요.
        </p>

        <div className="mt-6 space-y-2">
          <button
            onClick={() => navigate(`/policies/${policyA.id}`)}
            className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-4 text-left text-xs font-black"
          >
            {policyA.title} 상세보기 <span className="text-black/30">›</span>
          </button>
          <button
            onClick={() => navigate(`/policies/${policyB.id}`)}
            className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-4 text-left text-xs font-black"
          >
            {policyB.title} 상세보기 <span className="text-black/30">›</span>
          </button>
          <button
            onClick={changeComparison}
            className="w-full rounded-2xl border border-[#2F7BF5] py-4 text-xs font-black text-[#2F7BF5]"
          >
            비교 정책 변경
          </button>
        </div>
      </main>
    </AppShell>
  )
}
