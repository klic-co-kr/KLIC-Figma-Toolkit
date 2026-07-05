#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOLKIT_DIR="$ROOT_DIR/klic-figma-toolkit"

print_help() {
  cat <<'EOF'
KLIC Figma Toolkit

Usage:
  ./KLIC-START.sh [--help] [--check] [--preflight]
  ./KLIC-START.sh --capture-clipboard
  ./KLIC-START.sh --audit <path>
  ./KLIC-START.sh --watch-file <path>
  ./KLIC-START.sh --watch-clipboard
  ./KLIC-START.sh --watch-http
  ./KLIC-START.sh --runtime-acceptance
  ./KLIC-START.sh --wait-accessibility-runtime
  ./KLIC-START.sh --open-accessibility
  ./KLIC-START.sh --open-checklist

Options:
  --help               Show this help text.
  --check              Check Node.js and Figma desktop readiness without running workflows.
  --preflight          Run local preflight and exit.
  --capture-clipboard  Capture copied Figma smoke evidence and run completion audit.
  --audit <path>       Run completion audit with a saved Figma smoke evidence JSON file.
  --watch-file <path>  Watch an evidence file path and audit when it appears.
  --watch-clipboard    Watch clipboard for Figma smoke evidence and audit when it appears.
  --watch-http         Watch localhost HTTP for Figma smoke evidence and audit.
  --runtime-acceptance Check readiness, print final Figma steps, then watch HTTP and clipboard evidence.
  --wait-accessibility-runtime
                       Open Accessibility settings, wait for permission, then run runtime acceptance.
  --open-accessibility Open macOS Accessibility privacy settings.
  --open-checklist     Open the runtime checklist.

Menu actions:
  1. Run local preflight
  2. Capture Figma smoke evidence from clipboard and run completion audit
  3. Run completion audit with evidence file
  4. Watch an evidence file path and audit when it appears
  5. Watch clipboard for Figma smoke evidence and audit
  6. Watch localhost HTTP for Figma smoke evidence and audit
  7. Open runtime checklist
  8. Check Node.js and Figma desktop readiness
  9. Open macOS Accessibility privacy settings
  10. Run guided Figma runtime acceptance
  11. Wait for Accessibility, then run runtime acceptance

If Figma desktop is not installed on macOS, install it from:
  https://www.figma.com/downloads/

Figma desktop login is required before runtime evidence can be captured.
Use --check to see whether a signed-in local Figma profile is detected.
If automated runtime navigation is blocked on macOS, allow the controlling
terminal app in System Settings > Privacy & Security > Accessibility.
AppleEvents permission alone is not enough for System Events menu automation;
if this is running from Ghostty, grant Accessibility to Ghostty and restart it.
EOF
}

check_node() {
  if command -v node >/dev/null 2>&1; then
    echo "Node.js: $(node --version)"
    return 0
  fi

  cat <<'EOF'
Node.js LTS is required for KLIC local verification and runtime evidence capture.

Install option 1:
  brew install node

Install option 2:
  Download Node.js LTS from https://nodejs.org/

After installation, close this terminal and open it again.
EOF
  return 1
}

check_figma() {
  if [[ "$(uname -s)" == "Darwin" ]]; then
    if open -Ra Figma >/dev/null 2>&1; then
      echo "Figma desktop: installed"
      local figma_user=""
      figma_user="$(figma_desktop_user_id || true)"
      if [[ -n "$figma_user" && "$figma_user" != "null" ]]; then
        echo "Figma desktop profile: signed in ($figma_user)"
      else
        echo "Figma desktop profile: sign in required before runtime evidence capture"
      fi
      cat <<'EOF'
If automated runtime navigation is blocked on macOS, allow the controlling
terminal app in System Settings > Privacy & Security > Accessibility.
AppleEvents permission alone is not enough for System Events menu automation;
if this is running from Ghostty, grant Accessibility to Ghostty and restart it.
EOF
      check_accessibility_permission
      check_figma_agent_open_url "$figma_user"
    else
      cat <<'EOF'
Figma desktop: not found

Install Figma desktop from:
  https://www.figma.com/downloads/

Then import:
  klic-figma-toolkit/manifest.json
EOF
    fi
  else
    echo "Figma desktop check: skipped outside macOS. Open Figma desktop manually before runtime acceptance."
  fi
}

