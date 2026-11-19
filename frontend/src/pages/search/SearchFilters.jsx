import { useState, useRef } from 'react';
import SelectMenu from '../../components/SelectMenu.jsx';
import { UserIcon } from '../../components/icons.jsx';
import { STATUSES, toggle } from './searchFilterData';

const CONDITION_FIELDS = ['birth_date', 'region_code', 'residence_months', 'final_education', 'current_status', 'interest_categories', 'housing_type', 'household_type', 'lives_separately', 'marital_status', 'home_ownership', 'household_role', 'housing_benefit_status', 'special_targets'];
const SPECIAL_TARGETS = ['다자녀가구', '중소·중견기업 재직자', '차상위계층', '기초생활수급자', '한부모가정', '장애인', '농업인', '군인', '지역인재', '신생아·영유아 가구', '자립준비청년', '주거취약계층'];
const EDUCATIONS = ['중학교 졸업 이하', '고등학교 졸업', '대학교 졸업 (2년제)', '대학교 졸업 (4년제)', '대학원 졸업 (석사)', '대학원 졸업 (박사)'];
const CURRENT_STATUSES = ['고등학생', '대학생(재학)', '대학생(휴학)', '대학원생', '취업준비생', '직장인', '자영업자', '창업준비생', '기타'];
const INTEREST_CATEGORIES = ['주거·생활', '취업·진로', '장학·금융', '문화'];
const displayCategory = (name) => name === '문화·예술' ? '문화' : name;
const categoryOrder = (name) => {
  const index = INTEREST_CATEGORIES.indexOf(displayCategory(name));
  return index === -1 ? INTEREST_CATEGORIES.length : index;
};
const displayCondition = (field, value, regions) => {
  if (field === 'birth_date') return `생년월일 ${value.replaceAll('-', '.')}`;
  if (field === 'region_code') return value === '26' ? '부산 전체' : value === 'KR' ? '전국'
    : regions.find((region) => region.region_code === value)?.region_name ?? '지역 확인 필요';
  if (field === 'residence_months') return `거주 ${value}개월`;
  if (field === 'lives_separately') return value ? '부모와 별도 거주' : '부모와 함께 거주';
  return Array.isArray(value) ? value.map(displayCategory).join(', ') : String(value);
};
const choices = (labels) => labels.map((label, index) => ({ value: index ? label : '', label }));

function CheckMark() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M3.5 8.2 6.6 11l5.9-6.5" />
  </svg>;
}

function FieldSelect({ label, value, options, onChange }) {
  return <div className="search-condition-field"><span>{label}</span>
    <SelectMenu label={label} value={value} options={options} onChange={onChange} className="search-condition-menu" />
  </div>;
}

function Chips({ options, selected, onToggle }) {
  return <div className="search-choice-list">{options.map((option) => <button type="button" key={option}
    aria-pressed={selected.includes(option)} className={selected.includes(option) ? 'is-selected' : ''}
    onClick={() => onToggle(option)}>{option}</button>)}</div>;
}

// 시트 위쪽 바를 잡고 아래로 끌어 내리면 닫힌다 (100px 이상 내리면 닫고, 아니면 제자리로)
function useSheetDrag(onClose) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const finish = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragY > 100) onClose();
    else setDragY(0);
  };
  return {
    handleProps: {
      onPointerDown: (event) => { startY.current = event.clientY; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); },
      onPointerMove: (event) => { if (dragging) setDragY(Math.max(0, event.clientY - startY.current)); },
      onPointerUp: finish,
      onPointerCancel: finish,
    },
    style: { transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragging ? 'none' : 'transform .18s ease-out' },
  };
}

function SummaryRow({ label, value, onClick }) {
  return <button type="button" className="search-filter-summary-row" onClick={onClick}>
    <b>{label}</b><span>{value}</span><i className="search-chev right" aria-hidden="true" />
  </button>;
}

