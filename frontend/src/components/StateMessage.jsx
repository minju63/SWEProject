export default function StateMessage({ isLoading, error, isEmpty, emptyText = '결과가 없어요.' }) {
  if (isLoading) return <p className="state">불러오는 중…</p>;
  if (error) return <p className="state state-error">{error.message}</p>;
  if (isEmpty) return <p className="state">{emptyText}</p>;
  return null;
}
