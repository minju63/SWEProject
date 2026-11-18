function toStringArray(value) {
  if (Array.isArray(value))
    return value.flatMap((item) =>
      typeof item === 'string'
        ? [item]
        : item && typeof item === 'object' && typeof item.name === 'string'
          ? [item.name]
          : []
    )
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? toStringArray(parsed) : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}
export function getApplicationProcess(policy) {
  return toStringArray(policy.application_process) ?? policy.applicationSteps ?? []
}
export function getRequiredDocuments(policy) {
  return getRequiredDocumentItems(policy).map((document) => document.name)
}
export function getRequiredDocumentItems(policy) {
  let raw = policy.required_documents
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = undefined
    }
  }
  const items = Array.isArray(raw) ? raw : (policy.requiredDocuments ?? [])
  return items.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [{ name: item }]
    if (item && typeof item === 'object' && typeof item.name === 'string' && item.name.trim())
      return [
        { key: item.key, name: item.name, required: item.required, confirmed: item.confirmed },
      ]
    return []
  })
}
export const policyCatalog = [
  {
    id: 'busan-double-account',
    subCategories: ['자산형성·저축'],
    requirements: { statuses: ['직장인', '자영업자', '창업준비생'] },
    title: '부산청년 기쁨두배통장',
    region: '부산시',
    category: '장학·금융',
    target: '부산 거주 청년',
    description: '청년이 저축한 금액에 부산시 지원금을 더해 목돈 마련을 돕는 자산형성 정책이에요.',
    benefit: '매월 10만 원 저축 시 지원금을 더해 만기 자산 형성',
    organization: '부산광역시',
    applicationPeriod: '2025. 6. 9. ~ 6. 20.',
    deadline: 'D-5',
    recruitmentStatus: '7일 내 마감',
    status: '마감 임박',
    residenceCondition: '부산광역시 거주',
    ageCondition: '만 18~39세',
    incomeCondition: '기준 중위소득 150% 이하',
    employmentOrStudentCondition: '근로 중인 청년',
    applicationMethod: '부산청년 기쁨두배통장 누리집 온라인 신청',
    requiredDocuments: [
      '주민등록등본',
      '재학증명서 또는 재직증명서',
      '소득 관련 서류',
      '본인 명의 통장',
    ],
    applicationSteps: ['신청 자격 확인', '필요 서류 준비', '온라인 신청', '심사 및 결과 확인'],
    officialUrl: 'https://young.busan.go.kr',
    publishedOrder: 6,
  },
  {
    id: 'national-youth-savings',
    subCategories: ['자산형성·저축'],
    requirements: { statuses: ['직장인', '자영업자', '창업준비생'] },
    title: '청년내일저축계좌',
    region: '전국',
    category: '장학·금융',
    target: '근로 청년',
    description: '근로하는 저소득 청년의 안정적인 자산 형성을 지원해요.',
    benefit: '본인 저축액에 월 10만 원 또는 30만 원 정부지원금 매칭',
    organization: '보건복지부',
    applicationPeriod: '2025. 5. 2. ~ 5. 21.',
    deadline: '모집 예정',
    recruitmentStatus: '모집 예정',
    status: '신청 가능',
    residenceCondition: '전국',
    ageCondition: '만 19~34세',
    incomeCondition: '가구소득 기준 중위소득 100% 이하',
    employmentOrStudentCondition: '근로·사업소득이 있는 청년',
    applicationMethod: '복지로 또는 주소지 행정복지센터 신청',
    requiredDocuments: ['신분증', '소득 증빙서류', '재직증명서', '가족관계증명서'],
    officialUrl: 'https://www.bokjiro.go.kr',
    publishedOrder: 5,
  },
  {
    id: 'busan-asset-building',
    subCategories: ['자산형성·저축'],
    requirements: { statuses: ['직장인'] },
    title: '부산 청년 자산형성 지원',
    region: '부산시',
    category: '장학·금융',
    target: '부산 취업 청년',
    description: '부산 청년의 꾸준한 저축과 금융 역량 강화를 함께 지원해요.',
    benefit: '저축 장려금과 금융교육 제공',
    organization: '부산경제진흥원',
    applicationPeriod: '2025. 7월 예정',
    deadline: '모집 예정',
    recruitmentStatus: '모집 예정',
    status: '신청 가능',
    residenceCondition: '부산광역시 거주',
    ageCondition: '만 18~39세',
    incomeCondition: '기준 중위소득 150% 이하',
    employmentOrStudentCondition: '부산 소재 사업장 재직자',
    applicationMethod: '부산청년플랫폼 온라인 신청',
    requiredDocuments: ['주민등록등본', '재직증명서', '소득금액증명원', '통장 사본'],
    officialUrl: 'https://young.busan.go.kr',
    publishedOrder: 4,
  },
  {
    id: 'youth-future-savings',
    subCategories: ['자산형성·저축'],
    requirements: { statuses: ['직장인', '자영업자', '창업준비생'] },
    title: '청년미래적금',
    region: '전국',
    category: '장학·금융',
    target: '청년 근로자',
    description: '청년의 중장기 저축 습관과 미래 준비를 돕는 금융 지원 정책이에요.',
    benefit: '우대금리와 저축 장려 혜택',
    organization: '서민금융진흥원',
    applicationPeriod: '상시 확인',
    deadline: '상시',
    recruitmentStatus: '상시',
    status: '신청 가능',
    residenceCondition: '전국',
    ageCondition: '만 19~34세',
    incomeCondition: '개인소득 기준 충족 필요',
    employmentOrStudentCondition: '근로 또는 사업소득 보유',
    applicationMethod: '취급 금융기관 앱에서 신청',
    requiredDocuments: ['신분증', '소득확인증명서', '본인 명의 통장'],
    officialUrl: 'https://www.kinfa.or.kr',
    publishedOrder: 3,
  },
  {
    id: 'busan-university-scholarship',
    subCategories: ['장학금'],
    requirements: { statuses: ['대학생'] },
    title: '부산 대학생 생활장학금',
    region: '부산시',
    category: '장학·금융',
    target: '부산 지역 대학생',
    description: '부산 지역 대학생의 학업 지속을 위한 생활비성 장학금을 지원해요.',
    benefit: '학기당 최대 150만 원 생활장학금',
    organization: '부산광역시',
    applicationPeriod: '2025. 6. 1. ~ 6. 30.',
    deadline: 'D-15',
    recruitmentStatus: '모집 중',
    status: '신청 가능',
    residenceCondition: '부산광역시 또는 사하구 거주',
    ageCondition: '만 18~29세',
    incomeCondition: '학자금 지원구간 8구간 이하',
    employmentOrStudentCondition: '국내 대학 재학생',
    applicationMethod: '부산청년플랫폼 온라인 신청',
    requiredDocuments: ['주민등록등본', '재학증명서', '학자금 지원구간 통지서', '본인 명의 통장'],
    officialUrl: 'https://young.busan.go.kr',
    isExample: true,
    publishedOrder: 7,
  },
  {
    id: 'busan-housing-example',
    subCategories: ['월세 지원'],
    requirements: { noHome: true, independent: true },
    title: '부산 청년 주거비 지원',
    region: '부산 전체',
    category: '주거·생활',
    target: '무주택 청년',
    description: '부산 청년의 월세 부담을 덜기 위해 주거비를 지원해요.',
    benefit: '월 최대 20만 원, 최대 12개월 지원',
    organization: '부산광역시',
    applicationPeriod: '2025. 5. 1. ~ 6. 20.',
    deadline: 'D-12',
    recruitmentStatus: '모집 중',
    status: '신청 가능',
    residenceCondition: '부산광역시 거주',
    ageCondition: '만 19~34세',
    incomeCondition: '기준 중위소득 150% 이하',
    employmentOrStudentCondition: '무주택 독립거주 청년',
    applicationMethod: '부산청년플랫폼 온라인 신청',
    requiredDocuments: ['임대차계약서', '주민등록등본', '소득 관련 서류', '월세 납부 증빙'],
    officialUrl: 'https://young.busan.go.kr',
    isExample: true,
    publishedOrder: 2,
  },
  {
    id: 'busan-transport-example',
    subCategories: ['교통비 지원'],
    requirements: { statuses: ['대학생', '취업준비생'] },
    title: '부산 청년 교통비 지원',
    region: '부산 전체',
    category: '주거·생활',
    target: '부산 거주 청년',
    description: '부산 청년의 통학과 구직 활동에 필요한 교통비를 지원해요.',
    benefit: '대중교통 이용금액 일부 환급',
    organization: '부산광역시',
    applicationPeriod: '2025. 5. 1. ~ 5. 31.',
    deadline: 'D-5',
    recruitmentStatus: '7일 내 마감',
    status: '마감 임박',
    residenceCondition: '부산광역시 거주',
    ageCondition: '만 19~34세',
    incomeCondition: '제한 없음',
    employmentOrStudentCondition: '대학생 또는 구직 청년',
    applicationMethod: '동백전 앱에서 신청',
    requiredDocuments: ['주민등록등본', '재학증명서 또는 구직활동 증빙', '교통카드 정보'],
    officialUrl: 'https://young.busan.go.kr',
    isExample: true,
    publishedOrder: 1,
  },
  {
    id: 'saha-career',
    subCategories: ['취업지원', '직무교육'],
    requirements: { statuses: ['취업준비생'] },
    title: '사하구 청년 취업역량 강화사업',
    region: '사하구',
    category: '취업·진로',
    target: '사하구 미취업 청년',
    description: '취업 상담과 실무 교육으로 청년의 구직 준비를 지원해요.',
    benefit: '직무교육, 일대일 상담, 면접 지원',
    organization: '부산광역시 사하구',
    applicationPeriod: '상시',
    deadline: '상시',
    recruitmentStatus: '상시',
    status: '신청 가능',
    residenceCondition: '사하구 거주',
    ageCondition: '만 18~39세',
    incomeCondition: '제한 없음',
    employmentOrStudentCondition: '미취업 또는 구직 중',
    applicationMethod: '사하구 청년창업지원센터 방문 또는 온라인 신청',
    requiredDocuments: ['주민등록등본', '구직등록확인증'],
    isExample: true,
    publishedOrder: 0,
  },
]
export const facilityCatalog = [
  {
    id: 'saha-youth-startup-center',
    type: '청년공간',
    name: '사하 청년창업지원센터',
    region: '사하구',
    description: '청년 창업 상담과 공유 업무공간을 이용할 수 있어요.',
    address: '부산 사하구 낙동대로 413',
    availability: '평일 09:00~18:00',
  },
  {
    id: 'busan-youth-do-dream',
    type: '청년공간',
    name: '부산청년두드림센터',
    region: '부산진구',
    description: '취업 상담, 스터디룸, 청년 프로그램을 운영해요.',
    address: '부산 부산진구 가야대로 772',
    availability: '오늘 운영 중',
  },
  {
    id: 'haeundae-library',
    type: '도서관',
    name: '해운대인문학도서관',
    region: '해운대구',
    description: '자료 열람과 학습 공간을 제공하는 공공도서관이에요.',
    address: '부산 해운대구 반여로 132',
    availability: '화~일 운영',
  },
]
export function findPolicyByTitle(title) {
  const normalized = title.replace(' (예시 정책)', '')
  return policyCatalog.find(
    (policy) => policy.id === title || policy.title === normalized || policy.title === title
  )
}
export function findPolicyById(id) {
  return policyCatalog.find((policy) => policy.id === id)
}
