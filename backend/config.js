import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://yuikckkxcayfliajedwb.supabase.co";
const SUPABASE_KEY = "sb_publishable_jgv_HoorUuUg8Ok5cPDOQg_NPip4WPr";

function ensureConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes("<project-ref>") || SUPABASE_KEY.includes("<")) {
    throw new Error("Konfigurasi Supabase belum lengkap. Atur URL dan publishable key pada backend/config.js.");
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY && !SUPABASE_URL.includes("<") && !SUPABASE_KEY.includes("<"));
}

const EMPTY_STRING = "";

function normalizeNumber(value, fallback = 0) {
  const number = Number(value ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseBody(body) {
  if (body === undefined || body === null || body === "") return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) || {};
    } catch {
      throw new Error("Format data tidak valid.");
    }
  }
  return body;
}

function pickNullableText(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).trim() || fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function coercePayload(payload = {}, allowNulls = true) {
  const result = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) return;
    if (value === null && !allowNulls) return;
    result[key] = value;
  });
  return result;
}

export async function generateCode(prefix, date) {
  ensureConfig();
  const targetPrefix = String(prefix || "").toUpperCase();
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("generate_code", {
    p_prefix: targetPrefix,
    p_date: targetDate,
  });
  if (error) throw new Error(error.message || "Gagal membuat kode otomatis.");
  return data;
}

export async function isCodeAvailable(prefix, code, excludeId = null) {
  ensureConfig();
  const targetPrefix = String(prefix || "").toUpperCase();
  const tableMap = {
    DRS: { table: "dresses", idColumn: "id_dress", codeColumn: "kode_dress" },
    RNT: { table: "rentals", idColumn: "id_penyewaan", codeColumn: "kode_penyewaan" },
    PAY: { table: "payments", idColumn: "id_pembayaran", codeColumn: "kode_pembayaran" },
    RTN: { table: "returns", idColumn: "id_pengembalian", codeColumn: "kode_pengembalian" },
  };
  const target = tableMap[targetPrefix];
  if (!target) {
    throw new Error("Jenis kode tidak valid.");
  }

  let query = supabase
    .from(target.table)
    .select(`${target.idColumn},${target.codeColumn}`)
    .eq(target.codeColumn, String(code || ""));

  if (excludeId) {
    query = query.neq(target.idColumn, excludeId);
  }

  const { data, error } = await query.limit(1);
  if (error) throw new Error(error.message || "Gagal mengecek ketersediaan kode.");
  return !(data && data.length > 0);
}

export async function getDresses() {
  ensureConfig();
  const { data, error } = await supabase
    .from("dresses")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message || "Gagal memuat data dress.");
  return safeArray(data);
}

export async function getDressById(id) {
  ensureConfig();
  const { data, error } = await supabase.from("dresses").select("*").eq("id_dress", id).limit(1);
  if (error) throw new Error(error.message || "Gagal memuat dress.");
  return data?.[0] ?? null;
}

export async function createDress(payload) {
  ensureConfig();
  const clean = coercePayload(payload, false);
  const item = {
    kode_dress: pickNullableText(clean.kode_dress) || null,
    nama_dress: String(clean.nama_dress || "").trim(),
    ukuran: String(clean.ukuran || "").trim(),
    warna: String(clean.warna || "").trim(),
    tarif_sewa: normalizeNumber(clean.tarif_sewa, 0),
    status: clean.status || "Tersedia",
  };

  if (!item.nama_dress) throw new Error("Nama dress wajib diisi.");
  if (!item.ukuran) throw new Error("Ukuran dress wajib diisi.");
  if (!item.warna) throw new Error("Warna dress wajib diisi.");

  const { data, error } = await supabase.from("dresses").insert([item]).select().single();
  if (error) throw new Error(error.message || "Gagal menambah dress.");
  return data;
}

export async function updateDress(id, payload) {
  ensureConfig();
  const clean = coercePayload(payload, false);
  const item = {};

  if (clean.nama_dress !== undefined) item.nama_dress = String(clean.nama_dress || "").trim();
  if (clean.ukuran !== undefined) item.ukuran = String(clean.ukuran || "").trim();
  if (clean.warna !== undefined) item.warna = String(clean.warna || "").trim();
  if (clean.tarif_sewa !== undefined) item.tarif_sewa = normalizeNumber(clean.tarif_sewa, 0);
  if (clean.status !== undefined) item.status = clean.status;
  if (clean.kode_dress !== undefined) item.kode_dress = pickNullableText(clean.kode_dress) || null;

  if (!Object.keys(item).length) return await getDressById(id);

  const { data, error } = await supabase.from("dresses").update(item).eq("id_dress", id).select().single();
  if (error) throw new Error(error.message || "Gagal memperbarui dress.");
  return data;
}

