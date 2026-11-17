import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchProfile, updateProfile } from '../../api/me';
import { fetchSearchFilters } from '../../api/policies';
import './ProfileEditor.css';

const EDUCATIONS = ['중학교 졸업 이하', '고등학교 졸업', '대학교 졸업 (2년제)', '대학교 졸업 (4년제)', '대학원 졸업 (석사)', '대학원 졸업 (박사)'];
const STATUSES = ['고등학생', '대학생(재학)', '대학생(휴학)', '대학원생', '취업준비생', '직장인', '자영업자', '창업준비생', '기타'];
const TARGETS = ['다자녀가구', '중소·중견기업 재직자', '차상위계층', '기초생활수급자', '한부모가정', '장애인', '농업인', '군인', '지역인재', '신생아·영유아 가구', '자립준비청년', '주거취약계층'];
const SELECTS = [
  ['final_education', '최종 학력', EDUCATIONS],
  ['housing_type', '주거 형태', ['월세', '전세', '기숙사·생활관', '공공임대', '자가']],
  ['household_type', '가구 형태', ['1인가구', '가족가구', '기타']],
  ['home_ownership', '주택 소유', ['무주택', '유주택']],
  ['household_role', '가구 내 지위', ['세대주', '예비세대주', '세대원']],
  ['marital_status', '혼인 상태', ['미혼', '기혼']],
  ['housing_benefit_status', '주거급여', ['수급 중', '수급하지 않음']],
];
const emptyProfile = () => ({ birth_date: '', region_code: '', residence_months: '',
  final_education: '', current_status: [], housing_type: '', household_type: '',
  lives_separately: '', marital_status: '', home_ownership: '', household_role: '',
  housing_benefit_status: '', special_targets: [] });

function toggle(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function ProfileEditor({ userId }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(emptyProfile);
  const [message, setMessage] = useState('');
  const profile = useQuery({ queryKey: ['profile', userId], queryFn: fetchProfile, enabled: !!userId });
  const filters = useQuery({ queryKey: ['search-filters'], queryFn: fetchSearchFilters, enabled: !!userId });

  useEffect(() => {
    if (profile.isSuccess) setDraft({ ...emptyProfile(), ...Object.fromEntries(
      Object.keys(emptyProfile()).map((key) => [key, profile.data?.[key] ?? emptyProfile()[key]])),
      current_status: Array.isArray(profile.data?.current_status) ? profile.data.current_status :
        profile.data?.current_status ? [profile.data.current_status] : [],
      special_targets: Array.isArray(profile.data?.special_targets) ? profile.data.special_targets : [] });
  }, [profile.isSuccess, profile.data]);

  const save = useMutation({
    mutationFn: () => updateProfile({
      ...draft, birth_date: draft.birth_date || null, region_code: draft.region_code || null,
      residence_months: draft.residence_months === '' ? null : Number(draft.residence_months),
      lives_separately: draft.lives_separately === '' ? null : draft.lives_separately === 'true',
      final_education: draft.final_education || null, housing_type: draft.housing_type || null,
      household_type: draft.household_type || null, marital_status: draft.marital_status || null,
      home_ownership: draft.home_ownership || null, household_role: draft.household_role || null,
      housing_benefit_status: draft.housing_benefit_status || null,
    }),
    onSuccess: (saved) => {
      setMessage('내 정보가 저장되었습니다. 정책 조건을 다시 비교할 수 있어요.');
      queryClient.setQueryData(['profile', userId], saved);
      for (const key of ['eligibility', 'policy-explanation', 'policy-comparison', 'policy-compare-ai-summary',
        'policy-compare-similar', 'policy-compare-ai-candidates', 'policy-compare-options'])
        queryClient.removeQueries({ queryKey: [key] });
      queryClient.invalidateQueries({ queryKey: ['policies'] });
      queryClient.invalidateQueries({ queryKey: ['search-filter-count'] });
      queryClient.invalidateQueries({ queryKey: ['similar-policies'] });
    },
    onError: () => setMessage('내 정보를 저장하지 못했어요. 다시 시도해 주세요.'),
  });
  const change = (field, value) => { setMessage(''); setDraft((current) => ({ ...current, [field]: value })); };
  const regions = filters.data?.regions ?? [];

  return <section className="section my-profile" id="profile">
    <h2>내 정보</h2>
    <p>저장한 정보만 정책 신청 자격과 비교합니다. 입력하지 않은 조건은 확인 필요로 표시돼요.</p>
    {profile.isLoading ? <p>내 정보를 불러오고 있어요.</p> : profile.isError
      ? <p role="alert">내 정보를 불러오지 못했어요. <button type="button" onClick={() => profile.refetch()}>다시 시도</button></p>
      : <form onSubmit={(event) => { event.preventDefault(); setMessage(''); save.mutate(); }}>
        <label>생년월일<input type="date" value={draft.birth_date ?? ''} onChange={(event) => change('birth_date', event.target.value)} /></label>
        <label>거주 지역<select value={draft.region_code ?? ''} onChange={(event) => change('region_code', event.target.value)} disabled={filters.isLoading || filters.isError}>
          <option value="">선택해주세요</option>
          <option value="26">부산광역시</option>
          <option value="KR">전국</option>
          {regions.map((region) => <option key={region.region_code} value={region.region_code}>{region.region_name}</option>)}
        </select></label>
        {filters.isError && <p role="alert">지역 목록을 불러오지 못했어요. 다른 정보는 저장할 수 있습니다.</p>}
        <label>거주 기간 (개월)<input type="number" min="0" max="1200" value={draft.residence_months ?? ''} onChange={(event) => change('residence_months', event.target.value)} /></label>
        {SELECTS.map(([field, label, options]) => <label key={field}>{label}<select value={draft[field] ?? ''} onChange={(event) => change(field, event.target.value)}>
          <option value="">선택해주세요</option>{options.map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>)}
        <label>부모와 별도 거주<select value={draft.lives_separately == null ? '' : String(draft.lives_separately)} onChange={(event) => change('lives_separately', event.target.value)}>
          <option value="">선택해주세요</option><option value="true">예</option><option value="false">아니요</option>
        </select></label>
        <fieldset><legend>현재 상태 (중복 선택 가능)</legend>{STATUSES.map((value) => <label key={value}><input type="checkbox" checked={draft.current_status.includes(value)} onChange={() => change('current_status', toggle(draft.current_status, value))} />{value}</label>)}</fieldset>
        <fieldset><legend>특화 대상</legend>{TARGETS.map((value) => <label key={value}><input type="checkbox" checked={draft.special_targets.includes(value)} onChange={() => change('special_targets', toggle(draft.special_targets, value))} />{value}</label>)}</fieldset>
        <button type="submit" disabled={save.isPending}>{save.isPending ? '저장 중…' : '내 정보 저장'}</button>
        {message && <p role="status">{message}</p>}
      </form>}
  </section>;
}
