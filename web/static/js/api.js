// API client

const API = {
    async request(method, endpoint, data = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(endpoint, options);
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }

        if (response.status === 204) {
            return null;
        }

        return response.json();
    },

    // Users
    getCurrentUser() {
        return this.request('GET', '/api/users/me');
    },

    updateCurrentUser(data) {
        return this.request('PUT', '/api/users/me', data);
    },

    listUsers() {
        return this.request('GET', '/api/users');
    }
};
