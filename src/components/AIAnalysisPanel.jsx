import { useState, useEffect } from 'react'
import { spotSubcollection } from '../firebase'
import { addDoc, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { authorizedFetch } from '../utils/authorizedFetch'

const AI_CACHE_TTL_DAYS = Number(import.meta.env.VITE_AI_CACHE_TTL_DAYS || 14)

const parseTime = (value) => {
  if (!value) return null
  const date = value.seconds ? new Date(value.seconds * 1000) : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const isFresh = (value) => {
  const date = parseTime(value)
  if (!date) return false
  return Date.now() - date.getTime() < AI_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000
}

function ScoreGauge({ score, grade }) {
  const color = score>=80?'#34C759':score>=60?'#FFCC00':score>=40?'#FF9500':'#FF3B30'
  return (
    <div className="score-gauge">
      <div className="score-circle" style={{ borderColor: color }}>
        <span className="score-num" style={{ color }}>{score}</span>
        <span className="score-unit">점</span>
      </div>
      <div style={{ flex: 1 }}>
        <div className="score-label" style={{ color }}>{grade}</div>
        <div className="score-bar-wrap">
          <div className="score-bar" style={{ width: `${score}%`, background: color }} />
        </div>
      </div>
    </div>
  )
}

function ResultCard({ result }) {
  return (
    <div className="ai-result">
      <ScoreGauge score={result.score} grade={result.grade} />

      <div className="ai-summary">{result.summary}</div>

      <div className="ai-grid">
        <div className="ai-section strength">
          <div className="ai-section-title">💪 강점</div>
          {result.strengths?.map((s, i) => <div key={i} className="ai-bullet"><span className="ai-bullet-dot">▸</span><span>{s}</span></div>)}
        </div>
        <div className="ai-section weakness">
          <div className="ai-section-title">⚠️ 약점</div>
          {result.weaknesses?.map((w, i) => <div key={i} className="ai-bullet"><span className="ai-bullet-dot">▸</span><span>{w}</span></div>)}
        </div>
      </div>

      <div className="ai-section">
        <div className="ai-section-title">🏥 경쟁 환경</div>
        <p className="ai-text">{result.competitor_analysis}</p>
      </div>

      <div className="ai-section">
        <div className="ai-section-title">🔬 내시경 클리닉 적합성</div>
        <p className="ai-text">{result.endoscopy_fit}</p>
      </div>

      <div className="ai-section">
        <div className="ai-section-title">🎗️ 종양내과 협업 적합성</div>
        <p className="ai-text">{result.oncology_fit}</p>
      </div>

      <div className="ai-section">
        <div className="ai-section-title">💊 추천 진료과목 믹스</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:6 }}>
          {result.recommended_specialties?.map((s, i) => (
            <span key={i} style={{ background:'#f0f0ff', color:'#5856D6', border:'1px solid #d0d4f0', borderRadius:6, padding:'3px 10px', fontSize:12 }}>{s}</span>
          ))}
        </div>
      </div>

      <div className="ai-section">
        <div className="ai-section-title">📋 임장 시 중점 확인사항</div>
        {result.checkpoints?.map((c, i) => (
          <div key={i} className="ai-bullet"><span className="ai-bullet-dot" style={{ color:'#FF9500' }}>✓</span><span>{c}</span></div>
        ))}
      </div>
    </div>
  )
}

export default function AIAnalysisPanel({ spot, nearbyClinics = [], onClose }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)

  // 분석 히스토리 구독
  useEffect(() => {
    if (!spot?.id) return
    let unsub = null
    let mounted = true

    spotSubcollection(spot.id, 'analyses').then((analysesCol) => {
      if (!mounted) return
      const q = query(analysesCol, orderBy('createdAt', 'desc'))
      unsub = onSnapshot(q, (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setHistory(items)
        // 최신 분석 자동 로드
        if (items.length > 0 && !result) setResult(items[0].result)
      })
    })

    return () => {
      mounted = false
      if (unsub) unsub()
    }
  }, [spot?.id])

  const handleAnalyze = async () => {
    const latest = history[0]
    if (latest?.result && isFresh(latest.createdAt)) {
      setResult(latest.result)
      setError(null)
      setNotice(`최근 ${AI_CACHE_TTL_DAYS}일 이내 분석이 있어 저장 결과를 재사용했습니다.`)
      return
    }

    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const res = await authorizedFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spot, nearbyClinics }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      // Firebase에 저장
      await addDoc(await spotSubcollection(spot.id, 'analyses'), {
        result: data.result,
        createdAt: serverTimestamp(),
        competitorCount: nearbyClinics.filter((c) => c.isCompetitor).length,
        aiProvider: data.aiProvider || '',
        aiModel: data.aiModel || '',
      })
      setResult(data.result)
      setNotice(data.aiProvider ? `${data.aiProvider} 분석 결과를 저장했습니다.` : null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (ts) => {
    if (!ts?.seconds) return ''
    return new Date(ts.seconds * 1000).toLocaleDateString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="ai-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">🤖 AI 입지 분석</h2>
          <p className="panel-coords">{spot?.name}</p>
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
            <span className={`ai-data-status ${nearbyClinics.length>0?'ok':'missing'}`}>
              {nearbyClinics.length>0 ? `${nearbyClinics.length}개` : '미수집'}
            </span>
          </div>
          <div className="ai-data-item">
            <span className="ai-data-icon">📊</span>
            <span className="ai-data-label">분석 히스토리</span>
            <span className="ai-data-status ok">{history.length}회</span>
          </div>
        </div>

        {nearbyClinics.length === 0 && (
          <div className="ai-notice">💡 주변 의원 검색 후 분석하면 더 정확한 경쟁 분석이 가능합니다.</div>
        )}

        {/* 히스토리 */}
        {history.length > 1 && (
          <div className="ai-history-row">
            <button className="ai-history-toggle" onClick={() => setShowHistory(!showHistory)}>
              📅 이전 분석 {history.length}개 {showHistory ? '▲' : '▼'}
            </button>
          </div>
        )}
        {showHistory && (
          <div className="ai-history-list">
            {history.map((h) => (
              <button key={h.id} className="ai-history-item"
                onClick={() => { setResult(h.result); setShowHistory(false) }}>
                <span className="ai-history-score" style={{ color: h.result?.score>=70?'#34C759':'#FF9500' }}>
                  {h.result?.score}점
                </span>
                <span className="ai-history-date">{formatDate(h.createdAt)}</span>
                <span className="ai-history-comp">경쟁의원 {h.competitorCount}개</span>
              </button>
            ))}
          </div>
        )}

        {/* 분석 버튼 */}
        {!loading && (
          <button className="btn-analyze" onClick={handleAnalyze}>
            {result ? '🔄 재분석하기' : '✨ AI 입지 분석 시작'}
          </button>
        )}

        {loading && (
          <div className="ai-loading">
            <div className="ai-loading-dots"><span /><span /><span /></div>
            <p>AI가 입지를 분석 중입니다...</p>
            <p className="ai-loading-sub">보통 10~20초 소요됩니다</p>
          </div>
        )}

        {error && (
          <div className="ai-error">
            <p>⚠️ {error}</p>
            <button onClick={handleAnalyze} className="retry-btn">다시 시도</button>
          </div>
        )}

        {notice && !error && <div className="ai-cache-note">{notice}</div>}

        {result && !loading && <ResultCard result={result} />}
      </div>
    </div>
  )
}
