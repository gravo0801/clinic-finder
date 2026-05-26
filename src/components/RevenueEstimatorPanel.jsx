import { useMemo, useState } from 'react'
import './RevenueEstimatorPanel.css'

const SPECIALTY_PRESETS = {
  internalFamily: {
    label: '내과/가정의학과',
    avgFee: 35000,
    nonBenefitRate: 15,
    benchmarkAnnual: 9.8,
    activeMinutes: 180,
  },
  pediatrics: {
    label: '소아청소년과',
    avgFee: 32000,
    nonBenefitRate: 8,
    benchmarkAnnual: 7.2,
    activeMinutes: 180,
  },
  painOrtho: {
    label: '정형/통증',
    avgFee: 42000,
    nonBenefitRate: 20,
    benchmarkAnnual: 11.5,
    activeMinutes: 210,
  },
  dermUro: {
    label: '피부/비뇨',
    avgFee: 38000,
    nonBenefitRate: 55,
    benchmarkAnnual: 12.7,
    activeMinutes: 180,
  },
  psychiatry: {
    label: '정신건강의학과',
    avgFee: 45000,
    nonBenefitRate: 5,
    benchmarkAnnual: 8.5,
    activeMinutes: 180,
  },
  general: {
    label: '기타 의원',
    avgFee: 35000,
    nonBenefitRate: 15,
    benchmarkAnnual: 8.9,
    activeMinutes: 180,
  },
}

const QUALITY_SIGNALS = {
  unknown: { label: '공개 평가 미확인', tone: 'mid', weight: 0, note: '평가 공개 항목이 없으면 안정성 판단에서는 중립으로 둡니다.' },
  excellent: { label: '공개 평가 양호', tone: 'good', weight: 6, note: 'HIRA 우수기관/평가 공개 신호가 있으면 매출 지속성에 소폭 가점을 둡니다.' },
  normal: { label: '특이 신호 없음', tone: 'good', weight: 3, note: '삭감 여부가 아니라 공개 평가와 운영 리스크 관찰값만 반영합니다.' },
  watch: { label: '관찰 필요', tone: 'low', weight: -8, note: '평판, 민원, 과잉진료 의심 등은 현장 확인 전까지 리스크로만 둡니다.' },
}

const toNumber = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const formatManwon = (won) => `${Math.round(won / 10000).toLocaleString()}만원`
const formatEok = (eok) => `${Number(eok || 0).toFixed(eok >= 10 ? 1 : 2)}억`
const formatPeople = (value) => `${Math.round(value).toLocaleString()}명`
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function confidenceTone(value) {
  if (value >= 72) return 'good'
  if (value >= 52) return 'mid'
  return 'low'
}

function benchmarkLabel(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return '벤치마크 미입력'
  if (ratio >= 130) return '평균 대비 공격적 상위권 가정'
  if (ratio >= 95) return '지역/업종 평균권 가정'
  if (ratio >= 70) return '보수적 하위권 가정'
  return '매우 보수적 가정'
}

