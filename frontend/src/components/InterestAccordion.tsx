import { useState } from "react"
import { CULTURE_PENDING, subCategoryTree } from "../data/searchFilter"

export type CategorySelection = { categories: string[]; details: string[] }

export function toggleCategory(sel: CategorySelection, category: string): CategorySelection {
  const subs = subCategoryTree[category] ?? []
  if (subs.length === 0) {
    return {
      ...sel,
      categories: sel.categories.includes(category)
        ? sel.categories.filter((item) => item !== category)
        : [...sel.categories, category],
    }
  }
  const allSelected = subs.every((item) => sel.details.includes(item))
  if (allSelected) {
    return {
      categories: sel.categories.filter((item) => item !== category),
      details: sel.details.filter((item) => !subs.includes(item)),
    }
  }
  return {
    categories: sel.categories.includes(category) ? sel.categories : [...sel.categories, category],
    details: [...sel.details.filter((item) => !subs.includes(item)), ...subs],
  }
}

export function toggleDetail(sel: CategorySelection, category: string, detail: string): CategorySelection {
  const subs = subCategoryTree[category] ?? []
  const details = sel.details.includes(detail)
    ? sel.details.filter((item) => item !== detail)
    : [...sel.details, detail]
  const hasAny = subs.some((item) => details.includes(item))
  return {
    categories: hasAny
      ? sel.categories.includes(category)
        ? sel.categories
        : [...sel.categories, category]
      : sel.categories.filter((item) => item !== category),
    details,
  }
}

// 대분류 체크박스 + 세부분류 아코디언 (프로필 관심 분야와 동일한 방식)
export default function InterestAccordion({
  options,
  selection,
  onChange,
  description,
}: {
  options: string[]
  selection: CategorySelection
  onChange: (next: CategorySelection) => void
  description?: string
}) {
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  return (
    <div>
      {description && <p className="mb-3 text-[11px] font-medium leading-5 text-black/35">{description}</p>}
      <div className="space-y-2.5">
        {options.map((category) => {
          const open = openCategory === category
          const subs = subCategoryTree[category] ?? []
          const selectedCount = subs.filter((item) => selection.details.includes(item)).length
          const allSelected = subs.length > 0 && selectedCount === subs.length
          const partial = selectedCount > 0 && selectedCount < subs.length
          const checked = subs.length === 0 ? selection.categories.includes(category) : allSelected
          const selected = checked || partial || selection.categories.includes(category)
          return (
            <div
              key={category}
              className={`overflow-hidden rounded-2xl border transition-colors ${
                selected ? "border-[#2F7BF5]/35 bg-[#F5F9FF]" : "border-black/[0.07] bg-white"
              }`}
            >
              <div className="flex items-center gap-3 px-4 py-3.5">
                <button
                  type="button"
                  onClick={() => onChange(toggleCategory(selection, category))}
                  aria-pressed={checked}
                  aria-label={`${category} 전체 선택`}
                  className={`grid size-6 shrink-0 place-items-center rounded-[8px] border transition-colors ${
                    checked || partial
                      ? "border-[#2F7BF5] bg-[#2F7BF5] text-white"
                      : "border-black/15 bg-white text-transparent"
                  }`}
                >
                  {partial ? (
                    <span className="h-0.5 w-2.5 rounded-full bg-white" />
                  ) : (
                    <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5 12 5 5 9-10" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setOpenCategory((current) => (current === category ? null : category))}
                  className="flex min-w-0 flex-1 items-center text-left"
                  aria-expanded={open}
                >
                  <span className="min-w-0 flex-1">
                    <b className={`block text-sm font-black ${selected ? "text-[#2F7BF5]" : "text-black/70"}`}>{category}</b>
                    {selectedCount > 0 && (
                      <small className="mt-0.5 block text-[10px] font-bold text-black/35">세부분류 {selectedCount}개 선택</small>
                    )}
                  </span>
                  <svg className={`size-4 shrink-0 text-black/30 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </div>
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-200 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                aria-hidden={!open}
                inert={!open}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="border-t border-black/[0.06] px-4 pb-4 pt-3">
                    {subs.length === 0 ? (
                      <p className="text-[11px] font-bold text-black/40">{CULTURE_PENDING}</p>
                    ) : (
                      <>
                        <p className="mb-3 text-[10px] font-semibold text-black/35">세부분류는 여러 개 선택할 수 있어요.</p>
                        <div className="flex flex-wrap gap-2">
                          {subs.map((detail) => {
                            const on = selection.details.includes(detail)
                            return (
                              <button
                                type="button"
                                key={detail}
                                aria-pressed={on}
                                onClick={() => onChange(toggleDetail(selection, category, detail))}
                                className={`rounded-full px-3 py-2 text-[11px] font-extrabold transition-colors ${
                                  on ? "bg-[#2F7BF5] text-white" : "bg-[#f3f4f7] text-black/45"
                                }`}
                              >
                                {detail}
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
