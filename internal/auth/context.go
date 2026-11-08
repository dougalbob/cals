package auth

import "context"

type contextKey string

const (
	// UserEmailKey is the **acting** user: whose data this request reads and
	// writes. Everything downstream (handlers, bank maths, diary rows) uses it
	// and nothing else, which is what makes the Admin acting-user switch a
	// single-context change rather than a change to every handler.
	UserEmailKey contextKey = "user_email"

	// AuthenticatedEmailKey is the identity the authentication layer actually
	// verified — the Cloudflare Access email (or the DEV_MODE identity). It is
	// never overwritten by the acting-user switch, so authorization can always
	// ask "who is really signed in?" independently of "whose data is this?".
	//
	// That distinction matters: an Admin who is acting as someone else must
	// still be able to list accounts and swap back, so role checks read this
	// key and never UserEmailKey.
	AuthenticatedEmailKey contextKey = "authenticated_email"
)

// WithAuthenticatedEmail records the verified identity. It is set by the
// authentication middleware and must not be set anywhere else.
func WithAuthenticatedEmail(ctx context.Context, email string) context.Context {
	return context.WithValue(ctx, AuthenticatedEmailKey, email)
}

// GetAuthenticatedEmail returns the verified identity, or "" when no
// authentication middleware has run for this request.
func GetAuthenticatedEmail(ctx context.Context) string {
	email, _ := ctx.Value(AuthenticatedEmailKey).(string)
	return email
}

// GetUserEmail returns the acting user's email.
func GetUserEmail(ctx context.Context) string {
	email, _ := ctx.Value(UserEmailKey).(string)
	return email
}
