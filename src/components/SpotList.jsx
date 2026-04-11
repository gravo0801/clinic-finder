const RATING_COLORS = {
  5: '#FF3B30',
  4: '#FF9500',
  3: '#FFCC00',
  2: '#34C759',
  1: '#007AFF',
  0: '#8E8E93',
}

const RATING_LABEL = ['미평가', '검토필요', '보통', '양호', '우수', '최우수']

function Stars({ n }) {
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= n ? RATING_COLORS[n] : '#3a3a5c' }}>
          ★
        </span>
      ))}
    </span>
  )
}

export default function SpotList({ spots, selectedId, onSelect }) {
  if (spots.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">🗺️</div>
        <p className="empty-title">후보지가 없어요</p>
        <p className="empty-sub">지도를 클릭해 첫 번째<br />개원 후보지를 추가하세요</p>
      </div>
    )
  }

  const sorted = [...spots].sort((a, b) => (b.rating || 0) - (a.rating || 0))

  return (
    <div className="spot-list">
      <div className="spot-count">{spots.length}개 후보지</div>
      {sorted.map((spot) => (
        <div
          key={spot.id}
          className={`spot-card ${selectedId === spot.id ? 'selected' : ''}`}
          onClick={() => onSelect(spot)}
        >
          <div className="spot-card-top">
            <span
              className="rating-dot"
              style={{ background: RATING_COLORS[spot.rating || 0] }}
            />
            <span className="spot-name">{spot.name || '이름 없음'}</span>
          </div>

          <div className="spot-meta">
            <Stars n={spot.rating || 0} />
            <span className="rating-text">{RATING_LABEL[spot.rating || 0]}</span>
          </div>

          {spot.tags?.length > 0 && (
            <div className="spot-tags">
              {spot.tags.slice(0, 3).map((t) => (
                <span key={t} className="tag-chip">
                  {t}
                </span>
              ))}
              {spot.tags.length > 3 && (
                <span className="tag-chip muted">+{spot.tags.length - 3}</span>
              )}
            </div>
          )}

          {spot.memo && (
            <p className="spot-memo-preview">
              {spot.memo.length > 55 ? spot.memo.slice(0, 55) + '…' : spot.memo}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
