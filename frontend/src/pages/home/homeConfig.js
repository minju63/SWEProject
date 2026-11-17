// 홈 분야 표시 순서·색·아이콘 (FR-H07: 그래프 조각과 같은 순서·색)
export const CATEGORY_STYLE = {
  '주거·생활': { color: '#4f8df5', bg: '#e3eeff', icon: 'home' },
  '취업·진로': { color: '#f0668f', bg: '#fde4ec', icon: 'job' },
  '장학·금융': { color: '#f3b72f', bg: '#fdf1d3', icon: 'coin' },
  문화: { color: '#34c38f', bg: '#dcf5ea', icon: 'music' },
  '공간·시설': { color: '#8c6fe0', bg: '#ebe5fa', icon: 'building' },
};
export const CATEGORY_ORDER = Object.keys(CATEGORY_STYLE);
