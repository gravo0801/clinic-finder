const HIRA_BASE = 'https://apis.data.go.kr/B551182'

const emptySource = (status = 'pending', message = '') => ({ status, message })

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const toNumber = (value) => {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

const stripTags = (value = '') => String(value).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

const clean = (value) => {
  if (value === undefined || value === null) return ''
  return stripTags(String(value)).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

const decodeXml = (value = '') => clean(value)
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")

const pickFirst = (...values) => values.find((value) => value !== undefined && value !== null && value !== '') || ''

const compact = (object, keys) => {
  const result = {}
  keys.forEach((key) => {
    const value = object?.[key]
    if (value !== undefined && value !== null && value !== '') result[key] = value
  })
  return result
}

const normalizeArray = (value) => {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

const parseXmlItems = (xml) => {
  const itemMatches = String(xml).match(/<item\b[^>]*>[\s\S]*?<\/item>/g) || []
  return itemMatches.map((itemXml) => {
    const item = {}
    const body = itemXml.replace(/^<item\b[^>]*>/, '').replace(/<\/item>$/, '')
    const tagMatches = [...body.matchAll(/<([^/][^>\s]*)[^>]*>([\s\S]*?)<\/\1>/g)]
    tagMatches.forEach((match) => {
      const key = match[1]
      const value = decodeXml(match[2])
      if (key !== 'item' && value !== '') item[key] = value
    })
    return item
  })
}

const normalizeOpenData = (text) => {
  const raw = String(text || '')
  try {
    const data = JSON.parse(raw)
    const body = data?.response?.body || data?.body || data
    const header = data?.response?.header || data?.header || {}
    const items = normalizeArray(body?.items?.item || body?.item || data?.items?.item || data?.items)
    return { header, body, items, raw: data }
  } catch (_) {
    const items = parseXmlItems(raw)
    const resultCode = raw.match(/<resultCode>(.*?)<\/resultCode>/)?.[1]
    const resultMsg = raw.match(/<resultMsg>(.*?)<\/resultMsg>/)?.[1]
    return { header: { resultCode, resultMsg }, body: {}, items, raw }
  }
}

const callOpenData = async (serviceKey, path, params = {}) => {
  const query = new URLSearchParams({ ...params }).toString()
  const separator = query ? '&' : ''
  const url = `${HIRA_BASE}/${path}?serviceKey=${serviceKey}${separator}${query}`
  const response = await fetch(url)
  const text = await response.text()
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const parsed = normalizeOpenData(text)
  const resultCode = parsed.header?.resultCode || parsed.raw?.response?.header?.resultCode
  const resultMsg = parsed.header?.resultMsg || parsed.raw?.response?.header?.resultMsg
  if (resultCode && !['00', 'INFO-000'].includes(String(resultCode))) {
    throw new Error(resultMsg || `OpenAPI ${resultCode}`)
  }
  return parsed.items
}

const runOpenDataSource = async (sources, key, label, task) => {
  try {
    const items = await task()
    sources[key] = emptySource(items.length ? 'ok' : 'empty', items.length ? `${label} 수신` : `${label} 자료 없음`)
    return items
  } catch (error) {
    sources[key] = emptySource('error', `${label}: ${error.message}`)
    return []
  }
}

const callNaverSearch = async (type, query, display = 5) => {
  const clientId = process.env.NAVER_SEARCH_CLIENT_ID
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET
  if (!clientId || !clientSecret) return { status: 'missing_key', total: 0, items: [] }

  const sort = type === 'local' ? 'random' : 'sim'
  const url = `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(query)}&display=${display}&sort=${sort}`
  const response = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })
  const data = await response.json()
  if (!response.ok || data.errorCode) throw new Error(data.errorMessage || `Naver ${type} error`)
  return {
    status: 'ok',
    total: data.total || 0,
    items: (data.items || []).map((item) => ({
      title: clean(item.title),
      link: item.link,
      description: clean(item.description),
      category: clean(item.category),
      address: clean(item.address || item.roadAddress),
    })),
  }
}

const findSearchSignals = async (clinic) => {
  const queryBase = [clinic.name, clinic.address?.split(' ').slice(0, 2).join(' ')].filter(Boolean).join(' ')
  const signals = { local: null, blog: null, news: null, issue: null }
  const sources = {}

  try {
    signals.local = await callNaverSearch('local', clinic.name, 5)
    sources.naverLocal = emptySource(signals.local.status, signals.local.status === 'ok' ? '네이버 지역 검색 수신' : '네이버 키 없음')
  } catch (error) {
    signals.local = { status: 'error', total: 0, items: [] }
    sources.naverLocal = emptySource('error', error.message)
  }

  try {
    signals.blog = await callNaverSearch('blog', queryBase || clinic.name, 5)
    sources.naverBlog = emptySource(signals.blog.status, signals.blog.status === 'ok' ? '네이버 블로그 검색 수신' : '네이버 키 없음')
  } catch (error) {
    signals.blog = { status: 'error', total: 0, items: [] }
    sources.naverBlog = emptySource('error', error.message)
  }

  try {
    signals.news = await callNaverSearch('news', queryBase || clinic.name, 5)
    sources.naverNews = emptySource(signals.news.status, signals.news.status === 'ok' ? '네이버 뉴스 검색 수신' : '네이버 키 없음')
  } catch (error) {
    signals.news = { status: 'error', total: 0, items: [] }
    sources.naverNews = emptySource('error', error.message)
  }

  try {
    signals.issue = await callNaverSearch('news', `${clinic.name} 행정처분 거짓청구 소송`, 5)
    sources.naverIssue = emptySource(signals.issue.status, signals.issue.status === 'ok' ? '법적 이슈 검색 수신' : '네이버 키 없음')
  } catch (error) {
    signals.issue = { status: 'error', total: 0, items: [] }
    sources.naverIssue = emptySource('error', error.message)
  }

  return { signals, sources }
}

const getRecentMonths = (count) => {
  const months = []
  const date = new Date()
  for (let i = 0; i < count; i += 1) {
    const d = new Date(date.getFullYear(), date.getMonth() - i, 1)
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

const fetchOfficialData = async (clinic) => {
  const serviceKey = process.env.PUBLIC_DATA_API_KEY
  const hiraId = clinic.hiraId || (String(clinic.id || '').startsWith('naver_') ? '' : clinic.id)
  const sources = {
    detail: emptySource('pending'),
    departments: emptySource('pending'),
    facility: emptySource('pending'),
    medicalEquipment: emptySource('pending'),
    specialists: emptySource('pending'),
    personnel: emptySource('pending'),
    specialCare: emptySource('pending'),
    topDiseases: emptySource('pending'),
    openClose: emptySource('pending'),
    falseClaim: emptySource('pending'),
  }

  const official = {
    detail: null,
    departments: [],
    facility: [],
    medicalEquipment: [],
    specialists: [],
    personnel: [],
    specialCare: [],
    topDiseases: [],
    openClose: [],
    falseClaim: null,
  }

  if (!serviceKey || !hiraId) {
    Object.keys(sources).forEach((key) => {
      sources[key] = emptySource(!serviceKey ? 'missing_key' : 'blocked', !serviceKey ? 'PUBLIC_DATA_API_KEY 없음' : 'HIRA 요양기호 없음')
    })
    return { official, sources }
  }

  const common = { ykiho: hiraId, pageNo: '1', numOfRows: '20', _type: 'json' }
  const [
    detail,
    departments,
    facility,
    medicalEquipment,
    specialists,
    personnel,
    specialCare,
    topDiseaseItems,
  ] = await Promise.all([
    runOpenDataSource(sources, 'detail', '세부정보', () => callOpenData(serviceKey, 'MadmDtlInfoService2.7/getDtlInfo2.7', common)),
    runOpenDataSource(sources, 'departments', '진료과목', () => callOpenData(serviceKey, 'MadmDtlInfoService2.7/getDgsbjtInfo2.7', common)),
    runOpenDataSource(sources, 'facility', '시설정보', () => callOpenData(serviceKey, 'MadmDtlInfoService2.7/getEqpInfo2.7', common)),
    runOpenDataSource(sources, 'medicalEquipment', '의료장비', () => callOpenData(serviceKey, 'MadmDtlInfoService2.7/getMedOftInfo2.7', common)),
    runOpenDataSource(sources, 'specialists', '전문의 수', () => callOpenData(serviceKey, 'MadmDtlInfoService2.7/getSpcSbjtSdrInfo2.7', common)),
    runOpenDataSource(sources, 'personnel', '기타인력', () => callOpenData(serviceKey, 'MadmDtlInfoService2.7/getEtcHstInfo2.7', common)),
    runOpenDataSource(sources, 'specialCare', '특수진료', () => callOpenData(serviceKey, 'MadmDtlInfoService2.7/getSpclDiagInfo2.7', common)),
    runOpenDataSource(sources, 'topDiseases', '상위 질병', () => callOpenData(serviceKey, 'hospDiagInfoService1/getClinicTop5List1', {
      ykiho: hiraId,
      pageNo: '1',
      numOfRows: '1',
    })),
  ])

  official.detail = detail[0] ? compact(detail[0], [
    'yadmNm', 'addr', 'telno', 'hospUrl', 'estbDd', 'drTotCnt', 'sdrCnt', 'gdrCnt', 'intnCnt', 'resdntCnt',
  ]) : null
  official.departments = departments.map((item) => clean(pickFirst(item.dgsbjtCdNm, item.dgsbjtNm, item.mdlrtSbjectNm))).filter(Boolean)
  official.facility = facility.map((item) => compact(item, ['eqpTypCdNm', 'eqpCnt', 'sickbdCnt', 'rmCnt']))
  official.medicalEquipment = medicalEquipment.map((item) => compact(item, ['oftCdNm', 'oftCnt', 'eqpCdNm', 'eqpCnt']))
  official.specialists = specialists.map((item) => compact(item, ['dgsbjtCdNm', 'sdrCnt', 'spcSbjtSdrCnt']))
  official.personnel = personnel.map((item) => compact(item, ['etcHstCdNm', 'etcHstCnt', 'nrsCnt', 'nrsaCnt']))
  official.specialCare = specialCare.map((item) => clean(pickFirst(item.spclDiagCdNm, item.spclMdlrtCdNm, item.diagNm))).filter(Boolean)

  const top = topDiseaseItems[0] || {}
  official.topDiseases = [
    top.mfrnIntrsIlnsNm1,
    top.mfrnIntrsIlnsNm2,
    top.mfrnIntrsIlnsNm3,
    top.mfrnIntrsIlnsNm4,
    top.mfrnIntrsIlnsNm5,
  ].map(clean).filter(Boolean)
  if (top.crtrYm) official.topDiseasePeriod = top.crtrYm

  const openCloseMonths = getRecentMonths(13)
  try {
    const openCloseResults = await Promise.all(openCloseMonths.map((crtrYm) =>
      callOpenData(serviceKey, 'yadmOpCloInfoService1/getHospPharmacyOpCloList', {
        pageNo: '1',
        numOfRows: '50',
        crtrYm,
        yadmTp: '1',
        yadmNm: clinic.name,
      }).catch(() => []),
    ))
    official.openClose = openCloseResults.flat().filter((item) => clean(item.yadmNm).includes(clean(clinic.name)))
    sources.openClose = emptySource(official.openClose.length ? 'ok' : 'empty', official.openClose.length ? '최근 개폐업 이력 발견' : '최근 13개월 개폐업 이력 없음')
  } catch (error) {
    sources.openClose = emptySource('error', error.message)
  }

  try {
    const response = await fetch('https://www.hira.or.kr/bbsDummy.do?brdBltNo=5&brdScnBltNo=4&pgmid=HIRAA020047030000')
    const html = await response.text()
    const name = clean(clinic.name)
    const addrToken = clean(clinic.address).split(' ').slice(0, 2).join(' ')
    const possibleMatch = html.includes(name) || (addrToken && html.includes(name.replace(/의원$/, '')) && html.includes(addrToken))
    official.falseClaim = {
      checked: true,
      possibleMatch,
      note: possibleMatch ? '거짓청구 명단 페이지에서 이름 또는 주소 단서가 감지되었습니다. 원문 확인이 필요합니다.' : '현재 공표 페이지에서 직접 일치 단서는 감지되지 않았습니다.',
    }
    sources.falseClaim = emptySource('ok', '거짓청구 공표 페이지 확인')
  } catch (error) {
    sources.falseClaim = emptySource('error', error.message)
  }

  return { official, sources }
}

const textBlob = (...parts) => parts.filter(Boolean).join(' ').toLowerCase()

const hasAny = (text, keywords) => keywords.some((keyword) => text.includes(keyword.toLowerCase()))

const countEquipmentHits = (official, keywords) => {
  const text = textBlob(
    JSON.stringify(official.medicalEquipment || []),
    JSON.stringify(official.facility || []),
    official.specialCare?.join(' '),
  )
  return keywords.filter((keyword) => text.includes(keyword.toLowerCase())).length
}

const GRAVO_CONCEPTS = {
  CHECKUP_SPECIALIZED: {
    label: '검진/내시경 특화',
    weight: 1,
    summary: '건강검진·내시경 수요를 직접 흡수할 가능성이 큽니다.',
  },
  GENERAL_365: {
    label: '365형 일반 의원',
    weight: 0.8,
    summary: '야간·주말·다과목 운영으로 1차진료 수요와 겹칠 수 있습니다.',
  },
  FAMILY_MEDICINE: {
    label: '가정의학/1차진료형',
    weight: 0.9,
    summary: '가정의학과 기반의 1차진료 영역이 직접 겹칩니다.',
  },
  INTERNAL_MEDICINE: {
    label: '내과 일반형',
    weight: 0.8,
    summary: '내과 외래와 만성질환 관리 수요가 부분적으로 겹칩니다.',
  },
  CHRONIC_CARE: {
    label: '만성질환 관리형',
    weight: 0.6,
    summary: '고혈압·당뇨 등 반복 내원 수요를 두고 부분 경쟁합니다.',
  },
  ONCOLOGY_FOLLOWUP: {
    label: '암케어/종양 추적형',
    weight: 0.8,
    summary: '암 치료 후 관리·상담 수요와 충돌할 수 있습니다.',
  },
  AESTHETIC_NONINSURED: {
    label: '미용/비급여 특화',
    weight: 0.15,
    summary: '비급여 중심이지만 Gravo 핵심 콘셉트와 직접 충돌은 낮습니다.',
  },
  ORTHO_REHAB: {
    label: '정형/재활 특화',
    weight: 0.15,
    summary: '주요 수요가 달라 직접 경쟁도는 낮습니다.',
  },
  OTHER: {
    label: '기타/판단보류',
    weight: 0.35,
    summary: '현재 공개 신호만으로 콘셉트 분류가 제한적입니다.',
  },
}

const NEGATIVE_PATTERNS = [
  {
    key: 'WAIT_TIME',
    label: '대기시간 불만',
    keywords: ['대기', '기다', '오래', '1시간', '2시간', '줄'],
    opportunity: '예약제, 대기 알림, 시간대별 검진 동선으로 차별화 가능',
  },
  {
    key: 'DOCTOR_MANNER',
    label: '설명/친절 불만',
    keywords: ['불친절', '무뚝뚝', '설명없', '설명 없', '귀찮', '대충'],
    opportunity: '충분한 설명, 검사 전후 상담, 암케어 상담 시간을 강점으로 전환',
  },
  {
    key: 'PRICE',
    label: '가격/과잉진료 의심',
    keywords: ['비싸', '과잉', '강요', '바가지', '추가금'],
    opportunity: '비급여 가격표와 검진 패키지를 투명하게 공개해 신뢰 확보',
  },
  {
    key: 'FACILITY',
    label: '시설/주차 불편',
    keywords: ['낡', '좁', '불편', '주차', '노후', '엘리베이터'],
    opportunity: '쾌적한 내시경 동선, 주차 안내, 신축 인테리어로 즉각 차별화',
  },
]

const truthyManual = (value) => ['yes', 'true', 'on', '있음', '운영', '노출'].includes(String(value || '').toLowerCase())
const falseyManual = (value) => ['no', 'false', 'off', '없음', '미운영', '미노출'].includes(String(value || '').toLowerCase())

const distanceDecay = (distanceM) => {
  if (distanceM === null || distanceM === undefined) return 0.55
  if (distanceM < 200) return 1
  if (distanceM < 500) return 0.8
  if (distanceM < 1000) return 0.5
  return 0.3
}

const gradeFromScore = (score) => {
  if (score >= 82) return '매우 높음'
  if (score >= 66) return '높음'
  if (score >= 45) return '보통'
  if (score >= 25) return '낮음'
  return '판단보류'
}

const scoreOrFallback = (value, fallback, min = 0, max = 100) => {
  const parsed = toNumber(value)
  return parsed === null ? fallback : clamp(Math.round(parsed), min, max)
}

const buildSignalText = ({ clinic, manualReview, officialData, webSignals }) => textBlob(
  clinic.name,
  clinic.dept,
  clinic.type,
  clinic.address,
  officialData.departments?.join(' '),
  officialData.topDiseases?.join(' '),
  officialData.specialCare?.join(' '),
  JSON.stringify(officialData.medicalEquipment || []),
  JSON.stringify(officialData.facility || []),
  manualReview.positiveKeywords,
  manualReview.negativeKeywords,
  manualReview.doctorProfileMemo,
  manualReview.website,
  manualReview.nonInsuredMemo,
  webSignals.blog?.items?.map((item) => `${item.title} ${item.description}`).join(' '),
  webSignals.local?.items?.map((item) => `${item.title} ${item.description} ${item.category}`).join(' '),
)

const classifyClinicConcept = ({ clinic, manualReview, officialData, webSignals }) => {
  const combined = buildSignalText({ clinic, manualReview, officialData, webSignals })
  const scores = {
    CHECKUP_SPECIALIZED: 0,
    GENERAL_365: 0,
    FAMILY_MEDICINE: 0,
    INTERNAL_MEDICINE: 0,
    CHRONIC_CARE: 0,
    ONCOLOGY_FOLLOWUP: 0,
    AESTHETIC_NONINSURED: 0,
    ORTHO_REHAB: 0,
    OTHER: 1,
  }

  if (hasAny(combined, ['검진', '건강검진', '내시경', '위대장', '수면', '초음파'])) scores.CHECKUP_SPECIALIZED += 8
  if (countEquipmentHits(officialData, ['내시경', '초음파', '방사선', 'x-ray', '엑스선']) >= 2) scores.CHECKUP_SPECIALIZED += 4
  if (hasAny(combined, ['365', '24시간', '야간', '주말', '공휴일', '응급'])) scores.GENERAL_365 += 8
  if (hasAny(combined, ['가정의학', '패밀리', '가족'])) scores.FAMILY_MEDICINE += 8
  if (hasAny(combined, ['내과', '소화기', '호흡기'])) scores.INTERNAL_MEDICINE += 7
  if (hasAny(combined, ['고혈압', '당뇨', '고지혈', '만성질환', '생활습관'])) scores.CHRONIC_CARE += 6
  if (hasAny(combined, ['종양', '암', '항암', '혈액종양', '암경험'])) scores.ONCOLOGY_FOLLOWUP += 8
  if (hasAny(combined, ['피부', '레이저', 'ipl', '탈모', '비만', '리프팅', '보톡스', '필러'])) scores.AESTHETIC_NONINSURED += 8
  if (hasAny(combined, ['정형', '재활', '통증', '도수', '체외충격파'])) scores.ORTHO_REHAB += 8

  const sorted = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([key, score]) => ({ key, score, ...GRAVO_CONCEPTS[key] }))
  const primary = sorted[0]?.score > 1 ? sorted[0] : { key: 'OTHER', score: 1, ...GRAVO_CONCEPTS.OTHER }
  return {
    primaryKey: primary.key,
    label: primary.label,
    collisionWeight: primary.weight,
    confidence: clamp(Math.round(primary.score * 10), 20, 90),
    summary: primary.summary,
    signals: sorted.filter((item) => item.score >= 4).slice(0, 4).map((item) => item.label),
  }
}

const calcMarketingScore = (manualReview, webSignals) => {
  let score = 0
  const notes = []
  const blogCount = toNumber(manualReview.blogCount)
  const followers = toNumber(manualReview.instagramFollowers)
  const homepageQuality = toNumber(manualReview.homepageQuality)

  if (truthyManual(manualReview.naverAd)) { score += 25; notes.push('네이버 광고 노출 확인') }
  if (blogCount !== null && blogCount > 50) { score += 20; notes.push('블로그 게시글 50건 초과') }
  else if ((webSignals.blog?.total || 0) >= 50) { score += 12; notes.push('블로그 검색량 50건 이상') }
  else if ((webSignals.blog?.total || 0) >= 10) { score += 6; notes.push('블로그 검색량 일부 존재') }
  if (truthyManual(manualReview.instagramActive)) { score += 10; notes.push('인스타그램 운영') }
  if (followers !== null && followers >= 1000) { score += 8; notes.push('인스타 팔로워 1천명 이상') }
  if (manualReview.website) score += 5
  if (homepageQuality !== null && homepageQuality >= 3) { score += 15; notes.push('홈페이지 품질 양호') }
  if (truthyManual(manualReview.mamcafeMention)) { score += 10; notes.push('지역 커뮤니티 언급') }
  if (truthyManual(manualReview.youtubeActive)) { score += 20; notes.push('유튜브 채널 운영') }

  return {
    score: clamp(score, 0, 100),
    label: gradeFromScore(score),
    notes: notes.length ? notes : ['마케팅 신호가 아직 부족합니다.'],
  }
}

const estimateNonInsuredSignal = ({ clinic, manualReview, officialData, combined }) => {
  let score = 10
  const signals = []
  const region = clean(clinic.address)
  const priceInputs = [
    manualReview.nonInsuredStomachEndoscopy,
    manualReview.nonInsuredColonEndoscopy,
    manualReview.checkupPackagePrice,
    manualReview.ivTherapyPrice,
  ].filter((value) => toNumber(value) !== null).length

  if (hasAny(combined, ['내시경', '위대장', '수면', '검진', '건강검진'])) { score += 25; signals.push('검진/내시경 포지셔닝') }
  if (countEquipmentHits(officialData, ['내시경']) >= 1) { score += 18; signals.push('내시경 장비 신호') }
  if (countEquipmentHits(officialData, ['초음파']) >= 1) { score += 10; signals.push('초음파 장비 신호') }
  if (countEquipmentHits(officialData, ['레이저', 'ipl', '체외충격파']) >= 1) { score += 10; signals.push('비급여 장비 신호') }
  if (hasAny(combined, ['수액', '영양', '비만', '예방접종'])) { score += 8; signals.push('비급여 진료 키워드') }
  if (priceInputs > 0) { score += priceInputs * 6; signals.push(`비급여 가격 단서 ${priceInputs}개`) }
  if (hasAny(region, ['강남', '서초', '송파'])) { score += 12; signals.push('고소득권역 보정') }
  else if (hasAny(region, ['마포', '용산', '성동', '광진', '영등포'])) { score += 8; signals.push('도심/직주혼합권 보정') }

  const finalScore = clamp(score, 0, 100)
  const shareRange =
    finalScore >= 75 ? '40~55%' :
    finalScore >= 58 ? '30~45%' :
    finalScore >= 38 ? '20~35%' :
    '판단보류'

  return {
    score: finalScore,
    label: gradeFromScore(finalScore),
    shareRange,
    signals: signals.length ? signals : ['비급여 신호 부족'],
    confidence: clamp(35 + priceInputs * 12 + Math.min(signals.length, 4) * 8, 25, 85),
  }
}

const classifyManualTrend = (manualReview) => {
  const years = [2022, 2023, 2024]
  const yearly = years
    .map((year) => ({ year, value: toNumber(manualReview[`trend${year}`]) }))
    .filter((item) => item.value !== null)
    .map((item, index, arr) => {
      const prev = index > 0 ? arr[index - 1].value : null
      return {
        ...item,
        deltaPct: prev && prev > 0 ? Math.round(((item.value - prev) / prev) * 1000) / 10 : null,
      }
    })

  if (yearly.length < 2) {
    return {
      label: '판단보류',
      signal: 'neutral',
      growthRate: null,
      yearly,
      summary: '연도별 진료량/청구건수 지표가 부족합니다.',
    }
  }

  const first = yearly[0].value
  const last = yearly[yearly.length - 1].value
  const growthRate = first > 0 ? (last - first) / first : 0
  if (growthRate > 0.15) {
    return { label: '성장 중', signal: 'positive', growthRate, yearly, summary: '최근 입력값 기준 성장세가 관찰됩니다.' }
  }
  if (growthRate > -0.05) {
    return { label: '정체', signal: 'neutral', growthRate, yearly, summary: '최근 입력값 기준 큰 성장 없이 정체에 가깝습니다.' }
  }
  return { label: '하락 중', signal: 'warning', growthRate, yearly, summary: '최근 입력값 기준 진료량 하락 신호가 있습니다.' }
}

const findWeaknessOpportunities = (manualReview) => {
  const negative = textBlob(manualReview.negativeKeywords, manualReview.legalIssueMemo)
  return NEGATIVE_PATTERNS
    .map((pattern) => {
      const matches = pattern.keywords.filter((keyword) => negative.includes(keyword.toLowerCase()))
      if (!matches.length) return null
      return {
        key: pattern.key,
        label: pattern.label,
        evidence: matches.slice(0, 4).join(', '),
        opportunity: pattern.opportunity,
      }
    })
    .filter(Boolean)
}

const buildFieldChecklist = ({ manualReview, officialData, trendAnalysis, nonInsuredSignal }) => {
  const items = []
  const hasPrice = [
    manualReview.nonInsuredStomachEndoscopy,
    manualReview.nonInsuredColonEndoscopy,
    manualReview.checkupPackagePrice,
    manualReview.ivTherapyPrice,
  ].some((value) => toNumber(value) !== null)

  if (toNumber(manualReview.noonPatientCount) === null) {
    items.push({
      priority: 'HIGH',
      task: '점심시간 환자 수 카운트',
      method: '12:00~13:30 사이 30분간 입·퇴장 흐름 기록',
      effect: '환자 흡입력과 매출 잠재력 신뢰도 상승',
    })
  }
  if (!hasPrice && nonInsuredSignal.score >= 35) {
    items.push({
      priority: 'HIGH',
      task: '비급여 가격표 확인',
      method: '홈페이지, 원내 게시판, 상담 동선에서 검진/내시경/수액 가격 확인',
      effect: '비급여 비중 추정 신뢰도 상승',
    })
  }
  if (toNumber(manualReview.parkingSpots) === null) {
    items.push({
      priority: 'MEDIUM',
      task: '주차 공간과 주차 방식 확인',
      method: '자주식/기계식/발렛/제휴 주차 여부와 안내 품질 확인',
      effect: '검진 환자 접근성 평가 보강',
    })
  }
  if (!officialData.medicalEquipment?.length) {
    items.push({
      priority: 'MEDIUM',
      task: '내시경실·초음파·X-ray 장비 현장 확인',
      method: '홈페이지 사진, 원내 안내, HIRA 상세정보 교차 확인',
      effect: '검진 특화 여부 판정 보강',
    })
  }
  if (trendAnalysis.signal === 'warning') {
    items.push({
      priority: 'HIGH',
      task: '원장 변경·리모델링·간판 교체 흔적 확인',
      method: '현장 간판, 블로그 과거 글, 플레이스 사진 날짜 비교',
      effect: '하락 원인과 시장 진입 기회 파악',
    })
  }

  return items.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'HIGH' ? -1 : 1))
}

