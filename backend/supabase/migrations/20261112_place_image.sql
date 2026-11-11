-- =====================================================================
-- place: 지도 카드용 사진·소개문 컬럼 추가 (김대환, PR #2 리뷰 반영)
--   image_url    사진 URL (공공 API·기관 공식 페이지 사진만, 파일은 저장하지 않고 링크만)
--   image_source 사진 출처 페이지 (출처 표시용)
--   description  소개문 (원문)
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run
-- 되돌리기: 맨 아래 주석의 rollback 블록
-- =====================================================================

alter table place add column if not exists image_url    text;
alter table place add column if not exists image_source text;
alter table place add column if not exists description  text;

-- ---------------------------------------------------------------------
-- rollback (필요할 때만 주석을 풀고 실행)
-- ---------------------------------------------------------------------
-- alter table place drop column if exists image_url;
-- alter table place drop column if exists image_source;
-- alter table place drop column if exists description;
