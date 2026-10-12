"use strict";

const http = require("node:http");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT) || 3001;
const SUPABASE_URL = (process.env.SUPABASE_URL || "https://yuikckkxcayfliajedwb.supabase.co").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_jgv_HoorUuUg8Ok5cPDOQg_NPip4WPr";
const MAX_BODY_SIZE = 1024 * 1024;
const DENDA_PER_HARI = 50000;
const CODE_TARGETS = {
  DRS: { table: "dresses", column: "kode_dress", id: "id_dress" },
  RNT: { table: "rentals", column: "kode_penyewaan", id: "id_penyewaan" },
  PAY: { table: "payments", column: "kode_pembayaran", id: "id_pembayaran" },
  RTN: { table: "returns", column: "kode_pengembalian", id: "id_pengembalian" },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Content-Type": "application/json; charset=utf-8",
};

function send(res, status, body) {
  res.writeHead(status, CORS_HEADERS);
  res.end(status === 204 ? undefined : JSON.stringify(body));
}

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "", tooLarge = false;
    req.on("data", (c) => {
      if (tooLarge) return;
      body += c;
      if (Buffer.byteLength(body) > MAX_BODY_SIZE) { tooLarge = true; body = ""; }
    });
    req.on("end", () => {
      if (tooLarge) return reject(fail("Body terlalu besar.", 413));
      if (!body) return resolve({});
      try {
        const v = JSON.parse(body);
        if (!v || Array.isArray(v) || typeof v !== "object") throw new Error();
        resolve(v);
      } catch { reject(fail("Body JSON tidak valid.", 400)); }
    });
    req.on("error", reject);
  });
}

function requireConfig() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw fail("Backend belum dikonfigurasi. Atur SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.", 503);
  }
}

async function supabase(path, options = {}) {
  requireConfig();
  let r;
  try {
    r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: options.method || "GET",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: options.prefer || "return=representation",
        ...(options.headers || {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (e) {
    throw fail(`Tidak dapat terhubung ke Supabase: ${e.message}`, 502);
  }
  const text = await r.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { throw fail("Respons Supabase tidak valid.", 502); }
  }
  if (!r.ok) {
    const message = data?.message || data?.hint || data?.error ||
      `Supabase menolak request (HTTP ${r.status}).`;
    const databaseError = {
      path,
      code: data?.code || null,
      message,
      details: data?.details || null,
      hint: data?.hint || null,
      constraint: data?.constraint || null,
    };
    if (data?.code === "23505") {
      const duplicateReturn = /returns.*(id_penyewaan|kode_pengembalian)/i.test(
        `${data?.constraint || ""} ${data?.message || ""} ${data?.details || ""}`
      );
      throw Object.assign(fail(
        duplicateReturn
          ? "Pengembalian untuk penyewaan ini atau kode pengembaliannya sudah tercatat."
          : "Kode transaksi sudah digunakan. Pilih kode lain.",
        409
      ), { database: databaseError });
    }
    if (data?.code === "23503") {
      throw Object.assign(fail("Penyewaan tidak ditemukan atau tidak valid. Muat ulang daftar penyewaan dan coba lagi.", 409), { database: databaseError });
    }
    if (data?.code === "23514") {
      const checkDetails = `${data?.constraint || ""} ${message} ${data?.details || ""}`;
      const userMessage = /kondisi[_ ]dress|condition/i.test(checkDetails)
        ? "Nilai kondisi dress ditolak oleh CHECK di Supabase. Samakan constraint kondisi_dress dengan pilihan Baik, Rusak, atau Hilang dengan menjalankan migrasi di database/schema.sql."
        : "Data pengembalian tidak memenuhi aturan CHECK database. Periksa nilai kondisi dress dan nominal denda.";
      throw Object.assign(fail(userMessage, 400), { database: databaseError });
    }
    if (data?.code === "23502") {
      throw Object.assign(fail("Skema database belum memiliki nilai wajib untuk pengembalian. Perbarui skema Supabase.", 503), { database: databaseError });
    }
    if (data?.code === "42501") {
      throw Object.assign(fail("Database menolak akses untuk menyimpan pengembalian. Periksa konfigurasi izin/RLS backend.", 503), { database: databaseError });
    }
    if (data?.code === "22P02") {
      throw Object.assign(fail("ID penyewaan atau format data pengembalian tidak valid.", 400), { database: databaseError });
    }
    if (data?.code === "PGRST202" || data?.code === "42883" || /could not find the function|function .* does not exist/i.test(message)) {
      throw Object.assign(fail("Fungsi database belum sesuai dengan backend. Jalankan ulang database/schema.sql di Supabase, lalu coba kembali.", 503), { database: databaseError });
    }
    throw Object.assign(fail(message, r.status >= 500 ? 502 : 400), { database: databaseError });
  }
  return data;
}

const rpc = (fn, params) => supabase(`rpc/${fn}`, { method: "POST", body: params });

function one(data, msg) {
  if (!Array.isArray(data) || data.length === 0) throw fail(msg, 404);
  return data[0];
}

function validDate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === v;
}

function requiredText(v, label, max = 120) {
  if (typeof v !== "string" || !v.trim() || v.trim().length > max)
    throw fail(`${label} wajib diisi (maks. ${max} karakter).`);
  return v.trim();
}

function positiveNumber(v, label) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw fail(`${label} harus angka tidak negatif.`);
  return n;
}

