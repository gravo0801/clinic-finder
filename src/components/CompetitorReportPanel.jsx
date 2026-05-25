import { useEffect, useState } from 'react'
import { saveCompetitorReport, saveSavedClinic, subscribeCompetitorReport, subscribeSavedClinic } from '../firebase'

const MANUAL_DEFAULTS = {
  reviewCount: '',
  rating: '',
  positiveKeywords: '',
  negativeKeywords: '',
  reviewLink: '',
  website: '',
  doctorProfileMemo: '',
  legalIssueMemo: '',
  naverAd: 'unknown',
  blogCount: '',
  instagramActive: 'unknown',
  instagramFollowers: '',
  homepageQuality: '',
  youtubeActive: 'unknown',
  mamcafeMention: 'unknown',
  nonInsuredStomachEndoscopy: '',
  nonInsuredColonEndoscopy: '',
  checkupPackagePrice: '',
  ivTherapyPrice: '',
  nonInsuredMemo: '',
  trend2022: '',
  trend2023: '',
  trend2024: '',
  noonPatientCount: '',
  parkingSpots: '',
  parkingType: 'unknown',
  signVisibility: '',
  facilityAge: 'unknown',
  fieldNotes: '',
}

const AUTOCHECK_DEFAULTS = {
  enabled: true,
  intervalDays: 30,
}

const DISCLAIMER_TEXTS = {
  revenue: 'AI 추정값 · 공개 데이터와 저장된 조사 단서 기반 · 실제 매출 금액 아님',
  review: '사용자 직접 입력 · 리뷰 본문 자동 수집 없음',
  score: '표면 신호 기반 추정 · 내부 경영 정보 미반영',
  general: '본 분석은 참고용이며 법적 효력이 없습니다.',
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

const formatPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-'
  return `${Math.round(Number(value) * 1000) / 10}%`
}

const formatDate = (timestamp) => {
  if (!timestamp) return ''
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleString('ko-KR')
  if (typeof timestamp === 'string') return new Date(timestamp).toLocaleString('ko-KR')
  return ''
}

const mergeManual = (manualReview) => ({ ...MANUAL_DEFAULTS, ...(manualReview || {}) })

