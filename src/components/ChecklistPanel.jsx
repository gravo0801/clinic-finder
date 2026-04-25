import { useState, useEffect } from 'react'
import { updateSpot } from '../firebase'

// ── 템플릿 정의 ──────────────────────────────────────────
const TEMPLATES = {
  general: {
    label: '🏥 일반 의원',
    desc: '1차 진료 일반 의원 기준',
    checklist: [
      { id: 'g1', category: '접근성', text: '대중교통 접근성 (지하철/버스 정류장 거리)' },
      { id: 'g2', category: '접근성', text: '주차 공간 확보 여부 (건물 내/주변)' },
      { id: 'g3', category: '접근성', text: '1층 또는 엘리베이터 접근 가능 여부' },
      { id: 'g4', category: '접근성', text: '간판 노출도 (도로에서 잘 보이는지)' },
      { id: 'g5', category: '상권/유동인구', text: '평일 낮 유동인구 체감 (점심시간 기준)' },
      { id: 'g6', category: '상권/유동인구', text: '주변 직장인/주거 인구 비율 확인' },
      { id: 'g7', category: '상권/유동인구', text: '근처 카페/음식점 점심 손님 수준' },
      { id: 'g8', category: '상권/유동인구', text: '주말 유동인구 (주거지역 특성)' },
      { id: 'g9', category: '경쟁 의원', text: '반경 500m 내 내과/가정의학과 직접 확인' },
      { id: 'g10', category: '경쟁 의원', text: '경쟁 의원 대기 환자 수 체감' },
      { id: 'g11', category: '경쟁 의원', text: '365의원/검진센터 존재 여부' },
      { id: 'g12', category: '경쟁 의원', text: '인근 대형병원 외래 진료과 확인' },
      { id: 'g13', category: '건물/임대', text: '건물 노후도 및 청결 상태' },
      { id: 'g14', category: '건물/임대', text: '의원 전용면적 적정 여부 (최소 30평 이상)' },
      { id: 'g15', category: '건물/임대', text: '임대료 수준 (주변 시세 대비)' },
      { id: 'g16', category: '건물/임대', text: '인테리어 공사 가능 여부 확인' },
      { id: 'g17', category: '주변 환경', text: '주변 아파트 단지 규모 및 세대수' },
      { id: 'g18', category: '주변 환경', text: '인근 학교/유치원 존재 여부' },
      { id: 'g19', category: '주변 환경', text: '주변 약국 위치 및 협력 가능성' },
      { id: 'g20', category: '주변 환경', text: '신축 vs 구축 아파트 비율' },
    ]
  },
  endoscopy: {
    label: '🔬 내시경 특화',
    desc: '가정의학과 + 내시경 클리닉 기준',
    checklist: [
      { id: 'e1', category: '공간/시설', text: '내시경실 면적 최소 9평 이상 확보 가능 여부' },
      { id: 'e2', category: '공간/시설', text: '회복실 별도 공간 확보 가능 여부 (4~6평)' },
      { id: 'e3', category: '공간/시설', text: '소독실 동선 (검체 처리 및 세척 공간)' },
      { id: 'e4', category: '공간/시설', text: 'X-ray 설치 시 방사선 차폐 가능 여부' },
      { id: 'e5', category: '공간/시설', text: '전기 용량 충분 여부 (내시경 장비 전용 회로)' },
      { id: 'e6', category: '공간/시설', text: '5층 이하 건물 여부 (검진 전후 환자 이동 부담)' },
      { id: 'e7', category: '공간/시설', text: '산소/의료가스 설치 공간 및 배관 가능 여부' },
      { id: 'e8', category: '경쟁/수요', text: '반경 1km 내 위·대장 검진센터 개수 확인' },
      { id: 'e9', category: '경쟁/수요', text: '인근 건강검진 전문 의원 운영 현황' },
      { id: 'e10', category: '경쟁/수요', text: '40~60대 인구 비율 (내시경 주요 타겟층)' },
      { id: 'e11', category: '경쟁/수요', text: '직장인 단체 검진 수요 가능성 (주변 기업)' },
      { id: 'e12', category: '경쟁/수요', text: '국가암검진 연계 수요 (위암/대장암 검진)' },
      { id: 'e13', category: '협력병원', text: '협업 가능한 종합병원/대학병원 차량 거리' },
      { id: 'e14', category: '협력병원', text: '배우자 종양내과 follow-up 환자 동선 적합성' },
      { id: 'e15', category: '협력병원', text: '인근 병원 소화기내과 referral 관계 구축 가능성' },
      { id: 'e16', category: '접근성', text: '주차 5대 이상 확보 가능 (보호자 동반 내원)' },
      { id: 'e17', category: '접근성', text: '1층 접근 또는 넓은 엘리베이터 (검진 후 이동)' },
      { id: 'e18', category: '접근성', text: '대중교통 접근성 (고령 환자 고려)' },
      { id: 'e19', category: '건물/임대', text: '전용면적 50평 이상 (내시경실+진료실+회복실)' },
      { id: 'e20', category: '건물/임대', text: '임대료 수준 및 보증금 협상 가능 여부' },
      { id: 'e21', category: '건물/임대', text: '리모델링 공사 범위 및 원상복구 조건' },
      { id: 'e22', category: '주변 환경', text: '인근 약국 존재 및 진정제 관련 협력 가능성' },
      { id: 'e23', category: '주변 환경', text: '주변 아파트 세대수 및 연령대 구성' },
    ]
  },
  oncology: {
    label: '🎗️ 종양 협업형',
    desc: '내시경 + 종양내과 공동개원 기준',
    checklist: [
      { id: 'o1', category: '입지 핵심', text: '대학병원/종합병원 차량 15~20분 이내 위치' },
      { id: 'o2', category: '입지 핵심', text: '암 치료 후 추적관찰 환자 접근 동선 적합성' },
      { id: 'o3', category: '입지 핵심', text: '인근 암 환자 커뮤니티/지원센터 위치 확인' },
      { id: 'o4', category: '입지 핵심', text: '항암 치료 후 외래 방문 가능한 동선 (주차 필수)' },
      { id: 'o5', category: '공간/시설', text: '내시경실 + 종양외래 진료실 동시 운영 면적 (60평+)' },
      { id: 'o6', category: '공간/시설', text: '회복실 충분 확보 (내시경 + 항암 부작용 대기)' },
      { id: 'o7', category: '공간/시설', text: '주사실/처치실 공간 (항암 보조 치료 가능 여부)' },
      { id: 'o8', category: '공간/시설', text: '냉장 의약품 보관 공간 (표적치료제 등)' },
      { id: 'o9', category: '경쟁/수요', text: '반경 2km 내 종양 외래 전문 클리닉 여부' },
      { id: 'o10', category: '경쟁/수요', text: '대학병원 종양내과 외래 대기 현황 (수요 파악)' },
      { id: 'o11', category: '경쟁/수요', text: '위암/대장암 검진 수요 (내시경 연계)' },
      { id: 'o12', category: '협력 네트워크', text: '종양내과 referral 가능한 대학병원 확보 여부' },
      { id: 'o13', category: '협력 네트워크', text: '병리과/영상의학과 협력 루트 구축 가능성' },
      { id: 'o14', category: '협력 네트워크', text: '인근 호스피스/완화의료 연계 기관 확인' },
      { id: 'o15', category: '접근성', text: '주차 10대 이상 (암 환자 자가용 의존도 높음)' },
      { id: 'o16', category: '접근성', text: '휠체어/보행 보조기 접근 가능 구조 여부' },
      { id: 'o17', category: '건물/임대', text: '전용면적 60평 이상 (다과목 동시 운영)' },
      { id: 'o18', category: '건물/임대', text: '장기 임대 계약 가능 여부 (5년 이상)' },
    ]
  }
}