function optionalText(v, max = 255) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw fail("Nilai teks tidak valid.");
  return v.trim().slice(0, max) || null;
}

function normalizeFineCategory(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
  if (["keterlambatan", "terlambat", "denda keterlambatan"].includes(normalized)) {
    return "Keterlambatan";
  }
  if (["kerusakan/kehilangan", "kerusakan", "kehilangan", "denda kerusakan/kehilangan"].includes(normalized)) {
    return "Kerusakan/Kehilangan";
  }
  return null;
}

function isFineCategoryRpcError(error) {
  const database = error?.database || {};
  const message = `${database.constraint || ""} ${database.message || ""} ${database.details || ""} ${error?.message || ""}`;
  return /kategori/i.test(message) &&
    /(wajib|harus|tidak valid|invalid|check constraint|violates check)/i.test(message);
}

function calculateCashReceived(payments, inRange) {
  const cashPaymentTypes = new Set(["DP", "Cicilan", "Pelunasan", "Denda"]);
  return payments
    .filter((payment) =>
      payment.status_pembayaran === "Berhasil" &&
      cashPaymentTypes.has(payment.jenis_pembayaran) &&
      inRange(payment.tanggal_bayar)
    )
    .reduce((sum, payment) => sum + Number(payment.jumlah_bayar || 0), 0);
}

function calculateFineTotals(returnsData, payments, inRange) {
  const periodReturns = returnsData.filter((rentalReturn) =>
    inRange(rentalReturn.tanggal_kembali_aktual));
  const totalFines = periodReturns.reduce((sum, rentalReturn) =>
    sum + Number(rentalReturn.total_denda || 0), 0);
  const returnRentalIds = new Set(returnsData.map((rentalReturn) => rentalReturn.id_penyewaan));
  const totalFinesPaid = payments
    .filter((payment) =>
      payment.status_pembayaran === "Berhasil" &&
      payment.jenis_pembayaran === "Denda" &&
      inRange(payment.tanggal_bayar) &&
      returnRentalIds.has(payment.id_penyewaan)
    )
    .reduce((sum, payment) => sum + Number(payment.jumlah_bayar || 0), 0);

  return {
    totalFines,
    totalFinesPaid,
    totalFinesOutstanding: Math.max(totalFines - totalFinesPaid, 0),
  };
}

function calculateDressInventory(dresses) {
  const uniqueDresses = [...new Map(dresses.map((dress) => [dress.id_dress, dress])).values()];
  return {
    total_dress: uniqueDresses.length,
    available_dresses: uniqueDresses.filter((dress) => dress.status === "Tersedia").length,
    rented_dresses: uniqueDresses.filter((dress) => dress.status === "Disewa").length,
  };
}

function validateCode(value, prefix) {
  const code = requiredText(value, `Kode ${prefix}`, 32).toUpperCase();
  const pattern = new RegExp(`^${prefix}-\\d{6}-\\d{4}$`);
  if (!pattern.test(code)) {
    throw fail(`Format kode tidak valid. Gunakan ${prefix}-DDMMYY-0001.`);
  }
  return code;
}

async function ensureCodeAvailable(prefix, code, excludeId = null) {
  const target = CODE_TARGETS[prefix];
  const filter = `${target.column}=eq.${encodeURIComponent(code)}&select=${target.id}`;
  const rows = await supabase(`${target.table}?${filter}`);
  if (rows.some((row) => !excludeId || row[target.id] !== excludeId)) {
    throw fail("Kode transaksi sudah digunakan. Silakan pilih kode lain.", 409);
  }
}

/* =========================================================
   PAYMENT STATUS HELPER
   ========================================================= */
function computePaymentStatus(totalSewa, paidAmount, hasDP) {
  if (paidAmount <= 0) return "Belum Bayar";
  if (paidAmount >= totalSewa) return "Lunas";
  if (hasDP) return "DP";
  return "Cicilan";
}

