-- AI 비서 벡터 검색 (AI-REQ-COM-007): 정책·용어를 조각으로 나눠 임베딩(OpenAI text-embedding-3-small, 1536차원)을 저장한다.
-- 검색·상세·비교는 이 테이블을 쓰지 않는다. AI 비서만 match_ai_chunks() 로 조회한다.
-- 실행 순서: 이 SQL → backend 에서 `node scripts/ai/buildEmbeddings.mjs --apply` (조각 생성)
create extension if not exists vector;

create table if not exists ai_search_chunk (
  chunk_id     uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('POLICY', 'TERM')),
  ref_id       text not null,   -- POLICY: policy_id, TERM: 용어 이름
  section      text not null,   -- 개요 / 지원 내용 / 대상·조건 / 신청 방법 / 설명
  content      text not null,
  content_hash text not null,   -- 내용이 바뀌었는지 확인해 바뀐 조각만 다시 임베딩한다
  embedding    vector(1536) not null,
  updated_at   timestamptz not null default now(),
  unique (kind, ref_id, section)
);

create index if not exists ai_search_chunk_embedding_idx
  on ai_search_chunk using hnsw (embedding vector_cosine_ops);
create index if not exists ai_search_chunk_ref_idx on ai_search_chunk (kind, ref_id);

-- 서버(service role)만 읽고 쓴다. 화면(브라우저)에서는 직접 읽지 못한다
alter table ai_search_chunk enable row level security;

-- 질문 임베딩과 가까운 조각을 찾는다. similarity 는 1에 가까울수록 비슷하다
create or replace function match_ai_chunks(
  query_embedding vector(1536),
  match_kind      text,
  match_count     int default 8
)
returns table (ref_id text, section text, content text, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select c.ref_id, c.section, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from ai_search_chunk c
  where c.kind = match_kind
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

revoke all on function match_ai_chunks(vector, text, int) from public, anon, authenticated;
grant execute on function match_ai_chunks(vector, text, int) to service_role;