const CATEGORY_ICONS = {
  '접근성': '🚇', '상권/유동인구': '👥', '경쟁 의원': '🏥',
  '건물/임대': '🏢', '주변 환경': '🏘️', '공간/시설': '🔧',
  '경쟁/수요': '📊', '협력병원': '🤝', '입지 핵심': '⭐',
  '협력 네트워크': '🌐',
}

export default function ChecklistPanel({ spot, onClose }) {
  const [templateKey, setTemplateKey] = useState('endoscopy')
  const [checklist, setChecklist] = useState([])
  const [visitDate, setVisitDate] = useState('')
  const [visitMemo, setVisitMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeCategory, setActiveCategory] = useState('전체')

  useEffect(() => {
    const tKey = spot?.checklistTemplate || 'endoscopy'
    setTemplateKey(tKey)
    const template = TEMPLATES[tKey].checklist
    if (spot?.checklist?.length > 0) {
      // 기존 체크 상태 복원
      const doneMap = {}
      spot.checklist.forEach((c) => { doneMap[c.id] = c.done })
      setChecklist(template.map((c) => ({ ...c, done: doneMap[c.id] || false })))
    } else {
      setChecklist(template.map((c) => ({ ...c, done: false })))
    }
    setVisitDate(spot?.visitDate || '')
    setVisitMemo(spot?.visitMemo || '')
  }, [spot?.id])

  const switchTemplate = (key) => {
    setTemplateKey(key)
    setChecklist(TEMPLATES[key].checklist.map((c) => ({ ...c, done: false })))
    setActiveCategory('전체')
  }

  const toggleItem = (id) => {
    setChecklist((prev) => prev.map((c) => c.id === id ? { ...c, done: !c.done } : c))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSpot(spot.id, { checklist, visitDate, visitMemo, checklistTemplate: templateKey })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  const doneCount = checklist.filter((c) => c.done).length
  const totalCount = checklist.length
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  const categories = [...new Set(checklist.map((c) => c.category))]
  const filtered = activeCategory === '전체' ? checklist : checklist.filter((c) => c.category === activeCategory)

  const getCategoryProgress = (cat) => {
    const items = checklist.filter((c) => c.category === cat)
    return { done: items.filter((c) => c.done).length, total: items.length }
  }

  return (
    <div className="checklist-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">📋 임장 체크리스트</h2>
          <p className="panel-coords">{spot?.name}</p>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {/* 템플릿 선택 */}
      <div className="template-selector">
        {Object.entries(TEMPLATES).map(([key, tmpl]) => (
          <button key={key}
            className={`template-btn ${templateKey === key ? 'active' : ''}`}
            onClick={() => switchTemplate(key)}
            title={tmpl.desc}
          >
            {tmpl.label}
          </button>
        ))}
      </div>

      {/* 진행률 */}
      <div className="checklist-progress">
        <div className="progress-top">
          <span className="progress-label">{TEMPLATES[templateKey].desc}</span>
          <span className="progress-count">{doneCount}/{totalCount}</span>
        </div>
        <div className="progress-bar-wrap">
          <div className="progress-bar-fill" style={{
            width: `${progress}%`,
            background: progress===100 ? '#34C759' : progress>=60 ? '#FFCC00' : '#5856D6'
          }} />
        </div>
        <div className="progress-pct">{progress}%</div>
      </div>

      {/* 임장일 */}
      <div className="visit-date-row">
        <label className="visit-date-label">임장일</label>
        <input type="date" className="visit-date-input" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
      </div>

      {/* 카테고리 탭 */}
      <div className="checklist-tabs">
        <button className={`checklist-tab ${activeCategory==='전체'?'active':''}`} onClick={() => setActiveCategory('전체')}>전체</button>
        {categories.map((cat) => {
          const { done, total } = getCategoryProgress(cat)
          return (
            <button key={cat} className={`checklist-tab ${activeCategory===cat?'active':''}`} onClick={() => setActiveCategory(cat)}>
              {CATEGORY_ICONS[cat] || '📌'} {cat}
              <span className="tab-badge">{done}/{total}</span>
            </button>
          )
        })}
      </div>

      {/* 체크리스트 */}
      <div className="checklist-body">
        {categories
          .filter((cat) => activeCategory==='전체' || activeCategory===cat)
          .map((cat) => {
            const items = filtered.filter((c) => c.category === cat)
            if (!items.length) return null
            return (
              <div key={cat} className="checklist-group">
                <div className="checklist-group-title">{CATEGORY_ICONS[cat] || '📌'} {cat}</div>
                {items.map((item) => (
                  <div key={item.id} className={`checklist-item ${item.done?'done':''}`} onClick={() => toggleItem(item.id)}>
                    <div className={`check-box ${item.done?'checked':''}`}>{item.done && '✓'}</div>
                    <span className="check-text">{item.text}</span>
                  </div>
                ))}
              </div>
            )
          })}

        <div className="checklist-group">
          <div className="checklist-group-title">📝 임장 메모</div>
          <textarea className="textarea" rows={4} value={visitMemo}
            onChange={(e) => setVisitMemo(e.target.value)}
            placeholder="직접 방문 후 느낀 점, 특이사항, 추가 확인 필요 사항 등" style={{ margin: '8px 0' }} />
        </div>
      </div>

      <div className="checklist-footer">
        <button className="btn-save" onClick={handleSave} disabled={saving}>
          {saved ? '✓ 저장 완료!' : saving ? '저장 중...' : '💾 체크리스트 저장'}
        </button>
      </div>
    </div>
  )
}
