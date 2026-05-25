const STATUS_LABELS = {
  watching: '관심',
  checking: '확인중',
  hold: '보류',
}

export default function BuildingList({ buildings = [], selectedId, onSelect, onAdd }) {
  if (buildings.length === 0) {
    return (
      <div className="empty-state compact">
        <div className="empty-icon">🏢</div>
        <p className="empty-title">관심 건물이 없어요</p>
        <p className="empty-sub">메디컬 빌딩, 상가, 임대 후보를<br />따로 저장해 추적하세요</p>
        <button className="sidebar-inline-btn" onClick={onAdd}>건물 저장</button>
      </div>
    )
  }

  return (
    <div className="spot-list">
      <div className="spot-count">메디컬 빌딩 {buildings.length}개</div>
      {buildings.map((building) => (
        <button
          key={building.id}
          className={`saved-sidebar-card building ${selectedId === building.id ? 'selected' : ''}`}
          onClick={() => onSelect(building)}
        >
          <div>
            <strong>{building.name || '이름 없음'}</strong>
            <span>{STATUS_LABELS[building.status] || '관심'} · {building.floor || building.area || '조건 미입력'}</span>
            <p>{building.address || building.memo || '주소/메모 미입력'}</p>
          </div>
        </button>
      ))}
    </div>
  )
}
