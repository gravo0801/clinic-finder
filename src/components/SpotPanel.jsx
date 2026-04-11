import { useState, useEffect } from 'react'

const PRESET_TAGS = [
  '주거지역', '상업지역', '역세권', '학교인근',
  '신축아파트', '구도심', '유동인구多', '주차양호',
  '경쟁심함', '대형병원인근', '버스환승', '입지우수',
]

const RATING_LABEL = ['', '검토필요', '보통', '양호', '우수', '최우수']
const RATING_COLOR = ['', '#007AFF', '#34C759', '#FFCC00', '#FF9500', '#FF3B30']

export default function SpotPanel({ mode, spot, coords, onSave, onUpdate, onDelete, onClose }) {
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
      setName('')
      setAddress('')
      setRating(0)
      setTags([])
      setMemo('')
    }
  }, [mode, spot?.id])

  const toggleTag = (tag) =>
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))

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
    if (window.confirm(`"${spot.name || '이 스팟'}"을 삭제할까요?`)) {
      onDelete(spot.id)
    }
  }

  const displayRating = hover || rating
  const isNew = mode === 'new'

  return (
    <div className="spot-panel">
      {/* Header */}
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{isNew ? '📍 새 후보지 추가' : '✏️ 후보지 편집'}</h2>
          {coords && isNew && (
            <p className="panel-coords">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </p>
          )}
        </div>
        <button className="close-btn" onClick={onClose} aria-label="닫기">
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="panel-body">
        {/* Name */}
        <div className="field">
          <label className="field-label">후보지 이름</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 역삼동 르네상스 빌딩 앞"
          />
        </div>

        {/* Address */}
        <div className="field">
          <label className="field-label">주소 (선택)</label>
          <input
            className="input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="도로명 또는 지번 주소"
          />
        </div>

        {/* Rating */}
        <div className="field">
          <label className="field-label">입지 평점</label>
          <div className="star-row">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className="star-btn"
                style={{
                  color: n <= displayRating ? RATING_COLOR[displayRating] : '#d0d4e0',
                  transform: n <= displayRating ? 'scale(1.15)' : 'scale(1)',
                }}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(n)}
              >
                ★
              </span>
            ))}
            {displayRating > 0 && (
              <span
                className="rating-badge"
                style={{ background: RATING_COLOR[displayRating] }}
              >
                {RATING_LABEL[displayRating]}
              </span>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="field">
          <label className="field-label">특성 태그</label>
          <div className="tag-grid">
            {PRESET_TAGS.map((tag) => (
              <button
                key={tag}
                className={`tag-toggle ${tags.includes(tag) ? 'on' : ''}`}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Memo */}
        <div className="field">
          <label className="field-label">메모</label>
          <textarea
            className="textarea"
            rows={5}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="임장 전 인상, 주변 환경, 경쟁 의원, 고려사항 등 자유롭게 기록하세요"
          />
        </div>

        {/* Actions */}
        <div className="panel-actions">
          <button className="btn-save" onClick={handleSubmit} disabled={saving}>
            {saving ? '저장 중…' : isNew ? '후보지 저장' : '수정 완료'}
          </button>
          {!isNew && (
            <button className="btn-delete" onClick={handleDelete}>
              삭제
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
