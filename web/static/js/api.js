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
    },

    // Foods
    searchFoods(query) {
        return this.request('GET', `/api/foods/search?q=${encodeURIComponent(query)}`);
    },

    getFood(id) {
        return this.request('GET', `/api/foods/${id}`);
    },

    updateFood(id, data) {
        return this.request('PUT', `/api/foods/${id}`, data);
    },

    createFood(data) {
        return this.request('POST', '/api/foods', data);
    },

    // Diary
    getDiary(date) {
        const param = date ? `?date=${date}` : '';
        return this.request('GET', `/api/diary${param}`);
    },

    getDiaryRange(fromDate, toDate) {
        return this.request('GET', `/api/diary/range?from=${fromDate}&to=${toDate}`);
    },

    createDiaryEntry(data) {
        return this.request('POST', '/api/diary', data);
    },

    updateDiaryEntry(id, data) {
        return this.request('PUT', `/api/diary/${id}`, data);
    },

    deleteDiaryEntry(id) {
        return this.request('DELETE', `/api/diary/${id}`);
    },

    // Bank
    getBank(date) {
        return this.request('GET', `/api/bank?date=${date}`);
    },

    // Recipes
    listRecipes() {
        return this.request('GET', '/api/recipes');
    },

    getRecipe(id) {
        return this.request('GET', `/api/recipes/${id}`);
    },

    createRecipe(data) {
        return this.request('POST', '/api/recipes', data);
    },

    updateRecipe(id, data) {
        return this.request('PUT', `/api/recipes/${id}`, data);
    },

    deleteRecipe(id) {
        return this.request('DELETE', `/api/recipes/${id}`);
    },

    async uploadRecipeImage(recipeId, file) {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(`/api/recipes/${recipeId}/image`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Upload failed');
        }

        return response.json();
    },

    getRecipeImageUrl(recipeId, type = 'thumb') {
        return `/api/images/recipes/${recipeId}/${type}`;
    }
};
