# Start Script for Face Attendance System

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " 🚀 Starting AI Face Attendance System (Go + Python + React) " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Start Python Service
Write-Host "`n[1/3] Starting Python InsightFace Service on port 8000..." -ForegroundColor Green
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend\python'; .\venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

# 2. Start Go Gateway with Air
Write-Host "[2/3] Starting Go Gateway with Air Live-Reload on port 8080..." -ForegroundColor Green
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend\go'; air"

# 3. Start React Frontend
Write-Host "[3/3] Starting React Web Interface on port 5173..." -ForegroundColor Green
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend\react'; npm run dev"

Write-Host "`nAll 3 services are launching in separate windows!" -ForegroundColor Yellow
Write-Host "  - React Web UI : http://localhost:5173" -ForegroundColor White
Write-Host "  - Go Gateway   : http://localhost:8080/health" -ForegroundColor White
Write-Host "  - Python API   : http://localhost:8000/docs" -ForegroundColor White
