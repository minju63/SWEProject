// Dr.부 용어 사전 (FR-A12). 사전에 없는 용어는 지어내지 않고 '확인된 정보가 없어요'로 답한다.
// TODO: 팀에서 감수한 용어와 최신 갱신일로 교체
export const GLOSSARY = [
  {
    term: '기준 중위소득',
    aliases: ['중위소득', '기준중위소득'],
    summary:
      '우리나라 가구를 소득 순서로 줄 세웠을 때 딱 가운데에 있는 가구의 소득이에요.\n' +
      '"60% 이하"는 내 가구 소득이 그 가운데 값의 60%보다 적거나 같다는 뜻이에요. 금액은 가구원 수마다 다르고 매년 바뀌어요.',
    source: '보건복지부 기준 중위소득 고시',
    url: 'https://www.mohw.go.kr',
    updated: '2026-08',
  },
  {
    term: '확정일자',
    aliases: ['확정 일자'],
    summary:
      '임대차계약서에 "이 날짜에 이 계약이 있었다"고 공식적으로 도장을 받는 거예요.\n' +
      '집이 경매로 넘어가도 보증금을 다른 사람보다 먼저 돌려받을 수 있는 순위를 정해 줘요. 주민센터나 인터넷등기소에서 받아요.',
    source: '대법원 인터넷등기소',
    url: 'https://www.iros.go.kr',
    updated: '2026-08',
  },
  {
    term: '전입신고',
    aliases: ['전입 신고'],
    summary:
      '새로 이사한 집으로 주민등록 주소를 옮겼다고 신고하는 거예요. 이사 후 14일 안에 주민센터나 정부24에서 할 수 있어요.\n' +
      '많은 청년 주거 지원은 신청 지역에 전입해 있어야 받을 수 있어요.',
    source: '정부24',
    url: 'https://www.gov.kr',
    updated: '2026-08',
  },
  {
    term: '건강보험 자격득실',
    aliases: ['자격득실확인서', '건강보험자격득실'],
    summary:
      '내가 건강보험에 가입한 기간과 상태(직장·지역·피부양자)를 확인하는 서류예요. 건강보험공단 사이트나 앱에서 바로 뗄 수 있어요.',
    source: '국민건강보험공단',
    url: 'https://www.nhis.or.kr',
    updated: '2026-08',
  },
];

export function findTerm(message) {
  const text = message.replace(/\s+/g, '');
  return GLOSSARY.find((g) =>
    [g.term, ...g.aliases].some((k) => text.includes(k.replace(/\s+/g, '')))
  );
}
