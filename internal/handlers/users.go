package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"cals/internal/auth"
	"cals/internal/database"
	"cals/internal/models"
)

// GetOrCreateUser ensures user exists and returns their record
func GetOrCreateUser(email string) (*models.User, error) {
	var user models.User
	var bankStartDate sql.NullString

	err := database.DB.QueryRow(`
		SELECT id, email, name, daily_calorie_goal, daily_water_goal_ml, weight_unit, bank_start_date, created_at, updated_at
		FROM users WHERE email = ?
	`, email).Scan(
		&user.ID, &user.Email, &user.Name, &user.DailyCalorieGoal,
		&user.DailyWaterGoalML, &user.WeightUnit, &bankStartDate, &user.CreatedAt, &user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		// Create new user with today as default bank start date
		today := time.Now().Format("2006-01-02")
		result, err := database.DB.Exec(`
			INSERT INTO users (email, name, daily_calorie_goal, daily_water_goal_ml, weight_unit, bank_start_date)
			VALUES (?, '', 2000, 2000, 'stones', ?)
		`, email, today)
		if err != nil {
			return nil, err
		}

		user.ID, _ = result.LastInsertId()
		user.Email = email
		user.Name = ""
		user.DailyCalorieGoal = 2000
		user.DailyWaterGoalML = 2000
		user.WeightUnit = "stones"
		user.BankStartDate = today
		user.CreatedAt = time.Now()
		user.UpdatedAt = time.Now()

		return &user, nil
	}

	if err != nil {
		return nil, err
	}

	if bankStartDate.Valid {
		user.BankStartDate = bankStartDate.String
	}

	return &user, nil
}

// HandleGetCurrentUser returns the current authenticated user
func HandleGetCurrentUser(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := GetOrCreateUser(email)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// HandleUpdateCurrentUser updates the current user's profile
func HandleUpdateCurrentUser(w http.ResponseWriter, r *http.Request) {
	email := auth.GetUserEmail(r.Context())
	if email == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := GetOrCreateUser(email)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var updates struct {
		Name             *string `json:"name"`
		DailyCalorieGoal *int    `json:"daily_calorie_goal"`
		DailyWaterGoalML *int    `json:"daily_water_goal_ml"`
		WeightUnit       *string `json:"weight_unit"`
		BankStartDate    *string `json:"bank_start_date"`
	}

	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if updates.Name != nil {
		user.Name = *updates.Name
	}
	if updates.DailyCalorieGoal != nil {
		user.DailyCalorieGoal = *updates.DailyCalorieGoal
	}
	if updates.DailyWaterGoalML != nil {
		user.DailyWaterGoalML = *updates.DailyWaterGoalML
	}
	if updates.WeightUnit != nil {
		if *updates.WeightUnit == "stones" || *updates.WeightUnit == "kg" {
			user.WeightUnit = *updates.WeightUnit
		}
	}
	if updates.BankStartDate != nil {
		user.BankStartDate = *updates.BankStartDate
	}

	_, err = database.DB.Exec(`
		UPDATE users SET name = ?, daily_calorie_goal = ?, daily_water_goal_ml = ?, weight_unit = ?, bank_start_date = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, user.Name, user.DailyCalorieGoal, user.DailyWaterGoalML, user.WeightUnit, user.BankStartDate, user.ID)

	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// HandleListUsers returns all users (for viewing others' data)
func HandleListUsers(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(`
		SELECT id, email, name, daily_calorie_goal, daily_water_goal_ml, weight_unit, bank_start_date, created_at, updated_at
		FROM users ORDER BY name, email
	`)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var user models.User
		var bankStartDate sql.NullString
		err := rows.Scan(
			&user.ID, &user.Email, &user.Name, &user.DailyCalorieGoal,
			&user.DailyWaterGoalML, &user.WeightUnit, &bankStartDate, &user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if bankStartDate.Valid {
			user.BankStartDate = bankStartDate.String
		}
		users = append(users, user)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}
