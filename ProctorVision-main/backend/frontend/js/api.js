// API Configuration - USE YOUR CODESPACES URL


const API_BASE_URL = 'https://probable-space-goggles-69596vjpvg9wcr474-8000.app.github.dev';

async function apiRequest(endpoint, method = 'GET', data = null, token = null) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
        'Content-Type': 'application/json',
    };
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const config = { method, headers };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        config.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, config);
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Example: Test the backend
async function testBackend() {
    try {
        const result = await apiRequest('/');
        console.log('Backend test:', result);
        return result;
    } catch (error) {
        console.error('Backend not reachable');
        return null;
    }
}

// Test it now
testBackend();

window.api = { apiRequest, testBackend };
