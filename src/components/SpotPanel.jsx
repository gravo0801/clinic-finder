import { useState, useEffect } from 'react'
import { calculateLocationScore, normalizeBusinessFields } from '../utils/locationScore'
import { calculateAvoidanceScore } from '../utils/avoidanceScore'

const PRESET_TAGS = [
  '주거지역', '상업지역', '역세권', '학교인근',
  '신축아파트', '구도심', '유동인구多', '주차양호',
  '경쟁심함', '대형병원인근', '버스환승', '입지우수',
]
const RATING_LABEL = ['', '검토필요', '보통', '양호', '우수', '최우수']
const RATING_COLOR = ['', '#007AFF', '#34C759', '#FFCC00', '#FF9500', '#FF3B30']

const BUSINESS_FORM_DEFAULTS = {
  deposit: '',
  monthlyRent: '',
  expectedMonthlyRevenue: '',
  maintenanceFee: '',
  areaPyeong: '',
  floor: '',
  parkingCount: '',
  hasElevator: '',
  signageQuality: '',
  pharmacyDistanceMemo: '',
  endoscopyRoomPossible: '',
  xrayPossible: '',
  interiorDifficulty: '',
  demandMemo: '',
  demand4060Level: '',
  residentialWorkerMixMemo: '',
  competitor500m: '',
  competitor1km: '',
  checkupEndoscopyCompetitors: '',
}

const toFormBoolean = (value) => {
  if (value === true) return 'true'
  if (value === false) return 'false'
  return ''
}

const toFormValue = (value) => (value === undefined || value === null ? '' : value)

const getBusinessForm = (business = {}) => ({
  ...BUSINESS_FORM_DEFAULTS,
  ...business,
  deposit: toFormValue(business.deposit),
  monthlyRent: toFormValue(business.monthlyRent),
  expectedMonthlyRevenue: toFormValue(business.expectedMonthlyRevenue),
  maintenanceFee: toFormValue(business.maintenanceFee),
  areaPyeong: toFormValue(business.areaPyeong),
  floor: toFormValue(business.floor),
  parkingCount: toFormValue(business.parkingCount),
  hasElevator: toFormBoolean(business.hasElevator),
  signageQuality: toFormValue(business.signageQuality),
  endoscopyRoomPossible: toFormBoolean(business.endoscopyRoomPossible),
  xrayPossible: toFormBoolean(business.xrayPossible),
  interiorDifficulty: toFormValue(business.interiorDifficulty),
  demand4060Level: toFormValue(business.demand4060Level),
  competitor500m: toFormValue(business.competitor500m),
  competitor1km: toFormValue(business.competitor1km),
  checkupEndoscopyCompetitors: toFormValue(business.checkupEndoscopyCompetitors),
})

const SCORE_PARTS = [
  ['demand', '수요', 30],
  ['competition', '경쟁', 25],
  ['accessibility', '접근성', 15],
  ['economics', '경제성', 20],
  ['strategicFit', '전략', 10],
]

const scoreTone = (value) => (value >= 75 ? 'good' : value >= 45 ? 'mid' : 'low')

function LocationScoreSummary({ score, compact = false }) {
  const risks = score.riskFlags.slice(0, compact ? 2 : 3)
  const missing = score.missingInputs.slice(0, compact ? 3 : 5)

  return (
    <div className={`location-score-card ${compact ? 'compact' : ''}`}>
      <div className="score-card-head">
        <div>
          <div className="score-card-label">객관식 입지 점수</div>
          <div className="score-card-sub">입력값 기반 참고 지표</div>
        </div>
        <div className="score-main">
          <span className={`score-total ${scoreTone(score.total)}`}>{score.total}</span>
          <span className="score-confidence">신뢰도 {score.confidence}%</span>
        </div>
      </div>

      {!compact && (
        <div className="score-breakdown">
          {SCORE_PARTS.map(([key, label, max]) => (
            <div className="score-breakdown-row" key={key}>
              <span>{label}</span>
              <div className="score-breakdown-bar">
                <div style={{ width: `${Math.round((score[key] / max) * 100)}%` }} />
              </div>
              <b>{score[key]}/{max}</b>
            </div>
          ))}
        </div>
      )}

      {risks.length > 0 && (
        <div className="score-note risk">
          <span>리스크</span>
          <p>{risks.join(' · ')}</p>
        </div>
      )}

      {missing.length > 0 && (
        <div className="score-note missing">
          <span>미입력</span>
          <p>
            {missing.join(', ')}
            {score.missingInputs.length > missing.length ? ` 외 ${score.missingInputs.length - missing.length}개` : ''}
          </p>
        </div>
      )}
    </div>
  )
}

