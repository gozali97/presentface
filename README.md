# AI Face Recognition & Attendance System

Sistem Absensi Otomatis berbasis Pengenalan Wajah (**InsightFace ArcFace / RetinaFace**) dengan Arsitektur Microservice: **Python (AI Core) + Golang (API Gateway + Live Reload via Air) + React TypeScript (Frontend)**.

---

## 🏗 Arsitektur Sistem

```
                       ┌─────────────────────────┐
                       │   React + Vite (5173)   │
                       │ (Webcam, Auto-Scanner,  │
                       │  Bounding Box, Canvas)  │
                       └────────────┬────────────┘
                                    │ HTTP / Multipart
                                    ▼
                       ┌─────────────────────────┐
                       │   Go API Gateway (8080) │
                       │    (Chi Router + CORS   │
                       │     Air Live Reload)    │
                       └────────────┬────────────┘
                                    │ Forwarding / Proxy
                                    ▼
                       ┌─────────────────────────┐
                       │ Python Microservice     │
                       │         (8000)          │
                       │  - InsightFace (ArcFace)│
                       │  - Anti-Spoofing Check  │
                       │  - SQLite Database      │
                       └─────────────────────────┘
```

---

## 🚀 Cara Menjalankan (Otomatis 1 Klik)

Cukup jalankan salah satu file launcher di root folder:

### Opsi 1: Menggunakan PowerShell (Recommended)
```powershell
cd D:\Project\wa-go-react-face
.\start-all.ps1
```

### Opsi 2: Menggunakan Batch / Double Click
Cukup double-click file **`start-all.bat`** di File Explorer.

---

## 🛠 Cara Menjalankan Secara Manual (3 Terminal)

### Terminal 1: Python Face Recognition Service
```powershell
cd D:\Project\wa-go-react-face\backend\python
.\venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
*API Docs: http://localhost:8000/docs*

### Terminal 2: Go API Gateway (dengan Air Live-Reload)
```powershell
cd D:\Project\wa-go-react-face\backend\go
air
```
*Health Check: http://localhost:8080/health*

### Terminal 3: React Web Frontend
```powershell
cd D:\Project\wa-go-react-face\frontend\react
npm run dev
```
*Aplikasi Web: http://localhost:5173*

---

## ✨ Fitur-Fitur Unggulan

1. **InsightFace ArcFace Model (buffalo_l)**: Deteksi wajah berakurasi tinggi (512-dim normalized vector embeddings).
2. **Anti-Spoofing & Liveness Detection**: Filter pencegah pemalsuan wajah dari layar smartphone, monitor, foto cetak, atau gambar buram.
3. **Auto-Scan Absensi (Real-Time)**: Kamera otomatis memindai wajah setiap 2 detik dan langsung mencatat kehadiran jika cocok.
4. **Interactive Bounding Box**: Bounding box dinamis di atas canvas video yang menunjukkan nama user, similarity score, atau alert spoofing.
5. **Live Reload Go dengan Air**: Setiap perubahan kode Go otomatis di-compile ulang tanpa restart manual.
6. **Manajemen User & Log Absensi**: Registrasi wajah baru, penghapusan user, dan rekap history absensi lengkap dengan timestamp.