async function enrichRental(rental) {
  const [payments, dress, returnsData] = await Promise.all([
    supabase(`payments?id_penyewaan=eq.${rental.id_penyewaan}&select=*&order=created_at.asc`),
    supabase(`dresses?id_dress=eq.${rental.id_dress}&select=*`),
    supabase(`returns?id_penyewaan=eq.${rental.id_penyewaan}&select=*`),
  ]);
  const dressRow = dress && dress[0] ? dress[0] : null;
  const berhasil = payments.filter((p) => p.status_pembayaran === "Berhasil" && p.jenis_pembayaran !== "Denda");
  const totalPaid = berhasil.reduce((s, p) => s + Number(p.jumlah_bayar), 0);
  const successfulFinePayments = payments.filter((p) =>
    p.status_pembayaran === "Berhasil" && p.jenis_pembayaran === "Denda");
  const totalFinePaid = successfulFinePayments.reduce((sum, p) => sum + Number(p.jumlah_bayar), 0);
  const lateFinePaid = successfulFinePayments
    .filter((p) => p.kategori_denda === "Keterlambatan")
    .reduce((sum, p) => sum + Number(p.jumlah_bayar), 0);
  const damageFinePaid = successfulFinePayments
    .filter((p) => p.kategori_denda === "Kerusakan/Kehilangan")
    .reduce((sum, p) => sum + Number(p.jumlah_bayar), 0);
  const rentalReturn = returnsData?.[0] || null;
  const hasDP = berhasil.some((p) => p.jenis_pembayaran === "DP");
  return {
    ...rental,
    nama_dress: dressRow?.nama_dress || null,
    kode_dress: dressRow?.kode_dress || null,
    payments,
    return: rentalReturn,
    total_denda_dibayar: totalFinePaid,
    sisa_denda: Math.max(Number(rentalReturn?.total_denda || 0) - totalFinePaid, 0),
    sisa_denda_keterlambatan: Math.max(Number(rentalReturn?.denda_keterlambatan || 0) - lateFinePaid, 0),
    sisa_denda_kerusakan: Math.max(Number(rentalReturn?.denda_kerusakan || 0) - damageFinePaid, 0),
    total_pembayaran: totalPaid,
    sisa_tagihan: Math.max(Number(rental.total_sewa) - totalPaid, 0),
    status_pembayaran: computePaymentStatus(Number(rental.total_sewa), totalPaid, hasDP),
  };
}

/* =========================================================
   DASHBOARD
   ========================================================= */
async function getDashboard() {
  const dresses = await supabase("dresses?select=id_dress,status");
  return calculateDressInventory(dresses);
}

/* =========================================================
   API HANDLER
   ========================================================= */