figma_desktop_user_id() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 1
  fi
  local figma_user=""
  local desktop_state="$HOME/Library/Application Support/Figma/desktop_state.json"
  local settings="$HOME/Library/Application Support/Figma/settings.json"
  if [[ -f "$desktop_state" ]]; then
    figma_user="$(/usr/bin/plutil -extract 'apps.0.authedUserIDs.0' raw "$desktop_state" 2>/dev/null || true)"
  fi
  if [[ -z "$figma_user" || "$figma_user" == "null" ]]; then
    if [[ -f "$settings" ]]; then
      figma_user="$(/usr/bin/plutil -extract figmaID raw "$settings" 2>/dev/null || true)"
    fi
  fi
  if [[ -n "$figma_user" && "$figma_user" != "null" ]]; then
    echo "$figma_user"
    return 0
  fi
  return 1
}

check_figma_agent_open_url() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 0
  fi
  local figma_user="${1:-}"
  if [[ -z "$figma_user" || "$figma_user" == "null" ]]; then
    echo "FigmaAgent URL-open check: skipped until Figma desktop sign-in is detected"
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
    echo "FigmaAgent URL-open check: skipped because curl or node is unavailable"
    return 0
  fi
  local design_url="https://www.figma.com/design/new"
  local encoded_url=""
  encoded_url="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$design_url" 2>/dev/null || true)"
  if [[ -z "$encoded_url" ]]; then
    echo "FigmaAgent URL-open check: skipped because URL encoding failed"
    return 0
  fi
  local response=""
  response="$(curl -fsS --max-time 2 -H 'Origin: https://www.figma.com' "http://127.0.0.1:44950/figma/desktop/can-open-url?url=$encoded_url&userID=$figma_user" 2>/dev/null || true)"
  if [[ "$response" == *'"canOpen":true'* ]]; then
    echo "FigmaAgent URL-open check: ready (can open a new design file)"
  else
    echo "FigmaAgent URL-open check: unavailable; open a Figma design file manually before plugin launch"
  fi
}

check_accessibility_permission() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 0
  fi
  local granted=""
  if granted="$(accessibility_granted_client)"; then
    echo "Accessibility permission: granted for $granted"
  else
    echo "Accessibility permission: not detected for Ghostty/Terminal/iTerm2"
    local apple_events_clients=""
    apple_events_clients="$(apple_events_any_clients || true)"
    if [[ -n "$apple_events_clients" ]]; then
      echo "AppleEvents permission: present for $apple_events_clients"
      echo "AppleEvents permission: Accessibility is still required for System Events menu automation."
    else
      echo "AppleEvents permission: not detected for this user"
    fi
    local any_granted=""
    any_granted="$(accessibility_any_granted_clients || true)"
    if [[ -n "$any_granted" ]]; then
      echo "Accessibility permission: other granted clients: $any_granted"
    else
      echo "Accessibility permission: no grants found in user TCC database"
    fi
    local controller_hint=""
    controller_hint="$(accessibility_controller_hint || true)"
    if [[ -n "$controller_hint" ]]; then
      echo "Accessibility controller hint: allow $controller_hint"
    fi
    echo "Run ./KLIC-START.sh --open-accessibility, allow your terminal app, then restart it."
  fi
}

accessibility_controller_hint() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 1
  fi
  local pid="$$"
  local hops=0
  while [[ -n "$pid" && "$pid" != "0" && "$hops" -lt 24 ]]; do
    local args=""
    args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
    case "$args" in
      *"/Applications/Ghostty.app/"*)
        echo "Ghostty.app (com.mitchellh.ghostty)"
        return 0
        ;;
      *"/System/Applications/Utilities/Terminal.app/"*|*"/Applications/Utilities/Terminal.app/"*|*"/Applications/Terminal.app/"*)
        echo "Terminal.app (com.apple.Terminal)"
        return 0
        ;;
      *"/Applications/iTerm.app/"*|*"/Applications/iTerm2.app/"*)
        echo "iTerm.app (com.googlecode.iterm2)"
        return 0
        ;;
      *"/Applications/cmux.app/"*)
        echo "cmux.app first; if menu automation is still blocked, also allow the terminal app hosting this session"
        return 0
        ;;
    esac
    local ppid=""
    ppid="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
    if [[ -z "$ppid" || "$ppid" == "$pid" ]]; then
      break
    fi
    pid="$ppid"
    hops=$((hops + 1))
  done
  echo "the terminal app running this command"
}

