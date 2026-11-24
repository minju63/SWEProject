const text = (v, fallback = '공식 공고 확인 필요') =>
  typeof v === 'string' && v.trim() ? v : fallback;
export function safeOfficialUrl(v) {
  if (typeof v !== 'string') return undefined;
  try {
    const u = new URL(v);
    return ['https:', 'http:'].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
}
export function mapHousingPolicy(row) {
  const sectionText = (key) => {
    const sections = row.eligibility_conditions?.condition_sections;
    if (!Array.isArray(sections)) return undefined;
    const value = sections.find((section) => section.key === key)?.text;
    return typeof value === 'string' && value !== '공식 공고의 세부 기준 확인 필요'
      ? value
      : undefined;
  };
  const regions = (row.policy_region ?? []).map((r) => r.region_code);
  const region = regions.includes('26380')
    ? '사하구'
    : regions.includes('26230')
      ? '부산진구'
      : regions.includes('26')
        ? '부산 전체'
        : '전국';
  const known = ['모집 중', '7일 내 마감', '상시', '모집 예정', '마감됨'];
  const recruitmentStatus = known.includes(row.recruitment_status)
    ? row.recruitment_status
    : '기간 미정';
  return {
    id: row.policy_id,
    title: row.title,
    category:
      row.policy_category?.category_name ||
      {
        JOB: '취업·진로',
        HOUSING: '주거·생활',
        FINANCE: '장학·금융',
        CULTURE: '문화',
      }[row.collection_domain] ||
      '기타',
    region,
    fromDatabase: true,
    eligibilityVerified: row.eligibility_verified === true,
    eligibilityRules: row.eligibility_conditions,
    regionCodes: regions,
    minAge: row.min_age,
    maxAge: row.max_age,
    itemType: row.item_type,
    target: text(row.target_summary),
    description: text(row.support_content),
    benefit: text(row.support_content),
    organization: '공식 안내 참고',
    applicationPeriod: row.is_always_open
      ? '상시 모집'
      : `${row.application_start_date ?? '시작일 확인 필요'} ~ ${row.application_end_date ?? '마감일 확인 필요'}`,
    recruitmentStatus,
    status:
      recruitmentStatus === '마감됨'
        ? '종료'
        : recruitmentStatus === '7일 내 마감'
          ? '마감 임박'
          : ['모집 중', '상시'].includes(recruitmentStatus)
            ? '신청 가능'
            : '확인 필요',
    deadline:
      typeof row.d_day === 'number'
        ? row.d_day > 0
          ? `D-${row.d_day}`
          : row.d_day === 0
            ? 'D-Day'
            : '마감'
        : recruitmentStatus,
    residenceCondition:
      sectionText('residence') ||
      (regions.length
        ? regions
            .map(
              (r) =>
                ({
                  KR: '전국',
                  26: '부산 전체',
                  26230: '부산진구',
                  26380: '사하구',
                })[r] ?? r
            )
            .join(' · ')
        : '적용 지역 확인 필요'),
    ageCondition:
      sectionText('age') ||
      (row.min_age != null || row.max_age != null
        ? `만 ${row.min_age ?? '제한 없음'}~${row.max_age ?? '제한 없음'}세`
        : '공식 공고의 연령·가구 조건 확인 필요'),
    incomeCondition: sectionText('income') || text(row.income_condition),
    employmentOrStudentCondition: sectionText('status') || '공식 공고 확인 필요',
    applicationMethod: text(row.application_method),
    requiredDocuments: [],
    application_process: row.application_process ?? undefined,
    required_documents: row.required_documents ?? undefined,
    officialUrl: safeOfficialUrl(row.official_url),
    applicationUrl: safeOfficialUrl(row.application_url),
    applicationStartDate: row.application_start_date,
    applicationEndDate: row.application_end_date,
    isAlwaysOpen: row.is_always_open === true,
    publishedOrder: Date.parse(row.last_collected_at ?? '') || 0,
    subCategories: (row.policy_subcategory_map ?? [])
      .map((m) => m.policy_subcategory?.subcategory_name)
      .filter(Boolean),
    housingDetail: Array.isArray(row.housing_detail)
      ? (row.housing_detail[0] ?? null)
      : (row.housing_detail ?? null),
  };
}
export async function fetchHousingPolicies() {
  const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
  const { authenticatedFetch } = await import('../lib/authenticatedFetch');
  const response = await authenticatedFetch(`${base}/housing/policies`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('주거 정책을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
  const result = await response.json();
  if (!result.success || !Array.isArray(result.data))
    throw new Error('정책 응답을 확인할 수 없어요.');
  return result.data.map(mapHousingPolicy);
}
