import io
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import insightface
from insightface.app import FaceAnalysis

from .database import (
    init_db,
    save_face,
    get_all_faces,
    get_users_list,
    delete_user,
    save_attendance,
    get_attendance_logs
)
from .liveness import check_liveness

app = FastAPI(
    title="InsightFace Attendance Microservice",
    version="1.0.0",
    description="Face Recognition & Liveness Detection Engine"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize InsightFace FaceAnalysis engine
# It uses detection, landmark_2d/3d, and recognition models (ArcFace/RetinaFace)
print("Initializing InsightFace engine...")
face_app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
face_app.prepare(ctx_id=0, det_size=(640, 640))
print("InsightFace ready!")

# Initialize Database
init_db()

def compute_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
    """Compute Cosine Similarity between two normalized embeddings"""
    dot = np.dot(emb1, emb2)
    norm1 = np.linalg.norm(emb1)
    norm2 = np.linalg.norm(emb2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    return float(dot / (norm1 * norm2))

def decode_image(file_bytes: bytes) -> np.ndarray:
    nparr = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Format gambar tidak valid")
    return img

@app.get("/health")
def health():
    return {"status": "ok", "service": "python-face-recognition", "engine": "insightface-buffalo_l"}

@app.get("/users")
def list_users():
    return {"status": "success", "data": get_users_list()}

@app.delete("/users/{user_id}")
def remove_user(user_id: str):
    success = delete_user(user_id)
    if not success:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    return {"status": "success", "message": f"User {user_id} berhasil dihapus"}

@app.get("/attendance/logs")
def attendance_logs(limit: int = 50):
    return {"status": "success", "data": get_attendance_logs(limit)}

@app.post("/face/register")
async def register_face(
    user_id: str = Form(...),
    name: str = Form(...),
    department: str = Form("General"),
    file: UploadFile = File(...)
):
    try:
        contents = await file.read()
        img = decode_image(contents)

        faces = face_app.get(img)
        if len(faces) == 0:
            raise HTTPException(status_code=400, detail="Tidak ada wajah terdeteksi pada gambar")

        if len(faces) > 1:
            raise HTTPException(status_code=400, detail="Terdeteksi lebih dari 1 wajah. Harap hanya 1 wajah saat registrasi")

        face = faces[0]
        embedding = face.normed_embedding

        # Save to database
        saved = save_face(user_id, name, department, embedding)
        if not saved:
            raise HTTPException(status_code=500, detail="Gagal menyimpan data wajah ke database")

        return {
            "status": "success",
            "message": f"Wajah untuk {name} ({user_id}) berhasil didaftarkan",
            "data": {
                "user_id": user_id,
                "name": name,
                "department": department,
                "gender": "Male" if face.gender == 1 else "Female",
                "age": int(face.age),
                "box": [int(b) for b in face.bbox]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Terjadi kesalahan: {str(e)}")

@app.post("/face/recognize")
async def recognize_face(
    file: UploadFile = File(...),
    threshold: float = Form(0.45),
    require_liveness: bool = Form(True)
):
    try:
        contents = await file.read()
        img = decode_image(contents)

        faces = face_app.get(img)
        if len(faces) == 0:
            return {
                "status": "no_face",
                "recognized": False,
                "message": "Tidak ada wajah terdeteksi",
                "detections": []
            }

        registered_users = get_all_faces()
        if len(registered_users) == 0:
            return {
                "status": "empty_database",
                "recognized": False,
                "message": "Belum ada wajah terdaftar di database. Silakan registrasi terlebih dahulu.",
                "detections": []
            }

        detections = []
        recognized_any = False

        for face in faces:
            # Liveness check
            liveness = check_liveness(img, face.bbox)
            if require_liveness and not liveness["is_live"]:
                detections.append({
                    "recognized": False,
                    "name": "Spoofing Detected",
                    "user_id": "UNKNOWN",
                    "similarity": 0.0,
                    "liveness": liveness,
                    "box": [int(b) for b in face.bbox],
                    "age": int(face.age),
                    "gender": "Male" if face.gender == 1 else "Female"
                })
                continue

            # Compare embedding against database
            query_emb = face.normed_embedding
            best_match = None
            best_sim = -1.0

            for reg_user in registered_users:
                sim = compute_similarity(query_emb, reg_user["embedding"])
                if sim > best_sim:
                    best_sim = sim
                    best_match = reg_user

            if best_match and best_sim >= threshold:
                recognized_any = True
                # Record attendance log automatically
                log = save_attendance(
                    user_id=best_match["user_id"],
                    name=best_match["name"],
                    similarity=best_sim,
                    status="Present"
                )
                detections.append({
                    "recognized": True,
                    "user_id": best_match["user_id"],
                    "name": best_match["name"],
                    "department": best_match["department"],
                    "similarity": round(float(best_sim), 4),
                    "liveness": liveness,
                    "box": [int(b) for b in face.bbox],
                    "age": int(face.age),
                    "gender": "Male" if face.gender == 1 else "Female",
                    "log_id": log["id"]
                })
            else:
                detections.append({
                    "recognized": False,
                    "user_id": "UNKNOWN",
                    "name": "Unknown",
                    "similarity": round(float(best_sim), 4) if best_sim > 0 else 0.0,
                    "liveness": liveness,
                    "box": [int(b) for b in face.bbox],
                    "age": int(face.age),
                    "gender": "Male" if face.gender == 1 else "Female"
                })

        return {
            "status": "success",
            "recognized": recognized_any,
            "total_faces": len(faces),
            "detections": detections
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Terjadi kesalahan pengenalan: {str(e)}")
