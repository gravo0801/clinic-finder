import { useState, useRef, useEffect } from 'react'

export default function SearchBar({ onSelectPlace }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef(null)
  const wrapRef = useRef(null)

  // 외부 클릭 시 결과창 닫기
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = async (q) => {
    if (!q.trim() || q.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      // 네이버 지도 Geocoding API (장소 검색)
      const res = await fetch(
        `/api/search?query=${encodeURIComponent(q)}`
      )
      const data = await res.json()
      setResults(data.items || [])
      setShowResults(true)
    } catch (e) {
      console.error('검색 오류:', e)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 400)
  }

  const handleSelect = (item) => {
    setQuery(item.title.replace(/<[^>]+>/g, ''))
    setShowResults(false)
    setResults([])
    onSelectPlace({ lat: parseFloat(item.mapy) / 1e7, lng: parseFloat(item.mapx) / 1e7, name: item.title.replace(/<[^>]+>/g, ''), address: item.roadAddress || item.address })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceRef.current)
      search(query)
    }
    if (e.key === 'Escape') setShowResults(false)
  }

  return (
    <div className="searchbar-wrap" ref={wrapRef}>
      <div className="searchbar-inner">
        <span className="searchbar-icon">🔍</span>
        <input
          className="searchbar-input"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder="장소·주소 검색 (예: 마포구 공덕동)"
        />
        {loading && <span className="searchbar-spinner" />}
        {query && (
          <button className="searchbar-clear" onClick={() => { setQuery(''); setResults([]); setShowResults(false) }}>✕</button>
        )}
      </div>

      {showResults && results.length > 0 && (
        <div className="search-results">
          {results.slice(0, 8).map((item, i) => {
            const title = item.title.replace(/<[^>]+>/g, '')
            return (
              <div key={i} className="search-result-item" onClick={() => handleSelect(item)}>
                <div className="search-result-name">{title}</div>
                <div className="search-result-addr">{item.roadAddress || item.address}</div>
              </div>
            )
          })}
        </div>
      )}

      {showResults && results.length === 0 && !loading && query.length >= 2 && (
        <div className="search-results">
          <div className="search-no-result">검색 결과가 없습니다</div>
        </div>
      )}
    </div>
  )
}
