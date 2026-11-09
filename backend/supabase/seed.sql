-- =====================================================================
-- 개발용 샘플 데이터 (seed)
-- 화면 작업용 가짜 데이터입니다. 실제 정책이 아니며 금액·기간도 임의 값입니다.
-- 모든 샘플 정책은 policy_source.external_id 가 'SEED-' 로 시작합니다.
--
-- 샘플 정책만 지우기 (실제 수집 데이터가 들어오면 실행):
--   delete from policy where policy_id in
--     (select policy_id from policy_source where external_id like 'SEED-%');
-- =====================================================================

-- 지역 (행정표준코드 시군구)
insert into region (region_code, region_name, region_level, parent_region_code) values
  ('KR', '전국', 'NATION', null),
  ('26', '부산광역시', 'CITY', 'KR'),
  ('26110', '중구', 'GU', '26'), ('26140', '서구', 'GU', '26'), ('26170', '동구', 'GU', '26'),
  ('26200', '영도구', 'GU', '26'), ('26230', '부산진구', 'GU', '26'), ('26260', '동래구', 'GU', '26'),
  ('26290', '남구', 'GU', '26'), ('26320', '북구', 'GU', '26'), ('26350', '해운대구', 'GU', '26'),
  ('26380', '사하구', 'GU', '26'), ('26410', '금정구', 'GU', '26'), ('26440', '강서구', 'GU', '26'),
  ('26470', '연제구', 'GU', '26'), ('26500', '수영구', 'GU', '26'), ('26530', '사상구', 'GU', '26'),
  ('26710', '기장군', 'GU', '26')
on conflict (region_code) do nothing;

-- 정책 16건 (policy_id 를 고정해서 상세 테이블과 연결)
insert into policy (
  policy_id, title, category_id, collection_domain, item_type, target_summary, support_content,
  min_age, max_age, income_condition, application_start_date, application_end_date, is_always_open,
  application_method, eligibility_conditions, eligibility_verified, application_process, required_documents
)
select
  v.policy_id::uuid, v.title, c.category_id, v.domain, v.item_type, v.target, v.support,
  v.min_age, v.max_age, v.income, v.start_date::date, v.end_date::date, v.always,
  v.method, v.conditions::jsonb, v.verified, v.process::jsonb, v.docs::jsonb
