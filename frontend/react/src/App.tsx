import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  UserCheck,
  UserPlus,
  History,
  ShieldCheck,
  Users,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Sparkles,
  Settings,
  ScanLine
} from 'lucide-react';
import confetti from 'canvas-confetti';
import Swal from 'sweetalert2';

const API_BASE = 'http://localhost:8080/api';

interface User {
  user_id: string;
  name: string;
  department: string;
  created_at: string;
}

interface AttendanceLog {
  id: number;
  user_id: string;
  name: string;
  similarity: number;
  status: string;
  timestamp: string;
}

interface DetectionResult {
  recognized: boolean;
  user_id: string;
  name: string;
  department?: string;
  similarity: number;
  box: [number, number, number, number];
  age?: number;
  gender?: string;
  liveness?: {
    is_live: boolean;
    score: number;
    reason: string;
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'attendance' | 'register' | 'users' | 'logs'>('attendance');
  const [gatewayStatus, setGatewayStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  // Camera & Recognition State
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isAutoScanning, setIsAutoScanning] = useState<boolean>(false);
  const [threshold, setThreshold] = useState<number>(0.45);
  const [requireLiveness, setRequireLiveness] = useState<boolean>(true);
  const [lastRecognition, setLastRecognition] = useState<DetectionResult | null>(null);
  const [recognitionAlert, setRecognitionAlert] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; message: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Registration Form State
  const [regUserId, setRegUserId] = useState('');
  const [regName, setRegName] = useState('');
  const [regDepartment, setRegDepartment] = useState('Engineering');
  const [regStatus, setRegStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);

  // Data lists
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const lastAlertUserRef = useRef<{ userId: string; time: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  // Check Health
  const checkHealth = async () => {
    try {
      const res = await fetch('http://localhost:8080/health');
      if (res.ok) {
        setGatewayStatus('connected');
      } else {
        setGatewayStatus('error');
      }
    } catch {
      setGatewayStatus('error');
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/users`);
      const data = await res.json();
      if (data.status === 'success') {
        setUsers(data.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/attendance/logs`);
      const data = await res.json();
      if (data.status === 'success') {
        setLogs(data.data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm(`Yakin ingin menghapus user ${userId}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/users/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchUsers();
      }
    } catch (e) {
      alert('Gagal menghapus user');
    }
  };

  useEffect(() => {
    checkHealth();
    fetchUsers();
    fetchLogs();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  // Camera Management
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
    } catch (err) {
      alert('Gagal mengakses kamera. Pastikan izin kamera telah diberikan di browser.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsAutoScanning(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    clearOverlay();
  };

  const clearOverlay = () => {
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
      }
    }
  };

  const drawBoundingBox = (detection: DetectionResult) => {
    if (!overlayCanvasRef.current || !videoRef.current) return;
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / (video.videoWidth || 640);
    const scaleY = canvas.height / (video.videoHeight || 480);

    const [x1, y1, x2, y2] = detection.box;
    const bx = x1 * scaleX;
    const by = y1 * scaleY;
    const bw = (x2 - x1) * scaleX;
    const bh = (y2 - y1) * scaleY;

    ctx.lineWidth = 3;
    ctx.strokeStyle = detection.recognized ? '#10B981' : (detection.liveness && !detection.liveness.is_live ? '#EF4444' : '#F59E0B');
    ctx.strokeRect(bx, by, bw, bh);

    // Label
    const text = detection.recognized
      ? `${detection.name} (${Math.round(detection.similarity * 100)}%)`
      : (detection.liveness && !detection.liveness.is_live ? 'Fake / Spoof' : 'Unknown');

    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = 'bold 14px Inter, sans-serif';
    const textWidth = ctx.measureText(text).width;
    ctx.fillRect(bx, by - 24 > 0 ? by - 24 : by, textWidth + 12, 22);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, bx + 6, by - 24 > 0 ? by - 8 : by + 16);
  };

  const captureFrameBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!videoRef.current) return resolve(null);
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
    });
  };

  // Perform Face Recognition
  const performRecognition = useCallback(async () => {
    if (!isCameraActive || isProcessing) return;
    const blob = await captureFrameBlob();
    if (!blob) return;

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', blob, 'capture.jpg');
      formData.append('threshold', threshold.toString());
      formData.append('require_liveness', requireLiveness ? 'true' : 'false');

      const res = await fetch(`${API_BASE}/face/recognize`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.status === 'no_face') {
        clearOverlay();
        setRecognitionAlert({ type: 'info', message: 'Mencari wajah di depan kamera...' });
      } else if (data.status === 'empty_database') {
        clearOverlay();
        setRecognitionAlert({ type: 'warning', message: 'Belum ada data wajah terdaftar. Silakan registrasi terlebih dahulu.' });
      } else if (data.detections && data.detections.length > 0) {
        const det: DetectionResult = data.detections[0];
        setLastRecognition(det);
        drawBoundingBox(det);

        if (det.recognized) {
          setRecognitionAlert({
            type: 'success',
            message: `Absensi Berhasil! Selamat datang, ${det.name} (${det.department || 'Staff'})!`
          });

          // Show SweetAlert2 popup (with 5 seconds cooldown per user)
          const now = Date.now();
          if (!lastAlertUserRef.current || lastAlertUserRef.current.userId !== det.user_id || (now - lastAlertUserRef.current.time > 5000)) {
            lastAlertUserRef.current = { userId: det.user_id, time: now };

            Swal.fire({
              title: 'Presensi Berhasil!',
              html: `
                <div style="text-align: center; margin-top: 10px;">
                  <h3 style="margin: 0; color: #1E293B; font-size: 20px;">${det.name}</h3>
                  <p style="margin: 4px 0 12px 0; color: #64748B; font-size: 14px;">ID: <strong>${det.user_id}</strong> | Divisi: <strong>${det.department || 'General'}</strong></p>
                  <div style="background: #ECFDF5; border: 1px solid #A7F3D0; padding: 10px; border-radius: 8px; color: #065F46; font-size: 13px;">
                    ✨ Kemiripan Wajah: <strong>${(det.similarity * 100).toFixed(1)}%</strong> (Terverifikasi)
                  </div>
                </div>
              `,
              icon: 'success',
              timer: 3000,
              timerProgressBar: true,
              showConfirmButton: false,
              backdrop: `rgba(15, 23, 42, 0.4)`
            });
          }

          confetti({
            particleCount: 60,
            spread: 60,
            origin: { y: 0.8 }
          });
          fetchLogs();
        } else if (det.liveness && !det.liveness.is_live) {
          setRecognitionAlert({
            type: 'error',
            message: `Anti-Spoofing Peringatan: ${det.liveness.reason}`
          });
        } else {
          setRecognitionAlert({
            type: 'warning',
            message: `Wajah terdeteksi tetapi tidak cocok (Kemiripan: ${Math.round(det.similarity * 100)}%)`
          });
        }
      }
    } catch (err: any) {
      setRecognitionAlert({ type: 'error', message: 'Gagal menghubungi Gateway API' });
    } finally {
      setIsProcessing(false);
    }
  }, [isCameraActive, isProcessing, threshold, requireLiveness]);

  // Auto Scan Loop
  useEffect(() => {
    if (isAutoScanning && isCameraActive) {
      scanIntervalRef.current = window.setInterval(() => {
        performRecognition();
      }, 2000);
    } else {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    }
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [isAutoScanning, isCameraActive, performRecognition]);

  // Handle Face Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUserId || !regName) {
      setRegStatus({ type: 'error', message: 'User ID dan Nama lengkap wajib diisi!' });
      return;
    }

    if (!isCameraActive) {
      setRegStatus({ type: 'error', message: 'Buka kamera terlebih dahulu untuk mengambil foto wajah!' });
      return;
    }

    const blob = await captureFrameBlob();
    if (!blob) {
      setRegStatus({ type: 'error', message: 'Gagal mengambil gambar dari kamera.' });
      return;
    }

    setIsRegistering(true);
    setRegStatus(null);

    try {
      const formData = new FormData();
      formData.append('user_id', regUserId);
      formData.append('name', regName);
      formData.append('department', regDepartment);
      formData.append('file', blob, 'register.jpg');

      const res = await fetch(`${API_BASE}/face/register`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setRegStatus({
          type: 'success',
          message: `Berhasil mendaftarkan wajah ${regName} (${regUserId})! Usia perkiraan: ${data.data?.age} tahun`
        });
        setRegUserId('');
        setRegName('');
        fetchUsers();
        confetti();
      } else {
        setRegStatus({
          type: 'error',
          message: data.detail || data.message || 'Gagal mendaftarkan wajah'
        });
      }
    } catch {
      setRegStatus({ type: 'error', message: 'Gagal menghubungi server' });
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Top Header */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={styles.logoBadge}>
              <ScanLine size={24} color="#6366F1" />
            </div>
            <div>
              <h1 style={styles.title}>FacePass AI Attendance</h1>
              <p style={styles.subtitle}>InsightFace ArcFace Engine + Go Gateway + React Web</p>
            </div>
          </div>

          <div style={styles.statusBadge(gatewayStatus === 'connected')}>
            <span style={styles.statusDot(gatewayStatus === 'connected')} />
            {gatewayStatus === 'connected' ? 'API Gateway Online (:8080)' : 'API Gateway Offline'}
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={styles.nav}>
          <button
            style={styles.navButton(activeTab === 'attendance')}
            onClick={() => setActiveTab('attendance')}
          >
            <UserCheck size={18} />
            Absensi Otomatis
          </button>
          <button
            style={styles.navButton(activeTab === 'register')}
            onClick={() => setActiveTab('register')}
          >
            <UserPlus size={18} />
            Registrasi Wajah
          </button>
          <button
            style={styles.navButton(activeTab === 'users')}
            onClick={() => { setActiveTab('users'); fetchUsers(); }}
          >
            <Users size={18} />
            Data User ({users.length})
          </button>
          <button
            style={styles.navButton(activeTab === 'logs')}
            onClick={() => { setActiveTab('logs'); fetchLogs(); }}
          >
            <History size={18} />
            Riwayat Absensi ({logs.length})
          </button>
        </nav>
      </header>

      {/* Main Container */}
      <main style={styles.main}>
        {/* TAB 1: ATTENDANCE & TAB 2: REGISTER share camera view */}
        {(activeTab === 'attendance' || activeTab === 'register') && (
          <div style={styles.grid}>
            {/* Left Column: Webcam Card */}
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Camera size={20} color="#4F46E5" />
                  <h2 style={styles.cardTitle}>Live Stream Kamera</h2>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {!isCameraActive ? (
                    <button style={styles.btnPrimary} onClick={startCamera}>
                      <Camera size={16} /> Nyalakan Kamera
                    </button>
                  ) : (
                    <button style={styles.btnDanger} onClick={stopCamera}>
                      <CameraOff size={16} /> Matikan Kamera
                    </button>
                  )}
                </div>
              </div>

              {/* Video Box */}
              <div style={styles.videoContainer}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={styles.video}
                />
                <canvas ref={overlayCanvasRef} style={styles.overlayCanvas} />

                {!isCameraActive && (
                  <div style={styles.videoPlaceholder}>
                    <CameraOff size={48} color="#9CA3AF" />
                    <p style={{ marginTop: '12px', color: '#6B7280', fontWeight: 500 }}>
                      Kamera sedang mati. Klik tombol "Nyalakan Kamera" di atas.
                    </p>
                  </div>
                )}

                {isProcessing && (
                  <div style={styles.processingPill}>
                    <RefreshCw size={14} className="animate-spin" /> Memproses AI...
                  </div>
                )}
              </div>

              {/* Attendance Controls */}
              {activeTab === 'attendance' && (
                <div style={styles.controlRow}>
                  <button
                    style={styles.btnAction(isAutoScanning)}
                    disabled={!isCameraActive}
                    onClick={() => setIsAutoScanning(!isAutoScanning)}
                  >
                    <Sparkles size={18} />
                    {isAutoScanning ? 'Hentikan Auto Scan (2s)' : 'Mulai Auto Scan Absensi'}
                  </button>
                  <button
                    style={styles.btnSecondary}
                    disabled={!isCameraActive || isProcessing}
                    onClick={() => performRecognition()}
                  >
                    <ScanLine size={18} />
                    Scan Wajah Sekali
                  </button>
                </div>
              )}

              {/* Recognition Alert Banner */}
              {recognitionAlert && (
                <div style={styles.alert(recognitionAlert.type)}>
                  {recognitionAlert.type === 'success' && <CheckCircle2 size={20} color="#059669" />}
                  {recognitionAlert.type === 'error' && <AlertTriangle size={20} color="#DC2626" />}
                  {recognitionAlert.type === 'warning' && <AlertTriangle size={20} color="#D97706" />}
                  {recognitionAlert.type === 'info' && <RefreshCw size={20} color="#2563EB" />}
                  <span style={{ fontSize: '14px', fontWeight: 500 }}>{recognitionAlert.message}</span>
                </div>
              )}
            </div>

            {/* Right Column: Settings & Dynamic Panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {activeTab === 'attendance' ? (
                <>
                  {/* Latest Match Info Card */}
                  <div style={styles.card}>
                    <div style={styles.cardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <UserCheck size={20} color="#10B981" />
                        <h2 style={styles.cardTitle}>Status Deteksi Terakhir</h2>
                      </div>
                    </div>

                    {lastRecognition ? (
                      <div style={styles.detectionCard}>
                        <div style={styles.detectionRow}>
                          <span style={styles.label}>Nama User:</span>
                          <span style={styles.valueHighlight}>{lastRecognition.name}</span>
                        </div>
                        <div style={styles.detectionRow}>
                          <span style={styles.label}>ID Karyawan:</span>
                          <span style={styles.value}>{lastRecognition.user_id}</span>
                        </div>
                        <div style={styles.detectionRow}>
                          <span style={styles.label}>Tingkat Kecocokan:</span>
                          <span style={styles.value}>
                            {(lastRecognition.similarity * 100).toFixed(1)}% (ArcFace Cosine)
                          </span>
                        </div>
                        {lastRecognition.age && (
                          <div style={styles.detectionRow}>
                            <span style={styles.label}>Perkiraan Usia & Gender:</span>
                            <span style={styles.value}>
                              {lastRecognition.age} thn / {lastRecognition.gender}
                            </span>
                          </div>
                        )}
                        <div style={styles.detectionRow}>
                          <span style={styles.label}>Anti-Spoofing:</span>
                          <span style={{
                            fontWeight: 600,
                            color: lastRecognition.liveness?.is_live ? '#059669' : '#DC2626'
                          }}>
                            {lastRecognition.liveness?.is_live ? '✅ Liveness Verified' : '❌ Spoof / Fake Face'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p style={{ color: '#9CA3AF', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
                        Belum ada data scan. Arahkan wajah ke kamera dan lakukan scan.
                      </p>
                    )}
                  </div>

                  {/* AI Model Settings */}
                  <div style={styles.card}>
                    <div style={styles.cardHeader}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Settings size={20} color="#6366F1" />
                        <h2 style={styles.cardTitle}>Konfigurasi AI Engine</h2>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <label style={styles.label}>Threshold Kemiripan ({Math.round(threshold * 100)}%)</label>
                          <span style={{ fontSize: '12px', color: '#6B7280' }}>Rekomendasi: 45% - 50%</span>
                        </div>
                        <input
                          type="range"
                          min="0.30"
                          max="0.80"
                          step="0.05"
                          value={threshold}
                          onChange={(e) => setThreshold(parseFloat(e.target.value))}
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <ShieldCheck size={18} color="#10B981" />
                          <span style={{ fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                            Aktifkan Liveness & Anti-Spoofing
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={requireLiveness}
                          onChange={(e) => setRequireLiveness(e.target.checked)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* TAB 2: REGISTER FORM */
                <div style={styles.card}>
                  <div style={styles.cardHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <UserPlus size={20} color="#4F46E5" />
                      <h2 style={styles.cardTitle}>Form Registrasi Wajah Baru</h2>
                    </div>
                  </div>

                  <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label style={styles.label}>User ID / NIK / NIM *</label>
                      <input
                        type="text"
                        placeholder="Contoh: USR-001"
                        value={regUserId}
                        onChange={(e) => setRegUserId(e.target.value)}
                        style={styles.input}
                        required
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Nama Lengkap *</label>
                      <input
                        type="text"
                        placeholder="Contoh: Ahmad Gozali"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        style={styles.input}
                        required
                      />
                    </div>

                    <div>
                      <label style={styles.label}>Departemen / Divisi</label>
                      <select
                        value={regDepartment}
                        onChange={(e) => setRegDepartment(e.target.value)}
                        style={styles.input}
                      >
                        <option value="Engineering">Engineering / IT</option>
                        <option value="Human Resource">Human Resource (HR)</option>
                        <option value="Finance">Finance & Accounting</option>
                        <option value="Marketing">Marketing & Sales</option>
                        <option value="Operations">Operations</option>
                        <option value="General">General Staff</option>
                      </select>
                    </div>

                    <div style={{ backgroundColor: '#F3F4F6', padding: '12px', borderRadius: '8px', fontSize: '13px', color: '#4B5563' }}>
                      💡 <strong>Petunjuk:</strong> Posisikan wajah Anda tepat di tengah bingkai kamera dengan pencahayaan yang cukup sebelum menekan tombol simpan.
                    </div>

                    <button
                      type="submit"
                      disabled={isRegistering || !isCameraActive}
                      style={styles.btnSubmit(isRegistering || !isCameraActive)}
                    >
                      {isRegistering ? (
                        <>
                          <RefreshCw size={18} className="animate-spin" /> Mendaftarkan Wajah...
                        </>
                      ) : (
                        <>
                          <UserPlus size={18} /> Ambil Foto & Daftarkan Wajah
                        </>
                      )}
                    </button>

                    {regStatus && (
                      <div style={styles.alert(regStatus.type)}>
                        {regStatus.type === 'success' ? <CheckCircle2 size={18} color="#059669" /> : <AlertTriangle size={18} color="#DC2626" />}
                        <span style={{ fontSize: '13px' }}>{regStatus.message}</span>
                      </div>
                    )}
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: REGISTERED USERS LIST */}
        {activeTab === 'users' && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} color="#4F46E5" />
                <h2 style={styles.cardTitle}>Daftar Pengguna Terdaftar ({users.length})</h2>
              </div>
              <button style={styles.btnSecondary} onClick={fetchUsers}>
                <RefreshCw size={16} /> Refresh
              </button>
            </div>

            {users.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>
                <Users size={48} style={{ margin: '0 auto 12px' }} />
                <p>Belum ada pengguna terdaftar.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>User ID</th>
                      <th style={styles.th}>Nama Lengkap</th>
                      <th style={styles.th}>Departemen</th>
                      <th style={styles.th}>Waktu Terdaftar</th>
                      <th style={styles.th}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.user_id}>
                        <td style={styles.td}><strong>{u.user_id}</strong></td>
                        <td style={styles.td}>{u.name}</td>
                        <td style={styles.td}>
                          <span style={styles.deptBadge}>{u.department}</span>
                        </td>
                        <td style={styles.td}>{new Date(u.created_at).toLocaleString('id-ID')}</td>
                        <td style={styles.td}>
                          <button
                            style={styles.btnTrash}
                            onClick={() => deleteUser(u.user_id)}
                            title="Hapus User"
                          >
                            <Trash2 size={16} color="#DC2626" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ATTENDANCE LOGS */}
        {activeTab === 'logs' && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={20} color="#4F46E5" />
                <h2 style={styles.cardTitle}>Riwayat Log Absensi</h2>
              </div>
              <button style={styles.btnSecondary} onClick={fetchLogs}>
                <RefreshCw size={16} /> Refresh Log
              </button>
            </div>

            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#9CA3AF' }}>
                <History size={48} style={{ margin: '0 auto 12px' }} />
                <p>Belum ada riwayat absensi.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>ID Log</th>
                      <th style={styles.th}>User ID</th>
                      <th style={styles.th}>Nama</th>
                      <th style={styles.th}>Tingkat Kemiripan</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>Waktu Absen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td style={styles.td}>#{log.id}</td>
                        <td style={styles.td}><strong>{log.user_id}</strong></td>
                        <td style={styles.td}>{log.name}</td>
                        <td style={styles.td}>
                          <span style={{ color: '#059669', fontWeight: 600 }}>
                            {(log.similarity * 100).toFixed(1)}%
                          </span>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.statusPresent}>Hadir (Present)</span>
                        </td>
                        <td style={styles.td}>{new Date(log.timestamp).toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Hidden Canvas for capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

// Inline Styles
const styles: { [key: string]: any } = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#F8FAFC',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    color: '#1E293B',
    paddingBottom: '40px'
  },
  header: {
    backgroundColor: '#FFFFFF',
    borderBottom: '1px solid #E2E8F0',
    padding: '16px 24px 0 24px',
    position: 'sticky',
    top: 0,
    zIndex: 50,
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  logoBadge: {
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    backgroundColor: '#EEF2FF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    fontSize: '20px',
    fontWeight: 700,
    margin: 0,
    color: '#0F172A',
    letterSpacing: '-0.025em'
  },
  subtitle: {
    fontSize: '13px',
    color: '#64748B',
    margin: '2px 0 0 0'
  },
  statusBadge: (online: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: online ? '#ECFDF5' : '#FEF2F2',
    color: online ? '#065F46' : '#991B1B',
    border: `1px solid ${online ? '#A7F3D0' : '#FECACA'}`
  }),
  statusDot: (online: boolean) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: online ? '#10B981' : '#EF4444'
  }),
  nav: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    gap: '8px'
  },
  navButton: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 18px',
    fontSize: '14px',
    fontWeight: 600,
    backgroundColor: 'transparent',
    border: 'none',
    borderBottom: active ? '2px solid #4F46E5' : '2px solid transparent',
    color: active ? '#4F46E5' : '#64748B',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  }),
  main: {
    maxWidth: '1200px',
    margin: '24px auto 0 auto',
    padding: '0 24px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 0.8fr',
    gap: '24px'
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: '12px',
    border: '1px solid #E2E8F0',
    padding: '20px',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#1E293B',
    margin: 0
  },
  videoContainer: {
    position: 'relative',
    width: '100%',
    height: '380px',
    backgroundColor: '#0F172A',
    borderRadius: '10px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  overlayCanvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none'
  },
  videoPlaceholder: {
    position: 'absolute',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '20px'
  },
  processingPill: {
    position: 'absolute',
    top: '12px',
    right: '12px',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    color: '#FFFFFF',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  controlRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px'
  },
  btnPrimary: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#4F46E5',
    color: '#FFFFFF',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  btnDanger: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#EF4444',
    color: '#FFFFFF',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  btnAction: (active: boolean) => ({
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    backgroundColor: active ? '#DC2626' : '#10B981',
    color: '#FFFFFF',
    border: 'none',
    padding: '12px 18px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  }),
  btnSecondary: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#F1F5F9',
    color: '#334155',
    border: '1px solid #CBD5E1',
    padding: '10px 16px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  btnSubmit: (disabled: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    backgroundColor: disabled ? '#9CA3AF' : '#4F46E5',
    color: '#FFFFFF',
    border: 'none',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer'
  }),
  alert: (type: string) => ({
    marginTop: '16px',
    padding: '12px 16px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    backgroundColor:
      type === 'success' ? '#ECFDF5' :
      type === 'error' ? '#FEF2F2' :
      type === 'warning' ? '#FFFBEB' : '#EFF6FF',
    color:
      type === 'success' ? '#065F46' :
      type === 'error' ? '#991B1B' :
      type === 'warning' ? '#92400E' : '#1E40AF',
    border: `1px solid ${
      type === 'success' ? '#A7F3D0' :
      type === 'error' ? '#FECACA' :
      type === 'warning' ? '#FDE68A' : '#BFDBFE'
    }`
  }),
  detectionCard: {
    backgroundColor: '#F8FAFC',
    border: '1px solid #E2E8F0',
    borderRadius: '8px',
    padding: '14px'
  },
  detectionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px dashed #E2E8F0',
    fontSize: '14px'
  },
  label: {
    color: '#64748B',
    fontWeight: 500,
    fontSize: '13px'
  },
  value: {
    color: '#1E293B',
    fontWeight: 600
  },
  valueHighlight: {
    color: '#4F46E5',
    fontWeight: 700,
    fontSize: '15px'
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    fontSize: '14px',
    marginTop: '4px',
    boxSizing: 'border-box'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
    textAlign: 'left'
  },
  th: {
    backgroundColor: '#F8FAFC',
    padding: '12px 16px',
    borderBottom: '1px solid #E2E8F0',
    color: '#64748B',
    fontWeight: 600
  },
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #F1F5F9',
    color: '#334155'
  },
  deptBadge: {
    backgroundColor: '#EEF2FF',
    color: '#4F46E5',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600
  },
  statusPresent: {
    backgroundColor: '#ECFDF5',
    color: '#065F46',
    padding: '4px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600
  },
  btnTrash: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px'
  }
};
