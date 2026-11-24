-- =====================================================================
-- 공간·시설 정책의 장소를 지도에 띄운다 (김대환, 2026-11-24)
--   홈 '공간·시설'의 사상인디스테이션·청년작당소(·민락인디트레이닝센터) 정책은 장소가 없어
--   정책 상세에서 지도로 갈 수 없고, 지도 검색에도 나오지 않았다.
--   이 세 곳은 서비스 지역(사하구·부산진구) 밖이라 청년공간 수집(youthSpaces.js)에도 들어오지 않는다.
--   1. 장소 3곳을 넣는다 (place_key 'SPC-': 공간 운영 정책에 붙인 장소. 하루 1회 갱신의 수집 대상이 아니다)
--      주소·연락처·운영시간: 부산청년플랫폼 공간 안내(young.busan.go.kr/index.nm?menuCd=55·56·57)
--      좌표: 카카오맵 장소 검색(도로명주소 일치 확인). 행안부 검증 전이라 coord_status 'coord_only'
--   2. 해당 정책 5건(culture_detail)에 장소를 연결한다
--   지도에 보이는 조건(서비스 지역 + 청년공간 정책에 연결된 장소)은 뷰를 바꾸지 않고
--   backend/src/repositories/place.repository.js(findPolicyLinkedPlaces)에서 더한다
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run (다시 실행해도 안전)
--   2026-11-24 공용 DB 에는 같은 값을 service_role 로 넣어 두었다
-- 되돌리기: 맨 아래 주석
-- =====================================================================

begin;

insert into place (
  place_id, place_key, name, place_type, region_code, is_target,
  address, road_address, jibun_address, lat, lng, lat_src, lng_src,
  coord_status, coord_source, tel, homepage_url, open_hours_text, closed_days_text,
  fee_text, is_free, fee_type, fee_basis, description,
  source_name, source_id, source_values, is_active, source_checked_at, last_collected_at
) values
  ('c631e024-301b-5488-a1e7-adb178e4f7d4', 'SPC-f4e897b4', '사상인디스테이션', '청년공간', '26530', false,
   '부산광역시 사상구 사상로 190', '부산광역시 사상구 사상로 190', '부산광역시 사상구 괘법동 572-1',
   35.1621690, 128.9851595, 35.1621690, 128.9851595,
   'coord_only', 'source', '051-316-7635', 'http://www.bscf.or.kr/',
   '월~금 09:00~18:00 (행사 시 탄력적 운영)', null,
   null, null, 'per_program', 'source',
   '경전철 사상역 인근 청년문화 공간. 공연(인디워홀·DOC), 참여형 문화예술교육 프로그램, 대관 운영 (운영: 부산문화재단)',
   'young.busan.go.kr', 'menuCd=55',
   '{"official_page":"https://young.busan.go.kr/index.nm?menuCd=55","coord_from":"kakao_place_search"}',
   true, now(), now()),
  ('885e8f3b-47f6-5a2b-9fc4-d2dc1528dd20', 'SPC-76fe825a', '청년작당소', '청년공간', '26110', false,
   '부산광역시 중구 광복중앙로 13, BNK아트시네마 3층', '부산광역시 중구 광복중앙로 13', '부산광역시 중구 신창동1가 8-2',
   35.1005119, 129.0307487, 35.1005119, 129.0307487,
   'coord_only', 'source', '051-711-2980', 'https://www.jakdangso.kr/',
   '월~토 12:00~21:00', '일요일, 공휴일',
   '대관비용 무료', true, 'free', 'source',
   '부산 청년문화 공간. 다목적공간·회의실·라운지·영상도서관·전시공간, 청년문화 프로그램·무료 대관 운영',
   'young.busan.go.kr', 'menuCd=57',
   '{"official_page":"https://young.busan.go.kr/index.nm?menuCd=57","coord_from":"kakao_place_search"}',
   true, now(), now()),
  ('59c8dd10-61ba-51d7-b8c2-8fdbdbe770d0', 'SPC-74c03e27', '민락인디트레이닝센터', '청년공간', '26500', false,
   '부산광역시 수영구 수영로 769 (도시철도 2호선 민락역 지하)', '부산광역시 수영구 수영로 769', '부산광역시 수영구 민락동 345-1',
   35.1670628, 129.1221190, 35.1670628, 129.1221190,
   'coord_only', 'source', '051-754-7661', 'http://www.indiecenter.or.kr/',
   '월~일 10:00~21:00 (센터 상황에 따라 탄력적 운영)', null,
   null, null, 'per_program', 'source',
   '도시철도 2호선 민락역 안 인디문화 공간. 인디문화 단체 창작활동·네트워크 지원, 트레이닝 프로그램 운영',
   'young.busan.go.kr', 'menuCd=56',
   '{"official_page":"https://young.busan.go.kr/index.nm?menuCd=56","coord_from":"kakao_place_search"}',
   true, now(), now())
on conflict (place_id) do update set
  name = excluded.name, address = excluded.address, road_address = excluded.road_address,
  jibun_address = excluded.jibun_address, lat = excluded.lat, lng = excluded.lng,
  lat_src = excluded.lat_src, lng_src = excluded.lng_src, coord_status = excluded.coord_status,
  coord_source = excluded.coord_source, tel = excluded.tel, homepage_url = excluded.homepage_url,
  open_hours_text = excluded.open_hours_text, closed_days_text = excluded.closed_days_text,
  description = excluded.description, is_active = true, updated_at = now();

-- 정책 ↔ 장소 (YCU-004·028 사상인디스테이션, YCU-006·029 청년작당소, YCU-005 민락인디트레이닝센터)
update culture_detail set place_id = 'c631e024-301b-5488-a1e7-adb178e4f7d4'
  where policy_id in ('a2c97bad-7370-5bcf-a6fe-9c82bbb064c7', '5e79129b-591a-5b18-81a7-83ab950f8c75');
update culture_detail set place_id = '885e8f3b-47f6-5a2b-9fc4-d2dc1528dd20'
  where policy_id in ('4cfbf2e0-ae2b-52d0-919f-b4b4614db15d', '926037c3-1fe1-583f-a77b-fa2283e28f78');
update culture_detail set place_id = '59c8dd10-61ba-51d7-b8c2-8fdbdbe770d0'
  where policy_id = '24c0c988-20ce-572c-8e54-6a40d46777d3';

commit;

-- 되돌리기 (필요할 때만)
-- begin;
-- update culture_detail set place_id = null where place_id in
--   ('c631e024-301b-5488-a1e7-adb178e4f7d4', '885e8f3b-47f6-5a2b-9fc4-d2dc1528dd20', '59c8dd10-61ba-51d7-b8c2-8fdbdbe770d0');
-- delete from place where place_key like 'SPC-%';
-- commit;
