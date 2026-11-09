import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { fetchBookmarks } from '../../api/me';
import PageHeader from '../../components/PageHeader.jsx';
import StateMessage from '../../components/StateMessage.jsx';

export default function MyPage() {
  const user = useAuthStore((s) => s.user);
  const bookmarks = useQuery({ queryKey: ['bookmarks'], queryFn: fetchBookmarks, enabled: !!user });

  if (!user) {
    return (
      <>
        <PageHeader title="마이" />
        <p className="state">로그인하고 찜·신청 관리를 이용해 보세요.</p>
        <button
          className="primary-button"
          onClick={() => supabase.auth.signInWithOAuth({ provider: 'kakao' })}
        >
          카카오로 시작하기
        </button>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="마이"
        right={
          <button className="text-button" onClick={() => supabase.auth.signOut()}>
            로그아웃
          </button>
        }
      />
      <p>{user.email ?? '로그인됨'}</p>

      <section className="section">
        <h2>찜한 혜택</h2>
        <StateMessage
          isLoading={bookmarks.isLoading}
          error={bookmarks.error}
          isEmpty={bookmarks.data?.length === 0}
          emptyText="찜한 혜택이 없어요."
        />
        <ul className="plain-list">
          {bookmarks.data?.map((b) => (
            <li key={b.bookmark_id}>{b.policy?.title}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