export async function deleteDress(id) {
  ensureConfig();
  const { data, error } = await supabase.from("dresses").delete().eq("id_dress", id).select();
  if (error) throw new Error(error.message || "Gagal menghapus dress.");
  return Array.isArray(data) ? data.length > 0 : Boolean(data);
}

export async function getRentals() {
  ensureConfig();
  const [rentalResult, paymentResult, returnResult, dressResult] = await Promise.all([
    supabase.from("rentals").select("*").order("created_at", { ascending: false }),
    supabase.from("payments").select("*").order("created_at", { ascending: true }),
    supabase.from("returns").select("*").order("tanggal_kembali_aktual", { ascending: false }),
    supabase.from("dresses").select("id_dress,nama_dress,kode_dress"),
  ]);

  if (rentalResult.error) throw new Error(rentalResult.error.message || "Gagal memuat penyewaan.");
  if (paymentResult.error) throw new Error(paymentResult.error.message || "Gagal memuat pembayaran.");
  if (returnResult.error) throw new Error(returnResult.error.message || "Gagal memuat pengembalian.");
  if (dressResult.error) throw new Error(dressResult.error.message || "Gagal memuat dress.");

  const rentals = safeArray(rentalResult.data);
  const payments = safeArray(paymentResult.data);
  const returns = safeArray(returnResult.data);
  const dressMap = new Map(safeArray(dressResult.data).map((dress) => [dress.id_dress, dress]));
  const returnMap = new Map(returns.map((row) => [row.id_penyewaan, row]));
  const paymentMap = new Map();

  payments.forEach((payment) => {
    if (payment.status_pembayaran !== "Berhasil") return;
    const key = payment.id_penyewaan;
    paymentMap.set(key, (paymentMap.get(key) || 0) + normalizeNumber(payment.jumlah_bayar, 0));
  });

  return rentals.map((rental) => {
    const dress = dressMap.get(rental.id_dress) || {};
    const totalPaid = normalizeNumber(paymentMap.get(rental.id_penyewaan), 0);
    const sisaTagihan = Math.max(normalizeNumber(rental.total_sewa, 0) - totalPaid, 0);
    const statusPembayaran = totalPaid <= 0 ? "Belum Dibayar" : totalPaid >= normalizeNumber(rental.total_sewa, 0) ? "Lunas" : "Dibayar Sebagian";
    const rentalReturn = returnMap.get(rental.id_penyewaan);
    const totalFinePaid = payments
      .filter((payment) => payment.id_penyewaan === rental.id_penyewaan && payment.status_pembayaran === "Berhasil" && payment.jenis_pembayaran === "Denda")
      .reduce((sum, payment) => sum + normalizeNumber(payment.jumlah_bayar, 0), 0);

    return {
      ...rental,
      nama_dress: dress.nama_dress || null,
      kode_dress: dress.kode_dress || null,
      total_pembayaran: totalPaid,
      sisa_tagihan: sisaTagihan,
      status_pembayaran: statusPembayaran,
      return: rentalReturn || null,
      payments: payments.filter((payment) => payment.id_penyewaan === rental.id_penyewaan),
      total_denda_dibayar: totalFinePaid,
      sisa_denda: Math.max(normalizeNumber(rentalReturn?.total_denda, 0) - totalFinePaid, 0),
    };
  });
}

export async function getRentalById(id) {
  ensureConfig();
  const { data, error } = await supabase.from("rentals").select("*").eq("id_penyewaan", id).limit(1);
  if (error) throw new Error(error.message || "Gagal memuat detail penyewaan.");
  return data?.[0] ?? null;
}

export async function createRental(payload) {
  ensureConfig();
  const clean = parseBody(payload);
  const item = {
    p_id_dress: clean.id_dress,
    p_nama_pelanggan: String(clean.nama_pelanggan || "").trim(),
    p_no_telepon: String(clean.no_telepon || "").trim(),
    p_email: pickNullableText(clean.email),
    p_alamat: pickNullableText(clean.alamat),
    p_tanggal_sewa: clean.tanggal_sewa,
    p_tanggal_rencana_kembali: clean.tanggal_rencana_kembali,
    p_tarif_sewa: normalizeNumber(clean.tarif_sewa, 0),
    p_total_sewa: normalizeNumber(clean.total_sewa, 0),
    p_dp: normalizeNumber(clean.dp, 0),
    p_kode: pickNullableText(clean.kode_penyewaan),
    p_dp_kode: pickNullableText(clean.dpPaymentCode),
  };

  const { data, error } = await supabase.rpc("create_rental", item);
  if (error) throw new Error(error.message || "Gagal membuat penyewaan.");
  return data;
}

