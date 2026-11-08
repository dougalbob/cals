#!/usr/bin/env bash
# Stable-release guard for cals V2.
#
# A stable release does not build anything new. It promotes a development
# candidate that the household has already run: the stable tag vX.Y.Z must sit
# on `main`, and the named candidate vX.Y.Z-dev-rcN must be an ancestor of it,
# with nothing that goes into the image changed in between. The workflow then
# copies that candidate's image digest unchanged to :vX.Y.Z and :latest.
#
# This script does only the Git-level checks, so you can run it locally before
# tagging (no network access, no registry, no GitHub API):
#
#   git fetch origin +refs/heads/main:refs/remotes/origin/main --tags
#   STABLE_TAG=v2.0.0 PROMOTES=v2.0.0-dev-rc43 COMMIT=origin/main \
#     .github/scripts/stable-release-guard.sh
#
# Inputs (environment):
#   STABLE_TAG  required  e.g. v2.0.0 (no suffix)
#   PROMOTES    required  the road-tested candidate, e.g. v2.0.0-dev-rc43
#   COMMIT      optional  commit to release (default HEAD)
#   MAIN_REF    optional  ref that must contain COMMIT (default origin/main)
#
# Outputs: prints a summary; when GITHUB_OUTPUT is set, also writes
# `version`, `commit`, `rc_tag` and `rc_commit` there.
#
# See docs/architecture/stable-release-plan.md.

set -euo pipefail

fail() {
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
    echo "::error::$*"
  else
    echo "ERROR: $*" >&2
  fi
  exit 1
}

STABLE_TAG="${STABLE_TAG:-}"
PROMOTES="${PROMOTES:-}"
COMMIT_REF="${COMMIT:-HEAD}"
MAIN_REF="${MAIN_REF:-origin/main}"

# 1. Tag shapes. A stable tag is exactly vMAJOR.MINOR.PATCH; the candidate it
#    promotes must be a development tag for the same version.
[[ "$STABLE_TAG" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] \
  || fail "STABLE_TAG '$STABLE_TAG' is not a stable tag of the form vX.Y.Z (development tags publish from the development workflow)."
VERSION="${STABLE_TAG#v}"
MAJOR="${BASH_REMATCH[1]}"
(( MAJOR >= 2 )) \
  || fail "STABLE_TAG '$STABLE_TAG' is below v2. Stable publishing is for the V2 image line only; V1 has no published image."

[[ -n "$PROMOTES" ]] \
  || fail "No candidate named. Annotate the stable tag with a line 'Promotes: $STABLE_TAG-dev-rcN' naming the candidate you road-tested."
RC_NUMBER="${PROMOTES#"$STABLE_TAG"-dev-rc}"
[[ "$PROMOTES" == "$STABLE_TAG"-dev-rc* && "$RC_NUMBER" =~ ^[0-9]+$ ]] \
  || fail "PROMOTES '$PROMOTES' is not a development candidate of $STABLE_TAG (expected $STABLE_TAG-dev-rcN)."

COMMIT_SHA="$(git rev-parse --verify --quiet "$COMMIT_REF^{commit}")" \
  || fail "Cannot resolve COMMIT '$COMMIT_REF'."

# 2. The release must come from main, i.e. after the owner's release PR.
git rev-parse --verify --quiet "$MAIN_REF^{commit}" >/dev/null \
  || fail "Cannot resolve MAIN_REF '$MAIN_REF'. Fetch it first: git fetch origin +refs/heads/main:refs/remotes/origin/main"
git merge-base --is-ancestor "$COMMIT_SHA" "$MAIN_REF" \
  || fail "$STABLE_TAG ($COMMIT_SHA) is not on $MAIN_REF. Stable releases are tagged on main after the release PR merges."

# 3. The application must report the version being released.
APP_VERSION="$(git show "$COMMIT_SHA:cmd/server/main.go" \
  | sed -n 's/^const AppVersion = "\([^"]*\)".*/\1/p' | head -n1)"
[[ -n "$APP_VERSION" ]] || fail "Could not read AppVersion from cmd/server/main.go at $COMMIT_SHA."
[[ "$APP_VERSION" == "$VERSION" ]] \
  || fail "AppVersion is '$APP_VERSION' at $COMMIT_SHA but the tag is $STABLE_TAG. The app must report the version it is released as."

# 4. The candidate must exist and be part of main's history. A squash or
#    rebase merge of the release PR rewrites the commits, so the candidate
#    would not be an ancestor: the release PR must use a merge commit.
RC_SHA="$(git rev-parse --verify --quiet "refs/tags/$PROMOTES^{commit}")" \
  || fail "Candidate tag $PROMOTES does not exist locally. Fetch tags first (git fetch --tags origin)."
git merge-base --is-ancestor "$RC_SHA" "$COMMIT_SHA" \
  || fail "$PROMOTES ($RC_SHA) is not an ancestor of $STABLE_TAG ($COMMIT_SHA). Was the release PR squash- or rebase-merged? It must be merged with a merge commit."

# 5. Nothing that goes into the image may have changed since the candidate.
#    Only documentation, CI and the Unraid template files (which .dockerignore
#    keeps out of the build context) are allowed to differ.
is_image_neutral() {
  case "$1" in
    docs/*|ai_contextual_docs/*|.github/*) return 0 ;;
    *.md) return 0 ;;
    cals-dev-v2.xml|cals-dev-identity.xml) return 0 ;;
    *) return 1 ;;
  esac
}

CHANGED=()
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  is_image_neutral "$path" || CHANGED+=("$path")
done < <(git diff --name-only --no-renames "$RC_SHA" "$COMMIT_SHA")

if (( ${#CHANGED[@]} > 0 )); then
  echo "Changed since $PROMOTES:" >&2
  printf '  %s\n' "${CHANGED[@]}" >&2
  fail "${#CHANGED[@]} file(s) that affect the image changed between $PROMOTES and $STABLE_TAG. Publish and road-test a new candidate from cals-dev first, then promote that one."
fi

DOCS_CHANGED="$(git diff --name-only "$RC_SHA" "$COMMIT_SHA" | wc -l | tr -d ' ')"

echo "OK: $STABLE_TAG ($COMMIT_SHA) is on $MAIN_REF, reports AppVersion $APP_VERSION,"
echo "    and promotes $PROMOTES ($RC_SHA) with $DOCS_CHANGED image-neutral file(s) changed since."

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  {
    echo "version=$VERSION"
    echo "commit=$COMMIT_SHA"
    echo "rc_tag=$PROMOTES"
    echo "rc_commit=$RC_SHA"
  } >> "$GITHUB_OUTPUT"
fi
