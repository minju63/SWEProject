// Verified against the shared region table (2026-11-17).
export const busanRegions: Record<string, string> = {
  "26": "부산광역시",
  "26110": "부산광역시 중구",
  "26140": "부산광역시 서구",
  "26170": "부산광역시 동구",
  "26200": "부산광역시 영도구",
  "26230": "부산광역시 부산진구",
  "26260": "부산광역시 동래구",
  "26290": "부산광역시 남구",
  "26320": "부산광역시 북구",
  "26350": "부산광역시 해운대구",
  "26380": "부산광역시 사하구",
  "26410": "부산광역시 금정구",
  "26440": "부산광역시 강서구",
  "26470": "부산광역시 연제구",
  "26500": "부산광역시 수영구",
  "26530": "부산광역시 사상구",
  "26710": "부산광역시 기장군",
};
export function regionCode(name: string) {
  return (
    Object.entries(busanRegions).find(([, value]) => value === name)?.[0] ??
    null
  );
}
