import { DragScroll } from './DragScroll'
import { useEffect, useRef, useState } from 'react'
import { ChevronRight, Info } from 'lucide-react'
import {
  AppHeader,
  SearchBar,
  CategoryRow,
  CategoryDonut,
  TabBar,
  SegmentToggle,
  GuideBox,
  DeadlineCard,
  Sparkles,
  BenefitCard,
  CATEGORIES,
} from './index'
import { AiSheet } from './AiSheet'
import { SearchDropdown } from './SearchDropdown'
import CalendarScreen from './CalendarScreen'
import { AlarmSheet } from './AlarmSheet'
import AlarmSettings from './AlarmSettings'
import { NotiSheet } from './NotiSheet'
import { FloatingHannuni } from './FloatingHannuni'
import { PolicyAlarmSheet } from './PolicyAlarmSheet'
import { POLICIES, useFavStore } from './store'
import { DEADLINES, BENEFITS, ALL_BENEFITS, COUNTS, ALL_COUNTS, PCTS, NOTI_NEW } from './data'
export default function App() {
  const [sel, setSel] = useState(null)
  const [tab, setTab] = useState('cal')
  const [calDay, setCalDay] = useState(9)
  const openCalendar = (day) => {
    if (day) setCalDay(day)
    setTab('cal')
  }
  const [scope, setScope] = useState('내 맞춤')
  const [fab, setFab] = useState(() => localStorage.getItem('minju_hannuni_hidden') !== '1')
  useEffect(() => {
    localStorage.setItem('minju_hannuni_hidden', fab ? '0' : '1')
  }, [fab])
  const frameRef = useRef(null)
  const [searching, setSearching] = useState(false)
  const [alarm, setAlarm] = useState(false)
  const [noti, setNoti] = useState(false)
  const [read, setRead] = useState([])
  const unread = NOTI_NEW.length - read.length
  const markRead = (i) => setRead((r) => (r.includes(i) ? r : [...r, i]))
  const [sheet, setSheet] = useState(false)
  const [toast, setToast] = useState(true)
  const fav = useFavStore()
  const [editAlarm, setEditAlarm] = useState(null)
  const [unlikeToast, setUnlikeToast] = useState(null)
  useEffect(() => {
    if (!unlikeToast) return
    const t = setTimeout(() => setUnlikeToast(null), 3000)
    return () => clearTimeout(t)
  }, [unlikeToast])
  const unlike = (id) => setUnlikeToast({ undo: fav.unlike(id), key: Date.now() })
  const all = scope === '전체'
  const counts = all ? ALL_COUNTS : COUNTS
  const list = all ? ALL_BENEFITS : BENEFITS
  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center bg-[#DCE6F5] sm:p-6"
      style={{ fontFamily: "'Pretendard Variable', Pretendard, sans-serif" }}
    >
      {/* phone frame: full viewport on mobile, 390×844 on larger screens */}
      <div className="h-[100dvh] w-full shrink-0 overflow-hidden bg-[#F6F9FE] sm:h-[844px] sm:w-[390px] sm:rounded-[44px] sm:shadow-[0_30px_80px_rgba(24,32,47,0.18)]">
        {/* app root: fills 100% of the phone screen */}
        <div
          ref={frameRef}
          className="relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-b from-[#EAF3FF] to-[#F6F9FE] text-[#18202F] sm:rounded-[44px]"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain pb-[114px] [scrollbar-width:none]">
            {tab === 'my' ? (
              <AlarmSettings
                settings={fav.settings}
                onChange={fav.setSettings}
                onBack={() => setTab('cal')}
              />
            ) : tab === 'cal' ? (
              <CalendarScreen
                likes={fav.likes}
                alarms={fav.alarms}
                onUnlike={unlike}
                onAlarm={setEditAlarm}
                onSettings={() => setTab('my')}
                selectedDay={calDay}
                unread={unread}
                onBell={() => setNoti(true)}
                hannuniHidden={!fab}
                onRestore={() => {
                  setFab(true)
                  setToast(false)
                }}
              />
            ) : (
              <>
                <AppHeader
                  unread={unread}
                  onBell={() => setNoti(true)}
                  hannuniHidden={!fab}
                  onRestore={() => {
                    setFab(true)
                    setToast(false)
                  }}
                />
                <div className="flex flex-col gap-6 px-[18px]">
                  <div className={`relative ${searching ? 'z-40' : ''}`}>
                    <SearchBar active={searching} onFocus={() => setSearching(true)} />
                    {searching && <SearchDropdown />}
                  </div>

                  {/* 2) donut card */}
                  <section className="flex flex-col gap-3 rounded-[24px] bg-gradient-to-br from-[#DDEBFF] to-[#ECE3FF] p-4 shadow-[0_6px_20px_rgba(47,123,245,0.08)]">
                    <div className="flex items-center gap-3">
                      <CategoryDonut selected={sel} onSelect={setSel} />
                      <div className="flex flex-1 flex-col gap-3">
                        {sel === null ? (
                          <>
                            <p className="text-[15px] font-bold leading-[1.45]">
                              부산 <span className="text-[#2F7BF5]">사하구</span> 거주
                              <br />
                              <span className="text-[#2F7BF5]">25세</span> 휴학생 님을 위한
                              <br />
                              맞춤 혜택이에요!
                            </p>
                            <button
                              onClick={() => setSheet(true)}
                              className="flex flex-col gap-1 rounded-[14px] bg-white px-3 py-2.5 text-left shadow-[0_4px_12px_rgba(47,123,245,0.1)]"
                            >
                              <span className="flex items-center gap-1 text-[12.5px] font-bold text-[#2F7BF5]">
                                <Sparkles size={13} fill="#2F7BF5" /> AI 맞춤 추천{' '}
                                <ChevronRight size={14} className="ml-auto" />
                              </span>
                              <span className="text-[11.5px] text-[#5F6B80]">
                                청년 월세 / 이사비 / 교통비
                              </span>
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="flex flex-col gap-1">
                              <p className="text-[15px] font-bold leading-[1.45]">
                                <span className="text-[#2F7BF5]">{CATEGORIES[sel].label}</span>{' '}
                                혜택이
                                <br />
                                {sel === 0 ? '가장 많아요' : '준비되어 있어요'}
                              </p>
                              <p className="text-[11.5px] text-[#5F6B80]">
                                전체 맞춤 혜택 49개 중{' '}
                                <b className="text-[#18202F]">{PCTS[sel]}%</b>
                              </p>
                            </div>
                            <button
                              onClick={() => setSheet(true)}
                              className="flex flex-col gap-1 rounded-[14px] bg-white px-3 py-2.5 text-left shadow-[0_4px_12px_rgba(47,123,245,0.1)]"
                            >
                              <span className="flex items-center gap-1 text-[12px] font-bold text-[#2F7BF5]">
                                <Sparkles size={12} fill="#2F7BF5" /> 이 분야 AI 추천{' '}
                                <ChevronRight size={14} className="ml-auto" />
                              </span>
                              <span className="text-[13px] font-bold text-[#18202F]">
                                청년 월세 지원
                              </span>
                              <span className="text-[11px] font-semibold text-[#EF4E6C]">
                                D-4 마감 임박
                              </span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* 3) categories */}
                  <section className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-[17px] font-bold">카테고리로 둘러보기</h2>
                      <SegmentToggle
                        options={['내 맞춤', '전체']}
                        value={scope}
                        onChange={setScope}
                      />
                    </div>
                    <CategoryRow
                      counts={counts}
                      selected={sel}
                      onSelect={(i) => setSel(sel === i ? null : i)}
                    />
                    {all && (
                      <p className="flex items-center gap-1 px-1 text-[11px] text-[#9AA4B5]">
                        <Info size={12} /> 부산 청년 혜택 전체 312개 · 나에게 해당하지 않는 혜택도
                        포함돼요
                      </p>
                    )}
                  </section>

                  {/* 4) guide */}
                  {sel === null ? (
                    <GuideBox>그래프나 카테고리를 누르면 맞춤 혜택이 나와요</GuideBox>
                  ) : (
                    <section className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-[17px] font-bold">
                          <span
                            className="size-2.5 rounded-full"
                            style={{ background: CATEGORIES[sel].color }}
                          />
                          {CATEGORIES[sel].label} {all ? '전체' : '맞춤'} 혜택{' '}
                          <span className="text-[#2F7BF5]">{counts[sel]}</span>
                        </h2>
                        <button className="flex items-center rounded-full bg-[#EAF2FE] px-3 py-1.5 text-[12px] font-semibold text-[#2F7BF5]">
                          전체 보기
                          <ChevronRight size={13} />
                        </button>
                      </div>
                      <div className="flex flex-col gap-3">
                        {list.map((b) => (
                          <div key={b.id} className={b.status === 'no' ? 'opacity-60' : ''}>
                            <BenefitCard b={b} />
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* 5) deadlines */}
                  <section className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-[17px] font-bold">🔥 찜한 정책 마감 임박</h2>
                      <button
                        onClick={() => openCalendar()}
                        className="-my-3 -mr-2 flex min-h-[44px] min-w-[44px] items-center justify-center px-2 text-[12.5px] font-medium text-[#9AA4B5]"
                      >
                        캘린더
                        <ChevronRight size={14} />
                      </button>
                    </div>
                    <DragScroll className="-mx-[18px] flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-[18px] scroll-px-[18px] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {DEADLINES.filter((d) => fav.likes.includes(d.id)).map((d) => (
                        <DeadlineCard
                          key={d.id}
                          d={d}
                          onUnlike={() => unlike(d.id)}
                          onOpen={() => openCalendar(Number(d.meta.slice(3, 5)))}
                        />
                      ))}
                    </DragScroll>
                  </section>
                </div>
              </>
            )}
          </div>

          {/* 6) Hannuni — draggable */}
          {fab && !searching && !sheet && tab !== 'my' && (
            <FloatingHannuni
              frameRef={frameRef}
              unread={2}
              showBubble={fav.settings.receive[2]}
              onOpen={() => setSheet(true)}
              onHide={() => {
                setFab(false)
                setToast(true)
              }}
            />
          )}
          {!sheet && (
            <div className="absolute inset-x-0 bottom-0 z-10 flex h-[98px] flex-col m-0 rounded-t-[24px] bg-white p-0 shadow-[0_-6px_20px_rgba(47,123,245,0.08)]">
              <div className="h-[64px]">
                <TabBar active={tab} onChange={setTab} />
              </div>
              <div className="flex h-[34px] items-end justify-center bg-white pb-[8px]">
                <span className="h-[5px] w-[134px] rounded-full bg-[#18202F]" />
              </div>
            </div>
          )}
          {!fab && toast && (
            <div className="absolute inset-x-[18px] bottom-[130px] z-20 flex items-center gap-2 rounded-[16px] bg-[#18202F]/95 px-4 py-3.5 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(24,32,47,0.3)]">
              <span>👁‍🗨</span>
              <span className="flex-1">한눈이를 숨겼어요</span>
              <button
                onClick={() => {
                  setFab(true)
                  setToast(false)
                }}
                className="font-bold text-[#6FA6FF]"
              >
                되돌리기
              </button>
            </div>
          )}
          {unlikeToast && (
            <div
              key={unlikeToast.key}
              className="absolute inset-x-[18px] bottom-[130px] z-30 flex items-center gap-2 rounded-[16px] bg-[#18202F]/95 py-1 pl-4 pr-1 text-[13px] font-semibold text-white shadow-[0_10px_24px_rgba(24,32,47,0.3)]"
            >
              <span className="flex-1">찜을 해제했어요 · 알림도 취소돼요</span>
              <button
                onClick={() => {
                  unlikeToast.undo()
                  setUnlikeToast(null)
                }}
                className="h-[44px] cursor-pointer px-3 font-bold text-[#6FA6FF]"
              >
                되돌리기
              </button>
            </div>
          )}
          {searching && (
            <button
              aria-label="검색 닫기"
              onClick={() => setSearching(false)}
              className="absolute inset-0 z-30 bg-black/30"
            />
          )}
          {alarm && <AlarmSheet onClose={() => setAlarm(false)} />}
          {noti && <NotiSheet read={read} onRead={markRead} onClose={() => setNoti(false)} />}
          {editAlarm && (
            <PolicyAlarmSheet
              key={editAlarm}
              policy={POLICIES.find((p) => p.id === editAlarm)}
              initial={fav.alarms[editAlarm] ?? []}
              onSave={(l) => fav.setPolicyAlarms(editAlarm, l)}
              onClose={() => setEditAlarm(null)}
            />
          )}
          {sheet && <AiSheet variant="term" onClose={() => setSheet(false)} />}
        </div>
      </div>
    </div>
  )
}
