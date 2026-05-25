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
import AreaAnalysisPanel from './components/AreaAnalysisPanel'
import CompetitorReportPanel from './components/CompetitorReportPanel'
import ClinicSearchPanel from './components/ClinicSearchPanel'
import SavedClinicList from './components/SavedClinicList'
import BuildingList from './components/BuildingList'
import BuildingWatchPanel from './components/BuildingWatchPanel'
import { subscribeSpots, addSpot, updateSpot, deleteSpot, subscribePinnedClinics, subscribeSavedClinics, subscribeSavedBuildings } from './firebase'

export default function App() {
  const [spots, setSpots] = useState([])
  const [selectedSpot, setSelectedSpot] = useState(null)
  const [panelMode, setPanelMode] = useState(null)
  const [newCoords, setNewCoords] = useState(null)
  const [buildingCoords, setBuildingCoords] = useState(null)
  const [centerOn, setCenterOn] = useState(null)
  const [nearbyClinics, setNearbyClinics] = useState([])
  const [markedClinics, setMarkedClinics] = useState([])
  const [savedClinics, setSavedClinics] = useState([])
  const [savedBuildings, setSavedBuildings] = useState([])
  const [selectedClinic, setSelectedClinic] = useState(null)
  const [selectedBuilding, setSelectedBuilding] = useState(null)
  const [activeSidebarTab, setActiveSidebarTab] = useState('spots')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => subscribeSpots(setSpots), [])
  useEffect(() => subscribeSavedClinics(setSavedClinics), [])
  useEffect(() => subscribeSavedBuildings(setSavedBuildings), [])

  useEffect(() => {
    if (!selectedSpot?.id) {
      setMarkedClinics([])
      return undefined
    }
    return subscribePinnedClinics(selectedSpot.id, setMarkedClinics)
  }, [selectedSpot?.id])

  const handleMapClick = (lat, lng) => {
    setSidebarCollapsed(true)
    if (activeSidebarTab === 'buildings') {
      setBuildingCoords({ lat, lng })
      setSelectedBuilding(null)
      setSelectedSpot(null)
      setSelectedClinic(null)
      setPanelMode('buildingNew')
      return
    }
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

  const handleAreaOpen = (spot) => {
    setSelectedSpot(spot)
    setPanelMode('area')
    setCenterOn({ lat: spot.lat, lng: spot.lng })
  }

  const handleCompareOpen = () => {
    setSelectedSpot(null)
    setSelectedClinic(null)
    setSelectedBuilding(null)
    setPanelMode('compare')
  }

  const handleClinicSearchOpen = () => {
    setSelectedSpot(null)
    setSelectedClinic(null)
    setSelectedBuilding(null)
    setPanelMode('clinicSearch')
  }

  const handleRecoveryOpen = () => {
    setSelectedSpot(null)
    setSelectedClinic(null)
    setSelectedBuilding(null)
    setPanelMode('recovery')
  }

  const handleCompetitorOpen = (spot, clinic) => {
    setSelectedSpot(spot)
    setSelectedClinic(clinic)
    setPanelMode('competitor')
    setCenterOn({ lat: clinic.lat || spot.lat, lng: clinic.lng || spot.lng })
  }

  const handleSavedClinicOpen = (clinic) => {
    setSelectedSpot(null)
    setSelectedClinic(clinic)
    setSelectedBuilding(null)
    setPanelMode('clinicReport')
    if (clinic.lat && clinic.lng) setCenterOn({ lat: clinic.lat, lng: clinic.lng })
  }

  const handleClinicMarkerClick = (clinic, meta = {}) => {
    if (meta.source === 'marked' && selectedSpot?.id) {
      handleCompetitorOpen(selectedSpot, clinic)
      return
    }
    handleSavedClinicOpen(clinic)
  }

  const handleBuildingAdd = () => {
    setSelectedSpot(null)
    setSelectedClinic(null)
    setSelectedBuilding(null)
    setBuildingCoords(centerOn)
    setPanelMode('buildingNew')
  }

  const handleBuildingOpen = (building) => {
    setSelectedSpot(null)
    setSelectedClinic(null)
    setSelectedBuilding(building)
    setPanelMode('buildingEdit')
    if (building.lat && building.lng) setCenterOn({ lat: building.lat, lng: building.lng })
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
    setSelectedClinic(null)
    setSelectedBuilding(null)
    setNewCoords(null)
    setBuildingCoords(null)
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

          <div className="sidebar-actions">
            <button
              className="sidebar-action"
              onClick={(event) => {
                event.stopPropagation()
                handleClinicSearchOpen()
              }}
            >
              의원 검색
            </button>
            <button
              className="sidebar-action"
              onClick={(event) => {
                event.stopPropagation()
                handleCompareOpen()
              }}
            >
              후보지 비교
            </button>
            <button
              className="sidebar-action subtle"
              onClick={(event) => {
                event.stopPropagation()
                handleRecoveryOpen()
              }}
            >
              복구
            </button>
          </div>
        </div>

        <div className="sidebar-tabs">
          <button className={activeSidebarTab === 'spots' ? 'active' : ''} onClick={() => setActiveSidebarTab('spots')}>지역</button>
          <button className={activeSidebarTab === 'clinics' ? 'active' : ''} onClick={() => setActiveSidebarTab('clinics')}>경쟁의원</button>
          <button className={activeSidebarTab === 'buildings' ? 'active' : ''} onClick={() => setActiveSidebarTab('buildings')}>건물</button>
        </div>

        {activeSidebarTab === 'spots' && (
          <SpotList
            spots={spots}
            selectedId={selectedSpot?.id}
            onSelect={handleSpotSelect}
            onNearby={handleNearbyOpen}
            onAI={handleAIOpen}
            onChecklist={handleChecklistOpen}
          />
        )}

        {activeSidebarTab === 'clinics' && (
          <SavedClinicList
            clinics={savedClinics}
            selectedId={selectedClinic?.id}
            onSelect={handleSavedClinicOpen}
            onSearch={handleClinicSearchOpen}
          />
        )}

        {activeSidebarTab === 'buildings' && (
          <>
            <div className="sidebar-list-action">
              <button onClick={handleBuildingAdd}>메디컬 빌딩 저장</button>
            </div>
            <BuildingList
              buildings={savedBuildings}
              selectedId={selectedBuilding?.id}
              onSelect={handleBuildingOpen}
              onAdd={handleBuildingAdd}
            />
          </>
        )}
      </aside>

      <main className="map-area">
        <div className="map-searchbar">
          <SearchBar onSelectPlace={handleSearchSelect} />
        </div>
        <MapView
          spots={spots}
          centerOn={centerOn}
          selectedSpot={selectedSpot}
          newSpotCoords={newCoords}
          markedClinics={markedClinics}
          savedClinics={savedClinics}
          savedBuildings={savedBuildings}
          onMapClick={handleMapClick}
          onSpotClick={handleSpotSelect}
          onClinicClick={handleClinicMarkerClick}
          onBuildingClick={handleBuildingOpen}
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
          onArea={() => selectedSpot && handleAreaOpen(selectedSpot)}
        />
      )}

      {panelMode === 'nearby' && selectedSpot && (
        <NearbyPanel
          spot={selectedSpot}
          onClose={handleClose}
          onClinicsLoaded={setNearbyClinics}
          onMarkedClinicsChange={setMarkedClinics}
          onCompetitorResearch={(clinic) => handleCompetitorOpen(selectedSpot, clinic)}
        />
      )}

      {panelMode === 'ai' && selectedSpot && (
        <AIAnalysisPanel spot={selectedSpot} nearbyClinics={nearbyClinics} onClose={handleClose} />
      )}

      {panelMode === 'checklist' && selectedSpot && (
        <ChecklistPanel spot={selectedSpot} onClose={handleClose} />
      )}

      {panelMode === 'area' && selectedSpot && (
        <AreaAnalysisPanel spot={selectedSpot} onClose={handleClose} />
      )}

      {panelMode === 'compare' && (
        <ComparePanel spots={spots} onClose={handleClose} onSelect={handleSpotSelect} />
      )}

      {panelMode === 'recovery' && (
        <MigrationBanner onClose={handleClose} />
      )}

      {panelMode === 'clinicSearch' && (
        <ClinicSearchPanel
          savedClinics={savedClinics}
          centerOn={centerOn}
          onClose={handleClose}
          onOpenClinic={handleSavedClinicOpen}
          onCenterClinic={(clinic) => clinic.lat && clinic.lng && setCenterOn({ lat: clinic.lat, lng: clinic.lng })}
        />
      )}

      {panelMode === 'competitor' && selectedSpot && selectedClinic && (
        <CompetitorReportPanel
          spot={selectedSpot}
          clinic={selectedClinic}
          onClose={handleClose}
        />
      )}

      {panelMode === 'clinicReport' && selectedClinic && (
        <CompetitorReportPanel
          clinic={selectedClinic}
          onClose={handleClose}
          standalone
        />
      )}

      {(panelMode === 'buildingNew' || panelMode === 'buildingEdit') && (
        <BuildingWatchPanel
          building={selectedBuilding}
          centerOn={buildingCoords || centerOn}
          onClose={handleClose}
        />
      )}
    </div>
  )
}
