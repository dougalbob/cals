package handlers

import (
	"database/sql"
	"html/template"
	"log"
	"net/http"
	"strings"

	"cals/internal/auth"
	"cals/internal/database"
)

// UserExistsByEmail reports whether an email already belongs to a user. The DEV
// identity switch uses it to guarantee that a developer can only select users
// that exist — it never creates one, unlike GetOrCreateUser.
func UserExistsByEmail(email string) (bool, error) {
	var id int64
	err := database.DB.QueryRow(`SELECT id FROM users WHERE lower(email) = ?`, strings.ToLower(strings.TrimSpace(email))).Scan(&id)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

type devIdentityUser struct {
	Email   string
	Name    string
	Current bool
}

type devIdentityPageData struct {
	CurrentEmail string
	Users        []devIdentityUser
	ClearURL     string
}

var devIdentityTemplate = template.Must(template.New("dev-identity").Parse(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>cals dev identity switch</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 1.5rem; max-width: 34rem; }
  h1 { font-size: 1.35rem; margin: 0 0 .25rem; }
  .banner { background: #b45309; color: #fff; padding: .6rem .8rem; border-radius: .6rem; margin-bottom: 1.25rem; }
  .banner strong { display: block; }
  p { margin: .5rem 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { margin-bottom: .6rem; }
  a.identity { display: block; padding: .9rem 1rem; border: 1px solid #9ca3af; border-radius: .75rem; text-decoration: none; color: inherit; min-height: 44px; box-sizing: border-box; }
  a.identity.current { border-color: #15803d; border-width: 2px; }
  .email { font-weight: 600; }
  .meta { font-size: .85rem; opacity: .75; }
  .tag { float: right; font-size: .8rem; color: #15803d; }
  .clear { display: inline-block; margin-top: .5rem; font-size: .85rem; }
  code { font-size: .85rem; }
</style>
</head>
<body>
<div class="banner">
  <strong>⚠️ Development identity switch</strong>
  Only reachable from a loopback/private address on a DEV_MODE server. Never enable this on the container the household uses.
</div>
<h1>Choose an identity</h1>
<p class="meta">Signed in as <span class="email">{{.CurrentEmail}}</span>. Picking a user stores a cookie for this browser only; no restart or variable change is needed.</p>
<ul>
  {{range .Users}}
  <li>
    <a class="identity{{if .Current}} current{{end}}" href="?as={{.Email | urlquery}}">
      {{if .Current}}<span class="tag">current</span>{{end}}
      <span class="email">{{.Email}}</span><br>
      <span class="meta">{{if .Name}}{{.Name}}{{else}}no display name{{end}}</span>
    </a>
  </li>
  {{end}}
</ul>
<p><a class="clear" href="{{.ClearURL}}">Clear the remembered identity and use the configured default</a></p>
<p class="meta">Users are listed from this server's database — the switch can only select users that already exist. New users are created by signing in normally (production) or by the default DEV_MODE identity.</p>
</body>
</html>
`))

// HandleDevIdentityPage renders the minimal, dev-only identity picker. It is
// registered only when DEV_IDENTITY_SWITCH=true (which itself requires
// DEV_MODE=true) and is wrapped in the dev-mode middleware, so it does not
// exist on a production or Cloudflare-routed deployment at all.
func HandleDevIdentityPage(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(`SELECT email, name FROM users ORDER BY email`)
	if err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	current := strings.ToLower(strings.TrimSpace(auth.GetUserEmail(r.Context())))

	data := devIdentityPageData{
		CurrentEmail: current,
		ClearURL:     "/dev/identity?" + auth.DevIdentityQueryParam + "=",
	}
	for rows.Next() {
		var user devIdentityUser
		if err := rows.Scan(&user.Email, &user.Name); err != nil {
			http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		user.Email = strings.ToLower(user.Email)
		user.Current = user.Email == current
		data.Users = append(data.Users, user)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "Database error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if err := devIdentityTemplate.Execute(w, data); err != nil {
		log.Printf("dev identity page: %v", err)
	}
}
