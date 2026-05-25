const API_TIMEOUT_MS = 10000

const sourceState = (enabled) => ({
  configured: Boolean(enabled),
  status: enabled ? 'pending' : 'missing_key',
})

const blockedState = { configured: true, status: 'blocked' }

const sgisBaseUrls = () =>
  unique([
    process.env.SGIS_API_BASE,
    'https://sgisapi.kostat.go.kr',
    'https://sgisapi.mods.go.kr',
  ])

const parseNumber = (value) => {
  if (value === undefined || value === null || value === '' || value === 'N/A') return 0
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const unique = (items) => [...new Set(items.filter(Boolean))]

const formatYm = (date) =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`

const previousMonths = (count, startOffset = 1) => {
  const now = new Date()
  return Array.from({ length: count }, (_, index) =>
    formatYm(new Date(now.getFullYear(), now.getMonth() - startOffset - index, 1)),
  )
}

const recentQuarterMonths = (count) => {
  const now = new Date()
  const currentQuarterStart = Math.floor(now.getMonth() / 3) * 3
  return Array.from({ length: count }, (_, index) => {
    const month = currentQuarterStart - (index * 3)
    return formatYm(new Date(now.getFullYear(), month, 1))
  })
}

const serviceKeyParam = (key) => (String(key).includes('%') ? key : encodeURIComponent(key))

const fetchWithTimeout = async (url, options = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const fetchJson = async (url, options) => {
  const response = await fetchWithTimeout(url, options)
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { rawText: text, status: response.status }
  }
}

const fetchJsonRetry = async (url, options, attempts = 2) => {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetchJson(url, options)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

const itemsFrom = (payload) => {
  if (payload?.rawText || (typeof payload?.status === 'number' && payload.status >= 400)) return []
  const body = payload?.response?.body || payload?.body || payload
  const items = body?.items?.item || body?.items || body?.item || body
  if (!items) return []
  return Array.isArray(items) ? items : [items]
}

const firstItem = (payload) => itemsFrom(payload)[0] || null

const pick = (object, keys) => {
  for (const key of keys) {
    if (object?.[key] !== undefined && object?.[key] !== null && object?.[key] !== '') {
      return object[key]
    }
  }
  return undefined
}

const getNaverMapKeys = () => ({
  clientId:
    process.env.NAVER_MAPS_CLIENT_ID ||
    process.env.NAVER_MAP_CLIENT_ID ||
    process.env.NAVER_CLOUD_CLIENT_ID ||
    process.env.NAVER_SEARCH_CLIENT_ID,
  clientSecret:
    process.env.NAVER_MAPS_CLIENT_SECRET ||
    process.env.NAVER_MAP_CLIENT_SECRET ||
    process.env.NAVER_CLOUD_CLIENT_SECRET ||
    process.env.NAVER_SEARCH_CLIENT_SECRET,
})

const getSgisCredentials = () => ({
  serviceId: process.env.SGIS_SERVICE_ID,
  securityKey: process.env.SGIS_SECURITY_KEY,
})

const getSgisAccess = async () => {
  const { serviceId, securityKey } = getSgisCredentials()
  if (!serviceId || !securityKey) return null

  const errors = []
  for (const baseUrl of sgisBaseUrls()) {
    try {
      const tokenData = await fetchJsonRetry(
        `${baseUrl}/OpenAPI3/auth/authentication.json?consumer_key=${encodeURIComponent(serviceId)}&consumer_secret=${encodeURIComponent(securityKey)}`,
      )
      const token = tokenData.result?.accessToken
      if (!token) throw new Error(tokenData.errMsg || tokenData.rawText || 'SGIS accessToken 발급 실패')
      return { token, baseUrl }
    } catch (error) {
      errors.push(`${baseUrl.replace('https://', '')}: ${error.message}`)
    }
  }

  throw new Error(errors.join(' / ') || 'SGIS accessToken 발급 실패')
}

const buildRegionInfo = (source, data) => {
  const admCode = String(data.admCode || data.adm_cd || data.adm_dr_cd || data.emdong_cd || data.cd || '')
  const sidoCode = String(data.sido_cd || '')
  const sggCode = String(data.sgg_cd || '')
  const lawdCd = String(
    data.lawdCd ||
    (sggCode.length >= 5 ? sggCode.slice(0, 5) : '') ||
    (sidoCode && sggCode.length === 3 ? `${sidoCode}${sggCode}` : ''),
  )
  const extraCandidates = Array.isArray(data.sgisCandidates) ? data.sgisCandidates : []

  return {
    provider: source,
    sido: data.sido || data.sido_nm || '',
    sigungu: data.sigungu || data.sgg_nm || '',
    dong: data.dong || data.emdong_nm || data.addr_name || '',
    admCode,
    sgisCandidates: unique([
      ...extraCandidates.map(String),
      admCode,
      admCode.slice(0, 7),
      admCode.slice(0, 5),
      sggCode,
      sidoCode && sggCode.length === 3 ? `${sidoCode}${sggCode}` : '',
    ]),
    lawdCd,
  }
}

const getRegionInfoFromQuery = (query) => {
  const admCode = String(query.admCode || '')
  const lawdCd = String(query.lawdCd || '')
  if (!admCode && !lawdCd) return null

  return buildRegionInfo('BrowserNaver', {
    sido: query.sido,
    sigungu: query.sigungu,
    dong: query.dong,
    admCode,
    lawdCd,
    sgisCandidates: String(query.sgisCandidates || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  })
}

const getNaverRegionInfo = async (lat, lng) => {
  const { clientId, clientSecret } = getNaverMapKeys()
  if (!clientId || !clientSecret) return null

  const url = `https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc?coords=${lng},${lat}&orders=admcode,addr&output=json`
  const data = await fetchJson(url, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': clientId,
      'X-NCP-APIGW-API-KEY': clientSecret,
    },
  })

  if (data.error || data.status >= 400) {
    throw new Error(data.error?.message || data.message || `HTTP ${data.status}`)
  }

  const adm = data.results?.find((item) => item.name === 'admcode')
  const addr = data.results?.find((item) => item.name === 'addr')
  const code = adm?.code?.id || ''
  const lawCode = addr?.code?.id || code
  if (!adm && !addr) return null

  return buildRegionInfo('Naver', {
    sido: adm?.region?.area1?.name || addr?.region?.area1?.name || '',
    sigungu: adm?.region?.area2?.name || addr?.region?.area2?.name || '',
    dong: adm?.region?.area3?.name || addr?.region?.area3?.name || '',
    admCode: code,
    lawdCd: lawCode.slice(0, 5),
  })
}

const getSgisRegionInfo = async (lat, lng) => {
  const access = await getSgisAccess()
  if (!access?.token) return null

  const url = `${access.baseUrl}/OpenAPI3/addr/rgeocodewgs84.json?accessToken=${encodeURIComponent(access.token)}&x_coor=${lng}&y_coor=${lat}&addr_type=20`
  const data = await fetchJsonRetry(url)
  if (data.errCd && Number(data.errCd) !== 0) throw new Error(data.errMsg || 'SGIS 역지오코딩 실패')

  const result = Array.isArray(data.result) ? data.result[0] : data.result
  if (!result) return null
  return buildRegionInfo('SGIS', result)
}

const getRegionInfo = async (lat, lng, sources, warnings) => {
  const { clientId, clientSecret } = getNaverMapKeys()
  const { serviceId, securityKey } = getSgisCredentials()
  sources.region = sourceState((clientId && clientSecret) || (serviceId && securityKey))

  if ((!clientId || !clientSecret) && (!serviceId || !securityKey)) {
    warnings.push('행정구역 코드 조회 키가 없어 SGIS/주민등록/실거래가 조회를 건너뜁니다.')
    return {}
  }

  const regionErrors = []

  try {
    const naverInfo = await getNaverRegionInfo(lat, lng)
    if (naverInfo?.admCode || naverInfo?.lawdCd) {
      sources.region.status = 'ok'
      return naverInfo
    }
  } catch (error) {
    regionErrors.push(`네이버 ${error.message}`)
  }

  try {
    const sgisInfo = await getSgisRegionInfo(lat, lng)
    if (sgisInfo?.admCode || sgisInfo?.lawdCd) {
      sources.region.status = 'ok'
      return sgisInfo
    }
  } catch (error) {
    regionErrors.push(`SGIS ${error.message}`)
  }

  sources.region.status = regionErrors.length ? 'error' : 'empty'
  if (regionErrors.length) {
    warnings.push(`행정구역 조회 실패: ${regionErrors.join(' / ')}`)
  } else {
    warnings.push('좌표에 맞는 행정구역 코드를 찾지 못했습니다.')
  }

  return {}
}

const getSgisData = async (regionInfo, sources, warnings) => {
  const { serviceId, securityKey } = getSgisCredentials()
  sources.sgis = sourceState(serviceId && securityKey)

  if (!serviceId || !securityKey) return {}
  if (!regionInfo.sgisCandidates?.length) {
    sources.sgis = blockedState
    return {}
  }

  try {
    const access = await getSgisAccess()
    const token = encodeURIComponent(access.token)
    const baseUrl = access.baseUrl

    for (const admCd of regionInfo.sgisCandidates) {
      const [summaryResult, genderResult, totalResult] = await Promise.allSettled([
        fetchJsonRetry(`${baseUrl}/OpenAPI3/startupbiz/pplsummary.json?accessToken=${token}&adm_cd=${admCd}`),
        fetchJsonRetry(`${baseUrl}/OpenAPI3/startupbiz/mfratiosummary.json?accessToken=${token}&adm_cd=${admCd}`),
        fetchJsonRetry(`${baseUrl}/OpenAPI3/stats/population.json?accessToken=${token}&year=2020&adm_cd=${admCd}&low_search=0`),
      ])
      const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : {}
      const gender = genderResult.status === 'fulfilled' ? genderResult.value : {}
      const total = totalResult.status === 'fulfilled' ? totalResult.value : {}
      const age = summary.result?.[0]
      const sex = gender.result?.[0]
      const population = total.result?.[0]
      if (age || sex || population) {
        sources.sgis.status = 'ok'
        return {
          sgisSummary: age || null,
          sgisGender: sex || null,
          sgisPopulation: population || null,
          population: {
            total: parseNumber(sex?.total_ppl || population?.tot_ppltn),
            male: parseNumber(sex?.m_ppl),
            female: parseNumber(sex?.f_ppl),
            age20: parseNumber(age?.twenty_cnt),
            age30: parseNumber(age?.thirty_cnt),
            age40: parseNumber(age?.forty_cnt),
            age50: parseNumber(age?.fifty_cnt),
            age60: parseNumber(age?.sixty_cnt) + parseNumber(age?.seventy_more_than_cnt),
            avgAge: parseNumber(population?.avg_age),
            density: parseNumber(population?.ppltn_dnsty),
            year: '2020',
            source: 'SGIS 인구주택총조사/생활업종 요약',
          },
        }
      }
    }

    sources.sgis.status = 'empty'
    return {}
  } catch (error) {
    sources.sgis.status = 'error'
    warnings.push(`SGIS 조회 실패: ${error.message}`)
    return {}
  }
}

const getResidentData = async (regionInfo, sources, warnings) => {
  const key = process.env.RESIDENT_API_KEY
  sources.resident = sourceState(key)
  if (!key) return {}
  if (!regionInfo.admCode) {
    sources.resident = blockedState
    return {}
  }

  const periods = previousMonths(4)
  const admCodes = unique([regionInfo.admCode, regionInfo.admCode.slice(0, 8), regionInfo.admCode.slice(0, 7)])

  try {
    for (const period of periods) {
      for (const admCd of admCodes) {
        const url = `https://apis.data.go.kr/1741000/residentService2/residentInfoList2?serviceKey=${serviceKeyParam(key)}&adm_cd=${admCd}&stdr_de_cd=${period}&numOfRows=100&pageNo=1&type=json`
        const data = await fetchJson(url)
        const items = itemsFrom(data)
        if (items.length > 0 && !data?.response?.header?.resultCode) {
          sources.resident.status = 'ok'
          const first = items[0]
          return {
            residentPop: items,
            residentPeriod: period,
            residentPopulation: {
              total: parseNumber(pick(first, ['totNmprCnt', 'tot_ppltn_co', 'tot_ppltn', 'totalPopulation'])),
              household: parseNumber(pick(first, ['hhCnt', 'household_cnt', 'totHshldCnt'])),
              male: parseNumber(pick(first, ['maleNmprCnt', 'ml_ppltn_co'])),
              female: parseNumber(pick(first, ['femlNmprCnt', 'fml_ppltn_co'])),
              source: '행정안전부 주민등록 인구',
            },
          }
        }
      }
    }
    sources.resident.status = 'empty'
    return {}
  } catch (error) {
    sources.resident.status = 'error'
    warnings.push(`주민등록 인구 조회 실패: ${error.message}`)
    return {}
  }
}

