# 로그인·회원가입 실행

현재 로그인 흐름은 기존 Supabase Auth와 단일 API 서버를 사용합니다. 새 DB 테이블이나 전역 Auth 훅 설정은 필요하지 않습니다.

## 서버 설정

`.env.example`을 참고해 서버의 `.env`를 설정합니다. 실제 키와 비밀번호는 커밋하지 않습니다.

```dotenv
REGISTRATION_STATE_DRIVER=file
REGISTRATION_CLEANUP_ENABLED=false
SMTP_HOST=your-smtp-host
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=verified-sender@example.com
```

기존 SMTP가 465 포트를 사용한다면 465로 맞춥니다. 465는 TLS, 나머지 포트는 STARTTLS를 요구합니다. SMTP 정보는 Supabase Dashboard 설정과 별도로 서버 환경변수에도 필요합니다. 설정 후 백엔드를 재시작합니다.

```sh
npm ci
npm run dev
```

프런트엔드는 `frontend`에서 `npm ci` 후 `npm run dev`로 실행합니다. 개발 서버의 `/api` 요청은 4000번 포트로 전달됩니다.

## 계정 흐름

- `/signup`: 아이디·이메일 중복 확인, 필수 동의, 만 14세 확인, 이메일 인증 후 가입 완료.
- `/login`: 아이디·비밀번호 로그인. 기존 이메일 전용 계정의 이메일 로그인도 유지합니다.
- `/find-username`: 등록 이메일로 아이디 안내 메일을 발송하며 화면에 아이디를 표시하지 않습니다. 아이디 없는 기존 계정은 이메일 로그인 안내를 제공합니다.
- `/reset-password`: 아이디·이메일 확인, 6자리 이메일 인증, 새 비밀번호 저장 후 로그인 화면으로 이동합니다. 기존 비밀번호 재사용을 거부합니다.
- 선택 동의 후 초기 설정을 저장하거나 건너뛸 수 있습니다. 맞춤정보가 없으면 추정하지 않고 설정 안내를 표시합니다.
- 비로그인 사용자는 계정 화면만 이용할 수 있습니다. 데이터 API의 소유자는 검증된 토큰에서 결정합니다. 계정 변경 시 화면 조회 캐시를 초기화합니다.

Supabase의 **Confirm signup** 및 **Reset password** 메일 템플릿은 `{{ .Token }}`으로 인증번호를 표시해야 합니다. 실제 프로젝트에서 OTP 길이 6자리, 유효시간 300초, 재발송 간격 60초를 확인합니다. 아이디 안내 메일은 위 SMTP로 직접 발송합니다.

## 저장과 제한

가입·인증 작업 기록은 Git에서 제외한 `backend/.local/account-state.json`에 저장됩니다. 비밀번호와 인증번호를 저장하지 않으며, 재설정용 권한은 해시로, 세션 종료에 잠시 필요한 토큰은 암호화해 보관하고 완료 시 제거합니다.

이 방식은 **백엔드 프로세스 1개와 영구 디스크**가 필요합니다. 여러 서버나 서버리스 환경에서 사용할 분산 저장 보강은 적용하지 않았습니다. 자동 계정 정리도 기본 비활성화입니다. 세션 종료 후 기존 토큰의 앱 API 호출은 거부하지만, Supabase Data API 직접 호출은 기본 JWT 만료 규칙을 따릅니다.

`tests/fixtures/registration-hardening.proposed.sql`은 보류한 설계를 검증하는 테스트 자료입니다. 배포용 migration이 아니며 운영 DB에 실행하지 않습니다. `scripts/auth/check-registration-readiness.js`도 보류한 DB 설계 점검용으로, 기본 파일 방식의 실행 조건이 아닙니다.

## 검증

```sh
node --test tests/account-access.test.js tests/account-recovery.test.js tests/signup.test.js tests/registration-storage.test.js test/auth.test.js tests/workspace.test.js tests/my-workspace.test.js test/eligibility.test.js
```

프런트엔드에서는 `npx playwright test tests/signup.spec.js tests/account-recovery.spec.js`와 `npm run build`를 실행합니다. 브라우저 경로는 Playwright 설정 또는 `BROWSER_PATH`로 지정합니다. 이 테스트들은 Auth·SMTP를 대체하며 실제 계정 생성이나 메일 발송을 하지 않습니다.

운영 계정·메일을 사용하는 `*-live` 테스트는 별도의 로컬 계정 설정이 필요하므로 일반 검증과 구분합니다. 수집 원본, DB 덤프, 테스트 계정 파일, `.env`, `.local`, 빌드 결과는 커밋하지 않습니다.
