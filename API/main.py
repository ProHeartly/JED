from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
from database import get_db, init_db
import hashlib
import secrets
import mimetypes
import os
import boto3
from botocore.config import Config
from datetime import datetime

app = FastAPI(title="JED - Just Enough Drives")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Filebase S3-compatible client
s3 = boto3.client(
    's3',
    endpoint_url='https://s3.filebase.com',
    aws_access_key_id=os.getenv('FILEBASE_ACCESS_KEY'),
    aws_secret_access_key=os.getenv('FILEBASE_SECRET_KEY'),
    config=Config(signature_version='s3v4')
)
BUCKET = os.getenv('FILEBASE_BUCKET', 'jed-storage')

class SpaceCreate(BaseModel):
    space_id: str = Field(..., min_length=3, max_length=30)
    password: str = Field(..., min_length=4)

class SpaceLogin(BaseModel):
    space_id: str
    password: str

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def get_content_type(filename: str) -> str:
    mime_type, _ = mimetypes.guess_type(filename)
    return mime_type or "application/octet-stream"

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
        "SELECT id, filename, file_key, size, uploaded_at FROM files WHERE space_id = ?",
        (space_id,)
    ).fetchall()
    
    return [{"id": f[0], "filename": f[1], "size": f[3], "uploaded_at": f[4]} for f in files]

@app.post("/files/upload")
async def upload_file(token: str = Form(...), file: UploadFile = File(...)):
    space_id = get_space_from_token(token)
    
    content = await file.read()
    file_size = len(content)
    
    # Generate unique key for Filebase
    file_key = f"{space_id}/{secrets.token_urlsafe(8)}_{file.filename}"
    
    # Upload to Filebase
    s3.put_object(
        Bucket=BUCKET,
        Key=file_key,
        Body=content,
        ContentType=get_content_type(file.filename)
    )
    
    # Save metadata to DB
    db = get_db()
    db.execute(
        "INSERT INTO files (space_id, filename, file_key, size, uploaded_at) VALUES (?, ?, ?, ?, ?)",
        (space_id, file.filename, file_key, file_size, datetime.utcnow().isoformat())
    )
    db.commit()
    
    return {"message": "File uploaded", "filename": file.filename}

# Get presigned URL for direct upload (for large files)
@app.post("/files/get-upload-url")
async def get_upload_url(token: str, filename: str, size: int):
    space_id = get_space_from_token(token)
    
    # Generate unique key
    file_key = f"{space_id}/{secrets.token_urlsafe(8)}_{filename}"
    
    # Generate presigned URL (valid for 15 minutes)
    presigned_url = s3.generate_presigned_url(
        'put_object',
        Params={
            'Bucket': BUCKET,
            'Key': file_key,
            'ContentType': get_content_type(filename)
        },
        ExpiresIn=900
    )
    
    return {
        "upload_url": presigned_url,
        "file_key": file_key,
        "filename": filename,
        "size": size
    }

# Confirm upload after direct upload completes
@app.post("/files/confirm-upload")
async def confirm_upload(token: str, file_key: str, filename: str, size: int):
    space_id = get_space_from_token(token)
    
    # Verify the file_key belongs to this space
    if not file_key.startswith(f"{space_id}/"):
        raise HTTPException(403, "Invalid file key")
    
    # Save metadata to DB
    db = get_db()
    db.execute(
        "INSERT INTO files (space_id, filename, file_key, size, uploaded_at) VALUES (?, ?, ?, ?, ?)",
        (space_id, filename, file_key, size, datetime.utcnow().isoformat())
    )
    db.commit()
    
    return {"message": "File uploaded", "filename": filename}

@app.get("/files/download/{file_id}")
async def download_file(file_id: int, token: str):
    space_id = get_space_from_token(token)
    db = get_db()
    
    file = db.execute(
        "SELECT filename, file_key FROM files WHERE id = ? AND space_id = ?",
        (file_id, space_id)
    ).fetchone()
    
    if not file:
        raise HTTPException(404, "File not found")
    
    # Get from Filebase
    response = s3.get_object(Bucket=BUCKET, Key=file[1])
    
    return StreamingResponse(
        response['Body'].iter_chunks(),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{file[0]}"'}
    )

@app.get("/files/preview/{file_id}")
async def preview_file(file_id: int, token: str):
    space_id = get_space_from_token(token)
    db = get_db()
    
    file = db.execute(
        "SELECT filename, file_key FROM files WHERE id = ? AND space_id = ?",
        (file_id, space_id)
    ).fetchone()
    
    if not file:
        raise HTTPException(404, "File not found")
    
    # Get from Filebase
    response = s3.get_object(Bucket=BUCKET, Key=file[1])
    content_type = get_content_type(file[0])
    
    return StreamingResponse(
        response['Body'].iter_chunks(),
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{file[0]}"'}
    )

@app.delete("/files/{file_id}")
async def delete_file(file_id: int, token: str):
    space_id = get_space_from_token(token)
    db = get_db()
    
    file = db.execute(
        "SELECT file_key FROM files WHERE id = ? AND space_id = ?",
        (file_id, space_id)
    ).fetchone()
    
    if not file:
        raise HTTPException(404, "File not found")
    
    # Delete from Filebase
    s3.delete_object(Bucket=BUCKET, Key=file[0])
    
    # Delete from DB
    db.execute("DELETE FROM files WHERE id = ?", (file_id,))
    db.commit()
    
    return {"message": "File deleted"}

@app.post("/spaces/logout")
async def logout(token: str):
    db = get_db()
    db.execute("DELETE FROM sessions WHERE token = ?", (token,))
    db.commit()
    return {"message": "Logged out"}
