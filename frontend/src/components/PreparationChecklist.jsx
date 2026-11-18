import { useState } from 'react'
import { safeOfficialUrl } from '../data/housing'
const COLLAPSED_COUNT = 3
export default function PreparationChecklist({ application, onToggle, onUpdate }) {
  const documents = application.requiredDocuments
  const done = documents.filter((document) => document.status === 'completed').length
  const allDone = documents.length > 0 && done === documents.length
  const [showAll, setShowAll] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const collapsible = documents.length > COLLAPSED_COUNT + 1
  const visible = collapsible && !showAll ? documents.slice(0, COLLAPSED_COUNT) : documents
  async function addDocument(event) {
    event.preventDefault()
    const name = draft.trim()
    if (saving || !name || documents.some((document) => document.name === name)) return
    setSaving(true)
    const saved = await onUpdate({
      requiredDocuments: [...documents, { name, description: '', status: 'pending', custom: true }],
    })
    setSaving(false)
    if (!saved) return
    setDraft('')
    setAdding(false)
    setShowAll(true)
  }
  const addButton = (
    <button type="button" onClick={() => setAdding(true)} className="my-add-document">
      ＋ 준비물 직접 추가
    </button>
  )
  return (
    <div className="preparation-checklist">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-black">준비물 체크리스트</h4>
        {documents.length > 0 && (
          <span
            className={`rounded-full px-2.5 py-1.5 text-[10px] font-black ${
              allDone ? 'bg-[#2F7BF5] text-white' : 'bg-[#f1f3fb] text-[#2F7BF5]'
            }`}
          >
            {allDone ? `${done}/${documents.length} 준비 완료` : `${done}/${documents.length} 준비`}
          </span>
        )}
      </div>

      {documents.length > 0 && (
        <div
          className="my-progress my-checklist-progress"
          role="progressbar"
          aria-label="준비물 완료"
          aria-valuemin={0}
          aria-valuemax={documents.length}
          aria-valuenow={done}
        >
          <span style={{ width: `${(done / documents.length) * 100}%` }} />
        </div>
      )}

      {documents.length > 0 ? (
        <>
          <p className="mt-1 text-[10px] font-medium text-black/35">
            혜택 상세정보에 등록된 준비물이에요. 준비한 서류를 체크해주세요.
          </p>
          <div className="mt-2 divide-y divide-black/[0.06]">
            {visible.map((document) => {
              const checked = document.status === 'completed'
              return (
                <div key={document.name} className="flex items-center gap-3 py-3">
                  <button
                    type="button"
                    onClick={() => onToggle(document.name)}
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={`${document.name} 준비 여부`}
                    className={`grid size-7 shrink-0 place-items-center rounded-full transition-colors ${
                      checked
                        ? 'bg-[#2F7BF5] text-white'
                        : 'border-2 border-black/10 bg-white text-transparent'
                    }`}
                  >
                    <svg
                      className="size-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  </button>
                  <span
                    className={`min-w-0 flex-1 text-xs font-extrabold ${checked ? 'text-black/35 line-through' : 'text-black/70'}`}
                  >
                    {document.name}
                    {document.description && (
                      <span className="mt-1 block text-[10px] font-semibold leading-4 text-[#2F7BF5]">
                        {document.description}
                      </span>
                    )}
                  </span>
                  {safeOfficialUrl(document.guideUrl || application.officialUrl) && (
                    <a
                      className="my-document-guide"
                      href={safeOfficialUrl(document.guideUrl || application.officialUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      준비 방법 ↗
                    </a>
                  )}
                  {document.custom && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate({
                          requiredDocuments: documents.filter(
                            (item) => item.name !== document.name
                          ),
                        })
                      }
                      className="grid size-6 place-items-center rounded-full text-sm text-black/30"
                      aria-label={`${document.name} 삭제`}
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          {collapsible && (
            <button
              type="button"
              onClick={() => setShowAll((open) => !open)}
              aria-expanded={showAll}
              className="flex w-full items-center justify-center gap-1 border-t border-black/[0.06] pt-3 text-[10px] font-extrabold text-black/40"
            >
              {showAll ? '접기' : `나머지 ${documents.length - COLLAPSED_COUNT}개 더보기`}
              <svg
                className={`size-3.5 transition ${showAll ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          )}
        </>
      ) : (
        <div className="mt-3 rounded-xl bg-[#f7f8fb] px-4 py-4 text-center">
          <p className="text-xs font-bold text-black/50">
            공식 공고에서 필요한 서류를 확인해주세요.
          </p>
        </div>
      )}

      <div className="mt-3">
        {adding ? (
          <form onSubmit={addDocument} className="flex gap-2">
            <input
              autoFocus
              maxLength={200}
              disabled={saving}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="준비물 이름"
              className="min-w-0 flex-1 rounded-xl bg-[#f3f4f7] px-3 py-2.5 text-xs font-semibold outline-none"
            />
            <button
              disabled={saving}
              className="rounded-xl bg-[#2F7BF5] px-3 text-[10px] font-extrabold text-white"
            >
              추가
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setAdding(false)
                setDraft('')
              }}
              className="rounded-xl bg-[#f3f4f7] px-3 text-[10px] font-extrabold text-black/45"
            >
              취소
            </button>
          </form>
        ) : documents.length === 0 ? (
          <div className="text-center">{addButton}</div>
        ) : (
          addButton
        )}
      </div>
    </div>
  )
}
