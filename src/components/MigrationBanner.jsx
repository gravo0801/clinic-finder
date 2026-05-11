import { useEffect, useState } from 'react'
import { getLegacySpotCount, migrateLegacySpots } from '../firebase'

export default function MigrationBanner() {
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

  if (legacyCount === null || legacyCount === 0) return null

  return (
    <div className="migration-banner">
      <div>
        <strong>기존 후보지 {legacyCount}개를 찾았습니다</strong>
        <span>새 보안 저장소로 복사하면 다시 표시됩니다.</span>
        {error && <em>{error}</em>}
      </div>
      <button onClick={handleMigrate} disabled={status === 'loading'}>
        {status === 'loading' ? '가져오는 중...' : '기존 데이터 가져오기'}
      </button>
    </div>
  )
}
