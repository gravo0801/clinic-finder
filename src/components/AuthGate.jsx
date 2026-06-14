import { ALLOWED_EMAIL } from '../firebase'

export default function AuthGate({ session, busy, error, onSignIn, onSignOut }) {
  const currentEmail = session.user?.email || ''
  const isWrongAccount = session.wrongAccount

  return (
    <div className="auth-gate">
      <div className="auth-card">
        <div className="auth-mark">🏥</div>
        <h1>개원 입지 분석</h1>
        <p className="auth-lead">
          저장된 후보지와 경쟁 의원 리포트를 보호하기 위해 Google 보안 로그인이 필요합니다.
        </p>
        <div className="auth-info">
          <span>허용 계정</span>
          <strong>{ALLOWED_EMAIL}</strong>
        </div>
        {isWrongAccount && (
          <div className="auth-warning">
            현재 로그인 계정 {currentEmail} 은 허용 목록에 없습니다.
          </div>
        )}
        {error && <div className="auth-warning">{error}</div>}
        {session.user && (
          <div className="auth-diagnostics">
            현재 세션: {session.user.isAnonymous ? '익명' : session.user.email || '이메일 없음'}
          </div>
        )}
        <button type="button" className="auth-primary" onClick={onSignIn} disabled={busy}>
          {busy ? '로그인 중...' : session.user?.isAnonymous ? 'Google 계정 연결하기' : 'Google로 로그인'}
        </button>
        {session.user && !session.user.isAnonymous && (
          <button type="button" className="auth-secondary" onClick={onSignOut} disabled={busy}>
            다른 계정 사용
          </button>
        )}
        <p className="auth-note">
          {session.anonymousUnavailable
            ? '익명 세션 확인이 지연되어도 Google 로그인은 계속 진행할 수 있습니다.'
            : '기존 익명 사용자 데이터는 Google 계정 연결 시 같은 UID로 유지됩니다.'}
        </p>
      </div>
    </div>
  )
}
