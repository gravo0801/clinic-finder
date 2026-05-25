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
      note: possibleMatch ? '거짓청구 명단 페이지에서 이름 또는 주소 단서가 감지되었습니다. 수동 확인이 필요합니다.' : '현재 공표 페이지에서 직접 일치 단서는 감지되지 않았습니다.',
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

const computeFallbackAnalysis = ({ spot, clinic, manualReview, officialData, webSignals, sources }) => {
  const reviewCount = toNumber(manualReview.reviewCount) || 0
  const reviewRating = toNumber(manualReview.rating)
  const distance = toNumber(clinic.distance)
  const combined = textBlob(
    clinic.name,
    clinic.dept,
    clinic.type,
    officialData.departments?.join(' '),
    officialData.topDiseases?.join(' '),
    manualReview.positiveKeywords,
    manualReview.negativeKeywords,
    manualReview.doctorProfileMemo,
    webSignals.blog?.items?.map((item) => item.title).join(' '),
    webSignals.local?.items?.map((item) => item.description).join(' '),
  )

  let medical = 7
  if (hasAny(combined, ['내과', '가정의학', '소화기', '검진'])) medical += 7
  if ((officialData.specialists || []).length > 0) medical += 5
  if (countEquipmentHits(officialData, ['내시경', '초음파', 'x-ray', '엑스선', '방사선', 'ct']) >= 1) medical += 5
  if ((officialData.specialCare || []).length > 0) medical += 3
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
  patientPull = clamp(patientPull, 0, 25)

  let profit = 3
  if (hasAny(combined, ['검진', '건강검진', '내시경', '위대장', '수면'])) profit += 9
  if (countEquipmentHits(officialData, ['내시경', '초음파', '방사선', 'x-ray']) >= 2) profit += 5
  if (hasAny(combined, ['비만', '수액', '영양', '예방접종', '만성질환'])) profit += 3
  profit = clamp(profit, 0, 20)

  let marketing = 2
  if (manualReview.website) marketing += 3
  if (manualReview.reviewLink) marketing += 2
  if ((webSignals.local?.total || 0) > 0) marketing += 3
  if ((webSignals.blog?.total || 0) >= 30) marketing += 4
  if (hasAny(combined, ['예약', '상담', '블로그', '홈페이지'])) marketing += 3
  marketing = clamp(marketing, 0, 15)

  let stability = 10
  if (officialData.falseClaim?.possibleMatch) stability -= 7
  if (manualReview.legalIssueMemo) stability -= 4
  if ((officialData.openClose || []).some((item) => String(item.opCloTp || item.opCloTpNm || '').includes('폐'))) stability -= 6
  if (officialData.detail?.estbDd) stability += 2
  if ((sources.detail?.status === 'ok' || sources.departments?.status === 'ok') && !officialData.falseClaim?.possibleMatch) stability += 3
  stability = clamp(stability, 0, 15)

  const competitorStrength = Math.round(medical + patientPull + profit + marketing + stability)

  let collisionScore = 10
  if (hasAny(combined, ['내과'])) collisionScore += 22
  if (hasAny(combined, ['가정의학'])) collisionScore += 14
  if (hasAny(combined, ['검진', '내시경'])) collisionScore += 20
  if (distance !== null && distance <= 300) collisionScore += 20
  else if (distance !== null && distance <= 700) collisionScore += 14
  else if (distance !== null && distance <= 1000) collisionScore += 8
  if (hasAny(combined, ['365', '24시간', '야간', '주말'])) collisionScore += 10
  if (reviewCount >= 300) collisionScore += 8
  const collision = clamp(collisionScore, 0, 100)

  const completedSources = Object.values(sources).filter((source) => source.status === 'ok').length
  const usableSources = Object.values(sources).filter((source) => !['pending', 'missing_key', 'blocked'].includes(source.status)).length
  const manualInputs = [
    manualReview.reviewCount,
    manualReview.rating,
    manualReview.positiveKeywords,
    manualReview.negativeKeywords,
    manualReview.reviewLink,
    manualReview.website,
    manualReview.doctorProfileMemo,
    manualReview.legalIssueMemo,
  ].filter((value) => value !== undefined && value !== null && String(value).trim() !== '').length
  const confidence = clamp(Math.round((completedSources / Math.max(1, usableSources || 1)) * 45 + (manualInputs / 8) * 45 + (clinic.id ? 10 : 0)), 10, 95)

  const revenuePotential =
    confidence < 35 ? '판단보류' :
    competitorStrength >= 76 && profit >= 14 ? '높음' :
    competitorStrength >= 55 || profit >= 10 ? '보통' :
    '낮음'

  const strengths = []
  if (medical >= 18) strengths.push('공식 진료과/장비/전문의 신호가 강합니다.')
  if (patientPull >= 17) strengths.push('리뷰·검색량 기준 환자 흡입력 단서가 있습니다.')
  if (profit >= 13) strengths.push('검진/내시경 또는 비급여형 진료 노출 가능성이 있습니다.')
  if (marketing >= 10) strengths.push('온라인 노출과 상담 동선이 비교적 잘 잡혀 있을 가능성이 있습니다.')

  const risks = []
  if (collision >= 70) risks.push('우리 개원 콘셉트와 직접 충돌할 가능성이 큽니다.')
  if (officialData.falseClaim?.possibleMatch) risks.push('거짓청구 공표 페이지 단서가 감지되어 원문 확인이 필요합니다.')
  if (manualReview.legalIssueMemo) risks.push('수동 입력된 법적/행정 이슈 메모가 있습니다.')
  if (reviewRating !== null && reviewRating < 4.0) risks.push('수동 입력 평점이 낮아 평판 리스크가 있습니다.')

  const checkItems = []
  if (!manualReview.reviewCount) checkItems.push('네이버/카카오/구글 리뷰 수와 최근 리뷰 흐름 확인')
  if (!manualReview.doctorProfileMemo) checkItems.push('원장 약력, 전문의 여부, 주요 경력 수동 확인')
  if (!manualReview.website) checkItems.push('홈페이지/블로그/플레이스에서 검진·내시경 포지셔닝 확인')
  if (!officialData.medicalEquipment?.length) checkItems.push('내시경실, 초음파, X-ray 등 장비 보유 여부 현장 확인')
  if (!manualReview.legalIssueMemo && webSignals.issue?.total > 0) checkItems.push('뉴스 검색 결과의 법적/행정 이슈 여부 원문 확인')

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
    summary: `표면 신호 기준 경쟁력은 ${competitorStrength}점, 충돌도는 ${collision}점입니다. 실제 매출이 아닌 공개 데이터와 수동 리뷰 요약 기반의 상대 평가입니다.`,
    strengths: strengths.length ? strengths : ['현재 입력 기준으로 뚜렷한 강점은 제한적입니다. 추가 확인이 필요합니다.'],
    risks: risks.length ? risks : ['현재 입력 기준으로 강한 리스크 단서는 제한적입니다.'],
    overlap: [
      hasAny(combined, ['내과', '가정의학']) ? '진료과목이 내과/가정의학과 개원 콘셉트와 겹칩니다.' : '진료과목 직접 충돌 신호는 제한적입니다.',
      hasAny(combined, ['검진', '내시경']) ? '검진/내시경 포지셔닝이 겹칠 수 있습니다.' : '검진/내시경 겹침은 추가 확인이 필요합니다.',
      distance !== null ? `후보지와의 거리는 약 ${distance}m입니다.` : '후보지와의 거리 정보가 없습니다.',
    ],
    checkItems,
    sourceSummary: [
      `공식 소스 ${completedSources}개 수신`,
      `수동 입력 ${manualInputs}/8개`,
      '리뷰 본문 자동 수집 없이 요약값만 사용',
    ],
  }
}

