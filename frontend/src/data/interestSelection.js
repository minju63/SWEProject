export const interestDetailKey = (category, detail) => `${category}::${detail}`
// Older profiles stored labels only. Assign those labels only to explicitly
// selected parents; a shared label such as '기타' must not select another parent.
export function scopedInterestDetails(categories, details, tree) {
  return categories.flatMap((category) =>
    (tree[category] ?? [])
      .filter(
        (detail) =>
          details.includes(interestDetailKey(category, detail)) ||
          details.includes(detail) ||
          details.length === 0
      )
      .map((detail) => interestDetailKey(category, detail))
  )
}
