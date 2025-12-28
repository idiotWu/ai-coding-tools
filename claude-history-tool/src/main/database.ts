import { app } from 'electron'
import path from 'path'
import { DatabaseLoader } from '@andyfischer/sqlite-wrapper'
import { Stream } from '@andyfischer/streams'

const databaseSchema = {
    name: 'claude-history-tool',
    statements: [
        `create table dismissed_upgrade_notifications (
            id integer primary key autoincrement,
            content_code text not null unique,
            dismissed_at datetime default current_timestamp
        )`,
        `create table if not exists favorites (
            id integer primary key autoincrement,
            session_id text not null unique,
            project_path text not null,
            starred_at datetime default current_timestamp
        )`
    ]
}

let databaseLoader: DatabaseLoader | null = null

export function initializeDatabase() {
    if (databaseLoader) {
        return databaseLoader.load()
    }

    const userDataPath = app.getPath('userData')
    const dbPath = path.join(userDataPath, 'claude-history-tool.db')

    databaseLoader = new DatabaseLoader({
        filename: dbPath,
        schema: databaseSchema,
        logs: (new Stream()).logToConsole(),
    })

    return databaseLoader.load()
}

export function getDatabase() {
    if (!databaseLoader) {
        return initializeDatabase()
    }
    return databaseLoader.load()
}

export function isDismissed(contentCode: string): boolean {
    const db = getDatabase()
    const result = db.get(
        'select 1 from dismissed_upgrade_notifications where content_code = ?',
        [contentCode]
    )
    return !!result
}

export function dismissNotification(contentCode: string): void {
    const db = getDatabase()
    db.run(
        'insert or ignore into dismissed_upgrade_notifications (content_code) values (?)',
        [contentCode]
    )
}

// Favorites functions
export interface FavoriteSession {
    sessionId: string;
    projectPath: string;
    starredAt: string;
}

export function getFavorites(): FavoriteSession[] {
    const db = getDatabase()
    const results = db.all(
        'select session_id, project_path, starred_at from favorites order by starred_at desc'
    )
    return results.map((row: { session_id: string; project_path: string; starred_at: string }) => ({
        sessionId: row.session_id,
        projectPath: row.project_path,
        starredAt: row.starred_at
    }))
}

export function isFavorite(sessionId: string): boolean {
    const db = getDatabase()
    const result = db.get(
        'select 1 from favorites where session_id = ?',
        [sessionId]
    )
    return !!result
}

export function addFavorite(sessionId: string, projectPath: string): void {
    const db = getDatabase()
    db.run(
        'insert or ignore into favorites (session_id, project_path) values (?, ?)',
        [sessionId, projectPath]
    )
}

export function removeFavorite(sessionId: string): void {
    const db = getDatabase()
    db.run(
        'delete from favorites where session_id = ?',
        [sessionId]
    )
}

export function toggleFavorite(sessionId: string, projectPath: string): boolean {
    if (isFavorite(sessionId)) {
        removeFavorite(sessionId)
        return false
    } else {
        addFavorite(sessionId, projectPath)
        return true
    }
}