const API_URL = 'https://jed-uv1d.onrender.com';
const REQUEST_TIMEOUT = 60000;

const token = localStorage.getItem('jed_token');
const spaceId = localStorage.getItem('jed_space');

// Redirect if not logged in
if (!token || !spaceId) {
    window.location.href = 'index.html';
}

// Helper for fetch with timeout
async function fetchWithWakeup(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeout);
        return res;
    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
            throw new Error('Server is taking too long. Try again.');
        }
        throw err;
    }
}

// Set space name
document.getElementById('space-name').textContent = spaceId;

// Format file size
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// Get file icon based on extension
function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        pdf: '📄', doc: '📝', docx: '📝', txt: '📝',
        jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
        mp3: '🎵', wav: '🎵', flac: '🎵',
        mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬',
        zip: '📦', rar: '📦', '7z': '📦', tar: '📦',
        js: '💻', py: '💻', html: '💻', css: '💻',
    };
    return icons[ext] || '📁';
}

// Check if file is previewable
function isPreviewable(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const previewable = {
        image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
        video: ['mp4', 'webm', 'ogg', 'mov'],
        audio: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']
    };
    
    if (previewable.image.includes(ext)) return 'image';
    if (previewable.video.includes(ext)) return 'video';
    if (previewable.audio.includes(ext)) return 'audio';
    return null;
}

// Preview file
function previewFile(fileId, filename) {
    const type = isPreviewable(filename);
    if (!type) {
        downloadFile(fileId, filename);
        return;
    }
    
    const url = `${API_URL}/files/preview/${fileId}?token=${token}`;
    const container = document.getElementById('preview-container');
    document.getElementById('preview-title').textContent = filename;
    
    if (type === 'image') {
        container.innerHTML = `<img src="${url}" alt="${filename}">`;
    } else if (type === 'video') {
        container.innerHTML = `<video controls autoplay><source src="${url}"></video>`;
    } else if (type === 'audio') {
        container.innerHTML = `<audio controls autoplay><source src="${url}"></audio>`;
    }
    
    document.getElementById('preview-modal').classList.add('active');
}

// Close preview
function closePreview() {
    const modal = document.getElementById('preview-modal');
    modal.classList.remove('active');
    document.getElementById('preview-container').innerHTML = '';
}

// Close on escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePreview();
});

// Close on backdrop click
document.getElementById('preview-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'preview-modal') closePreview();
});

// Load files
async function loadFiles() {
    const filesList = document.getElementById('files-list');
    filesList.innerHTML = '<p class="loading">Loading files... (server may be waking up)</p>';
    
    try {
        const res = await fetchWithWakeup(`${API_URL}/files?token=${token}`);
        
        if (res.status === 401) {
            localStorage.clear();
            window.location.href = 'index.html';
            return;
        }
        
        const files = await res.json();
        
        if (files.length === 0) {
            filesList.innerHTML = '<p class="empty">No files yet. Upload something!</p>';
            return;
        }
        
        filesList.innerHTML = files.map(file => `
            <div class="file-item" data-id="${file.id}" onclick="previewFile(${file.id}, '${file.filename}')">
                <div class="file-info">
                    <span class="file-icon">${getFileIcon(file.filename)}</span>
                    <div class="file-details">
                        <div class="file-name">${file.filename}</div>
                        <div class="file-size">${formatSize(file.size)}</div>
                    </div>
                </div>
                <div class="file-actions">
                    <button onclick="event.stopPropagation(); downloadFile(${file.id}, '${file.filename}')" title="Download">⬇️</button>
                    <button onclick="event.stopPropagation(); deleteFile(${file.id})" title="Delete">🗑️</button>
                </div>
            </div>
        `).join('');
        
    } catch (err) {
        filesList.innerHTML = `<p class="empty">${err.message || 'Error loading files'}</p>`;
    }
}

