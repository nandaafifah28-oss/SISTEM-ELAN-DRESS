"use strict";

import {
  createDress,
  createPayment,
  createRental,
  cancelPayment,
  cancelRental,
  deleteDress,
  generateCode,
  getDashboard,
  getDresses,
  getPayments,
  getPaymentReceipt,
  getReportSummary,
  getRentals,
  getReturns,
  isCodeAvailable,
  recordReturn,
  updateDress,
} from "../backend/config.js";

/* =========================================================
   KONFIGURASI
   ========================================================= */

/* =========================================================
   STATE
   ========================================================= */
const S = {
  dresses: [],
  rentals: [],
  payments: [],
  returns: [],
  dashboard: null,
  report: null,
};

/* =========================================================
   UTIL
   ========================================================= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const money = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function toast(message, type = "info") {
  const el = $("#toast");
  if (!el) return alert(message);
  el.textContent = message;
  el.classList.remove("ok", "err");
  if (type === "ok") el.classList.add("ok");
  if (type === "err") el.classList.add("err");
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 3500);
}

function statusPill(status) {
  const map = {
    Tersedia: "ok", Disewa: "info", Laundry: "warn", Rusak: "off",
    Dipesan: "info", Berjalan: "warn", Selesai: "ok", Dibatalkan: "off",
    Berhasil: "ok", Baik: "ok", "Rusak Ringan": "warn",
    "Rusak Berat": "off", Hilang: "off",
    "Belum Dibayar": "off", "Dibayar Sebagian": "warn", Lunas: "ok",
    "Tidak Ada Denda": "neutral",
  };
  return `<span class="pill ${map[status] || "neutral"}">${esc(status)}</span>`;
}

function paymentTypeLabel(payment) {
  if (payment.jenis_pembayaran !== "Denda") return payment.jenis_pembayaran || "Cicilan";
  if (payment.kategori_denda === "Keterlambatan") return "Denda · Keterlambatan";
  if (payment.kategori_denda === "Kerusakan/Kehilangan") return "Denda · Kerusakan/Kehilangan";
  return "Denda · Belum terkategori";
}

function normalizeFineCategory(value) {
  const normalized = String(value || "").trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
  if (["keterlambatan", "terlambat", "denda keterlambatan"].includes(normalized)) {
    return "Keterlambatan";
  }
  if (["kerusakan/kehilangan", "kerusakan", "kehilangan", "denda kerusakan/kehilangan"].includes(normalized)) {
    return "Kerusakan/Kehilangan";
  }
  return "";
}

function table(headers, rows, empty = "Belum ada data untuk ditampilkan.") {
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers
    .map((h) => `<th>${h}</th>`)
    .join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function applyFinePaymentBalances(returns, payments) {
  const paidByRental = new Map();
  payments
    .filter((payment) => payment.jenis_pembayaran === "Denda" && payment.status_pembayaran === "Berhasil")
    .forEach((payment) => {
      const balance = paidByRental.get(payment.id_penyewaan) || { total: 0, late: 0, damage: 0 };
      const amount = Number(payment.jumlah_bayar) || 0;
      balance.total += amount;
      if (payment.kategori_denda === "Keterlambatan") balance.late += amount;
      if (payment.kategori_denda === "Kerusakan/Kehilangan") balance.damage += amount;
      paidByRental.set(payment.id_penyewaan, balance);
    });

  return returns.map((rentalReturn) => {
    const paid = paidByRental.get(rentalReturn.id_penyewaan) || { total: 0, late: 0, damage: 0 };
    const lateOutstanding = Math.max(Number(rentalReturn.denda_keterlambatan || 0) - paid.late, 0);
    const damageOutstanding = Math.max(Number(rentalReturn.denda_kerusakan || 0) - paid.damage, 0);
    const totalFine = Number(rentalReturn.total_denda || 0);
    const outstanding = lateOutstanding + damageOutstanding;

    return {
      ...rentalReturn,
      total_denda_dibayar: paid.total,
      sisa_tagihan_denda: outstanding,
      status_pembayaran_denda: totalFine <= 0
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
}

function normalizeWhatsAppNumber(value) {
  if (typeof value !== "string" || !value.trim() || !/^[+\d\s().-]+$/.test(value.trim())) {
    throw new Error("Nomor telepon WhatsApp tidak valid.");
  }
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    if (!digits.startsWith("62")) throw new Error("Gunakan nomor WhatsApp Indonesia yang diawali 08 atau +62.");
  }
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  if (!/^628\d{7,11}$/.test(digits)) {
    throw new Error("Gunakan nomor WhatsApp Indonesia yang valid, misalnya 081234567890.");
  }
  return digits;
}

function whatsappChatUrl(number, message) {
  return `https://wa.me/${normalizeWhatsAppNumber(number)}?text=${encodeURIComponent(message)}`;
}

async function api(endpoint, options = {}) {
  const path = endpoint || "/";
  const method = String(options.method || "GET").toUpperCase();
  const url = new URL(path, "https://elan.local");
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  const parseBody = (body) => {
    if (body === undefined || body === null || body === "") return {};
    if (typeof body === "string") {
      try {
        return JSON.parse(body) || {};
      } catch {
        throw new Error("Format data tidak valid.");
      }
    }
    return body;
  };

  try {
    if (pathname === "/codes/next") {
      const prefix = url.searchParams.get("prefix");
      const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
      return { code: await generateCode(prefix, date) };
    }

    if (pathname === "/codes/availability") {
      const prefix = url.searchParams.get("prefix");
      const code = url.searchParams.get("code");
      const excludeId = url.searchParams.get("excludeId");
      const available = await isCodeAvailable(prefix, code, excludeId || null);
      return { available };
    }

    if (pathname === "/dashboard") {
      return { data: await getDashboard() };
    }

    if (pathname === "/dresses") {
      if (method === "GET") return { data: await getDresses() };
      if (method === "POST") return { data: await createDress(parseBody(options.body)) };
    }

    if (pathname.startsWith("/dresses/")) {
      const id = pathname.split("/").slice(-1)[0];
      if (method === "GET") return { data: await getDresses().then((rows) => rows.find((dress) => dress.id_dress === id) || null) };
      if (method === "PUT") return { data: await updateDress(id, parseBody(options.body)) };
      if (method === "DELETE") {
        const deleted = await deleteDress(id);
        return { deleted };
      }
    }

    if (pathname === "/rentals") {
      if (method === "GET") return { data: await getRentals() };
      if (method === "POST") return { data: await createRental(parseBody(options.body)) };
    }

    if (pathname.startsWith("/rentals/")) {
      const parts = pathname.split("/").filter(Boolean);
      const id = parts[1];
      const action = parts[2];
      if (method === "GET" && parts.length === 2) {
        return { data: await getRentals().then((rows) => rows.find((rental) => rental.id_penyewaan === id) || null) };
      }
      if ((method === "PATCH" || method === "POST") && action === "cancel") {
        const payload = parseBody(options.body);
        return { data: await cancelRental(id, payload?.alasan || payload?.reason || "Dibatalkan") };
      }
      if ((method === "PATCH" || method === "POST") && action === "return") {
        const payload = parseBody(options.body);
        return { data: await recordReturn(id, payload) };
      }
      if ((method === "POST" || method === "PATCH") && action === "payments") {
        const payload = parseBody(options.body);
        const paymentPayload = {
          ...payload,
          id_penyewaan: id,
        };
        return { data: await createPayment(paymentPayload) };
      }
    }

    if (pathname === "/payments") {
      if (method === "GET") return { data: await getPayments() };
      if (method === "POST") return { data: await createPayment(parseBody(options.body)) };
    }

    if (pathname.startsWith("/payments/")) {
      const parts = pathname.split("/").filter(Boolean);
      const id = parts[1];
      const action = parts[2];
      if (method === "GET" && parts.length === 2) {
        return await getPaymentReceipt(id);
      }
      if (method === "PATCH" && action === "cancel") {
        const payload = parseBody(options.body);
        return { data: await cancelPayment(id, payload?.alasan || payload?.reason || "Dibatalkan") };
      }
    }

    if (pathname === "/returns") {
      if (method === "GET") return { data: await getReturns() };
      if (method === "POST") return { data: await recordReturn(parseBody(options.body)?.id_penyewaan, parseBody(options.body)) };
    }

    if (pathname === "/reports/summary") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      return { data: await getReportSummary(from, to) };
    }
  } catch (error) {
    throw new Error(error.message || "Operasi data gagal.");
  }

  throw new Error(`Endpoint tidak didukung: ${pathname}`);
}

const CODE_FIELDS = [
  { id: "dressCodeDisplay", prefix: "DRS", dateId: null },
  { id: "rentalCode", prefix: "RNT", dateId: "tanggal_sewa" },
  { id: "dpPaymentCode", prefix: "PAY", dateId: null },
  { id: "paymentCode", prefix: "PAY", dateId: "tanggal_bayar" },
  { id: "returnCode", prefix: "RTN", dateId: "tanggal_kembali_aktual" },
];

async function prepareCode(field, force = false) {
  const input = $(`#${field.id}`);
  if (!input || input.dataset.codeLocked === "true" || input.dataset.codeManual === "true") return;
  if (!force && input.value) return;
  const generation = Number(input.dataset.generation || 0) + 1;
  input.dataset.generation = String(generation);
  const date = field.dateId ? $(`#${field.dateId}`)?.value || localDateValue() : localDateValue();
  try {
    const result = await api(`/codes/next?prefix=${field.prefix}&date=${encodeURIComponent(date)}`);
    if (input.dataset.generation === String(generation) && input.dataset.codeManual !== "true") {
      input.value = result.code;
    }
  } catch (error) {
    toast(error.message, "err");
  }
}

function resetCodeInput(field, generate = true) {
  const input = $(`#${field.id}`);
  if (!input) return;
  input.value = "";
  input.dataset.codeManual = "false";
  input.dataset.codeLocked = "false";
  if (generate) void prepareCode(field);
}

async function validateCodeField(field, excludeId = null) {
  const input = $(`#${field.id}`);
  const code = input.value.trim().toUpperCase();
  const pattern = new RegExp(`^${field.prefix}-\\d{6}-\\d{4}$`);
  if (!pattern.test(code)) throw new Error(`Format kode ${field.prefix} tidak valid. Gunakan ${field.prefix}-DDMMYY-0001.`);
  input.value = code;
  const query = new URLSearchParams({ prefix: field.prefix, code });
  if (excludeId) query.set("excludeId", excludeId);
  const result = await api(`/codes/availability?${query}`);
  if (!result.available) throw new Error("Kode transaksi sudah digunakan. Silakan pilih kode lain.");
  return code;
}

/* =========================================================
   NAVIGASI
   ========================================================= */
