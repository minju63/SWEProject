// 수집 값 정리 (수집 스크립트 busan-culture-api/lib.js 와 같은 규칙)

export const TARGET_DISTRICTS = ['부산진구', '사하구']; // 지도 서비스 지역
// prettier-ignore
const BUSAN_DISTRICTS = [
  '중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구',
  '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군',
];

// 빈 값·'null' 문자열 → null, 보이지 않는 문자 제거, 한글 자모 조합형으로
export function text(v) {
  if (v === null || v === undefined) return null;
  const t = String(v)
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  return t === '' || t.toLowerCase() === 'null' ? null : t;
}

// 자유 텍스트: 화면 문구('스크랩 공유하기')와 줄바꿈만 정리하고 내용은 고치지 않는다
export const freeText = (v) =>
  (text(v) ?? '')
    .replace(/스크랩\s*공유하기/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// 이름 비교용: 괄호 내용·공백·기호 제거
export const normName = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s()[\]·.,\-_/]/g, '')
    .toLowerCase();

// 주소 비교용: 괄호 내용·'부산광역시'·공백·기호 제거
export const normAddr = (s) =>
  String(s ?? '')
    .normalize('NFC')
    .replace(/\([^)]*\)/g, '')
    .replace(/부산광역시|부산시|부산/g, '')
    .replace(/[\s,.-]/g, '');

// 주소에서 부산 구·군 읽기. 못 읽으면 null
export function parseDistrict(addr) {
  if (!addr) return null;
  const a = String(addr).normalize('NFC');
  const m =
    a.match(/(?:부산(?:광역시|시)?|산광역시)\s*([가-힣]+[구군])(?=\s|,|\(|$)/) ||
    a.match(/^\s*([가-힣]+[구군])(?=\s|,|\(|$)/);
  if (!m) return null;
  const d = m[1] === '진구' ? '부산진구' : m[1];
  return BUSAN_DISTRICTS.includes(d) ? d : null;
}
