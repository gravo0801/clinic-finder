import { useState } from 'react'

// 마크다운 파싱 (굵은 글씨, 항목)
function parseMarkdown(text) {
  return text
    .split('\n')
    .map((line, i) => {
      // ## 헤더
      if (line.startsWith('## ')) {
        return <h3 key={i} className="ai-section-title">{line.replace('## ', '')}</h3>
      }
      // **굵은 제목**
      if (/^\*\*(.+)\*\*/.test(line)) {
        const title = line.replace(/^\*\*(.+)\*\*.*/, '$1')
        const rest = line.replace(/^\*\*(.+)\*\*/, '').trim()
        return (
          <div key={i} className="ai-section-header">
            <strong>{title}</strong>
            {rest && <span> {rest}</span>}
          </div>
        )
      }
      // bullet
      if (line.startsWith('- ') || line.startsWith('• ')) {
        const content = line.replace(/^[-•] /, '')
        return (
          <div key={i} className="ai-bullet">
            <span className="ai-bullet-dot">▸</span>
            <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
          </div>
        )
      }
      // 번호 목록
      if (/^\d+\.\s/.test(line)) {
        const content = line.replace(/^\d+\.\s/, '')
        return (
          <div key={i} className="ai-numbered">
            <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
          </div>
        )
      }
      // 빈 줄
      if (!line.trim()) return <div key={i} className="ai-spacer" />
      // 일반 텍스트
      return (
        <p key={i} className="ai-text"
          dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }}
        />
      )
    })
}

// 점수 추출
function extractScore(text) {
  const match = text.match(/(\d{1,3})\s*[점\/]?\s*(100점|점|\/100)?/)
  if (!match) return null
  const score = parseInt(match[1])
  return score >= 0 && score <= 100 ? score : null
}

function ScoreGauge({ score }) {
  const color =
    score >= 80 ? '#34C759' :
    score >= 60 ? '#FFCC00' :
    score >= 40 ? '#FF9500' : '#FF3B30'
  const label =
    score >= 80 ? '개원 강력 추천' :
    score >= 60 ? '개원 검토 가능' :
    score >= 40 ? '추가 검토 필요' : '개원 비추천'

  return (
    <div className="score-gauge">
      <div className="score-circle" style={{ borderColor: color }}>
        <span className="score-num" style={{ color }}>{score}</span>
        <span className="score-unit">점</span>
      </div>
      <div>
        <div className="score-label" style={{ color }}>{label}</div>
        <div className="score-bar-wrap">
          <div className="score-bar" style={{ width: `${score}%`, background: color }} />
        </div>
      </div>
    </div>
  )
}

export default function AIAnalysisPanel({ spot, nearbyClinics = [], onClose }) {
  const [analysis, setAnalysis] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)
    setAnalysis(null)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spot, nearbyClinics }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAnalysis(data.analysis)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const score = analysis ? extractScore(analysis) : null

  return (
    <div className="ai-panel">
      {/* Header */}
      <div className="panel-header">
        <div>
          <h2 className="panel-title">🤖 AI 입지 분석</h2>
          <p className="panel-coords">{spot?.name || '선택된 스팟'}</p>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="panel-body">
        {/* 데이터 현황 */}
        <div className="ai-data-summary">
          <div className="ai-data-item">
            <span className="ai-data-icon">📍</span>
            <span className="ai-data-label">후보지 정보</span>
            <span className="ai-data-status ok">✓</span>
          </div>
          <div className="ai-data-item">
            <span className="ai-data-icon">🏥</span>
            <span className="ai-data-label">주변 의료기관</span>
            <span className={`ai-data-status ${nearbyClinics.length > 0 ? 'ok' : 'missing'}`}>
              {nearbyClinics.length > 0 ? `${nearbyClinics.length}개` : '미수집'}
            </span>
          </div>
        </div>

        {nearbyClinics.length === 0 && (
          <div className="ai-notice">
            💡 주변 의원 검색 후 분석하면 더 정확한 경쟁 분석이 가능합니다.
            태그·메모 기반으로도 분석은 가능합니다.
          </div>
        )}

        {/* 분석 버튼 */}
        {!analysis && !loading && (
          <button className="btn-analyze" onClick={handleAnalyze}>
            ✨ AI 입지 분석 시작
          </button>
        )}

        {/* 로딩 */}
        {loading && (
          <div className="ai-loading">
            <div className="ai-loading-dots">
              <span /><span /><span />
            </div>
            <p>Claude AI가 입지를 분석 중입니다...</p>
            <p className="ai-loading-sub">보통 10~20초 소요됩니다</p>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="ai-error">
            <p>⚠️ {error}</p>
            <button onClick={handleAnalyze} className="retry-btn">다시 시도</button>
          </div>
        )}

        {/* 결과 */}
        {analysis && (
          <div className="ai-result">
            {score !== null && <ScoreGauge score={score} />}
            <div className="ai-content">{parseMarkdown(analysis)}</div>
            <button
              className="btn-reanalyze"
              onClick={handleAnalyze}
            >
              🔄 재분석
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
