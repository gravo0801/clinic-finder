import { useEffect, useRef, useState } from 'react'

const RATING_COLORS = {
  5: '#FF3B30', 4: '#FF9500', 3: '#FFCC00',
  2: '#34C759', 1: '#007AFF', 0: '#8E8E93',
}

function makeSpotMarkerHtml(color, isSelected) {
  const scale = isSelected ? 1.4 : 1
  return `<div style="width:${28*scale}px;height:${28*scale}px;background:${color};border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.35);transition:all 0.2s;"></div>`
}

function makeClinicMarkerHtml(icon, color, name) {
  return `<div style="position:relative;display:inline-block;">
    <div class="clinic-marker-pin" style="
      background:${color};
      border:2px solid white;
      border-radius:50%;
      width:32px;height:32px;
      display:flex;align-items:center;justify-content:center;
      font-size:16px;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
      cursor:pointer;
    ">${icon}</div>
    <div class="clinic-marker-tooltip" style="
      position:absolute;
      bottom:38px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.82);color:white;
      padding:4px 10px;border-radius:6px;
      font-size:12px;white-space:nowrap;
      pointer-events:none;
      display:none;
    ">${name}</div>
  </div>
  <style>
    .clinic-marker-pin:hover + .clinic-marker-tooltip,
    .clinic-marker-pin:hover ~ .clinic-marker-tooltip { display:block !important; }
  </style>`
}

export default function MapView({
  spots, centerOn, selectedSpot, newSpotCoords,
  markedClinics = [],
  onMapClick, onSpotClick
}) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersRef = useRef({})
  const clinicMarkersRef = useRef({})
  const tempMarkerRef = useRef(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (window.naver && window.naver.maps) { initMap(); return }
    document.querySelectorAll('script[src*="maps.js"]').forEach((s) => s.remove())
    const script = document.createElement('script')
    script.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=psc3xcgzk6'
    script.async = true
    script.onload = () => initMap()
    script.onerror = () => console.error('네이버 지도 로드 실패')
    document.head.appendChild(script)
  }, [])

  function initMap() {
    if (mapInstanceRef.current || !mapRef.current) return
    try {
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
    } catch (e) {
      console.error('지도 초기화 오류:', e)
    }
  }

  // 스팟 마커
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.naver?.maps) return
    const currentIds = new Set(spots.map((s) => s.id))
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentIds.has(id)) { markersRef.current[id].setMap(null); delete markersRef.current[id] }
    })
    spots.forEach((spot) => {
      if (!spot.lat || !spot.lng) return
      const color = RATING_COLORS[spot.rating || 0]
      const isSelected = selectedSpot?.id === spot.id
      const html = makeSpotMarkerHtml(color, isSelected)
      if (markersRef.current[spot.id]) {
        markersRef.current[spot.id].setIcon({ content: html, anchor: new window.naver.maps.Point(14, 28) })
      } else {
        const marker = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(spot.lat, spot.lng),
          map: mapInstanceRef.current,
          icon: { content: html, anchor: new window.naver.maps.Point(14, 28) },
          zIndex: 100,
        })
        window.naver.maps.Event.addListener(marker, 'click', (e) => {
          e.domEvent?.stopPropagation?.()
          onSpotClick(spot)
        })
        markersRef.current[spot.id] = marker
      }
    })
  }, [spots, selectedSpot, mapReady])

  // 의원 마커 (마킹된 것만)
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !window.naver?.maps) return

    // 기존 의원 마커 전부 제거
    Object.values(clinicMarkersRef.current).forEach((m) => m.setMap(null))
    clinicMarkersRef.current = {}

    // 새로 그리기
    markedClinics.forEach((clinic) => {
      if (!clinic.lat || !clinic.lng) return
      const { icon, color } = clinic.markerStyle
      const html = makeClinicMarkerHtml(icon, color, clinic.name)
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(clinic.lat, clinic.lng),
        map: mapInstanceRef.current,
        icon: { content: html, anchor: new window.naver.maps.Point(16, 16) },
        title: clinic.name,
        zIndex: 50,
      })
      clinicMarkersRef.current[clinic.id] = marker
    })
  }, [markedClinics, mapReady])

  // 임시 마커
  useEffect(() => {
    if (!mapReady || !window.naver?.maps) return
    if (tempMarkerRef.current) { tempMarkerRef.current.setMap(null); tempMarkerRef.current = null }
    if (newSpotCoords && mapInstanceRef.current) {
      tempMarkerRef.current = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(newSpotCoords.lat, newSpotCoords.lng),
        map: mapInstanceRef.current,
        icon: {
          content: `<div style="width:36px;height:36px;background:#5856D6;border:3px solid white;border-radius:50%;box-shadow:0 0 0 8px rgba(88,86,214,0.2);"></div>`,
          anchor: new window.naver.maps.Point(18, 18),
        },
        zIndex: 200,
      })
    }
  }, [newSpotCoords, mapReady])

  // 지도 이동
  useEffect(() => {
    if (!mapReady || !centerOn || !mapInstanceRef.current || !window.naver?.maps) return
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
          background: '#0f0f1a', color: 'rgba(255,255,255,0.4)', fontSize: '14px',
        }}>
          지도 불러오는 중...
        </div>
      )}
    </div>
  )
}
