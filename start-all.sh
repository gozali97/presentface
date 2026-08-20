#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
python_dir="$root/backend/python"
go_dir="$root/backend/go"
react_dir="$root/frontend/react"
run_dir="$root/.run"

if [[ -x "$python_dir/.venv/bin/python" ]]; then
  python="$python_dir/.venv/bin/python"
elif [[ -x "$python_dir/venv/bin/python" ]]; then
  python="$python_dir/venv/bin/python"
else
  echo "Python venv tidak ditemukan. Jalankan: python3 -m venv backend/python/venv && backend/python/venv/bin/pip install -r backend/python/requirements.txt" >&2
  exit 1
fi

command -v npm >/dev/null || { echo 'npm tidak ditemukan. Install Node.js terlebih dahulu.' >&2; exit 1; }
[[ -d "$react_dir/node_modules" ]] || { echo 'Dependency React belum terpasang. Jalankan: npm install --prefix frontend/react' >&2; exit 1; }

if command -v air >/dev/null; then
  go_command=(air)
elif command -v go >/dev/null; then
  go_command=(go run .)
  echo 'Air tidak ditemukan; Go dijalankan tanpa live reload.'
else
  echo 'Go dan Air tidak ditemukan. Install Go terlebih dahulu.' >&2
  exit 1
fi

cleanup() {
  for pid in "${python_pid:-}" "${go_pid:-}" "${react_pid:-}"; do
    [[ -n "$pid" ]] && kill -TERM -- "-$pid" 2>/dev/null || true
  done
  rm -f "$run_dir/python.pid" "$run_dir/go.pid" "$run_dir/react.pid"
  rmdir "$run_dir" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo 'Starting Presentface (Python + Go + React)...'
mkdir -p "$run_dir"
setsid bash -c 'cd "$1" && shift && exec "$@"' _ "$python_dir" "$python" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload & python_pid=$!
setsid bash -c 'cd "$1" && shift && exec "$@"' _ "$go_dir" "${go_command[@]}" & go_pid=$!
setsid bash -c 'cd "$1" && shift && exec "$@"' _ "$react_dir" npm run dev & react_pid=$!
printf '%s\n' "$python_pid" > "$run_dir/python.pid"
printf '%s\n' "$go_pid" > "$run_dir/go.pid"
printf '%s\n' "$react_pid" > "$run_dir/react.pid"

echo 'React: http://localhost:5173 | Go: http://localhost:8080/health | Python: http://localhost:8000/docs'
echo 'Tekan Ctrl+C untuk menghentikan semua service.'
wait -n "$python_pid" "$go_pid" "$react_pid"
