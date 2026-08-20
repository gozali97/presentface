#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
run_dir="$root/.run"
stopped=0

for service in python go react; do
  pid_file="$run_dir/$service.pid"
  [[ -f "$pid_file" ]] || continue
  read -r pid < "$pid_file"

  case "$service" in
    python) expected_dir="$root/backend/python" ;;
    go) expected_dir="$root/backend/go" ;;
    react) expected_dir="$root/frontend/react" ;;
  esac

  actual_dir="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null && [[ "$actual_dir" == "$expected_dir" ]]; then
    kill -TERM -- "-$pid"
    echo "Stopped $service (PID $pid)"
    stopped=1
  else
    echo "Skipped stale $service PID file"
  fi

  rm -f "$pid_file"
done

rmdir "$run_dir" 2>/dev/null || true
(( stopped )) || echo 'Tidak ada service Presentface yang sedang berjalan.'