export default function RevenueEstimatorPanel({ spots, onClose, onSelectSpot }) {
  const [selectedSpotId, setSelectedSpotId] = useState('manual')
  const [specialtyKey, setSpecialtyKey] = useState('internalFamily')
  const [observedPatients, setObservedPatients] = useState(12)
  const [observationMinutes, setObservationMinutes] = useState(30)
  const [observationSessions, setObservationSessions] = useState(1)
  const [activeMinutes, setActiveMinutes] = useState(SPECIALTY_PRESETS.internalFamily.activeMinutes)
  const [workdays, setWorkdays] = useState(22)
  const [avgFee, setAvgFee] = useState(SPECIALTY_PRESETS.internalFamily.avgFee)
  const [nonBenefitRate, setNonBenefitRate] = useState(SPECIALTY_PRESETS.internalFamily.nonBenefitRate)
  const [fixedNonBenefitMonthly, setFixedNonBenefitMonthly] = useState(0)
  const [benchmarkAnnual, setBenchmarkAnnual] = useState(SPECIALTY_PRESETS.internalFamily.benchmarkAnnual)
  const [regionalMarketAnnual, setRegionalMarketAnnual] = useState(0)
  const [sameSpecialtyClinics, setSameSpecialtyClinics] = useState(0)
  const [qualitySignal, setQualitySignal] = useState('unknown')

  const selectedSpot = spots.find((spot) => spot.id === selectedSpotId)

  const handleSpecialtyChange = (key) => {
    const preset = SPECIALTY_PRESETS[key]
    setSpecialtyKey(key)
    setAvgFee(preset.avgFee)
    setNonBenefitRate(preset.nonBenefitRate)
    setBenchmarkAnnual(preset.benchmarkAnnual)
    setActiveMinutes(preset.activeMinutes)
  }

  const result = useMemo(() => {
    const patientCount = toNumber(observedPatients)
    const minutes = Math.max(toNumber(observationMinutes), 1)
    const sessions = Math.max(toNumber(observationSessions), 1)
    const active = Math.max(toNumber(activeMinutes), 1)
    const days = Math.max(toNumber(workdays), 1)
    const visitFee = Math.max(toNumber(avgFee), 0)
    const nonBenefitPct = Math.max(toNumber(nonBenefitRate), 0)
    const fixedNonBenefitWon = Math.max(toNumber(fixedNonBenefitMonthly), 0) * 10000
    const benchmark = Math.max(toNumber(benchmarkAnnual), 0)
    const regionalMarket = Math.max(toNumber(regionalMarketAnnual), 0)
    const competitors = Math.max(toNumber(sameSpecialtyClinics), 0)

    const dailyPatients = (patientCount / minutes) * active
    const monthlyPatients = dailyPatients * days
    const benefitMonthlyWon = monthlyPatients * visitFee
    const nonBenefitMonthlyWon = (benefitMonthlyWon * nonBenefitPct) / 100 + fixedNonBenefitWon
    const totalMonthlyWon = benefitMonthlyWon + nonBenefitMonthlyWon
    const annualEok = (totalMonthlyWon * 12) / 100000000
    const benchmarkRatio = benchmark > 0 ? (annualEok / benchmark) * 100 : 0
    const fairShareMonthlyWon = regionalMarket > 0 && competitors > 0
      ? (regionalMarket * 100000000) / competitors / 12
      : null
    const fairShareGap = fairShareMonthlyWon
      ? ((totalMonthlyWon - fairShareMonthlyWon) / fairShareMonthlyWon) * 100
      : null

    const quality = QUALITY_SIGNALS[qualitySignal]
    let confidence = 36
    confidence += minutes >= 60 ? 12 : minutes >= 30 ? 7 : -8
    confidence += sessions >= 3 ? 12 : sessions >= 2 ? 8 : 0
    confidence += visitFee > 0 ? 10 : 0
    confidence += benchmark > 0 ? 8 : 0
    confidence += regionalMarket > 0 ? 6 : 0
    confidence += competitors > 0 ? 6 : 0
    confidence += nonBenefitPct > 0 || fixedNonBenefitWon > 0 ? 5 : 0
    confidence += quality.weight
    confidence = clamp(Math.round(confidence), 24, 86)

    return {
      dailyPatients,
      monthlyPatients,
      benefitMonthlyWon,
      nonBenefitMonthlyWon,
      totalMonthlyWon,
      annualEok,
      benchmarkRatio,
      fairShareMonthlyWon,
      fairShareGap,
      confidence,
      quality,
      scenarios: [
        { key: 'conservative', label: '보수', multiplier: 0.75, won: totalMonthlyWon * 0.75 },
        { key: 'base', label: '기준', multiplier: 1, won: totalMonthlyWon },
        { key: 'optimistic', label: '낙관', multiplier: 1.25, won: totalMonthlyWon * 1.25 },
      ],
    }
  }, [observedPatients, observationMinutes, observationSessions, activeMinutes, workdays, avgFee, nonBenefitRate, fixedNonBenefitMonthly, benchmarkAnnual, regionalMarketAnnual, sameSpecialtyClinics, qualitySignal])

  return (
    <div className="revenue-panel">
      <div className="panel-header revenue-header">
        <div>
          <h2 className="panel-title">매출 추정</h2>
          <p className="panel-coords">임장 관찰값과 공공통계 기준을 조합한 후보지 상대 비교용 계산기</p>
        </div>
        <button className="close-btn" onClick={onClose}>x</button>
      </div>

      <div className="revenue-body">
        <div className="revenue-alert">
          개별 의원 실제 매출을 조회하는 기능이 아니라, 공개 통계와 현장 관찰값을 조합한 추정 범위입니다.
        </div>

        <section className="revenue-section">
          <div className="revenue-section-title">후보지와 과목</div>
          <div className="revenue-grid two">
            <label className="revenue-field">
              <span>후보지</span>
              <select value={selectedSpotId} onChange={(event) => setSelectedSpotId(event.target.value)}>
                <option value="manual">직접 계산</option>
                {spots.map((spot) => (
                  <option key={spot.id} value={spot.id}>{spot.name || '이름 없음'}</option>
                ))}
              </select>
            </label>
            <label className="revenue-field">
              <span>진료과</span>
              <select value={specialtyKey} onChange={(event) => handleSpecialtyChange(event.target.value)}>
                {Object.entries(SPECIALTY_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>{preset.label}</option>
                ))}
              </select>
            </label>
          </div>
          {selectedSpot && (
            <button className="revenue-link-btn" onClick={() => onSelectSpot(selectedSpot)}>
              이 후보지 상세 열기
            </button>
          )}
        </section>

        <section className="revenue-section">
          <div className="revenue-section-title">임장 관찰값</div>
          <div className="revenue-grid three">
            <label className="revenue-field">
              <span>관찰 환자 수</span>
              <input type="number" min="0" value={observedPatients} onChange={(event) => setObservedPatients(event.target.value)} />
            </label>
            <label className="revenue-field">
              <span>총 관찰 시간</span>
              <input type="number" min="1" value={observationMinutes} onChange={(event) => setObservationMinutes(event.target.value)} />
              <small>분</small>
            </label>
            <label className="revenue-field">
              <span>관찰 회차</span>
              <input type="number" min="1" value={observationSessions} onChange={(event) => setObservationSessions(event.target.value)} />
              <small>회</small>
            </label>
            <label className="revenue-field">
              <span>일 환산 시간</span>
              <input type="number" min="1" value={activeMinutes} onChange={(event) => setActiveMinutes(event.target.value)} />
              <small>분</small>
            </label>
            <label className="revenue-field">
              <span>월 진료일</span>
              <input type="number" min="1" value={workdays} onChange={(event) => setWorkdays(event.target.value)} />
              <small>일</small>
            </label>
            <label className="revenue-field">
              <span>급여 평균 단가</span>
              <input type="number" min="0" value={avgFee} onChange={(event) => setAvgFee(event.target.value)} />
              <small>원</small>
            </label>
          </div>
        </section>

        <section className="revenue-section">
          <div className="revenue-section-title">공공통계 보정</div>
          <div className="revenue-grid two">
            <label className="revenue-field">
              <span>비급여 가산율</span>
              <input type="number" min="0" value={nonBenefitRate} onChange={(event) => setNonBenefitRate(event.target.value)} />
              <small>%</small>
            </label>
            <label className="revenue-field">
              <span>고정 비급여</span>
              <input type="number" min="0" value={fixedNonBenefitMonthly} onChange={(event) => setFixedNonBenefitMonthly(event.target.value)} />
              <small>만원/월</small>
            </label>
            <label className="revenue-field">
              <span>국세 벤치마크</span>
              <input type="number" min="0" step="0.1" value={benchmarkAnnual} onChange={(event) => setBenchmarkAnnual(event.target.value)} />
              <small>억원/년</small>
            </label>
            <label className="revenue-field">
              <span>NHIS 지역 시장</span>
              <input type="number" min="0" step="0.1" value={regionalMarketAnnual} onChange={(event) => setRegionalMarketAnnual(event.target.value)} />
              <small>억원/년</small>
            </label>
            <label className="revenue-field">
              <span>동일 과목 의원 수</span>
              <input type="number" min="0" value={sameSpecialtyClinics} onChange={(event) => setSameSpecialtyClinics(event.target.value)} />
              <small>개</small>
            </label>
            <label className="revenue-field">
              <span>공개 평가 신호</span>
              <select value={qualitySignal} onChange={(event) => setQualitySignal(event.target.value)}>
                {Object.entries(QUALITY_SIGNALS).map(([key, signal]) => (
                  <option key={key} value={key}>{signal.label}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="revenue-result-card">
          <div className="revenue-result-head">
            <div>
              <span>기준 월 매출</span>
              <strong>{formatManwon(result.totalMonthlyWon)}</strong>
            </div>
            <em className={confidenceTone(result.confidence)}>신뢰도 {result.confidence}%</em>
          </div>
          <div className="revenue-kpi-grid">
            <div>
              <span>일 환자</span>
              <b>{formatPeople(result.dailyPatients)}</b>
            </div>
            <div>
              <span>월 환자</span>
              <b>{formatPeople(result.monthlyPatients)}</b>
            </div>
            <div>
              <span>급여 월매출</span>
              <b>{formatManwon(result.benefitMonthlyWon)}</b>
            </div>
            <div>
              <span>비급여 추정</span>
              <b>{formatManwon(result.nonBenefitMonthlyWon)}</b>
            </div>
          </div>
          <div className="scenario-row">
            {result.scenarios.map((scenario) => (
              <div key={scenario.key} className={`scenario-card ${scenario.key}`}>
                <span>{scenario.label}</span>
                <strong>{formatManwon(scenario.won)}</strong>
                <small>연 {formatEok((scenario.won * 12) / 100000000)}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="revenue-source-grid">
          <div className="source-card">
            <span>HIRA 급여 기준</span>
            <strong>{avgFee.toLocaleString()}원/명</strong>
            <p>의원급 표시과목별 급여 통계에서 평균 단가를 가져와 보정하는 자리입니다.</p>
          </div>
          <div className="source-card">
            <span>국세통계 벤치마크</span>
            <strong>{benchmarkAnnual ? `${Math.round(result.benchmarkRatio)}%` : '-'}</strong>
            <p>{benchmarkLabel(result.benchmarkRatio)}</p>
          </div>
          <div className="source-card">
            <span>NHIS 시장 배분</span>
            <strong>{result.fairShareMonthlyWon ? formatManwon(result.fairShareMonthlyWon) : '-'}</strong>
            <p>{result.fairShareGap === null ? '지역 시장 규모와 경쟁 의원 수를 입력하면 적정 몫과 비교합니다.' : `기준 추정은 균등 배분 대비 ${Math.round(result.fairShareGap)}%입니다.`}</p>
          </div>
          <div className={`source-card quality ${result.quality.tone}`}>
            <span>평가 안정성</span>
            <strong>{result.quality.label}</strong>
            <p>{result.quality.note}</p>
          </div>
        </section>

        <div className="revenue-footnote">
          1회 30분 관찰만으로는 보수적으로 보세요. 오전/점심/오후를 나눠 2~3회 이상 입력하면 신뢰도가 올라갑니다.
        </div>
      </div>
    </div>
  )
}
