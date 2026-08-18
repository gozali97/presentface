package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

var (
	pythonServiceURL = getEnv("PYTHON_SERVICE_URL", "http://localhost:8000")
	port             = getEnv("PORT", "8080")
)

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func main() {
	r := chi.NewRouter()

	// Middlewares
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	// CORS Setup for React / Web Frontend
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000", "*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Routes
	r.Get("/health", handleHealth)

	r.Route("/api", func(r chi.Router) {
		r.Get("/users", handleProxyGet("/users"))
		r.Delete("/users/{id}", handleProxyDeleteUser)
		r.Get("/attendance/logs", handleProxyGet("/attendance/logs"))
		r.Post("/face/register", handleRegisterFace)
		r.Post("/face/recognize", handleRecognizeFace)
	})

	log.Printf("==================================================")
	log.Printf("🚀 Go API Gateway is running on http://localhost:%s", port)
	log.Printf("🔗 Connected to Python Face Engine: %s", pythonServiceURL)
	log.Printf("==================================================")

	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	// Check Python Service Health
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(pythonServiceURL + "/health")
	pythonStatus := "disconnected"
	if err == nil && resp.StatusCode == 200 {
		pythonStatus = "connected"
		resp.Body.Close()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":         "ok",
		"service":        "go-api-gateway",
		"time":           time.Now().Format(time.RFC3339),
		"python_service": pythonStatus,
		"python_url":     pythonServiceURL,
	})
}

func handleProxyGet(endpoint string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		targetURL := fmt.Sprintf("%s%s?%s", pythonServiceURL, endpoint, r.URL.RawQuery)
		client := http.Client{Timeout: 10 * time.Second}
		resp, err := client.Get(targetURL)
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"status":"error","message":"Failed to reach face service: %s"}`, err.Error()), http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(resp.StatusCode)
		io.Copy(w, resp.Body)
	}
}

func handleProxyDeleteUser(w http.ResponseWriter, r *http.Request) {
	userId := chi.URLParam(r, "id")
	targetURL := fmt.Sprintf("%s/users/%s", pythonServiceURL, userId)

	req, err := http.NewRequest(http.MethodDelete, targetURL, nil)
	if err != nil {
		http.Error(w, `{"status":"error","message":"Failed to create request"}`, http.StatusInternalServerError)
		return
	}

	client := http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"status":"error","message":"Failed to reach face service: %s"}`, err.Error()), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func handleRegisterFace(w http.ResponseWriter, r *http.Request) {
	// Parse Multipart Form
	if err := r.ParseMultipartForm(20 << 20); err != nil { // 20MB
		http.Error(w, `{"status":"error","message":"File upload too large or invalid form"}`, http.StatusBadRequest)
		return
	}

	userId := r.FormValue("user_id")
	name := r.FormValue("name")
	department := r.FormValue("department")
	if department == "" {
		department = "General"
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, `{"status":"error","message":"'file' field is required"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Forward multipart form to Python Service
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	_ = writer.WriteField("user_id", userId)
	_ = writer.WriteField("name", name)
	_ = writer.WriteField("department", department)

	part, err := writer.CreateFormFile("file", header.Filename)
	if err != nil {
		http.Error(w, `{"status":"error","message":"Failed to create form file"}`, http.StatusInternalServerError)
		return
	}
	if _, err := io.Copy(part, file); err != nil {
		http.Error(w, `{"status":"error","message":"Failed to write image data"}`, http.StatusInternalServerError)
		return
	}
	writer.Close()

	targetURL := pythonServiceURL + "/face/register"
	req, err := http.NewRequest(http.MethodPost, targetURL, body)
	if err != nil {
		http.Error(w, `{"status":"error","message":"Failed to create forward request"}`, http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"status":"error","message":"Face engine communication error: %s"}`, err.Error()), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func handleRecognizeFace(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		http.Error(w, `{"status":"error","message":"Invalid form data"}`, http.StatusBadRequest)
		return
	}

	threshold := r.FormValue("threshold")
	if threshold == "" {
		threshold = "0.45"
	}
	requireLiveness := r.FormValue("require_liveness")
	if requireLiveness == "" {
		requireLiveness = "true"
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, `{"status":"error","message":"'file' field is required"}`, http.StatusBadRequest)
		return
	}
	defer file.Close()

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	_ = writer.WriteField("threshold", threshold)
	_ = writer.WriteField("require_liveness", requireLiveness)

	part, err := writer.CreateFormFile("file", header.Filename)
	if err != nil {
		http.Error(w, `{"status":"error","message":"Failed to create form part"}`, http.StatusInternalServerError)
		return
	}
	if _, err := io.Copy(part, file); err != nil {
		http.Error(w, `{"status":"error","message":"Failed to copy file"}`, http.StatusInternalServerError)
		return
	}
	writer.Close()

	targetURL := pythonServiceURL + "/face/recognize"
	req, err := http.NewRequest(http.MethodPost, targetURL, body)
	if err != nil {
		http.Error(w, `{"status":"error","message":"Failed to create forward request"}`, http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"status":"error","message":"Face engine recognition error: %s"}`, err.Error()), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}
