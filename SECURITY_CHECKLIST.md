# Clinic Finder 보안 체크리스트

## Naver Maps JavaScript API

`VITE_NAVER_CLIENT_ID`는 브라우저 번들에 포함되는 공개 키입니다. 키 자체를 숨길 수 없으므로 Naver Cloud Platform 콘솔에서 사용처를 제한해야 합니다.

1. Naver Cloud Platform 콘솔에 로그인합니다.
2. `AI·Application Service > Maps > Application`으로 이동합니다.
3. Clinic Finder 앱을 선택합니다.
4. `Web Dynamic Map`의 서비스 URL에 아래 도메인만 등록합니다.
   - `https://clinic-finder-theta.vercel.app`
   - 로컬 개발 시에만 `http://localhost:5173`
5. 사용하지 않는 Preview 도메인, 임시 배포 URL, 와일드카드 도메인은 제거합니다.
6. 키가 외부에 노출됐다고 의심되면 NCP에서 키를 재발급하고 Vercel 환경변수를 교체합니다.

## Server API Keys

아래 키는 브라우저에 노출되면 안 되며 Vercel 서버 환경변수에만 둡니다.

- `NAVER_SEARCH_CLIENT_SECRET`
- `PUBLIC_DATA_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `SGIS_SECURITY_KEY`

## Firestore Rules

실제 앱 데이터는 `users/{uid}/...` 하위에 저장합니다. 레거시 전역 `spots` 컬렉션은 기본 거부 상태로 유지합니다.
