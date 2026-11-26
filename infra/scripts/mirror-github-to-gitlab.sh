#!/usr/bin/env bash
# One-way sync of branches and tags from GitHub to GitLab, meant to run from cron.
# It never force-pushes and never deletes anything in GitLab.
set -euo pipefail

SOURCE_URL="${SOURCE_URL:-git@github.com:BLCKVISION/CotizAI.git}"
TARGET_URL="${TARGET_URL:-https://gitlab.nube.gob.ve/blckvisions/cotizai.git}"
STATE_DIR="${STATE_DIR:-$HOME/.local/state/cotizai-mirror}"
MIRROR_DIR="$STATE_DIR/repo.git"
LOG_FILE="$STATE_DIR/mirror.log"

# Cron has no terminal: fail instead of waiting for a password.
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=20"

mkdir -p "$STATE_DIR"

# Skip this run if the previous one is still working.
exec 9>"$STATE_DIR/lock"
flock -n 9 || exit 0

# Keep one rotated log of about 1 MB.
if [[ -f "$LOG_FILE" ]] && (( $(stat -c %s "$LOG_FILE") > 1048576 )); then
  mv "$LOG_FILE" "$LOG_FILE.1"
fi
exec >>"$LOG_FILE" 2>&1

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
trap 'log "FAILED (exit $?)"' ERR

[[ -d "$MIRROR_DIR" ]] || git init --quiet --bare "$MIRROR_DIR"

# The local copy follows GitHub exactly.
timeout 120 git -C "$MIRROR_DIR" fetch --prune --no-tags "$SOURCE_URL" \
  '+refs/heads/*:refs/heads/*' '+refs/tags/*:refs/tags/*'

# No "+" here: a branch that diverged in GitLab is rejected, not overwritten.
timeout 120 git -C "$MIRROR_DIR" push "$TARGET_URL" \
  'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'

log "OK"
