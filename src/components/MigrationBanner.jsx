import { useEffect, useState } from 'react'
import { getLegacySpotCount, migrateLegacySpots } from '../firebase'

export default function MigrationBanner({ onClose }) {
  const [legacyCount, setLegacyCount] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    getLegacySpotCount()
      .then((count) => {
        if (mounted) setLegacyCount(count)
      })
      .catch(() => {
        if (mounted) setLegacyCount(0)
      })

    return () => {
      mounted = false
    }
  }, [])

  const handleMigrate = async () => {
    setStatus('loading')
    setError(null)

    try {
      const count = await migrateLegacySpots()
      setLegacyCount(0)
      setStatus(count > 0 ? 'done' : 'idle')
    } catch (migrationError) {
      setStatus('idle')
      setError(migrationError.message)
    }
  }

  const empty = legacyCount !== null && legacyCount === 0

  return (
    <div className="recovery-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">기존 데이터 복구</h2>
          <p className="panel-coords">예전에 사라진 후보지가 있을 때만 사용합니다</p>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="panel-body">
        {legacyCount === null && (
          <div className="recovery-card">
            <strong>복구 가능한 데이터 확인 중...</strong>
            <span>잠시만 기다려 주세요.</span>
          </div>
        )}
        {empty && (
          <div className="recovery-card">
            <strong>복구할 기존 후보지가 없습니다</strong>
            <span>현재 보안 저장소 기준으로 사용하면 됩니다.</span>
          </div>
        )}
        {!empty && legacyCount !== null && (
          <div className="recovery-card">
            <strong>기존 후보지 {legacyCount}개를 찾았습니다</strong>
            <span>새 보안 저장소로 복사하면 다시 표시됩니다. 이 작업은 복구가 필요할 때만 실행하세요.</span>
            {error && <em>{error}</em>}
            <button onClick={handleMigrate} disabled={status === 'loading'}>
              {status === 'loading' ? '가져오는 중...' : '기존 데이터 가져오기'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
