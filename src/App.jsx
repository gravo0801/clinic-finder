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
import RevenueEstimatorPanel from './components/RevenueEstimatorPanel'
import AuthGate from './components/AuthGate'
import ErrorBoundary from './components/ErrorBoundary'
import {
  subscribeSpots,
  addSpot,
  updateSpot,
  deleteSpot,
  subscribePinnedClinics,
  subscribeSavedClinics,
  subscribeSavedBuildings,
  subscribeAuthSession,
  signInWithAllowedGoogle,
  signOutCurrentUser,
  getExportBundle,
} from './firebase'

const formatAuthError = (error) => {
  if (!error) return null

  const code = error.code || ''
  if (code === 'auth/popup-blocked') {
    return '브라우저가 로그인 팝업을 차단했습니다. 새로고침 후 다시 누르면 전체 페이지 로그인으로 전환됩니다.'
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Firebase 허용 도메인에 현재 Vercel 도메인이 빠져 있습니다. Authentication > Settings > Authorized domains를 확인해주세요.'
  }
  if (code === 'auth/redirect-cancelled-by-user' || code === 'auth/popup-closed-by-user') {
    return 'Google 로그인 창이 완료되기 전에 닫혔습니다. 다시 시도해주세요.'
  }
  if (code === 'auth/network-request-failed') {
    return '브라우저 네트워크 또는 보안 확장 프로그램이 Firebase 로그인을 막았습니다. 확장 프로그램을 잠시 끄거나 다른 브라우저에서 시도해주세요.'
  }

  return `${error.message || 'Google 로그인에 실패했습니다.'}${code ? ` (${code})` : ''}`
}

