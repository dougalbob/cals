// Recipe management component

const Recipes = {
    recipes: [],
    currentRecipe: null,
    editMode: false,
    ingredients: [],
    textIngredients: [],
    pendingImage: null,
    editorOpen: false,

    async loadList() {
        try {
            this.recipes = await API.listRecipes();
            this.renderList();
        } catch (err) {
            console.error('Failed to load recipes:', err);
        }
    },

    renderList() {
        const container = document.getElementById('recipes-list');
        if (!container) return;

        if (this.recipes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No recipes yet</p>
                    <button class="btn-primary" id="create-first-recipe">Create Your First Recipe</button>
                </div>
            `;
            document.getElementById('create-first-recipe')?.addEventListener('click', () => {
                this.showEditor();
            });
            return;
        }

        container.innerHTML = this.recipes.map(recipe => `
            <div class="recipe-card" data-recipe-id="${recipe.id}">
                <div class="recipe-card-image">
                    ${recipe.image_filename 
                        ? `<img src="${API.getRecipeImageUrl(recipe.image_filename, 'thumb')}" alt="${recipe.name}">`
                        : '<div class="recipe-card-placeholder">🍽️</div>'
                    }
                </div>
                <div class="recipe-card-info">
                    <div class="recipe-card-name">${recipe.name}</div>
                    <div class="recipe-card-meta">
                        ${Math.round(recipe.total_calories)} kcal
                        ${recipe.serves > 1 ? `• Serves ${recipe.serves}` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.recipe-card').forEach(card => {
            card.addEventListener('click', () => {
                this.showRecipe(parseInt(card.dataset.recipeId));
            });
        });
    },

    async showRecipe(id) {
        try {
            this.currentRecipe = await API.getRecipe(id);
            this.renderRecipeView();
        } catch (err) {
            alert('Failed to load recipe: ' + err.message);
        }
    },

    renderRecipeView() {
        const recipe = this.currentRecipe;
        const servingWeight = recipe.serves > 0 ? recipe.total_weight_grams / recipe.serves : recipe.total_weight_grams;
        const servingCalories = recipe.serves > 0 ? recipe.total_calories / recipe.serves : recipe.total_calories;

        const content = document.createElement('div');
        content.className = 'recipe-view';
        content.innerHTML = `
            <div class="recipe-header-with-image">
                <div class="recipe-header-text">
                    <h2>${recipe.name}</h2>
                    ${recipe.description ? `<p class="recipe-description">${recipe.description}</p>` : ''}
                    <div class="recipe-stats">
                        <span>${Math.round(recipe.total_calories)} kcal</span>
                        <span>${Math.round(recipe.total_weight_grams)}g</span>
                        ${recipe.serves > 1 ? `<span>Serves ${recipe.serves}</span>` : ''}
                    </div>
                </div>
                ${recipe.image_filename 
                    ? `<div class="recipe-header-thumb">
                           <img src="${API.getRecipeImageUrl(recipe.image_filename, 'thumb')}" alt="${recipe.name}">
                       </div>`
                    : ''
                }
            </div>

            <div class="recipe-section">
                <h3>Ingredients</h3>
                <ul class="recipe-ingredients">
                    ${(recipe.ingredients || []).map(ing => `
                        <li>
                            <span class="ing-qty">${Math.round(ing.quantity_grams)}g</span>
                            <span class="ing-name">${ing.food_name}</span>
                            <span class="ing-cals">${Math.round(ing.calories)} kcal</span>
                        </li>
                    `).join('')}
                    ${(recipe.text_ingredients || []).map(ti => `
                        <li class="text-ingredient">
                            <span class="ing-name">${ti.description}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>

            ${recipe.instructions ? `
                <div class="recipe-section">
                    <h3>Method</h3>
                    <div class="recipe-instructions">${recipe.instructions.replace(/\n/g, '<br>')}</div>
                </div>
            ` : ''}

            <div class="recipe-actions">
                <button class="btn-primary" id="add-recipe-to-diary">Add to Diary</button>
                <button class="btn-secondary" id="edit-recipe">Edit Recipe</button>
                <button class="btn-danger" id="delete-recipe">Delete</button>
            </div>
        `;

        Modal.open(recipe.name, content);

        document.getElementById('add-recipe-to-diary').addEventListener('click', () => {
            this.showAddToDiary(recipe, servingWeight, servingCalories);
        });

        document.getElementById('edit-recipe').addEventListener('click', () => {
            Modal.close();
            this.showEditor(recipe);
        });

        document.getElementById('delete-recipe').addEventListener('click', async () => {
            if (confirm('Delete this recipe?')) {
                try {
                    await API.deleteRecipe(recipe.id);
                    Modal.close();
                    this.loadList();
                } catch (err) {
                    alert('Failed to delete: ' + err.message);
                }
            }
        });
    },

    showAddToDiary(recipe, servingWeight, servingCalories) {
        const content = document.createElement('div');
        content.className = 'quantity-form';
        content.innerHTML = `
            <div class="quantity-food-name">${recipe.name}</div>
            <div class="quantity-per100">
                Total: ${Math.round(recipe.total_calories)} kcal | ${Math.round(recipe.total_weight_grams)}g
                ${recipe.serves > 1 ? `<br>Per serving: ${Math.round(servingCalories)} kcal | ${Math.round(servingWeight)}g` : ''}
            </div>

            ${recipe.serves > 1 ? `
                <div class="quantity-section">
                    <div class="quantity-label">Servings:</div>
                    <div class="quantity-presets serving-presets">
                        <button class="quantity-preset" data-servings="0.5">½</button>
                        <button class="quantity-preset" data-servings="1">1</button>
                        <button class="quantity-preset" data-servings="1.5">1½</button>
                        <button class="quantity-preset" data-servings="2">2</button>
                    </div>
                </div>
                <div class="quantity-divider">or</div>
            ` : ''}

            <div class="quantity-section">
                <div class="quantity-label">Weighed portion:</div>
                <div class="quantity-input-row">
                    <input type="number" id="recipe-grams" placeholder="Weight" min="1" step="1">
                    <span>g</span>
                </div>
            </div>

            <div class="quantity-section">
                <div class="quantity-label">Add to:</div>
                <div class="quantity-presets meal-presets">
                    <button class="meal-btn" data-meal="breakfast">Breakfast</button>
                    <button class="meal-btn" data-meal="lunch">Lunch</button>
                    <button class="meal-btn" data-meal="dinner">Dinner</button>
                    <button class="meal-btn" data-meal="snacks">Snacks</button>
                </div>
            </div>

            <div class="quantity-calc">
                <span id="calc-grams">0</span>g = <span id="calc-calories">0</span> kcal
            </div>

            <button class="btn-primary" id="confirm-add-recipe" disabled>Select a meal</button>
        `;

        Modal.open('Add to Diary', content);

        let currentGrams = 0;
        let selectedMeal = null;
        const gramsInput = document.getElementById('recipe-grams');
        const calcGrams = document.getElementById('calc-grams');
        const calcCalories = document.getElementById('calc-calories');
        const confirmBtn = document.getElementById('confirm-add-recipe');

        const updateCalc = (grams) => {
            currentGrams = grams;
            const ratio = grams / recipe.total_weight_grams;
            const calories = recipe.total_calories * ratio;
            calcGrams.textContent = Math.round(grams);
            calcCalories.textContent = Math.round(calories);
            updateButton();
        };

        const updateButton = () => {
            if (currentGrams > 0 && selectedMeal) {
                confirmBtn.textContent = `Add to ${selectedMeal.charAt(0).toUpperCase() + selectedMeal.slice(1)}`;
                confirmBtn.disabled = false;
            } else if (currentGrams > 0) {
                confirmBtn.textContent = 'Select a meal';
                confirmBtn.disabled = true;
            } else {
                confirmBtn.textContent = 'Enter quantity';
                confirmBtn.disabled = true;
            }
        };

        content.querySelectorAll('.serving-presets .quantity-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const servings = parseFloat(btn.dataset.servings);
                const grams = servings * servingWeight;
                gramsInput.value = Math.round(grams);
                updateCalc(grams);
            });
        });

        gramsInput.addEventListener('input', () => {
            updateCalc(parseFloat(gramsInput.value) || 0);
        });

        content.querySelectorAll('.meal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                content.querySelectorAll('.meal-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedMeal = btn.dataset.meal;
                updateButton();
            });
        });

        confirmBtn.addEventListener('click', async () => {
            if (currentGrams <= 0 || !selectedMeal) return;

            const ratio = currentGrams / recipe.total_weight_grams;
            const entry = {
                date: App.currentDate,
                meal: selectedMeal,
                recipe_id: recipe.id,
                quantity_grams: currentGrams,
                calories: recipe.total_calories * ratio,
                protein: recipe.total_protein * ratio,
                carbs: recipe.total_carbs * ratio,
                fat: recipe.total_fat * ratio,
                fibre: recipe.total_fibre * ratio
            };

            try {
                await API.createDiaryEntry(entry);
                Modal.close();
                App.loadTodayView();
            } catch (err) {
                alert('Failed to add: ' + err.message);
            }
        });
    },

    showEditor(recipe = null) {
        this.editMode = !!recipe;
        this.currentRecipe = recipe;
        this.editorOpen = true;
        
        if (!this.editorOpen || recipe) {
            this.ingredients = recipe?.ingredients?.map(ing => ({
                food_id: ing.food_id,
                food_name: ing.food_name,
                quantity_grams: ing.quantity_grams,
                calories: ing.calories,
                sort_order: ing.sort_order
            })) || [];
            this.textIngredients = recipe?.text_ingredients?.map(ti => ({
                description: ti.description,
                sort_order: ti.sort_order
            })) || [];
            this.pendingImage = null;
        }

        this.renderEditor(recipe);
    },

    renderEditor(recipe = null) {
        const content = document.createElement('div');
        content.className = 'recipe-editor';
        content.innerHTML = `
            <div class="form-group">
                <label>Recipe Name *</label>
                <input type="text" id="recipe-name" value="${recipe?.name || ''}" placeholder="e.g., Beef Chilli">
            </div>

            <div class="form-group">
                <label>Description (optional)</label>
                <input type="text" id="recipe-description" value="${recipe?.description || ''}" placeholder="A short description">
            </div>

            <div class="form-group">
                <label>Photo</label>
                <div class="image-upload">
                    <div class="image-preview" id="image-preview">
                        ${recipe?.image_filename 
                            ? `<img src="${API.getRecipeImageUrl(recipe.image_filename, 'thumb')}" alt="Recipe">`
                            : (this.pendingImage ? `<img src="${this.pendingImage}" alt="Preview">` : '<span>No image</span>')
                        }
                    </div>
                    <input type="file" id="recipe-image" accept="image/*" capture="environment" style="display:none">
                    <button class="btn-secondary" id="take-photo-btn">📷 Take Photo</button>
                </div>
            </div>

            <div class="form-section-title">Ingredients</div>
            <div id="ingredients-list" class="ingredients-list"></div>
            <div class="ingredient-actions">
                <button class="btn-secondary" id="add-food-ingredient">+ Add Food</button>
                <button class="btn-secondary" id="add-text-ingredient">+ Add Text</button>
            </div>

            <div class="form-group">
                <label>Final Weight (g)</label>
                <div class="weight-input-group">
                    <input type="number" id="recipe-weight" value="${recipe?.total_weight_grams || ''}" placeholder="Calculated automatically">
                    <label class="checkbox-label">
                        <input type="checkbox" id="weight-manual" ${recipe?.weight_is_manual ? 'checked' : ''}>
                        Override calculated weight
                    </label>
                </div>
                <div class="calculated-weight" id="calculated-weight">Calculated: 0g</div>
            </div>

            <div class="form-group">
                <label>Serves</label>
                <input type="number" id="recipe-serves" value="${recipe?.serves || 1}" min="1">
            </div>

            <div class="form-section-title">Method</div>
            <div class="form-group">
                <textarea id="recipe-instructions" rows="6" placeholder="Enter cooking instructions...">${recipe?.instructions || ''}</textarea>
            </div>

            <div class="recipe-totals" id="recipe-totals">
                <strong>Totals:</strong> 0 kcal | 0g
            </div>

            <div class="form-actions">
                <button class="btn-primary" id="save-recipe">${this.editMode ? 'Update Recipe' : 'Create Recipe'}</button>
                <button class="btn-secondary" id="cancel-recipe">Cancel</button>
            </div>
        `;

        Modal.open(this.editMode ? 'Edit Recipe' : 'New Recipe', content);

        this.renderIngredientsList();
        this.updateTotals();

        const imageInput = document.getElementById('recipe-image');
        const imagePreview = document.getElementById('image-preview');
        document.getElementById('take-photo-btn').addEventListener('click', () => {
            imageInput.click();
        });
        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.pendingImage = e.target.result;
                    imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
                };
                reader.readAsDataURL(file);
            }
        });

        document.getElementById('add-food-ingredient').addEventListener('click', () => {
            this.saveFormState();
            this.showFoodSearch();
        });

        document.getElementById('add-text-ingredient').addEventListener('click', () => {
            this.saveFormState();
            this.showTextIngredientInput();
        });

        const weightManual = document.getElementById('weight-manual');
        const weightInput = document.getElementById('recipe-weight');
        weightManual.addEventListener('change', (e) => {
            weightInput.disabled = !e.target.checked;
            if (!e.target.checked) {
                this.updateTotals();
            }
        });
        weightInput.disabled = !recipe?.weight_is_manual;

        document.getElementById('save-recipe').addEventListener('click', () => {
            this.saveRecipe();
        });

        document.getElementById('cancel-recipe').addEventListener('click', () => {
            this.editorOpen = false;
            this.ingredients = [];
            this.textIngredients = [];
            this.pendingImage = null;
            Modal.close();
            this.loadList();
        });
    },

    saveFormState() {
        const nameEl = document.getElementById('recipe-name');
        const descEl = document.getElementById('recipe-description');
        const servesEl = document.getElementById('recipe-serves');
        const instructionsEl = document.getElementById('recipe-instructions');
        const weightEl = document.getElementById('recipe-weight');
        const weightManualEl = document.getElementById('weight-manual');

        if (nameEl) {
            this._formState = {
                name: nameEl.value,
                description: descEl?.value || '',
                serves: servesEl?.value || 1,
                instructions: instructionsEl?.value || '',
                weight: weightEl?.value || '',
                weightManual: weightManualEl?.checked || false
            };
        }
    },

    restoreFormState() {
        if (!this._formState) return;

        const nameEl = document.getElementById('recipe-name');
        const descEl = document.getElementById('recipe-description');
        const servesEl = document.getElementById('recipe-serves');
        const instructionsEl = document.getElementById('recipe-instructions');
        const weightEl = document.getElementById('recipe-weight');
        const weightManualEl = document.getElementById('weight-manual');

        if (nameEl) nameEl.value = this._formState.name;
        if (descEl) descEl.value = this._formState.description;
        if (servesEl) servesEl.value = this._formState.serves;
        if (instructionsEl) instructionsEl.value = this._formState.instructions;
        if (weightEl) weightEl.value = this._formState.weight;
        if (weightManualEl) weightManualEl.checked = this._formState.weightManual;
    },

    renderIngredientsList() {
        const container = document.getElementById('ingredients-list');
        if (!container) return;

        let html = '';

        this.ingredients.forEach((ing, index) => {
            html += `
                <div class="ingredient-row" data-type="food" data-index="${index}">
                    <span class="ing-qty">${Math.round(ing.quantity_grams)}g</span>
                    <span class="ing-name">${ing.food_name}</span>
                    <span class="ing-cals">${Math.round(ing.calories || 0)} kcal</span>
                    <button class="ing-remove" data-type="food" data-index="${index}">×</button>
                </div>
            `;
        });

        this.textIngredients.forEach((ti, index) => {
            html += `
                <div class="ingredient-row text" data-type="text" data-index="${index}">
                    <span class="ing-name">${ti.description}</span>
                    <button class="ing-remove" data-type="text" data-index="${index}">×</button>
                </div>
            `;
        });

        container.innerHTML = html || '<div class="empty-ingredients">No ingredients added yet</div>';

        container.querySelectorAll('.ing-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                const index = parseInt(btn.dataset.index);
                if (type === 'food') {
                    this.ingredients.splice(index, 1);
                } else {
                    this.textIngredients.splice(index, 1);
                }
                this.renderIngredientsList();
                this.updateTotals();
            });
        });
    },

    updateTotals() {
        let totalCals = 0;
        let totalWeight = 0;

        this.ingredients.forEach(ing => {
            totalCals += ing.calories || 0;
            totalWeight += ing.quantity_grams || 0;
        });

        const totalsEl = document.getElementById('recipe-totals');
        const calcWeightEl = document.getElementById('calculated-weight');
        const weightEl = document.getElementById('recipe-weight');
        const weightManualEl = document.getElementById('weight-manual');

        if (totalsEl) {
            totalsEl.innerHTML = `<strong>Totals:</strong> ${Math.round(totalCals)} kcal | ${Math.round(totalWeight)}g`;
        }
        if (calcWeightEl) {
            calcWeightEl.textContent = `Calculated: ${Math.round(totalWeight)}g`;
        }

        if (weightEl && weightManualEl && !weightManualEl.checked) {
            weightEl.value = Math.round(totalWeight);
        }
    },

    showFoodSearch() {
        const content = document.createElement('div');
        content.innerHTML = `
            <div class="search-container">
                <input type="text" class="search-input" id="ing-search-input" 
                       placeholder="Search foods..." autocomplete="off" autofocus>
            </div>
            <div class="search-results" id="ing-search-results">
                <div class="search-empty">Start typing to search</div>
            </div>
        `;

        Modal.open('Add Ingredient', content);

        const input = document.getElementById('ing-search-input');
        const results = document.getElementById('ing-search-results');
        let debounce;

        input.addEventListener('input', () => {
            clearTimeout(debounce);
            const query = input.value.trim();
            if (query.length < 2) {
                results.innerHTML = '<div class="search-empty">Start typing to search</div>';
                return;
            }
            debounce = setTimeout(async () => {
                try {
                    const foods = await API.searchFoods(query);
                    if (foods.length === 0) {
                        results.innerHTML = '<div class="search-empty">No foods found</div>';
                        return;
                    }
                    results.innerHTML = foods.map(f => {
                        // Store all data we need directly from search results
                        const cals = f.calories_per_100g || 0;
                        return `
                            <div class="search-result" 
                                 data-food-id="${f.id}" 
                                 data-food-name="${this.escapeHtml(f.name)}"
                                 data-food-cals="${cals}"
                                 data-food-protein="${f.protein_per_100g || 0}"
                                 data-food-carbs="${f.carbs_per_100g || 0}"
                                 data-food-fat="${f.fat_per_100g || 0}"
                                 data-food-fibre="${f.fibre_per_100g || 0}"
                                 data-is-fatsecret="${String(f.id).startsWith('fs_')}">
                                <div class="search-result-name">${f.name}</div>
                                <div class="search-result-info">${Math.round(cals)} kcal/100g</div>
                            </div>
                        `;
                    }).join('');

                    results.querySelectorAll('.search-result').forEach(el => {
                        el.addEventListener('click', async () => {
                            const foodId = el.dataset.foodId;
                            const isFatSecret = el.dataset.isFatsecret === 'true';
                            
                            if (isFatSecret) {
                                // For FatSecret foods, we need to fetch to cache them
                                el.style.opacity = '0.5';
                                el.innerHTML += '<div class="search-loading">Loading...</div>';
                                
                                try {
                                    const food = await API.getFood(foodId);
                                    this.showQuantityForIngredient(food);
                                } catch (err) {
                                    console.error('Failed to fetch food:', err);
                                    // Fall back to using search data
                                    this.showQuantityForIngredient({
                                        id: foodId,
                                        name: el.dataset.foodName,
                                        calories_per_100g: parseFloat(el.dataset.foodCals) || 0,
                                        protein_per_100g: parseFloat(el.dataset.foodProtein) || 0,
                                        carbs_per_100g: parseFloat(el.dataset.foodCarbs) || 0,
                                        fat_per_100g: parseFloat(el.dataset.foodFat) || 0,
                                        fibre_per_100g: parseFloat(el.dataset.foodFibre) || 0
                                    });
                                }
                            } else {
                                // Local food - use data from search results directly
                                this.showQuantityForIngredient({
                                    id: parseInt(foodId),
                                    name: el.dataset.foodName,
                                    calories_per_100g: parseFloat(el.dataset.foodCals) || 0,
                                    protein_per_100g: parseFloat(el.dataset.foodProtein) || 0,
                                    carbs_per_100g: parseFloat(el.dataset.foodCarbs) || 0,
                                    fat_per_100g: parseFloat(el.dataset.foodFat) || 0,
                                    fibre_per_100g: parseFloat(el.dataset.foodFibre) || 0
                                });
                            }
                        });
                    });
                } catch (err) {
                    results.innerHTML = '<div class="search-empty">Search failed</div>';
                }
            }, 300);
        });

        setTimeout(() => input.focus(), 100);
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/"/g, '&quot;');
    },

    showQuantityForIngredient(food) {
        const content = document.createElement('div');
        content.className = 'quantity-form';
        content.innerHTML = `
            <div class="quantity-food-name">${food.name}</div>
            <div class="quantity-per100">${Math.round(food.calories_per_100g)} kcal per 100g</div>
            
            <div class="quantity-input-row">
                <input type="number" id="ing-grams" value="100" min="1" step="1">
                <span>g</span>
            </div>
            
            <div class="quantity-presets">
                <button class="quantity-preset" data-grams="50">50g</button>
                <button class="quantity-preset" data-grams="100">100g</button>
                <button class="quantity-preset" data-grams="150">150g</button>
                <button class="quantity-preset" data-grams="200">200g</button>
            </div>
            
            <div class="quantity-calc">
                = <span id="ing-calc-cals">${Math.round(food.calories_per_100g)}</span> kcal
            </div>
            
            <button class="btn-primary" id="add-ing-confirm">Add Ingredient</button>
        `;

        Modal.open('Quantity', content);

        const gramsInput = document.getElementById('ing-grams');
        const calcCals = document.getElementById('ing-calc-cals');

        const updateCalc = () => {
            const grams = parseFloat(gramsInput.value) || 0;
            const cals = food.calories_per_100g * grams / 100;
            calcCals.textContent = Math.round(cals);
        };

        gramsInput.addEventListener('input', updateCalc);

        content.querySelectorAll('.quantity-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                gramsInput.value = btn.dataset.grams;
                updateCalc();
            });
        });

        document.getElementById('add-ing-confirm').addEventListener('click', () => {
            const grams = parseFloat(gramsInput.value) || 0;
            if (grams <= 0) {
                alert('Enter a valid quantity');
                return;
            }

            this.ingredients.push({
                food_id: food.id,
                food_name: food.name,
                quantity_grams: grams,
                calories: food.calories_per_100g * grams / 100,
                sort_order: this.ingredients.length
            });

            this.renderEditor(this.currentRecipe);
            this.restoreFormState();
        });
    },

    showTextIngredientInput() {
        const content = document.createElement('div');
        content.innerHTML = `
            <div class="form-group">
                <label>Ingredient description</label>
                <input type="text" id="text-ing-desc" placeholder="e.g., Pinch of salt">
            </div>
            <button class="btn-primary" id="add-text-ing-confirm">Add</button>
        `;

        Modal.open('Add Text Ingredient', content);

        document.getElementById('add-text-ing-confirm').addEventListener('click', () => {
            const desc = document.getElementById('text-ing-desc').value.trim();
            if (!desc) {
                alert('Enter a description');
                return;
            }

            this.textIngredients.push({
                description: desc,
                sort_order: this.textIngredients.length
            });

            this.renderEditor(this.currentRecipe);
            this.restoreFormState();
        });

        setTimeout(() => document.getElementById('text-ing-desc').focus(), 100);
    },

    async saveRecipe() {
        const name = document.getElementById('recipe-name').value.trim();
        if (!name) {
            alert('Recipe name is required');
            return;
        }

        if (this.ingredients.length === 0) {
            alert('Add at least one food ingredient');
            return;
        }

        const data = {
            name: name,
            description: document.getElementById('recipe-description').value.trim(),
            instructions: document.getElementById('recipe-instructions').value.trim(),
            serves: parseInt(document.getElementById('recipe-serves').value) || 1,
            total_weight_grams: parseFloat(document.getElementById('recipe-weight').value) || 0,
            weight_is_manual: document.getElementById('weight-manual').checked,
            ingredients: this.ingredients.map((ing, i) => ({
                food_id: ing.food_id,
                quantity_grams: ing.quantity_grams,
                sort_order: i
            })),
            text_ingredients: this.textIngredients.map((ti, i) => ({
                description: ti.description,
                sort_order: i
            }))
        };

        try {
            let recipe;
            if (this.editMode && this.currentRecipe) {
                recipe = await API.updateRecipe(this.currentRecipe.id, data);
            } else {
                recipe = await API.createRecipe(data);
            }

            const imageInput = document.getElementById('recipe-image');
            if (imageInput && imageInput.files[0]) {
                await API.uploadRecipeImage(recipe.id, imageInput.files[0]);
            }

            this.editorOpen = false;
            this.ingredients = [];
            this.textIngredients = [];
            this.pendingImage = null;
            this._formState = null;

            Modal.close();
            this.loadList();
        } catch (err) {
            alert('Failed to save: ' + err.message);
        }
    }
};
