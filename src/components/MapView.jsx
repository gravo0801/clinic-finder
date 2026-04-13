import { useEffect, useRef, useState } from 'react'

const RATING_COLORS = {
  5: '#FF3B30',
  4: '#FF9500',
  3: '#FFCC00',
  2: '#34C759',
  1: '#007AFF',
  0: '#8E8E93',
}

function makeMarkerHtml(color, isSelected) {
  const scale = isSelected ? 1.4 : 1
  return `<div style="
    width:${28 * scale}px;
    height:${28 * scale}px;
    background:${color};
    border:3px solid white;
    border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);
    box-shadow:0 2px 8px rgba(0,0,0,0.35);
    transition:all 0.2s;
  "></div>`
}

function loadNaverScript(clientId) {
  return new Promise((resolve, reject) => {
    // 이미 로드된 경우
    if (window.naver && window.naver.maps) {
      resolve()
      return
    }
    // 이미 스크립트 태그가 있는 경우 기다림
const existing = document.querySelector('script[src*="ncpKeyId"]')
if (existing) {
  if (window.naver && window.naver.maps) { resolve(); return }
  existing.addEventListener('load', resolve)
  existing.addEventListener('error', reject)
  return
}
// 잘못된 파라미터의 기존 스크립트 제거
const oldScript = document.querySelector('script[src*="ncpClientId"]')
if (oldScript) oldScript.remove()
    // 새로 스크립트 삽입
    const script = document.createElement('script')
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`
    script.async = true
    script.onload = resolve
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export default function MapView({
  spots,
  centerOn,
  selectedSpot,
  newSpotCoords,
  onMapClick,
  onSpotClick,
}) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef({})
  const tempMarkerRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)

  // 스크립트 동적 로드 후 지도 초기화
  useEffect(() => {
    const clientId = 'psc3xcgzk6'
    loadNaverScript(clientId)
      .then(() => {
        if (mapInstanceRef.current) return
        const map = new window.naver.maps.Map(mapRef.current, {
          center: new window.naver.maps.LatLng(37.5665, 126.978),
          zoom: 14,
          mapTypeControl: false,
        })
        mapInstanceRef.current = map
        window.naver.maps.Event.addListener(map, 'click', (e) => {
          onMapClick(e.coord.lat(), e.coord.lng())
        })
        setMapReady(true)
      })
      .catch(() => {
        console.error('네이버 지도 스크립트 로드 실패. Client ID를 확인하세요.')
      })
  }, [])

  // 마커 동기화
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return

    const currentIds = new Set(spots.map((s) => s.id))
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        markersRef.current[id].setMap(null)
        delete markersRef.current[id]
      }
    })

    spots.forEach((spot) => {
      const color = RATING_COLORS[spot.rating || 0]
      const isSelected = selectedSpot?.id === spot.id
      const html = makeMarkerHtml(color, isSelected)

      if (markersRef.current[spot.id]) {
        markersRef.current[spot.id].setIcon({
          content: html,
          anchor: new window.naver.maps.Point(14, 28),
        })
      } else {
        const marker = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(spot.lat, spot.lng),
          map: mapInstanceRef.current,
          icon: {
            content: html,
            anchor: new window.naver.maps.Point(14, 28),
          },
        })
        window.naver.maps.Event.addListener(marker, 'click', (e) => {
          e.domEvent?.stopPropagation?.()
          onSpotClick(spot)
        })
        markersRef.current[spot.id] = marker
      }
    })
  }, [spots, selectedSpot, mapReady])

  // 임시 마커 (새 스팟)
  useEffect(() => {
    if (!mapReady) return
    if (tempMarkerRef.current) {
      tempMarkerRef.current.setMap(null)
      tempMarkerRef.current = null
    }
    if (newSpotCoords && mapInstanceRef.current) {
      tempMarkerRef.current = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(newSpotCoords.lat, newSpotCoords.lng),
        map: mapInstanceRef.current,
        icon: {
          content: `<div style="
            width:36px;height:36px;
            background:#5856D6;
            border:3px solid white;
            border-radius:50%;
            box-shadow:0 0 0 8px rgba(88,86,214,0.2);
          "></div>`,
          anchor: new window.naver.maps.Point(18, 18),
        },
      })
    }
  }, [newSpotCoords, mapReady])

  // 지도 이동
  useEffect(() => {
    if (!mapReady || !centerOn || !mapInstanceRef.current) return
    mapInstanceRef.current.panTo(
      new window.naver.maps.LatLng(centerOn.lat, centerOn.lng),
      { duration: 400 }
    )
  }, [centerOn, mapReady])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {!mapReady && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0f0f1a', color: 'rgba(255,255,255,0.4)', fontSize: '14px'
        }}>
          지도 불러오는 중...
        </div>
      )}
    </div>
  )
}
