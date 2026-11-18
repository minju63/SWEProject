export const interestDetailKey = (category: string, detail: string) =>
  `${category}::${detail}`;

// Older profiles stored labels only. Assign those labels only to explicitly
// selected parents; a shared label such as '기타' must not select another parent.
export function scopedInterestDetails(
  categories: string[],
  details: string[],
  tree: Record<string, string[]>,
) {
  return categories.flatMap((category) =>
    (tree[category] ?? [])
      .filter(
        (detail) =>
          details.includes(interestDetailKey(category, detail)) ||
          details.includes(detail) || details.length === 0,
      )
      .map((detail) => interestDetailKey(category, detail)),
  );
}
