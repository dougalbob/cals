#!/usr/bin/env bash
#
# Installs the repository's git hooks for this clone.
# Git hooks are not versioned by default, so run this once after cloning
# (or after a fresh Arena session starts in a new checkout):
#
#     ./scripts/setup-git-hooks.sh
#
# Installed hooks:
#   .githooks/pre-push — blocks direct pushes to main/master (production).
#                        See docs/architecture/git-workflow.md.
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

git config core.hooksPath .githooks

# Make sure the hook files are executable (git preserves the exec bit, but a
# zip download or a copy that loses permissions will not).
find .githooks -type f -exec chmod +x {} +

echo "Git hooks installed."
echo "  core.hooksPath = .githooks"
echo "  .githooks/pre-push blocks direct pushes to main/master."
echo
echo "Remove with: git config --unset core.hooksPath"
