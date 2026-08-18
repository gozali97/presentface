import sqlite3
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Tuple

DB_PATH = Path(__file__).resolve().parent.parent / "face_attendance.db"

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()

    # Faces table (users + face embeddings)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS faces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            department TEXT DEFAULT 'General',
            embedding BLOB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Attendance logs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attendance_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            similarity REAL NOT NULL,
            status TEXT DEFAULT 'Present',
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn.commit()
    conn.close()

def save_face(user_id: str, name: str, department: str, embedding: np.ndarray) -> bool:
    init_db()
    conn = get_db()
    cursor = conn.cursor()

    embedding_bytes = embedding.astype(np.float32).tobytes()

    try:
        cursor.execute('''
            INSERT INTO faces (user_id, name, department, embedding)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                name = excluded.name,
                department = excluded.department,
                embedding = excluded.embedding,
                created_at = CURRENT_TIMESTAMP
        ''', (user_id, name, department, embedding_bytes))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error saving face: {e}")
        return False
    finally:
        conn.close()

def get_all_faces() -> List[Dict]:
    init_db()
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT user_id, name, department, embedding, created_at FROM faces')
    rows = cursor.fetchall()

    faces = []
    for row in rows:
        emb = np.frombuffer(row['embedding'], dtype=np.float32)
        faces.append({
            'user_id': row['user_id'],
            'name': row['name'],
            'department': row['department'],
            'embedding': emb,
            'created_at': row['created_at']
        })

    conn.close()
    return faces

def get_users_list() -> List[Dict]:
    init_db()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT user_id, name, department, created_at FROM faces ORDER BY created_at DESC')
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def delete_user(user_id: str) -> bool:
    init_db()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM faces WHERE user_id = ?', (user_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def save_attendance(user_id: str, name: str, similarity: float, status: str = "Present") -> Dict:
    init_db()
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO attendance_logs (user_id, name, similarity, status)
        VALUES (?, ?, ?, ?)
    ''', (user_id, name, float(similarity), status))
    log_id = cursor.lastrowid
    conn.commit()

    cursor.execute('SELECT * FROM attendance_logs WHERE id = ?', (log_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row)

def get_attendance_logs(limit: int = 50) -> List[Dict]:
    init_db()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM attendance_logs ORDER BY timestamp DESC LIMIT ?', (limit,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]