const normalizeCommercialSale = (items) => {
  const list = Array.isArray(items) ? items : []
  const medicalWords = ['의료', '병원', '의원', '보건', '클리닉', '내과', '검진']
  const saleValue = (item) => parseNumber(pick(item, ['tot_selng_amt', 'selng_amt', 'thsmon_selng_amt', 'saleAmount', 'amount']))
  const storeValue = (item) => parseNumber(pick(item, ['tot_store_co', 'store_co', 'stor_co', 'storeCount']))
  const totalSale = list.reduce((sum, item) => sum + saleValue(item), 0)
  const medicalSale = list
    .filter((item) => medicalWords.some((word) => String(Object.values(item).join(' ')).includes(word)))
    .reduce((sum, item) => sum + saleValue(item), 0)
  const storeCount = list.reduce((sum, item) => sum + storeValue(item), 0)
  const perStoreSale = storeCount > 0 ? Math.round(totalSale / storeCount) : 0
  return { totalSale, medicalSale, storeCount, perStoreSale, items: list }
}

const getCommercialData = async (lat, lng, sources, warnings) => {
  const key = process.env.SMALL_BIZ_API_KEY
  sources.smallBiz = sourceState(key)
  if (!key) return {}

  try {
    const base = 'https://apis.data.go.kr/B553077/api/open'
    const areaData = await fetchJson(`${base}/sdpAreaCd/areaListCdEx?serviceKey=${serviceKeyParam(key)}&pageNo=1&numOfRows=5&radius=500&cx=${lng}&cy=${lat}&type=json`)
    const areaItems = itemsFrom(areaData)
    const area = areaItems[0]
    const trarNo = pick(area, ['trdar_cd', 'trarNo', 'trar_no', 'key'])
    const areaName = pick(area, ['trdar_cd_nm', 'mainTrarNm', 'trarNm', 'areaNm'])

    if (!trarNo) {
      sources.smallBiz.status = 'empty'
      return {}
    }

    for (const stdYm of recentQuarterMonths(6)) {
      const [saleData, floatingData, residentData] = await Promise.all([
        fetchJson(`${base}/sdpSaleAmount/areaList?serviceKey=${serviceKeyParam(key)}&trarNo=${trarNo}&stdYm=${stdYm}&type=json`),
        fetchJson(`${base}/sdpFloatingPopulation/areaList?serviceKey=${serviceKeyParam(key)}&trarNo=${trarNo}&stdYm=${stdYm}&type=json`),
        fetchJson(`${base}/sdpResidentPopulation/areaList?serviceKey=${serviceKeyParam(key)}&trarNo=${trarNo}&stdYm=${stdYm}&type=json`),
      ])
      const saleItems = itemsFrom(saleData)
      const floatingItems = itemsFrom(floatingData)
      const residentItems = itemsFrom(residentData)
      if (saleItems.length || floatingItems.length || residentItems.length) {
        const floating = firstItem(floatingData) || {}
        const resident = firstItem(residentData) || {}
        sources.smallBiz.status = 'ok'
        return {
          commercialArea: { name: areaName || String(trarNo), code: trarNo, raw: area },
          commercialSale: normalizeCommercialSale(saleItems),
          floatingPop: {
            total: parseNumber(pick(floating, ['tot_flpop_co', 'totFlpopCo', 'total'])),
            am: parseNumber(pick(floating, ['am_flpop_co', 'amFlpopCo'])),
            pm: parseNumber(pick(floating, ['pm_flpop_co', 'pmFlpopCo'])),
            raw: floatingItems,
          },
          residentInfo: [{
            tot_ppltn_co: parseNumber(pick(resident, ['tot_ppltn_co', 'totPpltnCo', 'total'])),
            ml_ppltn_co: parseNumber(pick(resident, ['ml_ppltn_co', 'mlPpltnCo'])),
            fml_ppltn_co: parseNumber(pick(resident, ['fml_ppltn_co', 'fmlPpltnCo'])),
            ppltn_co_20: parseNumber(pick(resident, ['ppltn_co_20', 'ppltnCo20'])),
            ppltn_co_30: parseNumber(pick(resident, ['ppltn_co_30', 'ppltnCo30'])),
            ppltn_co_40: parseNumber(pick(resident, ['ppltn_co_40', 'ppltnCo40'])),
            ppltn_co_50: parseNumber(pick(resident, ['ppltn_co_50', 'ppltnCo50'])),
            ppltn_co_60: parseNumber(pick(resident, ['ppltn_co_60', 'ppltnCo60'])),
            raw: resident,
          }],
          commercialPeriod: stdYm,
        }
      }
    }

    sources.smallBiz.status = 'empty'
    return { commercialArea: { name: areaName || String(trarNo), code: trarNo, raw: area } }
  } catch (error) {
    sources.smallBiz.status = 'error'
    warnings.push(`소상공인 상권 조회 실패: ${error.message}`)
    return {}
  }
}

