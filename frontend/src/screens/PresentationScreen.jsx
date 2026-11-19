import { Icon } from './HomeScreen'
function FrameLabel({ number, title, flow }) {
  return (
    <div className="mb-4 px-1">
      <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#2F7BF5]">
        Frame {number}
      </p>
      <h2 className="mt-1 text-xl font-black tracking-[-0.04em] text-[#171923]">{title}</h2>
      <p className="mt-1 text-[11px] font-semibold text-black/35">{flow}</p>
    </div>
  )
}
function MobileFrame({ children }) {
  return (
    <div className="relative h-[760px] w-[360px] overflow-hidden rounded-[34px] border-[6px] border-[#252733] bg-[#f7f8fb] shadow-[0_24px_60px_rgba(23,25,35,0.16)]">
      {children}
    </div>
  )
}
function BottomNav() {
  return (
    <div className="absolute bottom-0 left-0 right-0 grid grid-cols-5 border-t border-black/[0.06] bg-white px-2 pb-3 pt-2">
      {[
        { label: '홈', icon: 'home' },
        { label: '검색', icon: 'search' },
        { label: '지도', icon: 'map' },
        { label: '캘린더', icon: 'calendar' },
        { label: '마이', icon: 'user', active: true },
      ].map((item) => (
        <div
          key={item.label}
          className={`flex flex-col items-center gap-1 text-[9px] font-bold ${item.active ? 'text-[#2F7BF5]' : 'text-black/25'}`}
        >
          <Icon name={item.icon} className="size-5" />
          {item.label}
        </div>
      ))}
    </div>
  )
}
function MyMainFrame() {
  return (
    <MobileFrame>
      <div className="flex h-16 items-center justify-between bg-white px-5">
        <h3 className="text-lg font-black">마이</h3>
        <Icon name="bell" className="size-5" />
      </div>
      <div className="bg-white px-5 pb-5 pt-2">
        <div className="flex items-center gap-3">
          <span className="grid size-14 place-items-center rounded-[19px] bg-[#f1f3fb] text-[#2F7BF5]">
            <Icon name="user" className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <b className="text-lg">은혜님</b>
              <span className="rounded-full bg-[#f1f3fb] px-2 py-1 text-[9px] font-black text-[#2F7BF5]">
                맞춤정보 80%
              </span>
            </div>
            <p className="mt-1 text-[10px] font-semibold text-black/40">
              만 24세 · 부산광역시 사하구 · 취업준비생
            </p>
          </div>
          <span className="grid size-9 place-items-center rounded-xl border border-black/10 text-black/40">
            <Icon name="settings" className="size-4" />
          </span>
        </div>
        <div className="mt-3 flex gap-1.5">
          <span className="rounded-full bg-[#f1f3fb] px-2.5 py-1.5 text-[9px] font-bold text-[#2F7BF5]">
            #취업·진로
          </span>
          <span className="rounded-full bg-[#f1f3fb] px-2.5 py-1.5 text-[9px] font-bold text-[#2F7BF5]">
            #주거·생활
          </span>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            ['2', '찜한 혜택'],
            ['2', '신청 준비'],
            ['1', '신청 완료'],
            ['1', '결과 확인'],
          ].map(([count, label]) => (
            <div
              key={label}
              className="rounded-2xl border border-black/[0.04] bg-[#f7f8fb] py-3 text-center"
            >
              <b className="block text-[21px] leading-none text-[#2F7BF5]">{count}</b>
              <span className="mt-2 block text-[8px] font-bold text-black/40">{label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-5 py-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-extrabold text-[#2F7BF5]">내가 직접 기록하고 관리해요</p>
            <h4 className="mt-1 text-lg font-black">내 신청 관리</h4>
          </div>
          <span className="rounded-full bg-[#f1f3fb] px-3 py-2 text-[9px] font-black text-[#2F7BF5]">
            ＋ 혜택 추가
          </span>
        </div>
        <div className="mt-4 flex gap-2">
          {[
            ['신청 준비', '2'],
            ['신청 완료', '1'],
            ['결과 확인', '1'],
          ].map(([label, count], index) => (
            <span
              key={label}
              className={`rounded-full px-3 py-2 text-[9px] font-black ${index === 0 ? 'bg-[#2F7BF5] text-white' : 'bg-white text-black/40'}`}
            >
              {label} {count}
            </span>
          ))}
        </div>
        <div className="mt-3 rounded-xl bg-[#f1f3fb] p-2.5 text-[9px] font-semibold leading-4 text-[#2F7BF5]">
          공식 사이트와 자동 연동되지 않아요. 직접 관리해주세요.
        </div>
        <div className="mt-3 rounded-[22px] bg-white p-4 shadow-[0_5px_18px_rgba(23,25,35,0.04)]">
          <div className="flex gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#f1f3fb] text-[#2F7BF5]">
              <Icon name="coin" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex gap-1">
                <span className="rounded bg-[#f1f3fb] px-2 py-1 text-[8px] font-black text-[#2F7BF5]">
                  장학·금융
                </span>
                <span className="rounded bg-[#f3f4f6] px-2 py-1 text-[8px] font-black text-black/35">
                  전국
                </span>
              </div>
              <p className="mt-2 text-xs font-black">청년도약계좌</p>
              <span className="mt-2 inline-flex rounded-full bg-[#f3f0fb] px-2 py-1 text-[8px] font-black text-[#7568a3]">
                ? 추가 확인 2개
              </span>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#eceef4]">
            <div className="h-full w-1/2 rounded-full bg-[#2F7BF5]" />
          </div>
        </div>
      </div>
      <BottomNav />
    </MobileFrame>
  )
}
function ApplicationDetailFrame() {
  const conditions = [
    ['✓', '만 24세 연령 조건 일치', true],
    ['✓', '부산 거주 조건 일치', true],
    ['?', '개인소득 기준 확인 필요', false],
    ['?', '무주택 여부 확인 필요', false],
  ]
  const documents = [
    ['✓', '주민등록등본', '최근 3개월 이내 발급', '발급 안내'],
    ['✓', '가족관계증명서', '상세 증명서', '발급 안내'],
    ['○', '소득증빙서류', '근로소득원천징수영수증 등', '준비 방법'],
    ['?', '기타 제출서류', '공식 공고에서 확인 필요', '공식 공고 확인'],
  ]
  return (
    <MobileFrame>
      <div className="flex h-16 items-center gap-2 bg-white px-4">
        <span className="grid size-9 place-items-center">‹</span>
        <h3 className="text-base font-black">신청 준비 상세</h3>
      </div>
      <div className="h-[696px] overflow-hidden px-5 pb-8 pt-4">
        <div className="rounded-[22px] bg-white p-4">
          <div className="flex gap-2 text-[8px] font-black">
            <span className="rounded bg-[#f1f3fb] px-2 py-1 text-[#2F7BF5]">주거·생활</span>
            <span className="rounded bg-[#f3f4f6] px-2 py-1 text-black/35">부산 전체</span>
            <span className="rounded bg-[#f3f4f6] px-2 py-1 text-black/35">예시 정책</span>
          </div>
          <h3 className="mt-3 text-base font-black leading-snug">부산 청년 주거비 지원</h3>
          <div className="mt-4 grid grid-cols-2 rounded-2xl bg-[#f7f8fb] p-3">
            <div>
              <p className="text-[8px] text-black/30">신청 마감</p>
              <b className="mt-1 block text-[10px]">2025. 06. 20</b>
            </div>
            <div>
              <p className="text-[8px] text-black/30">현재 단계</p>
              <b className="mt-1 block text-[10px] text-[#2F7BF5]">신청 준비</b>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-[22px] bg-white p-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-black">신청 조건 확인</h4>
            <span className="rounded-full bg-[#f3f0fb] px-2 py-1 text-[8px] font-black text-[#7568a3]">
              추가 확인 2개
            </span>
          </div>
          <div className="mt-2 divide-y divide-black/[0.05]">
            {conditions.map(([mark, label, matched]) => (
              <div key={label} className="flex items-center gap-2 py-2.5">
                <span
                  className={`grid size-5 place-items-center rounded-full text-[9px] font-black ${matched ? 'bg-[#2F7BF5] text-white' : 'bg-[#f1f3fb] text-[#2F7BF5]'}`}
                >
                  {mark}
                </span>
                <span className="text-[10px] font-bold text-black/55">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 rounded-[22px] bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-black">신청 준비물</h4>
              <p className="mt-1 text-[8px] text-black/30">신청 단계와 준비물은 직접 관리합니다.</p>
            </div>
            <b className="text-[9px] text-[#2F7BF5]">2 / 4 완료 · 50%</b>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-[#eceef4]">
            <div className="h-full w-1/2 rounded-full bg-[#2F7BF5]" />
          </div>
          <div className="mt-2 divide-y divide-black/[0.05]">
            {documents.map(([mark, name, description, action]) => (
              <div key={name} className="flex items-center gap-2 py-2.5">
                <span
                  className={`grid size-5 place-items-center rounded-full text-[8px] font-black ${mark === '✓' ? 'bg-[#2F7BF5] text-white' : 'bg-[#f1f3fb] text-[#2F7BF5]'}`}
                >
                  {mark}
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block text-[9px]">{name}</b>
                  <p className="mt-0.5 truncate text-[8px] text-black/30">{description}</p>
                </div>
                <span className="rounded-lg bg-[#f4f5f8] px-2 py-1.5 text-[7px] font-black text-black/40">
                  {action}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-[#2F7BF5] py-3 text-center text-[10px] font-black text-white">
            공식 신청 페이지 바로가기
          </div>
        </div>
      </div>
    </MobileFrame>
  )
}
function ProfileFrame() {
  return (
    <MobileFrame>
      <div className="flex h-16 items-center gap-2 bg-white px-4">
        <span className="grid size-9 place-items-center">‹</span>
        <h3 className="text-base font-black">프로필 및 맞춤정보</h3>
      </div>
      <div className="px-5 pb-8 pt-4">
        <div className="rounded-[22px] bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-[#f1f3fb] text-[#2F7BF5]">
              <Icon name="user" className="size-6" />
            </span>
            <div>
              <b className="text-sm">은혜님</b>
              <p className="mt-1 text-[9px] text-black/35">맞춤정보 80%</p>
            </div>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-[#eceef4]">
            <div className="h-full w-4/5 rounded-full bg-[#2F7BF5]" />
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1">
            {['나이', '지역', '상태', '관심', '주거'].map((item, index) => (
              <div key={item} className="text-center">
                <span
                  className={`mx-auto grid size-5 place-items-center rounded-full text-[8px] font-black ${index < 4 ? 'bg-[#2F7BF5] text-white' : 'bg-[#f1f3fb] text-[#2F7BF5]'}`}
                >
                  {index < 4 ? '✓' : '○'}
                </span>
                <p className="mt-1 text-[7px] font-bold text-black/35">{item}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 rounded-[22px] bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="나이" value="만 24세 ⌄" />
            <Field label="현재 상태" value="취업준비생 ⌄" />
          </div>
          <p className="mt-4 text-[9px] font-bold text-black/40">거주지역</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label="시·도" value="부산광역시 ⌄" />
            <Field label="시·군·구" value="사하구 ⌄" />
          </div>
          <p className="mt-4 text-[9px] font-bold text-black/40">관심 분야</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['취업·진로', '주거·생활', '장학·금융', '문화', '공간·시설'].map((item, index) => (
              <span
                key={item}
                className={`rounded-full px-2.5 py-2 text-[8px] font-black ${index < 3 ? 'bg-[#2F7BF5] text-white' : 'bg-[#f3f4f7] text-black/35'}`}
              >
                {item}
              </span>
            ))}
          </div>
          <div className="mt-4">
            <Field label="주거 형태" value="선택하지 않음 ⌄" />
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-[#2F7BF5] py-3.5 text-center text-[10px] font-black text-white">
          저장하기
        </div>
      </div>
    </MobileFrame>
  )
}
function Field({ label, value }) {
  return (
    <div>
      <p className="text-[8px] font-bold text-black/35">{label}</p>
      <div className="mt-1.5 rounded-xl bg-[#f3f4f7] px-3 py-3 text-[9px] font-bold">{value}</div>
    </div>
  )
}
function ResultFrame() {
  return (
    <MobileFrame>
      <div className="flex h-16 items-center gap-2 bg-white px-4">
        <span className="grid size-9 place-items-center">‹</span>
        <h3 className="text-base font-black">결과 확인 관리</h3>
      </div>
      <div className="px-5 pb-8 pt-4">
        <div className="rounded-xl bg-[#f1f3fb] p-3 text-[9px] font-semibold leading-4 text-[#2F7BF5]">
          공식 사이트에서 결과를 확인한 후 직접 기록해주세요.
        </div>
        <div className="mt-4 rounded-[22px] bg-white p-4">
          <div className="flex gap-2 text-[8px] font-black">
            <span className="rounded bg-[#f1f3fb] px-2 py-1 text-[#2F7BF5]">복지</span>
            <span className="rounded bg-[#f3f4f6] px-2 py-1 text-black/35">사하구</span>
            <span className="rounded bg-[#f3f4f6] px-2 py-1 text-black/35">예시 정책</span>
          </div>
          <h3 className="mt-3 text-sm font-black leading-snug">사하구 청년 생활안정 지원사업</h3>
          <div className="mt-4 rounded-2xl bg-[#f7f8fb] p-3">
            <p className="text-[8px] text-black/30">결과 발표 예정일</p>
            <b className="mt-1 block text-[10px]">2025. 06. 05</b>
          </div>
          <p className="mt-4 text-[9px] font-bold text-black/40">확인한 결과</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {['결과 대기', '선정', '미선정'].map((status, index) => (
              <span
                key={status}
                className={`rounded-xl py-2.5 text-center text-[8px] font-black ${index === 1 ? 'bg-[#2F7BF5] text-white' : 'bg-[#f3f4f7] text-black/35'}`}
              >
                {status}
              </span>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-[#f7f8fb] p-4">
            <p className="text-xs font-black text-[#2F7BF5]">선정 완료</p>
            <p className="mt-3 text-[8px] font-bold text-black/30">다음 해야 할 일</p>
            <ul className="mt-2 space-y-2">
              {['안내 문자 확인', '추가 서류 제출', '지원 카드 등록'].map((action) => (
                <li key={action} className="flex gap-2 text-[10px] font-bold text-black/55">
                  <span className="text-[#2F7BF5]">✓</span>
                  {action}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4 rounded-2xl bg-[#2F7BF5] py-3.5 text-center text-[10px] font-black text-white">
            공식 결과 확인
          </div>
        </div>
      </div>
    </MobileFrame>
  )
}
export default function PresentationScreen() {
  const frames = [
    {
      number: '01',
      title: '1. 마이',
      flow: '개인 맞춤정보와 혜택 현황을 한눈에',
      content: <MyMainFrame />,
    },
    {
      number: '02',
      title: '2. 신청 준비 상세',
      flow: '마이 → 신청 준비 카드 선택',
      content: <ApplicationDetailFrame />,
    },
    {
      number: '03',
      title: '3. 맞춤정보 관리',
      flow: '마이 → 맞춤정보 또는 설정 선택',
      content: <ProfileFrame />,
    },
    {
      number: '04',
      title: '4. 결과 확인',
      flow: '마이 → 결과 확인 탭 선택',
      content: <ResultFrame />,
    },
  ]
  return (
    <div className="min-h-screen bg-[#e9eaf0] px-8 py-10 text-[#171923]">
      <div className="mx-auto max-w-[1680px]">
        <div className="mb-10 flex items-end justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2F7BF5]">
              Busan Youth AI Service
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.05em]">
              청년ZIP 마이 탭 · 발표용 UI Flow
            </h1>
            <p className="mt-3 text-sm font-medium text-black/40">
              개인 맞춤정보부터 신청 준비와 결과 기록까지, 사용자가 직접 관리하는 MVP
            </p>
          </div>
          <div className="rounded-full bg-white px-4 py-2 text-xs font-extrabold text-[#2F7BF5]">
            High-Fidelity Mockup
          </div>
        </div>
        <div className="no-scrollbar flex items-start gap-8 overflow-x-auto pb-12">
          {frames.map((frame, index) => (
            <div key={frame.number} className="flex shrink-0 items-center gap-8">
              <div>
                <FrameLabel number={frame.number} title={frame.title} flow={frame.flow} />
                {frame.content}
              </div>
              {index < frames.length - 1 && (
                <div className="mt-16 flex size-10 items-center justify-center rounded-full bg-white text-[#2F7BF5] shadow-sm">
                  <Icon name="arrow" className="size-5" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
