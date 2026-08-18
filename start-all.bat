@echo off
title AI Face Attendance System Launcher
echo ==========================================================
echo   Starting AI Face Attendance System (Go + Python + React)
echo ==========================================================

echo [1/3] Starting Python InsightFace Service (:8000)...
start "Python-Face-Engine" cmd /k "cd backend\python && venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

echo [2/3] Starting Go Gateway with Air (:8080)...
start "Go-API-Gateway" cmd /k "cd backend\go && air"

echo [3/3] Starting React Web App (:5173)...
start "React-Frontend" cmd /k "cd frontend\react && npm run dev"

echo.
echo All services launched!
echo Open your browser: http://localhost:5173
pause
