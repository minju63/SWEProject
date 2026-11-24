// Only prepares rows for the policy card. The API's evaluated tree remains the verdict source.
const REVIEW_NOTE = /^(?:구조화한 일부 조건만으로 전체 자격 충족을 판정하지 않음|원문 전체 증빙·예외 심사 필요|현재 모집·예산·(?:공실·)?증빙과 담당기관 심사 확인 필요|공식 공고의 전체 조건·예외 대조 및 수동 확인 필요)$/u;
const NOTICE = /\s*기준·대상 범위와 예외는 공식 공고 확인 필요\.?\s*$/u;
const INTERNAL = /(?:\b(?:true|false|ratio|KRW|assets|is_single_parent|independent_livelihood_approved)\b|\[[\d,\s]+\]\s*\(year\)|\b(?:AND|OR|RAW|MANUAL_REVIEW)\b|[a-z]+_[a-z_]+|[{}]|"(?:field|subject|value|operator|unit)")/iu;
const NAMES = {
  owns_home: '본인 주택 소유 여부', lives_apart_from_parents: '부모와 별도 거주',
  birth_year: '출생연도', recognized_income_to_median_ratio: '기준 중위소득 대비 소득인정액',
  assets: '재산', is_single_parent: '미혼부모 해당 여부',
  independent_livelihood_approved: '독립생계 인정 여부',
  income_to_median_ratio: '기준 중위소득 대비 소득',
};
const PROFILE_NAMES = {
  final_education: '최종 학력', current_status: '현재 상태', housing_type: '주거 형태',
  household_type: '가구 유형', marital_status: '혼인 상태', home_ownership: '주택 소유',
  household_role: '세대 내 지위', housing_benefit_status: '주거급여', special_targets: '특별 대상',
};
const SIDO = { 11: '서울', 26: '부산', 27: '대구', 28: '인천', 29: '광주', 30: '대전', 31: '울산', 36: '세종',
  41: '경기', 42: '강원', 43: '충북', 44: '충남', 45: '전북', 46: '전남', 47: '경북', 48: '경남', 50: '제주' };
const SUBJECTS = { applicant: '본인', youth_household: '청년가구', original_household: '원가구', authority: '담당기관' };

const opOf = (item) => String(item.op ?? item.operator ?? '').toUpperCase();
const clean = (value) => typeof value === 'string' ? value.replace(NOTICE, '').trim() : '';
const withoutPeriod = (value) => value.replace(/[.!。]+$/u, '').trim();
const safeText = (value) => {
  const text = clean(value);
  return text && !INTERNAL.test(text) && !REVIEW_NOTE.test(withoutPeriod(text)) ? text : '';
};
const isMemo = (item) => {
  const text = clean(item.text);
  return text && text.split(';').every((part) => REVIEW_NOTE.test(withoutPeriod(part.trim())));
};
const status = (item) => item.status ?? 'UNKNOWN';
const money = (value) => {
  if (!Number.isFinite(value) || value < 0) return '';
  const eok = Math.floor(value / 100000000);
  const man = (value % 100000000) / 10000;
  return `${eok ? `${eok}억 ` : ''}${man ? `${man.toLocaleString('ko-KR')}만 ` : ''}${!eok && !man ? '0 ' : ''}원`.trim();
};
const qualifier = (op) => ({ LTE: ' 이하', GTE: ' 이상', LT: ' 미만', GT: ' 초과', EQ: '' })[op] ?? '';

