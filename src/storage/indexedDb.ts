import type { GameState } from '../types'

const DB_NAME = 'exclusive-game-prototype'
const STORE_NAME = 'backups'
const KEY = 'latest-host-state'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveBackup(state: GameState): Promise<void> {
  const db = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(state, KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}

export async function loadBackup(): Promise<GameState | null> {
  const db = await openDatabase()
  const value = await new Promise<GameState | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY)
    request.onsuccess = () => resolve((request.result as GameState | undefined) ?? null)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return value
}