from (values
  -- 주거·생활
  ('00000000-0000-4000-8000-000000000001', '청년 월세 지원', '주거·생활', 'HOUSING', 'POLICY',
   '부산 거주 만 19~34세 무주택 청년', '월 최대 20만 원, 최대 12개월 월세 지원',
   19, 34, null, '2026-10-20', '2026-11-13', false, '온라인 신청',
   '{"all":[{"field":"age","op":"between","value":[19,34]},{"field":"region","op":"starts_with","value":"26"},{"field":"home_ownership","op":"eq","value":"무주택"}]}', true,
   '["온라인 신청","서류 제출","자격 심사","결과 통보"]',
   '[{"key":"d1","name":"주민등록등본","required":true,"confirmed":true},{"key":"d2","name":"임대차계약서 사본","required":true,"confirmed":true},{"key":"d3","name":"월세 이체 내역","required":true,"confirmed":false}]'),
  ('00000000-0000-4000-8000-000000000002', '청년 교통비 지원', '주거·생활', 'HOUSING', 'POLICY',
   '사하구 거주 만 19~34세 청년', '분기별 교통비 최대 6만 원 환급',
   19, 34, null, '2026-11-01', '2026-11-17', false, '구청 홈페이지 신청',
   '{"all":[{"field":"age","op":"between","value":[19,34]},{"field":"region","op":"eq","value":"26380"}]}', true,
   '["홈페이지 신청","교통카드 등록","분기별 환급"]',
   '[{"key":"d1","name":"주민등록등본","required":true,"confirmed":true}]'),
  ('00000000-0000-4000-8000-000000000003', '청년 이사비 지원', '주거·생활', 'HOUSING', 'POLICY',
   '사하구로 전입한 만 19~39세 청년', '이사비·중개수수료 실비 최대 40만 원',
   19, 39, null, '2026-11-01', '2026-11-20', false, '방문 또는 온라인 신청',
   '{"all":[{"field":"age","op":"between","value":[19,39]},{"field":"region","op":"eq","value":"26380"}]}', true,
   '["신청서 제출","영수증 확인","지급"]',
   '[{"key":"d1","name":"주민등록초본","required":true,"confirmed":true},{"key":"d2","name":"이사비 영수증","required":true,"confirmed":true}]'),
  ('00000000-0000-4000-8000-000000000004', '청년 전세자금 대출이자 지원', '주거·생활', 'HOUSING', 'POLICY',
   '부산 거주 만 19~39세 무주택 청년, 소득 기준 충족자', '전세자금 대출이자 연 최대 2% 지원',
   19, 39, '중위소득 150% 이하', '2026-10-01', '2026-11-28', false, '온라인 신청',
   '{"all":[{"field":"age","op":"between","value":[19,39]},{"field":"region","op":"starts_with","value":"26"},{"field":"home_ownership","op":"eq","value":"무주택"}],"exclude":[{"text":"중위소득 150% 초과자 제외"}]}', true,
   '["온라인 신청","은행 대출 실행","이자 지원 신청"]',
   '[{"key":"d1","name":"주민등록등본","required":true,"confirmed":true},{"key":"d2","name":"소득금액증명원","required":true,"confirmed":true}]'),
  ('00000000-0000-4000-8000-000000000005', '해운대 청년 주거 상담', '주거·생활', 'HOUSING', 'POLICY',
   '해운대구 거주 청년', '전월세 계약·주거 정책 1:1 상담',
   null, null, null, null, null, true, '전화 예약',
   '{"all":[{"field":"region","op":"eq","value":"26350"}]}', true,
   '["전화 예약","상담"]', '[]'),

  -- 취업·진로
  ('00000000-0000-4000-8000-000000000006', '청년 면접정장 무료 대여', '취업·진로', 'JOB', 'POLICY',
   '부산 거주 만 18~39세 구직 청년', '면접 정장 3일 무료 대여, 연 3회',
   18, 39, null, null, null, true, '온라인 예약 후 방문',
   '{"all":[{"field":"age","op":"between","value":[18,39]},{"field":"region","op":"starts_with","value":"26"}]}', true,
   '["온라인 예약","방문 수령","반납"]',
   '[{"key":"d1","name":"신분증","required":true,"confirmed":true},{"key":"d2","name":"면접 확인 문자","required":true,"confirmed":false}]'),
  ('00000000-0000-4000-8000-000000000007', '청년 자격증 응시료 지원', '취업·진로', 'JOB', 'POLICY',
   '부산 거주 만 19~34세 취업준비생', '국가기술자격 응시료 연 최대 10만 원',
   19, 34, null, '2026-11-01', '2026-12-05', false, '온라인 신청',
   '{"all":[{"field":"age","op":"between","value":[19,34]},{"field":"region","op":"starts_with","value":"26"},{"field":"current_status","op":"eq","value":"취업준비생"}]}', true,
   '["온라인 신청","응시 영수증 제출","지급"]',
   '[{"key":"d1","name":"응시료 영수증","required":true,"confirmed":true}]'),
  ('00000000-0000-4000-8000-000000000008', '청년 현직자 멘토링', '취업·진로', 'JOB', 'POLICY',
   '만 19~34세 청년', '희망 직무 현직자와 4주 온라인 멘토링',
   19, 34, null, '2026-11-02', '2026-11-25', false, '온라인 신청',
   '{"all":[{"field":"age","op":"between","value":[19,34]}]}', true,
   '["신청","멘토 매칭","멘토링 4회"]', '[]'),
  ('00000000-0000-4000-8000-000000000009', '부산진구 청년 인턴십', '취업·진로', 'JOB', 'POSTING',
   '부산진구 소재 기업 인턴 모집', '3개월 유급 인턴, 월 220만 원',
   null, null, null, '2026-11-05', '2026-11-30', false, '이메일 지원',
   null, false, '["서류 지원","면접","최종 합격"]', null),
  ('00000000-0000-4000-8000-000000000010', '청년 취업 상담 프로그램', '취업·진로', 'JOB', 'POLICY',
   '부산 거주 청년 구직자', '진로·이력서·면접 1:1 상담',
   null, null, null, null, null, true, '전화 또는 방문 예약',
   '{"all":[{"field":"region","op":"starts_with","value":"26"}]}', true,
   '["예약","상담"]', '[]'),

  -- 장학·금융
  ('00000000-0000-4000-8000-000000000011', '부산 청년 희망 장학금', '장학·금융', 'FINANCE', 'POLICY',
   '부산 소재 대학 재학생, 직전 학기 평점 3.0 이상', '학기당 200만 원',
   null, null, null, '2026-11-02', '2026-11-21', false, '온라인 신청',
   '{"all":[{"field":"region","op":"starts_with","value":"26"},{"field":"current_status","op":"in","value":["대학생(재학)","대학생(휴학)"]}],"exclude":[{"text":"직전 학기 평점 3.0 미만 제외"}]}', true,
   '["온라인 신청","성적 증명","선발 심사","결과 발표"]',
   '[{"key":"d1","name":"재학증명서","required":true,"confirmed":true},{"key":"d2","name":"성적증명서","required":true,"confirmed":true}]'),
  ('00000000-0000-4000-8000-000000000012', '청년 저축 매칭 지원', '장학·금융', 'FINANCE', 'POLICY',
   '부산 거주 만 18~34세 근로 청년, 소득 기준 충족자', '월 10만 원 저축 시 10만 원 매칭, 24개월',
   18, 34, '중위소득 140% 이하', '2026-11-09', '2026-12-10', false, '온라인 신청',
   '{"all":[{"field":"age","op":"between","value":[18,34]},{"field":"region","op":"starts_with","value":"26"},{"field":"current_status","op":"in","value":["직장인","자영업자"]}],"exclude":[{"text":"중위소득 140% 초과자 제외"}]}', true,
   '["온라인 신청","소득 심사","통장 개설","매월 저축"]',
   '[{"key":"d1","name":"재직증명서","required":true,"confirmed":true},{"key":"d2","name":"소득금액증명원","required":true,"confirmed":true}]'),
  ('00000000-0000-4000-8000-000000000013', '학자금 대출이자 지원', '장학·금융', 'FINANCE', 'POLICY',
   '부산 거주 만 19~39세 학자금 대출자', '학자금 대출이자 전액 지원',
   19, 39, null, null, null, true, '온라인 신청',
   '{"all":[{"field":"age","op":"between","value":[19,39]},{"field":"region","op":"starts_with","value":"26"}]}', false,
   '["온라인 신청","대출 내역 확인","이자 지원"]',
   '[{"key":"d1","name":"학자금 대출 확인서","required":true,"confirmed":false}]'),

  -- 문화
  ('00000000-0000-4000-8000-000000000014', '청년 문화패스', '문화', 'CULTURE', 'POLICY',
   '부산 거주 만 19~20세', '공연·전시·도서 구입비 연 15만 원',
   19, 20, null, '2026-11-16', '2026-12-15', false, '온라인 신청',
   '{"all":[{"field":"age","op":"between","value":[19,20]},{"field":"region","op":"starts_with","value":"26"}]}', true,
   '["온라인 신청","카드 포인트 지급"]', '[]'),
  ('00000000-0000-4000-8000-000000000015', '부산 청년 작가전', '문화', 'CULTURE', 'EVENT',
   '누구나', '부산 청년 작가 20인 무료 전시',
   null, null, null, null, null, true, '현장 관람',
   null, false, null, null),
  ('00000000-0000-4000-8000-000000000016', '청년 공연 관람료 할인', '문화', 'CULTURE', 'POLICY',
   '만 19~34세 청년', '지정 공연 관람료 50% 할인',
   19, 34, null, '2026-10-01', '2026-11-05', false, '예매처 할인 선택',
   '{"all":[{"field":"age","op":"between","value":[19,34]}]}', true, null, '[]')
) as v(policy_id, title, category_name, domain, item_type, target, support, min_age, max_age, income,
       start_date, end_date, always, method, conditions, verified, process, docs)
