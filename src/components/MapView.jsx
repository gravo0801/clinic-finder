import { useEffect, useRef } from 'react'

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

  // Init map
  useEffect(() => {
    if (!window.naver || mapInstanceRef.current) return

    const map = new window.naver.maps.Map(mapRef.current, {
      center: new window.naver.maps.LatLng(37.5665, 126.978),
      zoom: 14,
      mapTypeControl: false,
      logoControlOptions: {
        position: window.naver.maps.Position.BOTTOM_LEFT,
      },
    })
    mapInstanceRef.current = map

    window.naver.maps.Event.addListener(map, 'click', (e) => {
      onMapClick(e.coord.lat(), e.coord.lng())
    })
  }, [])

  // Sync spot markers
  useEffect(() => {
    if (!mapInstanceRef.current) return

    // Remove markers not in spots anymore
    const currentIds = new Set(spots.map((s) => s.id))
    Object.keys(markersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        markersRef.current[id].setMap(null)
        delete markersRef.current[id]
      }
    })

    // Add or update markers
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
          title: spot.name || '이름 없음',
        })
        window.naver.maps.Event.addListener(marker, 'click', (e) => {
          e.domEvent?.stopPropagation?.()
          onSpotClick(spot)
        })
        markersRef.current[spot.id] = marker
      }
    })
  }, [spots, selectedSpot])

  // Temp marker for new spot
  useEffect(() => {
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
            box-shadow:0 0 0 6px rgba(88,86,214,0.25);
            animation:pulse 1.2s ease-in-out infinite;
          "></div>
          <style>
            @keyframes pulse {
              0%,100%{box-shadow:0 0 0 6px rgba(88,86,214,0.25)}
              50%{box-shadow:0 0 0 12px rgba(88,86,214,0.08)}
            }
          </style>`,
          anchor: new window.naver.maps.Point(18, 18),
        },
      })
    }
  }, [newSpotCoords])

  // Pan to selected spot
  useEffect(() => {
    if (!mapInstanceRef.current || !centerOn) return
    mapInstanceRef.current.panTo(
      new window.naver.maps.LatLng(centerOn.lat, centerOn.lng),
      { duration: 400 }
    )
  }, [centerOn])

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
}
