package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestVersionHandlerAdvertisesDevIdentitySwitchOnlyWhenEnabled(t *testing.T) {
	for _, tc := range []struct {
		name            string
		devIdentity     bool
		wantSwitchField bool
	}{
		{name: "production", devIdentity: false, wantSwitchField: false},
		{name: "dev identity switch", devIdentity: true, wantSwitchField: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodGet, "/api/version", nil)

			versionHandler(tc.devIdentity).ServeHTTP(recorder, request)

			if recorder.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
			}
			if got, want := recorder.Header().Get("Content-Type"), "application/json"; got != want {
				t.Errorf("Content-Type = %q, want %q", got, want)
			}
			if got, want := recorder.Header().Get("Cache-Control"), "no-cache, no-store, must-revalidate"; got != want {
				t.Errorf("Cache-Control = %q, want %q", got, want)
			}

			var body map[string]any
			if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
				t.Fatalf("decoding response: %v", err)
			}
			if got, want := body["version"], AppVersion; got != want {
				t.Errorf("version = %v, want %q", got, want)
			}
			value, hasSwitchField := body["dev_identity_switch"]
			if hasSwitchField != tc.wantSwitchField {
				t.Fatalf("dev_identity_switch field present = %v, want %v", hasSwitchField, tc.wantSwitchField)
			}
			if tc.wantSwitchField && value != true {
				t.Errorf("dev_identity_switch = %v, want true", value)
			}
		})
	}
}