accessibility_any_granted_clients() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 1
  fi
  local tcc_db="$HOME/Library/Application Support/com.apple.TCC/TCC.db"
  if [[ ! -f "$tcc_db" ]] || ! command -v sqlite3 >/dev/null 2>&1; then
    return 1
  fi
  sqlite3 "$tcc_db" "select client from access where service = 'kTCCServiceAccessibility' and auth_value = 2 order by client;" 2>/dev/null | paste -sd ', ' -
}

apple_events_any_clients() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 1
  fi
  local tcc_db="$HOME/Library/Application Support/com.apple.TCC/TCC.db"
  if [[ ! -f "$tcc_db" ]] || ! command -v sqlite3 >/dev/null 2>&1; then
    return 1
  fi
  sqlite3 "$tcc_db" "select distinct client from access where service = 'kTCCServiceAppleEvents' and auth_value = 2 order by client;" 2>/dev/null | paste -sd ', ' -
}

accessibility_granted_client() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 1
  fi
  local tcc_db="$HOME/Library/Application Support/com.apple.TCC/TCC.db"
  if [[ ! -f "$tcc_db" ]] || ! command -v sqlite3 >/dev/null 2>&1; then
    return 1
  fi
  local granted=""
  granted="$(sqlite3 "$tcc_db" "select client from access where service = 'kTCCServiceAccessibility' and auth_value = 2 and client in ('com.mitchellh.ghostty','com.apple.Terminal','com.googlecode.iterm2') limit 1;" 2>/dev/null || true)"
  if [[ -n "$granted" ]]; then
    echo "$granted"
    return 0
  else
    return 1
  fi
}

check_ready() {
  check_node || true
  check_figma
}

open_accessibility_settings() {
  if [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
    open 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
  else
    echo "Open System Settings > Privacy & Security > Accessibility and allow your terminal app."
  fi
}

open_checklist() {
  local checklist="$TOOLKIT_DIR/RUNTIME_CHECKLIST.md"
  if command -v open >/dev/null 2>&1; then
    open "$checklist"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$checklist"
  else
    less "$checklist"
  fi
}

open_figma_desktop() {
  if [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
    if open -a Figma >/dev/null 2>&1; then
      echo "Figma desktop: open request sent"
    else
      echo "Figma desktop: open request failed; open Figma desktop manually."
    fi
  else
    echo "Figma desktop: open it manually before runtime acceptance."
  fi
}

open_figma_design_file() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "FigmaAgent design file open: skipped outside macOS"
    return 0
  fi
  local figma_user=""
  figma_user="$(figma_desktop_user_id || true)"
  if [[ -z "$figma_user" || "$figma_user" == "null" ]]; then
    echo "FigmaAgent design file open: skipped until Figma desktop sign-in is detected"
    return 0
  fi
  if ! command -v curl >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
    echo "FigmaAgent design file open: skipped because curl or node is unavailable"
    return 0
  fi
  local design_url="https://www.figma.com/design/new"
  local encoded_url=""
  encoded_url="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$design_url" 2>/dev/null || true)"
  if [[ -z "$encoded_url" ]]; then
    echo "FigmaAgent design file open: skipped because URL encoding failed"
    return 0
  fi
  local response=""
  response="$(curl -fsS --max-time 4 -H 'Origin: https://www.figma.com' "http://127.0.0.1:44950/figma/desktop/open-url?url=$encoded_url&userID=$figma_user" 2>/dev/null || true)"
  if [[ "$response" == *'"opened":true'* ]]; then
    echo "FigmaAgent design file open: request sent"
  else
    echo "FigmaAgent design file open: unavailable; open any Figma design file manually before plugin launch"
  fi
}

