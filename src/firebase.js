import { initializeApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signInAnonymously,
  signOut,
} from 'firebase/auth'
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  orderBy,
  query,
  setDoc,
  getDoc,
  getDocs,
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
export const auth = getAuth(app)
export const db = getFirestore(app)
export const ALLOWED_EMAIL = (import.meta.env.VITE_ALLOWED_EMAIL || 'fnaticdoc@gmail.com').toLowerCase()

let authStarted = false
let currentUserPromise = null

const popupFallbackCodes = new Set([
  'auth/popup-blocked',
  'auth/cancelled-popup-request',
])

const linkFallbackCodes = new Set([
  'auth/credential-already-in-use',
  'auth/email-already-in-use',
  'auth/provider-already-linked',
])

export const isAllowedUser = (user) =>
  Boolean(user?.email && user.email.toLowerCase() === ALLOWED_EMAIL)

export const subscribeAuthSession = (callback) => {
  let requestedAnonymous = false

  const unsubscribe = onAuthStateChanged(
    auth,
    (user) => {
      if (!user && !requestedAnonymous) {
        requestedAnonymous = true
        authStarted = true
        callback({
          user: null,
          loading: true,
          isAllowed: false,
          needsGoogle: true,
          wrongAccount: false,
          error: null,
        })
        signInAnonymously(auth).catch((error) => {
          console.warn('Anonymous session bootstrap failed:', error)
          callback({
            user: null,
            loading: false,
            isAllowed: false,
            needsGoogle: true,
            wrongAccount: false,
            anonymousUnavailable: true,
            error: null,
          })
        })
        return
      }

      callback({
        user,
        loading: false,
        isAllowed: isAllowedUser(user),
        needsGoogle: !user || user.isAnonymous,
        wrongAccount: Boolean(user && !user.isAnonymous && !isAllowedUser(user)),
        error: null,
      })
    },
    (error) => {
      callback({
        user: null,
        loading: false,
        isAllowed: false,
        needsGoogle: true,
        wrongAccount: false,
        error,
      })
    },
  )

  return unsubscribe
}

export const signInWithAllowedGoogle = async () => {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  const currentUser = auth.currentUser

  if (currentUser?.isAnonymous) {
    try {
      return (await linkWithPopup(currentUser, provider)).user
    } catch (error) {
      if (popupFallbackCodes.has(error.code)) {
        sessionStorage.setItem('clinicFinderAuthRedirect', 'link')
        await linkWithRedirect(currentUser, provider)
        return null
      }

      if (!linkFallbackCodes.has(error.code)) {
        throw error
      }
    }
  }

  try {
    return (await signInWithPopup(auth, provider)).user
  } catch (error) {
    if (popupFallbackCodes.has(error.code)) {
      sessionStorage.setItem('clinicFinderAuthRedirect', 'signin')
      await signInWithRedirect(auth, provider)
      return null
    }

    throw error
  }
}

export const signOutCurrentUser = () => signOut(auth)

const ensureAuth = () => {
  if (auth.currentUser) return Promise.resolve(auth.currentUser)

  if (!currentUserPromise) {
    currentUserPromise = new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          if (user) {
            unsubscribe()
            resolve(user)
          }
        },
        reject,
      )

      if (!authStarted) {
        authStarted = true
        signInAnonymously(auth).catch(reject)
      }
    })
  }

  return currentUserPromise
}

const userDoc = async (...segments) => {
  const user = await ensureAuth()
  return doc(db, 'users', user.uid, ...segments)
}

const userCollection = async (...segments) => {
  const user = await ensureAuth()
  return collection(db, 'users', user.uid, ...segments)
}

export const spotSubcollection = (spotId, subcollection) =>
  userCollection('spots', spotId, subcollection)

export const addSpot = async (spot) => {
  const spotsCol = await userCollection('spots')
  return addDoc(spotsCol, { ...spot, createdAt: serverTimestamp() })
}

export const updateSpot = async (id, data) =>
  updateDoc(await userDoc('spots', id), { ...data, updatedAt: serverTimestamp() })

export const deleteSpot = async (id) =>
  deleteDoc(await userDoc('spots', id))

export const subscribeSpots = (callback) => {
  let unsubscribeSpots = null

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      callback([])
      if (!authStarted) {
        authStarted = true
        signInAnonymously(auth).catch((error) => {
          console.error('Anonymous sign-in failed:', error)
        })
      }
      return
    }

    if (unsubscribeSpots) unsubscribeSpots()
    const spotsCol = collection(db, 'users', user.uid, 'spots')
    const spotsQuery = query(spotsCol, orderBy('createdAt', 'desc'))
    unsubscribeSpots = onSnapshot(spotsQuery, (snap) => {
      callback(snap.docs.map((item) => ({ id: item.id, ...item.data() })))
    })
  })

  return () => {
    if (unsubscribeSpots) unsubscribeSpots()
    unsubscribeAuth()
  }
}

export const savePinnedClinic = async (spotId, clinic) => {
  const pinRef = await userDoc('spots', spotId, 'pins', clinic.id)
  await setDoc(pinRef, {
    ...clinic,
    savedAt: serverTimestamp(),
  })
}

export const deletePinnedClinic = async (spotId, clinicId) => {
  await deleteDoc(await userDoc('spots', spotId, 'pins', clinicId))
}

