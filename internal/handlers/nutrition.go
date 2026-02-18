package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"cals/internal/auth"
	"cals/internal/database"
)

// NutritionSettings represents user's nutrition goals
type NutritionSettings struct {
	ProteinGoalPerKg float64 `json:"protein_goal_per_kg"`
	FibreGoal        float64 `json:"fibre_goal"`
	FatMaxPercent    float64 `json:"fat_max_percent"`
	CarbMinPercent   float64 `json:"carb_min_percent"`
	CarbMaxPercent   float64 `json:"carb_max_percent"`
}

// DailyNutrition represents a single day's nutritional data
type DailyNutrition struct {
	Date           string  `json:"date"`
	Calories       float64 `json:"calories"`
	Protein        float64 `json:"protein"`
	Carbs          float64 `json:"carbs"`
	Fat            float64 `json:"fat"`
	Fibre          float64 `json:"fibre"`
	ProteinPercent float64 `json:"protein_percent"`
	CarbsPercent   float64 `json:"carbs_percent"`
	FatPercent     float64 `json:"fat_percent"`
	ProteinPerKg   float64 `json:"protein_per_kg"`
}

// WeeklyAnalysis represents the 7-day rolling analysis
type WeeklyAnalysis struct {
	StartDate        string           `json:"start_date"`
	EndDate          string           `json:"end_date"`
	DailyData        []DailyNutrition `json:"daily_data"`
	Averages         MacroAverages    `json:"averages"`
	Status           MacroStatus      `json:"status"`
	CurrentWeightKg  float64          `json:"current_weight_kg"`
	Settings         NutritionSettings `json:"settings"`
	DaysWithData     int              `json:"days_with_data"`
}

// MacroAverages holds the 7-day averages
type MacroAverages struct {
	Calories       float64 `json:"calories"`
	Protein        float64 `json:"protein"`
	Carbs          float64 `json:"carbs"`
	Fat            float64 `json:"fat"`
	Fibre          float64 `json:"fibre"`
	ProteinPercent float64 `json:"protein_percent"`
	CarbsPercent   float64 `json:"carbs_percent"`
	FatPercent     float64 `json:"fat_percent"`
	ProteinPerKg   float64 `json:"protein_per_kg"`
}

// MacroStatus holds traffic light status for each macro
type MacroStatus struct {
	Protein string `json:"protein"` // "green", "amber", "red"
	Carbs   string `json:"carbs"`
	Fat     string `json:"fat"`
	Fibre   string `json:"fibre"`
}

