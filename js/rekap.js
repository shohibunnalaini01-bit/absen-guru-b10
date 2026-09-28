// js/rekap.js
// Rekap Laporan — Final + Detail Drill-Down
// - Klik baris guru → modal rincian absensi per tanggal & jam
// - HK = hari kerja efektif | Jam = slot jadwal selama hari efektif
// - Hadir = per jam | Persentase = jam hadir ÷ jam selama HK
// - Export: CSV + Salin Teks (WA) + Copy Gambar

document.addEventListener('DOMContentLoaded', async function() {
    await HijriCalendar.ready;

    const session = Auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    if (session.role.startsWith('pengabsen_')) {
        window.location.href = 'absen.html';
        return;
    }

    initUI(session);

    await loadLembagaDropdown(session);
    setBulanIni();
    await loadRekap();

    document.getElementById('btnTampilkan').addEventListener('click', loadRekap);
    document.getElementById('btnBulanIni').addEventListener('click', async () => {
        setBulanIni();
        await loadRekap();
    });
    document.getElementById('btnExportCsv').addEventListener('click', exportCsv);
    document.getElementById('btnSalinTeks').addEventListener('click', salinTeks);
    document.getElementById('btnCopyGambar').addEventListener('click', copyGambar);

    // Klik baris guru → buka detail (event delegation, anti gagal)
    document.addEventListener('click', function(e) {
        const tr = e.target.closest('#rekapTable tr[data-guru]');
        if (tr) showDetailGuru(tr.dataset.guru);
    });
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

    // Hint "klik baris untuk detail" — di-inject otomatis
    const cardBody = document.querySelector('#rekapCard .card-body');
    if (cardBody && !cardBody.querySelector('.rekap-hint')) {
        const hint = document.createElement('p');
        hint.className = 'rekap-hint';
        hint.innerHTML = '<i data-lucide="mouse-pointer-click"></i> Klik baris guru untuk melihat rincian absensi per tanggal & jam';
        cardBody.prepend(hint);
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
const STATUS_PRIORITY = ['hadir', 'sakit', 'izin', 'alpha'];
const DAY_NAME = { 0: 'Ahad', 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 6: 'Sabtu' };

function toLocalDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTanggalShort(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function setRekapLoading(isLoading) {
    const btnTampil = document.getElementById('btnTampilkan');
    const btnBulan = document.getElementById('btnBulanIni');

    if (!btnTampil.dataset.origHtml) btnTampil.dataset.origHtml = btnTampil.innerHTML;
    if (!btnBulan.dataset.origHtml) btnBulan.dataset.origHtml = btnBulan.innerHTML;

    btnTampil.disabled = isLoading;
    btnBulan.disabled = isLoading;
    btnTampil.innerHTML = isLoading
        ? '<i data-lucide="loader-2" class="spin-icon"></i> Memuat...'
        : btnTampil.dataset.origHtml;
    lucide.createIcons();
}

// Ambil SEMUA baris — paginate otomatis, kebal limit 1000 Supabase
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

// Rentang masehi bulan hijriyah (kalender manual admin → fallback algoritma)
function getHijriMonthRange(month, year) {
    const baseDate = new Date(2024, 6, 8);
    const targetMonths = (year - 1446) * 12 + (month - 1);
    const approxDays = targetMonths * 29.53059;
    const mid = new Date(baseDate.getTime() + approxDays * DAY_MS);

    let start = new Date(mid.getTime() - 25 * DAY_MS);
    let end = new Date(mid.getTime() + 25 * DAY_MS);

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
   DATA STORE (untuk modal detail)
======================== */
let lastRekapRows = [];
let lastAbsenByGuru = {};        // guru_id -> [{tanggal, status, jadwal_id, guru_pengganti_id}]
let lastJadwalDetail = {};       // jadwal_id -> {hari, jamKe, jamMulai, jamSelesai, rombel}
let lastEffectiveByLembaga = {}; // lembaga_id -> [{ds, dayName}]
let lastGuruMap = {};            // guru_id -> {nama, lembaga}

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

async function loadRekap() {
    const session = Auth.getSession();
    const startStr = document.getElementById('rekapStart').value;
    const endStr = document.getElementById('rekapEnd').value;

    if (!startStr || !endStr) { showToast('Isi rentang tanggal dulu', 'warning'); return; }
    if (startStr > endStr) { showToast('Tanggal mulai harus sebelum tanggal selesai', 'warning'); return; }

    const tbody = document.getElementById('rekapTable');
    setRekapLoading(true);
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Memuat data...</td></tr>';

    try {
        const lembagaFilter = document.getElementById('rekapLembaga').value;

        // 1. Data guru
        let guruQuery = db.from('guru').select('id, nama, lembaga_id, lembaga(kode)').order('nama');
        if (session.lembaga_id) guruQuery = guruQuery.eq('lembaga_id', session.lembaga_id);
        else if (lembagaFilter) guruQuery = guruQuery.eq('lembaga_id', lembagaFilter);
        const guruData = await fetchAllRows(guruQuery);
        const guruIds = new Set(guruData.map(g => g.id));

        lastGuruMap = {};
        guruData.forEach(g => {
            lastGuruMap[g.id] = { nama: g.nama, lembaga: g.lembaga ? g.lembaga.kode : '-' };
        });

        // 2. Absen dalam rentang — PAGINATED (ikutkan jadwal_id & pengganti utk detail)
        const absenData = await fetchAllRows(
            db.from('absen').select('guru_id, jadwal_id, status, tanggal, guru_pengganti_id')
              .gte('tanggal', startStr).lte('tanggal', endStr)
        );

        // 3. Hari libur — PAGINATED
        const liburData = await fetchAllRows(
            db.from('hari_libur').select('tanggal, lembaga_id')
              .gte('tanggal', startStr).lte('tanggal', endStr)
        );

        // 4. Jadwal mingguan → detail per jadwal (jam, rombel) + slot per guru/hari
        const jadwalData = await fetchAllRows(
            db.from('jadwal').select('id, guru_id, hari, rombel(nama), jam_pelajaran(jam_ke, jam_mulai, jam_selesai)')
        );
        const slotsByGuruDay = {};
        lastJadwalDetail = {};
        jadwalData.forEach(j => {
            lastJadwalDetail[j.id] = {
                hari: j.hari,
                jamKe: j.jam_pelajaran ? j.jam_pelajaran.jam_ke : null,
                jamMulai: j.jam_pelajaran ? j.jam_pelajaran.jam_mulai : null,
                jamSelesai: j.jam_pelajaran ? j.jam_pelajaran.jam_selesai : null,
                rombel: j.rombel ? j.rombel.nama : '-'
            };
            if (guruIds.has(j.guru_id)) {
                if (!slotsByGuruDay[j.guru_id]) slotsByGuruDay[j.guru_id] = {};
                slotsByGuruDay[j.guru_id][j.hari] = (slotsByGuruDay[j.guru_id][j.hari] || 0) + 1;
            }
        });

        // 5. Jam tambahan (guru pengganti)
        const jamTambahData = await fetchAllRows(
            db.from('jam_tambahan').select('guru_id')
              .gte('tanggal', startStr).lte('tanggal', endStr)
        );
        const jamTambahanCount = {};
        jamTambahData.forEach(jt => {
            if (guruIds.has(jt.guru_id)) {
                jamTambahanCount[jt.guru_id] = (jamTambahanCount[jt.guru_id] || 0) + 1;
            }
        });

        // Index absen per guru
        lastAbsenByGuru = {};
        absenData.forEach(a => {
            if (!guruIds.has(a.guru_id)) return;
            if (!lastAbsenByGuru[a.guru_id]) lastAbsenByGuru[a.guru_id] = [];
            lastAbsenByGuru[a.guru_id].push(a);
        });

        // 6. Hari efektif per lembaga
        const lembagaIds = [...new Set(guruData.map(g => g.lembaga_id))];
        lastEffectiveByLembaga = {};
        for (const lid of lembagaIds) {
            const dates = [];
            let d = new Date(startStr + 'T00:00:00');
            const end = new Date(endStr + 'T00:00:00');
            while (d <= end) {
                const ds = toLocalDateStr(d);
                const isLibur = liburData.some(l => l.tanggal === ds && l.lembaga_id === lid);
                if (d.getDay() !== 5 && !isLibur) {
                    dates.push({ ds, dayName: DAY_NAME[d.getDay()] });
                }
                d.setDate(d.getDate() + 1);
            }
            lastEffectiveByLembaga[lid] = dates;
        }

        // 7. Rekap per guru
        const rows = guruData.map(g => {
            const effDates = lastEffectiveByLembaga[g.lembaga_id] || [];
            const hk = effDates.length;
            const hkSet = new Set(effDates.map(e => e.ds));

            let jamMaks = 0;
            const slots = slotsByGuruDay[g.id] || {};
            effDates.forEach(e => { jamMaks += slots[e.dayName] || 0; });

            let jamHadir = 0;
            const statusByDate = {};

            (lastAbsenByGuru[g.id] || []).forEach(a => {
                if (!STATUS_PRIORITY.includes(a.status)) return;
                if (a.status === 'hadir') jamHadir++;

                const cur = statusByDate[a.tanggal];
                if (!cur || STATUS_PRIORITY.indexOf(a.status) < STATUS_PRIORITY.indexOf(cur)) {
                    statusByDate[a.tanggal] = a.status;
                }
            });

            jamHadir += (jamTambahanCount[g.id] || 0);

            const counts = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
            const recorded = new Set();
            Object.entries(statusByDate).forEach(([tgl, st]) => {
                counts[st]++;
                recorded.add(tgl);
            });

            let tanpaKet = 0;
            hkSet.forEach(ds => { if (!recorded.has(ds)) tanpaKet++; });

            const persen = jamMaks > 0 ? (jamHadir / jamMaks) * 100 : 0;

            return {
                id: g.id,
                nama: g.nama,
                lembaga: g.lembaga ? g.lembaga.kode : '-',
                lembagaId: g.lembaga_id,
                hk, jamMaks, jamHadir,
                sakit: counts.sakit, izin: counts.izin, alpha: counts.alpha,
                tanpaKet, persen
            };
        });

        rows.sort((a, b) => b.persen - a.persen || b.jamHadir - a.jamHadir);
        lastRekapRows = rows;

        // 8. Statistik ringkas
        const totalGuru = rows.length;
        const maxHk = rows.length ? Math.max(...rows.map(r => r.hk)) : 0;
        const totalJamMaks = rows.reduce((s, r) => s + r.jamMaks, 0);
        const totalJamHadir = rows.reduce((s, r) => s + r.jamHadir, 0);
        const rata = totalGuru ? rows.reduce((s, r) => s + r.persen, 0) / totalGuru : 0;

        document.getElementById('rsGuru').textContent = totalGuru;
        document.getElementById('rsHariKerja').textContent = maxHk;
        document.getElementById('rsJamMaks').textContent = totalJamMaks;
        document.getElementById('rsJamHadir').textContent = totalJamHadir;
        document.getElementById('rsRata').textContent = rata.toFixed(2) + '%';

        document.getElementById('rekapRangeChip').textContent =
            `${formatTanggalShort(startStr)} – ${formatTanggalShort(endStr)} · ${totalJamHadir}/${totalJamMaks} jam`;

        // 9. Render tabel (baris punya data-guru → klik membuka detail)
        if (totalGuru === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Belum ada data guru pada filter ini</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((r, i) => {
            const rankBadge = i < 3 ? `rank-${i + 1}` : '';
            const noCell = rankBadge ? `<span class="${rankBadge}">${i + 1}</span>` : (i + 1);
            const persenClass = r.persen >= 80 ? 'persen-good' : (r.persen >= 60 ? 'persen-mid' : 'persen-low');

            return `<tr data-guru="${r.id}" title="Klik untuk detail">
                <td>${noCell}</td>
                <td class="cell-strong">${r.nama}</td>
                <td>${r.hk}</td>
                <td class="cell-strong">${r.jamMaks}</td>
                <td><span class="jam-chip">${r.jamHadir}</span></td>
                <td>${r.sakit}</td>
                <td>${r.izin}</td>
                <td>${r.alpha}</td>
                <td><span class="${persenClass}">${r.persen.toFixed(2)}%</span></td>
            </tr>`;
        }).join('');

    } catch (error) {
        console.error('Error loadRekap:', error);
        tbody.innerHTML = `<tr><td colspan="10" class="empty-state">Gagal memuat: ${error.message}</td></tr>`;
        showToast('Gagal memuat rekap: ' + error.message, 'error');
    } finally {
        setRekapLoading(false);
    }
}

/* ========================
   MODAL DETAIL PER GURU
======================== */
function showDetailGuru(guruId) {
    const info = lastGuruMap[guruId];
    const row = lastRekapRows.find(r => r.id === guruId);
    if (!info || !row) return;

    // Susun rincian setiap record absen
    const records = (lastAbsenByGuru[guruId] || []).map(a => {
        const jd = lastJadwalDetail[a.jadwal_id] || {};
        const dayName = jd.hari || DAY_NAME[new Date(a.tanggal + 'T00:00:00').getDay()] || '-';
        return {
            tanggal: a.tanggal,
            status: a.status,
            hari: dayName,
            jamKe: jd.jamKe ?? null,
            waktu: (jd.jamMulai && jd.jamSelesai)
                ? `${jd.jamMulai.substring(0,5)}–${jd.jamSelesai.substring(0,5)}`
                : '',
            rombel: jd.rombel || '-',
            pengganti: a.guru_pengganti_id
                ? (lastGuruMap[a.guru_pengganti_id]?.nama || 'Guru')
                : null
        };
    });

    records.sort((x, y) => x.tanggal.localeCompare(y.tanggal) || (x.jamKe ?? 99) - (y.jamKe ?? 99));

    // Hari efektif tanpa record sama sekali
    const recordedDates = new Set(records.map(r => r.tanggal));
    const tanpaKetDates = (lastEffectiveByLembaga[row.lembagaId] || [])
        .filter(e => !recordedDates.has(e.ds))
        .map(e => ({ ds: e.ds, dayName: e.dayName }));

    // Buat / pakai ulang modal
    let modal = document.getElementById('detailGuruModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'detailGuruModal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    const statusBadge = (st) => {
        const map = {
            hadir: ['badge-hadir', 'Hadir'],
            sakit: ['badge-sakit', 'Sakit'],
            izin:  ['badge-izin', 'Izin'],
            alpha: ['badge-alpha', 'Alpha']
        };
        const [cls, label] = map[st] || ['badge-izin', st];
        return `<span class="badge ${cls}">${label}</span>`;
    };

    const initials = (nama) => {
        const p = nama.trim().split(/\s+/);
        return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase();
    };

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <div class="dg-head">
                    <span class="gp-avatar">${initials(info.nama)}</span>
                    <div>
                        <h3>${info.nama}</h3>
                        <small class="dg-sub">${info.lembaga} · ${formatTanggalShort(document.getElementById('rekapStart').value)} – ${formatTanggalShort(document.getElementById('rekapEnd').value)}</small>
                    </div>
                </div>
                <button class="modal-close" id="dgClose">&times;</button>
            </div>
            <div class="modal-body">

                <div class="dg-summary">
                    <div class="dg-sum-item"><strong>${row.jamHadir}</strong><span>Hadir (jam)</span></div>
                    <div class="dg-sum-item"><strong>${row.sakit}</strong><span>Sakit</span></div>
                    <div class="dg-sum-item"><strong>${row.izin}</strong><span>Izin</span></div>
                    <div class="dg-sum-item"><strong>${row.alpha}</strong><span>Alpha</span></div>
                </div>

                <div class="dg-filters" id="dgFilters">
                    <button class="dg-chip active" data-day="all">Semua Hari</button>
                </div>

                <div class="dg-records" id="dgRecords"></div>

                ${tanpaKetDates.length > 0 ? `
                    <div class="dg-tanpa">
                        <h5><i data-lucide="calendar-x"></i> Hari Efektif Tanpa Keterangan (${tanpaKetDates.length})</h5>
                        <div class="dg-tanpa-dates">
                            ${tanpaKetDates.map(t => `<span>${t.dayName}, ${formatTanggalShort(t.ds)}</span>`).join('')}
                        </div>
                    </div>` : ''}
            </div>
        </div>
    `;
    modal.classList.add('show');
    lucide.createIcons();

    const close = () => modal.classList.remove('show');
    modal.querySelector('#dgClose').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };

    // Filter chip per hari (hanya hari yang punya data)
    const filterWrap = modal.querySelector('#dgFilters');
    const uniqueDays = [...new Set(records.map(r => r.hari))];
    uniqueDays.forEach(day => {
        const chip = document.createElement('button');
        chip.className = 'dg-chip';
        chip.dataset.day = day;
        chip.textContent = day;
        filterWrap.appendChild(chip);
    });

    const recordsEl = modal.querySelector('#dgRecords');

    function renderList(filterDay) {
        const shown = filterDay === 'all' ? records : records.filter(r => r.hari === filterDay);

        if (shown.length === 0) {
            recordsEl.innerHTML = '<div class="empty-state">Tidak ada catatan absensi pada filter ini</div>';
            return;
        }

        recordsEl.innerHTML = shown.map(r => `
            <div class="dg-row">
                <div class="dg-date">
                    <strong>${r.hari}</strong>
                    <small>${formatTanggalShort(r.tanggal)}</small>
                </div>
                <div class="dg-jam">
                    ${r.jamKe ? `Jam ${r.jamKe}` : 'Jam -'}${r.waktu ? ` · ${r.waktu}` : ''}
                    <small>${r.rombel !== '-' ? ` · ${r.rombel}` : ''}${r.pengganti ? ` · <em>Digantikan: ${r.pengganti}</em>` : ''}</small>
                </div>
                ${statusBadge(r.status)}
            </div>
        `).join('');
    }

    renderList('all');

    filterWrap.addEventListener('click', function(e) {
        const chip = e.target.closest('.dg-chip');
        if (!chip) return;
        filterWrap.querySelectorAll('.dg-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        renderList(chip.dataset.day);
    });
}

/* ========================
   EXPORT 1: CSV (Excel)
======================== */
function exportCsv() {
    if (!lastRekapRows.length) { showToast('Belum ada data untuk diunduh', 'warning'); return; }

    const header = ['No', 'Nama Guru', 'Lembaga', 'Hari Kerja', 'Jam Selama HK', 'Kehadiran (Jam)', 'Sakit', 'Izin', 'Alpha', 'Persentase'];
    const lines = lastRekapRows.map((r, i) =>
        [i + 1, `"${r.nama}"`, r.lembaga, r.hk, r.jamMaks, r.jamHadir, r.sakit, r.izin, r.alpha, r.tanpaKet, r.persen.toFixed(2) + '%'].join(';')
    );

    const startStr = document.getElementById('rekapStart').value;
    const endStr = document.getElementById('rekapEnd').value;
    const csv = '\uFEFF' + [header.join(';'), ...lines].join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekap-absen-${startStr}_sd_${endStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('CSV berhasil diunduh', 'success');
}

/* ========================
   EXPORT 2: SALIN TEKS (WhatsApp)
======================== */
function buildWaText() {
    const startStr = document.getElementById('rekapStart').value;
    const endStr = document.getElementById('rekapEnd').value;
    const lembagaSelect = document.getElementById('rekapLembaga');
    const lembagaName = lembagaSelect.value
        ? lembagaSelect.options[lembagaSelect.selectedIndex].text
        : 'Semua Lembaga';

    const lines = [];
    lines.push('*REKAP KEHADIRAN GURU*');
    lines.push(`Periode: ${formatTanggalShort(startStr)} s.d. ${formatTanggalShort(endStr)}`);
    lines.push(`Lembaga: ${lembagaName}`);
    lines.push('');
    lastRekapRows.forEach((r, i) => {
        const persen = r.persen.toFixed(2).replace('.', ',');
        lines.push(`${i + 1}. *${r.nama}*`);
        lines.push(`   Hadir: ${r.jamHadir}/${r.jamMaks} jam (${persen}%)`);
        const detail = [];
        if (r.sakit > 0) detail.push(`Sakit ${r.sakit}`);
        if (r.izin > 0) detail.push(`Izin ${r.izin}`);
        if (r.alpha > 0) detail.push(`Alpha ${r.alpha}`);
        if (detail.length > 0) lines.push(`   ${detail.join(' · ')}`);
    });
    return lines.join('\n');
}

async function salinTeks() {
    if (!lastRekapRows.length) { showToast('Belum ada data untuk disalin', 'warning'); return; }

    const text = buildWaText();
    try {
        await navigator.clipboard.writeText(text);
        showToast('Teks disalin! Tempel di WhatsApp', 'success');
    } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast('Teks disalin! Tempel di WhatsApp', 'success');
    }
}

/* ========================
   EXPORT 3: COPY GAMBAR
======================== */
async function copyGambar() {
    if (!lastRekapRows.length) { showToast('Belum ada data untuk disalin', 'warning'); return; }

    const btn = document.getElementById('btnCopyGambar');
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader-2" class="spin-icon"></i> Menyiapkan...';
    lucide.createIcons();

    try {
        const el = document.getElementById('rekapCard');
        const canvas = await html2canvas(el, {
            backgroundColor: '#ffffff',
            scale: 2,
            useCORS: true,
            logging: false
        });

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

        try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            showToast('Gambar disalin! Tempel di WhatsApp/Chat', 'success');
        } catch (e) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'rekap-absen.png';
            a.click();
            URL.revokeObjectURL(url);
            showToast('Browser tidak mendukung salin gambar — diunduh sebagai PNG', 'info');
        }
    } catch (e) {
        showToast('Gagal membuat gambar: ' + e.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="image"></i> Copy Gambar';
    lucide.createIcons();
}