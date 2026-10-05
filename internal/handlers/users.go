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

// defaultBankWindowDays is the rolling window every account starts with — the
// additive users.bank_window_days default (decision 93). 0 would mean "all
// time", which is an explicit preset rather than a default (decisions 66, 91).
const defaultBankWindowDays = 14

// defaultWeightTrendDays is the moving-average window every account starts
// with for the weigh-in trend (decision 95). 7 is the Phase 14 value; the
// owner expects 10 or 14 may prove better, which is why it is a column and not
// a constant in the chart.
const defaultWeightTrendDays = 7

// minWeightTrendDays is the smallest trend window the API accepts. The chart
// only draws a trend where at least three weigh-ins exist (decision 95), so a
// smaller window could never be drawn — an error is clearer than a value that
// silently does nothing.
const minWeightTrendDays = 3

// maxWeightTrendDays bounds the preference at the longest range the metrics
// endpoints will return in one request, mirroring maxSeriesSpan in stats.go.
const maxWeightTrendDays = 90

// GetOrCreateUser ensures user exists and returns their record
func GetOrCreateUser(email string) (*models.User, error) {
	var user models.User
	var bankStartDate sql.NullString
	var targetWeightKg sql.NullFloat64

	err := database.DB.QueryRow(`
		SELECT id, email, name, daily_calorie_goal, daily_water_goal_ml, weight_unit, bank_start_date, bank_window_days, weight_trend_days, body_outline, target_weight_kg, is_admin, created_at, updated_at
		FROM users WHERE email = ?
	`, email).Scan(
		&user.ID, &user.Email, &user.Name, &user.DailyCalorieGoal,
		&user.DailyWaterGoalML, &user.WeightUnit, &bankStartDate, &user.BankWindowDays, &user.WeightTrendDays, &user.BodyOutline, &targetWeightKg, &user.IsAdmin,
		&user.CreatedAt, &user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		// Create new user with today as default bank start date. A brand-new
		// account takes the role its address is declared to hold in
		// ADMIN_EMAILS, so the Admin's very first sign-in already has it
		// rather than waiting for the next restart.
		today := time.Now().Format("2006-01-02")
		isAdmin := IsConfiguredAdmin(email)
		result, err := database.DB.Exec(`
			INSERT INTO users (email, name, daily_calorie_goal, daily_water_goal_ml, weight_unit, bank_start_date, bank_window_days, is_admin)
			VALUES (?, '', 2000, 2000, 'stones', ?, ?, ?)
		`, email, today, defaultBankWindowDays, boolToInt(isAdmin))
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
		user.BankWindowDays = defaultBankWindowDays
		user.WeightTrendDays = defaultWeightTrendDays
		user.IsAdmin = isAdmin
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
	if targetWeightKg.Valid {
		v := targetWeightKg.Float64
		user.TargetWeightKG = &v
	}

	return &user, nil
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

// nullableFloat64 turns a *float64 into a value suitable for a nullable REAL
// column: nil becomes NULL (sql.NullFloat64{Valid:false}), non-nil is the value.
// database/sql's Exec accepts a sql.NullFloat64 directly.
func nullableFloat64(p *float64) sql.NullFloat64 {
	if p == nil {
		return sql.NullFloat64{}
	}
	return sql.NullFloat64{Float64: *p, Valid: true}
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
		Name             *string   `json:"name"`
		DailyCalorieGoal *int      `json:"daily_calorie_goal"`
		DailyWaterGoalML *int      `json:"daily_water_goal_ml"`
		WeightUnit       *string   `json:"weight_unit"`
		BankStartDate    *string   `json:"bank_start_date"`
		BankWindowDays   *int      `json:"bank_window_days"`
		WeightTrendDays  *int      `json:"weight_trend_days"`
		BodyOutline      *string   `json:"body_outline"`
		TargetWeightKG   **float64 `json:"target_weight_kg"`
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
	if updates.BankWindowDays != nil {
		// 0 is a real value — the "all time" preset (decisions 66, 91) — so the
		// guard is against negatives, and it is an error rather than a silent
		// no-op: a window that is quietly ignored is worse than a 400 for a
		// setting the owner will change by hand until Phase 15 draws the
		// control (decision 93).
		if *updates.BankWindowDays < 0 {
			http.Error(w, "bank_window_days must be 0 (all time) or a number of days", http.StatusBadRequest)
			return
		}
		user.BankWindowDays = *updates.BankWindowDays
	}
	if updates.WeightTrendDays != nil {
		// The chart draws a trend only where at least three weigh-ins exist
		// (decision 95), so a smaller window could never do anything; and the
		// metrics endpoints return at most 90 days in one request, so a larger
		// one would be clipped by the data before it was used. Both are errors
		// rather than silent no-ops, for the same reason as bank_window_days.
		if *updates.WeightTrendDays < minWeightTrendDays || *updates.WeightTrendDays > maxWeightTrendDays {
			http.Error(w, "weight_trend_days must be between 3 and 90 weigh-ins", http.StatusBadRequest)
			return
		}
		user.WeightTrendDays = *updates.WeightTrendDays
	}
	if updates.BodyOutline != nil {
		// The body map's silhouette (decision 97). Only the two known shapes
		// are accepted; an empty string or anything else is an error rather
		// than a silent no-op, matching the other settings on this endpoint.
		if *updates.BodyOutline != "female" && *updates.BodyOutline != "male" {
			http.Error(w, `body_outline must be "female" or "male"`, http.StatusBadRequest)
			return
		}
		user.BodyOutline = updates.BodyOutline
	}
	if updates.TargetWeightKG != nil {
		// Slice 14.5: target_weight_kg can be set or cleared (null = no target).
		// The field is an additive column that no query selected until now, so
		// Target on the Weight card was permanently "Not set"; wiring it
		// through PUT lets the user set it from the Metrics screen.
		user.TargetWeightKG = *updates.TargetWeightKG
	}

	_, err = database.DB.Exec(`
		UPDATE users SET name = ?, daily_calorie_goal = ?, daily_water_goal_ml = ?, weight_unit = ?, bank_start_date = ?, bank_window_days = ?, weight_trend_days = ?, body_outline = ?, target_weight_kg = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, user.Name, user.DailyCalorieGoal, user.DailyWaterGoalML, user.WeightUnit, user.BankStartDate, user.BankWindowDays, user.WeightTrendDays, user.BodyOutline, nullableFloat64(user.TargetWeightKG), user.ID)

	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// HandleListUsers returns all users, for an Admin choosing another account to
// act as. It is Admin-only (decisions 45 and 88): until this change it answered
// any authenticated request, which exposed the household's email addresses to
// either user for no product reason.
func HandleListUsers(w http.ResponseWriter, r *http.Request) {
	isAdmin, err := currentUserIsAdmin(r.Context())
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if !isAdmin {
		http.Error(w, "Forbidden: the Admin role is required to list accounts", http.StatusForbidden)
		return
	}

	rows, err := database.DB.Query(`
		SELECT id, email, name, daily_calorie_goal, daily_water_goal_ml, weight_unit, bank_start_date, bank_window_days, weight_trend_days, body_outline, target_weight_kg, is_admin, created_at, updated_at
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
		var targetWeightKg sql.NullFloat64
		err := rows.Scan(
			&user.ID, &user.Email, &user.Name, &user.DailyCalorieGoal,
			&user.DailyWaterGoalML, &user.WeightUnit, &bankStartDate, &user.BankWindowDays, &user.WeightTrendDays, &user.BodyOutline, &targetWeightKg, &user.IsAdmin,
			&user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		if bankStartDate.Valid {
			user.BankStartDate = bankStartDate.String
		}
		if targetWeightKg.Valid {
			v := targetWeightKg.Float64
			user.TargetWeightKG = &v
		}
		users = append(users, user)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}
