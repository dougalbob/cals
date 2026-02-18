const Nutrition = {
    macroDonutChart: null,
    proteinTrendChart: null,
    fibreTrendChart: null,
    weeklyData: null,
    settings: null,

    async init() {
        await this.loadSettings();
        await this.loadWeeklyAnalysis();
        this.setupListeners();
    },

    async loadSettings() {
        try {
            this.settings = await API.getNutritionSettings();
        } catch (err) {
            console.error('Failed to load nutrition settings:', err);
            this.settings = {
                protein_goal_per_kg: 0.8,
                fibre_goal: 30,
                fat_max_percent: 35,
                carb_min_percent: 45,
                carb_max_percent: 65
            };
        }
    },

    async loadWeeklyAnalysis() {
        try {
            this.weeklyData = await API.getWeeklyAnalysis();
            this.render();
        } catch (err) {
            console.error('Failed to load weekly analysis:', err);
        }
    },

    render() {
        if (!this.weeklyData) return;

        this.renderStatusCards();
        this.renderMacroDonut();
        this.renderProteinSection();
        this.renderFibreSection();
        this.renderDailyTable();
    },

    renderStatusCards() {
        const { status, averages } = this.weeklyData;

        // Protein
        const proteinCard = document.querySelector('[data-macro="protein"]');
        if (proteinCard) {
            proteinCard.className = `status-card status-${status.protein}`;
            document.getElementById('status-protein').textContent = 
                averages.protein_per_kg > 0 ? `${averages.protein_per_kg.toFixed(1)}g/kg` : '--';
        }

        // Carbs
        const carbsCard = document.querySelector('[data-macro="carbs"]');
        if (carbsCard) {
            carbsCard.className = `status-card status-${status.carbs}`;
            document.getElementById('status-carbs').textContent = 
                averages.carbs_percent > 0 ? `${averages.carbs_percent.toFixed(0)}%` : '--';
        }

        // Fat
        const fatCard = document.querySelector('[data-macro="fat"]');
        if (fatCard) {
            fatCard.className = `status-card status-${status.fat}`;
            document.getElementById('status-fat').textContent = 
                averages.fat_percent > 0 ? `${averages.fat_percent.toFixed(0)}%` : '--';
        }

        // Fibre
        const fibreCard = document.querySelector('[data-macro="fibre"]');
        if (fibreCard) {
            fibreCard.className = `status-card status-${status.fibre}`;
            document.getElementById('status-fibre').textContent = 
                averages.fibre > 0 ? `${averages.fibre.toFixed(0)}g` : '--';
        }
    },

    renderMacroDonut() {
        const ctx = document.getElementById('macro-donut-chart');
        if (!ctx) return;

        const { averages } = this.weeklyData;

        if (this.macroDonutChart) {
            this.macroDonutChart.destroy();
        }

        const hasData = averages.protein_percent > 0 || averages.carbs_percent > 0 || averages.fat_percent > 0;

        this.macroDonutChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Protein', 'Carbs', 'Fat'],
                datasets: [{
                    data: hasData 
                        ? [averages.protein_percent, averages.carbs_percent, averages.fat_percent]
                        : [33, 33, 34],
                    backgroundColor: [
                        'rgba(76, 175, 80, 0.8)',   // Green for protein
                        'rgba(33, 150, 243, 0.8)',  // Blue for carbs
                        'rgba(255, 152, 0, 0.8)'    // Orange for fat
                    ],
                    borderColor: [
                        'rgba(76, 175, 80, 1)',
                        'rgba(33, 150, 243, 1)',
                        'rgba(255, 152, 0, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '60%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.label}: ${context.parsed.toFixed(1)}%`;
                            }
                        }
                    }
                }
            }
        });

        // Update legend
        const legend = document.getElementById('macro-legend');
        if (legend) {
            legend.innerHTML = `
                <div class="legend-item">
                    <span class="legend-color" style="background: rgba(76, 175, 80, 0.8)"></span>
                    <span>Protein: ${averages.protein_percent.toFixed(1)}%</span>
                    <span class="legend-target">(10-35%)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: rgba(33, 150, 243, 0.8)"></span>
                    <span>Carbs: ${averages.carbs_percent.toFixed(1)}%</span>
                    <span class="legend-target">(${this.settings.carb_min_percent}-${this.settings.carb_max_percent}%)</span>
                </div>
                <div class="legend-item">
                    <span class="legend-color" style="background: rgba(255, 152, 0, 0.8)"></span>
                    <span>Fat: ${averages.fat_percent.toFixed(1)}%</span>
                    <span class="legend-target">(<${this.settings.fat_max_percent}%)</span>
                </div>
            `;
        }
    },

    renderProteinSection() {
        const { averages, settings, current_weight_kg } = this.weeklyData;

        // Update protein per kg display
        const proteinPerKg = document.getElementById('protein-per-kg');
        if (proteinPerKg) {
            proteinPerKg.textContent = averages.protein_per_kg > 0 
                ? averages.protein_per_kg.toFixed(2) 
                : '--';
        }

        // Update goal display
        const goalDisplay = document.getElementById('protein-goal-display');
        if (goalDisplay) {
            goalDisplay.textContent = settings.protein_goal_per_kg;
        }

        // Render trend chart
        this.renderProteinTrendChart();
    },

    renderProteinTrendChart() {
        const ctx = document.getElementById('protein-trend-chart');
        if (!ctx) return;

        const { daily_data, settings } = this.weeklyData;

        if (this.proteinTrendChart) {
            this.proteinTrendChart.destroy();
        }

        const labels = daily_data.map(d => {
            const date = new Date(d.date);
            return `${date.getDate()}/${date.getMonth() + 1}`;
        });
        const data = daily_data.map(d => d.protein_per_kg || 0);

        this.proteinTrendChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Protein (g/kg)',
                    data,
                    backgroundColor: data.map(v => 
                        v >= settings.protein_goal_per_kg ? 'rgba(76, 175, 80, 0.6)' :
                        v >= settings.protein_goal_per_kg * 0.7 ? 'rgba(255, 193, 7, 0.6)' :
                        'rgba(244, 67, 54, 0.6)'
                    ),
                    borderColor: data.map(v => 
                        v >= settings.protein_goal_per_kg ? 'rgba(76, 175, 80, 1)' :
                        v >= settings.protein_goal_per_kg * 0.7 ? 'rgba(255, 193, 7, 1)' :
                        'rgba(244, 67, 54, 1)'
                    ),
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    annotation: {
                        annotations: {
                            goalLine: {
                                type: 'line',
                                yMin: settings.protein_goal_per_kg,
                                yMax: settings.protein_goal_per_kg,
                                borderColor: 'rgba(76, 175, 80, 0.8)',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: {
                                    display: true,
                                    content: `Goal: ${settings.protein_goal_per_kg}g/kg`,
                                    position: 'end'
                                }
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: Math.max(settings.protein_goal_per_kg * 1.5, ...data) + 0.2
                    }
                }
            }
        });
    },

    renderFibreSection() {
        const { averages, settings } = this.weeklyData;

        // Update fibre average display
        const fibreAvg = document.getElementById('fibre-avg');
        if (fibreAvg) {
            fibreAvg.textContent = averages.fibre > 0 
                ? averages.fibre.toFixed(1) 
                : '--';
        }

        // Update goal display
        const goalDisplay = document.getElementById('fibre-goal-display');
        if (goalDisplay) {
            goalDisplay.textContent = settings.fibre_goal;
        }

        // Render trend chart
        this.renderFibreTrendChart();
    },

    renderFibreTrendChart() {
        const ctx = document.getElementById('fibre-trend-chart');
        if (!ctx) return;

        const { daily_data, settings } = this.weeklyData;

        if (this.fibreTrendChart) {
            this.fibreTrendChart.destroy();
        }

        const labels = daily_data.map(d => {
            const date = new Date(d.date);
            return `${date.getDate()}/${date.getMonth() + 1}`;
        });
        const data = daily_data.map(d => d.fibre || 0);

        this.fibreTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Fibre (g)',
                    data,
                    borderColor: 'rgba(156, 39, 176, 1)',
                    backgroundColor: 'rgba(156, 39, 176, 0.1)',
                    tension: 0.3,
                    fill: true,
                    pointBackgroundColor: data.map(v => 
                        v >= settings.fibre_goal ? 'rgba(76, 175, 80, 1)' :
                        v >= settings.fibre_goal * 0.5 ? 'rgba(255, 193, 7, 1)' :
                        'rgba(244, 67, 54, 1)'
                    ),
                    pointRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    annotation: {
                        annotations: {
                            goalLine: {
                                type: 'line',
                                yMin: settings.fibre_goal,
                                yMax: settings.fibre_goal,
                                borderColor: 'rgba(76, 175, 80, 0.8)',
                                borderWidth: 2,
                                borderDash: [5, 5]
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: Math.max(settings.fibre_goal * 1.2, ...data) + 5
                    }
                }
            }
        });
    },

    renderDailyTable() {
        const tbody = document.getElementById('nutrition-table-body');
        if (!tbody) return;

        const { daily_data } = this.weeklyData;

        tbody.innerHTML = daily_data.map(d => {
            const date = new Date(d.date);
            const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
            
            return `
                <tr class="${d.calories === 0 ? 'no-data' : ''}">
                    <td>${dateStr}</td>
                    <td>${d.calories > 0 ? Math.round(d.calories) : '-'}</td>
                    <td>${d.protein > 0 ? d.protein.toFixed(0) + 'g' : '-'}</td>
                    <td>${d.carbs > 0 ? d.carbs.toFixed(0) + 'g' : '-'}</td>
                    <td>${d.fat > 0 ? d.fat.toFixed(0) + 'g' : '-'}</td>
                    <td>${d.fibre > 0 ? d.fibre.toFixed(0) + 'g' : '-'}</td>
                </tr>
            `;
        }).join('');
    },

    setupListeners() {
        document.getElementById('nutrition-settings-btn')?.addEventListener('click', () => {
            this.showSettingsModal();
        });
    },

    showSettingsModal() {
        const content = `
            <div class="nutrition-settings-form">
                <div class="form-group">
                    <label for="ns-protein">Protein Goal (g per kg body weight)</label>
                    <input type="number" id="ns-protein" step="0.1" min="0.5" max="3.0" 
                           value="${this.settings.protein_goal_per_kg}">
                    <small class="form-hint">Sedentary: 0.8 | Active: 1.2-2.0</small>
                </div>
                <div class="form-group">
                    <label for="ns-fibre">Daily Fibre Goal (g)</label>
                    <input type="number" id="ns-fibre" min="10" max="60" 
                           value="${this.settings.fibre_goal}">
                    <small class="form-hint">UK recommendation: 30g</small>
                </div>
                <div class="form-group">
                    <label for="ns-fat">Maximum Fat (% of calories)</label>
                    <input type="number" id="ns-fat" min="15" max="50" 
                           value="${this.settings.fat_max_percent}">
                    <small class="form-hint">Recommended: 20-35%</small>
                </div>
                <div class="form-group">
                    <label>Carbohydrate Range (% of calories)</label>
                    <div class="range-inputs">
                        <input type="number" id="ns-carb-min" min="20" max="60" 
                               value="${this.settings.carb_min_percent}" style="width: 80px">
                        <span>to</span>
                        <input type="number" id="ns-carb-max" min="30" max="80" 
                               value="${this.settings.carb_max_percent}" style="width: 80px">
                    </div>
                    <small class="form-hint">Recommended: 45-65%</small>
                </div>
                <button class="btn-primary" id="save-nutrition-settings">Save Goals</button>
            </div>
        `;

        Modal.open('Nutrition Goals', content);

        document.getElementById('save-nutrition-settings')?.addEventListener('click', async () => {
            const newSettings = {
                protein_goal_per_kg: parseFloat(document.getElementById('ns-protein').value),
                fibre_goal: parseFloat(document.getElementById('ns-fibre').value),
                fat_max_percent: parseFloat(document.getElementById('ns-fat').value),
                carb_min_percent: parseFloat(document.getElementById('ns-carb-min').value),
                carb_max_percent: parseFloat(document.getElementById('ns-carb-max').value)
            };

            try {
                await API.updateNutritionSettings(newSettings);
                this.settings = newSettings;
                Modal.close();
                await this.loadWeeklyAnalysis();
            } catch (err) {
                alert('Failed to save settings: ' + err.message);
            }
        });
    }
};
