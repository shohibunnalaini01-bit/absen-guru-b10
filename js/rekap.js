// js/rekap.js
// Rekap Laporan — anti-limit (pagination), sadar kalender hijriyah manual

document.addEventListener('DOMContentLoaded', async function() {
    await HijriCalendar.ready; // tunggu kalender hijriyah manual termuat

    const session = Auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    if (session.role.startsWith('pengabsen_')) {
        window.location.href = 'absen.html';
        return;
    }

    initUI(session);

    await loadLembagaDropdown(session);
    setBulanIni();       // default: bulan hijriyah berjalan
    await loadRekap();   // langsung muat

    document.getElementById('btnTampilkan').addEventListener('click', loadRekap);
    document.getElementById('btnBulanIni').addEventListener('click', async () => {
        setBulanIni();
        await loadRekap();
    });
    document.getElementById('btnExportCsv').addEventListener('click', exportCsv);
});

/* ========================
   INIT UI
======================== */
function initUI(session) {
    const today = new Date();
    const masehiStr = `${['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][today.getDay()]}, ${today.getDate()} ${['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][today.getMonth()]} ${today.getFullYear()}`;
    const hijriStr = HijriCalendar.format(today);

    document.getElementById('hijriSidebar').textContent = hijriStr;
    document.getElementById('gregorianSidebar').textContent = masehiStr;
    document.getElementById('todayDisplay').textContent = `${hijriStr} | ${masehiStr}`;
    document.getElementById('userName').textContent = session.nama || 'User';
    document.getElementById('userRole').textContent = (session.role || '').replace(/_/g, ' ').toUpperCase();

    if (session.role === 'superadmin') {
        const navAdmin = document.querySelector('.nav-admin-only');
        if (navAdmin) navAdmin.style.display = 'flex';
        document.querySelectorAll('.lembaga-select-wrapper').forEach(el => el.style.display = 'block');
    }

    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
        overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
    }

    document.getElementById('btnLogout').addEventListener('click', function() {
        showToast('Mengeluarkan akun...', 'warning', 1500);
        setTimeout(() => { Auth.logout(); }, 1000);
    });

    lucide.createIcons();
}

/* ========================
   HELPERS
======================== */
const DAY_MS = 86400000;

function toLocalDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTanggalID(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTanggalShort(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Ambil SEMUA baris — otomatis paginate, kebal limit 1000 Supabase
async function fetchAllRows(baseQuery, pageSize = 1000) {
    let all = [];
    let from = 0;
    while (true) {
        const { data, error } = await baseQuery.range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

// Rentang masehi untuk bulan hijriyah tertentu (pakai kalender manual bila ada)
function getHijriMonthRange(month, year) {
    const baseDate = new Date(2024, 6, 8); // aproksimasi 1 Muharram 1446
    const targetMonths = (year - 1446) * 12 + (month - 1);
    const approxDays = targetMonths * 29.53059;
    const mid = new Date(baseDate.getTime() + approxDays * DAY_MS);

    let start = new Date(mid.getTime() - 25 * DAY_MS);
    let end = new Date(mid.getTime() + 25 * DAY_MS);

    // Trim: geser sampai tepat masuk bulan hijriyah target
    let guard = 0;
    while (guard++ < 45) {
        const h = HijriCalendar.toHijri(start);
        if (h && h.month === month && h.year === year) break;
        start = new Date(start.getTime() + DAY_MS);
    }
    guard = 0;
    while (guard++ < 45) {
        const h = HijriCalendar.toHijri(end);
        if (h && h.month === month && h.year === year) break;
        end = new Date(end.getTime() - DAY_MS);
    }
    return { start, end };
}

// Set filter ke bulan hijriyah berjalan
function setBulanIni() {
    const today = new Date();
    const h = HijriCalendar.toHijri(today);
    const { start, end } = getHijriMonthRange(h.month, h.year);

    document.getElementById('rekapStart').value = toLocalDateStr(start);
    document.getElementById('rekapEnd').value = toLocalDateStr(end);
    document.getElementById('rekapRangeChip').textContent =
        `${HijriCalendar.monthNames[h.month - 1]} ${h.year} H`;
}

/* ========================
   LOAD DATA
======================== */
async function loadLembagaDropdown(session) {
    const { data } = await db.from('lembaga').select('*').order('kode');
    const select = document.getElementById('rekapLembaga');
    select.innerHTML = '<option value="">Semua Lembaga</option>';
    if (data) data.forEach(l => select.innerHTML += `<option value="${l.id}">${l.kode} - ${l.nama}</option>`);
    if (session.lembaga_id) select.value = session.lembaga_id;
}

let lastRekapRows = [];

async function loadRekap() {
    const session = Auth.getSession();
    const startStr = document.getElementById('rekapStart').value;
    const endStr = document.getElementById('rekapEnd').value;

    if (!startStr || !endStr) { showToast('Isi rentang tanggal dulu', 'warning'); return; }
    if (startStr > endStr) { showToast('Tanggal mulai harus sebelum tanggal selesai', 'warning'); return; }

    const tbody = document.getElementById('rekapTable');
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Memuat data...</td></tr>';

    try {
        const lembagaFilter = document.getElementById('rekapLembaga').value;

        // 1. Data guru (terfilter sesuai role / pilihan superadmin)
        let guruQuery = db.from('guru').select('id, nama, lembaga_id, lembaga(kode)').order('nama');
        if (session.lembaga_id) guruQuery = guruQuery.eq('lembaga_id', session.lembaga_id);
        else if (lembagaFilter) guruQuery = guruQuery.eq('lembaga_id', lembagaFilter);
        const guruData = await fetchAllRows(guruQuery);

        // 2. Semua absen dalam rentang — PAGINATED (anti limit 1000)
        const absenData = await fetchAllRows(
            db.from('absen').select('guru_id, status, tanggal')
              .gte('tanggal', startStr).lte('tanggal', endStr)
        );

        // 3. Hari libur dalam rentang — PAGINATED
        const liburData = await fetchAllRows(
            db.from('hari_libur').select('tanggal, lembaga_id')
              .gte('tanggal', startStr).lte('tanggal', endStr)
        );

        // Index absen per guru (biar loop ringan)
        const absenByGuru = {};
        absenData.forEach(a => {
            if (!absenByGuru[a.guru_id]) absenByGuru[a.guru_id] = [];
            absenByGuru[a.guru_id].push(a);
        });

        // 4. Hitung hari efektif per lembaga (bukan Jumat & bukan libur lembaga tsb)
        const lembagaIds = [...new Set(guruData.map(g => g.lembaga_id))];
        const effectiveDates = {};
        for (const lid of lembagaIds) {
            const dates = [];
            let d = new Date(startStr + 'T00:00:00');
            const end = new Date(endStr + 'T00:00:00');
            while (d <= end) {
                const ds = toLocalDateStr(d);
                const isLibur = liburData.some(l => l.tanggal === ds && l.lembaga_id === lid);
                if (d.getDay() !== 5 && !isLibur) dates.push(ds);
                d.setDate(d.getDate() + 1);
            }
            effectiveDates[lid] = dates;
        }

        // 5. Rekap per guru
        const rows = guruData.map(g => {
            const hk = (effectiveDates[g.lembaga_id] || []).length;
            const counts = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
            (absenByGuru[g.id] || []).forEach(a => {
                if (counts[a.status] !== undefined) counts[a.status]++;
            });
            const totalAbsen = counts.hadir + counts.sakit + counts.izin + counts.alpha;
            const tanpaKet = Math.max(0, hk - totalAbsen);
            const persen = hk > 0 ? (counts.hadir / hk) * 100 : 0;

            return {
                id: g.id,
                nama: g.nama,
                lembaga: g.lembaga ? g.lembaga.kode : '-',
                hk, ...counts, tanpaKet, persen
            };
        });

        // Urutkan: persentase tertinggi dulu
        rows.sort((a, b) => b.persen - a.persen || b.hadir - a.hadir);
        lastRekapRows = rows;

        // 6. Render statistik ringkas
        const totalGuru = rows.length;
        const maxHk = rows.length ? Math.max(...rows.map(r => r.hk)) : 0;
        const totalHadir = rows.reduce((s, r) => s + r.hadir, 0);
        const rata = totalGuru ? rows.reduce((s, r) => s + r.persen, 0) / totalGuru : 0;

        document.getElementById('rsGuru').textContent = totalGuru;
        document.getElementById('rsHariKerja').textContent = maxHk;
        document.getElementById('rsHadir').textContent = totalHadir;
        document.getElementById('rsRata').textContent = rata.toFixed(2) + '%';

        document.getElementById('rekapRangeChip').textContent =
            `${formatTanggalShort(startStr)} – ${formatTanggalShort(endStr)}`;

        // 7. Render tabel
        if (totalGuru === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Belum ada data guru pada filter ini</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((r, i) => {
            const rankBadge = i < 3 ? `rank-${i + 1}` : '';
            const noCell = rankBadge
                ? `<span class="${rankBadge}">${i + 1}</span>`
                : (i + 1);

            const persenClass = r.persen >= 80 ? 'persen-good' : (r.persen >= 60 ? 'persen-mid' : 'persen-low');

            return `<tr>
                <td>${noCell}</td>
                <td class="cell-strong">${r.nama}</td>
                <td>${r.hk}</td>
                <td class="cell-strong">${r.hadir}</td>
                <td>${r.sakit}</td>
                <td>${r.izin}</td>
                <td>${r.alpha}</td>
                <td>${r.tanpaKet > 0 ? `<span class="tk-warning">${r.tanpaKet}</span>` : '0'}</td>
                <td><span class="${persenClass}">${r.persen.toFixed(2)}%</span></td>
            </tr>`;
        }).join('');

    } catch (error) {
        console.error('Error loadRekap:', error);
        tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Gagal memuat: ${error.message}</td></tr>`;
        showToast('Gagal memuat rekap: ' + error.message, 'error');
    }
}

/* ========================
   EXPORT CSV
======================== */
function exportCsv() {
    if (!lastRekapRows.length) { showToast('Belum ada data untuk diunduh', 'warning'); return; }

    const header = ['No', 'Nama Guru', 'Lembaga', 'Hari Kerja', 'Hadir', 'Sakit', 'Izin', 'Alpha', 'Tanpa Keterangan', 'Persentase'];
    const lines = lastRekapRows.map((r, i) =>
        [i + 1, `"${r.nama}"`, r.lembaga, r.hk, r.hadir, r.sakit, r.izin, r.alpha, r.tanpaKet, r.persen.toFixed(2) + '%'].join(';')
    );

    const startStr = document.getElementById('rekapStart').value;
    const endStr = document.getElementById('rekapEnd').value;
    const csv = '\uFEFF' + [header.join(';'), ...lines].join('\r\n'); // BOM agar Excel baca UTF-8

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekap-absen-${startStr}_sd_${endStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('CSV berhasil diunduh', 'success');
}