function ConditionFields({ value, onChange, categories, regions }) {
  const [openInterest, setOpenInterest] = useState('');
  function change(field, next) { onChange({ ...value, [field]: next }); }
  const interests = (value.interest_categories ?? []).map(displayCategory);
  const interestDetails = value.interest_details ?? [];
  const subcategories = Object.fromEntries(categories.map((category) => [displayCategory(category.display_name),
    category.subcategories?.map((sub) => sub.subcategory_name) ?? []]));
  function toggleInterest(category) {
    const subs = subcategories[category] ?? [];
    const selected = interests.includes(category);
    onChange({ ...value, interest_categories: toggle(interests, category),
      interest_details: selected ? interestDetails.filter((detail) => !subs.includes(detail)) : [...new Set([...interestDetails, ...subs])] });
  }
  function toggleInterestDetail(category, detail) {
    const details = toggle(interestDetails, detail);
    const subs = subcategories[category] ?? [];
    onChange({ ...value, interest_details: details,
      interest_categories: subs.some((item) => details.includes(item))
        ? [...new Set([...interests, category])] : interests.filter((item) => item !== category) });
  }
  return <div className="search-condition-fields">
    <div className="search-condition-heading"><h4>기본 정보</h4>
      <button type="button" onClick={() => onChange({})}>전체 해제</button></div>
    <label className="search-condition-field">생년월일
      <input type="date" value={value.birth_date ?? ''} onChange={(event) => {
        const next = { ...value, birth_date: event.target.value };
        delete next.age;
        onChange(next);
      }} />
    </label>
    <FieldSelect label="거주 지역" value={value.region_code ?? ''}
      options={[{ value: '', label: '선택해주세요' }, { value: '26', label: '부산 전체' },
        ...regions.map(({ region_name: name, region_code: code }) => ({ value: code, label: name }))]}
      onChange={(next) => change('region_code', next)} />
    <FieldSelect label="최종 학력" value={value.final_education ?? ''}
      options={choices(['선택해주세요', ...EDUCATIONS])} onChange={(next) => change('final_education', next)} />
    <FieldSelect label="현재 상태" value={value.current_status ?? ''}
      options={choices(['선택해주세요', ...CURRENT_STATUSES])} onChange={(next) => change('current_status', next)} />
    <h4>거주 및 가구 정보</h4>
    <FieldSelect label="현재 주거 형태" value={value.housing_type ?? ''}
      options={choices(['선택해주세요', '월세', '전세', '기숙사·생활관', '공공임대', '자가'])} onChange={(next) => change('housing_type', next)} />
    <FieldSelect label="가구 형태" value={value.household_type ?? ''}
      options={choices(['선택해주세요', '1인가구', '가족가구', '기타'])} onChange={(next) => change('household_type', next)} />
    <FieldSelect label="부모와 별도 거주 여부" value={value.lives_separately == null ? '' : String(value.lives_separately)}
      options={[{ value: '', label: '선택해주세요' }, { value: 'true', label: '예' }, { value: 'false', label: '아니요' }]}
      onChange={(next) => change('lives_separately', next === '' ? null : next === 'true')} />
    <FieldSelect label="주택 소유 여부" value={value.home_ownership ?? ''}
      options={choices(['선택해주세요', '무주택', '유주택'])} onChange={(next) => change('home_ownership', next)} />
    <FieldSelect label="세대주 여부" value={value.household_role ?? ''}
      options={choices(['선택해주세요', '세대주', '예비세대주', '세대원'])} onChange={(next) => change('household_role', next)} />
    <FieldSelect label="주거급여 수급 여부" value={value.housing_benefit_status ?? ''}
      options={choices(['선택해주세요', '수급 중', '수급하지 않음'])} onChange={(next) => change('housing_benefit_status', next)} />
    <div className="search-condition-wide search-condition-marital"><span>혼인 상태</span>
      <div className="search-condition-marital-choices" role="group" aria-label="혼인 상태">
        {['미혼', '기혼'].map((status) => <button type="button" key={status}
          className={value.marital_status === status ? 'is-selected' : ''}
          aria-pressed={value.marital_status === status}
          onClick={() => change('marital_status', value.marital_status === status ? '' : status)}>{status}</button>)}
      </div>
    </div>
    <div className="search-condition-wide search-condition-section"><div className="search-condition-section-title"><b>특화대상</b><span>여러 개 선택</span></div>
      <div className="search-special-grid">{SPECIAL_TARGETS.map((item) => <label key={item}>
        <input type="checkbox" checked={(value.special_targets ?? []).includes(item)}
          onChange={() => change('special_targets', toggle(value.special_targets ?? [], item))} /><span>{item}</span>
      </label>)}</div></div>
    <div className="search-condition-wide search-condition-section"><div className="search-condition-section-title"><b>관심 분야</b><span>여러 개 선택</span></div>
      <div className="search-interest-list search-condition-interest-list">{INTEREST_CATEGORIES.map((category) => {
        const subs = subcategories[category] ?? [];
        const selected = subs.filter((item) => interestDetails.includes(item));
        const all = subs.length ? selected.length === subs.length : interests.includes(category);
        return <div className={`search-interest-item${interests.includes(category) ? ' is-active' : ''}`} key={category}>
          <div className="search-interest-main"><button type="button" className="search-interest-check" aria-label={`${category} 전체 선택`}
            aria-pressed={all} onClick={() => toggleInterest(category)}>{selected.length && !all ? '−' : <CheckMark />}</button>
            <button type="button" className="search-interest-expand" aria-expanded={openInterest === category}
              onClick={() => setOpenInterest(openInterest === category ? '' : category)}><b>{category}</b><i className={`search-chev${openInterest === category ? ' open' : ''}`} aria-hidden="true" /></button></div>
          {openInterest === category && subs.length > 0 && <div className="search-interest-details"><p>세부 분류는 여러 개 선택할 수 있어요</p>
            <Chips options={subs} selected={interestDetails} onToggle={(detail) => toggleInterestDetail(category, detail)} /></div>}
        </div>;
      })}</div></div>
  </div>;
}

