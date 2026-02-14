// Food search component

const FoodSearch = {
    debounceTimer: null,
    currentMeal: null,
    onFoodSelected: null,

    show(meal, onSelect) {
        this.currentMeal = meal;
        this.onFoodSelected = onSelect;

        const content = document.createElement('div');
        content.innerHTML = `
            <div class="search-container">
                <input type="text" class="search-input" id="food-search-input" 
                       placeholder="Search foods..." autocomplete="off" autofocus>
                <button class="search-clear" id="search-clear">&times;</button>
            </div>
            <div class="search-results" id="search-results">
                <div class="search-empty">Start typing to search foods</div>
            </div>
            <div class="search-footer">
                <button class="btn-secondary" id="create-food-btn">+ Create Custom Food</button>
            </div>
        `;

        Modal.open(`Add to ${this.capitalise(meal)}`, content);

        // Set up event listeners
        const input = document.getElementById('food-search-input');
        const clearBtn = document.getElementById('search-clear');
        const resultsDiv = document.getElementById('search-results');
        const createBtn = document.getElementById('create-food-btn');

        input.addEventListener('input', (e) => {
            this.handleSearch(e.target.value, resultsDiv);
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            resultsDiv.innerHTML = '<div class="search-empty">Start typing to search foods</div>';
            input.focus();
        });

        createBtn.addEventListener('click', () => {
            this.showCreateFood();
        });

        // Focus input after modal animation
        setTimeout(() => input.focus(), 100);
    },

    handleSearch(query, resultsDiv) {
        clearTimeout(this.debounceTimer);

        query = query.trim();
        if (query.length < 2) {
            resultsDiv.innerHTML = '<div class="search-empty">Start typing to search foods</div>';
            return;
        }

        resultsDiv.innerHTML = '<div class="search-loading">Searching...</div>';

        this.debounceTimer = setTimeout(async () => {
            try {
                const results = await API.searchFoods(query);
                this.renderResults(results, resultsDiv);
            } catch (err) {
                resultsDiv.innerHTML = `<div class="search-empty">Search failed: ${err.message}</div>`;
            }
        }, 300);
    },

    renderResults(results, container) {
        if (!results || results.length === 0) {
            container.innerHTML = '<div class="search-empty">No foods found</div>';
            return;
        }

        container.innerHTML = results.map(food => `
            <div class="search-result" data-food-id="${food.id || ''}" data-fatsecret-id="${food.fatsecret_id || ''}">
                <div class="search-result-name">
                    ${food.name}
                    ${food.brand ? `<span class="search-result-brand">(${food.brand})</span>` : ''}
                    ${food.is_edited ? '<span class="search-result-edited">✎</span>' : ''}
                </div>
                <div class="search-result-info">
                    ${Math.round(food.calories_per_100g)} kcal per 100g
                    ${food.is_local ? '<span class="local-badge">Local</span>' : ''}
                </div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.search-result').forEach(el => {
            el.addEventListener('click', () => {
                const foodId = el.dataset.foodId;
                const fatSecretId = el.dataset.fatsecretId;
                this.selectFood(foodId, fatSecretId);
            });
        });
    },

    async selectFood(foodId, fatSecretId) {
        try {
            // If it's a FatSecret result without local ID, fetch and cache it
            const id = foodId || `fs_${fatSecretId}`;
            const food = await API.getFood(id);
            this.showQuantityInput(food);
        } catch (err) {
            alert('Failed to load food: ' + err.message);
        }
    },

    showQuantityInput(food) {
        const content = document.createElement('div');
        content.className = 'quantity-form';
        content.innerHTML = `
            <div class="quantity-food-name">${food.name}</div>
            <div class="quantity-per100">${Math.round(food.calories_per_100g)} kcal per 100g</div>
            
            <div class="quantity-input-group">
                <input type="number" id="quantity-grams" value="100" min="1" max="2000" step="1">
                <span>grams</span>
            </div>
            
            <div class="quantity-calc">
                <span id="calc-calories">${Math.round(food.calories_per_100g)}</span> kcal
            </div>
            
            ${food.servings && food.servings.length > 0 ? `
                <div class="quantity-presets">
                    ${food.servings.map(s => `
                        <button class="quantity-preset" data-grams="${s.grams}">
                            ${s.description}
                        </button>
                    `).join('')}
                </div>
            ` : ''}
            
            <button class="btn-primary" id="add-food-confirm" style="width: 100%;">Add to ${this.capitalise(this.currentMeal)}</button>
            
            <div style="margin-top: 1rem; text-align: center;">
                <button class="btn-link" id="edit-food-btn">Edit nutritional values</button>
            </div>
        `;

        Modal.open('Select Quantity', content);

        const gramsInput = document.getElementById('quantity-grams');
        const calcDisplay = document.getElementById('calc-calories');
        const confirmBtn = document.getElementById('add-food-confirm');
        const editBtn = document.getElementById('edit-food-btn');

        const updateCalc = () => {
            const grams = parseFloat(gramsInput.value) || 0;
            const calories = (food.calories_per_100g * grams / 100);
            calcDisplay.textContent = Math.round(calories);
        };

        gramsInput.addEventListener('input', updateCalc);

        // Preset buttons
        content.querySelectorAll('.quantity-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                gramsInput.value = btn.dataset.grams;
                updateCalc();
            });
        });

        confirmBtn.addEventListener('click', () => {
            const grams = parseFloat(gramsInput.value) || 0;
            if (grams <= 0) {
                alert('Please enter a valid quantity');
                return;
            }
            if (this.onFoodSelected) {
                this.onFoodSelected(food, grams, this.currentMeal);
            }
            Modal.close();
        });

        editBtn.addEventListener('click', () => {
            this.showEditFood(food);
        });

        setTimeout(() => gramsInput.select(), 100);
    },

    showEditFood(food) {
        const content = document.createElement('div');
        content.className = 'edit-food-form';
        content.innerHTML = `
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="edit-name" value="${food.name}">
            </div>
            <div class="form-group">
                <label>Brand (optional)</label>
                <input type="text" id="edit-brand" value="${food.brand?.String || food.brand || ''}">
            </div>
            <div class="form-group">
                <label>Calories per 100g</label>
                <input type="number" id="edit-calories" value="${food.calories_per_100g}" step="0.1">
            </div>
            <div class="form-group">
                <label>Protein per 100g</label>
                <input type="number" id="edit-protein" value="${food.protein_per_100g}" step="0.1">
            </div>
            <div class="form-group">
                <label>Carbs per 100g</label>
                <input type="number" id="edit-carbs" value="${food.carbs_per_100g}" step="0.1">
            </div>
            <div class="form-group">
                <label>Fat per 100g</label>
                <input type="number" id="edit-fat" value="${food.fat_per_100g}" step="0.1">
            </div>
            <div class="form-group">
                <label>Fibre per 100g</label>
                <input type="number" id="edit-fibre" value="${food.fibre_per_100g}" step="0.1">
            </div>
            <button class="btn-primary" id="save-food-btn" style="width: 100%;">Save Changes</button>
        `;

        Modal.open('Edit Food', content);

        document.getElementById('save-food-btn').addEventListener('click', async () => {
            const updates = {
                name: document.getElementById('edit-name').value,
                brand: document.getElementById('edit-brand').value,
                calories_per_100g: parseFloat(document.getElementById('edit-calories').value),
                protein_per_100g: parseFloat(document.getElementById('edit-protein').value),
                carbs_per_100g: parseFloat(document.getElementById('edit-carbs').value),
                fat_per_100g: parseFloat(document.getElementById('edit-fat').value),
                fibre_per_100g: parseFloat(document.getElementById('edit-fibre').value)
            };

            try {
                const updatedFood = await API.updateFood(food.id, updates);
                this.showQuantityInput(updatedFood);
            } catch (err) {
                alert('Failed to save: ' + err.message);
            }
        });
    },

    showCreateFood() {
        const content = document.createElement('div');
        content.className = 'edit-food-form';
        content.innerHTML = `
            <div class="form-group">
                <label>Name *</label>
                <input type="text" id="create-name" placeholder="e.g., Aldi Cowbelle Semi-skimmed Milk">
            </div>
            <div class="form-group">
                <label>Brand (optional)</label>
                <input type="text" id="create-brand" placeholder="e.g., Aldi">
            </div>
            <div class="form-group">
                <label>Calories per 100g *</label>
                <input type="number" id="create-calories" step="0.1">
            </div>
            <div class="form-group">
                <label>Protein per 100g</label>
                <input type="number" id="create-protein" value="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Carbs per 100g</label>
                <input type="number" id="create-carbs" value="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Fat per 100g</label>
                <input type="number" id="create-fat" value="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Fibre per 100g</label>
                <input type="number" id="create-fibre" value="0" step="0.1">
            </div>
            <button class="btn-primary" id="create-food-confirm" style="width: 100%;">Create Food</button>
        `;

        Modal.open('Create Custom Food', content);

        document.getElementById('create-food-confirm').addEventListener('click', async () => {
            const name = document.getElementById('create-name').value.trim();
            const calories = parseFloat(document.getElementById('create-calories').value);

            if (!name) {
                alert('Please enter a food name');
                return;
            }
            if (!calories && calories !== 0) {
                alert('Please enter calories per 100g');
                return;
            }

            const foodData = {
                name: name,
                brand: document.getElementById('create-brand').value.trim(),
                calories_per_100g: calories,
                protein_per_100g: parseFloat(document.getElementById('create-protein').value) || 0,
                carbs_per_100g: parseFloat(document.getElementById('create-carbs').value) || 0,
                fat_per_100g: parseFloat(document.getElementById('create-fat').value) || 0,
                fibre_per_100g: parseFloat(document.getElementById('create-fibre').value) || 0
            };

            try {
                const food = await API.createFood(foodData);
                this.showQuantityInput(food);
            } catch (err) {
                alert('Failed to create food: ' + err.message);
            }
        });
    },

    capitalise(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
};