function mappedRaw(item) {
  const text = clean(item.text || item.original_condition);
  const patterns = [
    [/^본인의 주택 소유 여부:\s*(true|false)\.?$/iu, 'owns_home', 'applicant', (m) => m[1].toLowerCase() === 'true'],
    [/^본인의 부모와 별도 거주:\s*(true|false)\.?$/iu, 'lives_apart_from_parents', 'applicant', (m) => m[1].toLowerCase() === 'true'],
    [/^본인의 is_single_parent:\s*(true|false)\.?$/iu, 'is_single_parent', 'applicant', (m) => m[1].toLowerCase() === 'true'],
    [/^담당기관의 independent_livelihood_approved:\s*(true|false)\.?$/iu, 'independent_livelihood_approved', 'authority', (m) => m[1].toLowerCase() === 'true'],
    [/^본인의 출생연도:\s*\[(\d{4}),\s*(\d{4})\]\s*\(year\)\.?$/iu, 'birth_year', 'applicant', (m) => [Number(m[1]), Number(m[2])]],
    [/^청년가구의 기준 중위소득 대비 소득인정액:\s*(\d+(?:\.\d+)?)\s*\(ratio\)\.?$/iu, 'recognized_income_to_median_ratio', 'youth_household', (m) => Number(m[1])],
    [/^(청년가구|원가구)의 assets:\s*(\d+)\s*\(KRW\)\.?$/iu, 'assets', null, (m) => Number(m[2])],
  ];
  for (const [pattern, field, subject, valueOf] of patterns) {
    const match = pattern.exec(text);
    if (match) return { field, subject: subject ?? (match[1] === '청년가구' ? 'youth_household' : 'original_household'),
      operator: field === 'birth_year' ? 'BETWEEN' : ['assets', 'recognized_income_to_median_ratio'].includes(field) ? 'LTE' : 'EQ',
      value: valueOf(match) };
  }
  return null;
}

function ruleLabel(item, policyTitle = '') {
  const mapped = opOf(item) === 'RAW' ? mappedRaw(item) : null;
  const original = item.original_condition && typeof item.original_condition === 'object' ? item.original_condition : null;
  const field = item.field ?? original?.field ?? mapped?.field;
  const subject = item.subject ?? original?.subject ?? mapped?.subject;
  const value = item.value ?? original?.value ?? mapped?.value;
  const op = opOf(item) === 'RAW' ? opOf(original ?? mapped ?? {}) : opOf(item);
  if (field === 'owns_home' && value === false) return '본인 무주택';
  if (field === 'lives_apart_from_parents' && value === true) return '부모와 별도 거주';
  if (field === 'is_single_parent') return '미혼부모 해당 여부';
  if (field === 'independent_livelihood_approved') return '독립생계 인정 여부';
  if (field === 'birth_year' && Array.isArray(value) && value.length === 2 && value.every(Number.isInteger)) {
    const year = /^(\d{4})_application_year$/u.exec(item.anchor ?? original?.anchor ?? '')?.[1] ??
      /(?:^|\D)(20\d{2})년/u.exec(policyTitle)?.[1];
    return `${year ? `${year}년 신청 대상: ` : ''}${value[0]}~${value[1]}년생`;
  }
  if (field === 'assets' && typeof value === 'number')
    return `${SUBJECTS[subject] ?? ''} 재산 ${money(value)}${qualifier(op)}`.trim();
  if (['recognized_income_to_median_ratio', 'income_to_median_ratio'].includes(field) &&
      typeof value === 'number' && Number.isFinite(value))
    return `${SUBJECTS[subject] ?? ''} 중위소득 ${Number((value * 100).toFixed(6))}%${qualifier(op)}`.trim();
  if (field && NAMES[field]) return `${SUBJECTS[subject] ?? ''} ${NAMES[field]}`.trim();
  // 문구 없이 field/op/value만 저장된 조건도 값을 풀어서 보여준다.
  const plain = (v) => ['string', 'number'].includes(typeof v) && !INTERNAL.test(String(v));
  if (field === 'age' && op === 'BETWEEN' && Array.isArray(value) && value.every(Number.isFinite))
    return `만 ${value[0]}~${value[1]}세`;
  if (field === 'age' && typeof value === 'number' && ['GTE', 'LTE'].includes(op)) return `만 ${value}세${qualifier(op)}`;
  if (['region', 'region_code'].includes(field)) {
    const sido = typeof value === 'string' && value.length === 2 ? SIDO[value] : null;
    return sido ? `${sido} 거주` : '거주 지역 조건';
  }
  if (field === 'residence_months' && Number.isFinite(value) && ['GTE', 'LTE'].includes(op))
    return `거주 기간 ${value}개월${qualifier(op)}`;
  if (field === 'lives_separately' && value === true) return '부모와 별도 거주';
  if (PROFILE_NAMES[field] && ['EQ', 'IN', 'CONTAINS', 'CONTAINS_ANY', 'TEXT'].includes(op)) {
    const values = [value].flat();
    if (values.length && values.every(plain)) return `${PROFILE_NAMES[field]}: ${values.join(' · ')}`;
  }
  return '';
}

