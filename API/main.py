from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from database import get_db, init_db
import hashlib
import secrets
import os
from datetime import datetime

app = FastAPI(title="JED - Just Enough Drives")

# CORS for web frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Local storage folder
STORAGE_DIR = "storage"
os.makedirs(STORAGE_DIR, exist_ok=True)

# Models
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
    cursor = db.cursor()
    result = cursor.execute(
        "SELECT space_id FROM sessions WHERE token = ?", (token,)
    ).fetchone()
    if not result:
        raise HTTPException(401, "Invalid or expired token")
    return result[0]

@app.on_event("startup")
async def startup():
    init_db()

# Space Management
@app.post("/spaces/create")
async def create_space(space: SpaceCreate):
    db = get_db()
    cursor = db.cursor()
    
    existing = cursor.execute(
        "SELECT space_id FROM spaces WHERE space_id = ?", (space.space_id,)
    ).fetchone()
    
    if existing:
        raise HTTPException(400, "Space ID already taken")
    
    cursor.execute(
        "INSERT INTO spaces (space_id, password_hash, created_at) VALUES (?, ?, ?)",
        (space.space_id, hash_password(space.password), datetime.utcnow().isoformat())
    )
    db.commit()
    return {"message": "Space created", "space_id": space.space_id}

@app.post("/spaces/login")
async def login_space(space: SpaceLogin):
    db = get_db()
    cursor = db.cursor()
    
    result = cursor.execute(
        "SELECT password_hash FROM spaces WHERE space_id = ?", (space.space_id,)
    ).fetchone()
    
    if not result or result[0] != hash_password(space.password):
        raise HTTPException(401, "Invalid space ID or password")
    
    token = secrets.token_urlsafe(32)
    cursor.execute(
        "INSERT INTO sessions (token, space_id, created_at) VALUES (?, ?, ?)",
        (token, space.space_id, datetime.utcnow().isoformat())
    )
    db.commit()
    return {"token": token, "space_id": space.space_id}


# File Operations
@app.get("/files")
async def list_files(token: str):
    space_id = get_space_from_token(token)
    db = get_db()
    cursor = db.cursor()
    
    files = cursor.execute(
        "SELECT id, filename, size, uploaded_at FROM files WHERE space_id = ?",
        (space_id,)
    ).fetchall()
    
    return [{"id": f["id"], "filename": f["filename"], "size": f["size"], "uploaded_at": f["uploaded_at"]} for f in files]

@app.post("/files/upload")
async def upload_file(token: str = Form(...), file: UploadFile = File(...)):
    space_id = get_space_from_token(token)
    
    # Create space folder
    space_dir = os.path.join(STORAGE_DIR, space_id)
    os.makedirs(space_dir, exist_ok=True)
    
    # Generate unique filename
    unique_name = f"{secrets.token_urlsafe(8)}_{file.filename}"
    file_path = os.path.join(space_dir, unique_name)
    
    # Save file
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Save metadata to DB
    db = get_db()
    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO files (space_id, filename, file_path, size, uploaded_at) VALUES (?, ?, ?, ?, ?)",
        (space_id, file.filename, file_path, len(content), datetime.utcnow().isoformat())
    )
    db.commit()
    
    return {"message": "File uploaded", "filename": file.filename}

@app.get("/files/download/{file_id}")
async def download_file(file_id: int, token: str):
    space_id = get_space_from_token(token)
    db = get_db()
    cursor = db.cursor()
    
    file = cursor.execute(
        "SELECT filename, file_path FROM files WHERE id = ? AND space_id = ?",
        (file_id, space_id)
    ).fetchone()
    
    if not file:
        raise HTTPException(404, "File not found")
    
    return FileResponse(file["file_path"], filename=file["filename"])

@app.delete("/files/{file_id}")
async def delete_file(file_id: int, token: str):
    space_id = get_space_from_token(token)
    db = get_db()
    cursor = db.cursor()
    
    file = cursor.execute(
        "SELECT file_path FROM files WHERE id = ? AND space_id = ?",
        (file_id, space_id)
    ).fetchone()
    
    if not file:
        raise HTTPException(404, "File not found")
    
    # Delete file from disk
    if os.path.exists(file["file_path"]):
        os.remove(file["file_path"])
    
    # Delete from DB
    cursor.execute("DELETE FROM files WHERE id = ?", (file_id,))
    db.commit()
    
    return {"message": "File deleted"}

@app.post("/spaces/logout")
async def logout(token: str):
    db = get_db()
    cursor = db.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    db.commit()
    return {"message": "Logged out"}
