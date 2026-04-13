import { useState, useEffect } from 'react'
import MapView from './components/MapView'
import SpotList from './components/SpotList'
import SpotPanel from './components/SpotPanel'
import NearbyPanel from './components/NearbyPanel'
import { subscribeSpots, addSpot, updateSpot, deleteSpot } from './firebase'

export default function App() {
  const [spots, setSpots] = useState([])
  const [selectedSpot, setSelectedSpot] = useState(null)
  const [panelMode, setPanelMode] = useState(null)
  const [newCoords, setNewCoords] = useState(null)
  const [centerOn, setCenterOn] = useState(null)

  useEffect(() => {
    return subscribeSpots(setSpots)
  }, [])

  const handleMapClick = (lat, lng) => {
    setNewCoords({ lat, lng })
    setSelectedSpot(null)
    setPanelMode('new')
  }

  const handleSpotSelect = (spot) => {
    setSelectedSpot(spot)
    setPanelMode('edit')
    setCenterOn({ lat: spot.lat, lng: spot.lng })
  }

  const handleNearbyOpen = (spot) => {
    setSelectedSpot(spot)
    setPanelMode('nearby')
    setCenterOn({ lat: spot.lat, lng: spot.lng })
  }

  const handleSaveNew = async (data) => {
    await addSpot({ ...data, lat: newCoords.lat, lng: newCoords.lng })
    setPanelMode(null)
    setNewCoords(null)
  }

  const handleUpdate = async (id, data) => {
    await updateSpot(id, data)
    setPanelMode(null)
    setSelectedSpot(null)
  }

  const handleDelete = async (id) => {
    await deleteSpot(id)
    setPanelMode(null)
    setSelectedSpot(null)
  }

  const handleClose = () => {
    setPanelMode(null)
    setSelectedSpot(null)
    setNewCoords(null)
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🏥</span>
            <div>
              <h1 className="logo-title">개원 입지 분석</h1>
              <p className="logo-sub">지도를 클릭해 후보지를 추가하세요</p>
            </div>
          </div>
        </div>
        <SpotList
          spots={spots}
          selectedId={selectedSpot?.id}
          onSelect={handleSpotSelect}
          onNearby={handleNearbyOpen}
        />
      </aside>

      <main className="map-area">
        <MapView
          spots={spots}
          centerOn={centerOn}
          selectedSpot={selectedSpot}
          newSpotCoords={newCoords}
          onMapClick={handleMapClick}
          onSpotClick={handleSpotSelect}
        />
        {spots.length === 0 && (
          <div className="map-hint">
            <span>📍 지도를 클릭해 첫 후보지를 추가하세요</span>
          </div>
        )}
      </main>

      {(panelMode === 'new' || panelMode === 'edit') && (
        <SpotPanel
          mode={panelMode}
          spot={selectedSpot}
          coords={newCoords}
          onSave={handleSaveNew}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onClose={handleClose}
          onNearby={() => selectedSpot && handleNearbyOpen(selectedSpot)}
        />
      )}

      {panelMode === 'nearby' && selectedSpot && (
        <NearbyPanel
          spot={selectedSpot}
          onClose={handleClose}
        />
      )}
    </div>
  )
}