function labelOf(item, fallback, policyTitle = '') {
  return safeText(item.label) || safeText(item.text) ||
    safeText(typeof item.original_condition === 'string' ? item.original_condition : '') ||
    ruleLabel(item, policyTitle) || fallback;
}

function signature(item) {
  const source = ['RAW', 'MANUAL_REVIEW'].includes(opOf(item)) ?
    (item.original_condition && typeof item.original_condition === 'object' ? item.original_condition : mappedRaw(item)) : item;
  if (!source?.field || !source?.subject || !source?.operator && !source?.op || !Object.hasOwn(source, 'value')) return null;
  return JSON.stringify([source.field, source.subject, opOf(source), source.value]);
}

function youthRentHouseholdGroup(item, policyTitle) {
  if (!/청년\s*월세/u.test(policyTitle ?? '') || opOf(item) !== 'OR' || item.children?.length !== 5) return false;
  const [base, age, married, parent, livelihood] = item.children;
  return opOf(base) === 'AND' && base.children?.length === 2 &&
    base.children.some((c) => c.field === 'assets' && c.subject === 'original_household' && opOf(c) === 'LTE') &&
    base.children.some((c) => c.field === 'recognized_income_to_median_ratio' && c.subject === 'original_household' && opOf(c) === 'LTE') &&
    age.field === 'age' && opOf(age) === 'GTE' && age.value === 30 &&
    married.field === 'is_married' && parent.field === 'is_single_parent' &&
    opOf(livelihood) === 'AND' && livelihood.children?.some((c) => c.field === 'independent_livelihood_approved');
}

function splitReasons(text) {
  const parts = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '(' || text[index] === '（') depth += 1;
    if (text[index] === ')' || text[index] === '）') depth = Math.max(0, depth - 1);
    if (text[index] === ';' && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts.filter(Boolean);
}

// 문장형 자격 조건을 "한 줄에 조건 하나"로 쪼갠다.
// 예) "A 중 신규보증 트랙은 업력 3개월 이상, 대표자 710점 이상 등의 기준 충족자. 전환보증 트랙은 ..."
//   → "A" / "신규보증: 업력 3개월 이상" / "신규보증: 대표자 710점 이상" / "전환보증: ..."
const LONG_LABEL = 28;
const TAIL = /\s*(?:등의\s*)?(?:기준\s*)?(?:충족자|해당자|해당하는\s*(?:자|사람))\s*$|\s*등\s*별도\s*요건\s*$|\s*등\s*$/u;
const TRACK = /^(?:(.+?)\s*중\s+)?(\S+?)\s*(?:트랙|유형|분야|구분)(?:은|는)\s+(.+)$/u;

function splitClauses(text) {
  const parts = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    if ('(（'.includes(text[i])) depth += 1;
    if (')）'.includes(text[i])) depth = Math.max(0, depth - 1);
    if (!depth && (text[i] === ',' || text[i] === '，' || text[i] === ';')) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.replace(TAIL, '').trim()).filter(Boolean);
}

export function shortenLabel(label) {
  if (typeof label !== 'string' || label.length <= LONG_LABEL) return [label];
  const sentences = label.split(/(?<=[다요음임함])\.\s+|(?<=\S)\.\s+(?=\S)/u).map((s) => s.replace(/[.。]+$/u, '').trim()).filter(Boolean);
  const rows = [];
  sentences.forEach((sentence) => {
    const match = TRACK.exec(sentence);
    if (match) {
      if (match[1]) rows.push(match[1].replace(TAIL, '').trim());
      splitClauses(match[3]).forEach((clause) => rows.push(`${match[2]}: ${clause}`));
    } else splitClauses(sentence).forEach((clause) => rows.push(clause));
  });
  const unique = [...new Set(rows.filter(Boolean))];
  return unique.length ? unique : [label];
}

