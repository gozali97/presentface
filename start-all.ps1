$ErrorActionPreference = 'Stop'

$pythonDir = Join-Path $PSScriptRoot 'backend\python'
$goDir = Join-Path $PSScriptRoot 'backend\go'
$reactDir = Join-Path $PSScriptRoot 'frontend\react'

$python = @(
    Join-Path $pythonDir '.venv\Scripts\python.exe'
    Join-Path $pythonDir 'venv\Scripts\python.exe'
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $python) {
    throw "Python virtual environment tidak ditemukan. Buat dengan: py -3 -m venv backend\python\venv"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm tidak ditemukan. Install Node.js terlebih dahulu.'
}
if (-not (Test-Path (Join-Path $reactDir 'node_modules'))) {
    throw "Dependency React belum terpasang. Jalankan: npm install --prefix frontend\react"
}

if (Get-Command air -ErrorAction SilentlyContinue) {
    $goCommand = 'air'
} elseif (Get-Command go -ErrorAction SilentlyContinue) {
    $goCommand = 'go run .'
    Write-Host 'Air tidak ditemukan; Go dijalankan tanpa live reload.' -ForegroundColor Yellow
} else {
    throw 'Go dan Air tidak ditemukan. Install Go terlebih dahulu.'
}

function Start-App([string]$title, [string]$directory, [string]$command) {
    $safeTitle = $title.Replace("'", "''")
    $safeDirectory = $directory.Replace("'", "''")
    $script = "`$Host.UI.RawUI.WindowTitle = '$safeTitle'; Set-Location -LiteralPath '$safeDirectory'; $command"
    $encodedScript = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    $powerShell = (Get-Process -Id $PID).Path

    Start-Process -FilePath $powerShell -ArgumentList '-NoExit', '-NoProfile', '-EncodedCommand', $encodedScript
}

Write-Host 'Starting Presentface (Python + Go + React)...' -ForegroundColor Cyan

$pythonCommand = "& '$($python.Replace("'", "''"))' -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
Start-App 'Presentface - Python AI (:8000)' $pythonDir $pythonCommand
Start-App 'Presentface - Go Gateway (:8080)' $goDir $goCommand
Start-App 'Presentface - React (:5173)' $reactDir 'npm run dev'

Write-Host 'All services launched in separate windows:' -ForegroundColor Green
Write-Host '  React UI  : http://localhost:5173'
Write-Host '  Go health : http://localhost:8080/health'
Write-Host '  Python API: http://localhost:8000/docs'
