import type { ReactNode } from "react"
import type { TemporaryPolicyConditions } from "../app/AppState"
import AppSelect from "./AppSelect"
import InterestAccordion from "./InterestAccordion"
import {
  conditionCount,
  ConditionGroupKey,
  educationOptions,
  educationSub,
  emptyConditions,
  groupValues,
  headOptions,
  housingBenefitOptions,
  housingOptions,
  MAX_AGE,
  MIN_AGE,
  NONE,
  orderedConditions,
  ownershipOptions,
  statusOptions,
  statusSub,
  summarize,
} from "../data/conditions"
import {
  householdOptions,
  independentOptions,
  interestCategories,
  maritalOptions,
  specialOptions,
} from "../data/searchFilter"

type Conditions = TemporaryPolicyConditions

const groupTitles: [ConditionGroupKey, string][] = [
  ["basic", "기본 정보"],
  ["housing", "거주 및 가구 정보"],
  ["special", "혼인·특화대상·관심 분야"],
]

function Chevron({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <svg
      className={`size-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
  sub,
  subValue,
  onSubChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  sub?: Record<string, string[]>
  subValue?: string
  onSubChange?: (value: string) => void
}) {
  const subOptions = sub?.[value]
  return (
    <div>
      <AppSelect
        label={label}
        value={value || NONE}
        options={[NONE, ...options]}
        onChange={(next) => onChange(next === NONE ? "" : next)}
      />
      {subOptions && onSubChange && (
        <div className="mt-2">
          <AppSelect
            compact
            value={subValue || NONE}
            options={[NONE, ...subOptions]}
            onChange={(next) => onSubChange(next === NONE ? "" : next)}
          />
        </div>
      )}
    </div>
  )
}

const ageOptions = Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => `만 ${MIN_AGE + i}세`)

function AgeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <AppSelect
      label="만 나이"
      value={value ? `만 ${value}세` : NONE}
      options={[NONE, ...ageOptions]}
      onChange={(next) => onChange(next === NONE ? "" : next.replace(/\D/g, ""))}
    />
  )
}

function SectionTitle({ children, hint, action }: { children: ReactNode; hint?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h4 className="text-[13px] font-black tracking-[-0.02em]">{children}</h4>
      {action}
      {hint && (
        <span className="rounded-full bg-[#EAF2FE] px-2.5 py-1 text-[10px] font-black text-[#2F7BF5]">{hint}</span>
      )}
    </div>
  )
}

function CheckChips({
  label,
  options,
  selected,
  onToggle,
  withCheckbox = false,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
  withCheckbox?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label={label}>
      {options.map((option) => {
        const on = selected.includes(option)
        return (
          <button
            type="button"
            key={option}
            aria-pressed={on}
            onClick={() => onToggle(option)}
            className={`flex min-h-[40px] items-center gap-2 rounded-[18px] border py-1.5 text-left text-[14px] font-bold leading-tight transition-colors ${
              withCheckbox ? "pl-2.5 pr-4" : "px-4"
            } ${on ? "border-[#2F7BF5] bg-[#2F7BF5] text-white" : "border-black/12 bg-white text-black/60"}`}
          >
            {withCheckbox && (
              <span
                className={`grid size-[18px] shrink-0 place-items-center rounded-[6px] border ${
                  on ? "border-white bg-white text-[#2F7BF5]" : "border-black/20 bg-white text-transparent"
                }`}
              >
                <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12 5 5L20 7" />
                </svg>
              </span>
            )}
            {option}
          </button>
        )
      })}
    </div>
  )
}

export function ConditionFields({
  conditions,
  onChange,
}: {
  conditions: Conditions
  onChange: (next: Conditions) => void
}) {
  const set = (patch: Partial<Conditions>) => onChange({ ...conditions, ...patch })
  const toggleSpecial = (value: string) =>
    set({
      specialTargets: conditions.specialTargets.includes(value)
        ? conditions.specialTargets.filter((item) => item !== value)
        : [...conditions.specialTargets, value],
    })
  const divider = "border-t border-black/[0.06] pt-5"

  return (
    <div className="space-y-5 rounded-2xl bg-white px-0.5 pb-1 pt-1">
      <section>
        <SectionTitle
          action={
            <button
              type="button"
              onClick={() => onChange(emptyConditions)}
              disabled={conditionCount(conditions) === 0}
              className="rounded-full bg-[#EAF2FE] px-3 py-1.5 text-[11px] font-extrabold text-[#2F7BF5] transition-opacity disabled:opacity-35"
            >
              전체 해제
            </button>
          }
        >
          기본 정보
        </SectionTitle>
        <div className="grid grid-cols-2 items-start gap-3">
          <AgeField value={conditions.age} onChange={(age) => set({ age })} />
          <FieldSelect
            label="최종학력"
            value={conditions.education}
            options={educationOptions}
            sub={educationSub}
            subValue={conditions.educationDetail}
            onChange={(education) => set({ education, educationDetail: "" })}
            onSubChange={(educationDetail) => set({ educationDetail })}
          />
          <FieldSelect
            label="현재 상태"
            value={conditions.currentStatus}
            options={statusOptions}
            sub={statusSub}
            subValue={conditions.statusDetail}
            onChange={(currentStatus) => set({ currentStatus, statusDetail: "" })}
            onSubChange={(statusDetail) => set({ statusDetail })}
          />
        </div>
      </section>

      <section className={divider}>
        <SectionTitle>거주 및 가구 정보</SectionTitle>
        <div className="grid grid-cols-2 items-start gap-x-3 gap-y-5">
          <FieldSelect label="현재 주거 형태" value={conditions.housingType} options={housingOptions} onChange={(housingType) => set({ housingType })} />
          <FieldSelect label="가구 형태" value={conditions.householdType} options={householdOptions} onChange={(householdType) => set({ householdType })} />
          <FieldSelect label="부모와 별도 거주 여부" value={conditions.independentLiving} options={independentOptions} onChange={(independentLiving) => set({ independentLiving })} />
          <FieldSelect label="주택 소유 여부" value={conditions.homeOwnership} options={ownershipOptions} onChange={(homeOwnership) => set({ homeOwnership })} />
          <FieldSelect label="세대주 여부" value={conditions.headOfHousehold} options={headOptions} onChange={(headOfHousehold) => set({ headOfHousehold })} />
          <FieldSelect label="주거급여 수급 여부" value={conditions.housingBenefit} options={housingBenefitOptions} onChange={(housingBenefit) => set({ housingBenefit })} />
        </div>
      </section>

      <section className={divider}>
        <SectionTitle>혼인 상태</SectionTitle>
        <FieldSelect label="" value={conditions.maritalStatus} options={maritalOptions} onChange={(maritalStatus) => set({ maritalStatus })} />
      </section>

      <section className={divider}>
        <SectionTitle hint="복수선택 가능">특화대상</SectionTitle>
        <CheckChips label="특화대상" options={specialOptions} selected={conditions.specialTargets} onToggle={toggleSpecial} withCheckbox />
      </section>

      <section className={divider}>
        <SectionTitle hint="복수선택 가능">관심 분야</SectionTitle>
        <InterestAccordion
          options={interestCategories}
          selection={{ categories: conditions.interests, details: conditions.interestDetails ?? [] }}
          onChange={(next) => set({ interests: next.categories, interestDetails: next.details })}
        />
      </section>
    </div>
  )
}

export function ConditionToggleButton({
  open,
  disabled,
  onClick,
}: {
  open: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-expanded={open && !disabled}
      className={`mt-3 flex w-full items-center justify-between rounded-xl bg-[#f7f8fb] px-4 py-3.5 text-left text-xs font-extrabold ${
        disabled ? "text-black/25" : "text-[#2F7BF5]"
      }`}
    >
      조건 직접 설정
      <Chevron open={open && !disabled} />
    </button>
  )
}

export function ConditionSummaryStrip({
  conditions,
  customized,
  onClick,
}: {
  conditions: Conditions
  customized: boolean
  onClick: () => void
}) {
  const count = conditionCount(conditions)
  const list = orderedConditions(conditions)
  const title = customized
    ? count
      ? `직접 설정 조건 ${count}개 적용 중`
      : "직접 설정 조건 없음"
    : "내 조건 적용 중"
  const sub = customized
    ? count
      ? summarize(list, 3)
      : "사하구 거주 기준으로만 검색 중"
    : `사하구 · ${summarize(list, 2)}`
  return (
    <button
      onClick={onClick}
      className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-[#D6E6FD] bg-[#F2F7FF] px-3.5 py-3 text-left"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-[#2F7BF5]">
        {customized ? (
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="8" cy="17" r="2" />
          </svg>
        ) : (
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
          </svg>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <b className="flex items-center gap-1 text-xs font-black text-[#1F63D6]">
          {title}
          {!customized && (
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 12 5 5 9-10" />
            </svg>
          )}
        </b>
        <small className="mt-0.5 block truncate text-[11px] font-semibold text-black/45">{sub}</small>
      </span>
      <span className="text-lg leading-none text-black/30" aria-hidden="true">›</span>
      <span className="sr-only">적용 조건 보기</span>
    </button>
  )
}

export function AppliedConditionsSheet({
  conditions,
  customized,
  onClose,
  onEdit,
}: {
  conditions: Conditions
  customized: boolean
  onClose: () => void
  onEdit: () => void
}) {
  const values = groupValues(conditions)
  const filled = groupTitles.filter(([key]) => values[key].length)
  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/35" onClick={onClose}>
      <div
        className="w-full max-w-[480px] rounded-t-[28px] bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-black/15" />
        <div className="mb-4 mt-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-black">적용 중인 조건</h2>
            <p className="mt-1 text-[10px] font-medium text-black/35">
              {customized
                ? "이번 검색에만 적용돼요. 마이페이지 프로필은 바뀌지 않아요."
                : "마이페이지에 저장된 내 조건이에요."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full bg-[#f3f4f6] text-lg text-black/50"
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <div className="max-h-[48vh] space-y-5 overflow-y-auto rounded-2xl bg-[#f7f8fb] p-4">
          <div>
            <h3 className="text-xs font-black">지역</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-white px-3 py-2 text-[11px] font-extrabold text-[#2F7BF5]">사하구</span>
            </div>
          </div>
          {filled.map(([key, title]) => (
            <div key={key}>
              <h3 className="text-xs font-black">{title}</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {values[key].map((value) => (
                  <span key={value} className="rounded-full bg-white px-3 py-2 text-[11px] font-extrabold text-[#2F7BF5]">
                    {value}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!filled.length && (
            <p className="text-[11px] font-semibold text-black/40">직접 설정한 조건이 없어요.</p>
          )}
        </div>
        <button onClick={onEdit} className="mt-5 w-full rounded-2xl bg-[#2F7BF5] py-4 text-sm font-black text-white">
          조건 수정하기
        </button>
      </div>
    </div>
  )
}