const timestampText = (value) => {
  if (!value) return ''
  if (value.seconds) return new Date(value.seconds * 1000).toISOString()
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

const textValue = (value) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

const csvValue = (value) => {
  const text = textValue(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

const buildCsv = (bundle) => {
  const headers = [
    'recordType',
    'parentSpot',
    'name',
    'address',
    'dept',
    'distance',
    'radius',
    'savedAt',
    'updatedAt',
    'lastCheckedAt',
    'generatedAt',
    'score',
    'confidence',
    'revenuePotential',
    'count',
    'memo',
    'source',
  ]
  const rows = []
  const pushRow = (row) => rows.push(headers.map((header) => csvValue(row[header] ?? '')))

  ;(bundle.spots || []).forEach((spot) => {
    pushRow({
      recordType: '지역 후보지',
      name: spot.name,
      address: spot.address,
      savedAt: timestampText(spot.createdAt),
      updatedAt: timestampText(spot.updatedAt),
      score: spot.rating,
      memo: spot.memo,
      source: 'spots',
    })

    ;(spot.investigations || []).forEach((investigation) => {
      pushRow({
        recordType: '지역 조사 기록',
        parentSpot: spot.name,
        name: investigation.summary?.headline || '주변 의원 조사',
        address: spot.address,
        radius: investigation.radius,
        savedAt: timestampText(investigation.createdAt),
        updatedAt: timestampText(investigation.updatedAt),
        count: `전체 ${investigation.clinicCount || 0} / 경쟁 ${investigation.competitorCount || 0}`,
        memo: investigation.summary,
        source: investigation.source || 'investigations',
      })
    })

    ;(spot.pins || []).forEach((clinic) => {
      pushRow({
        recordType: '지도 표시 의원',
        parentSpot: spot.name,
        name: clinic.name,
        address: clinic.address,
        dept: clinic.dept || clinic.type,
        distance: clinic.distance,
        savedAt: timestampText(clinic.savedAt),
        source: 'spot-pins',
      })
    })

    ;(spot.competitors || []).forEach((report) => {
      const clinic = report.clinic || report
      const ai = report.aiResult || {}
      pushRow({
        recordType: '후보지 경쟁 리포트',
        parentSpot: spot.name,
        name: clinic.name,
        address: clinic.address,
        dept: clinic.dept || clinic.type,
        distance: clinic.distance,
        savedAt: timestampText(report.savedAt),
        updatedAt: timestampText(report.updatedAt),
        generatedAt: timestampText(report.generatedAt),
        score: ai.competitorStrength,
        confidence: ai.confidence,
        revenuePotential: ai.revenuePotential,
        memo: ai.summary,
        source: 'spot-competitors',
      })
    })
  })

  ;(bundle.savedClinics || []).forEach((clinic) => {
    const ai = clinic.aiResult || {}
    pushRow({
      recordType: '즐겨찾기 의원',
      parentSpot: clinic.sourceContext?.spotName || clinic.trackedFrom?.spotName || '',
      name: clinic.name,
      address: clinic.address,
      dept: clinic.dept || clinic.type,
      distance: clinic.distance,
      radius: clinic.sourceContext?.radius || clinic.trackedFrom?.radius || '',
      savedAt: timestampText(clinic.savedAt),
      updatedAt: timestampText(clinic.updatedAt),
      lastCheckedAt: timestampText(clinic.lastCheckedAt),
      generatedAt: timestampText(clinic.generatedAt),
      score: ai.competitorStrength,
      confidence: ai.confidence,
      revenuePotential: ai.revenuePotential,
      memo: ai.summary || clinic.trackingNote || '',
      source: clinic.trackedFrom?.source || 'saved-clinics',
    })
  })

  ;(bundle.savedBuildings || []).forEach((building) => {
    pushRow({
      recordType: '관심 건물',
      name: building.name,
      address: building.address,
      savedAt: timestampText(building.savedAt),
      updatedAt: timestampText(building.updatedAt),
      memo: building.memo || building.notes || '',
      source: 'saved-buildings',
    })
  })

  return [headers, ...rows].map((row) => row.join(',')).join('\n')
}

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
  const [authSession, setAuthSession] = useState({ user: null, loading: true, isAllowed: false })
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    const syncAppHeight = () => {
      const height = window.innerHeight
      document.documentElement.style.setProperty('--app-height', `${height}px`)
      document.documentElement.style.setProperty('--mobile-sidebar-height', `${Math.min(height * 0.39, 330)}px`)
      document.documentElement.style.setProperty('--mobile-sidebar-height-small', `${height * 0.42}px`)
      document.documentElement.style.setProperty('--mobile-panel-height', `${Math.min(height * 0.86, 760)}px`)
      document.documentElement.style.setProperty('--mobile-search-results-height', `${Math.min(height * 0.5, 420)}px`)
    }

    syncAppHeight()
    window.addEventListener('resize', syncAppHeight)
    window.addEventListener('orientationchange', syncAppHeight)

    return () => {
      window.removeEventListener('resize', syncAppHeight)
      window.removeEventListener('orientationchange', syncAppHeight)
    }
  }, [])

  useEffect(() => subscribeAuthSession(setAuthSession), [])

  useEffect(() => {
    if (!authSession.isAllowed) {
      setSpots([])
      return undefined
    }
    return subscribeSpots(setSpots)
  }, [authSession.isAllowed])

  useEffect(() => {
    if (!authSession.isAllowed) {
      setSavedClinics([])
      return undefined
    }
    return subscribeSavedClinics(setSavedClinics)
  }, [authSession.isAllowed])

  useEffect(() => {
    if (!authSession.isAllowed) {
      setSavedBuildings([])
      return undefined
    }
    return subscribeSavedBuildings(setSavedBuildings)
  }, [authSession.isAllowed])

  useEffect(() => {
    if (!authSession.isAllowed || !selectedSpot?.id) {
      setMarkedClinics([])
      return undefined
    }
    return subscribePinnedClinics(selectedSpot.id, setMarkedClinics)
  }, [authSession.isAllowed, selectedSpot?.id])

  const handleSecureSignIn = async () => {
    setAuthBusy(true)
    setAuthError(null)
    try {
      await signInWithAllowedGoogle()
    } catch (error) {
      setAuthError(formatAuthError(error))
    } finally {
      setAuthBusy(false)
    }
  }

  const handleSecureSignOut = async () => {
    setAuthBusy(true)
    setAuthError(null)
    try {
      await signOutCurrentUser()
    } catch (error) {
      setAuthError(formatAuthError(error) || '로그아웃에 실패했습니다.')
    } finally {
      setAuthBusy(false)
    }
  }

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

  const handleRevenueOpen = () => {
    setSelectedSpot(null)
    setSelectedClinic(null)
    setSelectedBuilding(null)
    setPanelMode('revenue')
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

  const handleExportData = async () => {
    const exportData = await getExportBundle()
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `clinic-finder-backup-${new Date().toISOString().slice(0, 10)}.json`)
  }

  const handleExportCsv = async () => {
    try {
      const exportData = await getExportBundle()
      const blob = new Blob([`\uFEFF${buildCsv(exportData)}`], { type: 'text/csv;charset=utf-8' })
      downloadBlob(blob, `clinic-finder-export-${new Date().toISOString().slice(0, 10)}.csv`)
    } catch (error) {
      alert(`CSV 내보내기에 실패했습니다: ${error.message}`)
    }
  }

  const handleSidebarHeaderClick = () => {
    if (window.matchMedia('(max-width: 768px)').matches) {
      setSidebarCollapsed((collapsed) => !collapsed)
    }
  }

  if (authSession.loading) {
    return (
      <div className="auth-gate">
        <div className="auth-card">
          <div className="auth-mark">🏥</div>
          <h1>개원 입지 분석</h1>
          <p className="auth-lead">보안 세션을 확인하는 중입니다.</p>
        </div>
      </div>
    )
  }

  if (!authSession.isAllowed) {
    return (
      <AuthGate
        session={authSession}
        busy={authBusy}
        error={authError || formatAuthError(authSession.error)}
        onSignIn={handleSecureSignIn}
        onSignOut={handleSecureSignOut}
      />
    )
  }

  const boundaryKey = `${panelMode || 'none'}-${selectedSpot?.id || selectedClinic?.id || selectedBuilding?.id || ''}`

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
              className="sidebar-action revenue"
              onClick={(event) => {
                event.stopPropagation()
                handleRevenueOpen()
              }}
            >
              매출 추정
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
            <button
              className="sidebar-action subtle"
              onClick={(event) => {
                event.stopPropagation()
                handleExportData()
              }}
            >
              백업
            </button>
            <button
              className="sidebar-action subtle"
              onClick={(event) => {
                event.stopPropagation()
                handleExportCsv()
              }}
            >
              CSV
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
        <ErrorBoundary resetKey={boundaryKey} onClose={handleClose}>
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
        </ErrorBoundary>
      )}

      {panelMode === 'nearby' && selectedSpot && (
        <ErrorBoundary resetKey={boundaryKey} onClose={handleClose}>
          <NearbyPanel
            spot={selectedSpot}
            savedClinics={savedClinics}
            onClose={handleClose}
            onClinicsLoaded={setNearbyClinics}
            onMarkedClinicsChange={setMarkedClinics}
            onCompetitorResearch={(clinic) => handleCompetitorOpen(selectedSpot, clinic)}
          />
        </ErrorBoundary>
      )}

      {panelMode === 'ai' && selectedSpot && (
        <ErrorBoundary resetKey={boundaryKey} onClose={handleClose}>
          <AIAnalysisPanel spot={selectedSpot} nearbyClinics={nearbyClinics} onClose={handleClose} />
        </ErrorBoundary>
      )}

      {panelMode === 'checklist' && selectedSpot && (
        <ErrorBoundary resetKey={boundaryKey} onClose={handleClose}>
          <ChecklistPanel spot={selectedSpot} onClose={handleClose} />
        </ErrorBoundary>
      )}

      {panelMode === 'area' && selectedSpot && (
        <ErrorBoundary resetKey={boundaryKey} onClose={handleClose}>
          <AreaAnalysisPanel spot={selectedSpot} onClose={handleClose} />
        </ErrorBoundary>
      )}

      {panelMode === 'compare' && (
        <ErrorBoundary resetKey={boundaryKey} onClose={handleClose}>
          <ComparePanel spots={spots} onClose={handleClose} onSelect={handleSpotSelect} />
        </ErrorBoundary>
      )}

      {panelMode === 'revenue' && (
        <ErrorBoundary resetKey={boundaryKey} onClose={handleClose}>
          <RevenueEstimatorPanel spots={spots} onClose={handleClose} onSelectSpot={handleSpotSelect} />
        </ErrorBoundary>
      )}

      {panelMode === 'recovery' && (
        <ErrorBoundary resetKey={boundaryKey} onClose={handleClose}>
          <MigrationBanner onClose={handleClose} />
        </ErrorBoundary>
      )}

      {panelMode === 'clinicSearch' && (
        <ErrorBoundary resetKey={boundaryKey} onClose={handleClose}>
          <ClinicSearchPanel
            savedClinics={savedClinics}
            centerOn={centerOn}
            onClose={handleClose}
            onOpenClinic={handleSavedClinicOpen}
            onCenterClinic={(clinic) => clinic.lat && clinic.lng && setCenterOn({ lat: clinic.lat, lng: clinic.lng })}
          />
        </ErrorBoundary>
      )}

      {panelMode === 'competitor' && selectedSpot && selectedClinic && (
        <ErrorBoundary resetKey={boundaryKey} onClose={handleClose}>
          <CompetitorReportPanel
            spot={selectedSpot}
            clinic={selectedClinic}
            onClose={handleClose}
          />
        </ErrorBoundary>
      )}

      {panelMode === 'clinicReport' && selectedClinic && (
        <ErrorBoundary resetKey={boundaryKey} onClose={handleClose}>
          <CompetitorReportPanel
            clinic={selectedClinic}
            onClose={handleClose}
            standalone
          />
        </ErrorBoundary>
      )}

      {(panelMode === 'buildingNew' || panelMode === 'buildingEdit') && (
        <ErrorBoundary resetKey={boundaryKey} onClose={handleClose}>
          <BuildingWatchPanel
            building={selectedBuilding}
            centerOn={buildingCoords || centerOn}
            onClose={handleClose}
          />
        </ErrorBoundary>
      )}
    </div>
  )
}
