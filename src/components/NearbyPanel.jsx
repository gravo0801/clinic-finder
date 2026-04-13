import { useState, useEffect } from 'react'

const RADIUS_OPTIONS = [500, 1000, 2000, 3000]

const MARKER_STYLES = [
  { icon: '📍', color: '#FF3B30', label: '빨강' },
  { icon: '⭐', color: '#FF9500', label: '주황' },
  { icon: '💛', color: '#FFCC00', label: '노랑' },
  { icon: '💚', color: '#34C759', label: '초록' },
  { icon: '💙', color: '#007AFF', label: '파랑' },
  { icon: '💜', color: '#AF52DE', label: '보라' },
  { icon: '🔴', color: '#FF3B30', label: '동그라미' },
  { icon: '⭐', color: '#FFD700', label: '별' },
  { icon: '❤️', color: '#FF2D55', label: '하트' },
  { icon: '⚠️', color: '#FF9500', label: '경고' },
]

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

export default function NearbyPanel({ spot, onClose, onClinicsLoaded, onMarkedClinicsChange }) {
  const [radius, setRadius] = useState(1000)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showAll, setShowAll] = useState(false)
  // 마킹된 의원: { [id]: { styleIdx, memo } }
  const [marked, setMarked] = useState({})
  // 스타일 피커 열린 의원 id
  const [pickerOpen, setPickerOpen] = useState(null)

  useEffect(() => { fetchNearby() }, [spot?.id, radius])

  // 마킹 변경 시 부모에게 알림
  useEffect(() => {
    if (!onMarkedClinicsChange) return
    const markedList = items
      .filter((i) => marked[i.id] !== undefined)
      .map((i) => ({ ...i, markerStyle: MARKER_STYLES[marked[i.id]?.styleIdx ?? 0] }))
    onMarkedClinicsChange(markedList)
  }, [marked, items])

  const fetchNearby = async () => {
    if (!spot?.lat || !spot?.lng) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/hira?lat=${spot.lat}&lng=${spot.lng}&radius=${radius}`)
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

  const toggleMark = (item, styleIdx = 0) => {
    setMarked((prev) => {
      const next = { ...prev }
      if (next[item.id] !== undefined) {
        delete next[item.id]
      } else {
        next[item.id] = { styleIdx }
      }
      return next
    })
    setPickerOpen(null)
  }

  const changeStyle = (id, styleIdx) => {
    setMarked((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), styleIdx } }))
    setPickerOpen(null)
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
            <span className="comp-num" style={{ color: '#5856D6' }}>{Object.keys(marked).length}</span>
            <span className="comp-label">지도 표시</span>
          </div>
        </div>
      )}

      <div className="competitor-guide">
        🎯 경쟁 기준: 가정의학과 · 내과 · 검진의원 · 365의원 · 일반의
        &nbsp;|&nbsp; 📌 의원 클릭 → 지도에 표시
      </div>

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
          const isMarked = marked[item.id] !== undefined
          const styleIdx = marked[item.id]?.styleIdx ?? 0
          const style = MARKER_STYLES[styleIdx]

          return (
            <div key={item.id}
              className={`clinic-card ${item.isCompetitor ? 'competitor' : ''} ${isMarked ? 'map-marked' : ''}`}
            >
              <div className="clinic-card-top">
                <div className="clinic-name-row">
                  {item.isCompetitor && <span className="competitor-badge">경쟁</span>}
                  <span className="clinic-name">{item.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DistanceBadge distance={item.distance} />
                  {/* 마킹 버튼 */}
                  <div style={{ position: 'relative' }}>
                    <button
                      className={`mark-btn ${isMarked ? 'marked' : ''}`}
                      onClick={() => isMarked ? toggleMark(item) : setPickerOpen(pickerOpen === item.id ? null : item.id)}
                      title={isMarked ? '지도 표시 해제' : '지도에 표시'}
                    >
                      {isMarked ? style.icon : '📌'}
                    </button>

                    {/* 스타일 피커 */}
                    {pickerOpen === item.id && (
                      <div className="style-picker">
                        <div className="style-picker-title">표시 스타일 선택</div>
                        <div className="style-picker-grid">
                          {MARKER_STYLES.map((s, idx) => (
                            <button key={idx} className="style-option"
                              onClick={() => { toggleMark(item, idx) }}
                              title={s.label}
                            >
                              {s.icon}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 스타일 변경 (마킹된 경우) */}
                  {isMarked && (
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
