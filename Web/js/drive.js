const API_URL = 'https://jed-uv1d.onrender.com';

const token = localStorage.getItem('jed_token');
const spaceId = localStorage.getItem('jed_space');

// Redirect if not logged in
if (!token || !spaceId) {
    window.location.href = 'index.html';
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

// Load files
async function loadFiles() {
    const filesList = document.getElementById('files-list');
    
    try {
        const res = await fetch(`${API_URL}/files?token=${token}`);
        
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
            <div class="file-item" data-id="${file.id}">
                <div class="file-info">
                    <span class="file-icon">${getFileIcon(file.filename)}</span>
                    <div class="file-details">
                        <div class="file-name">${file.filename}</div>
                        <div class="file-size">${formatSize(file.size)}</div>
                    </div>
                </div>
                <div class="file-actions">
                    <button onclick="downloadFile(${file.id}, '${file.filename}')" title="Download">⬇️</button>
                    <button onclick="deleteFile(${file.id})" title="Delete">🗑️</button>
                </div>
            </div>
        `).join('');
        
    } catch (err) {
        filesList.innerHTML = '<p class="empty">Error loading files</p>';
    }
}

// Upload file
async function uploadFile(file) {
    const formData = new FormData();
    formData.append('token', token);
    formData.append('file', file);
    
    try {
        const res = await fetch(`${API_URL}/files/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!res.ok) {
            alert('Upload failed');
            return;
        }
        
        loadFiles();
    } catch (err) {
        alert('Upload error');
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
        const res = await fetch(`${API_URL}/files/${fileId}?token=${token}`, {
            method: 'DELETE'
        });
        
        if (!res.ok) {
            alert('Delete failed');
            return;
        }
        
        loadFiles();
    } catch (err) {
        alert('Delete error');
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