try_run_figma_plugin_menu() {
  if [[ "$(uname -s)" != "Darwin" ]] || ! command -v osascript >/dev/null 2>&1; then
    echo "KLIC auto menu launch skipped: macOS osascript is unavailable."
    return 0
  fi
  local granted=""
  if ! granted="$(accessibility_granted_client)"; then
    echo "KLIC auto menu launch skipped: Accessibility permission not detected."
    return 0
  fi
  echo "KLIC auto menu launch: Accessibility permission detected for $granted."
  echo "Trying Figma menu: Plugins > Development > Run Runtime Smoke Evidence."
  local tmp_output=""
  tmp_output="$(mktemp "${TMPDIR:-/tmp}/klic-figma-menu.XXXXXX")"
  (
    osascript <<'APPLESCRIPT'
on clickKlicMenuItem(itemName)
  tell application "System Events"
    tell process "Figma"
      set frontmost to true
      click menu item itemName of menu "Development" of menu item "Development" of menu "Plugins" of menu bar item "Plugins" of menu bar 1
    end tell
  end tell
end clickKlicMenuItem

tell application "Figma" to activate
delay 1
try
  clickKlicMenuItem("Run Runtime Smoke Evidence")
  return "Clicked Run Runtime Smoke Evidence"
on error firstError
  try
    clickKlicMenuItem("KLIC Figma Toolkit")
    return "Clicked KLIC Figma Toolkit"
  on error secondError
    error "Could not click KLIC plugin menu. First: " & firstError & " Second: " & secondError
  end try
end try
APPLESCRIPT
  ) >"$tmp_output" 2>&1 &
  local osascript_pid=$!
  local status=124
  for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if ! kill -0 "$osascript_pid" 2>/dev/null; then
      wait "$osascript_pid"
      status=$?
      break
    fi
    sleep 1
  done
  if kill -0 "$osascript_pid" 2>/dev/null; then
    kill "$osascript_pid" 2>/dev/null || true
    wait "$osascript_pid" 2>/dev/null || true
    status=124
  fi
  if [[ -s "$tmp_output" ]]; then
    cat "$tmp_output"
  fi
  rm -f "$tmp_output"
  if [[ "$status" -eq 0 ]]; then
    echo "KLIC Figma plugin menu auto-run requested."
  else
    echo "KLIC auto menu launch did not complete; run the plugin from Figma desktop manually."
  fi
  return 0
}

run_runtime_acceptance_watchers() {
  echo "KLIC runtime acceptance: watching localhost HTTP and clipboard evidence."
  node "$TOOLKIT_DIR/watch-runtime-http.mjs" &
  local http_pid=$!
  node "$TOOLKIT_DIR/watch-runtime-clipboard.mjs" &
  local clipboard_pid=$!
  local winner="unknown"
  local status=1

  trap 'kill "$http_pid" "$clipboard_pid" 2>/dev/null || true; wait "$http_pid" 2>/dev/null || true; wait "$clipboard_pid" 2>/dev/null || true' INT TERM EXIT

  sleep 1
  open_figma_desktop
  open_figma_design_file
  try_run_figma_plugin_menu

  while true; do
    if ! kill -0 "$http_pid" 2>/dev/null; then
      wait "$http_pid"
      status=$?
      winner="localhost HTTP"
      break
    fi
    if ! kill -0 "$clipboard_pid" 2>/dev/null; then
      wait "$clipboard_pid"
      status=$?
      winner="clipboard"
      break
    fi
    sleep 1
  done

  echo "KLIC runtime acceptance: $winner watcher exited with status $status."
  kill "$http_pid" "$clipboard_pid" 2>/dev/null || true
  wait "$http_pid" 2>/dev/null || true
  wait "$clipboard_pid" 2>/dev/null || true
  trap - INT TERM EXIT
  return "$status"
}

run_runtime_acceptance() {
  check_node
  check_figma
  cat <<'EOF'

Guided Figma runtime acceptance

Keep this terminal open while the localhost receiver waits.
The launcher tries to open a new Figma design file through FigmaAgent first.
If that does not open a file, open any Figma design file first. Then run:
  Plugins > Development > KLIC Figma Toolkit
or:
  Plugins > Development > Run Runtime Smoke Evidence

If macOS menu automation is blocked and you need automation, run:
  ./KLIC-START.sh --open-accessibility

Then allow your terminal app in Accessibility settings and restart it.

EOF
  run_runtime_acceptance_watchers
}

