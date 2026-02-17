// Foods management component

const Foods = {
    foods: [],

    async loadList() {
        try {
            this.foods = await API.getCustomFoods();
            this.renderList();
            this.setupEventListeners();
        } catch (err) {
            console.error('Failed to load foods:', err);
            this.foods = [];
            this.renderList();
        }
    },

    setupEventListeners() {
        const searchInput = document.getElementById('foods-list-search');
        if (searchInput && !searchInput.dataset.listenerAdded) {
            searchInput.dataset.listenerAdded = 'true';
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.toLowerCase().trim();
                if (!query) {
                    this.renderList();
                } else {
                    const filtered = this.foods.filter(food =>
                        food.name.toLowerCase().includes(query) ||
                        (food.brand && food.brand.toLowerCase().includes(query))
                    );
                    this.renderList(filtered);
                }
            });
        }

        const createBtn = document.getElementById('create-custom-food-main');
        if (createBtn && !createBtn.dataset.listenerAdded) {
            createBtn.dataset.listenerAdded = 'true';
            createBtn.addEventListener('click', () => {
                this.showCreateFood();
            });
        }
    },

    renderList(filteredFoods = null) {
        const container = document.getElementById('foods-list');
        if (!container) return;

        const foodsToShow = filteredFoods || this.foods;

        if (foodsToShow.length === 0) {
            container.innerHTML = `
                <div class="foods-empty">
                    <p>${this.foods.length === 0 ? 'No custom foods yet' : 'No foods match your search'}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = foodsToShow.map(food => `
            <div class="food-card" data-food-id="${food.id}">
                <div class="food-card-name">${food.name}</div>
                ${food.brand ? `<div class="food-card-brand">${food.brand}</div>` : ''}
                <div class="food-card-meta">${Math.round(food.calories_per_100g)} kcal/100g</div>
                ${food.serving_name ? `<div class="food-card-serving">${food.serving_name}: ${food.serving_grams}g</div>` : ''}
            </div>
        `).join('');

        container.querySelectorAll('.food-card').forEach(card => {
            card.addEventListener('click', () => {
                this.showEditFood(parseInt(card.dataset.foodId));
            });
        });
    },

    showCreateFood() {
        const self = this;
        const content = document.createElement('div');
        content.className = 'custom-food-form';
        content.innerHTML = `
            <div class="form-group">
                <label>Food Name *</label>
                <input type="text" id="custom-food-name" placeholder="e.g., Homemade granola">
            </div>
            <div class="form-group">
                <label>Brand (optional)</label>
                <input type="text" id="custom-food-brand" placeholder="e.g., Own brand">
            </div>
            <div class="form-group">
                <label>Calories per 100g *</label>
                <input type="number" id="custom-food-calories" min="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Protein per 100g</label>
                <input type="number" id="custom-food-protein" min="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Carbs per 100g</label>
                <input type="number" id="custom-food-carbs" min="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Fat per 100g</label>
                <input type="number" id="custom-food-fat" min="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Fibre per 100g</label>
                <input type="number" id="custom-food-fibre" min="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Serving Name (optional)</label>
                <input type="text" id="custom-food-serving-name" placeholder="e.g., 1 bowl">
            </div>
            <div class="form-group">
                <label>Serving Size in grams (optional)</label>
                <input type="number" id="custom-food-serving-grams" min="0" step="0.1">
            </div>
            <div class="form-actions-sticky">
                <button class="btn-primary" id="save-custom-food">Save</button>
                <button class="btn-secondary" id="cancel-custom-food">Cancel</button>
            </div>
        `;

        Modal.open('Create Custom Food', content, () => {
            // On close, stay on foods list
        });

        document.getElementById('cancel-custom-food').addEventListener('click', () => {
            Modal.close();
        });

        document.getElementById('save-custom-food').addEventListener('click', async () => {
            const name = document.getElementById('custom-food-name').value.trim();
            const calories = parseFloat(document.getElementById('custom-food-calories').value);

            if (!name) {
                alert('Please enter a food name');
                return;
            }
            if (!calories || calories < 0) {
                alert('Please enter valid calories per 100g');
                return;
            }

            const foodData = {
                name: name,
                brand: document.getElementById('custom-food-brand').value.trim() || null,
                calories_per_100g: calories,
                protein_per_100g: parseFloat(document.getElementById('custom-food-protein').value) || 0,
                carbs_per_100g: parseFloat(document.getElementById('custom-food-carbs').value) || 0,
                fat_per_100g: parseFloat(document.getElementById('custom-food-fat').value) || 0,
                fibre_per_100g: parseFloat(document.getElementById('custom-food-fibre').value) || 0,
                serving_name: document.getElementById('custom-food-serving-name').value.trim() || null,
                serving_grams: parseFloat(document.getElementById('custom-food-serving-grams').value) || null
            };

            try {
                await API.createFood(foodData);
                Modal.close();
                this.loadList();
            } catch (err) {
                alert('Failed to create food: ' + err.message);
            }
        });
    },

    async showEditFood(foodId) {
        const self = this;
        let food;
        
        try {
            food = await API.getFood(foodId);
        } catch (err) {
            alert('Failed to load food: ' + err.message);
            return;
        }

        const content = document.createElement('div');
        content.className = 'custom-food-form';
        content.innerHTML = `
            <div class="form-group">
                <label>Food Name *</label>
                <input type="text" id="edit-food-name" value="${food.name}" placeholder="e.g., Homemade granola">
            </div>
            <div class="form-group">
                <label>Brand (optional)</label>
                <input type="text" id="edit-food-brand" value="${food.brand || ''}" placeholder="e.g., Own brand">
            </div>
            <div class="form-group">
                <label>Calories per 100g *</label>
                <input type="number" id="edit-food-calories" value="${food.calories_per_100g}" min="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Protein per 100g</label>
                <input type="number" id="edit-food-protein" value="${food.protein_per_100g || ''}" min="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Carbs per 100g</label>
                <input type="number" id="edit-food-carbs" value="${food.carbs_per_100g || ''}" min="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Fat per 100g</label>
                <input type="number" id="edit-food-fat" value="${food.fat_per_100g || ''}" min="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Fibre per 100g</label>
                <input type="number" id="edit-food-fibre" value="${food.fibre_per_100g || ''}" min="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Serving Name (optional)</label>
                <input type="text" id="edit-food-serving-name" value="${food.serving_name || ''}" placeholder="e.g., 1 bowl">
            </div>
            <div class="form-group">
                <label>Serving Size in grams (optional)</label>
                <input type="number" id="edit-food-serving-grams" value="${food.serving_grams || ''}" min="0" step="0.1">
            </div>
            <div class="form-actions-sticky">
                <button class="btn-primary" id="update-food">Update</button>
                <button class="btn-danger" id="delete-food">Delete</button>
                <button class="btn-secondary" id="cancel-edit-food">Cancel</button>
            </div>
        `;

        Modal.open('Edit Food', content, () => {
            // On close, stay on foods list
        });

        document.getElementById('cancel-edit-food').addEventListener('click', () => {
            Modal.close();
        });

        document.getElementById('delete-food').addEventListener('click', async () => {
            if (!confirm('Delete this food? This cannot be undone.')) return;
            
            try {
                await API.deleteFood(foodId);
                Modal.close();
                this.loadList();
            } catch (err) {
                alert('Failed to delete: ' + err.message);
            }
        });

        document.getElementById('update-food').addEventListener('click', async () => {
            const name = document.getElementById('edit-food-name').value.trim();
            const calories = parseFloat(document.getElementById('edit-food-calories').value);

            if (!name) {
                alert('Please enter a food name');
                return;
            }
            if (!calories || calories < 0) {
                alert('Please enter valid calories per 100g');
                return;
            }

            const foodData = {
                name: name,
                brand: document.getElementById('edit-food-brand').value.trim() || null,
                calories_per_100g: calories,
                protein_per_100g: parseFloat(document.getElementById('edit-food-protein').value) || 0,
                carbs_per_100g: parseFloat(document.getElementById('edit-food-carbs').value) || 0,
                fat_per_100g: parseFloat(document.getElementById('edit-food-fat').value) || 0,
                fibre_per_100g: parseFloat(document.getElementById('edit-food-fibre').value) || 0,
                serving_name: document.getElementById('edit-food-serving-name').value.trim() || null,
                serving_grams: parseFloat(document.getElementById('edit-food-serving-grams').value) || null
            };

            try {
                await API.updateFood(foodId, foodData);
                Modal.close();
                this.loadList();
            } catch (err) {
                alert('Failed to update: ' + err.message);
            }
        });
    }
};
