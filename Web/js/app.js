const API_URL = 'https://jed-uv1d.onrender.com';
const REQUEST_TIMEOUT = 60000; // 60 seconds for cold starts

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

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.form').forEach(f => f.classList.remove('active'));
        
        tab.classList.add('active');
        document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
        hideMessage();
    });
});

// Show message
function showMessage(text, type) {
    const msg = document.getElementById('message');
    msg.textContent = text;
    msg.className = `message ${type}`;
}

function hideMessage() {
    document.getElementById('message').className = 'message';
}

// Login form
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const spaceId = document.getElementById('login-id').value;
    const password = document.getElementById('login-pass').value;
    const btn = e.target.querySelector('button');
    
    btn.disabled = true;
    btn.textContent = 'Connecting...';
    showMessage('Waking up server, please wait...', 'success');
    
    try {
        const res = await fetchWithWakeup(`${API_URL}/spaces/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ space_id: spaceId, password })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            showMessage(data.detail || 'Login failed', 'error');
            return;
        }
        
        // Save token and redirect
        localStorage.setItem('jed_token', data.token);
        localStorage.setItem('jed_space', data.space_id);
        window.location.href = 'drive.html';
        
    } catch (err) {
        showMessage(err.message || 'Connection error', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Enter';
    }
});

// Create form
document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const spaceId = document.getElementById('create-id').value;
    const password = document.getElementById('create-pass').value;
    const btn = e.target.querySelector('button');
    
    btn.disabled = true;
    btn.textContent = 'Creating...';
    showMessage('Waking up server, please wait...', 'success');
    
    try {
        const res = await fetchWithWakeup(`${API_URL}/spaces/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ space_id: spaceId, password })
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            showMessage(data.detail || 'Creation failed', 'error');
            return;
        }
        
        showMessage('Space created! You can now login.', 'success');
        
        // Switch to login tab
        setTimeout(() => {
            document.querySelector('[data-tab="login"]').click();
            document.getElementById('login-id').value = spaceId;
        }, 1000);
        
    } catch (err) {
        showMessage(err.message || 'Connection error', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create Space';
    }
});

// Check if already logged in
if (localStorage.getItem('jed_token')) {
    window.location.href = 'drive.html';
}