const refineWithAI = async ({ spot, clinic, manualReview, officialData, webSignals, sources, fallback }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return { ...fallback, aiNote: 'ANTHROPIC_API_KEY 없음: 룰 기반 분석만 사용' }

  const prompt = `당신은 내과/가정의학과/검진/내시경 공동개원 관점의 경쟁 의원 조사 애널리스트입니다.
아래 공개 데이터와 사용자가 직접 입력한 리뷰 요약만 근거로 경쟁 의원의 표면 경쟁력을 평가하세요.
실제 매출, 의사 실력, 내부 직원 수준은 단정하지 말고 "추정" 또는 "확인 필요"로 표현하세요.

반드시 JSON만 응답하세요.
{
  "competitorStrength": 0-100,
  "collisionScore": 0-100,
  "revenuePotential": "높음|보통|낮음|판단보류",
  "confidence": 0-100,
  "breakdown": { "medical": 0-25, "patientPull": 0-25, "profit": 0-20, "marketing": 0-15, "stability": 0-15 },
  "summary": "2~3문장",
  "strengths": ["강점"],
  "risks": ["리스크"],
  "overlap": ["우리 개원과 겹치는 지점"],
  "checkItems": ["현장/수동 확인 항목"],
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
      competitorStrength: clamp(Math.round(toNumber(parsed.competitorStrength) ?? fallback.competitorStrength), 0, 100),
      collisionScore: clamp(Math.round(toNumber(parsed.collisionScore) ?? fallback.collisionScore), 0, 100),
      confidence: clamp(Math.round(toNumber(parsed.confidence) ?? fallback.confidence), 0, 100),
      revenuePotential: ['높음', '보통', '낮음', '판단보류'].includes(parsed.revenuePotential) ? parsed.revenuePotential : fallback.revenuePotential,
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
    name: clean(clinic.name),
    type: clean(clinic.type),
    dept: clean(clinic.dept),
    address: clean(clinic.address),
    tel: clean(clinic.tel),
    lat: clinic.lat,
    lng: clinic.lng,
    distance: clinic.distance,
    isCompetitor: !!clinic.isCompetitor,
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
