-- AI 실행 로그에 걸린 시간·대체 여부를 남긴다 (SRS NFR-COM-005: AI 지연시간·대체 여부 기록)
-- 질문 원문·사용자 식별 정보는 계속 남기지 않는다.
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run. 실행 전에는 예전 컬럼만으로 기록된다(코드가 알아서 대체).
alter table ai_execution_log add column if not exists duration_ms integer;
alter table ai_execution_log add column if not exists fallback boolean not null default false;