const parseSavedTime = (timestamp) => {
  if (!timestamp) return null
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000)
  if (typeof timestamp === 'string') {
    const date = new Date(timestamp)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

const getAutoCheckStatus = (report, autoCheck) => {
  if (!autoCheck.enabled) return { label: '자동 체크 꺼짐', due: false, nextText: '직접 업데이트만 사용' }
  const interval = Number(autoCheck.intervalDays || 30)
  const base = parseSavedTime(report.lastCheckedAt || report.generatedAt || report.updatedAt || report.savedAt)
  if (!base) return { label: '업데이트 필요', due: true, nextText: '아직 최신 체크 이력이 없습니다.' }
  const next = new Date(base.getTime() + interval * 24 * 60 * 60 * 1000)
  const due = Date.now() >= next.getTime()
  return {
    label: due ? '업데이트 필요' : '예약됨',
    due,
    nextText: `다음 확인 기준일: ${next.toLocaleDateString('ko-KR')}`,
  }
}

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

function RevenueAnalysis({ data }) {
  if (!data) return null
  const tier2Signals = data.tier2?.signals || []
  return (
    <div className="revenue-analysis-card">
      <div className="revenue-head">
        <div>
          <span>매출 잠재력</span>
          <strong>{data.grade || '판단보류'}</strong>
        </div>
        <b>{data.confidence ?? '-'}%</b>
      </div>
      <div className="revenue-tier-grid">
        <div>
          <span>{data.tier1?.title || 'Tier 1'}</span>
          <strong>{data.tier1?.level || '자료 부족'}</strong>
          <p>{data.tier1?.note || '공식 진료량 데이터가 제한적입니다.'}</p>
        </div>
        <div>
          <span>{data.tier2?.title || 'Tier 2'}</span>
          <strong>비급여 비중 {data.tier2?.shareRange || '판단보류'}</strong>
          <p>{tier2Signals.slice(0, 3).join(' · ') || '비급여 신호 부족'}</p>
        </div>
        <div>
          <span>{data.tier3?.title || 'Tier 3'}</span>
          <strong>{data.tier3?.level || '판단보류'}</strong>
          <p>{data.tier3?.note || '동급 의원 비교 데이터가 더 필요합니다.'}</p>
        </div>
      </div>
      <small>{data.disclaimer || DISCLAIMER_TEXTS.revenue}</small>
    </div>
  )
}

function TrendAnalysis({ data }) {
  if (!data) return null
  const yearly = data.yearly || []
  const max = Math.max(...yearly.map((item) => Number(item.value) || 0), 1)
  return (
    <div className={`trend-card ${data.signal || 'neutral'}`}>
      <div className="trend-head">
        <strong>{data.label || '판단보류'}</strong>
        {data.growthRate !== null && data.growthRate !== undefined && <span>{formatPercent(data.growthRate)}</span>}
      </div>
      <p>{data.summary || '연도별 입력값이 부족합니다.'}</p>
      {yearly.length > 0 && (
        <div className="trend-bars">
          {yearly.map((item) => (
            <div className="trend-row" key={item.year}>
              <span>{item.year}</span>
              <div><i style={{ width: `${Math.max(8, ((Number(item.value) || 0) / max) * 100)}%` }} /></div>
              <b>{Number(item.value || 0).toLocaleString()}</b>
              {item.deltaPct !== null && item.deltaPct !== undefined && <em>{item.deltaPct > 0 ? '+' : ''}{item.deltaPct}%</em>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OpportunityList({ items = [] }) {
  if (!items.length) return <p className="competitor-empty-text">부정 키워드 기반 기회 신호가 아직 없습니다.</p>
  return (
    <div className="opportunity-list">
      {items.map((item) => (
        <div key={item.key || item.label}>
          <strong>{item.label}</strong>
          {item.evidence && <span>근거: {item.evidence}</span>}
          <p>{item.opportunity}</p>
        </div>
      ))}
    </div>
  )
}

function FieldChecklist({ items = [] }) {
  if (!items.length) return <p className="competitor-empty-text">현재 입력 기준 추가 임장 과제는 제한적입니다.</p>
  return (
    <div className="field-check-list">
      {items.map((item, index) => (
        <div key={`${item.task}-${index}`} className={item.priority === 'HIGH' ? 'high' : ''}>
          <b>{item.priority}</b>
          <strong>{item.task}</strong>
          <p>{item.method}</p>
          <small>{item.effect}</small>
        </div>
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
  const [autoCheck, setAutoCheck] = useState(AUTOCHECK_DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const standalone = !spot?.id

  useEffect(() => {
    if (!clinic?.id) return undefined
    const unsubscribe = standalone
      ? subscribeSavedClinic(clinic.id, (report) => {
        setSavedReport(report)
        if (report?.manualReview) setManualReview(mergeManual(report.manualReview))
        if (report?.autoCheck) setAutoCheck({ ...AUTOCHECK_DEFAULTS, ...report.autoCheck })
      })
      : subscribeCompetitorReport(spot.id, clinic.id, (report) => {
        setSavedReport(report)
        if (report?.manualReview) setManualReview(mergeManual(report.manualReview))
        if (report?.autoCheck) setAutoCheck({ ...AUTOCHECK_DEFAULTS, ...report.autoCheck })
      })
    return unsubscribe
  }, [spot?.id, clinic?.id, standalone])

  const current = savedReport || {}
  const ai = current.aiResult
  const officialData = current.officialData
  const webSignals = current.webSignals || {}

  const setAutoCheckField = (key, value) => {
    setAutoCheck((prev) => ({ ...prev, [key]: value }))
  }

  const buildBaseReport = () => ({
    clinic: {
      id: clinic.id,
      hiraId: clinic.hiraId || '',
      source: clinic.source || '',
      name: clinic.name || '',
      type: clinic.type || '',
      dept: clinic.dept || '',
      address: clinic.address || '',
      tel: clinic.tel || '',
      lat: clinic.lat ?? null,
      lng: clinic.lng ?? null,
      distance: clinic.distance ?? null,
      isCompetitor: !!clinic.isCompetitor,
      webLink: clinic.webLink || '',
    },
    manualReview,
    autoCheck,
  })

  const persistReport = async (report) => {
    if (!clinic?.id) return
    if (standalone) {
      await saveSavedClinic({
        ...clinic,
        ...report,
        id: clinic.id,
        name: clinic.name || report.clinic?.name || '',
        type: clinic.type || report.clinic?.type || '',
        dept: clinic.dept || report.clinic?.dept || '',
        address: clinic.address || report.clinic?.address || '',
        tel: clinic.tel || report.clinic?.tel || '',
        lat: clinic.lat ?? report.clinic?.lat ?? null,
        lng: clinic.lng ?? report.clinic?.lng ?? null,
        distance: clinic.distance ?? report.clinic?.distance ?? null,
        markerStyle: clinic.markerStyle || report.markerStyle || { icon: '🏥', color: '#5856D6' },
      })
      return
    }
    await saveCompetitorReport(spot.id, clinic.id, report)
  }

  const handleAnalyze = async () => {
    if (!clinic?.id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/competitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spot: spot || {
            id: 'standalone-clinic-review',
            name: '저장 의원 단독 조사',
            address: clinic.address || '',
            lat: clinic.lat || null,
            lng: clinic.lng || null,
          },
          clinic,
          manualReview,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || '경쟁 의원 리포트를 생성하지 못했습니다.')
      await persistReport({
        ...data,
        manualReview,
        autoCheck,
        lastCheckedAt: data.generatedAt,
      })
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
          <h2 className="panel-title">{standalone ? '저장 의원 리포트' : '경쟁 의원 리포트'}</h2>
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
              tone={['매우 높음', '높음'].includes(ai.revenuePotential) ? 'good' : ai.revenuePotential === '낮음' ? 'low' : 'mid'}
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
          {DISCLAIMER_TEXTS.score} · {DISCLAIMER_TEXTS.general}
        </div>

        {ai && (
          <>
            <div className="competitor-section">
              <div className="competitor-section-title">
                <span>의원 컨셉과 Gravo 충돌도</span>
                <small>룰+AI 추정</small>
              </div>
              <div className="concept-card">
                <div>
                  <span>분류</span>
                  <strong>{ai.clinicConcept?.label || '판단보류'}</strong>
                  <p>{ai.clinicConcept?.summary || '공개 신호만으로 분류가 제한적입니다.'}</p>
                </div>
                <div>
                  <span>충돌 가중치</span>
                  <strong>{ai.clinicConcept?.collisionWeight ?? '-'}</strong>
                  <p>{(ai.clinicConcept?.signals || []).slice(0, 3).join(' · ') || '주요 신호 부족'}</p>
                </div>
              </div>
            </div>

            <div className="competitor-section">
              <div className="competitor-section-title">
                <span>매출 잠재력 분석</span>
                <small>금액 미표시</small>
              </div>
              <RevenueAnalysis data={ai.revenueAnalysis} />
            </div>

            <div className="competitor-section">
              <div className="competitor-section-title">
                <span>마케팅 집약도와 트렌드</span>
                <small>공개 신호 기반</small>
              </div>
              <div className="signal-grid">
                <div className="marketing-signal-card">
                  <span>마케팅 집약도</span>
                  <strong>{ai.marketingSignal?.score ?? '-'}점 · {ai.marketingSignal?.label || '판단보류'}</strong>
                  <p>{(ai.marketingSignal?.notes || []).slice(0, 3).join(' · ') || '추가 확인 필요'}</p>
                </div>
                <TrendAnalysis data={ai.trendAnalysis} />
              </div>
            </div>
          </>
        )}

        <div className="competitor-section">
          <div className="competitor-section-title">
            <span>최신 정보 체크</span>
            <small>{getAutoCheckStatus(current, autoCheck).label}</small>
          </div>
          <div className={`autocheck-card ${getAutoCheckStatus(current, autoCheck).due ? 'due' : ''}`}>
            <div>
              <strong>{getAutoCheckStatus(current, autoCheck).nextText}</strong>
              <p>현재 1차 구현은 앱을 열 때 업데이트 필요 여부를 표시하고, 버튼을 눌러 최신 공공/검색 정보를 다시 수집하는 방식입니다.</p>
            </div>
            <div className="autocheck-controls">
              <label>
                <span>상태</span>
                <select
                  className="business-input"
                  value={autoCheck.enabled ? 'on' : 'off'}
                  onChange={(event) => setAutoCheckField('enabled', event.target.value === 'on')}
                >
                  <option value="on">켜기</option>
                  <option value="off">끄기</option>
                </select>
              </label>
              <label>
                <span>주기</span>
                <select
                  className="business-input"
                  value={autoCheck.intervalDays}
                  onChange={(event) => setAutoCheckField('intervalDays', Number(event.target.value))}
                >
                  <option value={7}>7일</option>
                  <option value={14}>14일</option>
                  <option value={30}>30일</option>
                  <option value={60}>60일</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div className="competitor-section">
          <div className="competitor-section-title">
            <span>AI 자동 조사</span>
            <small>공개 데이터 기반</small>
          </div>
          <div className="auto-research-card">
            <div>
              <strong>{ai ? '저장된 AI 리포트가 있습니다' : '아직 AI 리포트가 없습니다'}</strong>
              <p>HIRA 공식 정보, 네이버 검색 신호, 뉴스/블로그 단서를 수집해 리포트를 생성합니다. 네이버 플레이스 리뷰 본문 자동 크롤링은 약관 리스크 때문에 제외합니다.</p>
            </div>
            <button className="btn-analyze" onClick={handleAnalyze} disabled={loading}>
              {loading ? '조사 중...' : ai ? 'AI 최신 조사 다시 실행' : 'AI 자동 조사 및 저장'}
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
                <span>경쟁 약점 → 우리 기회</span>
                <small>리뷰 키워드 기반</small>
              </div>
              <OpportunityList items={ai.opportunityAnalysis || []} />
            </div>

            <div className="competitor-section">
              <div className="competitor-section-title">
                <span>임장 자동 체크리스트</span>
                <small>공백 데이터 보강</small>
              </div>
              <FieldChecklist items={ai.fieldChecklist || []} />
            </div>

            <div className="competitor-section">
              <div className="competitor-section-title">
                <span>확인 필요</span>
                <small>임장/직접 확인</small>
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