const computeFallbackAnalysis = ({ spot, clinic, manualReview, officialData, webSignals, sources }) => {
  const reviewCount = toNumber(manualReview.reviewCount) || 0
  const reviewRating = toNumber(manualReview.rating)
  const distance = toNumber(clinic.distance)
  const combined = buildSignalText({ clinic, manualReview, officialData, webSignals })
  const clinicConcept = classifyClinicConcept({ clinic, manualReview, officialData, webSignals })
  const marketingSignal = calcMarketingScore(manualReview, webSignals)
  const nonInsuredSignal = estimateNonInsuredSignal({ clinic, manualReview, officialData, combined })
  const trendAnalysis = classifyManualTrend(manualReview)
  const opportunityAnalysis = findWeaknessOpportunities(manualReview)
  const fieldChecklist = buildFieldChecklist({ manualReview, officialData, trendAnalysis, nonInsuredSignal })

  let medical = 7
  if (hasAny(combined, ['내과', '가정의학', '소화기', '검진'])) medical += 7
  if ((officialData.specialists || []).length > 0) medical += 5
  if (countEquipmentHits(officialData, ['내시경', '초음파', 'x-ray', '엑스선', '방사선', 'ct']) >= 1) medical += 5
  if ((officialData.specialCare || []).length > 0) medical += 3
  if (clinicConcept.primaryKey === 'CHECKUP_SPECIALIZED') medical += 2
  medical = clamp(medical, 0, 25)

  let patientPull = 4
  if (reviewCount >= 1000) patientPull += 10
  else if (reviewCount >= 300) patientPull += 7
  else if (reviewCount >= 80) patientPull += 5
  else if (reviewCount >= 20) patientPull += 3
  if (reviewRating !== null && reviewRating >= 4.6) patientPull += 5
  else if (reviewRating !== null && reviewRating >= 4.2) patientPull += 3
  if ((webSignals.blog?.total || 0) >= 100) patientPull += 4
  else if ((webSignals.blog?.total || 0) >= 20) patientPull += 2
  if (distance !== null && distance <= 500) patientPull += 4
  if (toNumber(manualReview.noonPatientCount) !== null) patientPull += 3
  if (marketingSignal.score >= 70) patientPull += 2
  patientPull = clamp(patientPull, 0, 25)

  let profit = 3
  profit += Math.round(nonInsuredSignal.score * 0.14)
  if (hasAny(combined, ['만성질환', '검진', '내시경', '수액', '영양'])) profit += 3
  profit = clamp(profit, 0, 20)

  const marketing = clamp(Math.round(marketingSignal.score * 0.15), 0, 15)

  let stability = 10
  if (officialData.falseClaim?.possibleMatch) stability -= 7
  if (manualReview.legalIssueMemo) stability -= 4
  if ((officialData.openClose || []).some((item) => String(item.opCloTp || item.opCloTpNm || '').includes('폐'))) stability -= 6
  if (trendAnalysis.signal === 'warning') stability -= 3
  if (trendAnalysis.signal === 'positive') stability += 2
  if (officialData.detail?.estbDd) stability += 2
  if ((sources.detail?.status === 'ok' || sources.departments?.status === 'ok') && !officialData.falseClaim?.possibleMatch) stability += 3
  stability = clamp(stability, 0, 15)

  const competitorStrength = Math.round(medical + patientPull + profit + marketing + stability)

  let collisionScore = clinicConcept.collisionWeight * distanceDecay(distance) * 88
  if (hasAny(combined, ['검진', '내시경'])) collisionScore += 12
  if (hasAny(combined, ['365', '24시간', '야간', '주말'])) collisionScore += 7
  if (reviewCount >= 300) collisionScore += 5
  if (clinicConcept.primaryKey === 'AESTHETIC_NONINSURED' || clinicConcept.primaryKey === 'ORTHO_REHAB') collisionScore -= 8
  const collision = clamp(Math.round(collisionScore), 0, 100)

  const completedSources = Object.values(sources).filter((source) => source.status === 'ok').length
  const usableSources = Object.values(sources).filter((source) => !['pending', 'missing_key', 'blocked'].includes(source.status)).length
  const manualValues = Object.values(manualReview)
  const manualInputs = manualValues.filter((value) => (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== '' &&
    String(value).trim() !== 'unknown'
  )).length
  const confidence = clamp(Math.round((completedSources / Math.max(1, usableSources || 1)) * 35 + (manualInputs / Math.max(1, manualValues.length)) * 50 + (clinic.id ? 10 : 0) + (trendAnalysis.yearly.length >= 2 ? 5 : 0)), 10, 95)

  const revenueGradeScore = clamp(Math.round(nonInsuredSignal.score * 0.42 + patientPull * 1.2 + marketingSignal.score * 0.18 + stability * 0.7), 0, 100)
  const revenuePotential = confidence < 35 ? '판단보류' : gradeFromScore(revenueGradeScore)
  const revenueAnalysis = {
    grade: revenuePotential,
    score: revenueGradeScore,
    confidence: clamp(Math.round((confidence + nonInsuredSignal.confidence) / 2), 10, 95),
    tier1: {
      title: '급여 진료량 신호',
      level: trendAnalysis.yearly.length >= 2 ? trendAnalysis.label : (officialData.topDiseases?.length ? '공식 진료 단서 일부 수신' : '자료 부족'),
      note: trendAnalysis.yearly.length >= 2
        ? '저장된 연도별 진료량/청구건수 흐름을 사용했습니다.'
        : '현재 HIRA 상세 수신값만으로 절대 진료량은 산출하지 않습니다.',
    },
    tier2: {
      title: '비급여 신호',
      level: nonInsuredSignal.label,
      shareRange: nonInsuredSignal.shareRange,
      signals: nonInsuredSignal.signals,
      confidence: nonInsuredSignal.confidence,
    },
    tier3: {
      title: '시장 상대 위치',
      level: reviewCount >= 500 ? '검색/리뷰 노출 상위권 가능성' : reviewCount >= 100 ? '중간권 이상 가능성' : '판단보류',
      note: '동일권 의원 전체 청구건수 비교 API가 붙기 전까지는 리뷰·검색·거리 신호로 보수적으로 판단합니다.',
    },
    disclaimer: 'AI 추정값 · 공개 데이터와 저장된 조사 단서 기반 · 실제 매출 금액을 의미하지 않음',
  }

  const strengths = []
  if (clinicConcept.primaryKey !== 'OTHER') strengths.push(`${clinicConcept.label}로 분류됩니다. ${clinicConcept.summary}`)
  if (medical >= 18) strengths.push('공식 진료과/장비/전문의 신호가 강합니다.')
  if (patientPull >= 17) strengths.push('리뷰·검색량 기준 환자 흡입력 단서가 있습니다.')
  if (profit >= 13) strengths.push(`비급여 신호가 ${nonInsuredSignal.label} 수준입니다.`)
  if (marketing >= 10) strengths.push(`마케팅 집약도가 ${marketingSignal.label} 수준입니다.`)
  if (trendAnalysis.signal === 'positive') strengths.push('저장된 진료량 흐름상 성장 신호가 있습니다.')

  const risks = []
  if (collision >= 70) risks.push('우리 개원 콘셉트와 직접 충돌할 가능성이 큽니다.')
  if (clinicConcept.primaryKey === 'CHECKUP_SPECIALIZED') risks.push('검진·내시경 수요에서 직접 경쟁할 가능성이 높습니다.')
  if (officialData.falseClaim?.possibleMatch) risks.push('거짓청구 공표 페이지 단서가 감지되어 원문 확인이 필요합니다.')
  if (manualReview.legalIssueMemo) risks.push('저장된 법적/행정 이슈 메모가 있습니다.')
  if (reviewRating !== null && reviewRating < 4.0) risks.push('저장된 평점 단서가 낮아 평판 리스크가 있습니다.')
  if (trendAnalysis.signal === 'positive' && collision >= 55) risks.push('성장 중인 직접 경쟁자일 수 있어 진입 난도가 높아질 수 있습니다.')

  const checkItems = []
  if (!manualReview.reviewCount) checkItems.push('네이버/카카오/구글 리뷰 수와 최근 리뷰 흐름 확인')
  if (!manualReview.doctorProfileMemo) checkItems.push('원장 약력, 전문의 여부, 주요 경력 직접 확인')
  if (!manualReview.website) checkItems.push('홈페이지/블로그/플레이스에서 검진·내시경 포지셔닝 확인')
  if (!officialData.medicalEquipment?.length) checkItems.push('내시경실, 초음파, X-ray 등 장비 보유 여부 현장 확인')
  if (!manualReview.legalIssueMemo && webSignals.issue?.total > 0) checkItems.push('뉴스 검색 결과의 법적/행정 이슈 여부 원문 확인')
  fieldChecklist.slice(0, 3).forEach((item) => checkItems.push(`${item.priority}: ${item.task}`))

  return {
    competitorStrength,
    collisionScore: collision,
    revenuePotential,
    confidence,
    breakdown: {
      medical,
      patientPull,
      profit,
      marketing,
      stability,
    },
    clinicConcept,
    revenueAnalysis,
    trendAnalysis,
    marketingSignal,
    nonInsuredSignal,
    opportunityAnalysis,
    fieldChecklist,
    summary: `${clinicConcept.label} 관점에서 표면 경쟁력은 ${competitorStrength}점, Gravo 콘셉트 충돌도는 ${collision}점입니다. 실제 매출이 아닌 공개 데이터와 저장된 조사 단서 기반의 상대 평가입니다.`,
    strengths: strengths.length ? strengths : ['현재 입력 기준으로 뚜렷한 강점은 제한적입니다. 추가 확인이 필요합니다.'],
    risks: risks.length ? risks : ['현재 입력 기준으로 강한 리스크 단서는 제한적입니다.'],
    overlap: [
      clinicConcept.summary,
      hasAny(combined, ['내과', '가정의학']) ? '진료과목이 내과/가정의학과 개원 콘셉트와 겹칩니다.' : '진료과목 직접 충돌 신호는 제한적입니다.',
      hasAny(combined, ['검진', '내시경']) ? '검진/내시경 포지셔닝이 겹칠 수 있습니다.' : '검진/내시경 겹침은 추가 확인이 필요합니다.',
      distance !== null ? `후보지와의 거리는 약 ${distance}m입니다.` : '후보지와의 거리 정보가 없습니다.',
    ],
    checkItems,
    sourceSummary: [
      `공식 소스 ${completedSources}개 수신`,
      `저장 조사 단서 ${manualInputs}/${manualValues.length}개`,
      '리뷰 본문 자동 수집 없이 요약값만 사용',
      '실제 매출 금액·의사 개인 실력·내부 직원 수준은 판단하지 않음',
    ],
  }
}