join policy_category c on c.category_name = v.category_name;

-- 출처 (SEED 표시)
insert into policy_source (policy_id, source_name, source_type, external_id)
select policy_id, '개발용 샘플', 'MANUAL', 'SEED-' || right(policy_id::text, 2)
from policy where policy_id::text like '00000000-0000-4000-8000-0000000000%';

-- 적용 지역
insert into policy_region (policy_id, region_code) values
  ('00000000-0000-4000-8000-000000000001', '26'), ('00000000-0000-4000-8000-000000000002', '26380'),
  ('00000000-0000-4000-8000-000000000003', '26380'), ('00000000-0000-4000-8000-000000000004', '26'),
  ('00000000-0000-4000-8000-000000000005', '26350'), ('00000000-0000-4000-8000-000000000006', '26'),
  ('00000000-0000-4000-8000-000000000007', '26'), ('00000000-0000-4000-8000-000000000008', 'KR'),
  ('00000000-0000-4000-8000-000000000009', '26230'), ('00000000-0000-4000-8000-000000000010', '26'),
  ('00000000-0000-4000-8000-000000000011', '26'), ('00000000-0000-4000-8000-000000000012', '26'),
  ('00000000-0000-4000-8000-000000000013', '26'), ('00000000-0000-4000-8000-000000000014', '26'),
  ('00000000-0000-4000-8000-000000000015', '26'), ('00000000-0000-4000-8000-000000000016', 'KR');

