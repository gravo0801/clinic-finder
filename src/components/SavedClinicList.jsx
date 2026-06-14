const isDue = (clinic) => {
  if (!clinic.autoCheck?.enabled) return false
  const interval = Number(clinic.autoCheck?.intervalDays || 30)
  const last = clinic.lastCheckedAt || clinic.generatedAt || clinic.updatedAt || clinic.savedAt
  const lastDate = last?.seconds ? new Date(last.seconds * 1000) : last ? new Date(last) : null
  if (!lastDate || Number.isNaN(lastDate.getTime())) return true
  return Date.now() - lastDate.getTime() >= interval * 24 * 60 * 60 * 1000
}

const formatSavedDate = (clinic) => {
  const value = clinic.lastCheckedAt || clinic.generatedAt || clinic.updatedAt || clinic.savedAt
  if (!value) return ''
  const date = value.seconds ? new Date(value.seconds * 1000) : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })
}

export default function SavedClinicList({ clinics = [], selectedId, onSelect, onSearch }) {
  if (clinics.length === 0) {
    return (
      <div className="empty-state compact">
        <div className="empty-icon">🏥</div>
        <p className="empty-title">즐겨찾기 의원이 없어요</p>
        <p className="empty-sub">의원 검색 또는 주변 의료기관에서 저장하면<br />지도와 추적 목록에 표시됩니다</p>
        <button className="sidebar-inline-btn" onClick={onSearch}>의원 검색</button>
      </div>
    )
  }

  return (
    <div className="spot-list">
      <div className="spot-count">즐겨찾기/추적 의원 {clinics.length}개</div>
      {clinics.map((clinic) => (
        <button
          key={clinic.id}
          className={`saved-sidebar-card ${selectedId === clinic.id ? 'selected' : ''}`}
          onClick={() => onSelect(clinic)}
        >
          <div>
            <strong>{clinic.name || '이름 없음'}</strong>
            <span>{clinic.dept || clinic.type || '진료과목 미확인'}</span>
            <p>{clinic.address || '주소 미확인'}</p>
            {formatSavedDate(clinic) && <small>최근 기록 {formatSavedDate(clinic)}</small>}
          </div>
          {isDue(clinic) && <em>업데이트 필요</em>}
        </button>
      ))}
    </div>
  )
}
