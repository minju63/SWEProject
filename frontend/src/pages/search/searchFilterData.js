export const STATUSES = ['상시', '모집 예정', '모집 중', '7일 내 마감', '마감'];
export const emptyFilters = () => ({ categories: [], details: [], regions: [], statuses: [], dateStart: '', dateEnd: '', includeAlways: false, myConditionsOnly: false, conditions: {} });

export function toggle(items, item) {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}