export async function cancelRental(id, alasan = "Dibatalkan") {
  ensureConfig();
  const { data, error } = await supabase.rpc("cancel_rental", {
    p_id_penyewaan: id,
    p_alasan: String(alasan || "Dibatalkan").trim(),
  });
  if (error) throw new Error(error.message || "Gagal membatalkan penyewaan.");
  return data;
}

export async function createPayment(payload) {
  ensureConfig();
  const clean = parseBody(payload);
  const item = {
    p_id_penyewaan: clean.id_penyewaan,
    p_kode: pickNullableText(clean.kode_pembayaran),
    p_jenis: clean.jenis_pembayaran || "Cicilan",
    p_kategori_denda: clean.kategori_denda || null,
    p_tanggal_bayar: clean.tanggal_bayar,
    p_jumlah: normalizeNumber(clean.jumlah_bayar, 0),
    p_metode: clean.metode_pembayaran || "Tunai",
    p_referensi: pickNullableText(clean.referensi),
  };

  if (!item.p_id_penyewaan) throw new Error("Penyewaan harus dipilih.");
  if (item.p_jumlah <= 0) throw new Error("Jumlah pembayaran harus lebih dari nol.");

  const { data, error } = await supabase.rpc("record_payment", item);
  if (error) throw new Error(error.message || "Gagal menyimpan pembayaran.");
  return data;
}

export async function cancelPayment(id, alasan = "Dibatalkan") {
  ensureConfig();
  const { data, error } = await supabase.rpc("cancel_payment", {
    p_id_pembayaran: id,
    p_alasan: String(alasan || "Dibatalkan").trim(),
  });
  if (error) throw new Error(error.message || "Gagal membatalkan pembayaran.");
  return data;
}

export async function getPayments() {
  ensureConfig();
  const [paymentResult, rentalResult] = await Promise.all([
    supabase.from("payments").select("*").order("created_at", { ascending: false }),
    supabase.from("rentals").select("id_penyewaan,kode_penyewaan,nama_pelanggan"),
  ]);

  if (paymentResult.error) throw new Error(paymentResult.error.message || "Gagal memuat pembayaran.");
  if (rentalResult.error) throw new Error(rentalResult.error.message || "Gagal memuat data penyewaan pembayaran.");

  const rentalMap = new Map(
    safeArray(rentalResult.data).map((rental) => [rental.id_penyewaan, rental])
  );

  return safeArray(paymentResult.data).map((payment) => {
    const rental = rentalMap.get(payment.id_penyewaan);
    return {
      ...payment,
      kode_penyewaan: rental?.kode_penyewaan || null,
      nama_pelanggan: rental?.nama_pelanggan || null,
    };
  });
}

export async function getPaymentById(id) {
  ensureConfig();
  const { data, error } = await supabase.from("payments").select("*").eq("id_pembayaran", id).limit(1);
  if (error) throw new Error(error.message || "Gagal memuat detail pembayaran.");
  return data?.[0] ?? null;
}

export async function getPaymentReceipt(id) {
  ensureConfig();
  const payment = await getPaymentById(id);
  if (!payment) throw new Error("Pembayaran tidak ditemukan.");

  const [rentalResult, historyResult] = await Promise.all([
    supabase.from("rentals").select("*").eq("id_penyewaan", payment.id_penyewaan).limit(1),
    supabase
      .from("payments")
      .select("*")
      .eq("id_penyewaan", payment.id_penyewaan)
      .eq("status_pembayaran", "Berhasil")
      .order("created_at", { ascending: true }),
  ]);

  if (rentalResult.error) throw new Error(rentalResult.error.message || "Gagal memuat penyewaan untuk nota.");
  if (historyResult.error) throw new Error(historyResult.error.message || "Gagal memuat riwayat pembayaran nota.");
  const rental = rentalResult.data?.[0];
  if (!rental) throw new Error("Penyewaan terkait pembayaran tidak ditemukan.");

  const dressResult = await supabase
    .from("dresses")
    .select("nama_dress,kode_dress,ukuran,warna")
    .eq("id_dress", rental.id_dress)
    .limit(1);
  if (dressResult.error) throw new Error(dressResult.error.message || "Gagal memuat detail dress untuk nota.");
  const dress = dressResult.data?.[0] ?? null;

  const history = safeArray(historyResult.data);
  const totalPaid = history
    .filter((entry) => entry.jenis_pembayaran !== "Denda")
    .reduce((sum, entry) => sum + normalizeNumber(entry.jumlah_bayar, 0), 0);

  return {
    payment,
    rental: {
      ...rental,
      nama_dress: dress?.nama_dress || null,
      kode_dress: dress?.kode_dress || null,
      ukuran_dress: dress?.ukuran || null,
      warna_dress: dress?.warna || null,
    },
    history,
    total_pembayaran: totalPaid,
    sisa_tagihan: Math.max(normalizeNumber(rental.total_sewa, 0) - totalPaid, 0),
  };
}

