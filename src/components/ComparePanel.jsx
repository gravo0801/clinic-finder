import { useMemo, useState } from 'react'
import { calculateLocationScore } from '../utils/locationScore'
import { calculateAvoidanceScore } from '../utils/avoidanceScore'

const RATING_LABEL = ['미평가', '검토필요', '보통', '양호', '우수', '최우수']
const scoreTone = (value) => (value >= 75 ? 'good' : value >= 45 ? 'mid' : 'low')

const getChecklistStats = (spot) => {
  const total = spot.checklist?.length || 0
  const done = spot.checklist?.filter((item) => item.done).length || 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return { done, total, pct }
}

const getReadinessScore = (spot) => {
  const checklist = getChecklistStats(spot)
  const ratingScore = (spot.rating || 0) * 14
  const checklistScore = checklist.total > 0 ? checklist.pct * 0.2 : 0
  const memoScore = spot.memo ? 5 : 0
  const visitScore = spot.visitDate ? 5 : 0
  return Math.round(Math.min(100, ratingScore + checklistScore + memoScore + visitScore))
}

const SORT_OPTIONS = [
  { key: 'readiness', label: '검토 완성도' },
  { key: 'adjustedScore', label: '감점 후 점수' },
  { key: 'avoidancePenalty', label: '회피 리스크' },
  { key: 'locationScore', label: '기존 입지' },
  { key: 'confidence', label: '신뢰도' },
  { key: 'rating', label: '입지 평점' },
  { key: 'checklist', label: '임장 진행률' },
  { key: 'name', label: '이름' },
]

export default function ComparePanel({ spots, onClose, onSelect }) {
  const [sortKey, setSortKey] = useState('readiness')

  const rows = useMemo(() => {
    return [...spots]
      .map((spot) => ({
        spot,
        checklist: getChecklistStats(spot),
        readiness: getReadinessScore(spot),
        locationScore: calculateLocationScore(spot),
        avoidance: calculateAvoidanceScore(spot),
      }))
      .sort((a, b) => {
        if (sortKey === 'name') return (a.spot.name || '').localeCompare(b.spot.name || '')
        if (sortKey === 'rating') return (b.spot.rating || 0) - (a.spot.rating || 0)
        if (sortKey === 'checklist') return b.checklist.pct - a.checklist.pct
        if (sortKey === 'locationScore') return b.locationScore.total - a.locationScore.total
        if (sortKey === 'adjustedScore') return b.avoidance.adjustedScore - a.avoidance.adjustedScore
        if (sortKey === 'avoidancePenalty') return b.avoidance.penalty - a.avoidance.penalty
        if (sortKey === 'confidence') return b.locationScore.confidence - a.locationScore.confidence
        return b.readiness - a.readiness
      })
  }, [spots, sortKey])

  const averageLocationScore = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.avoidance.adjustedScore, 0) / rows.length)
    : 0
  const averagePenalty = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.avoidance.penalty, 0) / rows.length)
    : 0
  const averageConfidence = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.locationScore.confidence, 0) / rows.length)
    : 0
  const averageReadiness = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.readiness, 0) / rows.length)
    : 0
  const visitedCount = spots.filter((spot) => spot.visitDate).length
  const checkedCount = spots.filter((spot) => (spot.checklist?.length || 0) > 0).length

  return (
    <div className="compare-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">후보지 비교</h2>
          <p className="panel-coords">입지 점수, 신뢰도, 임장 진행률, 기록 상태를 한눈에 비교합니다</p>
        </div>
        <button className="close-btn" onClick={onClose}>x</button>
      </div>

      <div className="compare-summary">
        <div className="compare-stat">
          <span className="compare-stat-num">{spots.length}</span>
          <span className="compare-stat-label">후보지</span>
        </div>
        <div className="compare-stat">
          <span className="compare-stat-num">{averageReadiness}</span>
          <span className="compare-stat-label">평균 완성도</span>
        </div>
        <div className="compare-stat">
          <span className="compare-stat-num">{averageLocationScore}</span>
          <span className="compare-stat-label">평균 최종</span>
        </div>
        <div className="compare-stat">
          <span className="compare-stat-num">-{averagePenalty}</span>
          <span className="compare-stat-label">평균 감점</span>
        </div>
        <div className="compare-stat">
          <span className="compare-stat-num">{averageConfidence}%</span>
          <span className="compare-stat-label">평균 신뢰도</span>
        </div>
        <div className="compare-stat">
          <span className="compare-stat-num">{visitedCount}</span>
          <span className="compare-stat-label">임장일 기록</span>
        </div>
        <div className="compare-stat">
          <span className="compare-stat-num">{checkedCount}</span>
          <span className="compare-stat-label">체크리스트</span>
        </div>
      </div>

      <div className="compare-toolbar">
        <span className="compare-toolbar-label">정렬</span>
        <div className="compare-sort">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.key}
              className={`compare-sort-btn ${sortKey === option.key ? 'active' : ''}`}
              onClick={() => setSortKey(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="compare-body">
        {rows.length === 0 ? (
          <div className="compare-empty">
            <div className="empty-icon">📊</div>
            <p className="empty-title">비교할 후보지가 없습니다</p>
            <p className="empty-sub">지도에서 후보지를 추가하면 비교표가 채워집니다</p>
          </div>
        ) : (
          <table className="compare-table">
            <thead>
              <tr>
                <th>후보지</th>
                <th>최종</th>
                <th>회피</th>
                <th>신뢰도</th>
                <th>임장</th>
                <th>완성도</th>
                <th>기록</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ spot, checklist, readiness, locationScore, avoidance }) => (
                <tr key={spot.id} onClick={() => onSelect(spot)}>
                  <td>
                    <div className="compare-name">{spot.name || '이름 없음'}</div>
                    <div className="compare-address">{spot.address || '주소 미입력'}</div>
                    <div className="compare-rating-inline">평점 {spot.rating || 0} · {RATING_LABEL[spot.rating || 0]}</div>
                    {spot.tags?.length > 0 && (
                      <div className="compare-tags">
                        {spot.tags.slice(0, 3).map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`score-pill ${scoreTone(avoidance.adjustedScore)}`}>{avoidance.adjustedScore}</span>
                    <div className="compare-cell-note">
                      기존 {locationScore.total} · 감점 -{avoidance.penalty}
                    </div>
                  </td>
                  <td>
                    <span className={`avoidance-pill ${avoidance.level.key}`}>{avoidance.level.label}</span>
                    <div className="compare-cell-note">
                      {avoidance.rules[0]?.label || '큰 리스크 없음'}
                    </div>
                  </td>
                  <td>
                    <span className={`confidence-pill ${scoreTone(locationScore.confidence)}`}>
                      {locationScore.confidence}%
                    </span>
                    <div className="compare-cell-note">
                      {locationScore.missingInputs.length > 0
                        ? `미입력 ${locationScore.missingInputs.length}개`
                        : '입력 완료'}
                    </div>
                  </td>
                  <td>
                    <div className="compare-progress">
                      <div className="compare-progress-bar" style={{ width: `${checklist.pct}%` }} />
                    </div>
                    <div className="compare-muted">{checklist.done}/{checklist.total || 0}</div>
                  </td>
                  <td>
                    <span className={`readiness-pill ${readiness >= 75 ? 'good' : readiness >= 45 ? 'mid' : 'low'}`}>
                      {readiness}
                    </span>
                  </td>
                  <td>
                    <div className="compare-records">
                      <span className={spot.visitDate ? 'on' : ''}>임장일</span>
                      <span className={spot.memo ? 'on' : ''}>메모</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
