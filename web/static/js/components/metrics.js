// Metrics component - weight, measurements, and calorie charts

const Metrics = {
    weightChart: null,
    caloriesChart: null,
    bankChart: null,
    currentPeriod: 14,
    user: null,

    async init() {
        this.user = await API.getCurrentUser();
        this.setupEventListeners();
        this.loadAll();
    },

    setupEventListeners() {
        // Weight save button
        document.getElementById('save-weight-btn')?.addEventListener('click', () => {
            this.saveWeight();
        });

        // Weight input enter key
        document.getElementById('weight-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveWeight();
        });

        // Period selector buttons
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentPeriod = parseInt(btn.dataset.days);
                this.loadWeightChart();
            });
        });

        // Measurements accordion
        document.getElementById('measurements-header')?.addEventListener('click', () => {
            const section = document.getElementById('measurements-header').closest('.metrics-section');
            const content = document.getElementById('measurements-content');
            section.classList.toggle('open');
            content.style.display = section.classList.contains('open') ? 'block' : 'none';
        });

        // Save measurements button
        document.getElementById('save-measurements-btn')?.addEventListener('click', () => {
            this.saveMeasurements();
        });
    },

    async loadAll() {
        this.updateWeightUnitLabel();
        this.loadTodayWeight();
        this.loadWeightChart();
        this.loadMeasurements();
        this.loadCaloriesChart();
        this.loadBankChart();
    },

    updateWeightUnitLabel() {
        const label = document.getElementById('weight-unit-label');
        if (label && this.user) {
            label.textContent = this.user.weight_unit === 'kg' ? 'kg' : 
                               this.user.weight_unit === 'lbs' ? 'lbs' : 'st/lb';
        }
    },

    async loadTodayWeight() {
        try {
            const entries = await API.getWeightEntries(7);
            const today = new Date().toISOString().split('T')[0];
            const todayEntry = entries.find(e => e.date === today);
            
            const stonesInput = document.getElementById('weight-stones');
            const lbsInput = document.getElementById('weight-lbs');
            
            if (todayEntry) {
                const { stones, lbs } = this.kgToStonesLbs(todayEntry.weight_kg);
                if (stonesInput) stonesInput.value = stones;
                if (lbsInput) lbsInput.value = lbs;
            } else if (entries.length > 0) {
                // Default stones to last known value
                const { stones } = this.kgToStonesLbs(entries[0].weight_kg);
                if (stonesInput) stonesInput.value = stones;
            }

            this.updateTargetInfo(entries);
        } catch (err) {
            console.error('Failed to load weight:', err);
        }
    },

    kgToStonesLbs(kg) {
        const totalLbs = kg * 2.20462;
        const stones = Math.floor(totalLbs / 14);
        const lbs = Math.round((totalLbs % 14) * 2) / 2; // Round to nearest 0.5
        return { stones, lbs };
    },

    stonesLbsToKg(stones, lbs) {
        const totalLbs = (stones * 14) + lbs;
        return totalLbs / 2.20462;
    },

    async saveWeight() {
        const stonesInput = document.getElementById('weight-stones');
        const lbsInput = document.getElementById('weight-lbs');
        
        const stones = parseFloat(stonesInput?.value) || 0;
        const lbs = parseFloat(lbsInput?.value) || 0;
        
        if (stones <= 0 && lbs <= 0) {
            alert('Please enter a valid weight');
            return;
        }

        const weightKg = this.stonesLbsToKg(stones, lbs);
        const today = new Date().toISOString().split('T')[0];

        try {
            await API.createWeightEntry({ date: today, weight_kg: weightKg });
            this.loadWeightChart();
            this.loadTodayWeight();
        } catch (err) {
            alert('Failed to save weight: ' + err.message);
        }
    },


    updateTargetInfo(entries) {
        const info = document.getElementById('weight-target-info');
        if (!info || !this.user) return;

        if (this.user.target_weight_kg && entries.length > 0) {
            const latestWeight = entries[0].weight_kg;
            const diff = latestWeight - this.user.target_weight_kg;
            const unit = this.user.weight_unit === 'kg' ? 'kg' : 
                        this.user.weight_unit === 'lbs' ? 'lbs' : 'st';
            
            if (diff > 0) {
                const { stones: toGoSt, lbs: toGoLbs } = this.kgToStonesLbs(diff);
                const { stones: targetSt, lbs: targetLbs } = this.kgToStonesLbs(this.user.target_weight_kg);
            info.innerHTML = `Target: ${targetSt}st ${targetLbs}lbs 
                    (<span class="to-go">${toGoSt}st ${toGoLbs}lbs to go</span>)`;
            } else {
                info.innerHTML = `🎉 Target reached!`;
            }
        } else {
            info.innerHTML = '';
        }
    },

    convertWeight(value, direction) {
        if (!this.user || this.user.weight_unit === 'kg') return value;
        
        if (this.user.weight_unit === 'lbs') {
            return direction === 'from_kg' ? value * 2.20462 : value / 2.20462;
        }
        
        // stones/lbs - just return kg for now, display logic handled separately
        return value;
    },

    async saveWeight() {
        const input = document.getElementById('weight-input');
        const value = parseFloat(input?.value);
        
        if (!value || value <= 0) {
            alert('Please enter a valid weight');
            return;
        }

        const weightKg = this.convertWeight(value, 'to_kg');
        const today = new Date().toISOString().split('T')[0];

        try {
            await API.createWeightEntry({ date: today, weight_kg: weightKg });
            this.loadWeightChart();
            this.loadTodayWeight();
        } catch (err) {
            alert('Failed to save weight: ' + err.message);
        }
    },

    async loadWeightChart() {
        try {
            const entries = await API.getWeightEntries(this.currentPeriod);
            this.renderWeightChart(entries);
        } catch (err) {
            console.error('Failed to load weight chart:', err);
        }
    },

    renderWeightChart(entries) {
        const ctx = document.getElementById('weight-chart');
        if (!ctx) return;

        // Sort by date ascending
        entries.sort((a, b) => a.date.localeCompare(b.date));

        // Fill missing days by carrying forward
        const filledData = this.fillMissingDays(entries, this.currentPeriod);

        const labels = filledData.map(e => this.formatDateShort(e.date));
        const weights = filledData.map(e => e.weight_kg * 2.20462); // Convert to lbs for charting

        // Calculate projection line (simple linear regression)
        const projection = this.calculateProjection(filledData);

        if (this.weightChart) {
            this.weightChart.destroy();
        }

        const datasets = [{
            label: 'Weight',
            data: weights,
            borderColor: '#4CAF50',
            backgroundColor: 'rgba(76, 175, 80, 0.1)',
            tension: 0.3,
            fill: true
        }];

        // Add target line if set
        if (this.user?.target_weight_kg) {
            const targetWeight = this.user.target_weight_kg * 2.20462; // Convert to lbs
            datasets.push({
                label: 'Target',
                data: Array(labels.length).fill(targetWeight),
                borderColor: '#FF9800',
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false
            });
        }

        // Add projection line
        if (projection.length > 0) {
            datasets.push({
                label: 'Projection',
                data: projection,
                borderColor: 'rgba(76, 175, 80, 0.5)',
                borderDash: [10, 5],
                pointRadius: 0,
                fill: false
            });
        }

        this.weightChart = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: { boxWidth: 12, padding: 8 }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        min: Math.min(...weights.filter(w => w !== null)) - 14,
                        max: Math.max(...weights.filter(w => w !== null)) + 14,
                        ticks: {
                            callback: function(value) {
                                const stones = Math.floor(value / 14);
                                const lbs = Math.round(value % 14);
                                return stones + 'st ' + lbs + 'lb';
                            }
                        }
                    }
                }
            }
        });
    },

    fillMissingDays(entries, days) {
        const result = [];
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days + 1);

        const entryMap = {};
        entries.forEach(e => entryMap[e.date] = e.weight_kg);

        let lastWeight = entries.length > 0 ? entries[0].weight_kg : null;

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            if (entryMap[dateStr]) {
                lastWeight = entryMap[dateStr];
            }
            if (lastWeight !== null) {
                result.push({ date: dateStr, weight_kg: lastWeight });
            }
        }

        return result;
    },

    calculateProjection(data) {
        if (data.length < 3) return [];

        // Simple linear regression on last N points
        const n = Math.min(data.length, 14);
        const recent = data.slice(-n);
        
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        recent.forEach((d, i) => {
            const y = d.weight_kg * 2.20462; // Convert to lbs
            sumX += i;
            sumY += y;
            sumXY += i * y;
            sumX2 += i * i;
        });

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        // Project forward same number of days
        const projection = [];
        for (let i = 0; i < data.length; i++) {
            if (i < data.length - n) {
                projection.push(null);
            } else {
                projection.push(intercept + slope * (i - (data.length - n)));
            }
        }

        return projection;
    },

    formatDateShort(dateStr) {
        const d = new Date(dateStr);
        return `${d.getDate()}/${d.getMonth() + 1}`;
    },

    async loadMeasurements() {
        try {
            const measurements = await API.getMeasurements();
            this.updateMeasurementStatus(measurements);
            this.renderMeasurementsHistory(measurements);
        } catch (err) {
            console.error('Failed to load measurements:', err);
        }
    },

    updateMeasurementStatus(measurements) {
        const status = document.getElementById('measurements-status');
        if (!status) return;

        if (measurements.length === 0) {
            status.textContent = 'No entries yet';
            status.className = 'measurement-status';
            return;
        }

        const lastDate = new Date(measurements[0].date);
        const daysSince = Math.floor((new Date() - lastDate) / (1000 * 60 * 60 * 24));

        if (daysSince > 13) {
            status.textContent = `Last: ${daysSince} days ago ⚠️`;
            status.className = 'measurement-status warning';
        } else {
            status.textContent = `Last: ${daysSince} days ago`;
            status.className = 'measurement-status';
        }
    },

    renderMeasurementsHistory(measurements) {
        const container = document.getElementById('measurements-history');
        if (!container) return;

        if (measurements.length === 0) {
            container.innerHTML = '<p>No measurements recorded yet.</p>';
            return;
        }

        container.innerHTML = '<h4>History</h4>' + measurements.slice(0, 5).map(m => {
            const values = [];
            if (m.bust_cm?.Valid) values.push(`Bust: ${m.bust_cm.Float64}`);
            if (m.chest_cm?.Valid) values.push(`Chest: ${m.chest_cm.Float64}`);
            if (m.waist_cm?.Valid) values.push(`Waist: ${m.waist_cm.Float64}`);
            if (m.hips_cm?.Valid) values.push(`Hips: ${m.hips_cm.Float64}`);
            if (m.upper_arm_cm?.Valid) values.push(`Arm: ${m.upper_arm_cm.Float64}`);
            if (m.thigh_cm?.Valid) values.push(`Thigh: ${m.thigh_cm.Float64}`);
            if (m.neck_cm?.Valid) values.push(`Neck: ${m.neck_cm.Float64}`);

            return `
                <div class="measurement-entry">
                    <div class="measurement-entry-date">${this.formatDateShort(m.date)}</div>
                    <div class="measurement-entry-values">
                        ${values.map(v => `<span>${v}cm</span>`).join('')}
                    </div>
                </div>
            `;
        }).join('');
    },

    async saveMeasurements() {
        const today = new Date().toISOString().split('T')[0];
        
        const getValue = (id) => {
            const el = document.getElementById(id);
            const val = parseFloat(el?.value);
            return val > 0 ? val : null;
        };

        const data = {
            date: today,
            bust_cm: getValue('meas-bust'),
            chest_cm: getValue('meas-chest'),
            waist_cm: getValue('meas-waist'),
            hips_cm: getValue('meas-hips'),
            upper_arm_cm: getValue('meas-upper-arm'),
            thigh_cm: getValue('meas-thigh'),
            neck_cm: getValue('meas-neck')
        };

        // Check at least one value
        if (!data.bust_cm && !data.chest_cm && !data.waist_cm && !data.hips_cm && 
            !data.upper_arm_cm && !data.thigh_cm && !data.neck_cm) {
            alert('Enter at least one measurement');
            return;
        }

        try {
            await API.createMeasurement(data);
            this.loadMeasurements();
            // Clear form
            ['meas-bust', 'meas-chest', 'meas-waist', 'meas-hips', 'meas-upper-arm', 'meas-thigh', 'meas-neck']
                .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        } catch (err) {
            alert('Failed to save measurements: ' + err.message);
        }
    },

    async loadCaloriesChart() {
        try {
            const stats = await API.getCalorieStats(14);
            this.renderCaloriesChart(stats);
        } catch (err) {
            console.error('Failed to load calorie stats:', err);
        }
    },

    renderCaloriesChart(stats) {
        const ctx = document.getElementById('calories-chart');
        if (!ctx) return;

        const labels = stats.map(s => this.formatDateShort(s.date));
        const calories = stats.map(s => s.calories);
        const goal = stats.length > 0 ? stats[0].goal : 2000;

        // Color bars based on goal
        const colors = stats.map(s => s.calories > s.goal ? '#e74c3c' : '#4CAF50');

        if (this.caloriesChart) {
            this.caloriesChart.destroy();
        }

        this.caloriesChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Calories',
                    data: calories,
                    backgroundColor: colors,
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
                                yMin: goal,
                                yMax: goal,
                                borderColor: '#FF9800',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: {
                                    display: true,
                                    content: `Goal: ${goal}`,
                                    position: 'end'
                                }
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    },

    async loadBankChart() {
        try {
            const stats = await API.getBankStats(14);
            this.renderBankChart(stats);
        } catch (err) {
            console.error('Failed to load bank stats:', err);
        }
    },

    renderBankChart(stats) {
        const ctx = document.getElementById('bank-chart');
        if (!ctx) return;

        const labels = stats.map(s => this.formatDateShort(s.date));
        const balances = stats.map(s => s.balance);

        if (this.bankChart) {
            this.bankChart.destroy();
        }

        this.bankChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Bank Balance',
                    data: balances,
                    borderColor: '#2196F3',
                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    annotation: {
                        annotations: {
                            zeroLine: {
                                type: 'line',
                                yMin: 0,
                                yMax: 0,
                                borderColor: '#666',
                                borderWidth: 1,
                                borderDash: [3, 3]
                            }
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: false
                    }
                }
            }
        });
    }
};