wait_for_accessibility_runtime() {
  check_node
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "KLIC accessibility wait: skipped outside macOS."
    run_runtime_acceptance
    return $?
  fi

  check_figma
  if accessibility_granted_client >/dev/null 2>&1; then
    echo "KLIC accessibility wait: Accessibility is already granted."
    run_runtime_acceptance
    return $?
  fi

  local controller_hint=""
  controller_hint="$(accessibility_controller_hint || true)"
  echo "KLIC accessibility wait: opening macOS Accessibility settings."
  if [[ -n "$controller_hint" ]]; then
    echo "KLIC accessibility wait: allow $controller_hint."
  else
    echo "KLIC accessibility wait: allow the terminal app running this command."
  fi
  echo "KLIC accessibility wait: polling for permission before runtime acceptance."
  open_accessibility_settings

  local timeout_seconds="${KLIC_ACCESSIBILITY_WAIT_SECONDS:-300}"
  local elapsed=0
  local interval=2
  while [[ "$elapsed" -lt "$timeout_seconds" ]]; do
    local granted=""
    if granted="$(accessibility_granted_client)"; then
      echo "KLIC accessibility wait: Accessibility permission detected for $granted."
      run_runtime_acceptance
      return $?
    fi
    sleep "$interval"
    elapsed=$((elapsed + interval))
  done

  echo "KLIC accessibility wait: timed out after ${timeout_seconds}s without Accessibility permission."
  echo "After enabling Accessibility, run ./KLIC-START.sh --check, then rerun ./KLIC-START.sh --wait-accessibility-runtime."
  return 1
}

run_node_workflow() {
  check_node
  node "$@"
}

require_arg() {
  local option="$1"
  local value="${2:-}"
  if [[ -z "$value" ]]; then
    echo "$option requires a path argument." >&2
    exit 2
  fi
}

run_menu() {
  while true; do
    cat <<'EOF'

KLIC Figma Toolkit

1. Run local preflight
2. Capture Figma smoke evidence from clipboard and run completion audit
3. Run completion audit with evidence file
4. Watch an evidence file path and audit when it appears
5. Watch clipboard for Figma smoke evidence and audit
6. Watch localhost HTTP for Figma smoke evidence and audit
7. Open runtime checklist
8. Check Node.js and Figma desktop readiness
9. Open macOS Accessibility privacy settings
10. Run guided Figma runtime acceptance
11. Wait for Accessibility, then run runtime acceptance
0. Exit

EOF
    read -r -p "Select: " choice
    case "$choice" in
      1)
        run_node_workflow "$TOOLKIT_DIR/run-local-verification.mjs"
        ;;
      2)
        bash "$TOOLKIT_DIR/capture-runtime-evidence.sh"
        ;;
      3)
        read -r -p "Evidence JSON path: " evidence_path
        [[ -n "$evidence_path" ]] && bash "$TOOLKIT_DIR/run-completion-audit.sh" --runtime-evidence "$evidence_path"
        ;;
      4)
        read -r -p "Evidence JSON path to watch: " watch_path
        [[ -n "$watch_path" ]] && run_node_workflow "$TOOLKIT_DIR/watch-runtime-evidence.mjs" "$watch_path"
        ;;
      5)
        bash "$TOOLKIT_DIR/watch-runtime-clipboard.sh"
        ;;
      6)
        bash "$TOOLKIT_DIR/watch-runtime-http.sh"
        ;;
      7)
        open_checklist
        ;;
      8)
        check_ready
        ;;
      9)
        open_accessibility_settings
        ;;
      10)
        run_runtime_acceptance
        ;;
      11)
        wait_for_accessibility_runtime
        ;;
      0)
        exit 0
        ;;
      *)
        echo "Unknown selection: $choice"
        ;;
    esac
  done
}

case "${1:-}" in
  --help|-h)
    print_help
    ;;
  --check)
    check_ready
    ;;
  --preflight)
    run_node_workflow "$TOOLKIT_DIR/run-local-verification.mjs"
    ;;
  --capture-clipboard)
    bash "$TOOLKIT_DIR/capture-runtime-evidence.sh"
    ;;
  --audit)
    require_arg "$1" "${2:-}"
    bash "$TOOLKIT_DIR/run-completion-audit.sh" --runtime-evidence "$2"
    ;;
  --watch-file)
    require_arg "$1" "${2:-}"
    run_node_workflow "$TOOLKIT_DIR/watch-runtime-evidence.mjs" "$2"
    ;;
  --watch-clipboard)
    bash "$TOOLKIT_DIR/watch-runtime-clipboard.sh"
    ;;
  --watch-http)
    bash "$TOOLKIT_DIR/watch-runtime-http.sh"
    ;;
  --runtime-acceptance)
    run_runtime_acceptance
    ;;
  --wait-accessibility-runtime)
    wait_for_accessibility_runtime
    ;;
  --open-accessibility)
    open_accessibility_settings
    ;;
  --open-checklist)
    open_checklist
    ;;
  "")
    run_menu
    ;;
  *)
    echo "Unknown option: $1" >&2
    print_help >&2
    exit 2
    ;;
esac