// Upload file with progress - uses direct upload for large files
async function uploadFile(file) {
    const DIRECT_UPLOAD_THRESHOLD = 5 * 1024 * 1024; // 5MB
    
    // Show uploading state
    const filesList = document.getElementById('files-list');
    const uploadingDiv = document.createElement('div');
    uploadingDiv.className = 'file-item uploading';
    uploadingDiv.innerHTML = `
        <div class="file-info">
            <span class="file-icon">⏳</span>
            <div class="file-details">
                <div class="file-name">Uploading: ${file.name}</div>
                <div class="file-size" id="upload-progress">${formatSize(file.size)} - Starting...</div>
            </div>
        </div>
    `;
    filesList.insertBefore(uploadingDiv, filesList.firstChild);
    
    try {
        if (file.size > DIRECT_UPLOAD_THRESHOLD) {
            // Large file: use direct upload to Filebase
            await directUpload(file, uploadingDiv);
        } else {
            // Small file: upload through API
            await apiUpload(file, uploadingDiv);
        }
        
        uploadingDiv.remove();
        loadFiles();
    } catch (err) {
        uploadingDiv.remove();
        alert(err.message || 'Upload failed');
    }
}

// Direct upload to Filebase (for large files)
async function directUpload(file, progressDiv) {
    const progressEl = progressDiv.querySelector('#upload-progress');
    progressEl.textContent = `${formatSize(file.size)} - Getting upload URL...`;
    
    // Step 1: Get presigned URL from API
    const urlRes = await fetchWithWakeup(
        `${API_URL}/files/get-upload-url?token=${token}&filename=${encodeURIComponent(file.name)}&size=${file.size}`,
        { method: 'POST' }
    );
    
    if (!urlRes.ok) {
        throw new Error('Failed to get upload URL');
    }
    
    const { upload_url, file_key, filename, size } = await urlRes.json();
    
    // Step 2: Upload directly to Filebase with progress
    progressEl.textContent = `${formatSize(file.size)} - Uploading...`;
    
    await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressEl.textContent = `${formatSize(e.loaded)} / ${formatSize(e.total)} - ${percent}%`;
            }
        };
        
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve();
            } else {
                reject(new Error('Upload failed'));
            }
        };
        
        xhr.onerror = () => reject(new Error('Upload failed'));
        
        xhr.open('PUT', upload_url);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.send(file);
    });
    
    // Step 3: Confirm upload with API
    progressEl.textContent = `${formatSize(file.size)} - Confirming...`;
    
    const confirmRes = await fetchWithWakeup(
        `${API_URL}/files/confirm-upload?token=${token}&file_key=${encodeURIComponent(file_key)}&filename=${encodeURIComponent(filename)}&size=${size}`,
        { method: 'POST' }
    );
    
    if (!confirmRes.ok) {
        throw new Error('Failed to confirm upload');
    }
}

// API upload (for small files)
async function apiUpload(file, progressDiv) {
    const progressEl = progressDiv.querySelector('#upload-progress');
    progressEl.textContent = `${formatSize(file.size)} - Uploading...`;
    
    const formData = new FormData();
    formData.append('token', token);
    formData.append('file', file);
    
    const res = await fetch(`${API_URL}/files/upload`, {
        method: 'POST',
        body: formData
    });
    
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
    }
}

// Download file
async function downloadFile(fileId, filename) {
    window.open(`${API_URL}/files/download/${fileId}?token=${token}`, '_blank');
}

// Delete file
async function deleteFile(fileId) {
    if (!confirm('Delete this file?')) return;
    
    try {
        const res = await fetchWithWakeup(`${API_URL}/files/${fileId}?token=${token}`, {
            method: 'DELETE'
        });
        
        if (!res.ok) {
            alert('Delete failed');
            return;
        }
        
        loadFiles();
    } catch (err) {
        alert(err.message || 'Delete error');
    }
}

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        await fetch(`${API_URL}/spaces/logout?token=${token}`, { method: 'POST' });
    } catch (err) {}
    
    localStorage.clear();
    window.location.href = 'index.html';
});

// File input
const fileInput = document.getElementById('file-input');
fileInput.addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(uploadFile);
    fileInput.value = '';
});

// Drag and drop
const uploadArea = document.querySelector('.upload-area');

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    Array.from(e.dataTransfer.files).forEach(uploadFile);
});

// Initial load
loadFiles();
