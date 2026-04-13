import { useState, useEffect } from 'react'

const PRESET_TAGS = [
  '주거지역', '상업지역', '역세권', '학교인근',
  '신축아파트', '구도심', '유동인구多', '주차양호',
  '경쟁심함', '대형병원인근', '버스환승', '입지우수',
]

const RATING_LABEL = ['', '검토필요', '보통', '양호', '우수', '최우수']
const RATING_COLOR = ['', '#007AFF', '#34C759', '#FFCC00', '#FF9500', '#FF3B30']

// ── 조회 모드 ──────────────────────────────────────────────
function ViewMode({ spot, onEdit, onNearby, onAI, onChecklist, onClose }) {
  const r = spot.rating || 0
  const checkDone = spot.checklist?.filter((c) => c.done).length || 0
  const checkTotal = spot.checklist?.length || 0

  return (
    <div className="spot-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">📍 후보지 정보</h2>
          {spot.address && <p className="panel-coords">{spot.address}</p>}
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="panel-body view-mode">
        {/* 이름 */}
        <div className="view-name">{spot.name || '이름 없음'}</div>

        {/* 평점 */}
        {r > 0 && (
          <div className="view-rating">
            {[1,2,3,4,5].map((i) => (
              <span key={i} style={{ fontSize: 24, color: i <= r ? RATING_COLOR[r] : '#ddd' }}>★</span>
            ))}
            <span className="view-rating-label" style={{ color: RATING_COLOR[r] }}>
              {RATING_LABEL[r]}
            </span>
          </div>
        )}

        {/* 태그 */}
        {spot.tags?.length > 0 && (
          <div className="view-section">
            <div className="view-section-title">특성 태그</div>
            <div className="view-tags">
              {spot.tags.map((t) => (
                <span key={t} className="view-tag">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* 메모 */}
        {spot.memo && (
          <div className="view-section">
            <div className="view-section-title">메모</div>
            <div className="view-memo">{spot.memo}</div>
          </div>
        )}

        {/* 임장 체크리스트 진행률 */}
        {checkTotal > 0 && (
          <div className="view-section">
            <div className="view-section-title">임장 체크리스트</div>
            <div className="view-checklist-progress">
              <div className="view-check-bar-wrap">
                <div
                  className="view-check-bar-fill"
                  style={{
                    width: `${Math.round((checkDone / checkTotal) * 100)}%`,
                    background: checkDone === checkTotal ? '#34C759' : '#5856D6'
                  }}
                />
              </div>
              <span className="view-check-text">{checkDone}/{checkTotal} 완료</span>
            </div>
            {spot.visitDate && (
              <p className="view-visit-date">📅 임장일: {spot.visitDate}</p>
            )}
          </div>
        )}

        {/* 좌표 */}
        <div className="view-section">
          <div className="view-section-title">좌표</div>
          <div className="view-coords">{spot.lat?.toFixed(6)}, {spot.lng?.toFixed(6)}</div>
        </div>

        {/* 편집 버튼 */}
        <div className="view-actions">
          <button className="btn-save" onClick={onEdit}>✏️ 편집하기</button>
        </div>

        {/* 기능 버튼 3개 */}
        <div className="view-sub-actions">
          <button className="view-sub-btn nearby" onClick={onNearby}>🏥 주변 의원</button>
          <button className="view-sub-btn ai" onClick={onAI}>🤖 AI 분석</button>
          <button className="view-sub-btn checklist" onClick={onChecklist}>📋 임장</button>
        </div>
      </div>
    </div>
  )
}

// ── 편집 모드 ──────────────────────────────────────────────
function EditMode({ mode, spot, coords, onSave, onUpdate, onDelete, onClose }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [tags, setTags] = useState([])
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode === 'edit' && spot) {
      setName(spot.name || '')
      setAddress(spot.address || '')
      setRating(spot.rating || 0)
      setTags(spot.tags || [])
      setMemo(spot.memo || '')
    } else {
      setName(''); setAddress(''); setRating(0); setTags([]); setMemo('')
    }
  }, [mode, spot?.id])

  const toggleTag = (tag) =>
    setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])

  const handleSubmit = async () => {
    setSaving(true)
    const data = { name, address, rating, tags, memo }
    try {
      if (mode === 'new') await onSave(data)
      else await onUpdate(spot.id, data)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    if (window.confirm(`"${spot?.name || '이 스팟'}"을 삭제할까요?`)) {
      onDelete(spot.id)
    }
  }

  const displayRating = hover || rating
  const isNew = mode === 'new'

  return (
    <div className="spot-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{isNew ? '📍 새 후보지 추가' : '✏️ 후보지 편집'}</h2>
          {coords && isNew && (
            <p className="panel-coords">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>
          )}
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="panel-body">
        <div className="field">
          <label className="field-label">후보지 이름</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="예: 역삼동 르네상스 빌딩 앞" />
        </div>
        <div className="field">
          <label className="field-label">주소 (선택)</label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)}
            placeholder="도로명 또는 지번 주소" />
        </div>
        <div className="field">
          <label className="field-label">입지 평점</label>
          <div className="star-row">
            {[1,2,3,4,5].map((n) => (
              <span key={n} className="star-btn"
                style={{ color: n <= displayRating ? RATING_COLOR[displayRating] : '#d0d4e0', transform: n <= displayRating ? 'scale(1.15)' : 'scale(1)' }}
                onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)}
              >★</span>
            ))}
            {displayRating > 0 && (
              <span className="rating-badge" style={{ background: RATING_COLOR[displayRating] }}>
                {RATING_LABEL[displayRating]}
              </span>
            )}
          </div>
        </div>
        <div className="field">
          <label className="field-label">특성 태그</label>
          <div className="tag-grid">
            {PRESET_TAGS.map((tag) => (
              <button key={tag} className={`tag-toggle ${tags.includes(tag) ? 'on' : ''}`}
                onClick={() => toggleTag(tag)}>{tag}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label className="field-label">메모</label>
          <textarea className="textarea" rows={5} value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="임장 전 인상, 주변 환경, 경쟁 의원, 고려사항 등 자유롭게 기록하세요" />
        </div>
        <div className="panel-actions">
          <button className="btn-save" onClick={handleSubmit} disabled={saving}>
            {saving ? '저장 중…' : isNew ? '후보지 저장' : '수정 완료'}
          </button>
          {!isNew && (
            <button className="btn-delete" onClick={handleDelete}>삭제</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 메인 export ───────────────────────────────────────────
export default function SpotPanel(props) {
  const { mode, onNearby, onAI, onChecklist } = props
  const [localMode, setLocalMode] = useState(mode)

  useEffect(() => { setLocalMode(mode) }, [mode, props.spot?.id])

  if (localMode === 'edit' && props.spot) {
    return (
      <ViewMode
        spot={props.spot}
        onEdit={() => setLocalMode('editing')}
        onNearby={onNearby}
        onAI={onAI}
        onChecklist={onChecklist}
        onClose={props.onClose}
      />
    )
  }

  return <EditMode {...props} mode={localMode === 'editing' ? 'edit' : mode} />
}
