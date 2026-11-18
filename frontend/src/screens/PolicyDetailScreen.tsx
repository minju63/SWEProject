import { useState, useEffect } from "react"
import {useAuth} from '../lib/auth'
import type {PolicyCatalogItem} from '../data/policies'
import { useNavigate, useParams } from "react-router"
import { useAppState } from "../app/AppState"
import {
  accentTheme,
  AppShell,
  BottomNav,
  PolicyTags,
  ScreenHeader,
} from "../components/PolicyLayout"
import { resolveConditions } from "../data/conditions"
import { evaluateEligibility, verdictStyle } from "../data/eligibility"
import {
  findPolicyById,
  getApplicationProcess,
  getRequiredDocuments,
  getRequiredDocumentItems,
  policyCatalog,
} from "../data/policies"
import { Icon } from "./HomeScreen"
import PolicyNotFound from "../components/PolicyNotFound"

export default function PolicyDetailScreen() {
  const { policyId = "" } = useParams()
  const policy = findPolicyById(policyId)
  return policy ? <PolicyDetailContent policy={policy}/> : <PolicyNotFound />
}
function PolicyDetailContent({policy}: {policy:PolicyCatalogItem}) {
  const navigate = useNavigate()
  const {user}=useAuth()
  const {
    savedPolicies,
    toggleSaved,
    preparationChecks,
    togglePreparationCheck,
    setCompareBaseId,
    setCompareSelectedId,
    setCompareSearchQuery,
    applications,
    addApplication,
    temporaryPolicyConditions,
    profile,
    policySearch,
    addRecent,
    workspaceReady,
  } = useAppState()
  useEffect(()=>{if(user&&workspaceReady)addRecent(policy.id)},[policy.id,user?.id,workspaceReady])
  const [eligibilityExpanded, setEligibilityExpanded] = useState(false)
  const documents = getRequiredDocuments(policy)
  const documentItems = getRequiredDocumentItems(policy)
  const steps = getApplicationProcess(policy)
  const checked = preparationChecks[policy.id] ?? []
  const isManaged = applications.some((item) => item.policyId === policy.id)
  const eligibility = evaluateEligibility(
    policy,
    resolveConditions(profile, temporaryPolicyConditions, policySearch.myConditionsOnly),
    profile.region,
  )
  const eligibilityItems = eligibility.items
  const related = policyCatalog
    .filter(
      (item) => item.id !== policy.id && item.category === policy.category,
    )
    .slice(0, 2)

  function startComparison() {
    setCompareBaseId(policy.id)
    setCompareSelectedId("")
    setCompareSearchQuery("")
    navigate(`/policies/${policy.id}/compare/select`)
  }

  function addToApplications() {
    if (isManaged) return
    addApplication({
      policyId: policy.id,
      policyName: policy.title,
      region: policy.region,
      category: policy.category,
      stage: "신청 준비",
      applicationDeadline: policy.applicationEndDate || '',
      applicationDate: "",
      expectedResultDate: "",
      applicationNumber: "",
      reviewStatus: "접수 완료",
      memo: "",
      officialUrl: policy.officialUrl,
      eligibilityChecks: eligibilityItems.map((item) => ({
        label: item.label,
        status:
          item.status === "신청 가능"
            ? ("matched" as const)
            : item.status === "신청 불가"
              ? ("unmatched" as const)
              : ("needs_check" as const),
      })),
      requiredDocuments: documents.map((name) => ({
        name,
        description: "공식 공고의 제출 기준을 확인해주세요.",
        status: "pending",
      })),
      resultStatus: "결과 대기",
      resultDate: "",
      nextActions: [],
    })
  }

  return (
    <AppShell className={accentTheme}>
      <ScreenHeader
        title="정책 상세"
        action={
          <button
            onClick={() => toggleSaved(policy.id)}
            className={`grid size-9 place-items-center rounded-full ${
              savedPolicies.includes(policy.id)
                ? "bg-[#2F7BF5] text-white"
                : "bg-[#f3f4f6] text-black/30"
            }`}
            aria-label={`${policy.title} 북마크`}
          >
            <Icon
              name="heart"
              className={`size-[18px] ${
                savedPolicies.includes(policy.id) ? "fill-current" : ""
              }`}
            />
          </button>
        }
      />
      <main className="pb-48">
        <section className="bg-white px-5 pb-7 pt-6">
          <PolicyTags
            category={policy.category}
            region={policy.region}
            target={policy.target}
          />
          <h2 className="mt-4 text-[25px] font-black leading-tight tracking-[-0.05em]">
            {policy.title}
          </h2>
          <p className="mt-3 text-sm font-medium leading-6 text-black/50">
            {policy.description}
          </p>
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-[#f7f8fb] p-4">
            <div>
              <p className="text-[10px] font-bold text-black/35">신청기간</p>
              <p className="mt-1 text-xs font-extrabold">
                {policy.applicationPeriod}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-2 text-xs font-black ${
                policy.deadline.startsWith("D-")
                  ? "bg-[#2F7BF5] text-white"
                  : "bg-[#EAF2FE] text-[#2F7BF5]"
              }`}
            >
              {policy.deadline}
            </span>
          </div>
        </section>

        <div className="space-y-3 px-5 py-5">
          <SectionCard title="정책 요약">
            <dl className="mt-4 divide-y divide-black/[0.06]">
              {[
                ["누가 받을 수 있나요", policy.target],
                ["신청기간", policy.applicationPeriod],
                ["신청방법", policy.applicationMethod],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="grid grid-cols-[105px_1fr] gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <dt className="text-[11px] font-extrabold text-black/40">
                    {label}
                  </dt>
                  <dd className="text-xs font-bold leading-5 text-black/70">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </SectionCard>

          <SectionCard title="AI 비서의 한마디" icon>
            {policy.aiAssistantComment ? (
              <p className="mt-3 text-xs font-medium leading-5 text-black/65">
                {policy.aiAssistantComment}
              </p>
            ) : (
              <p className="mt-3 rounded-xl bg-[#f7f8fb] px-4 py-3 text-xs font-semibold leading-5 text-black/40">
                주요 혜택과 추천 이유, 추가로 확인할 조건을 AI 비서가 정리해 드릴 예정이에요.
              </p>
            )}
          </SectionCard>

          <SectionCard title="내 조건과 비교하기" aside={eligibility.overall} asideClass={verdictStyle[eligibility.overall]}>
            <div className="mt-4 space-y-3">
              {(eligibilityExpanded
                ? eligibilityItems
                : eligibilityItems.slice(0, 3)
              ).map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 text-xs font-extrabold text-black/65">
                    {item.label}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1.5 text-[10px] font-black ${verdictStyle[item.status]}`}
                  >
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
            {eligibilityItems.length > 3 && (
              <button
                onClick={() => setEligibilityExpanded((value) => !value)}
                className="mt-4 text-xs font-black text-[#2F7BF5]"
              >
                {eligibilityExpanded
                  ? "조건 접기"
                  : `${eligibilityItems.length - 3}개의 조건 더보기 ›`}
              </button>
            )}
          </SectionCard>

          <SectionCard title="신청 절차">
            {steps.length ? (
              <ol className="mt-4 space-y-4">
              {steps.map((step, index) => (
                <li key={step} className="flex items-center gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#EAF2FE] text-[11px] font-black text-[#2F7BF5]">
                    {index + 1}
                  </span>
                  <span className="text-xs font-extrabold text-black/65">
                    {step}
                  </span>
                </li>
              ))}
              </ol>
            ) : (
              <EmptyOfficialInfo
                message="공식 자료에서 세부 신청 절차를 확인해주세요."
                url={policy.officialUrl}
              />
            )}
          </SectionCard>

          <SectionCard
            title="신청 준비물"
            aside={
              documents.length
                ? `${checked.filter(name => documents.includes(name)).length}/${documents.length} 준비`
                : undefined
            }
          >
            {documents.length ? (
              <div className="mt-3">
              <p className="text-[11px] font-medium leading-5 text-black/40">해당자 서류는 본인에게 적용되는 경우 준비해주세요. 신청 경로·가구 상황에 따라 추가 서류나 제출 면제가 있을 수 있어요.</p>
              <div className="mt-2 divide-y divide-black/[0.06]">
              {documentItems.map((item) => {
                const document = item.name
                const isChecked = checked.includes(document)
                return (
                  <button
                    key={document}
                    onClick={() => togglePreparationCheck(policy.id, document)}
                    aria-pressed={isChecked}
                    aria-label={`${document} 준비 여부`}
                    className="flex w-full items-start gap-3 py-3 text-left"
                  >
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-black ${
                        isChecked
                          ? "bg-[#2F7BF5] text-white"
                          : "border-2 border-black/10 bg-white text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span
                      className={`min-w-0 flex-1 break-words text-xs font-bold leading-5 ${
                        isChecked
                          ? "text-black/35 line-through"
                          : "text-black/65"
                      }`}
                    >
                      {document}
                      <span className="mt-1 block text-[10px] font-semibold text-[#2F7BF5] no-underline">{item.required === true ? "필수" : item.required === false ? "해당자만 제출" : "제출 기준은 공고 확인"}{item.confirmed === false ? " · 공식 확인 필요" : ""}</span>
                    </span>
                  </button>
                )
              })}
              </div>
              </div>
            ) : (
              <EmptyOfficialInfo
                message="공식 자료에서 제출서류를 확인할 수 없어요."
                url={policy.officialUrl}
              />
            )}
          </SectionCard>

          <SectionCard title="정책 비교">
            <p className="mt-2 text-xs font-medium text-black/45">
              다른 정책과 조건과 혜택을 비교해보세요.
            </p>
            <button
              onClick={startComparison}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-[#2F7BF5] py-3.5 text-xs font-black text-[#2F7BF5]"
            >
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3l4 4-4 4M21 7H8M7 21l-4-4 4-4M3 17h13" /></svg>
              다른 정책과 비교하기
            </button>
          </SectionCard>

          {related.length > 0 && (
            <SectionCard title="이런 정책도 있어요">
              <div className="mt-3 space-y-2.5">
                {related.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/policies/${item.id}`)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-black/[0.07] p-4 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="inline-block rounded-md bg-[#f3f4f6] px-2 py-1 text-[10px] font-extrabold text-black/50">
                        {item.region} · {item.target}
                      </span>
                      <p className="mt-2 truncate text-xs font-black">
                        {item.title}
                      </p>
                      <p className="mt-1 truncate text-[10px] font-bold text-black/35">
                        {item.description}
                      </p>
                    </div>
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-black/30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M8 7h9v9" /></svg>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      </main>

      <div className="fixed bottom-[68px] left-1/2 z-30 flex w-full max-w-[480px] -translate-x-1/2 gap-2 border-t border-black/[0.06] bg-white/95 px-4 py-3 backdrop-blur-xl">
        <a
          href={policy.applicationUrl ?? policy.officialUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-w-0 flex-[1.1] items-center justify-center rounded-2xl bg-[#2F7BF5] px-3 py-4 text-center text-[11px] font-black text-white"
        >
          {policy.applicationUrl ? '공식 홈페이지에서 신청하기 ↗' : '공식 안내 확인하기 ↗'}
        </a>
        <button
          onClick={addToApplications}
          disabled={isManaged}
          className="flex min-w-0 flex-[0.9] items-center justify-center rounded-2xl border border-[#2F7BF5] px-3 py-4 text-[11px] font-black text-[#2F7BF5] disabled:border-black/10 disabled:bg-[#f3f4f6] disabled:text-black/35"
        >
          {isManaged ? "✓ 신청 관리에 추가됨" : "＋ 신청 관리에 추가"}
        </button>
      </div>
      <BottomNav />
    </AppShell>
  )
}

function EmptyOfficialInfo({
  message,
  url,
}: {
  message: string
  url?: string
}) {
  return (
    <div className="mt-3 rounded-xl bg-[#f7f8fb] px-4 py-3">
      <p className="text-xs font-semibold leading-5 text-black/45">{message}</p>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-[11px] font-black text-[#2F7BF5]"
        >
          공식 공고 확인하기 ›
        </a>
      )}
    </div>
  )
}

function SectionCard({
  title,
  icon,
  aside,
  asideClass = "bg-[#EAF2FE] text-[#2F7BF5]",
  children,
}: {
  title: string
  icon?: boolean
  aside?: string
  asideClass?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-[22px] bg-white p-5 shadow-[0_5px_18px_rgba(23,25,35,0.03)]">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-black">
          {icon && (
            <span className="grid size-7 place-items-center rounded-lg bg-[#EAF2FE] text-[#2F7BF5]">
              <Icon name="sparkle" className="size-4" />
            </span>
          )}
          {title}
        </h3>
        {aside && (
          <span className={`rounded-full px-2.5 py-1.5 text-[10px] font-black ${asideClass}`}>
            {aside}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}