export const subscribePinnedClinics = (spotId, callback) => {
  let unsubscribePins = null

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      callback([])
      return
    }

    if (unsubscribePins) unsubscribePins()
    const pinsCol = collection(db, 'users', user.uid, 'spots', spotId, 'pins')
    unsubscribePins = onSnapshot(pinsCol, (snap) => {
      callback(snap.docs.map((item) => ({ ...item.data() })))
    })
  })

  return () => {
    if (unsubscribePins) unsubscribePins()
    unsubscribeAuth()
  }
}

export const saveCompetitorReport = async (spotId, clinicId, report) => {
  const reportRef = await userDoc('spots', spotId, 'competitors', clinicId)
  const existing = await getDoc(reportRef)
  const savedAt = existing.exists() && existing.data().savedAt
    ? existing.data().savedAt
    : serverTimestamp()
  await setDoc(reportRef, {
    ...report,
    savedAt,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export const subscribeCompetitorReport = (spotId, clinicId, callback) => {
  let unsubscribeReport = null

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      callback(null)
      return
    }

    if (unsubscribeReport) unsubscribeReport()
    const reportRef = doc(db, 'users', user.uid, 'spots', spotId, 'competitors', clinicId)
    unsubscribeReport = onSnapshot(reportRef, (snap) => {
      callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  })

  return () => {
    if (unsubscribeReport) unsubscribeReport()
    unsubscribeAuth()
  }
}

export const saveSavedClinic = async (clinic) => {
  const clinicRef = await userDoc('savedClinics', clinic.id)
  const existing = await getDoc(clinicRef)
  const savedAt = existing.exists() && existing.data().savedAt
    ? existing.data().savedAt
    : serverTimestamp()
  await setDoc(clinicRef, {
    ...clinic,
    savedAt,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export const deleteSavedClinic = async (clinicId) => {
  await deleteDoc(await userDoc('savedClinics', clinicId))
}

export const subscribeSavedClinics = (callback) => {
  let unsubscribeClinics = null

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      callback([])
      return
    }

    if (unsubscribeClinics) unsubscribeClinics()
    const clinicsCol = collection(db, 'users', user.uid, 'savedClinics')
    const clinicsQuery = query(clinicsCol, orderBy('savedAt', 'desc'))
    unsubscribeClinics = onSnapshot(clinicsQuery, (snap) => {
      callback(snap.docs.map((item) => ({ id: item.id, ...item.data() })))
    })
  })

  return () => {
    if (unsubscribeClinics) unsubscribeClinics()
    unsubscribeAuth()
  }
}

export const subscribeSavedClinic = (clinicId, callback) => {
  let unsubscribeClinic = null

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      callback(null)
      return
    }

    if (unsubscribeClinic) unsubscribeClinic()
    const clinicRef = doc(db, 'users', user.uid, 'savedClinics', clinicId)
    unsubscribeClinic = onSnapshot(clinicRef, (snap) => {
      callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
    })
  })

  return () => {
    if (unsubscribeClinic) unsubscribeClinic()
    unsubscribeAuth()
  }
}

export const saveSavedBuilding = async (building) => {
  const id = building.id || crypto.randomUUID()
  const buildingRef = await userDoc('savedBuildings', id)
  const existing = await getDoc(buildingRef)
  const savedAt = existing.exists() && existing.data().savedAt
    ? existing.data().savedAt
    : serverTimestamp()
  await setDoc(buildingRef, {
    ...building,
    id,
    savedAt,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  return id
}

export const deleteSavedBuilding = async (buildingId) => {
  await deleteDoc(await userDoc('savedBuildings', buildingId))
}

export const subscribeSavedBuildings = (callback) => {
  let unsubscribeBuildings = null

  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      callback([])
      return
    }

    if (unsubscribeBuildings) unsubscribeBuildings()
    const buildingsCol = collection(db, 'users', user.uid, 'savedBuildings')
    const buildingsQuery = query(buildingsCol, orderBy('savedAt', 'desc'))
    unsubscribeBuildings = onSnapshot(buildingsQuery, (snap) => {
      callback(snap.docs.map((item) => ({ id: item.id, ...item.data() })))
    })
  })

  return () => {
    if (unsubscribeBuildings) unsubscribeBuildings()
    unsubscribeAuth()
  }
}

const copySubcollection = async (oldSpotId, newSpotId, subcollectionName) => {
  const sourceSnap = await getDocs(collection(db, 'spots', oldSpotId, subcollectionName))
  await Promise.all(sourceSnap.docs.map(async (sourceDoc) => {
    await setDoc(await userDoc('spots', newSpotId, subcollectionName, sourceDoc.id), sourceDoc.data())
  }))
}

export const getLegacySpotCount = async () => {
  await ensureAuth()
  const legacySnap = await getDocs(collection(db, 'spots'))
  return legacySnap.size
}

export const migrateLegacySpots = async () => {
  await ensureAuth()
  const legacySnap = await getDocs(collection(db, 'spots'))

  await Promise.all(legacySnap.docs.map(async (legacySpot) => {
    const spotData = legacySpot.data()
    await setDoc(await userDoc('spots', legacySpot.id), spotData)
    await copySubcollection(legacySpot.id, legacySpot.id, 'pins')
    await copySubcollection(legacySpot.id, legacySpot.id, 'analyses')
    await copySubcollection(legacySpot.id, legacySpot.id, 'competitors')
  }))

  return legacySnap.size
}
