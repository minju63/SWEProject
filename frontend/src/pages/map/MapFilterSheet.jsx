// 필터 시트: 분류, 요금, 거리 반경, 지역, 기타(운영 중, 예약 가능). 모두 AND (FR-MAP-023~027)
import { CategoryBadge, Glyph } from './mapIcons.jsx';
import { FilterChip, FilterGroup } from './MapParts.jsx';
import { SERVICE_DISTRICTS, toggleIn } from './mapUtils.js';

const FEES = [
  ['all', '전체'],
  ['free', '무료'],
  ['paid', '유료'],
];

export default function MapFilterSheet(props) {
  return (
    <div
      className="absolute inset-0 z-[70] flex flex-col justify-end bg-black/40"
      onClick={props.onClose}
    >
      <div
        role="dialog"
        aria-label="지도 필터"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85%] flex-col rounded-t-3xl bg-white"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <h2 className="text-[17px] font-black">필터</h2>
          <button
            type="button"
            onClick={props.onClose}
            aria-label="닫기"
            className="grid size-9 place-items-center text-black/40"
          >
            <Glyph name="close" className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-4 pt-2">
          <FilterGroup title="분류">
            <FilterChip active={props.category === 'all'} onClick={() => props.onCategory('all')}>
              전체
            </FilterChip>
            {props.categories.map((c) => (
              <FilterChip
                key={c.code}
                active={props.category === c.code}
                onClick={() => props.onCategory(c.code)}
              >
                <CategoryBadge kind={c.code} color={c.color} className="-my-1 size-8" />
                {c.label}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup title="요금">
            {FEES.map(([v, label]) => (
              <FilterChip key={v} active={props.fee === v} onClick={() => props.onFee(v)}>
                {label}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup title="거리 반경">
            <FilterChip active={props.radius === null} onClick={() => props.onRadius(null)}>
              제한 없음
            </FilterChip>
            {[500, 1000, 2000, 3000].map((m) => (
              <FilterChip key={m} active={props.radius === m} onClick={() => props.onRadius(m)}>
                {m < 1000 ? `${m}m` : `${m / 1000}km`} 이내
              </FilterChip>
            ))}
            {!props.hasLocation && (
              <p className="w-full text-[12px] font-medium text-black/45">
                현재 위치를 알 수 없으면 거리 반경은 적용되지 않아요.
              </p>
            )}
          </FilterGroup>
          <FilterGroup title="지역">
            {SERVICE_DISTRICTS.map((d) => (
              <FilterChip
                key={d}
                active={props.districts.includes(d)}
                onClick={() => props.onDistricts(toggleIn(props.districts, d))}
              >
                {d}
              </FilterChip>
            ))}
          </FilterGroup>
          <FilterGroup title="기타">
            <FilterChip active={props.openNow} onClick={() => props.onOpenNow(!props.openNow)}>
              운영 중
            </FilterChip>
            <FilterChip
              active={props.reservableOnly}
              onClick={() => props.onReservableOnly(!props.reservableOnly)}
            >
              예약 가능
            </FilterChip>
          </FilterGroup>
        </div>
        <div className="flex gap-2 border-t border-black/[0.06] px-5 py-3">
          <button
            type="button"
            onClick={props.onReset}
            className="h-12 rounded-2xl bg-[#f0f1f5] px-5 text-[14px] font-extrabold text-black/60"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={props.onClose}
            className="h-12 flex-1 rounded-2xl bg-[#2F7BF5] text-[14px] font-extrabold text-white"
          >
            장소 {props.count}곳 보기
          </button>
        </div>
      </div>
    </div>
  );
}