const PAGE_TITLES = {
  dashboard: "Dashboard",
  dresses: "Data Dress",
  rentals: "Penyewaan",
  payments: "Pembayaran",
  returns: "Pengembalian",
  reports: "Laporan",
};

function go(page) {
  $$(".page").forEach((section) => section.classList.remove("active"));
  const target = $(`#${page}Page`);
  if (target) target.classList.add("active");

  $$(".nav-button").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.page === page)
  );
  const titleEl = $("#pageTitle");
  if (titleEl) titleEl.textContent = PAGE_TITLES[page] || "Dashboard";

  if (page === "dashboard") loadDashboard();
  if (page === "dresses") { loadDresses(); void prepareCode(CODE_FIELDS[0]); }
  if (page === "rentals") {
    loadRentals();
    void prepareCode(CODE_FIELDS[1]);
    if (Number($("#dp")?.value || 0) > 0) void prepareCode(CODE_FIELDS[2]);
  }
  if (page === "payments") { loadPayments(); void prepareCode(CODE_FIELDS[3]); }
  if (page === "returns") { loadReturns(); void prepareCode(CODE_FIELDS[4]); }
  if (page === "reports") loadReport();
}

/* =========================================================
   DASHBOARD
   ========================================================= */
async function loadDashboard() {
  ["#statDressTotal", "#statDressAvailable", "#statDressRented", "#statRentalTotal",
    "#statPaymentTotal", "#statReturnTotal", "#statRevenue"].forEach((selector) => {
    const element = $(selector);
    if (element) element.textContent = "Memuat...";
  });
  try {
    const response = await api("/dashboard");
    const data = response.data;
    S.dashboard = data;

    const stats = {
      "#statDressTotal": data.total_dress,
      "#statDressAvailable": data.available_dresses,
      "#statDressRented": data.rented_dresses,
      "#statRentalTotal": data.total_rentals,
      "#statPaymentTotal": data.total_payments,
      "#statReturnTotal": data.total_returns,
      "#statRevenue": money(data.total_revenue),
    };
    Object.entries(stats).forEach(([selector, value]) => {
      const element = $(selector);
      if (element) element.textContent = value;
    });
  } catch (error) {
    console.error(error);
    S.dashboard = null;
    ["#statDressTotal", "#statDressAvailable", "#statDressRented", "#statRentalTotal",
      "#statPaymentTotal", "#statReturnTotal", "#statRevenue"].forEach((selector) => {
      const element = $(selector);
      if (element) element.textContent = "—";
    });
    toast(error.message, "err");
  }
}

async function refreshAccountingViews() {
  await loadDashboard();
  if (S.report) await loadReport();
}

/* =========================================================
   DATA DRESS
   ========================================================= */
async function loadDresses() {
  $("#dressesTable").innerHTML = `<div class="loading">Memuat data</div>`;
  try {
    const res = await api("/dresses");
    S.dresses = res.data || [];
    populateDressFilters();
    renderDresses();
  } catch (error) {
    $("#dressesTable").innerHTML = `<div class="empty">Gagal memuat: ${esc(error.message)}</div>`;
    toast(error.message, "err");
  }
}

function populateDressFilters() {
  const ukuran = [...new Set(S.dresses.map((d) => d.ukuran))].sort();
  const warna = [...new Set(S.dresses.map((d) => d.warna))].sort();

  const uSel = $("#dressFilterUkuran");
  const wSel = $("#dressFilterWarna");
  if (!uSel || !wSel) return;
  const currentU = uSel.value;
  const currentW = wSel.value;

  uSel.innerHTML = `<option value="">Semua ukuran</option>` +
    ukuran.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
  wSel.innerHTML = `<option value="">Semua warna</option>` +
    warna.map((w) => `<option value="${esc(w)}">${esc(w)}</option>`).join("");

  if (ukuran.includes(currentU)) uSel.value = currentU;
  if (warna.includes(currentW)) wSel.value = currentW;
}

function renderDresses() {
  const q = ($("#dressSearch")?.value || "").trim().toLowerCase();
  const fs = $("#dressFilterStatus")?.value || "";
  const fu = $("#dressFilterUkuran")?.value || "";
  const fw = $("#dressFilterWarna")?.value || "";

  const rows = S.dresses.filter((d) => {
    if (fs && d.status !== fs) return false;
    if (fu && d.ukuran !== fu) return false;
    if (fw && d.warna !== fw) return false;
    if (q && !`${d.kode_dress} ${d.nama_dress}`.toLowerCase().includes(q)) return false;
    return true;
  });

  $("#dressesTable").innerHTML = table(
    ["Kode", "Nama Dress", "Kategori", "Ukuran", "Warna", "Tarif Sewa", "Status", "Aksi"],
    rows.map((d) =>
      `<tr>
        <td><b>${esc(d.kode_dress)}</b></td>
        <td>${esc(d.nama_dress)}</td>
        <td>${esc(d.kategori || "Lainnya")}</td>
        <td>${esc(d.ukuran)}</td>
        <td>${esc(d.warna)}</td>
        <td>${money(d.tarif_sewa)}</td>
        <td>${statusPill(d.status)}</td>
        <td>
          <button class="mini" data-edit-dress="${d.id_dress}">Edit</button>
          <button class="mini danger" data-del-dress="${d.id_dress}">Hapus</button>
        </td>
      </tr>`
    ),
    "Belum ada dress. Tambahkan dress pertama Anda."
  );
}

