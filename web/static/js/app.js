// Main application

const App = {
    user: null,
    currentView: 'today',

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
        
        // TODO: Load diary entries, calculate consumed calories, etc.
        // This will be implemented in Phase 3
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
