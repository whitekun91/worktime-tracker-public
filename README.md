# 출퇴근 기록 (Worktime Tracker)

Next.js로 만든 간단한 출근·퇴근 기록 앱입니다. Postgres(Neon 등)에 저장하고, 7일이 지난 기록은 정리용 Cron으로 삭제할 수 있습니다.

## 요구 사항

- Node.js 20.9 이상

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 을 엽니다.

## 환경 변수 (민감 정보)

저장소에는 **실제 연결 문자열이나 비밀키를 넣지 마세요.**

1. 프로젝트 루트에 `.env.example` 을 참고해 `.env.local` 파일을 만듭니다.
2. `DATABASE_URL`(또는 일부 호스팅의 `POSTGRES_URL`)에 **본인 DB** 연결 문자열을 넣습니다.
3. Cron 엔드포인트를 수동으로 호출할 계획이면 `CRON_SECRET` 을 설정합니다.

배포 플랫폼(Vercel 등)에서는 대시보드의 **Environment Variables** 메뉴에서 같은 이름으로 등록하면 됩니다. 값은 공개 저장소나 스크린샷에 노출되지 않게 관리하세요.

## 테스트

```bash
npm test
```

## 배포 메모

- `vercel.json` 에 Cron 스케줄이 있을 수 있습니다. 경로·일정은 필요에 맞게 수정하세요.
- DB 미설정 시 로컬 개발 모드에서는 브라우저 로컬 저장만 사용하는 동작이 있습니다(앱 UI 안내 참고).

## 라이선스

이 저장소는 공개용입니다. 사용 조건은 필요 시 별도로 명시하세요.
