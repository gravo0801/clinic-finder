import { useState } from 'react'
import { deleteSavedClinic, saveSavedClinic } from '../firebase'
import { authorizedFetch } from '../utils/authorizedFetch'

const DEFAULT_MARKER = { icon: '🏥', color: '#5856D6' }

const isDue = (clinic) => {
  if (!clinic.autoCheck?.enabled) return false
  const interval = Number(clinic.autoCheck?.intervalDays || 30)
  const last = clinic.lastCheckedAt || clinic.generatedAt || clinic.updatedAt || clinic.savedAt
  const lastDate = last?.seconds ? new Date(last.seconds * 1000) : last ? new Date(last) : null
  if (!lastDate || Number.isNaN(lastDate.getTime())) return true
  return Date.now() - lastDate.getTime() >= interval * 24 * 60 * 60 * 1000
}

const formatDistance = (distance) => {
  if (distance === null || distance === undefined) return ''
  return distance < 1000 ? `${distance}m` : `${(distance / 1000).toFixed(1)}km`
}

export default function ClinicSearchPanel({ savedClinics = [], centerOn, onClose, onOpenClinic, onCenterClinic }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState(null)

  const savedIds = new Set(savedClinics.map((clinic) => clinic.id))

  const searchClinics = async () => {
    const term = query.trim()
    if (term.length < 2) {
      setError('검색어를 2글자 이상 입력하세요.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ query: term })
      if (centerOn?.lat && centerOn?.lng) {
        params.set('lat', String(centerOn.lat))
        params.set('lng', String(centerOn.lng))
      }
      const res = await authorizedFetch(`/api/clinic-search?${params.toString()}`)
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || '의원 검색에 실패했습니다.')
      setItems(data.items || [])
    } catch (err) {
      setError(err.message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (clinic) => {
    setSavingId(clinic.id)
    setError(null)
    try {
      await saveSavedClinic({
        ...clinic,
        favorite: true,
        trackingStatus: 'active',
        trackedFrom: {
          source: 'direct-search',
          query: query.trim(),
          savedAt: new Date().toISOString(),
        },
        markerStyle: clinic.markerStyle || DEFAULT_MARKER,
        autoCheck: clinic.autoCheck || { enabled: true, intervalDays: 30 },
        lastCheckedAt: clinic.lastCheckedAt || null,
      })
      onCenterClinic?.(clinic)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  const handleDelete = async (clinicId) => {
    setSavingId(clinicId)
    setError(null)
    try {
      await deleteSavedClinic(clinicId)
    } catch (err) {
      setError(err.message)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="clinic-search-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">의원 검색/즐겨찾기</h2>
          <p className="panel-coords">원하는 의원을 찾아 추적 목록과 지도에 저장합니다</p>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="panel-body">
        <div className="clinic-search-box">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') searchClinics()
            }}
            placeholder="의원명 검색 예: 공덕365의원"
          />
          <button onClick={searchClinics} disabled={loading}>
            {loading ? '검색 중' : '검색'}
          </button>
        </div>

        {error && <div className="clinic-search-error">{error}</div>}

        <div className="clinic-search-section">
          <div className="clinic-search-section-title">검색 결과</div>
          {items.length === 0 && !loading && (
            <div className="clinic-search-empty">검색 결과가 여기에 표시됩니다.</div>
          )}
          {items.map((clinic) => {
            const saved = savedIds.has(clinic.id)
            return (
              <div className="clinic-search-card" key={clinic.id}>
                <div className="clinic-search-main">
                  <strong>{clinic.name}</strong>
                  <span>{clinic.type || '의료기관'} · {clinic.dept || '진료과목 미확인'}</span>
                  <p>{clinic.address || '주소 미확인'}</p>
                  {clinic.distance !== null && <em>{formatDistance(clinic.distance)}</em>}
                </div>
                <div className="clinic-search-actions">
                  <button onClick={() => handleSave(clinic)} disabled={savingId === clinic.id}>
                    {saved ? '추적 갱신' : '즐겨찾기'}
                  </button>
                  <button className="ghost" onClick={() => onOpenClinic(savedClinics.find((item) => item.id === clinic.id) || clinic)}>
                    열람
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="clinic-search-section">
          <div className="clinic-search-section-title">즐겨찾기/추적 의원 {savedClinics.length}개</div>
          {savedClinics.length === 0 && (
            <div className="clinic-search-empty">즐겨찾기한 의원이 아직 없습니다.</div>
          )}
          {savedClinics.map((clinic) => (
            <div className={`saved-clinic-card ${isDue(clinic) ? 'due' : ''}`} key={clinic.id}>
              <button className="saved-clinic-main" onClick={() => onOpenClinic(clinic)}>
                <strong>{clinic.name}</strong>
                <span>{clinic.dept || clinic.type || '진료과목 미확인'}</span>
                <p>{clinic.address || '주소 미확인'}</p>
              </button>
              <div className="saved-clinic-side">
                {isDue(clinic) && <span className="due-badge">업데이트 필요</span>}
                <button onClick={() => onCenterClinic?.(clinic)}>지도</button>
                <button className="danger" onClick={() => handleDelete(clinic.id)} disabled={savingId === clinic.id}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
