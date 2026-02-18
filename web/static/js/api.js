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

    getCurrentUser() {
        return this.request('GET', '/api/users/me');
    },

    updateCurrentUser(data) {
        return this.request('PUT', '/api/users/me', data);
    },

    listUsers() {
        return this.request('GET', '/api/users');
    },

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

    getBank(date) {
        return this.request('GET', `/api/bank?date=${date}`);
    },

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
        formData.append('image', file, file.name);

        const response = await fetch(`/api/recipes/${recipeId}/image`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error('Upload failed: ' + errorText);
        }

        return response.json();
    },

    getRecipeImageUrl(recipeId, type = 'thumb', updatedAt = null) {
        const cacheBuster = updatedAt ? new Date(updatedAt).getTime() : Date.now();
        return `/api/images/recipes/${recipeId}/${type}?v=${cacheBuster}`;
    },

    // Weight entries
    getWeightEntries(days = 90) {
        return this.request('GET', `/api/weight?days=${days}`);
    },

    createWeightEntry(data) {
        return this.request('POST', '/api/weight', data);
    },

    deleteWeightEntry(id) {
        return this.request('DELETE', `/api/weight/${id}`);
    },

    // Measurements
    getMeasurements() {
        return this.request('GET', '/api/measurements');
    },

    createMeasurement(data) {
        return this.request('POST', '/api/measurements', data);
    },

    deleteMeasurement(id) {
        return this.request('DELETE', `/api/measurements/${id}`);
    },

    // Stats
    getCalorieStats(days = 14) {
        return this.request('GET', `/api/stats/calories?days=${days}`);
    },

    getBankStats(days = 14) {
        return this.request('GET', `/api/stats/bank?days=${days}`);
    },

    // Custom foods
    getCustomFoods() {
        return this.request('GET', '/api/foods/custom');
    },

    deleteFood(id) {
        return this.request('DELETE', `/api/foods/${id}`);
    },

    // Drinks
    getDrinks() {
        return this.request('GET', '/api/drinks');
    },

    createDrink(data) {
        return this.request('POST', '/api/drinks', data);
    },

    updateDrink(id, data) {
        return this.request('PUT', `/api/drinks/${id}`, data);
    },

    deleteDrink(id) {
        return this.request('DELETE', `/api/drinks/${id}`);
    },

    getDrinkEntries(date) {
        return this.request('GET', `/api/drinks/entries?date=${date}`);
    },

    addDrinkEntry(drinkId, date) {
        return this.request('POST', '/api/drinks/entries', { drink_id: drinkId, date: date });
    },

    deleteDrinkEntry(id) {
        return this.request('DELETE', `/api/drinks/entries/${id}`);
    }
,

    // Google Fit / Steps
    getFitStatus() {
        return this.request('GET', '/api/fit/status');
    },

    disconnectFit() {
        return this.request('DELETE', '/api/fit/disconnect');
    },

    getSteps(days = 14) {
        return this.request('GET', `/api/steps?days=${days}`);
    },

    syncSteps() {
        return this.request('POST', '/api/steps/sync');
    }
};