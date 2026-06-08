import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import type { ReviewSnapshot } from '../shared/contracts'
import { dbPath, ensureDataDirs } from './paths'

export type PlayerProfile = {
  bankroll: number
  rating: number
  handsPlayed: number
  vpip: number
  preflopRaises: number
  foldsToRaise: number
  showdowns: number
}

const defaultProfile: PlayerProfile = {
  bankroll: 10000,
  rating: 1000,
  handsPlayed: 0,
  vpip: 0,
  preflopRaises: 0,
  foldsToRaise: 0,
  showdowns: 0
}

export class Storage {
  private db: Database.Database

  constructor(filePath = dbPath) {
    ensureDataDirs()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    this.db = new Database(filePath)
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('busy_timeout = 3000')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS completed_hands (
        hand_id TEXT PRIMARY KEY,
        completed_at TEXT NOT NULL,
        bankroll_delta INTEGER NOT NULL,
        rating_delta INTEGER NOT NULL,
        review_json TEXT NOT NULL
      );
    `)
    if (!this.getRaw('profile')) this.saveProfile(defaultProfile)
  }

  close() {
    this.db.close()
  }

  getProfile(): PlayerProfile {
    const raw = this.getRaw('profile')
    if (!raw) return { ...defaultProfile }
    return { ...defaultProfile, ...JSON.parse(raw) }
  }

  saveProfile(profile: PlayerProfile) {
    this.setRaw('profile', JSON.stringify(profile))
  }

  recordHand(review: ReviewSnapshot) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO completed_hands
          (hand_id, completed_at, bankroll_delta, rating_delta, review_json)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(review.handId, review.completedAt, review.bankrollDelta, review.ratingDelta, JSON.stringify(review))
  }

  private getRaw(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value
  }

  private setRaw(key: string, value: string) {
    this.db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, value)
  }
}
