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
                    ${Math.round(food.calories_per_100g)} kcal/100g
                    ${food.serving_name ? `<span class="search-result-serving">• ${food.serving_name}</span>` : ''}
                    ${food.is_local ? '<span class="local-badge">Local</span>' : ''}
                </div>
            </div>
        `).join('');

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
            const id = foodId || `fs_${fatSecretId}`;
            const food = await API.getFood(id);
            this.showQuantityInput(food);
        } catch (err) {
            alert('Failed to load food: ' + err.message);
        }
    },

    showQuantityInput(food) {
        const hasServing = food.serving_name?.Valid && food.serving_grams?.Valid;
        const servingName = hasServing ? food.serving_name.String : null;
        const servingGrams = hasServing ? food.serving_grams.Float64 : null;

        // Also check for FatSecret servings
        const hasApiServings = food.servings && food.servings.length > 0;

        const content = document.createElement('div');
        content.className = 'quantity-form';

        let html = `
            <div class="quantity-food-name">${food.name}</div>
            <div class="quantity-per100">${Math.round(food.calories_per_100g)} kcal per 100g</div>
        `;

        if (hasServing) {
            // Custom serving defined
            html += `
                <div class="quantity-section">
                    <div class="quantity-label">Servings (${servingName} = ${servingGrams}g):</div>
                    <div class="quantity-presets serving-presets">
                        <button class="quantity-preset" data-servings="0.5">½</button>
                        <button class="quantity-preset" data-servings="1">1</button>
                        <button class="quantity-preset" data-servings="1.5">1½</button>
                        <button class="quantity-preset" data-servings="2">2</button>
                        <button class="quantity-preset" data-servings="3">3</button>
                    </div>
                    <div class="quantity-input-row">
                        <input type="number" id="quantity-servings" placeholder="Custom" step="0.5" min="0">
                        <span>servings</span>
                    </div>
                </div>
                <div class="quantity-divider">or</div>
            `;
        } else if (hasApiServings) {
            // FatSecret servings
            html += `
                <div class="quantity-section">
                    <div class="quantity-label">Select serving:</div>
                    <div class="quantity-presets api-servings">
                        ${food.servings.map(s => `
                            <button class="quantity-preset serving-btn" data-grams="${s.grams}">
                                ${s.description}
                            </button>
                        `).join('')}
                    </div>
                </div>
                <div class="quantity-divider">or</div>
            `;
        }

        html += `
            <div class="quantity-section">
                <div class="quantity-label">Enter grams:</div>
                <div class="quantity-input-row">
                    <input type="number" id="quantity-grams" placeholder="Weight" min="1" step="1">
                    <span>g</span>
                </div>
                <div class="quantity-presets gram-presets">
                    <button class="quantity-preset" data-grams="50">50g</button>
                    <button class="quantity-preset" data-grams="100">100g</button>
                    <button class="quantity-preset" data-grams="150">150g</button>
                    <button class="quantity-preset" data-grams="200">200g</button>
                </div>
            </div>

            <div class="quantity-calc">
                <span id="calc-grams">0</span>g = <span id="calc-calories">0</span> kcal
            </div>

            <button class="btn-primary" id="add-food-confirm">Add to ${this.capitalise(this.currentMeal)}</button>
            
            <div class="quantity-edit-link">
                <button class="btn-link" id="edit-food-btn">Edit nutritional values</button>
            </div>
        `;

        content.innerHTML = html;
        Modal.open('Select Quantity', content);

        // Elements
        const servingsInput = document.getElementById('quantity-servings');
        const gramsInput = document.getElementById('quantity-grams');
        const calcGrams = document.getElementById('calc-grams');
        const calcCalories = document.getElementById('calc-calories');
        const confirmBtn = document.getElementById('add-food-confirm');
        const editBtn = document.getElementById('edit-food-btn');

        let currentGrams = 0;

        const updateCalc = (grams) => {
            currentGrams = grams;
            const calories = (food.calories_per_100g * grams / 100);
            calcGrams.textContent = Math.round(grams);
            calcCalories.textContent = Math.round(calories);
        };

        // Serving preset buttons
        content.querySelectorAll('.serving-presets .quantity-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const servings = parseFloat(btn.dataset.servings);
                const grams = servings * servingGrams;
                if (servingsInput) servingsInput.value = servings;
                if (gramsInput) gramsInput.value = '';
                updateCalc(grams);
            });
        });

        // Servings input
        if (servingsInput) {
            servingsInput.addEventListener('input', () => {
                const servings = parseFloat(servingsInput.value) || 0;
                const grams = servings * servingGrams;
                if (gramsInput) gramsInput.value = '';
                updateCalc(grams);
            });
        }

        // API serving buttons
        content.querySelectorAll('.api-servings .serving-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const grams = parseFloat(btn.dataset.grams);
                if (gramsInput) gramsInput.value = grams;
                updateCalc(grams);
            });
        });

        // Gram preset buttons
        content.querySelectorAll('.gram-presets .quantity-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const grams = parseFloat(btn.dataset.grams);
                gramsInput.value = grams;
                if (servingsInput) servingsInput.value = '';
                updateCalc(grams);
            });
        });

        // Grams input
        gramsInput.addEventListener('input', () => {
            const grams = parseFloat(gramsInput.value) || 0;
            if (servingsInput) servingsInput.value = '';
            updateCalc(grams);
        });

        // Confirm button
        confirmBtn.addEventListener('click', () => {
            if (currentGrams <= 0) {
                alert('Please select a quantity');
                return;
            }
            if (this.onFoodSelected) {
                this.onFoodSelected(food, currentGrams, this.currentMeal);
            }
            Modal.close();
        });

        // Edit button
        editBtn.addEventListener('click', () => {
            this.showEditFood(food);
        });
    },

    showEditFood(food) {
        const servingName = food.serving_name?.Valid ? food.serving_name.String : '';
        const servingGrams = food.serving_grams?.Valid ? food.serving_grams.Float64 : '';
        const brand = food.brand?.Valid ? food.brand.String : (food.brand || '');

        const content = document.createElement('div');
        content.className = 'edit-food-form';
        content.innerHTML = `
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="edit-name" value="${food.name}">
            </div>
            <div class="form-group">
                <label>Brand (optional)</label>
                <input type="text" id="edit-brand" value="${brand}">
            </div>
            <div class="form-section-title">Nutritional Values per 100g</div>
            <div class="form-group">
                <label>Calories</label>
                <input type="number" id="edit-calories" value="${food.calories_per_100g}" step="0.1">
            </div>
            <div class="form-group">
                <label>Protein (g)</label>
                <input type="number" id="edit-protein" value="${food.protein_per_100g}" step="0.1">
            </div>
            <div class="form-group">
                <label>Carbs (g)</label>
                <input type="number" id="edit-carbs" value="${food.carbs_per_100g}" step="0.1">
            </div>
            <div class="form-group">
                <label>Fat (g)</label>
                <input type="number" id="edit-fat" value="${food.fat_per_100g}" step="0.1">
            </div>
            <div class="form-group">
                <label>Fibre (g)</label>
                <input type="number" id="edit-fibre" value="${food.fibre_per_100g}" step="0.1">
            </div>
            <div class="form-section-title">Default Serving (optional)</div>
            <div class="form-group">
                <label>Serving name (e.g., "1 piece", "1 tin")</label>
                <input type="text" id="edit-serving-name" value="${servingName}" placeholder="e.g., 1 piece">
            </div>
            <div class="form-group">
                <label>Serving weight (g)</label>
                <input type="number" id="edit-serving-grams" value="${servingGrams}" step="1" placeholder="e.g., 133">
            </div>
            <button class="btn-primary" id="save-food-btn">Save Changes</button>
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
                fibre_per_100g: parseFloat(document.getElementById('edit-fibre').value),
                serving_name: document.getElementById('edit-serving-name').value || null,
                serving_grams: parseFloat(document.getElementById('edit-serving-grams').value) || null
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
                <input type="text" id="create-name" placeholder="e.g., Aldi Breaded Cod">
            </div>
            <div class="form-group">
                <label>Brand (optional)</label>
                <input type="text" id="create-brand" placeholder="e.g., Aldi">
            </div>
            <div class="form-section-title">Nutritional Values per 100g</div>
            <div class="form-group">
                <label>Calories *</label>
                <input type="number" id="create-calories" step="0.1">
            </div>
            <div class="form-group">
                <label>Protein (g)</label>
                <input type="number" id="create-protein" value="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Carbs (g)</label>
                <input type="number" id="create-carbs" value="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Fat (g)</label>
                <input type="number" id="create-fat" value="0" step="0.1">
            </div>
            <div class="form-group">
                <label>Fibre (g)</label>
                <input type="number" id="create-fibre" value="0" step="0.1">
            </div>
            <div class="form-section-title">Default Serving (optional)</div>
            <div class="form-group">
                <label>Serving name (e.g., "1 piece", "1 tin")</label>
                <input type="text" id="create-serving-name" placeholder="e.g., 1 piece">
            </div>
            <div class="form-group">
                <label>Serving weight (g)</label>
                <input type="number" id="create-serving-grams" step="1" placeholder="e.g., 133">
            </div>
            <button class="btn-primary" id="create-food-confirm">Create Food</button>
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
                fibre_per_100g: parseFloat(document.getElementById('create-fibre').value) || 0,
                serving_name: document.getElementById('create-serving-name').value.trim() || null,
                serving_grams: parseFloat(document.getElementById('create-serving-grams').value) || null
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