function resetDressForm() {
  $("#dressForm")?.reset();
  const id = $("#dressId");
  const submit = $("#dressSubmit");
  const cancel = $("#dressCancel");
  if (id) id.value = "";
  resetCodeInput(CODE_FIELDS[0]);
  if (submit) submit.textContent = "Tambah Dress";
  cancel?.classList.add("hidden");
}

function fillDressForm(d) {
  const form = $("#dressForm");
  if (!form) return;

  $("#dressId").value = d.id_dress;
  $("#dressCodeDisplay").value = d.kode_dress || "";
  $("#dressCodeDisplay").dataset.codeLocked = "true";
  $("#dressCodeDisplay").dataset.codeManual = "false";
  $("#nama_dress").value = d.nama_dress || "";
  $("#ukuran").value = d.ukuran || "";
  $("#warna").value = d.warna || "";
  $("#tarif_sewa").value = d.tarif_sewa ?? "";
  $("#dressStatus").value = d.status || "Tersedia";
  $("#dressSubmit").textContent = "Simpan Perubahan";
  $("#dressCancel").classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  $("#nama_dress").focus({ preventScroll: true });
}

/* =========================================================
   PENYEWAAN
   ========================================================= */
async function loadRentals() {
  $("#rentalsTable").innerHTML = `<div class="loading">Memuat data</div>`;
  try {
    const [resRental, resDress] = await Promise.all([
      api("/rentals"),
      S.dresses.length ? Promise.resolve({ data: S.dresses }) : api("/dresses"),
    ]);
    S.rentals = resRental.data || [];
    if (resDress.data) S.dresses = resDress.data;
    populateRentalDressSelect();
    renderRentals();
    populateRentalSelects();
  } catch (error) {
    $("#rentalsTable").innerHTML = `<div class="empty">Gagal memuat: ${esc(error.message)}</div>`;
    toast(error.message, "err");
  }
}

function populateRentalDressSelect() {
  const sel = $("#id_dress");
  if (!sel) return;
  const current = sel.value;
  const options = S.dresses
    .filter((d) => d.status === "Tersedia" || d.id_dress === current)
    .map((d) =>
      `<option value="${esc(d.id_dress)}">${esc(d.kode_dress)} — ${esc(d.nama_dress)} (${esc(d.ukuran)}, ${esc(d.warna)}) · ${money(d.tarif_sewa)}</option>`
    ).join("");
  sel.innerHTML = `<option value="">Pilih dress</option>` + options;
}

function renderRentals() {
  const q = ($("#rentalSearch")?.value || "").trim().toLowerCase();
  const fs = $("#rentalFilterStatus")?.value || "";
  const rows = S.rentals.filter((r) => {
    if (fs && r.status_penyewaan !== fs) return false;
    if (q && !`${r.kode_penyewaan} ${r.nama_pelanggan} ${r.no_telepon}`.toLowerCase().includes(q)) return false;
    return true;
  });

  $("#rentalsTable").innerHTML = table(
    ["Kode", "Pelanggan", "Dress", "Tgl Sewa", "Rencana Kembali", "Total", "Dibayar", "Sisa", "Status", "Aksi"],
    rows.map((r) =>
      `<tr>
        <td><b>${esc(r.kode_penyewaan)}</b></td>
        <td>${esc(r.nama_pelanggan)}<br><small>${esc(r.no_telepon)}</small></td>
        <td>${esc(r.nama_dress || "-")}</td>
        <td>${esc(r.tanggal_sewa)}</td>
        <td>${esc(r.tanggal_rencana_kembali)}</td>
        <td><b>${money(r.total_sewa)}</b></td>
        <td>${money(r.total_pembayaran)}</td>
        <td>${money(r.sisa_tagihan)}</td>
        <td>${statusPill(r.status_penyewaan)}</td>
        <td>
          <button class="mini" data-whatsapp-rental="${esc(r.id_penyewaan)}">WhatsApp</button>
          <button class="mini" data-rental-history="${esc(r.id_penyewaan)}">Riwayat Nota</button>
          ${!["Selesai", "Dibatalkan"].includes(r.status_penyewaan)
            ? `<button class="mini danger" data-cancel-rental="${esc(r.id_penyewaan)}">Batal</button>` : ""}
        </td>
      </tr>`
    ),
    "Belum ada transaksi penyewaan."
  );
}

function openWhatsAppComposer(rental) {
  const fine = rental.return;
  const fineTotal = fine ? Number(fine.total_denda || 0) : null;
  const finePaid = Number(rental.total_denda_dibayar || 0);
  const fineOutstanding = Math.max(Number(rental.sisa_denda || 0), 0);
  const rentOutstanding = Math.max(Number(rental.sisa_tagihan || 0), 0);
  const templateOptions = [
    { id: "payment", label: "Pengingat pelunasan" },
    { id: "return", label: "Pengingat pengembalian" },
    { id: "fine", label: "Informasi denda / kekurangan" },
    { id: "promo", label: "Promosi" },
  ];
  const modal = $("#modalOverlay");
  $("#modalTitle").textContent = "Pesan WhatsApp";
  $("#modalDesc").textContent = `${rental.nama_pelanggan || "Pelanggan"} · ${rental.kode_penyewaan}`;
  $("#modalBody").innerHTML = `
    <div class="field whatsapp-field">
      <label for="whatsappTemplate">Template pesan</label>
      <select id="whatsappTemplate">${templateOptions.map((item) =>
        `<option value="${item.id}">${item.label}</option>`
      ).join("")}</select>
    </div>
    <div class="field whatsapp-field">
      <label for="whatsappMessage">Pratinjau pesan (dapat diedit)</label>
      <textarea id="whatsappMessage" rows="9"></textarea>
    </div>
    <p id="whatsappNumberStatus" class="whatsapp-number-status"></p>
    <a id="whatsappOpen" class="primary-btn whatsapp-open" target="_blank" rel="noopener noreferrer">Buka WhatsApp</a>`;
  modal.classList.remove("hidden");

  const select = $("#whatsappTemplate");
  const messageField = $("#whatsappMessage");
  const openButton = $("#whatsappOpen");
  const numberStatus = $("#whatsappNumberStatus");
  select.value = "payment";
  const greeting = `Halo ${rental.nama_pelanggan || "Kak"},`;
  const templates = {
    payment: `${greeting}\n\n${rentOutstanding > 0
      ? `Kami mengingatkan bahwa tagihan penyewaan ${rental.kode_penyewaan} masih tersisa ${money(rentOutstanding)}.`
      : `Informasi pembayaran penyewaan ${rental.kode_penyewaan}: tidak ada sisa tagihan sewa yang tercatat.`} Silakan hubungi ÉLAN jika memerlukan konfirmasi. Terima kasih.`,
    return: `${greeting}\n\nPengingat dari ÉLAN mengenai dress untuk penyewaan ${rental.kode_penyewaan}: ${rental.tanggal_rencana_kembali
      ? `tanggal rencana kembali tercatat ${rental.tanggal_rencana_kembali}.`
      : "tanggal rencana kembali belum tercatat pada sistem."} Mohon hubungi kami jika memerlukan konfirmasi. Terima kasih.`,
    fine: `${greeting}\n\nRingkasan penyewaan ${rental.kode_penyewaan}:\n${fine
      ? `Total denda yang dinilai: ${money(fineTotal)}\nDenda telah dibayar: ${money(finePaid)}\nSisa denda: ${money(fineOutstanding)}`
      : "Belum ada pengembalian atau penilaian denda yang tercatat."}\nSisa tagihan sewa: ${money(rentOutstanding)}\n\nSilakan hubungi ÉLAN jika memerlukan rincian. Terima kasih.`,
    promo: `${greeting}\n\nTerima kasih telah mempercayakan kebutuhan dress Anda kepada ÉLAN. Kami memiliki koleksi terbaru untuk acara spesial Anda berikutnya. Hubungi kami untuk informasi dan ketersediaan. Sampai jumpa!`,
  };
  const refreshWhatsAppLink = () => {
    const message = messageField.value.trim();
    try {
      if (!message) throw new Error("Isi pesan sebelum membuka WhatsApp.");
      openButton.href = whatsappChatUrl(rental.no_telepon, message);
      openButton.removeAttribute("aria-disabled");
      openButton.classList.remove("disabled");
      numberStatus.textContent = `Pesan akan disiapkan untuk ${rental.no_telepon}. Pesan hanya dikirim setelah Anda menekan tombol kirim di WhatsApp.`;
      numberStatus.classList.remove("error");
    } catch (error) {
      openButton.removeAttribute("href");
      openButton.setAttribute("aria-disabled", "true");
      openButton.classList.add("disabled");
      numberStatus.textContent = error.message;
      numberStatus.classList.add("error");
    }
  };
  const applyTemplate = () => {
    messageField.value = templates[select.value];
    refreshWhatsAppLink();
  };
  select.addEventListener("change", applyTemplate);
  messageField.addEventListener("input", refreshWhatsAppLink);
  applyTemplate();
}

