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

// Upload file
async function uploadFile(file) {
    const formData = new FormData();
    formData.append('token', token);
    formData.append('file', file);
    
    try {
        const res = await fetchWithWakeup(`${API_URL}/files/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) {
            alert('Upload failed');
            return;
        }
        
        loadFiles();
    } catch (err) {
        alert(err.message || 'Upload error');
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