-- 파트별 상세
insert into housing_detail (policy_id, housing_support_type, monthly_amount, total_amount_max, support_months, payment_method, interest_rate) values
  ('00000000-0000-4000-8000-000000000001', '월세지원', 200000, 2400000, 12, '현금', null),
  ('00000000-0000-4000-8000-000000000002', '교통비', null, 240000, 12, '현금', null),
  ('00000000-0000-4000-8000-000000000003', '이사비', null, 400000, null, '현금', null),
  ('00000000-0000-4000-8000-000000000004', '전세지원', null, null, 24, '이자지원', 2.00),
  ('00000000-0000-4000-8000-000000000005', '청년주택', null, null, null, null, null);

insert into job_detail (policy_id, job_type, company_name, employment_type, job_field, work_region_code, salary_text, headcount, support_amount, support_limit_count, rental_days, program_mode) values
  ('00000000-0000-4000-8000-000000000006', '정장대여', null, null, null, null, null, null, null, 3, 3, '오프라인'),
  ('00000000-0000-4000-8000-000000000007', '자격증지원', null, null, null, null, null, null, 100000, 1, null, null),
  ('00000000-0000-4000-8000-000000000008', '멘토링', null, null, 'IT·마케팅·디자인', null, null, 50, null, null, null, '온라인'),
  ('00000000-0000-4000-8000-000000000009', '인턴십', '(샘플) 서면테크', '인턴', '웹 개발', '26230', '월 220만 원', 3, null, null, null, null),
  ('00000000-0000-4000-8000-000000000010', '취업상담', null, null, null, null, null, null, null, null, null, '혼합');

insert into finance_detail (policy_id, finance_type, support_amount, payment_schedule, savings_monthly_min, savings_monthly_max, match_amount, term_months, gpa_min, gpa_scale, selection_count, duplicate_allowed) values
  ('00000000-0000-4000-8000-000000000011', '장학금', 2000000, '학기별', null, null, null, null, 3.00, 4.5, 100, false),
  ('00000000-0000-4000-8000-000000000012', '자산형성', null, '월별', 100000, 100000, 100000, 24, null, null, 500, false),
  ('00000000-0000-4000-8000-000000000013', '이자지원', null, '학기별', null, null, null, null, null, null, null, true);

insert into culture_detail (policy_id, culture_type, venue_text, event_start_at, event_end_at, schedule_text, price, discount_rate, reservation_required) values
  ('00000000-0000-4000-8000-000000000014', '문화할인', null, null, null, null, null, null, false),
  ('00000000-0000-4000-8000-000000000015', '전시', '(샘플) 부산 청년문화관', '2026-11-10 10:00+09', '2026-11-30 18:00+09', '화~일 10:00~18:00', 0, null, false),
  ('00000000-0000-4000-8000-000000000016', '문화할인', null, null, null, null, null, 50.00, true);
