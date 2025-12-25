import sqlite3
import os

_db = None

def get_db():
    global _db
    if _db is None:
        _db = sqlite3.connect("jed.db", check_same_thread=False)
        _db.row_factory = sqlite3.Row
    return _db

def init_db():
    db = get_db()
    cursor = db.cursor()
    
    # Spaces table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS spaces (
            space_id TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    
    # Sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            space_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (space_id) REFERENCES spaces(space_id)
        )
    """)
    
    # Files table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            space_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            size INTEGER NOT NULL,
            uploaded_at TEXT NOT NULL,
            FOREIGN KEY (space_id) REFERENCES spaces(space_id)
        )
    """)
    
    db.commit()
