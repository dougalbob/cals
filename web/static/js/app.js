// Main application

const App = {
    user: null,
    currentView: 'today',
    todayEntries: [],

    async init() {
        Modal.init();
        
        // Load current user
        try {
            this.user = await API.getCurrentUser();
            this.updateUserDisplay();
        } catch (err) {
            console.error('Failed to load user:', err);
        }

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchView(btn.dataset.view);
            });
        });

        // Add food buttons
        document.querySelectorAll('.add-food-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const meal = btn.dataset.meal;
                FoodSearch.show(meal, (food, grams, meal) => {
                    this.addFoodEntry(food, grams, meal);
                });
            });
        });

        // Settings form
        document.getElementById('save-settings').addEventListener('click', () => {
            this.saveSettings();
        });

        // Load initial data
        this.loadTodayView();
    },

    switchView(viewName) {
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });

        // Update views
        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === `view-${viewName}`);
        });

        this.currentView = viewName;

        // Load view data
        switch (viewName) {
            case 'today':
                this.loadTodayView();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
    },

    updateUserDisplay() {
        const nameEl = document.getElementById('user-name');
        nameEl.textContent = this.user.name || this.user.email;
    },

    loadTodayView() {
        // Update goals display
        document.getElementById('today-goal').textContent = this.user?.daily_calorie_goal || 2000;
        document.getElementById('water-goal').textContent = this.user?.daily_water_goal_ml || 2000;
        
        // Render any entries we have (will be populated in Phase 3)
        this.renderTodayEntries();
    },

    renderTodayEntries() {
        const meals = ['breakfast', 'lunch', 'dinner', 'snacks'];
        let totalCalories = 0;

        meals.forEach(meal => {
            const entries = this.todayEntries.filter(e => e.meal === meal);
            const container = document.getElementById(`${meal}-entries`);
            const totalEl = document.getElementById(`${meal}-total`);
            
            let mealCalories = 0;

            if (entries.length === 0) {
                container.innerHTML = '';
            } else {
                container.innerHTML = entries.map(entry => {
                    mealCalories += entry.calories;
                    return `
                        <div class="meal-entry" data-entry-id="${entry.id}">
                            <div class="meal-entry-info">
                                <div class="meal-entry-name">${entry.food?.name || entry.recipe?.name || 'Unknown'}</div>
                                <div class="meal-entry-qty">${Math.round(entry.quantity_grams)}g</div>
                            </div>
                            <div class="meal-entry-cals">${Math.round(entry.calories)}</div>
                            <div class="meal-entry-actions">
                                <button class="meal-entry-delete" data-entry-id="${entry.id}">&times;</button>
                            </div>
                        </div>
                    `;
                }).join('');

                // Add delete handlers
                container.querySelectorAll('.meal-entry-delete').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deleteEntry(parseInt(btn.dataset.entryId));
                    });
                });
            }

            totalEl.textContent = mealCalories > 0 ? `${Math.round(mealCalories)} kcal` : '';
            totalCalories += mealCalories;
        });

        // Update ring
        this.updateCalorieRing(totalCalories);
    },

    updateCalorieRing(consumed) {
        const goal = this.user?.daily_calorie_goal || 2000;
        const progress = Math.min(consumed / goal, 1.5); // Cap at 150%
        const circumference = 2 * Math.PI * 45; // r=45
        const offset = circumference * (1 - Math.min(progress, 1));

        const ring = document.getElementById('calorie-progress');
        ring.style.strokeDashoffset = offset;
        ring.classList.toggle('over', consumed > goal);

        document.getElementById('today-consumed').textContent = Math.round(consumed);
    },

    async addFoodEntry(food, grams, meal) {
        // For now, just add to local array (Phase 3 will save to server)
        const calories = (food.calories_per_100g * grams / 100);
        const entry = {
            id: Date.now(), // Temporary ID
            meal: meal,
            food_id: food.id,
            food: food,
            quantity_grams: grams,
            calories: calories,
            protein: (food.protein_per_100g * grams / 100),
            carbs: (food.carbs_per_100g * grams / 100),
            fat: (food.fat_per_100g * grams / 100),
            fibre: (food.fibre_per_100g * grams / 100)
        };

        this.todayEntries.push(entry);
        this.renderTodayEntries();

        // Show confirmation
        console.log(`Added ${grams}g of ${food.name} to ${meal}: ${Math.round(calories)} kcal`);
    },

    deleteEntry(entryId) {
        this.todayEntries = this.todayEntries.filter(e => e.id !== entryId);
        this.renderTodayEntries();
    },

    loadSettings() {
        if (!this.user) return;
        
        document.getElementById('setting-name').value = this.user.name || '';
        document.getElementById('setting-calorie-goal').value = this.user.daily_calorie_goal;
        document.getElementById('setting-water-goal').value = this.user.daily_water_goal_ml;
        document.getElementById('setting-weight-unit').value = this.user.weight_unit;
    },

    async saveSettings() {
        const data = {
            name: document.getElementById('setting-name').value,
            daily_calorie_goal: parseInt(document.getElementById('setting-calorie-goal').value),
            daily_water_goal_ml: parseInt(document.getElementById('setting-water-goal').value),
            weight_unit: document.getElementById('setting-weight-unit').value
        };

        try {
            this.user = await API.updateCurrentUser(data);
            this.updateUserDisplay();
            this.loadTodayView();
            alert('Settings saved!');
        } catch (err) {
            alert('Failed to save settings: ' + err.message);
        }
    }
};

// Start app when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