function AvoidanceRiskSummary({ avoidance, compact = false }) {
  const rules = avoidance.rules.slice(0, compact ? 2 : 4)
  const missing = avoidance.missingInputs.slice(0, compact ? 2 : 4)

  return (
    <div className={`avoidance-card ${avoidance.level.key} ${compact ? 'compact' : ''}`}>
      <div className="avoidance-head">
        <div>
          <div className="avoidance-label">회피 리스크</div>
          <div className="avoidance-sub">나쁜 입지 감점 모델</div>
        </div>
        <div className="avoidance-score">
          <span className={`avoidance-level ${avoidance.level.key}`}>{avoidance.level.label}</span>
          <span>감점 -{avoidance.penalty}</span>
        </div>
      </div>

      <div className="avoidance-final">
        <span>감점 후 입지 점수</span>
        <b>{avoidance.adjustedScore}</b>
        <small>기존 {avoidance.baseScore}</small>
      </div>

      {rules.length > 0 ? (
        <div className="avoidance-rule-list">
          {rules.map((rule) => (
            <div className="avoidance-rule" key={`${rule.key}-${rule.label}`}>
              <span>-{rule.penalty}</span>
              <p><b>{rule.label}</b>{rule.detail ? ` · ${rule.detail}` : ''}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="avoidance-empty">큰 회피 리스크가 아직 잡히지 않았습니다.</div>
      )}

      {missing.length > 0 && (
        <div className="avoidance-missing">
          미확인: {missing.join(', ')}
          {avoidance.missingInputs.length > missing.length ? ` 외 ${avoidance.missingInputs.length - missing.length}개` : ''}
        </div>
      )}
    </div>
  )
}

function ViewMode({ spot, onEdit, onNearby, onAI, onChecklist, onArea, onClose }) {
  const r = spot.rating || 0
  const checkDone = spot.checklist?.filter((c) => c.done).length || 0
  const checkTotal = spot.checklist?.length || 0
  const locationScore = calculateLocationScore(spot)
  const avoidanceScore = calculateAvoidanceScore(spot)
  return (
    <div className="spot-panel view-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">📍 후보지 정보</h2>
          {spot.address && <p className="panel-coords">{spot.address}</p>}
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="panel-body view-mode">
        <div className="view-name">{spot.name || '이름 없음'}</div>
        {r > 0 && (
          <div className="view-rating">
            {[1,2,3,4,5].map((i) => (
              <span key={i} style={{ fontSize: 24, color: i <= r ? RATING_COLOR[r] : '#ddd' }}>★</span>
            ))}
            <span className="view-rating-label" style={{ color: RATING_COLOR[r] }}>{RATING_LABEL[r]}</span>
          </div>
        )}
        {spot.tags?.length > 0 && (
          <div className="view-section">
            <div className="view-section-title">특성 태그</div>
            <div className="view-tags">{spot.tags.map((t) => <span key={t} className="view-tag">{t}</span>)}</div>
          </div>
        )}
        <LocationScoreSummary score={locationScore} />
        <AvoidanceRiskSummary avoidance={avoidanceScore} />
        {spot.memo && (
          <div className="view-section view-section-memo">
            <div className="view-section-title">메모</div>
            <div className="view-memo-large">{spot.memo}</div>
          </div>
        )}
        {checkTotal > 0 && (
          <div className="view-section">
            <div className="view-section-title">임장 체크리스트</div>
            <div className="view-checklist-progress">
              <div className="view-check-bar-wrap">
                <div className="view-check-bar-fill" style={{ width: `${Math.round((checkDone/checkTotal)*100)}%`, background: checkDone===checkTotal?'#34C759':'#5856D6' }} />
              </div>
              <span className="view-check-text">{checkDone}/{checkTotal} 완료</span>
            </div>
            {spot.visitDate && <p className="view-visit-date">📅 임장일: {spot.visitDate}</p>}
          </div>
        )}
        <div className="view-section">
          <div className="view-section-title">좌표</div>
          <div className="view-coords">{spot.lat?.toFixed(6)}, {spot.lng?.toFixed(6)}</div>
        </div>
        <div className="view-actions">
          <button className="btn-save" onClick={onEdit}>✏️ 편집하기</button>
        </div>
        <div className="view-sub-actions">
          <button className="view-sub-btn nearby" onClick={onNearby}>🏥 주변 의원</button>
          <button className="view-sub-btn ai" onClick={onAI}>🤖 AI 분석</button>
          <button className="view-sub-btn checklist" onClick={onChecklist}>📋 임장</button>
          <button className="view-sub-btn area" onClick={onArea}>📊 지역</button>
        </div>
      </div>
    </div>
  )
}

function EditMode({ mode, spot, coords, onSave, onUpdate, onDelete, onClose }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [tags, setTags] = useState([])
  const [memo, setMemo] = useState('')
  const [business, setBusiness] = useState(BUSINESS_FORM_DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [geocoding, setGeocoding] = useState(false)

  useEffect(() => {
    if (mode === 'edit' && spot) {
      setName(spot.name || ''); setAddress(spot.address || '')
      setRating(spot.rating || 0); setTags(spot.tags || []); setMemo(spot.memo || '')
      setBusiness(getBusinessForm(spot.business))
    } else {
      setName(''); setAddress(''); setRating(0); setTags([]); setMemo('')
      setBusiness(BUSINESS_FORM_DEFAULTS)
      if (coords) {
        setAddress('주소 불러오는 중...')
        setGeocoding(true)
        fetch(`/api/geocode?lat=${coords.lat}&lng=${coords.lng}`)
          .then((r) => r.json())
          .then((d) => { setAddress(d.address || ''); setGeocoding(false) })
          .catch(() => { setAddress(''); setGeocoding(false) })
      }
    }
  }, [mode, spot?.id, coords?.lat, coords?.lng])

  const toggleTag = (tag) => setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  const setBusinessField = (field, value) => {
    setBusiness((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async () => {
    setSaving(true)
    try {
      const data = { name, address, rating, tags, memo, business: normalizeBusinessFields(business) }
      if (mode === 'new') await onSave(data)
      else await onUpdate(spot.id, data)
    } finally { setSaving(false) }
  }

  const handleDelete = () => {
    if (window.confirm(`"${spot?.name || '이 스팟'}"을 삭제할까요?`)) onDelete(spot.id)
  }

  const displayRating = hover || rating
  const isNew = mode === 'new'
  const liveSpot = { ...spot, name, address, rating, tags, memo, business }
  const liveScore = calculateLocationScore(liveSpot)
  const liveAvoidance = calculateAvoidanceScore(liveSpot)

  return (
    <div className="spot-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{isNew ? '📍 새 후보지 추가' : '✏️ 후보지 편집'}</h2>
          {coords && isNew && <p className="panel-coords">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</p>}
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="panel-body">
        <div className="field">
          <label className="field-label">후보지 이름</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 역삼동 르네상스 빌딩 앞" />
        </div>
        <div className="field">
          <label className="field-label">
            주소 {geocoding && <span style={{ color: '#5856D6', fontSize: 10, marginLeft: 4 }}>📍 자동 입력 중...</span>}
          </label>
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="지도 클릭 시 자동 입력됩니다" />
        </div>
        <div className="field">
          <label className="field-label">입지 평점</label>
          <div className="star-row">
            {[1,2,3,4,5].map((n) => (
              <span key={n} className="star-btn"
                style={{ color: n<=displayRating ? RATING_COLOR[displayRating] : '#d0d4e0', transform: n<=displayRating ? 'scale(1.15)' : 'scale(1)' }}
                onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)}
              >★</span>
            ))}
            {displayRating > 0 && <span className="rating-badge" style={{ background: RATING_COLOR[displayRating] }}>{RATING_LABEL[displayRating]}</span>}
          </div>
        </div>
        <div className="field">
          <label className="field-label">특성 태그</label>
          <div className="tag-grid">
            {PRESET_TAGS.map((tag) => (
              <button key={tag} className={`tag-toggle ${tags.includes(tag) ? 'on' : ''}`} onClick={() => toggleTag(tag)}>{tag}</button>
            ))}
          </div>
        </div>
        <div className="business-section">
          <div className="business-section-title">
            <span>개원 조건</span>
            <small>비어 있어도 저장됩니다</small>
          </div>
          <div className="business-grid">
            <label className="business-field">
              <span>보증금</span>
              <input
                className="business-input"
                type="number"
                min="0"
                value={business.deposit}
                onChange={(e) => setBusinessField('deposit', e.target.value)}
                placeholder="만원"
              />
            </label>
            <label className="business-field">
              <span>월세</span>
              <input
                className="business-input"
                type="number"
                min="0"
                value={business.monthlyRent}
                onChange={(e) => setBusinessField('monthlyRent', e.target.value)}
                placeholder="만원"
              />
            </label>
            <label className="business-field">
              <span>예상 월매출</span>
              <input
                className="business-input"
                type="number"
                min="0"
                value={business.expectedMonthlyRevenue}
                onChange={(e) => setBusinessField('expectedMonthlyRevenue', e.target.value)}
                placeholder="만원"
              />
            </label>
            <label className="business-field">
              <span>관리비</span>
              <input
                className="business-input"
                type="number"
                min="0"
                value={business.maintenanceFee}
                onChange={(e) => setBusinessField('maintenanceFee', e.target.value)}
                placeholder="만원"
              />
            </label>
            <label className="business-field">
              <span>전용면적</span>
              <input
                className="business-input"
                type="number"
                min="0"
                step="0.1"
                value={business.areaPyeong}
                onChange={(e) => setBusinessField('areaPyeong', e.target.value)}
                placeholder="평"
              />
            </label>
            <label className="business-field">
              <span>층수</span>
              <input
                className="business-input"
                type="number"
                value={business.floor}
                onChange={(e) => setBusinessField('floor', e.target.value)}
                placeholder="예: 3"
              />
            </label>
            <label className="business-field">
              <span>주차대수</span>
              <input
                className="business-input"
                type="number"
                min="0"
                value={business.parkingCount}
                onChange={(e) => setBusinessField('parkingCount', e.target.value)}
                placeholder="대"
              />
            </label>
            <label className="business-field">
              <span>엘리베이터</span>
              <select
                className="business-input"
                value={business.hasElevator}
                onChange={(e) => setBusinessField('hasElevator', e.target.value)}
              >
                <option value="">미확인</option>
                <option value="true">있음</option>
                <option value="false">없음</option>
              </select>
            </label>
            <label className="business-field">
              <span>간판 노출도</span>
              <select
                className="business-input"
                value={business.signageQuality}
                onChange={(e) => setBusinessField('signageQuality', e.target.value)}
              >
                <option value="">미입력</option>
                <option value="1">1 낮음</option>
                <option value="2">2 다소 낮음</option>
                <option value="3">3 보통</option>
                <option value="4">4 좋음</option>
                <option value="5">5 매우 좋음</option>
              </select>
            </label>
            <label className="business-field">
              <span>내시경실</span>
              <select
                className="business-input"
                value={business.endoscopyRoomPossible}
                onChange={(e) => setBusinessField('endoscopyRoomPossible', e.target.value)}
              >
                <option value="">미확인</option>
                <option value="true">가능</option>
                <option value="false">불가</option>
              </select>
            </label>
            <label className="business-field">
              <span>X-ray</span>
              <select
                className="business-input"
                value={business.xrayPossible}
                onChange={(e) => setBusinessField('xrayPossible', e.target.value)}
              >
                <option value="">미확인</option>
                <option value="true">가능</option>
                <option value="false">불가</option>
              </select>
            </label>
            <label className="business-field">
              <span>인테리어 난이도</span>
              <select
                className="business-input"
                value={business.interiorDifficulty}
                onChange={(e) => setBusinessField('interiorDifficulty', e.target.value)}
              >
                <option value="">미입력</option>
                <option value="1">1 낮음</option>
                <option value="2">2 다소 낮음</option>
                <option value="3">3 보통</option>
                <option value="4">4 높음</option>
                <option value="5">5 매우 높음</option>
              </select>
            </label>
            <label className="business-field">
              <span>40~60대 수요</span>
              <select
                className="business-input"
                value={business.demand4060Level}
                onChange={(e) => setBusinessField('demand4060Level', e.target.value)}
              >
                <option value="">미입력</option>
                <option value="1">1 낮음</option>
                <option value="2">2 다소 낮음</option>
                <option value="3">3 보통</option>
                <option value="4">4 높음</option>
                <option value="5">5 매우 높음</option>
              </select>
            </label>
            <label className="business-field">
              <span>경쟁 의원 500m</span>
              <input
                className="business-input"
                type="number"
                min="0"
                value={business.competitor500m}
                onChange={(e) => setBusinessField('competitor500m', e.target.value)}
                placeholder="개"
              />
            </label>
            <label className="business-field">
              <span>경쟁 의원 1km</span>
              <input
                className="business-input"
                type="number"
                min="0"
                value={business.competitor1km}
                onChange={(e) => setBusinessField('competitor1km', e.target.value)}
                placeholder="개"
              />
            </label>
            <label className="business-field">
              <span>검진/내시경 경쟁</span>
              <input
                className="business-input"
                type="number"
                min="0"
                value={business.checkupEndoscopyCompetitors}
                onChange={(e) => setBusinessField('checkupEndoscopyCompetitors', e.target.value)}
                placeholder="개"
              />
            </label>
            <label className="business-field full">
              <span>약국 거리/동선 메모</span>
              <textarea
                className="business-textarea"
                rows={2}
                value={business.pharmacyDistanceMemo}
                onChange={(e) => setBusinessField('pharmacyDistanceMemo', e.target.value)}
                placeholder="약국 위치, 보행 동선, 처방전 흐름 확인 내용"
              />
            </label>
            <label className="business-field full">
              <span>수요 메모</span>
              <textarea
                className="business-textarea"
                rows={2}
                value={business.demandMemo}
                onChange={(e) => setBusinessField('demandMemo', e.target.value)}
                placeholder="40~60대 체감, 검진 수요, 생활권 특성"
              />
            </label>
            <label className="business-field full">
              <span>직장인/주거민 비율 메모</span>
              <textarea
                className="business-textarea"
                rows={2}
                value={business.residentialWorkerMixMemo}
                onChange={(e) => setBusinessField('residentialWorkerMixMemo', e.target.value)}
                placeholder="평일 낮/저녁 유동, 주거민 비중, 오피스 수요"
              />
            </label>
          </div>
          <LocationScoreSummary score={liveScore} compact />
          <AvoidanceRiskSummary avoidance={liveAvoidance} compact />
        </div>
        <div className="field">
          <label className="field-label">메모</label>
          <textarea className="textarea" rows={8} value={memo} onChange={(e) => setMemo(e.target.value)}
            placeholder="임장 전 인상, 주변 환경, 경쟁 의원, 고려사항 등 자유롭게 기록하세요" />
        </div>
        <div className="panel-actions">
          <button className="btn-save" onClick={handleSubmit} disabled={saving}>
            {saving ? '저장 중…' : isNew ? '후보지 저장' : '수정 완료'}
          </button>
          {!isNew && <button className="btn-delete" onClick={handleDelete}>삭제</button>}
        </div>
      </div>
    </div>
  )
}

export default function SpotPanel(props) {
  const { mode, onNearby, onAI, onChecklist, onArea } = props
  const [localMode, setLocalMode] = useState(mode)
  useEffect(() => { setLocalMode(mode) }, [mode, props.spot?.id])

  if (localMode === 'edit' && props.spot) {
    return (
      <ViewMode spot={props.spot}
        onEdit={() => setLocalMode('editing')}
        onNearby={onNearby} onAI={onAI} onChecklist={onChecklist} onArea={onArea}
        onClose={props.onClose}
      />
    )
  }
  return <EditMode {...props} mode={localMode === 'editing' ? 'edit' : mode} />
}
