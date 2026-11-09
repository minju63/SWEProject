import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCategories, fetchPolicies } from '../../api/policies';
import PageHeader from '../../components/PageHeader.jsx';
import PolicyCard from '../../components/PolicyCard.jsx';
import StateMessage from '../../components/StateMessage.jsx';

export default function SearchPage() {
  const [input, setInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const params = {
    q: keyword || undefined,
    categoryId: categoryId || undefined,
    page: 1,
    size: 20,
  };
  const policies = useQuery({
    queryKey: ['policies', params],
    queryFn: () => fetchPolicies(params),
  });

  return (
    <>
      <PageHeader title="검색" />
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setKeyword(input.trim());
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="정책명을 검색해 보세요"
        />
        <button type="submit">검색</button>
      </form>

      <div className="chips">
        <button
          className={`chip${categoryId === '' ? ' chip-active' : ''}`}
          onClick={() => setCategoryId('')}
        >
          전체
        </button>
        {categories.data
          ?.filter((c) => c.is_search_enabled)
          .map((c) => (
            <button
              key={c.category_id}
              className={`chip${categoryId === c.category_id ? ' chip-active' : ''}`}
              onClick={() => setCategoryId(c.category_id)}
            >
              {c.category_name}
            </button>
          ))}
      </div>

      {policies.data && <p className="count">총 {policies.data.totalCount}건</p>}
      <StateMessage
        isLoading={policies.isLoading}
        error={policies.error}
        isEmpty={policies.data?.items.length === 0}
      />
      {policies.data?.items.map((p) => (
        <PolicyCard key={p.policy_id} policy={p} />
      ))}
    </>
  );
}
