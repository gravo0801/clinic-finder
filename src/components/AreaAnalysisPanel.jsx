import { useEffect, useState } from 'react'
import { updateSpot } from '../firebase'

const SOURCE_LABELS = {
  region: '행정구역',
  sgis: 'SGIS',
  resident: '주민등록',
  smallBiz: '상권',
  realEstate: '실거래가',
}

const sourceText = {
  ok: '수신',
  pending: '대기',
  empty: '자료 없음',
  error: '오류',
  missing_key: '키 없음',
  blocked: '지역코드 필요',
}

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '' || value === 'N/A') return 0
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const compactObject = (object, keys) => {
  if (!object) return null
  const result = {}
  keys.forEach((key) => {
    if (object[key] !== undefined && object[key] !== null && object[key] !== '') {
      result[key] = object[key]
    }
  })
  return Object.keys(result).length > 0 ? result : null
}

const createAreaSnapshot = (data) => ({
  fetchedAt: new Date().toISOString(),
  regionInfo: compactObject(data.regionInfo, ['provider', 'sido', 'sigungu', 'dong', 'admCode', 'lawdCd']) || null,
  sources: data.sources || {},
  warnings: (data.warnings || []).slice(0, 5),
  population: compactObject(data.population, [
    'total', 'male', 'female', 'age20', 'age30', 'age40', 'age50', 'age60', 'avgAge', 'density', 'year', 'source',
  ]),
  commercialArea: compactObject(data.commercialArea, ['name', 'code']),
  commercialSale: compactObject(data.commercialSale, ['totalSale', 'medicalSale', 'storeCount', 'perStoreSale']),
  floatingPop: compactObject(data.floatingPop, ['total', 'am', 'pm']),
  residentPopulation: compactObject(data.residentPopulation, ['total', 'household', 'male', 'female', 'source']),
  aptPrice: compactObject(data.aptPrice, ['avg', 'max', 'min', 'count', 'dealYm', 'unit', 'note']),
  commercialPeriod: data.commercialPeriod || null,
  residentPeriod: data.residentPeriod || null,
})

const moneyHundredMillion = (value) => `${(parseNumber(value) / 100000000).toFixed(1)}억`
const tenThousand = (value) => `${(parseNumber(value) / 10000).toFixed(1)}만`

function estimateIncome(avgPrice) {
  const price = parseNumber(avgPrice)
  if (!price) return null
  if (price >= 150000) return { label: '최상위', color: '#FF3B30', grade: '상위권', desc: '고가 주거지 기반의 구매력 대리 지표' }
  if (price >= 90000) return { label: '상위', color: '#FF9500', grade: '상위권', desc: '중대형 평형 또는 고소득 직장인 수요 가능성' }
  if (price >= 60000) return { label: '중상위', color: '#FFCC00', grade: '중상위권', desc: '검진/비급여 수요를 함께 볼 만한 구간' }
  if (price >= 35000) return { label: '중간', color: '#34C759', grade: '중간권', desc: '표준 진료 수요 중심으로 판단' }
  return { label: '중하위', color: '#8E8E93', grade: '중하위권', desc: '가격 민감도와 접근성을 더 중시할 구간' }
}