function populateRentalSelects() {
  const pSel = $("#paymentRentalId");
  if (pSel) {
    const current = pSel.value;
    const paymentType = $("#jenis_pembayaran")?.value || "Cicilan";
    const fineCategory = $("#fineCategory")?.value || "Keterlambatan";
    if (paymentType === "Denda") {
      const fineInvoices = S.returns.map((r) => ({
        ...r,
        sisa: fineCategory === "Keterlambatan"
          ? Number(r.sisa_denda_keterlambatan || 0)
          : Number(r.sisa_denda_kerusakan || 0),
      })).filter((r) => r.sisa > 0);
      pSel.innerHTML = `<option value="">Pilih tagihan denda</option>` + fineInvoices.map((r) =>
        `<option value="${esc(r.id_penyewaan)}">${esc(r.kode_penyewaan)} — ${esc(r.nama_pelanggan || "Pelanggan")} (sisa denda: ${money(r.sisa)})</option>`
      ).join("");
      if (fineInvoices.some((r) => r.id_penyewaan === current)) pSel.value = current;
    } else {
      const paymentRentals = S.rentals.filter((r) =>
        r.status_penyewaan !== "Dibatalkan" && Number(r.sisa_tagihan) > 0
      );
      pSel.innerHTML = `<option value="">Pilih transaksi</option>` + paymentRentals.map((r) =>
        `<option value="${esc(r.id_penyewaan)}">${esc(r.kode_penyewaan)} — ${esc(r.nama_pelanggan)} (sisa sewa: ${money(r.sisa_tagihan)})</option>`
      ).join("");
      if (paymentRentals.some((r) => r.id_penyewaan === current)) pSel.value = current;
    }
  }

  const rSel = $("#returnRentalId");
  if (rSel) {
    const currentR = rSel.value;
    const returnOpts = S.rentals
      .filter((r) => ["Dipesan", "Berjalan"].includes(r.status_penyewaan))
      .map((r) =>
        `<option value="${esc(r.id_penyewaan)}">${esc(r.kode_penyewaan)} — ${esc(r.nama_pelanggan)}</option>`
      ).join("");
    rSel.innerHTML = `<option value="">Pilih transaksi</option>` + returnOpts;
    if (S.rentals.some((r) => r.id_penyewaan === currentR)) rSel.value = currentR;
  }
}

/* =========================================================
   PEMBAYARAN
   ========================================================= */
async function loadPayments() {
  $("#paymentsTable").innerHTML = `<div class="loading">Memuat data</div>`;
  $("#fineInvoicesTable").innerHTML = `<div class="loading">Memuat tagihan denda</div>`;
  try {
    const [res, rentalsResponse, returnsResponse] = await Promise.all([
      api("/payments"),
      api("/rentals"),
      api("/returns"),
    ]);
    S.payments = res.data || [];
    S.rentals = rentalsResponse.data || [];
    S.returns = applyFinePaymentBalances(returnsResponse.data || [], S.payments);
    renderPayments();
    renderFineInvoices();
    populateRentalSelects();
  } catch (error) {
    $("#paymentsTable").innerHTML = `<div class="empty">Gagal memuat: ${esc(error.message)}</div>`;
    $("#fineInvoicesTable").innerHTML = `<div class="empty">Tagihan denda gagal dimuat: ${esc(error.message)}</div>`;
    toast(error.message, "err");
  }
}

function renderFineInvoices() {
  const invoiceRows = S.returns.flatMap((rentalReturn) => [
    {
      ...rentalReturn,
      kategori_denda: "Keterlambatan",
      nominal_denda: Number(rentalReturn.denda_keterlambatan || 0),
      nominal_dibayar: Number(rentalReturn.denda_keterlambatan_dibayar || 0),
      sisa: Number(rentalReturn.sisa_denda_keterlambatan || 0),
    },
    {
      ...rentalReturn,
      kategori_denda: "Kerusakan/Kehilangan",
      nominal_denda: Number(rentalReturn.denda_kerusakan || 0),
      nominal_dibayar: Number(rentalReturn.denda_kerusakan_dibayar || 0),
      sisa: Number(rentalReturn.sisa_denda_kerusakan || 0),
    },
  ]).filter((invoice) => invoice.nominal_denda > 0 && invoice.sisa > 0);

  $("#fineInvoicesTable").innerHTML = table(
    ["Referensi Penyewaan", "Pelanggan", "Jenis Denda", "Denda Awal", "Sudah Dibayar", "Sisa Tagihan", "Aksi"],
    invoiceRows.map((invoice) =>
      `<tr>
        <td><b>${esc(invoice.kode_penyewaan)}</b></td>
        <td>${esc(invoice.nama_pelanggan || "-")}</td>
        <td>${esc(invoice.kategori_denda)}</td>
        <td>${money(invoice.nominal_denda)}</td>
        <td>${money(invoice.nominal_dibayar)}</td>
        <td><b>${money(invoice.sisa)}</b></td>
        <td><button class="mini primary-btn" type="button" data-pay-fine
          data-rental-id="${esc(invoice.id_penyewaan)}"
          data-category="${esc(invoice.kategori_denda)}"
          data-balance="${invoice.sisa}">Bayar Denda</button></td>
      </tr>`
    ),
    "Tidak ada tagihan denda yang belum lunas."
  );
}

