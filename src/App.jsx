import { useEffect, useState } from 'react'
import MapView from './components/MapView'
import SpotList from './components/SpotList'
import SpotPanel from './components/SpotPanel'
import NearbyPanel from './components/NearbyPanel'
import AIAnalysisPanel from './components/AIAnalysisPanel'
import ChecklistPanel from './components/ChecklistPanel'
import SearchBar from './components/SearchBar'
import ComparePanel from './components/ComparePanel'
import MigrationBanner from './components/MigrationBanner'
import { subscribeSpots, addSpot, updateSpot, deleteSpot, subscribePinnedClinics } from './firebase'

export default function App() {
  const [spots, setSpots] = useState([])
  const [selectedSpot, setSelectedSpot] = useState(null)
  const [panelMode, setPanelMode] = useState(null)
  const [newCoords, setNewCoords] = useState(null)
  const [centerOn, setCenterOn] = useState(null)
  const [nearbyClinics, setNearbyClinics] = useState([])
  const [markedClinics, setMarkedClinics] = useState([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => subscribeSpots(setSpots), [])

  useEffect(() => {
    if (!selectedSpot?.id) {
      setMarkedClinics([])
      return undefined
    }
    return subscribePinnedClinics(selectedSpot.id, setMarkedClinics)
  }, [selectedSpot?.id])

  const handleMapClick = (lat, lng) => {
    setSidebarCollapsed(true)
    setNewCoords({ lat, lng })
    setSelectedSpot(null)
    setPanelMode('new')
  }

  const handleSpotSelect = (spot) => {
    setSidebarCollapsed(true)
    setSelectedSpot(spot)
    setPanelMode('edit')
    setCenterOn({ lat: spot.lat, lng: spot.lng })
  }

  const handleNearbyOpen = (spot) => {
    setSelectedSpot(spot)
    setPanelMode('nearby')
    setNearbyClinics([])
    setCenterOn({ lat: spot.lat, lng: spot.lng })
  }

  const handleAIOpen = (spot) => {
    setSelectedSpot(spot)
    setPanelMode('ai')
    setCenterOn({ lat: spot.lat, lng: spot.lng })
  }

  const handleChecklistOpen = (spot) => {
    setSelectedSpot(spot)
    setPanelMode('checklist')
    setCenterOn({ lat: spot.lat, lng: spot.lng })
  }

  const handleCompareOpen = () => {
    setSelectedSpot(null)
    setPanelMode('compare')
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

  const handleSearchSelect = (place) => {
    setCenterOn({ lat: place.lat, lng: place.lng })
  }

  const handleSidebarHeaderClick = () => {
    if (window.matchMedia('(max-width: 768px)').matches) {
      setSidebarCollapsed((collapsed) => !collapsed)
    }
  }

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div
          className="sidebar-header"
          onClick={handleSidebarHeaderClick}
        >
          <div className="logo">
            <span className="logo-icon">🏥</span>
            <div>
              <h1 className="logo-title">개원 입지 분석</h1>
              <p className="logo-sub">
                {sidebarCollapsed ? '눌러서 후보지 목록 열기' : '지도를 클릭해 후보지를 추가하세요'}
              </p>
            </div>
          </div>

          <button
            className="sidebar-action"
            onClick={(event) => {
              event.stopPropagation()
              handleCompareOpen()
            }}
          >
            후보지 비교
          </button>
        </div>

        <SpotList
          spots={spots}
          selectedId={selectedSpot?.id}
          onSelect={handleSpotSelect}
          onNearby={handleNearbyOpen}
          onAI={handleAIOpen}
          onChecklist={handleChecklistOpen}
        />
      </aside>

      <main className="map-area">
        <MigrationBanner />
        <div className="map-searchbar">
          <SearchBar onSelectPlace={handleSearchSelect} />
        </div>
        <MapView
          spots={spots}
          centerOn={centerOn}
          selectedSpot={selectedSpot}
          newSpotCoords={newCoords}
          markedClinics={markedClinics}
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
          onAI={() => selectedSpot && handleAIOpen(selectedSpot)}
          onChecklist={() => selectedSpot && handleChecklistOpen(selectedSpot)}
        />
      )}

      {panelMode === 'nearby' && selectedSpot && (
        <NearbyPanel
          spot={selectedSpot}
          onClose={handleClose}
          onClinicsLoaded={setNearbyClinics}
          onMarkedClinicsChange={setMarkedClinics}
        />
      )}

      {panelMode === 'ai' && selectedSpot && (
        <AIAnalysisPanel spot={selectedSpot} nearbyClinics={nearbyClinics} onClose={handleClose} />
      )}

      {panelMode === 'checklist' && selectedSpot && (
        <ChecklistPanel spot={selectedSpot} onClose={handleClose} />
      )}

      {panelMode === 'compare' && (
        <ComparePanel spots={spots} onClose={handleClose} onSelect={handleSpotSelect} />
      )}
    </div>
  )
}
