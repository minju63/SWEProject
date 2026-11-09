import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <p className="state">
      페이지를 찾을 수 없어요. <Link to="/">홈으로</Link>
    </p>
  );
}
