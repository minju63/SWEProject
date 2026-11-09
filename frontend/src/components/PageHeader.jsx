export default function PageHeader({ title, right }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {right}
    </header>
  );
}
