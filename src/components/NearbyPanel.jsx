import { useState, useEffect } from 'react'

const DEPT_COLORS = {
  '내과': '#FF6B6B',
  '가정의학과': '#4ECDC4',
  '소화기내과': '#FFE66D',
  '외과': '#A8E6CF',
  '이비인후과': '#C3A6FF',
  '소아청소년과': '#FFB347',
  '피부과': '#FF9FF3',
  '정형외과': '#54A0FF',
  '산부인과': '#FF6B9D',
}

const RADIUS_OPTIONS = [500, 1000, 2000, 3000]

function DistanceBadge({ distance }) {
  const color =
    distance < 300 ? '#FF3B30' :
    distance < 700 ? '#FF9500' :
    distance < 1500 ? '#FFCC00' : '#8E8E93'
  return (
    <span style={{
      background: color + '22',
      color,
      border: `1px solid ${color}44`,
      borderRadius: 20,
      padding: '2px 8px',
      fontSize: 11,
      fontWeight: 700,
    }}>
      {distance < 1000 ? `${distance}m` : `${(distance / 1000).toFixed(1)}km`}
    </span>
  )
}

export default function NearbyPanel({ spot, onClose }) {
  const [radius, setRadius] = useState(1000)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('전체')

  useEffect(() => {
    fetchNearby()
  }, [spot?.id, radius])

  const fetchNearby = async () => {
    if (!spot?.lat || !spot?.lng) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/hira?lat=${spot.lat}&lng=${spot.lng}&radius=${radius}`
      )
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setItems(data.items || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // 진료과 목록 추출
  const depts = ['전체', ...new Set(
    items.flatMap((i) => (i.dept || '').split(',').map((d) => d.trim()).filter(Boolean))
  )].slice(0, 8)

  const filtered =
    filter === '전체'
      ? items
      : items.filter((i) => (i.dept || '').includes(filter))

  // 통계
  const myDepts = ['내과', '가정의학과', '소화기내과']
  const competitors = items.filter((i) =>
    myDepts.some((d) => (i.dept || '').includes(d))
  )

  return (
    <div className="nearby-panel">
      {/* Header */}
      <div className="nearby-header">
        <div>
          <h2 className="nearby-title">🏥 주변 의료기관</h2>
          <p className="nearby-sub">{spot?.name || '선택된 스팟'}</p>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {/* 경쟁 요약 카드 */}
      {!loading && items.length > 0 && (
        <div className="competition-summary">
          <div className="comp-stat">
            <span className="comp-num">{items.length}</span>
            <span className="comp-label">전체 의료기관</span>
          </div>
          <div className="comp-divider" />
          <div className="comp-stat">
            <span className="comp-num" style={{ color: competitors.length > 3 ? '#FF3B30' : '#34C759' }}>
              {competitors.length}
            </span>
            <span className="comp-label">직접 경쟁 의원</span>
          </div>
          <div className="comp-divider" />
          <div className="comp-stat">
            <span className="comp-num" style={{
              color: competitors.length === 0 ? '#34C759' :
                     competitors.length <= 2 ? '#FFCC00' :
                     competitors.length <= 4 ? '#FF9500' : '#FF3B30'
            }}>
              {competitors.length === 0 ? '독점' :
               competitors.length <= 2 ? '양호' :
               competitors.length <= 4 ? '보통' : '경쟁심함'}
            </span>
            <span className="comp-label">경쟁 강도</span>
          </div>
        </div>
      )}

      {/* 반경 선택 */}
      <div className="radius-row">
        <span className="radius-label">검색 반경</span>
        <div className="radius-btns">
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              className={`radius-btn ${radius === r ? 'active' : ''}`}
              onClick={() => setRadius(r)}
            >
              {r < 1000 ? `${r}m` : `${r / 1000}km`}
            </button>
          ))}
        </div>
      </div>

      {/* 진료과 필터 */}
      {!loading && items.length > 0 && (
        <div className="dept-filter">
          {depts.map((d) => (
            <button
              key={d}
              className={`dept-chip ${filter === d ? 'active' : ''}`}
              style={filter === d && DEPT_COLORS[d] ? {
                background: DEPT_COLORS[d],
                borderColor: DEPT_COLORS[d],
                color: '#fff',
              } : {}}
              onClick={() => setFilter(d)}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {/* 결과 */}
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

        {!loading && !error && filtered.length === 0 && (
          <div className="nearby-empty">
            <div style={{ fontSize: 36, marginBottom: 10 }}>🏞️</div>
            <p>반경 {radius < 1000 ? `${radius}m` : `${radius/1000}km`} 내<br/>해당 의료기관이 없습니다</p>
          </div>
        )}

        {!loading && filtered.map((item) => {
          const isCompetitor = myDepts.some((d) => (item.dept || '').includes(d))
          return (
            <div key={item.id} className={`clinic-card ${isCompetitor ? 'competitor' : ''}`}>
              <div className="clinic-card-top">
                <div className="clinic-name-row">
                  {isCompetitor && <span className="competitor-badge">경쟁</span>}
                  <span className="clinic-name">{item.name}</span>
                </div>
                <DistanceBadge distance={item.distance} />
              </div>
              <div className="clinic-meta">
                <span className="clinic-type">{item.type}</span>
                {item.dept && (
                  <span className="clinic-dept">{item.dept.split(',').slice(0, 3).join(' · ')}</span>
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
