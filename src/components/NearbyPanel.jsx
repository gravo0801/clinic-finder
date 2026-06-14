import { useState, useEffect } from 'react'
import {
  savePinnedClinic,
  deletePinnedClinic,
  subscribePinnedClinics,
  saveSavedClinic,
  saveSpotInvestigation,
  subscribeSpotInvestigations,
} from '../firebase'
import { authorizedFetch } from '../utils/authorizedFetch'

const RADIUS_OPTIONS = [500, 1000, 2000, 3000]

const MARKER_STYLES = [
  { icon: '📍', color: '#FF3B30' },
  { icon: '⭐', color: '#FFD700' },
  { icon: '❤️', color: '#FF2D55' },
  { icon: '💙', color: '#007AFF' },
  { icon: '💚', color: '#34C759' },
  { icon: '💜', color: '#AF52DE' },
  { icon: '🔴', color: '#FF3B30' },
  { icon: '🟡', color: '#FFCC00' },
  { icon: '⚠️', color: '#FF9500' },
  { icon: '🏥', color: '#5856D6' },
]

const FAVORITE_MARKER = { icon: '⭐', color: '#FFD700' }
const INVESTIGATION_CLINIC_LIMIT = 100

const formatDateTime = (timestamp) => {
  if (!timestamp) return ''
  const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const clinicSnapshot = (item) => ({
  id: item.id,
  hiraId: item.hiraId || '',
  source: item.source || '',
  name: item.name || '',
  type: item.type || '',
  dept: item.dept || '',
  address: item.address || '',
  tel: item.tel || '',
  lat: item.lat ?? null,
  lng: item.lng ?? null,
  distance: item.distance ?? null,
  isCompetitor: !!item.isCompetitor,
})

const buildInvestigationSummary = (items, competitors, radius) => {
  const directCompetitors = competitors.filter((item) =>
    /내과|가정의학|365|검진|건강검진|내시경/.test(`${item.name || ''} ${item.dept || ''}`),
  )
  const level =
    competitors.length >= 5 ? '경쟁 과밀' :
    competitors.length >= 3 ? '경쟁 보통 이상' :
    competitors.length >= 1 ? '경쟁 제한적' :
    '직접 경쟁 희소'

  return {
    headline: `${radius < 1000 ? `${radius}m` : `${radius / 1000}km`} 반경 ${items.length}개 의료기관, 경쟁 후보 ${competitors.length}개`,
    level,
    directCompetitorCount: directCompetitors.length,
    topCompetitors: directCompetitors.slice(0, 5).map((item) => item.name),
    notes: [
      directCompetitors.length > 0
        ? `내과/검진/365 신호가 있는 직접 경쟁 후보 ${directCompetitors.length}개를 우선 확인하세요.`
        : '직접 경쟁 후보가 적어 보이지만 검색 누락과 비표준 진료과명은 현장 확인이 필요합니다.',
      '즐겨찾기한 의원은 경쟁의원 탭과 지도에서 계속 추적할 수 있습니다.',
    ],
  }
}

function DistanceBadge({ distance }) {
  const color =
    distance < 300 ? '#FF3B30' :
    distance < 700 ? '#FF9500' :
    distance < 1500 ? '#FFCC00' : '#8E8E93'
  return (
    <span style={{
      background: color + '22', color,
      border: `1px solid ${color}44`,
      borderRadius: 20, padding: '2px 8px',
      fontSize: 11, fontWeight: 700,
    }}>
      {distance < 1000 ? `${distance}m` : `${(distance/1000).toFixed(1)}km`}
    </span>
  )
}

export default function NearbyPanel({
  spot,
  savedClinics = [],
  onClose,
  onClinicsLoaded,
  onMarkedClinicsChange,
  onCompetitorResearch,
}) {
  const [radius, setRadius] = useState(1000)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(null)
  const [savingFavoriteId, setSavingFavoriteId] = useState(null)
  const [savingInvestigation, setSavingInvestigation] = useState(false)
  const [investigations, setInvestigations] = useState([])
  // Firebase에서 불러온 저장된 핀들
  const [savedPins, setSavedPins] = useState([]) // [{id, name, lat, lng, markerStyle, ...}]

  // 저장된 핀 구독
  useEffect(() => {
    if (!spot?.id) return
    const unsub = subscribePinnedClinics(spot.id, (pins) => {
      setSavedPins(pins)
      if (onMarkedClinicsChange) onMarkedClinicsChange(pins)
    })
    return unsub
  }, [spot?.id])

  useEffect(() => {
    if (!spot?.id) return undefined
    return subscribeSpotInvestigations(spot.id, setInvestigations)
  }, [spot?.id])

  useEffect(() => { fetchNearby() }, [spot?.id, radius])

  const fetchNearby = async () => {
    if (!spot?.lat || !spot?.lng) return
    setLoading(true)
    setError(null)
    try {
      const res = await authorizedFetch(`/api/hira?lat=${spot.lat}&lng=${spot.lng}&radius=${radius}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const result = data.items || []
      setItems(result)
      if (onClinicsLoaded) onClinicsLoaded(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const isPinned = (clinicId) => savedPins.some((p) => p.id === clinicId)
  const savedClinicIds = new Set(savedClinics.map((clinic) => clinic.id))
  const isFavorited = (clinicId) => savedClinicIds.has(clinicId)

  const handlePin = async (item, styleIdx = 0) => {
    if (isPinned(item.id)) {
      await deletePinnedClinic(spot.id, item.id)
    } else {
      await savePinnedClinic(spot.id, {
        ...item,
        markerStyle: MARKER_STYLES[styleIdx],
      })
    }
    setPickerOpen(null)
  }

  const changeStyle = async (item, styleIdx) => {
    await savePinnedClinic(spot.id, {
      ...item,
      markerStyle: MARKER_STYLES[styleIdx],
    })
    setPickerOpen(null)
  }

  const handleFavorite = async (item) => {
    if (!item?.id) return
    setSavingFavoriteId(item.id)
    setError(null)
    try {
      await saveSavedClinic({
        ...item,
        favorite: true,
        trackingStatus: 'active',
        markerStyle: item.markerStyle || FAVORITE_MARKER,
        autoCheck: item.autoCheck || { enabled: true, intervalDays: 30 },
        lastCheckedAt: item.lastCheckedAt || null,
        trackedFrom: {
          source: 'spot-nearby-investigation',
          spotId: spot.id,
          spotName: spot.name || '',
          radius,
          savedAt: new Date().toISOString(),
        },
        sourceContext: {
          spotId: spot.id,
          spotName: spot.name || '',
          spotAddress: spot.address || '',
          radius,
          distance: item.distance ?? null,
        },
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingFavoriteId(null)
    }
  }

  const handleSaveInvestigation = async () => {
    if (!spot?.id || items.length === 0) return
    setSavingInvestigation(true)
    setError(null)
    try {
      await saveSpotInvestigation(spot.id, {
        spot: {
          id: spot.id,
          name: spot.name || '',
          address: spot.address || '',
          lat: spot.lat ?? null,
          lng: spot.lng ?? null,
        },
        radius,
        clinicCount: items.length,
        competitorCount: competitors.length,
        summary: buildInvestigationSummary(items, competitors, radius),
        clinics: items.slice(0, INVESTIGATION_CLINIC_LIMIT).map(clinicSnapshot),
        competitorIds: competitors.map((item) => item.id),
        source: 'nearby-panel-hira',
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setSavingInvestigation(false)
    }
  }

  const competitors = items.filter((i) => i.isCompetitor)
  const displayItems = showAll ? items : competitors
  const competitorLevel =
    competitors.length === 0 ? { label: '독점', color: '#34C759' } :
    competitors.length <= 2 ? { label: '양호', color: '#FFCC00' } :
    competitors.length <= 4 ? { label: '보통', color: '#FF9500' } :
    { label: '경쟁심함', color: '#FF3B30' }

  return (
    <div className="nearby-panel">
      <div className="nearby-header">
        <div>
          <h2 className="nearby-title">🏥 주변 의료기관</h2>
          <p className="nearby-sub">{spot?.name || '선택된 스팟'}</p>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {/* 경쟁 요약 */}
      {!loading && items.length > 0 && (
        <div className="competition-summary">
          <div className="comp-stat">
            <span className="comp-num">{items.length}</span>
            <span className="comp-label">전체</span>
          </div>
          <div className="comp-divider" />
          <div className="comp-stat">
            <span className="comp-num" style={{ color: competitorLevel.color }}>{competitors.length}</span>
            <span className="comp-label">경쟁 의원</span>
          </div>
          <div className="comp-divider" />
          <div className="comp-stat">
            <span className="comp-num" style={{ color: competitorLevel.color }}>{competitorLevel.label}</span>
            <span className="comp-label">경쟁 강도</span>
          </div>
          <div className="comp-divider" />
          <div className="comp-stat">
            <span className="comp-num" style={{ color: '#5856D6' }}>{savedPins.length}</span>
            <span className="comp-label">📌 저장됨</span>
          </div>
        </div>
      )}

      {/* 저장된 핀 안내 */}
      {savedPins.length > 0 && (
        <div className="saved-pins-notice">
          📌 {savedPins.length}개 의원이 지도에 저장되어 있습니다 — 재검색 없이 유지됩니다
        </div>
      )}

      <div className="competitor-guide">
        🎯 경쟁 기준: 내과 · 가정의학과 · 365의원 &nbsp;|&nbsp; 경쟁 조사 → 공개 데이터 기반 리포트
      </div>

      {investigations.length > 0 && (
        <div className="investigation-history">
          최근 조사 {formatDateTime(investigations[0].createdAt) || '저장됨'} · 누적 {investigations.length}회
        </div>
      )}

      {/* 반경 */}
      <div className="radius-row">
        <span className="radius-label">검색 반경</span>
        <div className="radius-btns">
          {RADIUS_OPTIONS.map((r) => (
            <button key={r} className={`radius-btn ${radius === r ? 'active' : ''}`}
              onClick={() => setRadius(r)}>
              {r < 1000 ? `${r}m` : `${r/1000}km`}
            </button>
          ))}
        </div>
      </div>

      {/* 전체/경쟁 토글 */}
      {!loading && items.length > 0 && (
        <div className="show-toggle">
          <button className={`toggle-btn ${!showAll ? 'active' : ''}`} onClick={() => setShowAll(false)}>
            경쟁 의원 ({competitors.length})
          </button>
          <button className={`toggle-btn ${showAll ? 'active' : ''}`} onClick={() => setShowAll(true)}>
            전체 ({items.length})
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="investigation-save-row">
          <button onClick={handleSaveInvestigation} disabled={savingInvestigation}>
            {savingInvestigation ? '기록 저장 중...' : '현재 조사 기록 저장'}
          </button>
          <span>저장 시 날짜, 반경, 의원 목록, 경쟁 요약이 후보지에 남습니다.</span>
        </div>
      )}

      {/* 목록 */}
      <div className="nearby-list">
        {loading && (
          <div className="nearby-loading">
            <div className="loading-spinner" />
            <p>심평원 데이터 불러오는 중...</p>
          </div>
        )}
        {error && (
          <div className="nearby-error">
            <p>⚠️ {error}</p>
            <button onClick={fetchNearby} className="retry-btn">다시 시도</button>
          </div>
        )}
        {!loading && !error && displayItems.length === 0 && (
          <div className="nearby-empty">
            <div style={{ fontSize: 36, marginBottom: 10 }}>🏞️</div>
            <p>{showAll ? '의료기관이 없습니다' : '경쟁 의원이 없습니다!'}</p>
          </div>
        )}

        {!loading && displayItems.map((item) => {
          const pinned = isPinned(item.id)
          const favorited = isFavorited(item.id)
          const savedPin = savedPins.find((p) => p.id === item.id)
          const currentStyle = savedPin?.markerStyle || MARKER_STYLES[0]

          return (
            <div key={item.id}
              className={`clinic-card ${item.isCompetitor ? 'competitor' : ''} ${pinned ? 'map-marked' : ''}`}
            >
              <div className="clinic-card-top">
                <div className="clinic-name-row">
                  {item.isCompetitor && <span className="competitor-badge">경쟁</span>}
                  {pinned && <span className="pinned-badge">📌저장</span>}
                  <span className="clinic-name">{item.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <DistanceBadge distance={item.distance} />
                  {/* 핀 버튼 */}
                  <div style={{ position: 'relative' }}>
                    <button
                      className={`mark-btn ${pinned ? 'marked' : ''}`}
                      onClick={() => pinned ? handlePin(item) : setPickerOpen(pickerOpen === item.id ? null : item.id)}
                      title={pinned ? '저장 해제' : '지도에 저장'}
                    >
                      {pinned ? currentStyle.icon : '📌'}
                    </button>
                    {/* 스타일 피커 */}
                    {pickerOpen === item.id && (
                      <div className="style-picker">
                        <div className="style-picker-title">표시 스타일 선택</div>
                        <div className="style-picker-grid">
                          {MARKER_STYLES.map((s, idx) => (
                            <button key={idx} className="style-option"
                              onClick={() => handlePin(item, idx)}
                            >{s.icon}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* 저장된 경우 스타일 변경 버튼 */}
                  {pinned && (
                    <button className="style-change-btn"
                      onClick={() => setPickerOpen(pickerOpen === item.id ? null : item.id)}
                      title="스타일 변경"
                    >🎨</button>
                  )}
                </div>
              </div>
              <div className="clinic-meta">
                <span className="clinic-type">{item.type}</span>
                {item.dept && (
                  <span className="clinic-dept">{item.dept.split(',').slice(0,3).join(' · ')}</span>
                )}
              </div>
              <p className="clinic-address">{item.address}</p>
              {item.tel && <p className="clinic-tel">📞 {item.tel}</p>}
              <div className="clinic-actions">
                <button
                  className={`clinic-favorite-btn ${favorited ? 'active' : ''}`}
                  onClick={() => handleFavorite(item)}
                  disabled={favorited || savingFavoriteId === item.id}
                >
                  {favorited ? '추적중' : savingFavoriteId === item.id ? '저장 중' : '즐겨찾기'}
                </button>
                <button
                  className="clinic-research-btn"
                  onClick={() => onCompetitorResearch?.(item)}
                >
                  경쟁 조사
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
