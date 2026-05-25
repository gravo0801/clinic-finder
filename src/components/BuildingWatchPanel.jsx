import { useState } from 'react'
import { deleteSavedBuilding, saveSavedBuilding } from '../firebase'

const STATUS_OPTIONS = [
  { value: 'watching', label: '관심' },
  { value: 'checking', label: '확인중' },
  { value: 'hold', label: '보류' },
]

export default function BuildingWatchPanel({ building, centerOn, onClose }) {
  const [form, setForm] = useState(() => ({
    id: building?.id || '',
    name: building?.name || '',
    address: building?.address || '',
    status: building?.status || 'watching',
    lat: building?.lat ?? centerOn?.lat ?? '',
    lng: building?.lng ?? centerOn?.lng ?? '',
    sourceLink: building?.sourceLink || '',
    deposit: building?.deposit || '',
    monthlyRent: building?.monthlyRent || '',
    floor: building?.floor || '',
    area: building?.area || '',
    memo: building?.memo || '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      setError('건물명 또는 식별 이름을 입력하세요.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveSavedBuilding({
        ...form,
        lat: form.lat === '' ? null : Number(form.lat),
        lng: form.lng === '' ? null : Number(form.lng),
      })
      onClose()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!form.id) return
    setSaving(true)
    setError(null)
    try {
      await deleteSavedBuilding(form.id)
      onClose()
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="building-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">{form.id ? '메디컬 빌딩 정보' : '메디컬 빌딩 저장'}</h2>
          <p className="panel-coords">부동산 링크와 임대 조건을 한곳에 모읍니다</p>
        </div>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="panel-body">
        <div className="building-notice">
          매물 사이트 자동 크롤링은 약관 리스크가 있어 제외합니다. 1차는 관심 건물 저장과 링크 관리, 다음 단계는 공공 실거래가/건축물대장 API 연계가 적합합니다.
        </div>

        <div className="building-form-grid">
          <label className="full">
            <span>건물명</span>
            <input className="business-input" value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="예: 공덕 메디컬타워 3층" />
          </label>
          <label className="full">
            <span>주소</span>
            <input className="business-input" value={form.address} onChange={(event) => setField('address', event.target.value)} placeholder="주소 또는 위치 메모" />
          </label>
          <label>
            <span>상태</span>
            <select className="business-input" value={form.status} onChange={(event) => setField('status', event.target.value)}>
              {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span>층수</span>
            <input className="business-input" value={form.floor} onChange={(event) => setField('floor', event.target.value)} placeholder="예: 3층" />
          </label>
          <label>
            <span>보증금</span>
            <input className="business-input" value={form.deposit} onChange={(event) => setField('deposit', event.target.value)} placeholder="예: 1억" />
          </label>
          <label>
            <span>월세</span>
            <input className="business-input" value={form.monthlyRent} onChange={(event) => setField('monthlyRent', event.target.value)} placeholder="예: 650만" />
          </label>
          <label>
            <span>면적</span>
            <input className="business-input" value={form.area} onChange={(event) => setField('area', event.target.value)} placeholder="예: 전용 60평" />
          </label>
          <label>
            <span>위도</span>
            <input className="business-input" inputMode="decimal" value={form.lat} onChange={(event) => setField('lat', event.target.value)} />
          </label>
          <label>
            <span>경도</span>
            <input className="business-input" inputMode="decimal" value={form.lng} onChange={(event) => setField('lng', event.target.value)} />
          </label>
          <label className="full">
            <span>부동산/매물 링크</span>
            <input className="business-input" value={form.sourceLink} onChange={(event) => setField('sourceLink', event.target.value)} placeholder="네이버부동산, 직방, 다방, 중개사 링크 등" />
          </label>
          <label className="full">
            <span>메모</span>
            <textarea className="business-textarea" value={form.memo} onChange={(event) => setField('memo', event.target.value)} placeholder="엘리베이터, 주차, 약국 동선, 입점 과목, 중개사 코멘트 등" />
          </label>
        </div>

        {error && <div className="ai-error"><p>{error}</p></div>}

        <div className="panel-actions">
          <button className="btn-save" onClick={handleSave} disabled={saving}>{saving ? '저장 중...' : '저장'}</button>
          {form.id && <button className="btn-delete" onClick={handleDelete} disabled={saving}>삭제</button>}
        </div>
      </div>
    </div>
  )
}
