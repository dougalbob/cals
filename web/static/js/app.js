const APP_VERSION = '1.6.3';

// Main application
const App = {
    user: null,
    currentView: 'today',
    currentDate: null,
    diaryData: null,
    bankData: null,

    async init() {
        console.log(`Cals v${APP_VERSION} initializing...`);
        
        document.getElementById('app-version').textContent = APP_VERSION;
        
        Modal.init();
        
        this.currentDate = Dates.today();
        
        this.checkForUpdates();
        setInterval(() => this.checkForUpdates(), 5 * 60 * 1000);
        
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

        // Add recipe buttons
        document.querySelectorAll('.add-recipe-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const meal = btn.dataset.meal;
                Recipes.showRecipePickerForMeal(meal);
            });
        });

        // Date navigation
        document.getElementById('prev-date')?.addEventListener('click', () => {
            this.changeDate(-1);
        });
        document.getElementById('next-date')?.addEventListener('click', () => {
            this.changeDate(1);
        });
        document.getElementById('current-date')?.addEventListener('click', () => {

        // Swipe gesture support for date navigation
        this.initSwipeGestures();
            this.goToToday();

        // Swipe gesture support for date navigation
        });

        // Swipe gesture support for date navigation

        // New recipe button
        document.getElementById('new-recipe-btn')?.addEventListener('click', () => {
            Recipes.showEditor();
        });

        // Settings form
        document.getElementById('save-settings').addEventListener('click', () => {
            this.saveSettings();
        });

        // Load initial data
        await this.loadTodayView();
    },

    async checkForUpdates() {
        try {
            const response = await fetch('/api/version');
            const data = await response.json();
            
            if (data.version !== APP_VERSION) {
                console.log(`Update available: ${APP_VERSION} -> ${data.version}`);
                this.showUpdateBanner(data.version);
            }
        } catch (err) {
            console.log('Version check failed:', err);
        }
    },

    showUpdateBanner(newVersion) {
        const existing = document.getElementById('update-banner');
        if (existing) existing.remove();

        const banner = document.createElement('div');
        banner.id = 'update-banner';
        banner.innerHTML = `
            <span>Update available: v${newVersion}</span>
            <button id="update-btn">Update Now</button>
        `;
        document.body.appendChild(banner);

        document.getElementById('update-btn').addEventListener('click', () => {
            this.applyUpdate();
        });
    },

    async applyUpdate() {
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
            }
        }

        if ('caches' in window) {
            const cacheNames = await caches.keys();
            for (const name of cacheNames) {
                await caches.delete(name);
            }
        }

        window.location.href = '/?update=' + Date.now();
    },

    switchView(viewName) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewName);
        });

        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === `view-${viewName}`);
        });

        this.currentView = viewName;

        switch (viewName) {
            case 'today':
                this.loadTodayView();
                break;
            case 'metrics':
                Metrics.init();
                break;
            case 'recipes':
                Recipes.loadList();
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

    initSwipeGestures() {
        const viewToday = document.getElementById("view-today");
        if (!viewToday) return;

        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;

        viewToday.addEventListener("touchstart", (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        viewToday.addEventListener("touchend", (e) => {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            this.handleSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
        }, { passive: true });
    },

    handleSwipe(startX, startY, endX, endY) {
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        const minSwipeDistance = 80;

        // Only trigger if horizontal swipe is dominant
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
            if (deltaX > 0) {
                // Swipe right - go to previous day
                this.changeDate(-1);
            } else {
                // Swipe left - go to next day
                this.changeDate(1);
            }
        }
    },


    changeDate(days) {
        const current = new Date(this.currentDate);
        current.setDate(current.getDate() + days);
        this.currentDate = Dates.format(current);
        this.loadTodayView();
    },

    goToToday() {
        this.currentDate = Dates.today();
        this.loadTodayView();
    },

    async loadTodayView() {
        const dateDisplay = document.getElementById('current-date');
        if (dateDisplay) {
            const isToday = this.currentDate === Dates.today();
            dateDisplay.textContent = isToday ? 'Today' : Dates.formatDisplay(this.currentDate);
        }

        const nextBtn = document.getElementById('next-date');
        if (nextBtn) {
            nextBtn.style.visibility = this.currentDate >= Dates.today() ? 'hidden' : 'visible';
        }
        
        try {
            this.diaryData = await API.getDiary(this.currentDate);
            this.bankData = await API.getBank(this.currentDate);
            this.renderDiary();
            this.renderBank();
        } catch (err) {
            console.error('Failed to load diary:', err);
        }
    },

    renderDiary() {
        const meals = ['breakfast', 'lunch', 'dinner', 'snacks'];

        meals.forEach(meal => {
            const entries = this.diaryData?.entries?.filter(e => e.meal === meal) || [];
            const container = document.getElementById(`${meal}-entries`);
            const totalEl = document.getElementById(`${meal}-total`);
            
            let mealCalories = 0;

            if (entries.length === 0) {
                container.innerHTML = '';
            } else {
                container.innerHTML = entries.map(entry => {
                    mealCalories += entry.calories;
                    const name = entry.food_name || entry.recipe_name || 'Unknown';
                    return `
                        <div class="meal-entry" data-entry-id="${entry.id}">
                            <div class="meal-entry-info">
                                <div class="meal-entry-name">${name}</div>
                                <div class="meal-entry-qty">${Math.round(entry.quantity_grams)}g</div>
                            </div>
                            <div class="meal-entry-cals">${Math.round(entry.calories)}</div>
                            <div class="meal-entry-actions">
                                <button class="meal-entry-edit" data-entry-id="${entry.id}"title="Edit">✏️</button>
                                <button class="meal-entry-delete" data-entry-id="${entry.id}"title="Delete">🗑️</button>
                            </div>
                        </div>
                    `;
                }).join('');

                container.querySelectorAll('.meal-entry-edit').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const entryId = parseInt(btn.dataset.entryId);
                        const entry = entries.find(en => en.id === entryId);
                        if (entry) this.showEditEntryModal(entry);
                    });
                });

                container.querySelectorAll('.meal-entry-delete').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await this.deleteEntry(parseInt(btn.dataset.entryId));
                    });
                });
            }

            totalEl.textContent = mealCalories > 0 ? `${Math.round(mealCalories)} kcal` : '';
        });

        const totalCalories = this.diaryData?.totals?.calories || 0;
        this.updateCalorieRing(totalCalories);
    },

    renderBank() {
        const bankEl = document.getElementById('bank-balance');
        const goalEl = document.getElementById('today-goal');
        const waterGoalEl = document.getElementById('water-goal');
        
        waterGoalEl.textContent = this.user?.daily_water_goal_ml || 2000;
        
        if (!this.bankData || !this.bankData.start_date) {
            goalEl.textContent = this.bankData?.daily_goal || this.user?.daily_calorie_goal || 2000;
            bankEl.textContent = 'Set start date';
            bankEl.classList.remove('positive', 'negative');
            return;
        }
        
        const todayAvailable = this.bankData.today_available;
        const bankBalance = this.bankData.bank_balance;
        
        goalEl.textContent = todayAvailable;
        
        if (bankBalance > 0) {
            bankEl.textContent = `+${bankBalance} banked`;
            bankEl.classList.remove('negative');
            bankEl.classList.add('positive');
        } else if (bankBalance < 0) {
            bankEl.textContent = `${bankBalance} deficit`;
            bankEl.classList.remove('positive');
            bankEl.classList.add('negative');
        } else {
            bankEl.textContent = '0 banked';
            bankEl.classList.remove('positive', 'negative');
        }
    },

    updateCalorieRing(consumed) {
        const available = this.bankData?.today_available || this.user?.daily_calorie_goal || 2000;
        const progress = Math.min(consumed / available, 1.5);
        const circumference = 2 * Math.PI * 45;
        const offset = circumference * (1 - Math.min(progress, 1));

        const ring = document.getElementById('calorie-progress');
        ring.style.strokeDashoffset = offset;
        ring.classList.toggle('over', consumed > available);

        document.getElementById('today-consumed').textContent = Math.round(consumed);
    },

    async addFoodEntry(food, grams, meal) {
        const entry = {
            date: this.currentDate,
            meal: meal,
            food_id: food.id,
            quantity_grams: grams,
            calories: (food.calories_per_100g * grams / 100),
            protein: (food.protein_per_100g * grams / 100),
            carbs: (food.carbs_per_100g * grams / 100),
            fat: (food.fat_per_100g * grams / 100),
            fibre: (food.fibre_per_100g * grams / 100)
        };

        try {
            await API.createDiaryEntry(entry);
            await this.loadTodayView();
            console.log(`Added ${grams}g of ${food.name} to ${meal}`);
        } catch (err) {
            alert('Failed to save entry: ' + err.message);
        }
    },

    showEditEntryModal(entry) {
        const isRecipe = !!entry.recipe_id;
        const name = entry.food_name || entry.recipe_name || "Unknown";
        const currentGrams = entry.quantity_grams;
        const caloriesPer100g = entry.calories / (currentGrams / 100);
        
        const content = document.createElement("div");
        content.className = "quantity-form";
        content.innerHTML = `
            <div class="quantity-food-name">${name}</div>
            <div class="quantity-per100">${Math.round(caloriesPer100g)} kcal per 100g</div>
            
            <div class="quantity-section">
                <div class="quantity-label">Adjust weight:</div>
                <div class="quantity-input-row">
                    <input type="number" id="edit-grams" value="${Math.round(currentGrams)}" min="1" step="1">
                    <span>g</span>
                </div>
            </div>
            
            <div class="quantity-calc">
                <span id="edit-calc-grams">${Math.round(currentGrams)}</span>g = <span id="edit-calc-calories">${Math.round(entry.calories)}</span> kcal
            </div>
            
            <button class="btn-primary" id="confirm-edit-entry">Update</button>
        `;
        
        Modal.open("Edit Entry", content);
        
        const gramsInput = document.getElementById("edit-grams");
        const calcGrams = document.getElementById("edit-calc-grams");
        const calcCalories = document.getElementById("edit-calc-calories");
        const confirmBtn = document.getElementById("confirm-edit-entry");
        
        gramsInput.addEventListener("input", () => {
            const grams = parseFloat(gramsInput.value) || 0;
            const calories = caloriesPer100g * grams / 100;
            calcGrams.textContent = Math.round(grams);
            calcCalories.textContent = Math.round(calories);
        });
        
        confirmBtn.addEventListener("click", async () => {
            const newGrams = parseFloat(gramsInput.value) || 0;
            if (newGrams <= 0) {
                alert("Enter a valid weight");
                return;
            }
            
            const ratio = newGrams / currentGrams;
            const updatedEntry = {
                quantity_grams: newGrams,
                calories: entry.calories * ratio,
                protein: (entry.protein || 0) * ratio,
                carbs: (entry.carbs || 0) * ratio,
                fat: (entry.fat || 0) * ratio,
                fibre: (entry.fibre || 0) * ratio
            };
            
            try {
                await API.updateDiaryEntry(entry.id, updatedEntry);
                Modal.close();
                await this.loadTodayView();
            } catch (err) {
                alert("Failed to update: " + err.message);
            }
        });
    },


    async deleteEntry(entryId) {
        if (!confirm('Delete this entry?')) return;
        
        try {
            await API.deleteDiaryEntry(entryId);
            await this.loadTodayView();
        } catch (err) {
            alert('Failed to delete: ' + err.message);
        }
    },

    loadSettings() {
        if (!this.user) return;
        
        document.getElementById('setting-name').value = this.user.name || '';
        document.getElementById('setting-calorie-goal').value = this.user.daily_calorie_goal;
        document.getElementById('setting-water-goal').value = this.user.daily_water_goal_ml;
        document.getElementById('setting-weight-unit').value = this.user.weight_unit;
        const bankDate = this.user.bank_start_date ? this.user.bank_start_date.split('T')[0] : '';
        document.getElementById('setting-bank-start').value = bankDate;
    },

    async saveSettings() {
        const data = {
            name: document.getElementById('setting-name').value,
            daily_calorie_goal: parseInt(document.getElementById('setting-calorie-goal').value),
            daily_water_goal_ml: parseInt(document.getElementById('setting-water-goal').value),
            weight_unit: document.getElementById('setting-weight-unit').value,
            bank_start_date: document.getElementById('setting-bank-start').value
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

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Theme management
const Theme = {
    current: 'default',
    
    init() {
        // Load saved theme
        const saved = localStorage.getItem('cals-theme');
        if (saved) {
            this.set(saved);
        }
        
        // Setup theme selector
        document.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', () => {
                this.set(option.dataset.theme);
            });
        });
        
        this.updateSelector();
    },
    
    set(theme) {
        this.current = theme;
        
        if (theme === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
        
        localStorage.setItem('cals-theme', theme);
        this.updateSelector();
        
        // Update theme-color meta tag for mobile browsers
        const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', primary);
    },
    
    updateSelector() {
        document.querySelectorAll('.theme-option').forEach(option => {
            option.classList.toggle('active', option.dataset.theme === this.current);
        });
    }
};

// Initialize theme on load
document.addEventListener('DOMContentLoaded', () => {
    Theme.init();
});