export function displayConditions(conditions, policyTitle = '') {
  const structured = new Map();
  const collect = (item, exclusion) => {
    if (item.children?.length) {
      if (opOf(item) === 'OR' || opOf(item) === 'NOT' || Array.isArray(item.any)) return;
      return item.children.forEach((child) => collect(child, exclusion));
    }
    if (opOf(item) === 'RAW' || opOf(item) === 'MANUAL_REVIEW') return;
    const key = signature(item);
    if (key && status(item) !== 'UNKNOWN') structured.set(`${exclusion}:${key}`, item);
  };
  conditions.forEach((item) => collect(item, Boolean(item.exclusion)));
  const explicitExclusions = new Set(conditions.filter((item) => item.exclusion &&
    !item.children?.length && !clean(item.text).includes(';')).map((item) =>
    labelOf(item, '', policyTitle)).filter(Boolean));

  const required = [];
  const exclusions = [];
  function visit(item, output, exclusion) {
    if (item.children?.length) {
      if (opOf(item) === 'OR' || Array.isArray(item.any)) {
        const knownGroup = youthRentHouseholdGroup(item, policyTitle);
        const label = knownGroup ? '원가구 소득·재산 기준 또는 심사 면제'
          : labelOf(item, '세부 자격 확인 필요', policyTitle);
        const children = item.children.map((child) => {
          const rows = [];
          visit(child, rows, exclusion);
          return rows.length > 1
            ? { label: '아래 조건을 모두 충족', status: status(child), children: rows }
            : rows[0];
        }).filter(Boolean);
        output.push({ label: label === '세부 자격 확인 필요' ? '다음 중 하나에 해당' : label,
          status: status(item), ...(children.length ? { children } : {}) });
      } else if (opOf(item) === 'NOT') {
        const inner = [];
        item.children.forEach((child) => visit(child, inner, exclusion));
        const label = safeText(item.text) ||
          (inner.length === 1 && !inner[0].children ? `${inner[0].label} 해당 안 됨` : '세부 자격 확인 필요');
        output.push({ label, status: label === '세부 자격 확인 필요' ? 'UNKNOWN' : status(item) });
      } else {
        item.children.forEach((child) => visit(child, output, exclusion));
        if (item.exception_note) output.push({ label: labelOf(item, '세부 자격 확인 필요', policyTitle), status: 'UNKNOWN' });
      }
      return;
    }
    if (isMemo(item)) return;
    const mapped = signature(item);
    const duplicate = mapped && structured.get(`${exclusion}:${mapped}`);
    if (['RAW', 'MANUAL_REVIEW'].includes(opOf(item)) && duplicate && !item.exception_note &&
      (!clean(item.text) || mappedRaw(item) || safeText(item.text) === ruleLabel(duplicate, policyTitle))) return;
    const label = labelOf(item, exclusion ? '제외 사유 확인 필요' : '세부 자격 확인 필요', policyTitle);
    if (exclusion && clean(item.text).includes(';') &&
      (opOf(item) === 'MANUAL_REVIEW' || opOf(item) === 'RAW' || !opOf(item))) {
      splitReasons(clean(item.text)).forEach((part) => {
        const reason = safeText(part) || '제외 사유 확인 필요';
        if (!explicitExclusions.has(reason)) output.push({ label: reason, status: 'UNKNOWN' });
      });
    } else if (exclusion) output.push({ label, status: status(item) });
    else if (label === '세부 자격 확인 필요' && status(item) !== 'UNKNOWN')
      output.push({ label: '그 밖의 세부 조건', status: status(item) });
    else shortenLabel(label).forEach((line) => output.push({ label: line, status: status(item) }));
  }
  conditions.forEach((item) => visit(item, item.exclusion ? exclusions : required, Boolean(item.exclusion)));
  if (!required.length && conditions.some((item) => !item.exclusion))
    required.push({ label: '세부 자격 확인 필요', status: 'UNKNOWN' });
  const unique = (rows) => rows.filter((row, index) =>
    row.anyOf || rows.findIndex((other) => !other.anyOf && other.label === row.label) === index);
  return { required: unique(required), exclusions: unique(exclusions) };
}