function SubSheet({ type, draft, setDraft, onClose, regions }) {
  const titles = { region: '지역', status: '모집 상태', date: '신청 기간' };
  const drag = useSheetDrag(onClose);
  return <div className="search-filter-overlay search-filter-overlay--sub" onClick={onClose}>
    <div className="search-sub-sheet" role="dialog" aria-modal="true" aria-label={titles[type]} style={drag.style} onClick={(event) => event.stopPropagation()}>
      <div className="search-filter-grab" {...drag.handleProps}><div className="search-filter-handle" /></div><div className="search-sub-header"><h2>{titles[type]}</h2>
        <button type="button" aria-label="닫기" onClick={onClose}>×</button></div>
      {type === 'region' && <><div className="search-region-heading"><h3>부산 지역을 선택해주세요</h3>
        <div className="search-region-actions"><button type="button" disabled={!regions.length}
          onClick={() => setDraft((current) => ({ ...current, regions: regions.map((region) => region.region_code) }))}>
          전체 선택</button>
          <button type="button" onClick={() => setDraft((current) => ({ ...current, regions: [] }))}>
            전체 해제</button></div></div>
        <Chips options={regions.map((region) => region.region_name)}
        selected={draft.regions.map((code) => regions.find((region) => region.region_code === code)?.region_name)}
        onToggle={(name) => { const code = regions.find((region) => region.region_name === name)?.region_code; setDraft((current) => ({ ...current, regions: toggle(current.regions, code) })); }} /></>}
      {type === 'status' && <><div className="search-region-heading"><h3>모집 상태를 선택해주세요</h3>
        <div className="search-status-actions"><button type="button"
          onClick={() => setDraft((current) => ({ ...current, statuses: [...STATUSES] }))}>전체 선택</button>
          <button type="button" onClick={() => setDraft((current) => ({ ...current, statuses: [] }))}>
            전체 해제</button></div></div><Chips options={STATUSES} selected={draft.statuses}
        onToggle={(value) => setDraft((current) => ({ ...current, statuses: toggle(current.statuses, value) }))} /></>}
      {type === 'date' && <div className="search-date-grid">
        <label>시작일<input type="date" value={draft.dateStart} onChange={(event) => setDraft((current) => ({ ...current, dateStart: event.target.value }))} /></label>
        <label>종료일<input type="date" value={draft.dateEnd} onChange={(event) => setDraft((current) => ({ ...current, dateEnd: event.target.value }))} /></label>
        <label className="search-date-check"><input type="checkbox" checked={draft.includeAlways} onChange={(event) => setDraft((current) => ({ ...current, includeAlways: event.target.checked }))} />상시 모집 포함</label>
      </div>}
      <button type="button" className="search-sub-done" onClick={onClose}>선택 완료</button>
    </div>
  </div>;
}