const parseApartmentPrices = (text) => {
  const prices = []
  const patterns = [
    /<dealAmount>([^<]+)<\/dealAmount>/g,
    /<거래금액>([^<]+)<\/거래금액>/g,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const price = parseNumber(match[1])
      if (price > 0) prices.push(price)
    }
  }
  return prices
}

const getApartmentData = async (regionInfo, sources, warnings) => {
  const key = process.env.REALESTATE_API_KEY
  sources.realEstate = sourceState(key)
  if (!key) return {}
  if (!regionInfo.lawdCd) {
    sources.realEstate = blockedState
    return {}
  }

  try {
    for (const dealYm of previousMonths(6, 0)) {
      const url = `https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade?serviceKey=${serviceKeyParam(key)}&LAWD_CD=${regionInfo.lawdCd}&DEAL_YMD=${dealYm}&numOfRows=100&pageNo=1`
      const response = await fetchWithTimeout(url)
      const text = await response.text()
      const prices = parseApartmentPrices(text)
      if (prices.length > 0) {
        sources.realEstate.status = 'ok'
        return {
          aptPrice: {
            avg: Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length),
            max: Math.max(...prices),
            min: Math.min(...prices),
            count: prices.length,
            dealYm,
            unit: '만원',
            note: '아파트 실거래가는 소득수준을 직접 의미하지 않는 대리 지표입니다.',
          },
        }
      }
    }

    sources.realEstate.status = 'empty'
    return {}
  } catch (error) {
    sources.realEstate.status = 'error'
    warnings.push(`아파트 실거래가 조회 실패: ${error.message}`)
    return {}
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')
  res.setHeader('Cache-Control', 'no-store, max-age=0')

  const lat = Number(req.query.lat)
  const lng = Number(req.query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat, lng 숫자 좌표가 필요합니다.' })
  }

  const sources = {}
  const warnings = []
  const browserRegionInfo = getRegionInfoFromQuery(req.query)
  if (browserRegionInfo) {
    sources.region = { configured: true, status: 'ok' }
  }

  const regionInfo = browserRegionInfo || await getRegionInfo(lat, lng, sources, warnings)

  const [sgisData, residentData, commercialData, apartmentData] = await Promise.all([
    getSgisData(regionInfo, sources, warnings),
    getResidentData(regionInfo, sources, warnings),
    getCommercialData(lat, lng, sources, warnings),
    getApartmentData(regionInfo, sources, warnings),
  ])

  const population =
    sgisData.population?.total > 0 ? sgisData.population :
    commercialData.residentInfo?.[0]?.tot_ppltn_co > 0 ? {
      total: commercialData.residentInfo[0].tot_ppltn_co,
      male: commercialData.residentInfo[0].ml_ppltn_co,
      female: commercialData.residentInfo[0].fml_ppltn_co,
      age20: commercialData.residentInfo[0].ppltn_co_20,
      age30: commercialData.residentInfo[0].ppltn_co_30,
      age40: commercialData.residentInfo[0].ppltn_co_40,
      age50: commercialData.residentInfo[0].ppltn_co_50,
      age60: commercialData.residentInfo[0].ppltn_co_60,
      source: '소상공인 상권 상주인구',
    } :
    residentData.residentPopulation?.total > 0 ? residentData.residentPopulation :
    null

  return res.status(200).json({
    regionInfo,
    warnings,
    sources,
    population,
    ...sgisData,
    ...residentData,
    ...commercialData,
    ...apartmentData,
  })
}
