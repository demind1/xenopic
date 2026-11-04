#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
server_pid=''
cleanup() { if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi; }
trap cleanup EXIT
if [[ -z "${DISPLAY:-}" ]]; then
  export DISPLAY=:99
  if [[ ! -S /tmp/.X11-unix/X99 ]]; then
    /usr/lib/xorg/Xorg :99 -config "$PWD/scripts/xorg-dummy.conf" -logfile /tmp/nightframe-Xorg.log -noreset -nolisten tcp -novtswitch > /tmp/nightframe-Xorg-start.log 2>&1 &
    server_pid=$!
    for ((attempt=0;attempt<50;attempt++)); do
      [[ -S /tmp/.X11-unix/X99 ]] && break
      kill -0 "$server_pid"
      sleep 0.1
    done
    [[ -S /tmp/.X11-unix/X99 ]] || { echo 'Xorg did not become ready; see /tmp/nightframe-Xorg.log'; exit 1; }
  fi
fi
npm run test:e2e
