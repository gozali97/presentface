    Library Face Recognition yang kita gunakan adalah InsightFace,
  yang dikembangkan oleh tim riset AI DeepInsight (dipimpin
  oleh peneliti AI Jiankang Deng & Jia Guo dari Imperial College
  London / DeepInsight Team).

  Berikut rincian lengkapnya:

  ---

  1. Sumber Library & Model

  - Nama Library: InsightFace (Python Package: insightface)
  - Pengembang: DeepInsight Team
  - Repository Resmi: https://github.com/deepinsight/insightface
  - Inference Engine: ONNX Runtime (dikembangkan oleh Microsoft)

  ---

  2. Model AI yang Digunakan di Project Ini (buffalo_l)

  Saat sistem berjalan, InsightFace menggunakan paket model
  canggih bernama buffalo_l yang terdiri dari:

  1. RetinaFace (det_10g.onnx)
    - Fungsi: Mendeteksi lokasi wajah, posisi mata, hidung, dan
  mulut secara presisi tinggi bahkan saat wajah miring atau
  pencahayaan minim (Paper publikasi: CVPR 2020).
  2. ArcFace (w600k_r50.onnx)
    - Fungsi: Mengekstrak 512-dimensi vektor face embedding unik
  untuk setiap wajah berdasarkan algoritma Additive Angular
  Margin Loss (Paper publikasi: CVPR 2019).
    - Dilatih menggunakan dataset skala besar (WebFace600K /
  jutaan foto wajah).
  3. Landmark 2D/3D (2d106det.onnx & 1k3d68.onnx)
    - Fungsi: Menentukan titik koordinat kontur wajah dan
  orientasi kepala (membantu fitur liveness).
  4. Gender & Age (genderage.onnx)
    - Fungsi: Mengestimasi jenis kelamin dan usia pengguna
  secara otomatis.

  ---

  3. Mengapa Menggunakan InsightFace (Bukan library lama dlib /
  face_recognition)?

  ┌──────────────┬───────────────────────┬─────────────────┐
  │              │     Library Lama      │  InsightFace    │
  │ Perbandingan │ (face_recognition /   │  (Project Ini)  │
  │              │         dlib)         │                 │
  ├──────────────┼───────────────────────┼─────────────────┤
  │ Arsitektur   │ ResNet-34 / HOG       │ ArcFace +       │
  │ Model        │ (rilis ~2017)         │ RetinaFace      │
  │              │                       │ (Modern SOTA)   │
  ├──────────────┼───────────────────────┼─────────────────┤
  │              │ Standar, mudah salah  │ Sangat tinggi   │
  │ Akurasi      │ jika wajah sedikit    │ (Standar        │
  │              │ miring                │ Industri)       │
  ├──────────────┼───────────────────────┼─────────────────┤
  │ Kemudahan    │ Butuh C++ Compiler &  │ ONNX Runtime    │
  │ Install      │ CMake (sering error   │ (Siap pakai CPU │
  │              │ di Windows)           │  & GPU)         │
  ├──────────────┼───────────────────────┼─────────────────┤
  │ Kecepatan    │ Cenderung lambat      │ Sangat cepat &  │
  │              │ untuk multi-face      │ ringan          │
  ├──────────────┼───────────────────────┼─────────────────┤
  │              │                       │ Ada estimasi    │
  │ Fitur Ekstra │ Hanya deteksi &       │ usia, gender,   │
  │              │ embedding dasar       │ landmark        │
  │              │                       │ 106-titik       │
  └──────────────┴───────────────────────┴─────────────────┘

  ---

  4. Lisensi Penggunaan

  - Source code InsightFace dirilis di bawah lisensi open source
  MIT License.