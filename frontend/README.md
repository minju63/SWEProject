# 주거·생활 및 마이페이지 연결

제공받은 UI를 바탕으로 주거·생활 정책과 로그인한 사용자의 마이페이지를 연결했습니다.

## 실행

Node.js 24 기준입니다. 각 폴더에서 `npm ci`를 실행한 뒤 터미널 두 개를 사용합니다.

- `backend`: `npm start` (4000번 포트)
- `frontend`: `npm run dev` → http://127.0.0.1:5173

프런트엔드 `.env`에는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`가 필요합니다. 서버 `.env`의 서비스 역할 키는 브라우저에 넣지 않습니다. 개발 서버는 `/api` 요청을 4000번 포트로 전달합니다. 별도 배포 시 `VITE_API_BASE_URL`에 `/api/v1`까지 포함한 API 주소를 설정합니다.

## 연결 범위

- 주거·생활: 실제 정책 조회, 상세, 비교, 신청·공식 안내 링크
- 기존 Supabase 이메일 계정 로그인·로그아웃
- SWfinal의 회원가입 디자인을 재사용한 `/signup`: 이메일·닉네임·비밀번호 입력, 인증 메일 재전송, `/auth/confirm` 인증 후 마이페이지 이동
- 계정별 찜, 최근 조회, 신청 관리, 준비물 체크, 프로필 저장
- 미검증 지원 조건은 자동으로 충족한다고 판단하지 않고 확인 필요로 표시
- 주거 신청절차 72건(상세 단계 37건·접수/유형 안내 35건), 준비물 목록 22건·176개 항목을 DB에서 표시합니다. 필수와 해당자 서류를 구분하고 개인 체크는 계정별로 저장합니다. 확인하지 못한 절차 8건·준비물 58건은 NULL로 유지합니다. 반영 근거는 `../research/housing_application_2026-11-17/반영결과.md`에 있습니다.

설정에서 프로필 저장·로그아웃·회원 탈퇴를 제공합니다. 비밀번호 찾기·알림 발송은 구현 범위에 포함하지 않습니다. 다른 분야의 일부 화면에는 샘플 내용이 남아 있습니다.

회원가입 원본: [JimmyApron/SWfinal](https://github.com/JimmyApron/SWfinal/tree/main/frontend/src/pages/auth)의 `SignupPage.jsx`, `SignupPage.css`. 입력창·아이콘·보라색 버튼·비밀번호 보기와 검증 규칙을 재사용했습니다. SWfinal 전용 OTP·중복 검사 API 대신 현재 프로젝트의 Supabase `signUp`과 인증 메일 링크를 사용합니다. 닉네임은 표시 이름이며 고유 식별자로 사용하지 않습니다.

Supabase Auth URL 설정의 Redirect URLs에 로컬 `http://127.0.0.1:5173/auth/confirm` 및 실제 배포 주소의 `/auth/confirm`을 등록해야 인증 메일에서 이 앱으로 돌아옵니다. 현재 프로젝트는 이메일 인증이 필수입니다. 메일 발송은 프로젝트 SMTP 설정과 발송 제한을 따릅니다. 새 계정의 기본 프로필은 마이페이지 설정에서 입력할 수 있습니다.

## 확인

- `npx tsc --noEmit`
- `npm run build`
- 프런트엔드·백엔드 실행 후 `npx playwright test`
- `npx playwright test tests/signup.spec.ts`: 입력 검증, 인증 메일·재전송, 오류, 세션 발급, 인증 링크 처리 (모의 Auth 응답; 실제 가입/메일 발송 없음)
- 백엔드에서 `node --test tests/workspace.test.js`

기본 브라우저 테스트는 실제 공개 정책 조회와 모의 로그인·개인 저장 응답을 사용합니다. `RUN_MY_LIVE=1`로 실행하는 `my-live.spec.ts`와 `my-profile-live.spec.ts`는 `.local/test-account.json`의 전용 테스트 계정에만 기록합니다. 계정 파일과 환경변수 파일은 커밋하지 않습니다.

조건 비교는 `../shared/eligibility-engine.mjs`를 서버와 화면에서 함께 사용합니다. 주거 정책의 필수 조건·AND/OR·제외 조건을 읽으며, RAW 조건과 누락된 입력은 확인 필요로 표시합니다. 전체 검증 전인 `eligibility_verified=false` 정책은 신청 가능으로 확정하지 않습니다.
