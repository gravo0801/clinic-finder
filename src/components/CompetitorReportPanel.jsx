import { useEffect, useState } from 'react'
import { saveCompetitorReport, subscribeCompetitorReport } from '../firebase'

const MANUAL_DEFAULTS = {
  reviewCount: '',
  rating: '',
  positiveKeywords: '',
  negativeKeywords: '',
  reviewLink: '',
  website: '',
  doctorProfileMemo: '',
  legalIssueMemo: '',
}

const SOURCE_LABELS = {
  detail: '세부',
  departments: '진료과',
  facility: '시설',
  medicalEquipment: '장비',
  specialists: '전문의',
  personnel: '인력',
  specialCare: '특수진료',
  topDiseases: '상위질병',
  openClose: '개폐업',
  falseClaim: '거짓청구',
  naverLocal: '지역검색',
  naverBlog: '블로그',
  naverNews: '뉴스',
  naverIssue: '이슈검색',
}

const SOURCE_TEXT = {
  ok: '수신',
  empty: '없음',
  error: '오류',
  missing_key: '키 없음',
  blocked: '불가',
  pending: '대기',
}

const scoreTone = (value) => (value >= 75 ? 'good' : value >= 45 ? 'mid' : 'low')
const collisionTone = (value) => (value >= 70 ? 'low' : value >= 45 ? 'mid' : 'good')

const formatDate = (timestamp) => {
  if (!timestamp) return ''
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleString('ko-KR')
  if (typeof timestamp === 'string') return new Date(timestamp).toLocaleString('ko-KR')
  return ''
}

const mergeManual = (manualReview) => ({ ...MANUAL_DEFAULTS, ...(manualReview || {}) })

function SourceBadges({ sources = {} }) {
  return (
    <div className="competitor-source-badges">
      {Object.entries(SOURCE_LABELS).map(([key, label]) => {
        const status = sources[key]?.status || 'pending'
        return (
          <span key={key} className={`source-badge ${status}`} title={sources[key]?.message || ''}>
            {label} {SOURCE_TEXT[status] || status}
          </span>
        )
      })}
    </div>
  )
}