// HandleGetNutritionSettings returns user's nutrition goals
func HandleGetNutritionSettings(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	settings := NutritionSettings{
		ProteinGoalPerKg: 0.8,
		FibreGoal:        30,
		FatMaxPercent:    35,
		CarbMinPercent:   45,
		CarbMaxPercent:   65,
	}

	// Try to get user's custom settings
	database.DB.QueryRow(`
		SELECT protein_goal_per_kg, fibre_goal, fat_max_percent, carb_min_percent, carb_max_percent
		FROM nutrition_settings WHERE user_id = ?
	`, userID).Scan(&settings.ProteinGoalPerKg, &settings.FibreGoal, &settings.FatMaxPercent,
		&settings.CarbMinPercent, &settings.CarbMaxPercent)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

// HandleUpdateNutritionSettings updates user's nutrition goals
func HandleUpdateNutritionSettings(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	var settings NutritionSettings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate ranges
	if settings.ProteinGoalPerKg < 0.5 || settings.ProteinGoalPerKg > 3.0 {
		http.Error(w, "Protein goal must be between 0.5 and 3.0 g/kg", http.StatusBadRequest)
		return
	}
	if settings.FibreGoal < 10 || settings.FibreGoal > 60 {
		http.Error(w, "Fibre goal must be between 10 and 60g", http.StatusBadRequest)
		return
	}
	if settings.FatMaxPercent < 15 || settings.FatMaxPercent > 50 {
		http.Error(w, "Fat max must be between 15% and 50%", http.StatusBadRequest)
		return
	}

	_, err = database.DB.Exec(`
		INSERT INTO nutrition_settings (user_id, protein_goal_per_kg, fibre_goal, fat_max_percent, carb_min_percent, carb_max_percent, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(user_id) DO UPDATE SET
			protein_goal_per_kg = excluded.protein_goal_per_kg,
			fibre_goal = excluded.fibre_goal,
			fat_max_percent = excluded.fat_max_percent,
			carb_min_percent = excluded.carb_min_percent,
			carb_max_percent = excluded.carb_max_percent,
			updated_at = CURRENT_TIMESTAMP
	`, userID, settings.ProteinGoalPerKg, settings.FibreGoal, settings.FatMaxPercent,
		settings.CarbMinPercent, settings.CarbMaxPercent)

	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

// HandleGetDailyNutrition returns nutrition data for a single day
func HandleGetDailyNutrition(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	date := r.URL.Query().Get("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}

	// Get current weight
	weightKg := getCurrentWeightKg(userID)

	// Get daily totals
	var calories, protein, carbs, fat, fibre float64
	err = database.DB.QueryRow(`
		SELECT 
			COALESCE(SUM(calories), 0),
			COALESCE(SUM(protein), 0),
			COALESCE(SUM(carbs), 0),
			COALESCE(SUM(fat), 0),
			COALESCE(SUM(fibre), 0)
		FROM diary_entries
		WHERE user_id = ? AND date = ?
	`, userID, date).Scan(&calories, &protein, &carbs, &fat, &fibre)

	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}

	daily := DailyNutrition{
		Date:     date,
		Calories: calories,
		Protein:  protein,
		Carbs:    carbs,
		Fat:      fat,
		Fibre:    fibre,
	}

	// Calculate percentages
	calculateMacroPercents(&daily)

	// Calculate protein per kg if we have weight
	if weightKg > 0 {
		daily.ProteinPerKg = protein / weightKg
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(daily)
}

// HandleGetWeeklyAnalysis returns 7-day rolling nutritional analysis
func HandleGetWeeklyAnalysis(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var userID int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE email = ?`, email).Scan(&userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// Get user's settings
	settings := NutritionSettings{
		ProteinGoalPerKg: 0.8,
		FibreGoal:        30,
		FatMaxPercent:    35,
		CarbMinPercent:   45,
		CarbMaxPercent:   65,
	}
	database.DB.QueryRow(`
		SELECT protein_goal_per_kg, fibre_goal, fat_max_percent, carb_min_percent, carb_max_percent
		FROM nutrition_settings WHERE user_id = ?
	`, userID).Scan(&settings.ProteinGoalPerKg, &settings.FibreGoal, &settings.FatMaxPercent,
		&settings.CarbMinPercent, &settings.CarbMaxPercent)

	// Get current weight
	weightKg := getCurrentWeightKg(userID)

	// Get last 7 days of data
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -6)

	rows, err := database.DB.Query(`
		WITH RECURSIVE dates(date) AS (
			SELECT date(?)
			UNION ALL
			SELECT date(date, '+1 day')
			FROM dates
			WHERE date < date(?)
		)
		SELECT 
			d.date,
			COALESCE(SUM(e.calories), 0) as calories,
			COALESCE(SUM(e.protein), 0) as protein,
			COALESCE(SUM(e.carbs), 0) as carbs,
			COALESCE(SUM(e.fat), 0) as fat,
			COALESCE(SUM(e.fibre), 0) as fibre
		FROM dates d
		LEFT JOIN diary_entries e ON e.date = d.date AND e.user_id = ?
		GROUP BY d.date
		ORDER BY d.date ASC
	`, startDate.Format("2006-01-02"), endDate.Format("2006-01-02"), userID)

	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var dailyData []DailyNutrition
	var totals struct {
		calories, protein, carbs, fat, fibre float64
	}
	daysWithData := 0

	for rows.Next() {
		var d DailyNutrition
		if err := rows.Scan(&d.Date, &d.Calories, &d.Protein, &d.Carbs, &d.Fat, &d.Fibre); err != nil {
			continue
		}

		calculateMacroPercents(&d)

		if weightKg > 0 {
			d.ProteinPerKg = d.Protein / weightKg
		}

		if d.Calories > 0 {
			daysWithData++
			totals.calories += d.Calories
			totals.protein += d.Protein
			totals.carbs += d.Carbs
			totals.fat += d.Fat
			totals.fibre += d.Fibre
		}

		dailyData = append(dailyData, d)
	}

	// Calculate averages (only from days with data)
	averages := MacroAverages{}
	if daysWithData > 0 {
		averages.Calories = totals.calories / float64(daysWithData)
		averages.Protein = totals.protein / float64(daysWithData)
		averages.Carbs = totals.carbs / float64(daysWithData)
		averages.Fat = totals.fat / float64(daysWithData)
		averages.Fibre = totals.fibre / float64(daysWithData)

		// Calculate average macro percentages
		avgCalFromMacros := (averages.Protein * 4) + (averages.Carbs * 4) + (averages.Fat * 9)
		if avgCalFromMacros > 0 {
			averages.ProteinPercent = (averages.Protein * 4 / avgCalFromMacros) * 100
			averages.CarbsPercent = (averages.Carbs * 4 / avgCalFromMacros) * 100
			averages.FatPercent = (averages.Fat * 9 / avgCalFromMacros) * 100
		}

		if weightKg > 0 {
			averages.ProteinPerKg = averages.Protein / weightKg
		}
	}

	// Calculate status
	status := calculateStatus(averages, settings)

	analysis := WeeklyAnalysis{
		StartDate:       startDate.Format("2006-01-02"),
		EndDate:         endDate.Format("2006-01-02"),
		DailyData:       dailyData,
		Averages:        averages,
		Status:          status,
		CurrentWeightKg: weightKg,
		Settings:        settings,
		DaysWithData:    daysWithData,
	}

	if analysis.DailyData == nil {
		analysis.DailyData = []DailyNutrition{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(analysis)
}

// Helper functions

func getCurrentWeightKg(userID int64) float64 {
	var weightKg float64

	// Weight is already stored in kg in the database
	err := database.DB.QueryRow(`
		SELECT weight_kg FROM weight_entries 
		WHERE user_id = ? 
		ORDER BY date DESC LIMIT 1
	`, userID).Scan(&weightKg)

	if err != nil {
		return 0
	}

	return weightKg
}

func calculateMacroPercents(d *DailyNutrition) {
	// Calculate calories from macros
	// Protein: 4 cal/g, Carbs: 4 cal/g, Fat: 9 cal/g
	calFromMacros := (d.Protein * 4) + (d.Carbs * 4) + (d.Fat * 9)

	if calFromMacros > 0 {
		d.ProteinPercent = (d.Protein * 4 / calFromMacros) * 100
		d.CarbsPercent = (d.Carbs * 4 / calFromMacros) * 100
		d.FatPercent = (d.Fat * 9 / calFromMacros) * 100
	}
}

func calculateStatus(avg MacroAverages, settings NutritionSettings) MacroStatus {
	status := MacroStatus{
		Protein: "green",
		Carbs:   "green",
		Fat:     "green",
		Fibre:   "green",
	}

	// Protein status (based on g/kg)
	if avg.ProteinPerKg > 0 {
		if avg.ProteinPerKg < settings.ProteinGoalPerKg*0.7 {
			status.Protein = "red"
		} else if avg.ProteinPerKg < settings.ProteinGoalPerKg {
			status.Protein = "amber"
		}
	}

	// Carbs status (45-65% recommended)
	if avg.CarbsPercent > 0 {
		if avg.CarbsPercent < settings.CarbMinPercent-10 || avg.CarbsPercent > settings.CarbMaxPercent+10 {
			status.Carbs = "red"
		} else if avg.CarbsPercent < settings.CarbMinPercent || avg.CarbsPercent > settings.CarbMaxPercent {
			status.Carbs = "amber"
		}
	}

	// Fat status
	if avg.FatPercent > 0 {
		if avg.FatPercent > settings.FatMaxPercent+10 {
			status.Fat = "red"
		} else if avg.FatPercent > settings.FatMaxPercent {
			status.Fat = "amber"
		}
	}

	// Fibre status
	if avg.Fibre < settings.FibreGoal*0.5 {
		status.Fibre = "red"
	} else if avg.Fibre < settings.FibreGoal {
		status.Fibre = "amber"
	}

	return status
}
