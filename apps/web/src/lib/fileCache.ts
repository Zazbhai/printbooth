// Lightweight IndexedDB storage to persist uploaded PDF File objects across page refreshes

const DB_NAME = 'printbooth_cache'
const STORE_NAME = 'files'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'))
      return
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveFileToCache(key: string, file: File): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(file, key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[FileCache] Could not save file to IndexedDB:', err)
  }
}

export async function getFileFromCache(key: string): Promise<File | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => {
        const val = req.result
        if (val instanceof File) {
          resolve(val)
        } else if (val instanceof Blob) {
          resolve(new File([val], key, { type: val.type }))
        } else {
          resolve(null)
        }
      }
      req.onerror = () => resolve(null)
    })
  } catch (err) {
    console.warn('[FileCache] Could not retrieve file from IndexedDB:', err)
    return null
  }
}

export async function hasFileInCache(key: string): Promise<boolean> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.count(key)
      req.onsuccess = () => resolve((req.result || 0) > 0)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

export async function clearFileCache(): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.clear()
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
    })
  } catch {
    // Ignore error on clear
  }
}