function MetricCard({ label, value, sub, tone = 'mid' }) {
  return (
    <div className={`competitor-metric ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  )
}

function TextList({ items = [], empty = '표시할 정보가 아직 없습니다.' }) {
  const visible = items.filter(Boolean)
  if (!visible.length) return <p className="competitor-empty-text">{empty}</p>
  return (
    <div className="competitor-bullets">
      {visible.map((item, index) => (
        <p key={`${item}-${index}`}>{item}</p>
      ))}
    </div>
  )
}

function SearchPreview({ label, data }) {
  if (!data || data.status === 'missing_key') {
    return <div className="competitor-search-preview"><b>{label}</b><span>검색 키 없음</span></div>
  }
  if (data.status === 'error') {
    return <div className="competitor-search-preview"><b>{label}</b><span>검색 오류</span></div>
  }
  return (
    <div className="competitor-search-preview">
      <b>{label}</b>
      <span>총 {Number(data.total || 0).toLocaleString()}건</span>
      {data.items?.slice(0, 2).map((item, index) => (
        <a key={`${item.link}-${index}`} href={item.link} target="_blank" rel="noreferrer">
          {item.title || item.description || item.link}
        </a>
      ))}
    </div>
  )
}

function OfficialSummary({ data }) {
  const departments = data?.departments || []
  const topDiseases = data?.topDiseases || []
  const equipment = [
    ...(data?.medicalEquipment || []).map((item) => item.oftCdNm || item.eqpCdNm).filter(Boolean),
    ...(data?.facility || []).map((item) => item.eqpTypCdNm).filter(Boolean),
  ]
  const specialists = (data?.specialists || [])
    .map((item) => `${item.dgsbjtCdNm || '전문의'} ${item.sdrCnt || item.spcSbjtSdrCnt || '?'}명`)
  const personnel = (data?.personnel || [])
    .map((item) => `${item.etcHstCdNm || '기타인력'} ${item.etcHstCnt || item.nrsCnt || item.nrsaCnt || '?'}명`)
  const openClose = (data?.openClose || [])
    .slice(0, 3)
    .map((item) => `${item.crtrYm || ''} ${item.opCloTpNm || item.opCloTp || ''} ${item.addr || ''}`.trim())

  return (
    <div className="competitor-fact-grid">
      <div>
        <span>진료과</span>
        <p>{departments.slice(0, 5).join(' · ') || '자료 없음'}</p>
      </div>
      <div>
        <span>상위 질병</span>
        <p>{topDiseases.join(' · ') || '자료 없음'}</p>
      </div>
      <div>
        <span>장비/시설</span>
        <p>{equipment.slice(0, 6).join(' · ') || '자료 없음'}</p>
      </div>
      <div>
        <span>전문의/인력</span>
        <p>{[...specialists, ...personnel].slice(0, 5).join(' · ') || '자료 없음'}</p>
      </div>
      <div>
        <span>개폐업</span>
        <p>{openClose.join(' · ') || '최근 13개월 개폐업 이력 없음 또는 자료 없음'}</p>
      </div>
      <div>
        <span>거짓청구 공표</span>
        <p>{data?.falseClaim?.note || '자료 없음'}</p>
      </div>
    </div>
  )
}

export default function CompetitorReportPanel({ spot, clinic, onClose }) {
  const [savedReport, setSavedReport] = useState(null)
  const [manualReview, setManualReview] = useState(MANUAL_DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!spot?.id || !clinic?.id) return undefined
    return subscribeCompetitorReport(spot.id, clinic.id, (report) => {
      setSavedReport(report)
      if (report?.manualReview) setManualReview(mergeManual(report.manualReview))
    })
  }, [spot?.id, clinic?.id])

  const current = savedReport || {}
  const ai = current.aiResult
  const officialData = current.officialData
  const webSignals = current.webSignals || {}

  const setField = (key, value) => {
    setManualReview((prev) => ({ ...prev, [key]: value }))
  }

  const buildBaseReport = () => ({
    clinic: {
      id: clinic.id,
      name: clinic.name || '',
      type: clinic.type || '',
      dept: clinic.dept || '',
      address: clinic.address || '',
      tel: clinic.tel || '',
      lat: clinic.lat ?? null,
      lng: clinic.lng ?? null,
      distance: clinic.distance ?? null,
      isCompetitor: !!clinic.isCompetitor,
    },
    manualReview,
  })

  const handleSaveManual = async () => {
    if (!spot?.id || !clinic?.id) return
    setSaving(true)
    setError(null)
    try {
      await saveCompetitorReport(spot.id, clinic.id, {
        ...current,
        ...buildBaseReport(),
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleAnalyze = async () => {
    if (!spot?.id || !clinic?.id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spot, clinic, manualReview }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || '경쟁 의원 리포트를 생성하지 못했습니다.')
      await saveCompetitorReport(spot.id, clinic.id, data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="competitor-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">경쟁 의원 리포트</h2>
          <p className="panel-coords">{clinic?.name} · {clinic?.distance ? `${clinic.distance}m` : '거리 미확인'}</p>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="panel-body">
        <div className="competitor-clinic-card">
          <div>
            <strong>{clinic?.name}</strong>
            <p>{clinic?.type || '의료기관'} · {clinic?.dept || '진료과목 미확인'}</p>
            <p>{clinic?.address || '주소 미확인'}</p>
          </div>
          {clinic?.tel && <a href={`tel:${clinic.tel}`}>{clinic.tel}</a>}
        </div>

        {ai && (
          <div className="competitor-score-grid">
            <MetricCard
              label="표면 경쟁력"
              value={`${ai.competitorStrength ?? '-'}점`}
              sub="AI 추정"
              tone={scoreTone(ai.competitorStrength || 0)}
            />
            <MetricCard
              label="우리와 충돌도"
              value={`${ai.collisionScore ?? '-'}점`}
              sub="높을수록 직접 경쟁"
              tone={collisionTone(ai.collisionScore || 0)}
            />
            <MetricCard
              label="매출 잠재력"
              value={ai.revenuePotential || '판단보류'}
              sub="절대 매출 아님"
              tone={ai.revenuePotential === '높음' ? 'good' : ai.revenuePotential === '낮음' ? 'low' : 'mid'}
            />
            <MetricCard
              label="신뢰도"
              value={`${ai.confidence ?? '-'}%`}
              sub="입력/소스 충족률"
              tone={scoreTone(ai.confidence || 0)}
            />
          </div>
        )}

        <div className="competitor-notice">
          실제 매출, 의사 실력, 내부 직원 수준은 공개 자료로 단정하지 않습니다. 이 리포트는 공개 신호와 수동 입력값 기반의 경쟁 강도 추정입니다.
        </div>

        <div className="competitor-section">
          <div className="competitor-section-title">
            <span>평판 단서 수동 입력</span>
            <small>리뷰 본문 자동 수집 제외</small>
          </div>
          <div className="competitor-form-grid">
            <label>
              <span>리뷰 수</span>
              <input className="business-input" inputMode="numeric" value={manualReview.reviewCount} onChange={(event) => setField('reviewCount', event.target.value)} placeholder="예: 450" />
            </label>
            <label>
              <span>평점</span>
              <input className="business-input" inputMode="decimal" value={manualReview.rating} onChange={(event) => setField('rating', event.target.value)} placeholder="예: 4.6" />
            </label>
            <label className="full">
              <span>긍정 키워드</span>
              <input className="business-input" value={manualReview.positiveKeywords} onChange={(event) => setField('positiveKeywords', event.target.value)} placeholder="친절, 대기 짧음, 설명 자세함" />
            </label>
            <label className="full">
              <span>부정 키워드</span>
              <input className="business-input" value={manualReview.negativeKeywords} onChange={(event) => setField('negativeKeywords', event.target.value)} placeholder="대기 길다, 불친절, 과잉진료 의심" />
            </label>
            <label className="full">
              <span>리뷰 링크</span>
              <input className="business-input" value={manualReview.reviewLink} onChange={(event) => setField('reviewLink', event.target.value)} placeholder="네이버/카카오/구글 리뷰 페이지 URL" />
            </label>
            <label className="full">
              <span>홈페이지/블로그</span>
              <input className="business-input" value={manualReview.website} onChange={(event) => setField('website', event.target.value)} placeholder="공식 홈페이지 또는 블로그 URL" />
            </label>
            <label className="full">
              <span>원장 약력 메모</span>
              <textarea className="business-textarea" value={manualReview.doctorProfileMemo} onChange={(event) => setField('doctorProfileMemo', event.target.value)} placeholder="전문의, 학력, 경력, 인증, 주요 진료 분야 등" />
            </label>
            <label className="full">
              <span>법적/행정 이슈 메모</span>
              <textarea className="business-textarea" value={manualReview.legalIssueMemo} onChange={(event) => setField('legalIssueMemo', event.target.value)} placeholder="뉴스, 공표자료, 소송/행정처분 의심 단서 등" />
            </label>
          </div>
          <div className="competitor-actions">
            <button className="btn-reanalyze" onClick={handleSaveManual} disabled={saving || loading}>
              {saving ? '저장 중...' : '수동 입력 저장'}
            </button>
            <button className="btn-analyze" onClick={handleAnalyze} disabled={loading || saving}>
              {loading ? '리포트 생성 중...' : ai ? '경쟁 리포트 재생성' : '경쟁 리포트 생성'}
            </button>
          </div>
          {error && <div className="ai-error"><p>{error}</p></div>}
        </div>

        {current.sources && (
          <div className="competitor-section">
            <div className="competitor-section-title">
              <span>공식 정보</span>
              <small>사실 데이터</small>
            </div>
            <SourceBadges sources={current.sources} />
            <OfficialSummary data={officialData} />
          </div>
        )}

        {webSignals && (webSignals.local || webSignals.blog || webSignals.news) && (
          <div className="competitor-section">
            <div className="competitor-section-title">
              <span>웹 평판 단서</span>
              <small>자동 리뷰 수집 아님</small>
            </div>
            <div className="competitor-search-grid">
              <SearchPreview label="지역 검색" data={webSignals.local} />
              <SearchPreview label="블로그 언급" data={webSignals.blog} />
              <SearchPreview label="뉴스 언급" data={webSignals.news} />
              <SearchPreview label="이슈 검색" data={webSignals.issue} />
            </div>
          </div>
        )}

        {ai && (
          <>
            <div className="competitor-section">
              <div className="competitor-section-title">
                <span>AI 경쟁력 분석</span>
                <small>추정</small>
              </div>
              <div className="competitor-ai-summary">{ai.summary}</div>
              <div className="competitor-breakdown">
                {Object.entries(ai.breakdown || {}).map(([key, value]) => (
                  <div key={key}>
                    <span>{{
                      medical: '의료역량',
                      patientPull: '환자흡입',
                      profit: '수익진료',
                      marketing: '마케팅',
                      stability: '안정성',
                    }[key] || key}</span>
                    <b>{value}</b>
                  </div>
                ))}
              </div>
            </div>

            <div className="competitor-section">
              <div className="competitor-section-title">
                <span>강점과 리스크</span>
                <small>AI 추정</small>
              </div>
              <div className="ai-grid">
                <div className="ai-section strength">
                  <div className="ai-section-title">강점</div>
                  <TextList items={ai.strengths} />
                </div>
                <div className="ai-section weakness">
                  <div className="ai-section-title">리스크</div>
                  <TextList items={ai.risks} />
                </div>
              </div>
            </div>

            <div className="competitor-section">
              <div className="competitor-section-title">
                <span>우리 의원과 겹침</span>
                <small>충돌도 근거</small>
              </div>
              <TextList items={ai.overlap} />
            </div>

            <div className="competitor-section">
              <div className="competitor-section-title">
                <span>확인 필요</span>
                <small>임장/수동 확인</small>
              </div>
              <TextList items={ai.checkItems} />
            </div>

            <div className="competitor-section">
              <div className="competitor-section-title">
                <span>출처 요약</span>
                <small>{ai.aiNote || '분석 메모'}</small>
              </div>
              <TextList items={ai.sourceSummary} />
              {(current.updatedAt || current.generatedAt) && (
                <div className="competitor-updated">
                  마지막 갱신: {formatDate(current.updatedAt) || formatDate(current.generatedAt)}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
