from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from database import get_db, init_db
import hashlib
import secrets
from datetime import datetime

app = FastAPI(title="JED - Just Enough Drives")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB limit per file

class SpaceCreate(BaseModel):
    space_id: str = Field(..., min_length=3, max_length=30)
    password: str = Field(..., min_length=4)

class SpaceLogin(BaseModel):
    space_id: str
    password: str

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def get_space_from_token(token: str):
    db = get_db()
    result = db.execute(
        "SELECT space_id FROM sessions WHERE token = ?", (token,)
    ).fetchone()
    if not result:
        raise HTTPException(401, "Invalid or expired token")
    return result[0]

@app.on_event("startup")
async def startup():
    init_db()

@app.get("/")
async def root():
    return {"status": "JED API running"}

@app.post("/spaces/create")
async def create_space(space: SpaceCreate):
    db = get_db()
    
    existing = db.execute(
        "SELECT space_id FROM spaces WHERE space_id = ?", (space.space_id,)
    ).fetchone()
    
    if existing:
        raise HTTPException(400, "Space ID already taken")
    
    db.execute(
        "INSERT INTO spaces (space_id, password_hash, created_at) VALUES (?, ?, ?)",
        (space.space_id, hash_password(space.password), datetime.utcnow().isoformat())
    )
    db.commit()
    return {"message": "Space created", "space_id": space.space_id}

@app.post("/spaces/login")
async def login_space(space: SpaceLogin):
    db = get_db()
    
    result = db.execute(
        "SELECT password_hash FROM spaces WHERE space_id = ?", (space.space_id,)
    ).fetchone()
    
    if not result or result[0] != hash_password(space.password):
        raise HTTPException(401, "Invalid space ID or password")
    
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, space_id, created_at) VALUES (?, ?, ?)",
        (token, space.space_id, datetime.utcnow().isoformat())
    )
    db.commit()
    return {"token": token, "space_id": space.space_id}

@app.get("/files")
async def list_files(token: str):
    space_id = get_space_from_token(token)
    db = get_db()
    
    files = db.execute(
        "SELECT id, filename, size, uploaded_at FROM files WHERE space_id = ?",
        (space_id,)
    ).fetchall()
    
    return [{"id": f[0], "filename": f[1], "size": f[2], "uploaded_at": f[3]} for f in files]

@app.post("/files/upload")
async def upload_file(token: str = Form(...), file: UploadFile = File(...)):
    space_id = get_space_from_token(token)
    
    content = await file.read()
    
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"File too large. Max size is {MAX_FILE_SIZE // (1024*1024)}MB")
    
    db = get_db()
    db.execute(
        "INSERT INTO files (space_id, filename, content, size, uploaded_at) VALUES (?, ?, ?, ?, ?)",
        (space_id, file.filename, content, len(content), datetime.utcnow().isoformat())
    )
    db.commit()
    
    return {"message": "File uploaded", "filename": file.filename}

@app.get("/files/download/{file_id}")
async def download_file(file_id: int, token: str):
    space_id = get_space_from_token(token)
    db = get_db()
    
    file = db.execute(
        "SELECT filename, content FROM files WHERE id = ? AND space_id = ?",
        (file_id, space_id)
    ).fetchone()
    
    if not file:
        raise HTTPException(404, "File not found")
    
    return Response(
        content=file[1],
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file[0]}"'}
    )

@app.delete("/files/{file_id}")
async def delete_file(file_id: int, token: str):
    space_id = get_space_from_token(token)
    db = get_db()
    
    file = db.execute(
        "SELECT id FROM files WHERE id = ? AND space_id = ?",
        (file_id, space_id)
    ).fetchone()
    
    if not file:
        raise HTTPException(404, "File not found")
    
    db.execute("DELETE FROM files WHERE id = ?", (file_id,))
    db.commit()
    
    return {"message": "File deleted"}

@app.post("/spaces/logout")
async def logout(token: str):
    db = get_db()
    db.execute("DELETE FROM sessions WHERE token = ?", (token,))
    db.commit()
    return {"message": "Logged out"}