function renderPayments() {
  const q = ($("#paymentSearch")?.value || "").trim().toLowerCase();
  const fj = $("#paymentFilterJenis")?.value || "";
  const fs = $("#paymentFilterStatus")?.value || "";

  const rows = S.payments.filter((p) => {
    if (fj && p.jenis_pembayaran !== fj) return false;
    if (fs && p.status_pembayaran !== fs) return false;
    if (q && !`${p.kode_pembayaran} ${p.kode_penyewaan} ${p.nama_pelanggan || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const totalBerhasil = S.payments
    .filter((p) => p.status_pembayaran === "Berhasil")
    .reduce((s, p) => s + Number(p.jumlah_bayar), 0);

  $("#paymentsTable").innerHTML =
    `<div style="margin-bottom:10px;font-size:12px;color:var(--muted);">Total penerimaan berhasil: <b style="color:var(--coffee);">${money(totalBerhasil)}</b></div>` +
    table(
      ["Kode Bayar", "Penyewaan", "Pelanggan", "Jenis", "Tanggal", "Jumlah", "Metode", "Status", "Nota / Aksi"],
      rows.map((p) =>
        `<tr>
          <td><b>${esc(p.kode_pembayaran)}</b></td>
          <td>${esc(p.kode_penyewaan)}</td>
          <td>${esc(p.nama_pelanggan || "-")}</td>
          <td>${esc(paymentTypeLabel(p))}</td>
          <td>${esc(p.tanggal_bayar)}</td>
          <td><b>${money(p.jumlah_bayar)}</b></td>
          <td>${esc(p.metode_pembayaran)}</td>
          <td>${statusPill(p.status_pembayaran)}</td>
          <td class="payment-actions">
            ${p.status_pembayaran === "Berhasil" ? `<button class="mini" data-payment-receipt="${esc(p.id_pembayaran)}">Lihat Nota</button>` : ""}
            ${p.status_pembayaran === "Berhasil" ? `<button class="mini danger" data-cancel-payment="${esc(p.id_pembayaran)}">Batalkan</button>` : ""}
          </td>
        </tr>`
      ),
      "Belum ada pembayaran."
    );
}

async function showPaymentReceipt(paymentId) {
  const overlay = $("#receiptOverlay");
  const paper = $("#receiptPaper");
  paper.innerHTML = `<div class="loading">Menyiapkan nota pembayaran...</div>`;
  overlay.classList.remove("hidden");

  try {
    const data = await api(`/payments/${encodeURIComponent(paymentId)}`);
    const { payment, rental } = data;
    if (!payment || !rental) throw new Error("Data nota tidak lengkap.");
    if (payment.status_pembayaran !== "Berhasil") throw new Error("Nota hanya tersedia untuk pembayaran yang berhasil.");

    const paidThisPayment = Number(payment.jumlah_bayar || 0);
    const isRentalPayment = payment.jenis_pembayaran !== "Denda";
    const history = data.history || [];
    let totalPaidAtPayment = 0;
    for (const entry of history) {
      if (entry.jenis_pembayaran !== "Denda") {
        totalPaidAtPayment += Number(entry.jumlah_bayar || 0);
      }
      if (entry.id_pembayaran === payment.id_pembayaran) break;
    }
    const hasSnapshot = payment.total_dibayar_saat_bayar !== null &&
      payment.total_dibayar_saat_bayar !== undefined;
    const totalPaid = hasSnapshot
      ? Number(payment.total_dibayar_saat_bayar)
      : history.some((entry) => entry.id_pembayaran === payment.id_pembayaran)
        ? totalPaidAtPayment
        : Number(data.total_pembayaran || 0);
    const paidBefore = hasSnapshot
      ? Math.max(0, totalPaid - (isRentalPayment ? paidThisPayment : 0))
      : isRentalPayment && payment.status_pembayaran === "Berhasil"
        ? Math.max(0, totalPaid - paidThisPayment)
        : totalPaid;
    const remaining = hasSnapshot
      ? Number(payment.sisa_tagihan_saat_bayar)
      : isRentalPayment
        ? Math.max(0, Number(rental.total_sewa || 0) - totalPaid)
        : Number(data.sisa_tagihan || 0);
    const receiptStatus = payment.status_tagihan_saat_bayar ||
      (remaining === 0
        ? "LUNAS"
        : payment.jenis_pembayaran === "DP"
          ? "DP — PEMBAYARAN BELUM LUNAS"
          : paidBefore > 0
            ? "CICILAN — PEMBAYARAN BELUM LUNAS"
            : "PEMBAYARAN BELUM LUNAS");
    const isSettled = receiptStatus === "LUNAS" || remaining === 0;
    const paymentDate = payment.tanggal_bayar || payment.created_at?.slice(0, 10) || "-";

    paper.innerHTML = `
      <div class="receipt-brand">
        <div class="receipt-monogram">É</div>
        <h1>ÉLAN</h1>
        <p>Dress Rental &amp; Atelier</p>
        <span>BUKTI PEMBAYARAN</span>
      </div>
      <div class="receipt-status ${isSettled ? "settled" : ""}">
        ${esc(receiptStatus)}
      </div>
      <div class="receipt-rule"></div>
      <div class="receipt-meta">
        <div><span>No. Nota</span><b>${esc(payment.kode_pembayaran || payment.id_pembayaran)}</b></div>
        <div><span>Tanggal</span><b>${esc(paymentDate)}</b></div>
        <div><span>No. Penyewaan</span><b>${esc(rental.kode_penyewaan)}</b></div>
        <div><span>Status transaksi</span><b>${esc(receiptStatus)}</b></div>
      </div>
      <div class="receipt-rule receipt-rule-dashed"></div>
      <div class="receipt-section-title">DITERIMA DARI</div>
      <div class="receipt-meta">
        <div><span>Nama pelanggan</span><b>${esc(rental.nama_pelanggan)}</b></div>
        <div><span>No. telepon</span><b>${esc(rental.no_telepon || "-")}</b></div>
        ${rental.alamat ? `<div><span>Alamat</span><b>${esc(rental.alamat)}</b></div>` : ""}
      </div>
      <div class="receipt-rule receipt-rule-dashed"></div>
      <div class="receipt-section-title">RINCIAN PEMBAYARAN</div>
      <div class="receipt-item">
        <div class="receipt-item-name">${esc(rental.nama_dress || "Penyewaan Dress")} · ${esc(rental.kode_dress || "")}</div>
        <div class="receipt-item-values"><span>Ukuran / warna</span><span>${esc(rental.ukuran_dress || "-")} / ${esc(rental.warna_dress || "-")}</span></div>
        <div class="receipt-item-values"><span>${esc(rental.tanggal_sewa)} s/d ${esc(rental.tanggal_rencana_kembali)}</span><span>${money(rental.total_sewa)}</span></div>
        <div class="receipt-item-values"><span>Jenis pembayaran</span><span>${esc(paymentTypeLabel(payment))}</span></div>
        <div class="receipt-item-values"><span>Metode pembayaran</span><span>${esc(payment.metode_pembayaran)}</span></div>
        ${payment.referensi ? `<div class="receipt-item-values"><span>Referensi</span><span>${esc(payment.referensi)}</span></div>` : ""}
      </div>
      <div class="receipt-rule"></div>
      <div class="receipt-summary">
        <div><span>Total sewa</span><b>${money(rental.total_sewa)}</b></div>
        <div><span>Pembayaran sebelumnya</span><b>${money(paidBefore)}</b></div>
        <div class="receipt-total"><span>Dibayar saat ini</span><b>${money(paidThisPayment)}</b></div>
        <div class="receipt-balance"><span>Sisa tagihan</span><b>${money(remaining)}</b></div>
      </div>
      <div class="receipt-rule receipt-rule-dashed"></div>
      <div class="receipt-footer">
        <b>Terima kasih telah mempercayakan ÉLAN.</b>
        <span>Bukti transaksi pembayaran yang tercatat di sistem ÉLAN.</span>
        <small>Dicetak pada ${esc(new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date()))}</small>
      </div>`;
  } catch (error) {
    paper.innerHTML = `<div class="empty">Nota gagal dimuat: ${esc(error.message)}</div>`;
    toast(error.message, "err");
  }
}

/* =========================================================
   PENGEMBALIAN
   ========================================================= */
async function loadReturns() {
  $("#returnsTable").innerHTML = `<div class="loading">Memuat data</div>`;
  try {
    const [returnsResponse, paymentsResponse, rentalsResponse] = await Promise.all([
      api("/returns"),
      api("/payments"),
      api("/rentals"),
    ]);
    S.payments = paymentsResponse.data || [];
    S.rentals = rentalsResponse.data || [];
    S.returns = applyFinePaymentBalances(returnsResponse.data || [], S.payments);
    renderReturns();
    renderFineInvoices();
    populateRentalSelects();
  } catch (error) {
    $("#returnsTable").innerHTML = `<div class="empty">Gagal memuat: ${esc(error.message)}</div>`;
    toast(error.message, "err");
  }
}

function renderReturns() {
  $("#returnsTable").innerHTML = table(
    ["Kode Penyewaan", "Pelanggan", "Dress", "Rencana Kembali", "Kembali Aktual", "Terlambat", "Kondisi", "Denda Telat", "Denda Rusak", "Total Denda", "Denda Dibayar", "Sisa Denda", "Status Denda"],
    S.returns.map((r) =>
      `<tr>
        <td><b>${esc(r.kode_penyewaan)}</b></td>
        <td>${esc(r.nama_pelanggan || "-")}</td>
        <td>${esc(r.nama_dress || "-")}</td>
        <td>${esc(r.tanggal_rencana_kembali || "-")}</td>
        <td>${esc(r.tanggal_kembali_aktual)}</td>
        <td>${r.hari_terlambat} hari</td>
        <td>${statusPill(r.kondisi_dress)}</td>
        <td>${money(r.denda_keterlambatan)}</td>
        <td>${money(r.denda_kerusakan)}</td>
        <td><b>${money(r.total_denda)}</b></td>
        <td>${money(r.total_denda_dibayar)}</td>
        <td>${money(r.sisa_tagihan_denda)}</td>
        <td>${statusPill(r.status_pembayaran_denda)}</td>
      </tr>`
    ),
    "Belum ada pengembalian tercatat."
  );
}

async function showRentalPaymentHistory(rentalId) {
  const overlay = $("#modalOverlay");
  const body = $("#modalBody");
  const rental = S.rentals.find((item) => item.id_penyewaan === rentalId);
  if (!rental) return toast("Data penyewaan tidak ditemukan.", "err");
  $("#modalTitle").textContent = `Riwayat Nota · ${rental.kode_penyewaan}`;
  $("#modalDesc").textContent = `${rental.nama_pelanggan} · ${rental.nama_dress || "Dress"} · ${rental.tanggal_sewa}`;
  body.innerHTML = table(
    ["Kode Pembayaran", "Tanggal", "Jenis", "Jumlah", "Status", "Nota"],
    (rental.payments || []).map((payment) =>
      `<tr>
        <td><b>${esc(payment.kode_pembayaran)}</b></td>
        <td>${esc(payment.tanggal_bayar)}</td>
        <td>${esc(paymentTypeLabel(payment))}</td>
        <td>${money(payment.jumlah_bayar)}</td>
        <td>${statusPill(payment.status_pembayaran)}</td>
        <td>${payment.status_pembayaran === "Berhasil"
          ? `<button class="mini" data-history-receipt="${esc(payment.id_pembayaran)}">Lihat Nota</button>`
          : `<span class="muted">Nota tidak tersedia</span>`}</td>
      </tr>`
    ),
    "Belum ada riwayat pembayaran."
  );
  overlay.classList.remove("hidden");
}

/* =========================================================
   LAPORAN
   ========================================================= */
async function loadReport() {
  const from = $("#reportFrom");
  const to = $("#reportTo");
  if (!from || !to) return;
  if (!from.value || !to.value) {
    const today = new Date();
    to.value = localDateValue(today);
    from.value = localDateValue(new Date(today.getFullYear(), today.getMonth(), 1));
  }
  if (from.value > to.value) {
    $("#reportStatus").textContent = "Tanggal awal tidak boleh melewati tanggal akhir.";
    return;
  }
  const btn = $("#loadReport");
  btn.disabled = true;
  btn.textContent = "Memuat...";
  $("#reportStatus").textContent = "Mengambil data laporan...";

  try {
    const response = await api(
      `/reports/summary?from=${encodeURIComponent(from.value)}&to=${encodeURIComponent(to.value)}`
    );
    const data = response.data;
    S.report = data;

    $("#reportRevenue").textContent = money(data.total_rental_revenue);
    $("#reportPaid").textContent = money(data.total_paid);
    $("#reportReceivables").textContent = money(data.total_receivables);
    $("#reportFines").textContent = money(data.total_fines);
    $("#reportFinesPaid").textContent = money(data.total_fines_paid);
    $("#reportFinesOutstanding").textContent = money(data.total_fines_outstanding);

    const inv = data.inventory_summary || {};
    $("#reportInventory").innerHTML = `
      <div class="report-grid">
        <div class="report-card"><span class="title">Total Dress</span><strong>${inv.total || 0}</strong></div>
        <div class="report-card"><span class="title">Tersedia</span><strong>${inv.tersedia || 0}</strong></div>
        <div class="report-card"><span class="title">Disewa</span><strong>${inv.disewa || 0}</strong></div>
        <div class="report-card"><span class="title">Laundry</span><strong>${inv.laundry || 0}</strong></div>
        <div class="report-card"><span class="title">Rusak</span><strong>${inv.rusak || 0}</strong></div>
      </div>`;

    $("#reportTable").innerHTML = table(
      ["Kode", "Tanggal", "Pelanggan", "Total Sewa", "Dibayar", "Sisa", "Status"],
      (data.rental_rows || []).map((r) =>
        `<tr>
          <td><b>${esc(r.kode_penyewaan)}</b></td>
          <td>${esc(r.tanggal_sewa)}</td>
          <td>${esc(r.nama_pelanggan)}</td>
          <td>${money(r.total_sewa)}</td>
          <td>${money(r.total_pembayaran)}</td>
          <td>${money(r.sisa_tagihan)}</td>
          <td>${statusPill(r.status_penyewaan)}</td>
        </tr>`
      ),
      "Belum ada data penyewaan pada periode ini."
    );

    $("#reportStatus").textContent =
      `Periode ${from.value} s/d ${to.value} · ${data.rental_rows?.length || 0} transaksi sewa · ` +
      "total denda mengikuti tanggal kembali aktual; denda dibayar mengikuti tanggal pembayaran aktual.";
  } catch (error) {
    $("#reportStatus").textContent = "Laporan gagal dimuat: " + error.message;
    toast(error.message, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "Tampilkan Laporan";
  }
}

/* =========================================================
   EVENT BINDING
   ========================================================= */
function bindEvents() {
  $("#dashboardAddRental")?.addEventListener("click", () => {
    go("rentals");
    $("#rentalForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#id_dress")?.focus({ preventScroll: true });
  });

  CODE_FIELDS.forEach((field) => {
    const input = $(`#${field.id}`);
    input?.addEventListener("input", () => {
      if (input.dataset.codeLocked !== "true") input.dataset.codeManual = "true";
    });
    if (field.dateId) {
      $(`#${field.dateId}`)?.addEventListener("change", () => {
        void prepareCode(field, true);
      });
    }
  });

  // ---- Navigasi ----
  $$(".nav-button").forEach((btn) => {
    btn.addEventListener("click", () => go(btn.dataset.page));
  });

  // ---- Dress Form ----
  const dressForm = $("#dressForm");
  if (dressForm) {
    dressForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = $("#dressId").value;
      const payload = {
        nama_dress: $("#nama_dress").value.trim(),
        ukuran: $("#ukuran").value.trim(),
        warna: $("#warna").value.trim(),
        tarif_sewa: Number($("#tarif_sewa").value),
        status: $("#dressStatus").value,
      };
      const btn = $("#dressSubmit");
      btn.disabled = true;
      try {
        payload.kode_dress = await validateCodeField(CODE_FIELDS[0], id || null);
        if (id) {
          await api(`/dresses/${encodeURIComponent(id)}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
          toast("Dress berhasil diperbarui.", "ok");
        } else {
          await api("/dresses", { method: "POST", body: JSON.stringify(payload) });
          toast("Dress berhasil ditambahkan.", "ok");
        }
        resetDressForm();
        await loadDresses();
        await loadRentals();
        await refreshAccountingViews();
      } catch (error) {
        toast(error.message, "err");
      } finally {
        btn.disabled = false;
      }
    });
  }

  const dressCancel = $("#dressCancel");
  if (dressCancel) dressCancel.addEventListener("click", resetDressForm);

  const refreshDresses = $("#refreshDresses");
  if (refreshDresses) refreshDresses.addEventListener("click", loadDresses);

  ["#dressSearch", "#dressFilterStatus", "#dressFilterUkuran", "#dressFilterWarna"].forEach((sel) => {
    const el = $(sel);
    if (el) {
      el.addEventListener("input", renderDresses);
      el.addEventListener("change", renderDresses);
    }
  });

  // ---- Dress Table actions ----
  const dressesTable = $("#dressesTable");
  if (dressesTable) {
    dressesTable.addEventListener("click", async (e) => {
      const edit = e.target.closest("[data-edit-dress]");
      const del = e.target.closest("[data-del-dress]");
      if (edit) {
        const d = S.dresses.find((x) => x.id_dress === edit.dataset.editDress);
        if (d) fillDressForm(d);
      }
      if (del) {
        const id = del.dataset.delDress;
        const d = S.dresses.find((x) => x.id_dress === id);
        if (!confirm(`Hapus dress "${d?.nama_dress}"?`)) return;
        del.disabled = true;
        try {
          await api(`/dresses/${encodeURIComponent(id)}`, { method: "DELETE" });
          toast("Dress berhasil dihapus.", "ok");
          await loadDresses();
          await refreshAccountingViews();
        } catch (error) {
          toast(error.message, "err");
        } finally {
          del.disabled = false;
        }
      }
    });
  }

  // ---- Rental Form ----
  const rentalForm = $("#rentalForm");
  if (rentalForm) {
    rentalForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        id_dress: $("#id_dress").value,
        nama_pelanggan: $("#nama_pelanggan").value.trim(),
        no_telepon: $("#no_telepon").value.trim(),
        email: $("#email").value.trim() || null,
        alamat: $("#alamat").value.trim() || null,
        tanggal_sewa: $("#tanggal_sewa").value,
        tanggal_rencana_kembali: $("#tanggal_rencana_kembali").value,
        tarif_sewa: Number($("#tarif_sewa_rental").value),
        total_sewa: Number($("#total_sewa").value),
        dp: Number($("#dp").value || 0),
      };
      const btn = rentalForm.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        payload.kode_penyewaan = await validateCodeField(CODE_FIELDS[1]);
        if (payload.dp > 0) payload.kode_dp_awal = await validateCodeField(CODE_FIELDS[2]);
        const result = await api("/rentals", { method: "POST", body: JSON.stringify(payload) });
        toast("Penyewaan berhasil disimpan.", "ok");
        $("#rentalForm").reset();
        $("#tanggal_sewa").value = localDateValue();
        resetCodeInput(CODE_FIELDS[1]);
        resetCodeInput(CODE_FIELDS[2], false);
        $("#dpCodeField").classList.add("hidden");
        $("#dpPaymentCode").required = false;
        await loadRentals();
        await loadDresses();
        await refreshAccountingViews();
        const initialPayment = result.payments?.find((payment) => payment.status_pembayaran === "Berhasil");
        if (initialPayment) await showPaymentReceipt(initialPayment.id_pembayaran);
      } catch (error) {
        toast(error.message, "err");
      } finally {
        btn.disabled = false;
      }
    });
  }

  ["#rentalSearch", "#rentalFilterStatus"].forEach((sel) => {
    const el = $(sel);
    if (el) {
      el.addEventListener("input", renderRentals);
      el.addEventListener("change", renderRentals);
    }
  });

  // ---- Rental Table actions ----
  const rentalsTable = $("#rentalsTable");
  if (rentalsTable) {
    rentalsTable.addEventListener("click", async (e) => {
      const cancel = e.target.closest("[data-cancel-rental]");
      const history = e.target.closest("[data-rental-history]");
      const whatsapp = e.target.closest("[data-whatsapp-rental]");
      if (whatsapp) {
        const rental = S.rentals.find((item) => item.id_penyewaan === whatsapp.dataset.whatsappRental);
        if (rental) openWhatsAppComposer(rental);
      }
      if (history) {
        try {
          const response = await api(`/rentals/${encodeURIComponent(history.dataset.rentalHistory)}`);
          const rental = response.data;
          if (!rental) throw new Error("Data penyewaan tidak ditemukan.");
          const existing = S.rentals.find((item) => item.id_penyewaan === rental.id_penyewaan);
          if (existing) Object.assign(existing, rental);
          else S.rentals.push(rental);
          await showRentalPaymentHistory(rental.id_penyewaan);
        } catch (error) {
          toast(error.message, "err");
        }
      }
      if (cancel) {
        const id = cancel.dataset.cancelRental;
        if (!confirm("Batalkan transaksi penyewaan ini?")) return;
        cancel.disabled = true;
        try {
          await api(`/rentals/${encodeURIComponent(id)}/cancel`, { method: "PATCH" });
          toast("Penyewaan dibatalkan.", "ok");
          await loadRentals();
          await loadDresses();
          await refreshAccountingViews();
        } catch (error) {
          toast(error.message, "err");
        } finally {
          cancel.disabled = false;
        }
      }
    });
  }

  // ---- Auto-hitung total sewa ----
  ["#id_dress", "#tanggal_sewa", "#tanggal_rencana_kembali"].forEach((sel) => {
    const el = $(sel);
    if (el) {
      el.addEventListener("change", () => {
        const id = $("#id_dress")?.value;
        const d = S.dresses.find((x) => x.id_dress === id);
        const start = $("#tanggal_sewa")?.value;
        const end = $("#tanggal_rencana_kembali")?.value;
        if (d && start && end && end >= start) {
          const days = Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 86400000));
          $("#tarif_sewa_rental").value = d.tarif_sewa;
          $("#total_sewa").value = Number(d.tarif_sewa) * days;
        }
      });
    }
  });

  const dpInput = $("#dp");
  dpInput?.addEventListener("input", () => {
    const enabled = Number(dpInput.value || 0) > 0;
    $("#dpCodeField")?.classList.toggle("hidden", !enabled);
    $("#dpPaymentCode").required = enabled;
    if (enabled) void prepareCode(CODE_FIELDS[2]);
  });

  // ---- Payment Form ----
  const paymentForm = $("#paymentForm");
  if (paymentForm) {
    const amountInput = $("#jumlah_bayar");
    amountInput.addEventListener("input", () => {
      amountInput.dataset.autoFineAmount = "false";
    });
    paymentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const idPenyewaan = $("#paymentRentalId").value;
      if (!idPenyewaan) return toast("Pilih transaksi penyewaan terlebih dahulu.", "err");
      const payload = {
        jenis_pembayaran: $("#jenis_pembayaran").value,
        tanggal_bayar: $("#tanggal_bayar").value,
        jumlah_bayar: Number($("#jumlah_bayar").value),
        metode_pembayaran: $("#metode_pembayaran").value,
        referensi: $("#referensi").value.trim() || null,
      };
      if (payload.jenis_pembayaran === "Denda") {
        payload.kategori_denda = normalizeFineCategory($("#fineCategory").value);
        if (!payload.kategori_denda) {
          return toast("Pilih kategori denda: Keterlambatan atau Kerusakan/Kehilangan.", "err");
        }
      }
      const btn = paymentForm.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        payload.kode_pembayaran = await validateCodeField(CODE_FIELDS[3]);
        const payment = await api(`/rentals/${encodeURIComponent(idPenyewaan)}/payments`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast(`Pembayaran ${payment?.kode_pembayaran || ""} berhasil dicatat.`, "ok");
        paymentForm.reset();
        delete amountInput.dataset.autoFineAmount;
        updatePaymentOptions();
        $("#tanggal_bayar").value = localDateValue();
        resetCodeInput(CODE_FIELDS[3]);
        await loadRentals();
        await loadPayments();
        await refreshAccountingViews();
        if (payment?.id_pembayaran) await showPaymentReceipt(payment.id_pembayaran);
      } catch (error) {
        toast(error.message, "err");
      } finally {
        btn.disabled = false;
      }
    });
  }

  ["#paymentSearch", "#paymentFilterJenis", "#paymentFilterStatus"].forEach((sel) => {
    const el = $(sel);
    if (el) {
      el.addEventListener("input", renderPayments);
      el.addEventListener("change", renderPayments);
    }
  });

  const paymentRentalSelect = $("#paymentRentalId");
  const paymentTypeSelect = $("#jenis_pembayaran");
  const updatePaymentOptions = () => {
    const currentRental = paymentRentalSelect.value;
    const isFine = paymentTypeSelect.value === "Denda";
    const amountInput = $("#jumlah_bayar");
    if (!isFine && amountInput.dataset.autoFineAmount === "true") {
      amountInput.value = "";
      delete amountInput.dataset.autoFineAmount;
    }
    $("#fineCategoryField")?.classList.toggle("hidden", !isFine);
    $("#fineCategory").required = isFine;
    populateRentalSelects();
    if (currentRental) paymentRentalSelect.value = currentRental;
    if (paymentTypeSelect.value === "Pelunasan") {
      const rental = S.rentals.find((item) => item.id_penyewaan === paymentRentalSelect.value);
      if (rental) $("#jumlah_bayar").value = Math.max(0, Number(rental.sisa_tagihan || 0));
    } else if (isFine && $("#jumlah_bayar").dataset.autoFineAmount !== "false") {
      const rentalReturn = S.returns.find((item) => item.id_penyewaan === paymentRentalSelect.value);
      const remaining = !rentalReturn
        ? 0
        : $("#fineCategory").value === "Keterlambatan"
          ? Number(rentalReturn.sisa_denda_keterlambatan || 0)
          : Number(rentalReturn.sisa_denda_kerusakan || 0);
      $("#jumlah_bayar").value = remaining > 0 ? remaining : "";
      $("#jumlah_bayar").dataset.autoFineAmount = "true";
    }
  };
  if (paymentRentalSelect) paymentRentalSelect.addEventListener("change", updatePaymentOptions);
  if (paymentTypeSelect) paymentTypeSelect.addEventListener("change", updatePaymentOptions);
  $("#fineCategory")?.addEventListener("change", updatePaymentOptions);
  updatePaymentOptions();

  const paymentsTable = $("#paymentsTable");
  $("#fineInvoicesTable")?.addEventListener("click", (event) => {
    const fineButton = event.target.closest("[data-pay-fine]");
    if (!fineButton) return;
    const amountInput = $("#jumlah_bayar");
    $("#jenis_pembayaran").value = "Denda";
    $("#fineCategory").value = fineButton.dataset.category;
    updatePaymentOptions();
    $("#paymentRentalId").value = fineButton.dataset.rentalId;
    amountInput.value = fineButton.dataset.balance;
    amountInput.dataset.autoFineAmount = "true";
    $("#paymentForm").scrollIntoView({ behavior: "smooth", block: "start" });
    amountInput.focus({ preventScroll: true });
  });
  if (paymentsTable) {
    paymentsTable.addEventListener("click", async (event) => {
      const receiptButton = event.target.closest("[data-payment-receipt]");
      const historyReceiptButton = event.target.closest("[data-history-receipt]");
      const cancelButton = event.target.closest("[data-cancel-payment]");

      if (historyReceiptButton) {
        await showPaymentReceipt(historyReceiptButton.dataset.historyReceipt);
      }

      if (receiptButton) {
        receiptButton.disabled = true;
        try {
          await showPaymentReceipt(receiptButton.dataset.paymentReceipt);
        } finally {
          receiptButton.disabled = false;
        }
      }

      if (cancelButton) {
        const payment = S.payments.find((item) => item.id_pembayaran === cancelButton.dataset.cancelPayment);
        if (!payment || !confirm(`Batalkan pembayaran ${payment.kode_pembayaran} sebesar ${money(payment.jumlah_bayar)}? Riwayat pembayaran akan tetap disimpan.`)) return;
        cancelButton.disabled = true;
        try {
          await api(`/payments/${encodeURIComponent(payment.id_pembayaran)}/cancel`, {
            method: "PATCH",
            body: JSON.stringify({ alasan: "Dibatalkan melalui aplikasi ÉLAN" }),
          });
          toast("Pembayaran dibatalkan dan riwayat tetap tersimpan.", "ok");
          await loadRentals();
          await loadPayments();
          await refreshAccountingViews();
        } catch (error) {
          toast(error.message, "err");
        } finally {
          cancelButton.disabled = false;
        }
      }
    });
  }

  const receiptOverlay = $("#receiptOverlay");
  const closeReceipt = () => {
    receiptOverlay.classList.add("hidden");
    document.body.classList.remove("print-receipt");
  };
  $("#receiptClose")?.addEventListener("click", closeReceipt);
  receiptOverlay?.addEventListener("click", (event) => {
    if (event.target === receiptOverlay) closeReceipt();
  });
  const printReceipt = () => {
    if (!$("#receiptPaper").querySelector(".receipt-brand")) {
      return toast("Nota belum siap dicetak.", "err");
    }
    document.body.classList.add("print-receipt");
    window.print();
  };
  $("#receiptPrint")?.addEventListener("click", printReceipt);
  $("#receiptPdf")?.addEventListener("click", printReceipt);
  window.addEventListener("afterprint", () => document.body.classList.remove("print-receipt"));
  $("#modalClose")?.addEventListener("click", () => $("#modalOverlay")?.classList.add("hidden"));
  $("#modalOverlay")?.addEventListener("click", (event) => {
    if (event.target === $("#modalOverlay")) $("#modalOverlay").classList.add("hidden");
  });
  $("#modalBody")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-history-receipt]");
    if (!button) return;
    await showPaymentReceipt(button.dataset.historyReceipt);
  });

  // ---- Return Form ----
  const returnForm = $("#returnForm");
  if (returnForm) {
    returnForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const idPenyewaan = $("#returnRentalId").value;
      if (!idPenyewaan) return toast("Pilih transaksi penyewaan.", "err");
      const payload = {
        tanggal_kembali_aktual: $("#tanggal_kembali_aktual").value,
        kondisi_dress: $("#kondisi_dress").value,
        denda_keterlambatan: Number($("#denda_keterlambatan").value || 0),
        denda_kerusakan: Number($("#denda_kerusakan").value || 0),
        catatan: $("#catatan").value.trim() || null,
      };
      const btn = returnForm.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        payload.kode_pengembalian = await validateCodeField(CODE_FIELDS[4]);
        await api(`/rentals/${encodeURIComponent(idPenyewaan)}/return`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast("Pengembalian berhasil dicatat.", "ok");
        returnForm.reset();
        $("#tanggal_kembali_aktual").value = localDateValue();
        resetCodeInput(CODE_FIELDS[4]);
        await loadReturns();
        await loadRentals();
        await loadDresses();
        await refreshAccountingViews();
      } catch (error) {
        toast(error.message, "err");
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---- Report ----
  const loadReportBtn = $("#loadReport");
  if (loadReportBtn) loadReportBtn.addEventListener("click", loadReport);

  const reloadReports = $("#reloadReports");
  if (reloadReports) reloadReports.addEventListener("click", loadReport);

  const reportPrint = $("#reportPrint");
  if (reportPrint) {
    reportPrint.addEventListener("click", () => {
      if (!S.report) return toast("Tampilkan laporan terlebih dahulu.", "err");
      window.print();
    });
  }

  const reportCsv = $("#reportCsv");
  if (reportCsv) {
    reportCsv.addEventListener("click", () => {
      if (!S.report) return toast("Tampilkan laporan terlebih dahulu.", "err");
      const quote = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [
        ["LAPORAN"],
        ["Periode", S.report.period?.from || "", "s/d", S.report.period?.to || ""],
        ["Penerimaan Kas", S.report.total_paid || 0],
        ["Total Denda", S.report.total_fines || 0],
        ["Denda Dibayar", S.report.total_fines_paid || 0],
        ["Sisa Denda", S.report.total_fines_outstanding || 0],
        [],
        ["Detail Penyewaan"],
        ["Kode", "Tanggal", "Pelanggan", "Total Sewa", "Dibayar", "Sisa", "Status"],
        ...(S.report.rental_rows || []).map((r) => [
          r.kode_penyewaan, r.tanggal_sewa, r.nama_pelanggan,
          r.total_sewa, r.total_pembayaran, r.sisa_tagihan, r.status_penyewaan,
        ]),
      ];
      const csv = "\uFEFF" + lines.map((row) => row.map(quote).join(",")).join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `laporan-elan-${localDateValue()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }
}

/* =========================================================
   INISIALISASI
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  console.log("ÉLAN app.js loaded");
  bindEvents();

  // Tampilkan tanggal hari ini di topbar
  const todayLabel = $("#todayLabel");
  if (todayLabel) {
    todayLabel.textContent = new Intl.DateTimeFormat("id-ID", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    }).format(new Date());
  }

  // Set tanggal default pada form
  const today = localDateValue();
  if ($("#tanggal_bayar")) $("#tanggal_bayar").value = today;
  if ($("#tanggal_sewa")) $("#tanggal_sewa").value = today;
  if ($("#tanggal_kembali_aktual")) $("#tanggal_kembali_aktual").value = today;

  // Load halaman awal
  loadDashboard();
});