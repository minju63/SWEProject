import type { useAppState } from "../app/AppState"
export function getCompletion(
  profile: ReturnType<typeof useAppState>["profile"],
) {
  const items = [
    { label: "생년월일 입력", complete: Boolean(profile.birthDate) },
    { label: "거주지역 입력", complete: Boolean(profile.region) },
    { label: "현재 상태 입력", complete: Boolean(profile.status) },
    { label: "관심 분야 입력", complete: profile.interests.length > 0 },
    { label: "주거 형태 입력", complete: Boolean(profile.housingType) },
    { label: "최종학력 입력", complete: Boolean(profile.education) },
    { label: "가구 형태 입력", complete: Boolean(profile.householdType) },
  ]
  return {
    items,
    percent: Math.round(
      (items.filter((item) => item.complete).length / items.length) * 100,
    ),
  }
}