const refineWithAI = async ({ spot, clinic, manualReview, officialData, webSignals, sources, fallback }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ...fallback, aiNote: 'ANTHROPIC_API_KEY 없음: 룰 기반 분석만 사용' }

  const prompt = `당신은 내과/가정의학과/검진/내시경 공동개원 관점의 경쟁 의원 조사 애널리스트입니다.
아래 공개 데이터와 사용자가 직접 입력한 리뷰 요약만 근거로 경쟁 의원의 표면 경쟁력을 평가하세요.
실제 매출, 의사 실력, 내부 직원 수준은 단정하지 말고 "추정" 또는 "확인 필요"로 표현하세요.
금지: 구체적 매출 금액, 의사 개인 실력 평가, 의료 사고 단정, 비교 광고성 표현.
허용: 비급여 비중 범위, 시장 잠재력 등급, 공개 신호 기반 상대 평가.

반드시 JSON만 응답하세요.
{
  "competitorStrength": 0-100,
  "collisionScore": 0-100,
  "revenuePotential": "매우 높음|높음|보통|낮음|판단보류",
  "confidence": 0-100,
  "breakdown": { "medical": 0-25, "patientPull": 0-25, "profit": 0-20, "marketing": 0-15, "stability": 0-15 },
  "clinicConcept": { "label": "검진/내시경 특화 등", "collisionWeight": 0-1, "confidence": 0-100, "summary": "문장", "signals": ["분류 단서"] },
  "revenueAnalysis": { "grade": "매우 높음|높음|보통|낮음|판단보류", "score": 0-100, "confidence": 0-100, "tier1": {}, "tier2": {}, "tier3": {}, "disclaimer": "면책 문구" },
  "trendAnalysis": { "label": "성장 중|정체|하락 중|판단보류", "signal": "positive|neutral|warning", "summary": "문장", "yearly": [] },
  "marketingSignal": { "score": 0-100, "label": "매우 높음|높음|보통|낮음|판단보류", "notes": ["마케팅 단서"] },
  "opportunityAnalysis": [{ "label": "약점 유형", "evidence": "근거", "opportunity": "우리 기회" }],
  "fieldChecklist": [{ "priority": "HIGH|MEDIUM", "task": "임장 과제", "method": "확인 방법", "effect": "효과" }],
  "summary": "2~3문장",
  "strengths": ["강점"],
  "risks": ["리스크"],
  "overlap": ["우리 개원과 겹치는 지점"],
  "checkItems": ["현장/직접 확인 항목"],
  "sourceSummary": ["근거 요약"]
}

데이터:
${JSON.stringify({ spot, clinic, manualReview, officialData, webSignals, sources, fallback }, null, 2)}`

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1700,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    const data = await response.json()
    if (data.error) throw new Error(data.error.message)
    const text = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(text)
    return {
      ...fallback,
      ...parsed,
      competitorStrength: scoreOrFallback(parsed.competitorStrength, fallback.competitorStrength),
      collisionScore: scoreOrFallback(parsed.collisionScore, fallback.collisionScore),
      confidence: scoreOrFallback(parsed.confidence, fallback.confidence),
      revenuePotential: ['매우 높음', '높음', '보통', '낮음', '판단보류'].includes(parsed.revenuePotential) ? parsed.revenuePotential : fallback.revenuePotential,
      clinicConcept: { ...fallback.clinicConcept, ...(parsed.clinicConcept || {}) },
      revenueAnalysis: { ...fallback.revenueAnalysis, ...(parsed.revenueAnalysis || {}) },
      trendAnalysis: { ...fallback.trendAnalysis, ...(parsed.trendAnalysis || {}) },
      marketingSignal: { ...fallback.marketingSignal, ...(parsed.marketingSignal || {}) },
      nonInsuredSignal: fallback.nonInsuredSignal,
      opportunityAnalysis: Array.isArray(parsed.opportunityAnalysis) ? parsed.opportunityAnalysis : fallback.opportunityAnalysis,
      fieldChecklist: Array.isArray(parsed.fieldChecklist) ? parsed.fieldChecklist : fallback.fieldChecklist,
      aiNote: 'Claude 분석 적용',
    }
  } catch (error) {
    return { ...fallback, aiNote: `AI 분석 실패: ${error.message}` }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const { spot, clinic, manualReview = {} } = req.body || {}
  if (!spot || !clinic) return res.status(400).json({ error: 'spot, clinic 필요' })

  const safeClinic = {
    id: clinic.id,
    hiraId: clean(clinic.hiraId),
    source: clean(clinic.source),
    name: clean(clinic.name),
    type: clean(clinic.type),
    dept: clean(clinic.dept),
    address: clean(clinic.address),
    tel: clean(clinic.tel),
    lat: clinic.lat,
    lng: clinic.lng,
    distance: clinic.distance,
    isCompetitor: !!clinic.isCompetitor,
    webLink: clean(clinic.webLink),
  }

  const safeManual = {
    reviewCount: clean(manualReview.reviewCount),
    rating: clean(manualReview.rating),
    positiveKeywords: clean(manualReview.positiveKeywords),
    negativeKeywords: clean(manualReview.negativeKeywords),
    reviewLink: clean(manualReview.reviewLink),
    website: clean(manualReview.website),
    doctorProfileMemo: clean(manualReview.doctorProfileMemo),
    legalIssueMemo: clean(manualReview.legalIssueMemo),
    naverAd: clean(manualReview.naverAd),
    blogCount: clean(manualReview.blogCount),
    instagramActive: clean(manualReview.instagramActive),
    instagramFollowers: clean(manualReview.instagramFollowers),
    homepageQuality: clean(manualReview.homepageQuality),
    youtubeActive: clean(manualReview.youtubeActive),
    mamcafeMention: clean(manualReview.mamcafeMention),
    nonInsuredStomachEndoscopy: clean(manualReview.nonInsuredStomachEndoscopy),
    nonInsuredColonEndoscopy: clean(manualReview.nonInsuredColonEndoscopy),
    checkupPackagePrice: clean(manualReview.checkupPackagePrice),
    ivTherapyPrice: clean(manualReview.ivTherapyPrice),
    nonInsuredMemo: clean(manualReview.nonInsuredMemo),
    trend2022: clean(manualReview.trend2022),
    trend2023: clean(manualReview.trend2023),
    trend2024: clean(manualReview.trend2024),
    noonPatientCount: clean(manualReview.noonPatientCount),
    parkingSpots: clean(manualReview.parkingSpots),
    parkingType: clean(manualReview.parkingType),
    signVisibility: clean(manualReview.signVisibility),
    facilityAge: clean(manualReview.facilityAge),
    fieldNotes: clean(manualReview.fieldNotes),
  }

  try {
    const [{ official, sources: officialSources }, { signals, sources: searchSources }] = await Promise.all([
      fetchOfficialData(safeClinic),
      findSearchSignals(safeClinic),
    ])
    const sources = { ...officialSources, ...searchSources }
    const fallback = computeFallbackAnalysis({
      spot,
      clinic: safeClinic,
      manualReview: safeManual,
      officialData: official,
      webSignals: signals,
      sources,
    })
    const aiResult = await refineWithAI({
      spot,
      clinic: safeClinic,
      manualReview: safeManual,
      officialData: official,
      webSignals: signals,
      sources,
      fallback,
    })

    return res.status(200).json({
      clinic: safeClinic,
      manualReview: safeManual,
      officialData: official,
      webSignals: signals,
      sources,
      aiResult,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