function StatCard({ label, value, sub, tone = 'default' }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function AgeBar({ label, count, total, isTarget }) {
  const pct = total > 0 ? Math.round((parseNumber(count) / total) * 100) : 0
  return (
    <div className="age-bar-row">
      <span className={`age-label ${isTarget ? 'target' : ''}`}>{label}</span>
      <div className="age-bar-track">
        <div className="age-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className={`age-pct ${isTarget ? 'target' : ''}`}>{pct}%</span>
      <span className="age-count">{parseNumber(count).toLocaleString()}명</span>
    </div>
  )
}

function SourceBadges({ sources = {} }) {
  return (
    <div className="source-badges">
      {Object.entries(SOURCE_LABELS).map(([key, label]) => {
        const status = sources[key]?.status || 'missing_key'
        return (
          <span key={key} className={`source-badge ${status}`}>
            {label} {sourceText[status] || status}
          </span>
        )
      })}
    </div>
  )
}

const pickRegionName = (result, key) => result?.region?.[key]?.name || ''

function getBrowserRegionInfo(spot) {
  const service = window.naver?.maps?.Service
  if (!service?.reverseGeocode || !spot?.lat || !spot?.lng) return Promise.resolve(null)

  return new Promise((resolve) => {
    const coords = new window.naver.maps.LatLng(spot.lat, spot.lng)
    const orders = [
      service.OrderType?.ADM_CODE || 'admcode',
      service.OrderType?.LEGAL_CODE || 'legalcode',
    ].join(',')

    service.reverseGeocode({ coords, orders }, (status, response) => {
      if (status !== window.naver.maps.Service.Status.OK) {
        resolve(null)
        return
      }

      const results = response?.v2?.results || []
      const adm = results.find((item) => item.name === 'admcode')
      const legal = results.find((item) => item.name === 'legalcode')
      const base = adm || legal
      const admCode = adm?.code?.id || adm?.code?.mappingId || ''
      const admMapping = adm?.code?.mappingId || ''
      const lawCode = legal?.code?.id || ''
      const lawdCd = lawCode.slice(0, 5) || admCode.slice(0, 5)

      if (!admCode && !lawdCd) {
        resolve(null)
        return
      }

      resolve({
        sido: pickRegionName(base, 'area1'),
        sigungu: pickRegionName(base, 'area2'),
        dong: pickRegionName(base, 'area3'),
        admCode,
        lawdCd,
        sgisCandidates: [admCode, admMapping, admCode.slice(0, 7), admMapping.slice(0, 7), lawdCd]
          .filter(Boolean)
          .join(','),
      })
    })
  })
}

export default function AreaAnalysisPanel({ spot, onClose }) {
  const [data, setData] = useState(spot?.areaSnapshot || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [saveState, setSaveState] = useState(spot?.areaSnapshot?.fetchedAt ? 'saved' : 'idle')

  useEffect(() => {
    setData(spot?.areaSnapshot || null)
    setSaveState(spot?.areaSnapshot?.fetchedAt ? 'saved' : 'idle')
    setError(null)
  }, [spot?.id, spot?.areaSnapshot?.fetchedAt])

  const fetchAnalysis = async () => {
    if (!spot?.lat || !spot?.lng) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ lat: String(spot.lat), lng: String(spot.lng), t: String(Date.now()) })
      const region = await getBrowserRegionInfo(spot)
      if (region) {
        Object.entries(region).forEach(([key, value]) => params.set(key, value))
      }

      const res = await fetch(`/api/area?${params.toString()}`)
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || '지역 분석 데이터를 불러오지 못했습니다.')
      const snapshot = createAreaSnapshot(json)
      setData({ ...json, fetchedAt: snapshot.fetchedAt })
      setSaveState('idle')
      if (spot?.id) {
        setSaveState('saving')
        await updateSpot(spot.id, { areaSnapshot: snapshot })
        setSaveState('saved')
      }
    } catch (err) {
      setError(err.message)
      setSaveState('idle')
    } finally {
      setLoading(false)
    }
  }

  const region = data?.regionInfo
  const pop = data?.population
  const sale = data?.commercialSale
  const floating = data?.floatingPop
  const apt = data?.aptPrice
  const income = estimateIncome(apt?.avg)
  const targetPct = pop?.total > 0 ? Math.round(((parseNumber(pop.age40) + parseNumber(pop.age50)) / pop.total) * 100) : null
  const medicalShare = sale?.totalSale > 0 && sale?.medicalSale > 0
    ? Math.round((sale.medicalSale / sale.totalSale) * 100)
    : null

  return (
    <div className="area-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">지역 입지 분석</h2>
          <p className="panel-coords">
            {region?.dong ? `${region.sido} ${region.sigungu} ${region.dong}` : spot?.name}
          </p>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="panel-body">
        {!data && !loading && (
          <>
            <div className="area-intro">
              <div className="area-intro-item">인구구조와 40~50대 비중</div>
              <div className="area-intro-item">상권, 유동인구, 의료업 매출 대리 지표</div>
              <div className="area-intro-item">아파트 실거래가 기반 소득수준 추정</div>
              <div className="area-intro-note">
                특정 의원의 실제 매출은 공개되지 않으므로 상권 업종 매출과 주변 경쟁도를 함께 보는 보조 지표로 사용합니다.
              </div>
            </div>
            <button className="btn-analyze" onClick={fetchAnalysis}>지역 분석 시작</button>
          </>
        )}

        {loading && (
          <div className="ai-loading">
            <div className="ai-loading-dots"><span /><span /><span /></div>
            <p>공공 데이터를 불러오는 중...</p>
            <p className="ai-loading-sub">SGIS, 상권정보, 주민등록, 실거래가를 순차 조회합니다</p>
          </div>
        )}

        {error && (
          <div className="ai-error">
            <p>{error}</p>
            <button onClick={fetchAnalysis} className="retry-btn">다시 시도</button>
          </div>
        )}

        {data && !loading && (
          <div className="area-result">
            <SourceBadges sources={data.sources} />

            {data.warnings?.length > 0 && (
              <div className="area-warning">
                {data.warnings.slice(0, 3).map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}

            {region?.dong && (
              <div className="area-region-badge">
                {region.sido} {region.sigungu} {region.dong}
              </div>
            )}
            {data.fetchedAt && (
              <div className={`area-save-state ${saveState}`}>
                {saveState === 'saving'
                  ? '후보지에 저장 중...'
                  : `후보지에 저장됨 · ${new Date(data.fetchedAt).toLocaleString('ko-KR')}`}
              </div>
            )}

            <div className="stat-grid">
              {pop?.total > 0 && (
                <StatCard
                  label="상주인구"
                  value={`${pop.total.toLocaleString()}명`}
                  sub={pop.source || '공공 인구 통계'}
                />
              )}
              {targetPct !== null && (
                <StatCard
                  label="40~50대 비율"
                  value={`${targetPct}%`}
                  sub="내시경/검진 핵심 연령층"
                  tone={targetPct >= 35 ? 'good' : targetPct >= 25 ? 'mid' : 'low'}
                />
              )}
              {floating?.total > 0 && (
                <StatCard
                  label="유동인구"
                  value={tenThousand(floating.total)}
                  sub={data.commercialPeriod ? `${data.commercialPeriod} 기준` : '상권 기준'}
                />
              )}
              {apt?.avg > 0 && (
                <StatCard
                  label="아파트 평균"
                  value={`${(apt.avg / 10000).toFixed(1)}억`}
                  sub={`${apt.dealYm || '최근'} ${apt.count}건`}
                />
              )}
            </div>

            {income && (
              <div className="income-badge" style={{ borderColor: income.color }}>
                <div className="income-label">
                  추정 소득수준 <strong style={{ color: income.color }}>{income.label}</strong>
                </div>
                <div className="income-desc">{income.desc}</div>
              </div>
            )}

            {pop?.total > 0 && (
              <div className="area-section">
                <div className="area-section-title">연령대 분포</div>
                <AgeBar label="20대" count={pop.age20} total={pop.total} />
                <AgeBar label="30대" count={pop.age30} total={pop.total} />
                <AgeBar label="40대" count={pop.age40} total={pop.total} isTarget />
                <AgeBar label="50대" count={pop.age50} total={pop.total} isTarget />
                <AgeBar label="60대+" count={pop.age60} total={pop.total} />
                {targetPct !== null && (
                  <div className={`target-summary ${targetPct >= 35 ? 'good' : targetPct >= 25 ? 'mid' : 'low'}`}>
                    40~50대 합계 {targetPct}%:
                    {targetPct >= 40 ? ' 검진/내시경 수요를 우선 검토할 만합니다.' :
                     targetPct >= 25 ? ' 평균 이상인지 주변 경쟁도와 함께 확인하세요.' :
                     ' 핵심 연령층 비중이 낮아 다른 수요 근거가 필요합니다.'}
                  </div>
                )}
              </div>
            )}

            {(sale?.totalSale > 0 || sale?.medicalSale > 0 || sale?.storeCount > 0) && (
              <div className="area-section">
                <div className="area-section-title">
                  상권 매출 구조
                  {data.commercialArea?.name && <span className="area-section-sub">{data.commercialArea.name}</span>}
                </div>
                <div className="sale-grid">
                  {sale.totalSale > 0 && (
                    <div className="sale-card">
                      <div className="sale-label">상권 전체</div>
                      <div className="sale-value">{moneyHundredMillion(sale.totalSale)}</div>
                      <div className="sale-sub">추정 매출</div>
                    </div>
                  )}
                  {sale.medicalSale > 0 && (
                    <div className="sale-card highlight">
                      <div className="sale-label">의료 관련</div>
                      <div className="sale-value">{moneyHundredMillion(sale.medicalSale)}</div>
                      <div className="sale-sub">{medicalShare !== null ? `전체의 ${medicalShare}%` : '업종 분류 기반'}</div>
                    </div>
                  )}
                  {sale.storeCount > 0 && (
                    <div className="sale-card">
                      <div className="sale-label">점포 수</div>
                      <div className="sale-value">{sale.storeCount.toLocaleString()}</div>
                      <div className="sale-sub">상권 내</div>
                    </div>
                  )}
                  {sale.perStoreSale > 0 && (
                    <div className="sale-card">
                      <div className="sale-label">점포당</div>
                      <div className="sale-value">{tenThousand(sale.perStoreSale)}</div>
                      <div className="sale-sub">단순 평균</div>
                    </div>
                  )}
                </div>
                <div className="area-caution">
                  의료 관련 매출은 특정 의원 매출이 아니라 공개 상권/업종 분류 기반의 대리 지표입니다.
                </div>
              </div>
            )}

            {apt?.count > 0 && (
              <div className="area-section">
                <div className="area-section-title">아파트 실거래가</div>
                <div className="apt-price-row">
                  <div className="apt-price-item">
                    <span className="apt-price-label">평균</span>
                    <span className="apt-price-value">{(apt.avg / 10000).toFixed(1)}억</span>
                  </div>
                  <div className="apt-price-divider" />
                  <div className="apt-price-item">
                    <span className="apt-price-label">최고</span>
                    <span className="apt-price-value high">{(apt.max / 10000).toFixed(1)}억</span>
                  </div>
                  <div className="apt-price-divider" />
                  <div className="apt-price-item">
                    <span className="apt-price-label">최저</span>
                    <span className="apt-price-value low">{(apt.min / 10000).toFixed(1)}억</span>
                  </div>
                </div>
                <div className="apt-price-count">{apt.dealYm} 기준, {apt.count}건 거래</div>
              </div>
            )}

            {!pop && !sale?.totalSale && !apt?.count && (
              <div className="area-no-data">
                <p>표시할 수 있는 지역 데이터가 아직 없습니다.</p>
                <p>환경변수 키, 행정구역 코드 매핑, 해당 지역의 공개 데이터 존재 여부를 확인해 주세요.</p>
              </div>
            )}

            <button className="btn-reanalyze" onClick={fetchAnalysis}>다시 불러오기</button>
          </div>
        )}
      </div>
    </div>
  )
}
