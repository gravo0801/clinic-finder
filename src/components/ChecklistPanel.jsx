import { useState, useEffect } from 'react'
import { updateSpot } from '../firebase'

const DEFAULT_CHECKLIST = [
  { id: 'c1', category: '접근성', text: '대중교통 접근성 (지하철/버스 정류장 거리)', done: false },
  { id: 'c2', category: '접근성', text: '주차 공간 확보 여부 (건물 내/주변)', done: false },
  { id: 'c3', category: '접근성', text: '1층 또는 엘리베이터 접근 가능 여부', done: false },
  { id: 'c4', category: '접근성', text: '간판 노출도 (도로에서 잘 보이는지)', done: false },

  { id: 'c5', category: '상권/유동인구', text: '평일 낮 유동인구 체감 (점심시간 기준)', done: false },
  { id: 'c6', category: '상권/유동인구', text: '주변 직장인/주거 인구 비율 확인', done: false },
  { id: 'c7', category: '상권/유동인구', text: '근처 카페/음식점 점심 손님 수준', done: false },
  { id: 'c8', category: '상권/유동인구', text: '주말 유동인구 (주거지역 특성)', done: false },

  { id: 'c9', category: '경쟁 의원', text: '반경 500m 내 내과/가정의학과 직접 확인', done: false },
  { id: 'c10', category: '경쟁 의원', text: '경쟁 의원 대기 환자 수 체감', done: false },
  { id: 'c11', category: '경쟁 의원', text: '365의원/검진센터 존재 여부', done: false },
  { id: 'c12', category: '경쟁 의원', text: '인근 대형병원 외래 진료과 확인', done: false },

  { id: 'c13', category: '건물/임대', text: '건물 노후도 및 청결 상태', done: false },
  { id: 'c14', category: '건물/임대', text: '의원 전용면적 적정 여부 (최소 50평 이상)', done: false },
  { id: 'c15', category: '건물/임대', text: '임대료 수준 (주변 시세 대비)', done: false },
  { id: 'c16', category: '건물/임대', text: '인테리어 공사 가능 여부 확인', done: false },
  { id: 'c17', category: '건물/임대', text: '전기 용량 및 의료가스 설치 가능 여부', done: false },

  { id: 'c18', category: '주변 환경', text: '주변 아파트 단지 규모 및 세대수', done: false },
  { id: 'c19', category: '주변 환경', text: '신축 vs 구축 아파트 비율', done: false },
  { id: 'c20', category: '주변 환경', text: '인근 학교/유치원 존재 여부 (소아 환자)', done: false },
  { id: 'c21', category: '주변 환경', text: '주변 약국 위치 및 협력 가능성', done: false },
]

const CATEGORIES = ['접근성', '상권/유동인구', '경쟁 의원', '건물/임대', '주변 환경']

const CATEGORY_ICONS = {
  '접근성': '🚇',
  '상권/유동인구': '👥',
  '경쟁 의원': '🏥',
  '건물/임대': '🏢',
  '주변 환경': '🏘️',
}

export default function ChecklistPanel({ spot, onClose }) {
  const [checklist, setChecklist] = useState([])
  const [visitDate, setVisitDate] = useState('')
  const [visitMemo, setVisitMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeCategory, setActiveCategory] = useState('전체')

  useEffect(() => {
    // 기존 체크리스트 불러오기 or 기본값
    if (spot?.checklist?.length > 0) {
      setChecklist(spot.checklist)
    } else {
      setChecklist(DEFAULT_CHECKLIST.map((c) => ({ ...c })))
    }
    setVisitDate(spot?.visitDate || '')
    setVisitMemo(spot?.visitMemo || '')
  }, [spot?.id])

  const toggleItem = (id) => {
    setChecklist((prev) =>
      prev.map((c) => c.id === id ? { ...c, done: !c.done } : c)
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSpot(spot.id, { checklist, visitDate, visitMemo })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const doneCount = checklist.filter((c) => c.done).length
  const totalCount = checklist.length
  const progress = Math.round((doneCount / totalCount) * 100)

  const filtered = activeCategory === '전체'
    ? checklist
    : checklist.filter((c) => c.category === activeCategory)

  const getCategoryProgress = (cat) => {
    const items = checklist.filter((c) => c.category === cat)
    const done = items.filter((c) => c.done).length
    return { done, total: items.length }
  }

  return (
    <div className="checklist-panel">
      {/* Header */}
      <div className="panel-header">
        <div>
          <h2 className="panel-title">📋 임장 체크리스트</h2>
          <p className="panel-coords">{spot?.name || '선택된 스팟'}</p>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {/* 진행률 */}
      <div className="checklist-progress">
        <div className="progress-top">
          <span className="progress-label">완료율</span>
          <span className="progress-count">{doneCount}/{totalCount}</span>
        </div>
        <div className="progress-bar-wrap">
          <div
            className="progress-bar-fill"
            style={{
              width: `${progress}%`,
              background: progress === 100 ? '#34C759' :
                progress >= 60 ? '#FFCC00' : '#5856D6'
            }}
          />
        </div>
        <div className="progress-pct">{progress}%</div>
      </div>

      {/* 임장일 */}
      <div className="visit-date-row">
        <label className="visit-date-label">임장일</label>
        <input
          type="date"
          className="visit-date-input"
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
        />
      </div>

      {/* 카테고리 탭 */}
      <div className="checklist-tabs">
        <button
          className={`checklist-tab ${activeCategory === '전체' ? 'active' : ''}`}
          onClick={() => setActiveCategory('전체')}
        >
          전체
        </button>
        {CATEGORIES.map((cat) => {
          const { done, total } = getCategoryProgress(cat)
          return (
            <button
              key={cat}
              className={`checklist-tab ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {CATEGORY_ICONS[cat]} {cat.split('/')[0]}
              <span className="tab-badge">{done}/{total}</span>
            </button>
          )
        })}
      </div>

      {/* 체크리스트 항목 */}
      <div className="checklist-body">
        {CATEGORIES
          .filter((cat) => activeCategory === '전체' || activeCategory === cat)
          .map((cat) => {
            const items = filtered.filter((c) => c.category === cat)
            if (items.length === 0) return null
            return (
              <div key={cat} className="checklist-group">
                <div className="checklist-group-title">
                  {CATEGORY_ICONS[cat]} {cat}
                </div>
                {items.map((item) => (
                  <div
                    key={item.id}
                    className={`checklist-item ${item.done ? 'done' : ''}`}
                    onClick={() => toggleItem(item.id)}
                  >
                    <div className={`check-box ${item.done ? 'checked' : ''}`}>
                      {item.done && <span>✓</span>}
                    </div>
                    <span className="check-text">{item.text}</span>
                  </div>
                ))}
              </div>
            )
          })}

        {/* 임장 메모 */}
        <div className="checklist-group">
          <div className="checklist-group-title">📝 임장 메모</div>
          <textarea
            className="textarea"
            rows={4}
            value={visitMemo}
            onChange={(e) => setVisitMemo(e.target.value)}
            placeholder="직접 방문 후 느낀 점, 특이사항, 추가 확인 필요 사항 등을 기록하세요"
            style={{ margin: '8px 0' }}
          />
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="checklist-footer">
        <button className="btn-save" onClick={handleSave} disabled={saving}>
          {saved ? '✓ 저장 완료!' : saving ? '저장 중...' : '💾 체크리스트 저장'}
        </button>
      </div>
    </div>
  )
}
