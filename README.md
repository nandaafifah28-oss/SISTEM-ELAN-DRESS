# 👗 ÉLAN — Dress Rental & Accounting System

### Sistem Informasi Penyewaan Dress dan Pencatatan Keuangan

**ÉLAN** adalah aplikasi berbasis web untuk mengelola inventaris dress, transaksi penyewaan, pembayaran, pengembalian, denda, dan laporan penerimaan kas secara terintegrasi menggunakan PostgreSQL melalui Supabase.

[![Buka Sistem ÉLAN](https://img.shields.io/badge/✨_KLIK_DI_SINI_UNTUK_BUKA_SISTEM-C08A58?style=for-the-badge&labelColor=3B302A)](https://nandaafifah28-oss.github.io/SISTEM-ELAN-DRESS/)
---

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![HTML5](https://img.shields.io/badge/HTML5-Frontend-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Status](https://img.shields.io/badge/Status-Project%20Development-C08A58?style=for-the-badge)](#)

---

### ✨ *“Elegance in Every Rental, Clarity in Every Transaction.”*

---

## 📖 Tentang Proyek

**ÉLAN Dress Rental & Accounting System** merupakan aplikasi yang dirancang untuk membantu usaha penyewaan dress mengelola kegiatan operasional dan pencatatan keuangan secara lebih terstruktur.

Sistem mengintegrasikan data dress, transaksi penyewaan, pembayaran, pengembalian, dan denda dalam satu aplikasi. Setiap pembayaran dicatat berdasarkan transaksi aktual sehingga penerimaan kas dapat dibedakan dari tagihan penyewaan maupun denda yang baru dikenakan.

Proyek ini mengimplementasikan konsep sistem informasi akuntansi melalui pengelolaan data transaksi berbasis basis data relasional, validasi pembayaran, relasi antartabel, serta penyajian laporan operasional dan penerimaan kas.

## Identitas Pengembang

| Informasi | Keterangan |
|---|---|
| Nama | Nanda Afifah |
| NIM | 12030124140259 |
| Program Studi | Akuntansi |
| Fakultas | Ekonomika dan Bisnis (FEB) |
| Universitas | Universitas Diponegoro (UNDIP) |

---

## ✨ Fitur Utama

### 📊 Dashboard

Menyediakan ringkasan kondisi inventaris dress dalam tiga indikator utama:

- **Total Dress** — jumlah seluruh dress yang tercatat.
- **Tersedia** — jumlah dress yang dapat disewa.
- **Disewa** — jumlah dress yang sedang digunakan dalam transaksi penyewaan.

Dashboard terhubung dengan data aktual aplikasi agar ringkasan inventaris mengikuti perubahan data.

### 👗 Data Dress

Pengelolaan inventaris dress yang mencakup pencatatan identitas dress, kode, informasi harga, dan status ketersediaan sesuai struktur data yang digunakan aplikasi.

### 📝 Penyewaan

Pencatatan transaksi penyewaan dengan referensi kode penyewaan, informasi pelanggan, tanggal penyewaan, rencana pengembalian, dan nilai tagihan.

Sistem mendukung pencatatan uang muka (DP) saat penyewaan jika fitur tersebut diaktifkan pada form transaksi.

### 💳 Pembayaran

Pencatatan pembayaran pelanggan yang terhubung dengan transaksi penyewaan, meliputi:

- Pembayaran DP.
- Pembayaran cicilan.
- Pelunasan tagihan.
- Pembayaran denda keterlambatan.
- Pembayaran denda kerusakan atau kehilangan.

Setiap pembayaran yang berhasil dicatat menjadi dasar perhitungan penerimaan kas. Pembayaran yang dibatalkan tidak dihitung sebagai kas yang diterima.

### 🔄 Pengembalian

Pencatatan pengembalian dress berdasarkan penyewaan asal, tanggal kembali, kondisi dress, serta keterlambatan pengembalian.

Hasil pemeriksaan pengembalian menjadi dasar penetapan denda apabila terdapat keterlambatan, kerusakan, atau kehilangan.

### ⚠️ Pengelolaan Denda

Sistem membedakan denda yang dikenakan dari pembayaran denda yang benar-benar diterima.

Status tagihan denda ditentukan berdasarkan jumlah denda dan pembayaran yang berhasil, yaitu:

- **Belum Dibayar**
- **Dibayar Sebagian**
- **Lunas**

Pembayaran denda dikaitkan dengan penyewaan dan kategori denda yang sesuai agar saldo tagihan dapat dihitung secara konsisten.

### 📈 Laporan

Menyajikan informasi penerimaan kas berdasarkan pembayaran yang berhasil dicatat pada periode yang dipilih.

Laporan membedakan penerimaan kas dari nilai tagihan, pendapatan yang diakui, dan denda yang belum dibayar. Cakupan laporan mengikuti jenis transaksi yang benar-benar didukung dan tercatat dalam database.

### 🧾 Nota Pembayaran

Menyediakan bukti transaksi pembayaran yang dapat dibuka setelah pembayaran berhasil disimpan. Nota dapat digunakan untuk mencetak struk atau menyimpan dokumen melalui fitur cetak browser dengan opsi *Save as PDF*.

### 💬 Integrasi WhatsApp

Tombol WhatsApp membuka percakapan dengan template pesan yang dapat diperiksa dan disunting oleh admin sebelum dikirim. Pengiriman pesan dilakukan secara manual melalui WhatsApp, bukan otomatis dari aplikasi.

---

## 🎨 Tema & Desain

ÉLAN menggunakan pendekatan visual yang elegan dan minimalis, menyesuaikan karakter usaha penyewaan dress.

| Elemen | Identitas visual |
|---|---|
| 🤎 Cokelat hangat | Aksen utama dan tombol |
| 🤍 Cream | Latar belakang halaman |
| ✨ Gold lembut | Detail dan aksen visual |
| 🖋️ Tipografi elegan | Judul dan identitas merek |

Desain antarmuka dibuat untuk mendukung pengelolaan transaksi yang jelas, navigasi yang mudah dipahami, dan tampilan yang konsisten antarmodul.

---

## 🛠️ Teknologi

| Layer | Teknologi |
|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | Node.js 18+ |
| **Database** | PostgreSQL |
| **Database Platform** | Supabase |
| **API** | REST API pada backend Node.js |
| **Dokumentasi Database** | SQL |

Aplikasi menggunakan JavaScript bawaan Node.js sesuai implementasi backend yang tersedia, tanpa kebutuhan package tambahan berdasarkan konfigurasi proyek saat ini.

---

## 🗄️ Arsitektur Basis Data

Database ÉLAN menggunakan PostgreSQL melalui Supabase. Tabel utama yang digunakan adalah:

| Tabel | Fungsi |
|---|---|
| `dresses` | Menyimpan data inventaris dress |
| `rentals` | Menyimpan transaksi penyewaan dan data pelanggan sesuai skema |
| `payments` | Menyimpan transaksi pembayaran sewa dan denda |
| `returns` | Menyimpan data pengembalian dan informasi denda |
| `code_counters` | Mendukung pengelolaan urutan kode transaksi |

Relasi utama antartabel:

- `rentals.id_dress` mengacu pada `dresses.id_dress`.
- `payments.id_penyewaan` mengacu pada `rentals.id_penyewaan`.
- `returns.id_penyewaan` mengacu pada `rentals.id_penyewaan`.

Relasi tersebut menjaga keterkaitan antara inventaris, transaksi penyewaan, pembayaran, dan pengembalian.

### Integritas Data

- Kode transaksi dibuat menggunakan format `PREFIX-DDMMYY-0001`.
- Penghitung kode dikelola melalui database.
- Validasi backend digunakan untuk menjaga konsistensi nominal dan status pembayaran.
- Relasi foreign key menjaga referensi transaksi.
- Perhitungan sisa tagihan denda didasarkan pada denda yang dikenakan dan pembayaran denda yang berhasil.

Struktur tabel dan detail implementasi mengikuti file `database/schema.sql`.

---

## 📂 Struktur Proyek

```text
ELAN-DRESS-RENTAL/
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── backend/
│   └── config.js
├── database/
│   └── schema.sql
└── README.md
```

Keterangan:

- `frontend/index.html` — struktur halaman aplikasi.
- `frontend/app.js` — logika antarmuka dan komunikasi dengan API.
- `frontend/style.css` — gaya visual aplikasi.
- `backend/config.js` — backend Node.js, endpoint API, dan koneksi Supabase.
- `database/schema.sql` — definisi dan penyesuaian skema database.
- `README.md` — dokumentasi proyek.

---

## 🚀 Cara Menjalankan

### Prasyarat

- Node.js versi 18 atau lebih baru.
- Python untuk menjalankan server frontend lokal, atau ekstensi Live Server di VS Code.
- Akun dan project Supabase.
- Browser modern seperti Chrome, Edge, atau Firefox.

### 1. Konfigurasi Supabase

1. Buat project di [Supabase](https://supabase.com/).
2. Buka menu **SQL Editor**.
3. Jalankan isi file `database/schema.sql` sesuai petunjuk dan kondisi database.
4. Pastikan backend menggunakan URL dan key Supabase yang sesuai dengan project.
5. Jangan pernah menaruh secret/service-role key pada frontend atau repository publik.

Jika project sudah memakai skema lama dan aplikasi menampilkan `permission denied for table dresses`, terapkan ulang versi terbaru `database/schema.sql` pada SQL Editor. Kebijakan RLS saja tidak cukup; role `anon` juga membutuhkan hak tabel yang sekarang diberikan oleh skema tersebut.

**Penting:** `backend/config.js` adalah satu-satunya komponen yang mengakses Supabase. Backend menerima `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` (atau `SUPABASE_PUBLISHABLE_KEY`) dari environment. Jangan memasukkan secret/service-role key ke frontend, repository publik, atau dokumentasi.

### 2. Jalankan Backend

Buka terminal PowerShell pada direktori utama proyek.

Atur URL project dan key Supabase untuk sesi terminal saat ini. Gunakan service-role key hanya di backend dan jangan membagikannya:

```powershell
$env:SUPABASE_URL = "https://<project-ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key>"
$env:PORT = "3001"
node .\backend\config.js
```

Backend API berjalan pada:

```text
http://127.0.0.1:3001
```

Biarkan terminal backend tetap berjalan.

### 3. Jalankan Frontend

Buka terminal PowerShell kedua dari direktori utama proyek:

```powershell
python -m http.server 5500 --directory .\frontend
```

Buka aplikasi melalui browser:

```text
http://localhost:5500
```

Frontend selalu mengirim request ke backend lokal `http://127.0.0.1:3001/api`; alamat ini ditetapkan langsung di `frontend/app.js` dan tidak dapat diganti melalui konfigurasi runtime. Karena itu, browser harus berjalan pada komputer yang sama dengan backend. Jika frontend di-host di internet atau diakses dari perangkat lain, `127.0.0.1` akan menunjuk ke perangkat browser, bukan server aplikasi, sehingga API lokal tidak dapat dijangkau.

### 4. Verifikasi Koneksi

Jika backend menyediakan endpoint health check, gunakan endpoint tersebut untuk memastikan server merespons. Periksa terminal backend dan Console browser apabila aplikasi gagal mengambil atau menyimpan data.

> **Catatan:** alamat `127.0.0.1` hanya merujuk ke komputer yang menjalankan browser. Jika frontend diakses melalui hosting publik, backend juga harus tersedia melalui alamat yang dapat diakses publik dan dikonfigurasi dengan aman.

---

## 💰 Logika Pembayaran dan Penerimaan Kas

ÉLAN membedakan nilai tagihan dari kas yang benar-benar diterima.

### Pembayaran Sewa

Pembayaran sewa dapat berupa DP, cicilan, atau pelunasan sesuai fitur yang tersedia.

- Setiap pembayaran memiliki kode transaksi tersendiri.
- Pelunasan harus mengikuti sisa tagihan yang belum dibayar.
- Pembayaran yang berhasil dihitung satu kali dalam penerimaan kas.
- Pembayaran yang dibatalkan tetap dapat memiliki riwayat, tetapi tidak dihitung sebagai penerimaan kas.

### Pembayaran Denda

Denda ditetapkan berdasarkan hasil pengembalian. Denda yang baru dicatat belum otomatis menjadi kas masuk.

Kategori pembayaran denda dibedakan menjadi:

- `Keterlambatan`
- `Kerusakan/Kehilangan`

Pembayaran denda mengurangi sisa tagihan pada kategori yang sesuai. Nominal yang dibayar tidak boleh melebihi sisa denda yang masih terutang.

### Penerimaan Kas

Penerimaan kas dihitung dari transaksi pada tabel `payments` yang berstatus **Berhasil**, berdasarkan tanggal uang diterima (`tanggal_bayar`) dan periode laporan yang dipilih.

Cakupannya meliputi pembayaran DP, cicilan, pelunasan, dan denda yang benar-benar telah dibayar.

Secara konseptual:

**Penerimaan Kas = Pembayaran Sewa Berhasil + Pembayaran Denda Berhasil**

Denda yang baru dikenakan, tagihan yang belum dibayar, dan transaksi yang dibatalkan tidak masuk dalam perhitungan tersebut.

Sistem saat ini belum mencakup modul terpisah untuk jurnal akuntansi, setoran modal, penerimaan kas lain, atau pengembalian dana. Oleh karena itu, laporan penerimaan kas tidak mewakili seluruh arus kas usaha.

---

## 📝 Catatan Pengembangan

- Database harus dikonfigurasi sebelum endpoint yang memerlukan akses data digunakan.
- Struktur database yang sudah ada harus diperiksa sebelum menjalankan ulang skrip perubahan skema.
- Jangan menghapus data transaksi atau data master ketika melakukan pembaruan aplikasi kecuali reset memang diperlukan.
- Perhitungan Dashboard, Pembayaran, Pengembalian, dan Laporan harus menggunakan sumber data serta definisi bisnis yang konsisten.
- Fitur yang belum tersedia tidak boleh dianggap telah berjalan hanya berdasarkan dokumentasi.

---

## 👩‍💻 Pengembangan

ÉLAN dikembangkan oleh **Nanda Afifah** (12030124140259), Program Studi Akuntansi, Fakultas Ekonomika dan Bisnis, Universitas Diponegoro, sebagai proyek sistem informasi penyewaan dan pencatatan keuangan berbasis web dengan fokus pada integrasi basis data relasional, validasi transaksi, serta penyajian informasi operasional dan penerimaan kas.

**ÉLAN — Dress Rental & Accounting System**

*Elegance in Every Rental, Clarity in Every Transaction.*
