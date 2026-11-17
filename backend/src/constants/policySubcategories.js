// Search facets are fixed product labels. Their matches are derived from stored policy data.
export const SEARCH_SUBCATEGORIES = {
  '취업·진로': ['취업지원', '채용·인턴', '창업지원', '직무교육', '재직자지원'],
  '주거·생활': ['청년주택', '월세 지원', '전세·보증금 지원', '이사비 지원', '주거상담·계약지원', '교통비 지원', '공과금·에너지 지원'],
  '장학·금융': ['장학금', '학자금 지원', '생활·금융 대출', '주거금융', '자산형성·저축', '신용·채무 지원', '취업·구직 지원금', '기타'],
  '문화': ['예술인·창작 지원', '문화예술 교육·인력양성', '문화비·이용권 지원', '기타 문화·여가'],
};

const HOUSING_TYPES = {
  청년주택: '청년주택',
  공공임대: '청년주택',
  월세지원: '월세 지원',
  '월세 지원': '월세 지원',
  전세지원: '전세·보증금 지원',
  '전세·보증금 대출': '전세·보증금 지원',
  이사비: '이사비 지원',
  교통비: '교통비 지원',
  공과금: '공과금·에너지 지원',
};

const CULTURE_TYPES = {
  창작지원: '예술인·창작 지원',
  '교육·인력양성': '문화예술 교육·인력양성',
  문화비지원: '문화비·이용권 지원',
  문화할인: '문화비·이용권 지원',
  문화프로그램: '기타 문화·여가',
  공연: '기타 문화·여가',
  전시: '기타 문화·여가',
};

export function searchSubcategories(policy, storedNames = [], detail = {}) {
  if (policy.collection_domain === 'JOB') {
    return storedNames.filter((name) => SEARCH_SUBCATEGORIES['취업·진로'].includes(name));
  }
  if (policy.collection_domain === 'HOUSING') {
    const fromDetail = HOUSING_TYPES[detail.housing_support_type];
    if (fromDetail) return [fromDetail];
    const fromMap = storedNames.map((name) => HOUSING_TYPES[name]).find(Boolean);
    if (fromMap) return [fromMap];
    const title = policy.title ?? '';
    if (/주거상담|안심계약|중개|주거복지센터|전세피해지원센터|주거안심 매니저|마이홈 주거정보/.test(title)) return ['주거상담·계약지원'];
    if (/전세|보증금|보증료/.test(title)) return ['전세·보증금 지원'];
    if (/월세|주거비/.test(title)) return ['월세 지원'];
    if (/이사비/.test(title)) return ['이사비 지원'];
    if (/교통|K-패스|동백패스/.test(title)) return ['교통비 지원'];
    if (/공과금|에너지|수도|전기|가스|연료|통신요금/.test(title)) return ['공과금·에너지 지원'];
    if (!/대출|융자/.test(title) && /주택|임대|기숙사|하우스/.test(title)) return ['청년주택'];
    return [];
  }
  if (policy.collection_domain === 'FINANCE') {
    const title = policy.title ?? '';
    if (detail.finance_type === '장학금') return ['장학금'];
    if (detail.finance_type === '학자금대출' || /학자금/.test(title)) return ['학자금 지원'];
    if (detail.finance_type === '자산형성' || detail.finance_type === '저축' || /적금|저축|청약통장|자산형성/.test(title)) return ['자산형성·저축'];
    if (/신용|채무|부채/.test(title)) return ['신용·채무 지원'];
    if (/취업|구직/.test(title) && /지원금|수당/.test(title)) return ['취업·구직 지원금'];
    if (/주거|전세|보증금/.test(title) && /대출|융자|이자/.test(title)) return ['주거금융'];
    if (/대출|융자|금융|이자/.test(title)) return ['생활·금융 대출'];
    return ['기타'];
  }
  if (policy.collection_domain === 'CULTURE') {
    return [CULTURE_TYPES[detail.culture_type] ?? '기타 문화·여가'];
  }
  return [];
}
