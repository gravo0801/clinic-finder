const REQUIRED_INPUTS = [
  ['monthlyRent', '월세'],
  ['areaPyeong', '전용면적'],
  ['floor', '층수'],
  ['parkingCount', '주차대수'],
  ['hasElevator', '엘리베이터'],
  ['endoscopyRoomPossible', '내시경실 가능 여부'],
  ['demandMemo', '수요 메모'],
  ['demand4060Level', '40~60대 수요 체감'],
  ['competitor500m', '반경 500m 경쟁 의원 수'],
  ['competitor1km', '반경 1km 경쟁 의원 수'],
  ['checkupEndoscopyCompetitors', '검진/내시경 경쟁 수'],
  ['pharmacyDistanceMemo', '약국 거리/동선 메모'],
]

const BUSINESS_DEFAULTS = {
  deposit: null,
  monthlyRent: null,
  maintenanceFee: null,
  areaPyeong: null,
  floor: '',
  parkingCount: null,
  hasElevator: null,
  signageQuality: null,
  pharmacyDistanceMemo: '',
  endoscopyRoomPossible: null,
  xrayPossible: null,
  interiorDifficulty: null,
  demandMemo: '',
  demand4060Level: null,
  residentialWorkerMixMemo: '',
  competitor500m: null,
  competitor1km: null,
  checkupEndoscopyCompetitors: null,
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const hasValue = (value) => value !== undefined && value !== null && value !== ''

const toNumber = (value) => {
  if (!hasValue(value)) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const boolValue = (value) => {
  if (value === true || value === false) return value
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

const hasTag = (spot, tag) => (spot.tags || []).includes(tag)

const levelScore = (value, max) => {
  const number = toNumber(value)
  if (!number) return 0
  return clamp((number / 5) * max, 0, max)
}

const parkingScore = (parkingCount) => {
  const parking = toNumber(parkingCount)
  if (parking === null) return 0
  if (parking >= 10) return 5
  if (parking >= 5) return 4
  if (parking >= 1) return 2
  return 0
}

const rentScore = (monthlyRent) => {
  const rent = toNumber(monthlyRent)
  if (rent === null) return 0
  if (rent <= 400) return 7
  if (rent <= 700) return 5
  if (rent <= 1000) return 3
  return 1
}

const areaScore = (areaPyeong) => {
  const area = toNumber(areaPyeong)
  if (area === null) return 0
  if (area >= 60) return 5
  if (area >= 50) return 4
  if (area >= 30) return 3
  return 1
}

const competitionScore = (count, wide = false) => {
  const value = toNumber(count)
  if (value === null) return 0
  if (value === 0) return wide ? 8 : 8
  if (wide) {
    if (value <= 5) return 6
    if (value <= 10) return 3
    return 1
  }
  if (value <= 2) return 6
  if (value <= 4) return 4
  return 1
}

export const normalizeBusinessFields = (business = {}) => {
  const merged = { ...BUSINESS_DEFAULTS, ...business }
  return {
    deposit: toNumber(merged.deposit),
    monthlyRent: toNumber(merged.monthlyRent),
    maintenanceFee: toNumber(merged.maintenanceFee),
    areaPyeong: toNumber(merged.areaPyeong),
    floor: toNumber(merged.floor),
    parkingCount: toNumber(merged.parkingCount),
    hasElevator: boolValue(merged.hasElevator),
    signageQuality: toNumber(merged.signageQuality),
    pharmacyDistanceMemo: hasValue(merged.pharmacyDistanceMemo) ? String(merged.pharmacyDistanceMemo).trim() : '',
    endoscopyRoomPossible: boolValue(merged.endoscopyRoomPossible),
    xrayPossible: boolValue(merged.xrayPossible),
    interiorDifficulty: toNumber(merged.interiorDifficulty),
    demandMemo: hasValue(merged.demandMemo) ? String(merged.demandMemo).trim() : '',
    demand4060Level: toNumber(merged.demand4060Level),
    residentialWorkerMixMemo: hasValue(merged.residentialWorkerMixMemo) ? String(merged.residentialWorkerMixMemo).trim() : '',
    competitor500m: toNumber(merged.competitor500m),
    competitor1km: toNumber(merged.competitor1km),
    checkupEndoscopyCompetitors: toNumber(merged.checkupEndoscopyCompetitors),
  }
}

export const calculateLocationScore = (spot = {}) => {
  const business = normalizeBusinessFields(spot.business)
  const floorNumber = toNumber(business.floor)
  const hasElevator = boolValue(business.hasElevator)
  const endoscopyPossible = boolValue(business.endoscopyRoomPossible)
  const xrayPossible = boolValue(business.xrayPossible)

  const demand = clamp(
    levelScore(business.demand4060Level, 15)
      + (business.demandMemo ? 7 : 0)
      + (business.residentialWorkerMixMemo ? 5 : 0)
      + (['주거지역', '상업지역', '역세권', '유동인구多'].some((tag) => hasTag(spot, tag)) ? 3 : 0),
    0,
    30,
  )

  const competition = clamp(
    competitionScore(business.competitor500m)
      + competitionScore(business.competitor1km, true)
      + (() => {
        const count = toNumber(business.checkupEndoscopyCompetitors)
        if (count === null) return 0
        if (count === 0) return 7
        if (count <= 2) return 5
        if (count <= 4) return 2
        return 0
      })()
      - (hasTag(spot, '경쟁심함') ? 2 : 0),
    0,
    25,
  )

  const accessibility = clamp(
    parkingScore(business.parkingCount)
      + (hasElevator ? 3 : 0)
      + (() => {
        if (floorNumber === null) return 0
        if (floorNumber <= 1) return 3
        if (floorNumber <= 4) return 2
        return 1
      })()
      + levelScore(business.signageQuality, 3)
      + (hasTag(spot, '역세권') || hasTag(spot, '버스환승') ? 1 : 0),
    0,
    15,
  )

  const economics = clamp(
    rentScore(business.monthlyRent)
      + areaScore(business.areaPyeong)
      + (() => {
        const maintenanceFee = toNumber(business.maintenanceFee)
        if (maintenanceFee === null) return 0
        if (maintenanceFee <= 100) return 3
        if (maintenanceFee <= 200) return 2
        return 1
      })()
      + (() => {
        const difficulty = toNumber(business.interiorDifficulty)
        if (difficulty === null) return 0
        if (difficulty <= 1) return 3
        if (difficulty <= 2) return 2
        if (difficulty <= 3) return 1
        return 0
      })()
      + (toNumber(business.deposit) !== null ? 2 : 0),
    0,
    20,
  )

  const strategicFit = clamp(
    (endoscopyPossible ? 4 : 0)
      + (xrayPossible ? 2 : 0)
      + (business.pharmacyDistanceMemo ? 2 : 0)
      + (hasTag(spot, '대형병원인근') ? 2 : 0),
    0,
    10,
  )

  const missingInputs = REQUIRED_INPUTS
    .filter(([key]) => {
      if (key === 'hasElevator') return boolValue(business[key]) === null
      if (key === 'endoscopyRoomPossible') return boolValue(business[key]) === null
      return !hasValue(business[key])
    })
    .map(([, label]) => label)

  const confidence = Math.round(((REQUIRED_INPUTS.length - missingInputs.length) / REQUIRED_INPUTS.length) * 100)

  const hasAnyBusinessInput = Object.values(business).some(hasValue)
  const riskFlags = []
  if (business.parkingCount === 0) riskFlags.push('주차 0대: 수면내시경/보호자 동선 리스크')
  if (business.monthlyRent !== null && business.monthlyRent > 1000) riskFlags.push('월세 1,000만원 초과: 손익분기 부담')
  if (floorNumber !== null && floorNumber >= 5 && hasElevator === false) riskFlags.push('5층 이상 + 엘리베이터 없음')
  if (endoscopyPossible === false) riskFlags.push('내시경실 구성이 불가능한 후보지')
  if (business.checkupEndoscopyCompetitors !== null && business.checkupEndoscopyCompetitors >= 5) riskFlags.push('검진/내시경 경쟁 과다')
  if (hasAnyBusinessInput && !business.pharmacyDistanceMemo) riskFlags.push('약국 동선 미확인')
  if (business.areaPyeong !== null && business.areaPyeong < 30) riskFlags.push('전용면적 30평 미만')

  const categories = {
    demand: Math.round(demand),
    competition: Math.round(competition),
    accessibility: Math.round(accessibility),
    economics: Math.round(economics),
    strategicFit: Math.round(strategicFit),
  }

  return {
    ...categories,
    total: Math.round(Object.values(categories).reduce((sum, value) => sum + value, 0)),
    confidence,
    missingInputs,
    riskFlags,
  }
}
