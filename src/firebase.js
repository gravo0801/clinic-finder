import { initializeApp } from 'firebase/app'
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc,
  doc, onSnapshot, serverTimestamp, orderBy, query, setDoc, getDoc,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

// ── 후보지(스팟) CRUD ──────────────────────────────────────
const spotsCol = collection(db, 'spots')

export const addSpot = (spot) =>
  addDoc(spotsCol, { ...spot, createdAt: serverTimestamp() })

export const updateSpot = (id, data) =>
  updateDoc(doc(db, 'spots', id), { ...data, updatedAt: serverTimestamp() })

export const deleteSpot = (id) =>
  deleteDoc(doc(db, 'spots', id))

export const subscribeSpots = (callback) => {
  const q = query(spotsCol, orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  })
}

// ── 저장된 의원 핀 CRUD ────────────────────────────────────
// spotId별로 핀 목록을 저장 (spots/{spotId}/pins/{pinId})

export const savePinnedClinic = async (spotId, clinic) => {
  const pinRef = doc(db, 'spots', spotId, 'pins', clinic.id)
  await setDoc(pinRef, {
    ...clinic,
    savedAt: serverTimestamp(),
  })
}

export const deletePinnedClinic = async (spotId, clinicId) => {
  await deleteDoc(doc(db, 'spots', spotId, 'pins', clinicId))
}

export const subscribePinnedClinics = (spotId, callback) => {
  const pinsCol = collection(db, 'spots', spotId, 'pins')
  return onSnapshot(pinsCol, (snap) => {
    callback(snap.docs.map((d) => ({ ...d.data() })))
  })
}
