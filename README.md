# 🏥 개원 입지 분석 앱 — 1단계 MVP

지도를 클릭해 개원 후보지 스팟을 추가하고, 평점/태그/메모로 관리하는 앱입니다.

---

## 🚀 배포 전 준비사항

### 1. 네이버 클라우드 플랫폼 API 키 발급

1. https://console.ncloud.com 로그인
2. **Products → Application Services → Maps** 이동
3. **Application 등록** 클릭
4. 서비스 환경: **Web Dynamic Map** 선택
5. 서비스 URL에 배포할 도메인 추가 (Vercel 배포 후 추가 가능)
6. **Client ID** 복사 (VITE_NAVER_CLIENT_ID에 입력)

> ⚠️ 로컬 개발 시엔 `http://localhost:5173` 도 허용 도메인에 추가해야 합니다.

---

### 2. Firebase 프로젝트 설정

1. https://console.firebase.google.com → 새 프로젝트 생성 (또는 기존 프로젝트 사용)
2. **Firestore Database** 생성 (프로덕션 모드)
3. **프로젝트 설정 → 앱 추가 → 웹 앱** → 설정값 복사
4. Firestore 규칙을 `firestore.rules` 내용으로 교체

---

### 3. Vercel 환경변수 설정

Vercel 대시보드 → 프로젝트 → Settings → Environment Variables에 아래를 추가:

```
VITE_NAVER_CLIENT_ID        = 네이버 클라이언트 ID
VITE_FIREBASE_API_KEY       = Firebase apiKey
VITE_FIREBASE_AUTH_DOMAIN   = Firebase authDomain
VITE_FIREBASE_PROJECT_ID    = Firebase projectId
VITE_FIREBASE_STORAGE_BUCKET= Firebase storageBucket
VITE_FIREBASE_MESSAGING_SENDER_ID = Firebase messagingSenderId
VITE_FIREBASE_APP_ID        = Firebase appId
```

---

## 📁 파일 구조

```
clinic-finder/
├── index.html              ← 네이버 지도 스크립트 포함
├── package.json
├── vite.config.js
├── firestore.rules
├── .env.example            ← 이 파일 참고해서 Vercel 환경변수 입력
└── src/
    ├── main.jsx
    ├── App.jsx             ← 메인 레이아웃 & 상태 관리
    ├── firebase.js         ← Firebase CRUD
    ├── index.css           ← 전체 스타일
    └── components/
        ├── MapView.jsx     ← 네이버 지도 + 마커
        ├── SpotList.jsx    ← 사이드바 목록
        └── SpotPanel.jsx   ← 추가/편집 패널
```

---

## ✨ 기능 (1단계 MVP)

- 🗺️ 네이버 지도 전체화면 표시
- 📍 지도 클릭 → 후보지 스팟 추가
- ⭐ 입지 평점 (1~5점)
- 🏷️ 특성 태그 (역세권, 신축아파트, 경쟁심함 등)
- 📝 자유 메모
- 💾 Firebase Firestore 자동 저장
- 🔴 평점별 마커 색상 구분

---

## 🔜 2단계 예정

- 심평원 API: 반경 내 의원/병원 자동 표시
- 소상공인 상권 API: 상권 분석 데이터
- 통계청 API: 인구/가구 데이터
- Claude AI 종합 입지 분석 보고서
