import { useState } from "react"
import {
  ApplicationItem,
  ApplicationStage,
  ReviewStatus,
  ResultStatus,
  todayISO,
  formatDate,
} from "../app/AppState"
import AppSelect from "./AppSelect"
import { Icon } from "../screens/HomeScreen"
import { findPolicyByTitle } from "../data/policies"
import PreparationChecklist from "./PreparationChecklist"

type Props = {
  application: ApplicationItem
  expanded: boolean
  onToggle: () => void
  onUpdate: (patch: Partial<ApplicationItem>) => Promise<boolean | undefined>
  onToggleDocument: (name: string) => Promise<boolean | undefined>
  onMissingLink: () => void
}

export function Deadline({ date }: { date?: string }) {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null
  const days = Math.round(
    (Date.parse(date.slice(0, 10) + "T00:00:00+09:00") -
      Date.parse(todayISO() + "T00:00:00+09:00")) /
      86400000,
  )
  return (
    <span className={`my-deadline ${days <= 7 ? "urgent" : ""}`}>
      {days < 0 ? "마감" : days === 0 ? "D-day" : `D-${days}`}
    </span>
  )
}

export function CategoryTags({
  category,
  region,
}: {
  category: string
  region?: string
}) {
  return (
    <span className="my-tags">
      <span data-category={category}>{category}</span>
      {region && <span>{region}</span>}
    </span>
  )
}

function OfficialLink({
  application,
  onMissing,
  children,
}: {
  application: ApplicationItem
  onMissing: () => void
  children: React.ReactNode
}) {
  return application.officialUrl ? (
    <a
      className="my-primary"
      href={application.officialUrl}
      target="_blank"
      rel="noreferrer"
    >
      {children} ↗
    </a>
  ) : (
    <button className="my-primary" aria-disabled="true" onClick={onMissing}>
      {children} ↗
    </button>
  )
}

