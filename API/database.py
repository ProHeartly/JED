import libsql_experimental as libsql
import os

_db = None

def get_db():
    global _db
    if _db is None:
        turso_url = os.getenv('TURSO_URL')
        turso_token = os.getenv('TURSO_TOKEN')
        
        if turso_url and turso_token:
            _db = libsql.connect(turso_url, auth_token=turso_token)
        else:
            # Local fallback for development
            _db = libsql.connect("jed.db")
    return _db

def init_db():
    db = get_db()
    
    db.execute("""
        CREATE TABLE IF NOT EXISTS spaces (
            space_id TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    
    db.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            space_id TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)
    
    db.execute("""
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            space_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_key TEXT NOT NULL,
            size INTEGER NOT NULL,
            uploaded_at TEXT NOT NULL
        )
    """)
    
    db.commit()