export default function SearchFilters({ draft, setDraft, count, countLoading, profile, categories, regions, onReset, onApply, onClose, onEditProfile }) {
  const [openCategory, setOpenCategory] = useState('');
  const [subFilter, setSubFilter] = useState(null);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [appliedOpen, setAppliedOpen] = useState(false);
  const subcategories = Object.fromEntries(categories.map((category) => [category.display_name,
    category.subcategories.map((sub) => sub.subcategory_name)]));
  const orderedCategories = [...categories].sort((a, b) => categoryOrder(a.display_name) - categoryOrder(b.display_name));
  const categorySummary = (category) => (subcategories[category] ?? []).filter((item) => draft.details.includes(item));
  function toggleCategory(category) {
    setDraft((current) => {
      const subs = subcategories[category] ?? [];
      const all = subs.length ? subs.every((item) => current.details.includes(item)) : current.categories.includes(category);
      return { ...current, categories: all ? current.categories.filter((item) => item !== category) : [...new Set([...current.categories, category])],
        details: all ? current.details.filter((item) => !subs.includes(item)) : [...new Set([...current.details, ...subs])] };
    });
  }
  function toggleDetail(category, detail) {
    setDraft((current) => {
      const details = toggle(current.details, detail);
      return { ...current, details, categories: (subcategories[category] ?? []).some((item) => details.includes(item))
        ? [...new Set([...current.categories, category])] : current.categories.filter((item) => item !== category) };
    });
  }
  const regionSummary = draft.regions.length ? `${regions.find((region) => region.region_code === draft.regions[0])?.region_name}${draft.regions.length > 1 ? ` 외 ${draft.regions.length - 1}` : ''}` : '부산 전체';
  const statusSummary = draft.statuses.length ? `${draft.statuses[0]}${draft.statuses.length > 1 ? ` 외 ${draft.statuses.length - 1}` : ''}` : '전체';
  const conditionValues = Object.entries(draft.myConditionsOnly ? profile ?? {} : draft.conditions)
    .filter(([key, value]) => CONDITION_FIELDS.includes(key) && value !== '' && value != null && (!Array.isArray(value) || value.length));
  const drag = useSheetDrag(onClose);
  return <div className="search-filter-overlay" onClick={onClose}>
    <div className="search-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="search-filter-title" style={drag.style} onClick={(event) => event.stopPropagation()}>
      <div className="search-filter-top"><div className="search-filter-grab" {...drag.handleProps}><div className="search-filter-handle" /></div><div className="search-filter-title-row">
        <div><h2 id="search-filter-title">필터</h2><p>필요한 조건만 간단히 설정해보세요.</p></div>
        <button type="button" aria-label="필터 닫기" onClick={onClose}>×</button>
      </div></div>
      <div className="search-filter-body">
        <section><h3>분야</h3><div className="search-interest-list">
          {orderedCategories.map(({ display_name: category }) => {
            const selected = categorySummary(category);
            const all = (subcategories[category] ?? []).length ? selected.length === subcategories[category].length : draft.categories.includes(category);
            return <div className={`search-interest-item${draft.categories.includes(category) ? ' is-active' : ''}`} key={category}>
              <div className="search-interest-main"><button type="button" className="search-interest-check" aria-label={`${category} 전체 선택`} aria-pressed={all}
                onClick={() => toggleCategory(category)}>{selected.length && !all ? '−' : <CheckMark />}</button>
                <button type="button" className="search-interest-expand" aria-expanded={openCategory === category}
                  onClick={() => setOpenCategory(openCategory === category ? '' : category)}><span><b>{category}</b>
                    {selected.length > 0 && <small>세부분류 {selected.length}개 선택</small>}</span><i className={`search-chev${openCategory === category ? ' open' : ''}`} aria-hidden="true" /></button></div>
              {openCategory === category && <div className="search-interest-details"><p>{(subcategories[category] ?? []).length ? '세부분류는 여러 개 선택할 수 있어요.' : '등록된 세부분류가 없어요.'}</p>
                {(subcategories[category] ?? []).length > 0 && <Chips options={subcategories[category]} selected={draft.details} onToggle={(detail) => toggleDetail(category, detail)} />}</div>}
            </div>;
          })}</div></section>
        <div className="search-filter-summary">
          <SummaryRow label="지역" value={regionSummary} onClick={() => setSubFilter('region')} />
          <SummaryRow label="모집 상태" value={statusSummary} onClick={() => setSubFilter('status')} />
          <SummaryRow label="신청 기간" value={draft.dateStart || draft.dateEnd ? `${draft.dateStart || '시작일'} ~ ${draft.dateEnd || '종료일'}${draft.includeAlways ? ' · 상시 포함' : ''}` : '전체 기간'} onClick={() => setSubFilter('date')} />
        </div>
        <section className="search-my-conditions"><h3>내 조건</h3><p>{profile?.region_code ? regions.find((region) => region.region_code === profile.region_code)?.region_name ?? '부산 전체' : '부산 전체'} · {conditionValues.length ? `${conditionValues.length}개 조건 설정됨` : '설정된 조건 없음'}</p>
          <div className="search-condition-toggle"><b>내 조건에 맞는 정책만 보기</b><button type="button" role="switch" aria-checked={draft.myConditionsOnly}
            disabled={!profile} className={draft.myConditionsOnly ? 'is-on' : ''} onClick={() => setDraft((current) => ({ ...current, myConditionsOnly: !current.myConditionsOnly }))}><span /></button></div>
          {!profile && <p className="search-condition-note">로그인 후 프로필 조건으로 검색할 수 있어요.</p>}
          {conditionValues.length > 0 && <button type="button" className="search-condition-strip" onClick={() => setAppliedOpen(true)}>
            <span className="search-condition-strip-icon">{draft.myConditionsOnly ? <UserIcon /> : '☷'}</span>
            <span><b>{draft.myConditionsOnly ? '내 조건 적용 중' : `직접 설정 조건 ${conditionValues.length}개 적용 중`}</b>
              <small>{conditionValues.slice(0, 3).map(([field, value]) => displayCondition(field, value, regions)).join(' · ')}</small></span><strong>›</strong>
          </button>}
          <button type="button" className="search-condition-expand" disabled={draft.myConditionsOnly}
            onClick={() => setConditionsOpen((open) => !open)}>조건 직접 설정 <i className={`search-chev${conditionsOpen ? ' open' : ''}`} aria-hidden="true" /></button>
          <p className="search-condition-note search-condition-expand-note">이번 검색에만 적용돼요. 프로필은 바뀌지 않아요.</p>
          {conditionsOpen && !draft.myConditionsOnly && <ConditionFields value={draft.conditions} categories={categories} regions={regions} onChange={(conditions) => setDraft((current) => ({ ...current, conditions }))} />}
        </section>
      </div>
      <div className="search-filter-actions"><button type="button" onClick={onReset}>초기화</button>
        <button type="button" onClick={onApply}>{countLoading ? '결과 확인 중…' : `결과 ${count ?? 0}건 보기`}</button></div>
    </div>
    {subFilter && <SubSheet type={subFilter} draft={draft} setDraft={setDraft} regions={regions} onClose={() => setSubFilter(null)} />}
    {appliedOpen && <div className="search-filter-overlay search-filter-overlay--sub" onClick={() => setAppliedOpen(false)}>
      <div className="search-applied-sheet" role="dialog" aria-modal="true" aria-label="적용 중인 조건" onClick={(event) => event.stopPropagation()}>
        <div className="search-filter-handle" /><div className="search-sub-header"><div><h2>적용 중인 조건</h2>
          <p>{draft.myConditionsOnly ? '프로필에 저장된 내 조건이에요.' : '이번 검색에만 적용돼요. 프로필은 바뀌지 않아요.'}</p></div>
          <button type="button" aria-label="닫기" onClick={() => setAppliedOpen(false)}>×</button></div>
        <div className="search-applied-list"><h3>지역</h3><span>{regions.find((region) => region.region_code === (draft.myConditionsOnly ? profile?.region_code : draft.conditions.region_code))?.region_name ?? '부산 전체'}</span>
          {conditionValues.length > 0 && <><h3>설정한 조건</h3>{conditionValues.map(([field, value]) => <span key={field}>{displayCondition(field, value, regions)}</span>)}</>}
        </div>
        <button type="button" className="search-sub-done" onClick={() => {
          if (draft.myConditionsOnly) onEditProfile();
          else { setAppliedOpen(false); setConditionsOpen(true); }
        }}>
          {draft.myConditionsOnly ? '내 조건 수정하기' : '조건 수정하기'}</button>
      </div>
    </div>}
  </div>;
}
