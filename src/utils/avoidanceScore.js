import { calculateLocationScore, normalizeBusinessFields } from './locationScore'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const hasValue = (value) => value !== undefined && value !== null && value !== ''

const toNumber = (value) => {
  if (!hasValue(value)) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const pct = (part, total) => {
  const numerator = toNumber(part)
  const denominator = toNumber(total)
  if (!numerator || !denominator) return null
  return Math.round((numerator / denominator) * 100)
}

const hasTag = (spot, tag) => (spot.tags || []).includes(tag)

const textIncludes = (value, words) => {
  const text = String(value || '').replace(/\s/g, '')
  return words.some((word) => text.includes(word))
}

const compactSources = (snapshot = {}) => {
  const sources = snapshot.sources || {}
  return Object.values(sources).filter((source) => source?.status === 'ok').length
}

const levelFromPenalty = (penalty) => {
  if (penalty >= 22) return { key: 'danger', label: '탈락 검토' }
  if (penalty >= 12) return { key: 'warning', label: '강한 주의' }
  if (penalty >= 5) return { key: 'caution', label: '주의' }
  return { key: 'good', label: '양호' }
}

export const calculateAvoidanceScore = (spot = {}) => {
  const baseScore = calculateLocationScore(spot)
  const business = normalizeBusinessFields(spot.business)
  const snapshot = spot.areaSnapshot || {}
  const population = snapshot.population || {}
  const aptPrice = snapshot.aptPrice || {}
  const rules = []
  const missingInputs = []

  const addRule = (key, label, penalty, detail) => {
    if (penalty <= 0) return
    rules.push({ key, label, penalty, detail })
  }

  const checkupCompetitors = toNumber(business.checkupEndoscopyCompetitors)
  if (checkupCompetitors !== null) {
    if (checkupCompetitors >= 7) addRule('checkup-saturation', '검진/내시경 포화', 11, `검진/내시경 경쟁 ${checkupCompetitors}개`)
    else if (checkupCompetitors >= 5) addRule('checkup-saturation', '검진/내시경 경쟁 과다', 8, `검진/내시경 경쟁 ${checkupCompetitors}개`)
    else if (checkupCompetitors >= 3) addRule('checkup-saturation', '검진 경쟁 주의', 4, `검진/내시경 경쟁 ${checkupCompetitors}개`)
  } else {
    missingInputs.push('검진/내시경 경쟁 수')
  }

  const competitor500m = toNumber(business.competitor500m)
  if (competitor500m !== null) {
    if (competitor500m >= 10) addRule('clinic-density', '500m 의원 밀집', 7, `반경 500m 경쟁 의원 ${competitor500m}개`)
    else if (competitor500m >= 6) addRule('clinic-density', '500m 경쟁 강함', 5, `반경 500m 경쟁 의원 ${competitor500m}개`)
    else if (competitor500m >= 3) addRule('clinic-density', '500m 경쟁 확인', 2, `반경 500m 경쟁 의원 ${competitor500m}개`)
  } else {
    missingInputs.push('500m 경쟁 의원 수')
  }

  const competitor1km = toNumber(business.competitor1km)
  if (competitor1km !== null) {
    if (competitor1km >= 25) addRule('wide-density', '1km 의원 포화', 5, `반경 1km 경쟁 의원 ${competitor1km}개`)
    else if (competitor1km >= 15) addRule('wide-density', '1km 경쟁 주의', 3, `반경 1km 경쟁 의원 ${competitor1km}개`)
  } else {
    missingInputs.push('1km 경쟁 의원 수')
  }

  if (hasTag(spot, '경쟁심함')) {
    addRule('manual-competition', '경쟁심함 태그', 3, '수동 태그 기준')
  }

  const residentialSignals = hasTag(spot, '주거지역') || hasTag(spot, '신축아파트') ||
    textIncludes(business.residentialWorkerMixMemo, ['주거', '아파트', '주민', '배후세대'])
  const officeSignals = hasTag(spot, '역세권') && hasTag(spot, '상업지역')
  if (officeSignals && !residentialSignals) {
    addRule('office-hollowing', '오피스 역세권 공동화 가능성', 5, '주거 배후 신호가 약한 역세권/상업지역')
  }
  if (textIncludes(business.residentialWorkerMixMemo, ['주말공동화', '주말비어', '평일만', '오피스위주'])) {
    addRule('weekend-hollowing', '주말 공동화 메모', 5, '주말 검진 수요 확인 필요')
  }
  if (!business.residentialWorkerMixMemo) {
    missingInputs.push('직장인/주거민 비율 메모')
  }

  if (hasTag(spot, '대형병원인근') || textIncludes(`${spot.memo} ${business.demandMemo}`, ['대학병원', '상급종합'])) {
    addRule('tertiary-hospital', '대학병원 흡수권 주의', 6, '도보권이면 1차 검진/내과 수요가 빨릴 수 있음')
  }

  const totalPopulation = toNumber(population.total)
  const target4050Pct = pct((toNumber(population.age40) || 0) + (toNumber(population.age50) || 0), totalPopulation)
  const seniorPct = pct(population.age60, totalPopulation)
  const aptAvg = toNumber(aptPrice.avg)
  if (totalPopulation > 0) {
    if (seniorPct >= 40 && target4050Pct !== null && target4050Pct < 28) {
      addRule('aged-low-target', '고령층 편중', 7, `60대+ ${seniorPct}%, 40~50대 ${target4050Pct}%`)
    } else if (seniorPct >= 35) {
      addRule('aged-heavy', '고령층 비중 높음', 4, `60대+ ${seniorPct}%`)
    }

    if (seniorPct >= 35 && aptAvg > 0 && aptAvg < 35000) {
      addRule('aged-low-purchasing', '고령 구축지 가능성', 4, `60대+ ${seniorPct}%, 아파트 평균 ${(aptAvg / 10000).toFixed(1)}억`)
    }
  } else if (!snapshot.fetchedAt) {
    missingInputs.push('지역 분석 스냅샷')
  }

  const monthlyRent = toNumber(business.monthlyRent)
  const maintenanceFee = toNumber(business.maintenanceFee) || 0
  const expectedRevenue = toNumber(business.expectedMonthlyRevenue)
  if (monthlyRent !== null && expectedRevenue > 0) {
    const rentRatio = Math.round(((monthlyRent + maintenanceFee) / expectedRevenue) * 100)
    if (rentRatio > 20) addRule('rent-ratio-critical', '임대료 비율 위험', 15, `월세+관리비가 예상매출의 ${rentRatio}%`)
    else if (rentRatio > 15) addRule('rent-ratio-high', '임대료 15% 초과', 10, `월세+관리비가 예상매출의 ${rentRatio}%`)
    else if (rentRatio > 12) addRule('rent-ratio-watch', '임대료 비율 주의', 5, `월세+관리비가 예상매출의 ${rentRatio}%`)
  } else {
    if (monthlyRent !== null && monthlyRent > 1200) addRule('absolute-rent-high', '고월세 지역', 5, `월세 ${monthlyRent.toLocaleString()}만원`)
    if (monthlyRent !== null && !expectedRevenue) missingInputs.push('예상 월매출')
  }

  if (business.parkingCount === 0) {
    addRule('no-parking', '주차 0대', 6, '수면내시경 보호자 동선 리스크')
  }
  if (business.endoscopyRoomPossible === false) {
    addRule('no-endoscopy', '내시경실 불가', 8, '검진/내시경 전략과 맞지 않음')
  }

  const penalty = clamp(rules.reduce((sum, rule) => sum + rule.penalty, 0), 0, 40)
  const adjustedScore = clamp(baseScore.total - penalty, 0, 100)
  const level = levelFromPenalty(penalty)
  const dataConfidence = snapshot.fetchedAt
    ? clamp(55 + compactSources(snapshot) * 9, 55, 100)
    : 35

  return {
    baseScore: baseScore.total,
    adjustedScore,
    penalty,
    level,
    rules: rules.sort((a, b) => b.penalty - a.penalty),
    missingInputs: [...new Set(missingInputs)],
    dataConfidence,
    metrics: {
      target4050Pct,
      seniorPct,
      rentBurdenPct: monthlyRent !== null && expectedRevenue > 0
        ? Math.round(((monthlyRent + maintenanceFee) / expectedRevenue) * 100)
        : null,
    },
  }
}