export async function getReturns() {
  ensureConfig();
  const [returnResult, rentalResult, dressResult] = await Promise.all([
    supabase.from("returns").select("*").order("tanggal_kembali_aktual", { ascending: false }),
    supabase.from("rentals").select("id_penyewaan,kode_penyewaan,nama_pelanggan,id_dress,tanggal_rencana_kembali"),
    supabase.from("dresses").select("id_dress,nama_dress"),
  ]);

  if (returnResult.error) throw new Error(returnResult.error.message || "Gagal memuat pengembalian.");
  if (rentalResult.error) throw new Error(rentalResult.error.message || "Gagal memuat data rental.");
  if (dressResult.error) throw new Error(dressResult.error.message || "Gagal memuat data dress.");

  const rentalMap = new Map(safeArray(rentalResult.data).map((rental) => [rental.id_penyewaan, rental]));
  const dressMap = new Map(safeArray(dressResult.data).map((dress) => [dress.id_dress, dress]));

  return safeArray(returnResult.data).map((row) => {
    const rental = rentalMap.get(row.id_penyewaan) || {};
    const dress = dressMap.get(rental.id_dress) || {};
    return {
      ...row,
      kode_penyewaan: rental.kode_penyewaan || null,
      nama_pelanggan: rental.nama_pelanggan || null,
      nama_dress: dress.nama_dress || null,
      tanggal_rencana_kembali: rental.tanggal_rencana_kembali || null,
    };
  });
}

export async function recordReturn(id, payload) {
  ensureConfig();
  const clean = parseBody(payload);
  const item = {
    p_id_penyewaan: id,
    p_tanggal_kembali: clean.tanggal_kembali_aktual || clean.tanggal_kembali || null,
    p_kondisi: clean.kondisi_dress || "Baik",
    p_denda_telat: normalizeNumber(clean.denda_keterlambatan, 0),
    p_denda_rusak: normalizeNumber(clean.denda_kerusakan, 0),
    p_catatan: pickNullableText(clean.catatan || clean.keterangan),
    p_kode: pickNullableText(clean.kode_pengembalian),
  };

  const { data, error } = await supabase.rpc("record_return", item);
  if (error) throw new Error(error.message || "Gagal mencatat pengembalian.");
  return data;
}

export async function getDashboard() {
  ensureConfig();
  const [dressResult, rentalResult, paymentResult, returnResult] = await Promise.all([
    supabase.from("dresses").select("id_dress,status"),
    supabase.from("rentals").select("id_penyewaan,total_sewa"),
    supabase.from("payments").select("id_pembayaran,jumlah_bayar,status_pembayaran,jenis_pembayaran"),
    supabase.from("returns").select("id_pengembalian,total_denda")
  ]);

  if (dressResult.error) throw new Error(dressResult.error.message || "Gagal memuat dashboard dress.");
  if (rentalResult.error) throw new Error(rentalResult.error.message || "Gagal memuat dashboard rental.");
  if (paymentResult.error) throw new Error(paymentResult.error.message || "Gagal memuat dashboard pembayaran.");
  if (returnResult.error) throw new Error(returnResult.error.message || "Gagal memuat dashboard pengembalian.");

  const dresses = safeArray(dressResult.data);
  const rentals = safeArray(rentalResult.data);
  const payments = safeArray(paymentResult.data);
  const returns = safeArray(returnResult.data);

  const totalDress = dresses.length;
  const availableDresses = dresses.filter((dress) => dress.status === "Tersedia").length;
  const rentedDresses = dresses.filter((dress) => dress.status === "Disewa").length;
  const totalRentals = rentals.length;
  const totalPayments = payments.filter((payment) => payment.status_pembayaran === "Berhasil").length;
  const totalReturns = returns.length;
  const totalRevenue = rentals.reduce((sum, rental) => sum + normalizeNumber(rental.total_sewa, 0), 0);

  return {
    total_dress: totalDress,
    available_dresses: availableDresses,
    rented_dresses: rentedDresses,
    total_rentals: totalRentals,
    total_payments: totalPayments,
    total_returns: totalReturns,
    total_revenue: totalRevenue,
  };
}