export function ApplicationCard({
  application: a,
  expanded,
  onToggle,
  onUpdate,
  onMissingLink,
}: Props) {
  const [more, setMore] = useState(false)
  const done = a.requiredDocuments.filter(
    (d) => d.status === "completed",
  ).length
  const total = a.requiredDocuments.length
  const preparing = a.stage === "신청 준비"
  const ineligible = a.eligibilityOverall
    ? a.eligibilityOverall === "신청 불가"
    : a.eligibilityChecks.some(check => check.status === "unmatched")
  return (
    <article className="my-application">
      <button
        className="my-application-summary"
        onClick={onToggle}
        aria-expanded={preparing ? undefined : expanded}
      >
        <div className="my-card-top">
          <CategoryTags category={a.category} region={a.region} />
          <Deadline date={a.applicationDeadline} />
          <span className={`my-chevron ${expanded ? "open" : ""}`}>⌄</span>
        </div>
        <h3>{a.policyName}</h3>
        <p className="my-caption">
          {preparing
            ? `마감 ${formatDate(a.applicationDeadline) || "공식 공고 확인"}`
            : `신청일 ${formatDate(a.applicationDate) || "미입력"}`}
          {a.stage === "신청 완료" &&
            a.expectedResultDate &&
            ` · 결과 발표 ${formatDate(a.expectedResultDate) || a.expectedResultDate}`}
        </p>
        <div className="my-state-tags">
          {preparing ? (
            <span className={ineligible ? "not-eligible" : "check"}>
              {ineligible ? "! 대상 아님" : a.eligibilityOverall === "확인 필요" || a.eligibilityChecks.some((c) => c.status !== "matched") ||
              !a.eligibilityChecks.length
                ? "! 조건 확인 필요"
                : "✓ 조건 일치"}
            </span>
          ) : (
            <>
              <span>✓ {a.stage}</span>
              <span className="neutral">
                {a.stage === "결과 확인" ? a.resultStatus : a.reviewStatus}
              </span>
            </>
          )}
        </div>
        {preparing && total > 0 && (
          <div className="my-progress-row">
            <div className="my-progress">
              <span style={{ width: `${(done / total) * 100}%` }} />
            </div>
            <span>
              서류 {done}/{total}
            </span>
          </div>
        )}
      </button>
      {expanded && !preparing && (
        <div className="my-application-body">
          <div className="my-data-row">
            <span>현재 단계</span>
            <AppSelect
              compact
              value={a.stage}
              options={["신청 준비", "신청 완료", "결과 확인"]}
              onChange={(v) =>
                onUpdate({
                  stage: v as ApplicationStage,
                  ...(v === "신청 완료" && !a.applicationDate
                    ? { applicationDate: todayISO() }
                    : {}),
                })
              }
            />
          </div>
          {a.stage === "신청 완료" ? (
            <>
              <label className="my-data-row">
                <span>신청 완료일</span>
                <input
                  type="date"
                  value={a.applicationDate}
                  onChange={(e) =>
                    onUpdate({ applicationDate: e.target.value })
                  }
                />
              </label>
              <div className="my-data-row">
                <span>심사 상태</span>
                <AppSelect
                  compact
                  value={a.reviewStatus}
                  options={["접수 완료", "심사 중", "결과 확인 필요", "종료"]}
                  onChange={(v) =>
                    onUpdate({ reviewStatus: v as ReviewStatus })
                  }
                />
              </div>
              <label className="my-data-row">
                <span>결과 발표일</span>
                <input
                  type="date"
                  disabled={a.expectedResultDate === "미정"}
                  value={
                    a.expectedResultDate === "미정" ? "" : a.expectedResultDate
                  }
                  onChange={(e) =>
                    onUpdate({ expectedResultDate: e.target.value })
                  }
                />
              </label>
              <label className="my-unknown">
                <input
                  type="checkbox"
                  checked={a.expectedResultDate === "미정"}
                  onChange={(e) =>
                    onUpdate({
                      expectedResultDate: e.target.checked ? "미정" : "",
                    })
                  }
                />
                결과 발표일 미정
              </label>
              <p className="my-info">
                결과 발표일은 캘린더에 표시돼요. 모르면 ‘미정’으로 저장해주세요.
              </p>
            </>
          ) : (
            <>
              <p className="my-info">
                <b>공식 사이트에서 결과를 확인해주세요</b>
                <br />
                결과는 자동으로 조회되지 않아요.
              </p>
              <div className="my-data-row">
                <span>확인한 결과</span>
                <b>{a.resultStatus}</b>
              </div>
              <div className="my-result-options">
                {(["선정", "미선정", "결과 대기"] as ResultStatus[]).map(
                  (v) => (
                    <button
                      key={v}
                      aria-pressed={a.resultStatus === v}
                      onClick={() => onUpdate({ resultStatus: v })}
                    >
                      {v}
                    </button>
                  ),
                )}
              </div>
              <label className="my-data-row">
                <span>결과 확인일</span>
                <input
                  type="date"
                  value={a.resultDate}
                  onChange={(e) => onUpdate({ resultDate: e.target.value })}
                />
              </label>
            </>
          )}
          <OfficialLink application={a} onMissing={onMissingLink}>
            {a.stage === "결과 확인"
              ? "공식 결과 확인"
              : "공식 사이트에서 진행 상황 확인"}
          </OfficialLink>
          <button
            className="my-more"
            aria-expanded={more}
            onClick={() => setMore(!more)}
          >
            메모·접수번호 {more ? "접기" : "보기"}
          </button>
          {more && (
            <div className="my-extra-fields">
              <label>
                접수번호
                <input
                  defaultValue={a.applicationNumber}
                  onBlur={(e) => {
                    if (e.target.value !== a.applicationNumber)
                      onUpdate({ applicationNumber: e.target.value })
                  }}
                />
              </label>
              <label>
                메모
                <textarea
                  defaultValue={a.memo}
                  onBlur={(e) => {
                    if (e.target.value !== a.memo)
                      onUpdate({ memo: e.target.value })
                  }}
                />
              </label>
              <label>
                다음 할 일
                <span className="my-caption">
                  {" "}
                  · 한 줄에 하나씩 입력해주세요
                </span>
                <textarea
                  defaultValue={a.nextActions.join("\n")}
                  onBlur={(e) =>
                    onUpdate({
                      nextActions: e.target.value
                        .split("\n")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

export function PreparationScreen({
  application: a,
  onUpdate,
  onToggleDocument,
  onMissingLink,
  onBack,
}: Omit<Props, "expanded" | "onToggle"> & {
  onBack: (stage?: ApplicationStage) => void
}) {
  const policy = findPolicyByTitle(a.policyId)
  const [saving, setSaving] = useState(false)
  return (
    <div className="my-page my-preparation">
      <header className="my-header">
        <button aria-label="뒤로 가기" onClick={() => onBack()}>
          ‹
        </button>
        <h1>신청 준비</h1>
      </header>
      <main>
        <article className="my-surface my-preparation-policy">
          <div className="my-card-top">
            <CategoryTags category={a.category} region={a.region} />
            <Deadline date={a.applicationDeadline} />
          </div>
          <h2>{a.policyName}</h2>
          <p className="my-caption">
            ▣ 신청 기간{" "}
            {policy?.applicationPeriod ||
              formatDate(a.applicationDeadline) ||
              "공식 공고에서 확인해주세요"}
          </p>
        </article>
        <section className="my-surface my-conditions">
          <h2>신청 조건</h2>
          {a.eligibilityChecks.length ? (
            a.eligibilityChecks.map((c, i) => (
              <div key={i} className="my-condition-row">
                <span
                  className={c.status === "matched" ? "matched" : c.status === "unmatched" ? "unmatched" : "unknown"}
                >
                  {c.status === "matched" ? "✓" : "!"}
                </span>
                <span>{c.label}</span>
                <small>
                  {c.status === "matched"
                    ? "충족"
                    : c.status === "unmatched"
                      ? "불충족"
                      : "확인 필요"}
                </small>
              </div>
            ))
          ) : (
            <p className="my-caption">
              공식 공고에서 신청 조건을 확인해주세요.
            </p>
          )}
        </section>
        <article className="my-surface my-checklist">
          <PreparationChecklist
            application={a}
            onToggle={onToggleDocument}
            onUpdate={onUpdate}
          />
        </article>
        <section className="my-surface my-extra-fields">
          <label>
            신청 마감일
            <input
              type="date"
              value={a.applicationDeadline}
              onChange={(e) =>
                onUpdate({ applicationDeadline: e.target.value })
              }
            />
          </label>
          <label>
            메모
            <textarea
              defaultValue={a.memo}
              onBlur={(e) => {
                if (e.target.value !== a.memo)
                  onUpdate({ memo: e.target.value })
              }}
            />
          </label>
        </section>
      </main>
      <footer className="my-preparation-footer">
        <OfficialLink application={a} onMissing={onMissingLink}>
          공식 사이트
        </OfficialLink>
        <button
          className="my-primary"
          disabled={saving}
          onClick={async () => {
            if (saving) return
            setSaving(true)
            const saved = await onUpdate({
              stage: "신청 완료",
              applicationDate: a.applicationDate || todayISO(),
            })
            setSaving(false)
            if (saved) onBack("신청 완료")
          }}
        >
          신청 완료로 변경
        </button>
      </footer>
    </div>
  )
}