async function handleApi(req, res, url) {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = req.method;

  if (method === "GET" && path === "/api/health") {
    return send(res, 200, { ok: true, message: "ÉLAN backend aktif." });
  }

  if (method === "GET" && ["/api/codes/next", "/api/payment-code"].includes(path)) {
    const prefix = url.searchParams.get("prefix");
    const target = CODE_TARGETS[prefix];
    const date = url.searchParams.get("date");
    if (!target) throw fail("Jenis kode tidak valid.");
    if (!validDate(date)) throw fail("Tanggal kode tidak valid.");
    const code = await rpc("generate_code", { p_prefix: prefix, p_date: date });
    return send(res, 200, { code });
  }

  if (method === "GET" && path === "/api/codes/availability") {
    const prefix = url.searchParams.get("prefix");
    if (!CODE_TARGETS[prefix]) throw fail("Jenis kode tidak valid.");
    const code = validateCode(url.searchParams.get("code"), prefix);
    const excludeId = url.searchParams.get("excludeId");
    try {
      await ensureCodeAvailable(prefix, code, excludeId);
      return send(res, 200, { available: true });
    } catch (error) {
      if (error.status === 409) return send(res, 200, { available: false });
      throw error;
    }
  }

  if (method === "GET" && path === "/api/dashboard") {
    return send(res, 200, await getDashboard());
  }

  /* ---------- DRESSES ---------- */
  if (method === "GET" && path === "/api/dresses") {
    const rows = await supabase("dresses?select=*&order=created_at.desc");
    return send(res, 200, { data: rows });
  }
  if (method === "POST" && path === "/api/dresses") {
    const b = await readBody(req);
    const payload = {
      kode_dress: validateCode(b.kode_dress, "DRS"),
      nama_dress: requiredText(b.nama_dress, "Nama dress"),
      ukuran: requiredText(b.ukuran, "Ukuran", 20),
      warna: requiredText(b.warna, "Warna", 40),
      tarif_sewa: positiveNumber(b.tarif_sewa, "Tarif sewa"),
      status: ["Tersedia","Disewa","Laundry","Rusak","Hilang"].includes(b.status) ? b.status : "Tersedia",
    };
    await ensureCodeAvailable("DRS", payload.kode_dress);
    const data = await supabase("dresses", { method: "POST", body: payload });
    return send(res, 201, one(data, "Gagal menyimpan dress."));
  }

  let m = path.match(/^\/api\/dresses\/([^/]+)$/);
  if (m && method === "GET") {
    const data = await supabase(`dresses?id_dress=eq.${encodeURIComponent(m[1])}&select=*`);
    return send(res, 200, one(data, "Dress tidak ditemukan."));
  }
  if (m && method === "PUT") {
    const b = await readBody(req);
    const update = {};
    if (b.kode_dress !== undefined) {
      update.kode_dress = validateCode(b.kode_dress, "DRS");
      await ensureCodeAvailable("DRS", update.kode_dress, m[1]);
    }
    if (b.nama_dress !== undefined) update.nama_dress = requiredText(b.nama_dress, "Nama dress");
    if (b.ukuran !== undefined) update.ukuran = requiredText(b.ukuran, "Ukuran", 20);
    if (b.warna !== undefined) update.warna = requiredText(b.warna, "Warna", 40);
    if (b.tarif_sewa !== undefined) update.tarif_sewa = positiveNumber(b.tarif_sewa, "Tarif sewa");
    if (b.status !== undefined) {
      if (!["Tersedia","Disewa","Laundry","Rusak","Hilang"].includes(b.status))
        throw fail("Status dress tidak valid.");
      update.status = b.status;
    }
    if (!Object.keys(update).length) throw fail("Tidak ada perubahan.");
    const data = await supabase(`dresses?id_dress=eq.${encodeURIComponent(m[1])}`, {
      method: "PATCH", body: update,
    });
    return send(res, 200, one(data, "Dress tidak ditemukan."));
  }
  if (m && method === "DELETE") {
    const active = await supabase(`rentals?id_dress=eq.${encodeURIComponent(m[1])}&select=id_penyewaan&limit=1`);
    if (active && active.length) throw fail("Dress tidak dapat dihapus karena memiliki riwayat penyewaan.", 409);
    const deleted = await supabase(`dresses?id_dress=eq.${encodeURIComponent(m[1])}`, { method: "DELETE" });
    if (!deleted?.length) throw fail("Dress tidak ditemukan.", 404);
    return send(res, 200, { deleted: true });
  }

  /* ---------- RENTALS ---------- */
  if (method === "GET" && path === "/api/rentals") {
    const rentals = await supabase("rentals?select=*&order=created_at.desc");
    const payments = await supabase("payments?select=id_pembayaran,id_penyewaan,kode_pembayaran,tanggal_bayar,jumlah_bayar,status_pembayaran,jenis_pembayaran,kategori_denda,metode_pembayaran,referensi,created_at&order=created_at.asc");
    const returnsData = await supabase("returns?select=*");
    const dresses = await supabase("dresses?select=id_dress,nama_dress,kode_dress");
    const paidByRental = new Map();
    const hasDPMap = new Map();
    const finePaidByRental = new Map();
    const lateFinePaidByRental = new Map();
    const damageFinePaidByRental = new Map();
    payments.filter((p) => p.status_pembayaran === "Berhasil" && p.jenis_pembayaran !== "Denda")
      .forEach((p) => {
        paidByRental.set(p.id_penyewaan, (paidByRental.get(p.id_penyewaan) || 0) + Number(p.jumlah_bayar));
        if (p.jenis_pembayaran === "DP") hasDPMap.set(p.id_penyewaan, true);
      });
    payments.filter((p) => p.status_pembayaran === "Berhasil" && p.jenis_pembayaran === "Denda")
      .forEach((p) => {
        finePaidByRental.set(p.id_penyewaan, (finePaidByRental.get(p.id_penyewaan) || 0) + Number(p.jumlah_bayar));
        const target = p.kategori_denda === "Keterlambatan"
          ? lateFinePaidByRental
          : p.kategori_denda === "Kerusakan/Kehilangan"
            ? damageFinePaidByRental
            : null;
        if (target) target.set(p.id_penyewaan, (target.get(p.id_penyewaan) || 0) + Number(p.jumlah_bayar));
      });
    const returnByRental = new Map(returnsData.map((item) => [item.id_penyewaan, item]));
    const dressById = new Map(dresses.map((d) => [d.id_dress, d]));
    const enriched = rentals.map((r) => {
      const paid = paidByRental.get(r.id_penyewaan) || 0;
      const dress = dressById.get(r.id_dress);
      const rentalReturn = returnByRental.get(r.id_penyewaan) || null;
      const finePaid = finePaidByRental.get(r.id_penyewaan) || 0;
      const lateFinePaid = lateFinePaidByRental.get(r.id_penyewaan) || 0;
      const damageFinePaid = damageFinePaidByRental.get(r.id_penyewaan) || 0;
      return {
        ...r,
        nama_dress: dress?.nama_dress || null,
        kode_dress: dress?.kode_dress || null,
        payments: payments.filter((p) => p.id_penyewaan === r.id_penyewaan),
        return: rentalReturn,
        total_denda_dibayar: finePaid,
        sisa_denda: Math.max(Number(rentalReturn?.total_denda || 0) - finePaid, 0),
        sisa_denda_keterlambatan: Math.max(Number(rentalReturn?.denda_keterlambatan || 0) - lateFinePaid, 0),
        sisa_denda_kerusakan: Math.max(Number(rentalReturn?.denda_kerusakan || 0) - damageFinePaid, 0),
        total_pembayaran: paid,
        sisa_tagihan: Math.max(Number(r.total_sewa) - paid, 0),
        status_pembayaran: computePaymentStatus(Number(r.total_sewa), paid, hasDPMap.get(r.id_penyewaan)),
      };
    });
    return send(res, 200, { data: enriched });
  }

  if (method === "POST" && path === "/api/rentals") {
    const b = await readBody(req);
    if (!b.id_dress) throw fail("Dress wajib dipilih.");
    if (!validDate(b.tanggal_sewa) || !validDate(b.tanggal_rencana_kembali))
      throw fail("Tanggal tidak valid.");
    if (b.tanggal_rencana_kembali < b.tanggal_sewa)
      throw fail("Tanggal rencana kembali tidak boleh sebelum tanggal sewa.");

    const kodePenyewaan = validateCode(b.kode_penyewaan, "RNT");
    await ensureCodeAvailable("RNT", kodePenyewaan);
    const totalSewa = positiveNumber(b.total_sewa, "Total sewa");
    const dp = positiveNumber(b.dp ?? 0, "DP");
    if (dp > totalSewa) throw fail("DP tidak boleh melebihi total sewa.");
    const dpCode = dp > 0 ? validateCode(b.kode_dp_awal, "PAY") : null;
    if (dpCode) await ensureCodeAvailable("PAY", dpCode);
    const data = await rpc("create_rental", {
      p_id_dress: b.id_dress,
      p_nama_pelanggan: requiredText(b.nama_pelanggan, "Nama pelanggan"),
      p_no_telepon: requiredText(b.no_telepon, "Nomor telepon", 30),
      p_email: optionalText(b.email),
      p_alamat: optionalText(b.alamat, 500),
      p_tanggal_sewa: b.tanggal_sewa,
      p_tanggal_rencana_kembali: b.tanggal_rencana_kembali,
      p_tarif_sewa: positiveNumber(b.tarif_sewa, "Tarif sewa"),
      p_total_sewa: totalSewa,
      p_dp: dp,
      p_kode: kodePenyewaan,
      p_dp_kode: dpCode,
    });
    const payments = await supabase(`payments?id_penyewaan=eq.${encodeURIComponent(data.id_penyewaan)}&select=*&order=created_at.asc`);
    return send(res, 201, { rental: data, payments });
  }

  m = path.match(/^\/api\/rentals\/([^/]+)$/);
  if (m && method === "GET") {
    const data = await supabase(`rentals?id_penyewaan=eq.${encodeURIComponent(m[1])}&select=*`);
    const rental = one(data, "Penyewaan tidak ditemukan.");
    return send(res, 200, await enrichRental(rental));
  }

  m = path.match(/^\/api\/rentals\/([^/]+)\/cancel$/);
  if (m && method === "PATCH") {
    const b = await readBody(req);
    const data = await rpc("cancel_rental", {
      p_id_penyewaan: m[1],
      p_alasan: requiredText(b.alasan || "Dibatalkan oleh pengguna", "Alasan", 500),
    });
    return send(res, 200, data);
  }

  m = path.match(/^\/api\/rentals\/([^/]+)\/payments$/);
  if (m && method === "POST") {
    const b = await readBody(req);
    if (!validDate(b.tanggal_bayar)) throw fail("Tanggal bayar tidak valid.");
    const jumlah = positiveNumber(b.jumlah_bayar, "Jumlah bayar");
    if (jumlah <= 0) throw fail("Jumlah bayar harus > 0.");
    if (!["DP","Cicilan","Pelunasan","Denda"].includes(b.jenis_pembayaran))
      throw fail("Jenis pembayaran tidak valid.");
    const kategoriDenda = b.jenis_pembayaran === "Denda"
      ? normalizeFineCategory(b.kategori_denda ?? b.kategoriDenda ?? b.fineCategory)
      : null;
    if (b.jenis_pembayaran === "Denda" && !kategoriDenda) {
      throw fail("Pilih kategori denda yang valid: Keterlambatan atau Kerusakan/Kehilangan.");
    }
    if (!["Tunai","Transfer Bank","QRIS"].includes(b.metode_pembayaran))
      throw fail("Metode pembayaran tidak valid.");
    let referensi = optionalText(b.referensi);
    if (b.jenis_pembayaran === "Denda") {
      const [rentalRows, returnRows] = await Promise.all([
        supabase(`rentals?id_penyewaan=eq.${encodeURIComponent(m[1])}&select=id_penyewaan,kode_penyewaan`),
        supabase(`returns?id_penyewaan=eq.${encodeURIComponent(m[1])}&select=id_pengembalian,kode_pengembalian`),
      ]);
      const rental = one(rentalRows, "Penyewaan untuk tagihan denda tidak ditemukan.");
      const rentalReturn = one(returnRows, "Tagihan denda pengembalian tidak ditemukan.");
      const references = [
        rental.kode_penyewaan,
        `Pengembalian ${rentalReturn.kode_pengembalian || rentalReturn.id_pengembalian}`,
        referensi,
      ].filter(Boolean);
      referensi = [...new Set(references)].join(" · ").slice(0, 255);
    }
    const kodePembayaran = validateCode(b.kode_pembayaran, "PAY");
    await ensureCodeAvailable("PAY", kodePembayaran);
    const paymentParams = {
      p_id_penyewaan: m[1],
      p_jenis: b.jenis_pembayaran,
      p_tanggal_bayar: b.tanggal_bayar,
      p_jumlah: jumlah,
      p_metode: b.metode_pembayaran,
      p_referensi: referensi,
      p_kode: kodePembayaran,
      p_kategori_denda: kategoriDenda,
    };
    let data;
    try {
      data = await rpc("record_payment", paymentParams);
    } catch (error) {
      if (b.jenis_pembayaran !== "Denda" || !isFineCategoryRpcError(error)) throw error;
      const databaseCategory = kategoriDenda.toLocaleLowerCase("id-ID");
      if (databaseCategory === kategoriDenda) throw error;
      data = await rpc("record_payment", {
        ...paymentParams,
        p_kategori_denda: databaseCategory,
      });
    }
    return send(res, 201, data);
  }

  m = path.match(/^\/api\/rentals\/([^/]+)\/return$/);
  if (m && method === "POST") {
    const b = await readBody(req);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(m[1])) {
      throw fail("ID penyewaan tidak valid.");
    }
    if (!validDate(b.tanggal_kembali_aktual)) throw fail("Tanggal kembali tidak valid.");
    const kodePengembalian = validateCode(b.kode_pengembalian, "RTN");
    await ensureCodeAvailable("RTN", kodePengembalian);
    if (!["Baik","Rusak","Hilang"].includes(b.kondisi_dress)) {
      throw fail("Kondisi dress harus Baik, Rusak, atau Hilang.");
    }
    const dendaTelat = positiveNumber(b.denda_keterlambatan ?? 0, "Denda keterlambatan");
    const dendaRusak = positiveNumber(b.denda_kerusakan ?? 0, "Denda kerusakan/kehilangan");
    for (const [label, amount] of [["Denda keterlambatan", dendaTelat], ["Denda kerusakan/kehilangan", dendaRusak]]) {
      if (amount > 999999999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) {
        throw fail(`${label} harus maksimal Rp999.999.999.999,99 dengan paling banyak dua angka desimal.`);
      }
    }
    const data = await rpc("record_return", {
      p_id_penyewaan: m[1],
      p_tanggal_kembali: b.tanggal_kembali_aktual,
      p_kondisi: b.kondisi_dress,
      p_denda_telat: dendaTelat,
      p_denda_rusak: dendaRusak,
      p_catatan: optionalText(b.catatan, 500),
      p_kode: kodePengembalian,
    });
    return send(res, 201, data);
  }

  /* ---------- PAYMENTS ---------- */
  if (method === "GET" && path === "/api/payments") {
    const [rows, rentals] = await Promise.all([
      supabase("payments?select=*&order=created_at.desc"),
      supabase("rentals?select=id_penyewaan,kode_penyewaan,nama_pelanggan"),
    ]);
    const byId = new Map(rentals.map((r) => [r.id_penyewaan, r]));
    const enriched = rows.map((p) => ({
      ...p,
      kode_penyewaan: byId.get(p.id_penyewaan)?.kode_penyewaan || p.id_penyewaan,
      nama_pelanggan: byId.get(p.id_penyewaan)?.nama_pelanggan || null,
    }));
    return send(res, 200, { data: enriched });
  }

  m = path.match(/^\/api\/payments\/([^/]+)$/);
  if (m && method === "GET") {
    const data = await supabase(`payments?id_pembayaran=eq.${encodeURIComponent(m[1])}&select=*`);
    const payment = one(data, "Pembayaran tidak ditemukan.");
    if (payment.status_pembayaran !== "Berhasil") {
      throw fail("Nota hanya tersedia untuk pembayaran yang berhasil.", 409);
    }
    const rental = one(
      await supabase(`rentals?id_penyewaan=eq.${encodeURIComponent(payment.id_penyewaan)}&select=*`),
      "Penyewaan tidak ditemukan."
    );
    const dress = one(
      await supabase(`dresses?id_dress=eq.${encodeURIComponent(rental.id_dress)}&select=*`),
      "Dress tidak ditemukan."
    );
    const allPayments = await supabase(
      `payments?id_penyewaan=eq.${encodeURIComponent(rental.id_penyewaan)}&status_pembayaran=eq.Berhasil&select=*&order=created_at.asc`
    );
    const totalPaid = allPayments.filter((p) => p.jenis_pembayaran !== "Denda")
      .reduce((s,p) => s + Number(p.jumlah_bayar), 0);
    const hasDP = allPayments.some((p) => p.jenis_pembayaran === "DP");
    return send(res, 200, {
      payment,
      rental: {
        ...rental,
        nama_dress: dress.nama_dress,
        kode_dress: dress.kode_dress,
        ukuran_dress: dress.ukuran,
        warna_dress: dress.warna,
      },
      history: allPayments,
      total_pembayaran: totalPaid,
      sisa_tagihan: Math.max(Number(rental.total_sewa) - totalPaid, 0),
      status_pembayaran: computePaymentStatus(Number(rental.total_sewa), totalPaid, hasDP),
    });
  }

  m = path.match(/^\/api\/payments\/([^/]+)\/cancel$/);
  if (m && method === "PATCH") {
    const b = await readBody(req);
    const data = await rpc("cancel_payment", {
      p_id_pembayaran: m[1],
      p_alasan: requiredText(b.alasan || "Dibatalkan", "Alasan", 500),
    });
    return send(res, 200, data);
  }

  /* ---------- RETURNS ---------- */
  if (method === "GET" && path === "/api/returns") {
    const [rows, rentals, dresses, payments] = await Promise.all([
      supabase("returns?select=*&order=created_at.desc"),
      supabase("rentals?select=id_penyewaan,kode_penyewaan,nama_pelanggan,id_dress,tanggal_rencana_kembali"),
      supabase("dresses?select=id_dress,nama_dress,kode_dress"),
      supabase("payments?select=id_penyewaan,jenis_pembayaran,kategori_denda,jumlah_bayar,status_pembayaran"),
    ]);
    const rById = new Map(rentals.map((r) => [r.id_penyewaan, r]));
    const dById = new Map(dresses.map((d) => [d.id_dress, d]));
    const paidFineByRental = new Map();
    payments
      .filter((p) => p.jenis_pembayaran === "Denda" && p.status_pembayaran === "Berhasil")
      .forEach((p) => {
        const paid = paidFineByRental.get(p.id_penyewaan) || { total: 0, late: 0, damage: 0 };
        const amount = Number(p.jumlah_bayar);
        paid.total += amount;
        if (p.kategori_denda === "Keterlambatan") paid.late += amount;
        if (p.kategori_denda === "Kerusakan/Kehilangan") paid.damage += amount;
        paidFineByRental.set(p.id_penyewaan, paid);
      });
    const enriched = rows.map((x) => {
      const rental = rById.get(x.id_penyewaan);
      const dress = rental ? dById.get(rental.id_dress) : null;
      const paid = paidFineByRental.get(x.id_penyewaan) || { total: 0, late: 0, damage: 0 };
      const lateOutstanding = Math.max(Number(x.denda_keterlambatan || 0) - paid.late, 0);
      const damageOutstanding = Math.max(Number(x.denda_kerusakan || 0) - paid.damage, 0);
      const outstanding = lateOutstanding + damageOutstanding;
      return {
        ...x,
        kode_penyewaan: rental?.kode_penyewaan || x.id_penyewaan,
        nama_pelanggan: rental?.nama_pelanggan || null,
        nama_dress: dress?.nama_dress || null,
        tanggal_rencana_kembali: rental?.tanggal_rencana_kembali || null,
        total_denda_dibayar: paid.total,
        sisa_tagihan_denda: outstanding,
        status_pembayaran_denda: Number(x.total_denda || 0) <= 0
          ? "Tidak Ada Denda"
          : outstanding <= 0
            ? "Lunas"
            : paid.total > 0
              ? "Dibayar Sebagian"
              : "Belum Dibayar",
        denda_keterlambatan_dibayar: paid.late,
        denda_kerusakan_dibayar: paid.damage,
        sisa_denda_keterlambatan: lateOutstanding,
        sisa_denda_kerusakan: damageOutstanding,
      };
    });
    return send(res, 200, { data: enriched });
  }

  /* ---------- REPORTS ---------- */
  if (method === "GET" && path === "/api/reports/summary") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) {
      throw fail("Periode laporan tidak valid.");
    }
    const [rentals, payments, returnsData, dresses] = await Promise.all([
      supabase("rentals?select=*,dresses(nama_dress,kode_dress)"),
      supabase("payments?select=*"),
      supabase("returns?select=*"),
      supabase("dresses?select=id_dress,status"),
    ]);
    const inRange = (d) => (!from || d >= from) && (!to || d <= to);

    const filteredRentals = rentals.filter((r) => inRange(r.tanggal_sewa));
    const paidByRental = new Map();
    payments.filter((p) => p.status_pembayaran === "Berhasil" && p.jenis_pembayaran !== "Denda")
      .forEach((p) => {
        paidByRental.set(p.id_penyewaan, (paidByRental.get(p.id_penyewaan) || 0) + Number(p.jumlah_bayar));
      });

    const totalRentalRevenue = filteredRentals
      .filter((r) => r.status_penyewaan !== "Dibatalkan")
      .reduce((s,r) => s + Number(r.total_sewa), 0);

    const totalCashReceived = calculateCashReceived(payments, inRange);

    const totalReceivables = filteredRentals.reduce((sum, r) => {
      if (r.status_penyewaan === "Dibatalkan") return sum;
      const paid = paidByRental.get(r.id_penyewaan) || 0;
      return sum + Math.max(Number(r.total_sewa) - paid, 0);
    }, 0);

    const { totalFines, totalFinesPaid, totalFinesOutstanding } =
      calculateFineTotals(returnsData, payments, inRange);

    const inventorySummary = {
      total: dresses.length,
      tersedia: dresses.filter((d) => d.status === "Tersedia").length,
      disewa: dresses.filter((d) => d.status === "Disewa").length,
      laundry: dresses.filter((d) => d.status === "Laundry").length,
      rusak: dresses.filter((d) => d.status === "Rusak").length,
      hilang: dresses.filter((d) => d.status === "Hilang").length,
    };

    const rentalRows = filteredRentals.map((r) => {
      const paid = paidByRental.get(r.id_penyewaan) || 0;
      return {
        id_penyewaan: r.id_penyewaan,
        kode_penyewaan: r.kode_penyewaan,
        tanggal_sewa: r.tanggal_sewa,
        tanggal_rencana_kembali: r.tanggal_rencana_kembali,
        nama_pelanggan: r.nama_pelanggan,
        nama_dress: r.dresses?.nama_dress || null,
        total_sewa: Number(r.total_sewa),
        total_pembayaran: paid,
        sisa_tagihan: Math.max(Number(r.total_sewa) - paid, 0),
        status_penyewaan: r.status_penyewaan,
      };
    });

    return send(res, 200, {
      period: { from, to },
      total_rental_revenue: totalRentalRevenue,
      total_paid: totalCashReceived,
      total_receivables: totalReceivables,
      total_fines: totalFines,
      total_fines_paid: totalFinesPaid,
      total_fines_outstanding: totalFinesOutstanding,
      inventory_summary: inventorySummary,
      rental_rows: rentalRows,
    });
  }

  return send(res, 404, { error: `Endpoint tidak ditemukan: ${method} ${path}.` });
}

/* =========================================================
   SERVER
   ========================================================= */
const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch((e) => {
      const s = e.status || 500;
      if (!res.headersSent) send(res, s, { error: e.message || "Server error." });
      if (e.database) {
        console.error("Database error details (server only):", e.database);
      } else if (s >= 500) {
        console.error(e);
      }
    });
    return;
  }
  send(res, 404, { error: `Endpoint tidak ditemukan: ${req.method} ${url.pathname}. Gunakan /api/*.` });
});

server.listen(PORT, () => {
  console.log(`ÉLAN API aktif di http://127.0.0.1:${PORT}`);
  console.log(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? "✅ Database terkonfigurasi."
    : "⚠️  Set SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.");
});

module.exports = { supabase, rpc, validDate, requiredText, positiveNumber, optionalText };