export async function getReportSummary(fromDate, toDate) {
  ensureConfig();
  const from = String(fromDate || new Date().toISOString().slice(0, 10));
  const to = String(toDate || from);

  const [rentalResult, paymentsResult, returnsResult, dressesResult] = await Promise.all([
    supabase
      .from("rentals")
      .select("*")
      .gte("tanggal_sewa", from)
      .lte("tanggal_sewa", to)
      .order("tanggal_sewa", { ascending: false }),
    supabase.from("payments").select("*").gte("tanggal_bayar", from).lte("tanggal_bayar", to),
    supabase.from("returns").select("*").gte("tanggal_kembali_aktual", from).lte("tanggal_kembali_aktual", to),
    supabase.from("dresses").select("id_dress,status")
  ]);

  if (rentalResult.error) throw new Error(rentalResult.error.message || "Gagal memuat laporan penyewaan.");
  if (paymentsResult.error) throw new Error(paymentsResult.error.message || "Gagal memuat laporan pembayaran.");
  if (returnsResult.error) throw new Error(returnsResult.error.message || "Gagal memuat laporan pengembalian.");
  if (dressesResult.error) throw new Error(dressesResult.error.message || "Gagal memuat laporan dress.");

  const rentals = safeArray(rentalResult.data);
  const payments = safeArray(paymentsResult.data);
  const returns = safeArray(returnsResult.data);
  const dresses = safeArray(dressesResult.data);

  const rentalPayments = new Map();
  payments
    .filter((payment) => payment.status_pembayaran === "Berhasil" && payment.jenis_pembayaran !== "Denda")
    .forEach((payment) => {
      rentalPayments.set(
        payment.id_penyewaan,
        (rentalPayments.get(payment.id_penyewaan) || 0) + normalizeNumber(payment.jumlah_bayar, 0)
      );
    });

  const totalRentalRevenue = rentals.reduce((sum, rental) => sum + normalizeNumber(rental.total_sewa, 0), 0);
  const totalPaid = payments
    .filter((payment) => payment.status_pembayaran === "Berhasil")
    .reduce((sum, payment) => sum + normalizeNumber(payment.jumlah_bayar, 0), 0);
  const totalReceivables = rentals.reduce((sum, rental) =>
    sum + Math.max(normalizeNumber(rental.total_sewa, 0) - (rentalPayments.get(rental.id_penyewaan) || 0), 0), 0);
  const totalFines = returns.reduce((sum, item) => sum + normalizeNumber(item.total_denda, 0), 0);
  const totalFinesPaid = payments
    .filter((payment) => payment.status_pembayaran === "Berhasil" && payment.jenis_pembayaran === "Denda")
    .reduce((sum, payment) => sum + normalizeNumber(payment.jumlah_bayar, 0), 0);
  const totalFinesOutstanding = Math.max(totalFines - totalFinesPaid, 0);

  return {
    total_rental_revenue: totalRentalRevenue,
    total_paid: totalPaid,
    total_receivables: totalReceivables,
    total_fines: totalFines,
    total_fines_paid: totalFinesPaid,
    total_fines_outstanding: totalFinesOutstanding,
    inventory_summary: {
      total: dresses.length,
      tersedia: dresses.filter((dress) => dress.status === "Tersedia").length,
      disewa: dresses.filter((dress) => dress.status === "Disewa").length,
      laundry: dresses.filter((dress) => dress.status === "Laundry").length,
      rusak: dresses.filter((dress) => dress.status === "Rusak").length,
    },
    rental_rows: rentals.map((rental) => {
      const totalPaid = rentalPayments.get(rental.id_penyewaan) || 0;
      return {
        ...rental,
        total_pembayaran: totalPaid,
        sisa_tagihan: Math.max(normalizeNumber(rental.total_sewa, 0) - totalPaid, 0),
      };
    }),
  };
}

export default supabase;
