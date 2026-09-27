// js/app.js
// Dashboard Logic (Hijriyah Based & Real-time Clock) — Versi Bento + Diagram

let lembagaChartInstance = null;

document.addEventListener('DOMContentLoaded', async function() {
    const session = Auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    // GUARD: Pengabsen tidak boleh akses Dashboard
    if (session.role.startsWith('pengabsen_')) {
        window.location.href = 'absen.html'; 
        return;
    }

    initUI(session);
    startClock();
    await loadDashboardData(session);
});

function initUI(session) {
    const today = new Date();
    const hariNama = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const bulanNama = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    
    const masehiStr = `${hariNama[today.getDay()]}, ${today.getDate()} ${bulanNama[today.getMonth()]} ${today.getFullYear()}`;
    const hijriStr = HijriCalendar.format(today);
    
    document.getElementById('hijriSidebar').textContent = hijriStr;
    document.getElementById('gregorianSidebar').textContent = masehiStr;
    document.getElementById('todayDisplay').textContent = `${hijriStr} | ${masehiStr}`;

    document.getElementById('userName').textContent = session.nama || 'User';
    document.getElementById('userRole').textContent = (session.role || 'Role').replace(/_/g, ' ').toUpperCase();

    if (session.role === 'superadmin') {
        const navAdmin = document.querySelector('.nav-admin-only');
        if (navAdmin) navAdmin.style.display = 'flex';
    }

    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
        overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
    }

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', function() {
            showToast('Mengeluarkan akun...', 'warning', 1500);
            setTimeout(() => { Auth.logout(); }, 1000);
        });
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function startClock() {
    const clockEl = document.getElementById('realTimeClock');
    function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        clockEl.textContent = `${hours}:${minutes}:${seconds} WIB`;
    }
    updateClock();
    setInterval(updateClock, 1000);
}

// Helper: Format Hari Ini (Local Time)
function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ========================
   TEMA & RENDER KOMPONEN
======================== */

// Tema per lembaga berdasarkan kode (IBT hijau, TS biru, IDAD amber — sesuai urutan lama)
const LEMBAGA_THEMES = {
    IBT:  { theme: 'lc-green', icon: 'school',        chart: '#10b981' },
    TS:   { theme: 'lc-blue',  icon: 'book-open',     chart: '#0284c7' },
    IDAD: { theme: 'lc-amber', icon: 'graduation-cap', chart: '#f59e0b' }
};
const FALLBACK_THEMES = [
    { theme: 'lc-teal',  icon: 'building-2',    chart: '#14b8a6' },
    { theme: 'lc-green', icon: 'school',        chart: '#10b981' },
    { theme: 'lc-blue',  icon: 'book-open',     chart: '#0284c7' },
    { theme: 'lc-amber', icon: 'graduation-cap', chart: '#f59e0b' }
];

// --- Kartu Lembaga dengan Donut Ring ---
function renderLembagaStats(results) {
    const grid = document.getElementById('lembagaStatsGrid');
    const chartCard = document.getElementById('chartCard');
    if (!grid) return;

    if (!results || results.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1;padding:40px 0;">Tidak ada data</div>';
        if (chartCard) chartCard.style.display = 'none';
        return;
    }
    if (chartCard) chartCard.style.display = '';

    grid.innerHTML = results.map(r => `
        <div class="lembaga-card ${r.theme}">
            <div class="lembaga-card-header">
                <div class="lembaga-icon"><i data-lucide="${r.icon}"></i></div>
                <h3>${r.kode} - ${r.nama}</h3>
            </div>
            <div class="lembaga-card-body">
                <div class="donut-wrap">
                    <svg viewBox="0 0 100 100">
                        <circle class="donut-bg" cx="50" cy="50" r="42"></circle>
                        <circle class="donut-fill" cx="50" cy="50" r="42" data-persen="${r.persentase}"></circle>
                    </svg>
                    <div class="donut-center">
                        <span class="dc-value">${r.persentase}%</span>
                        <span class="dc-label">Kehadiran</span>
                    </div>
                </div>
                <div class="lstat-list">
                    <div class="lstat-row">
                        <i data-lucide="users"></i>
                        <span class="lr-value">${r.totalGuru}</span>
                        <span class="lr-label">Total Guru</span>
                    </div>
                    <div class="lstat-row">
                        <i data-lucide="user-check"></i>
                        <span class="lr-value">${r.hadirCount}</span>
                        <span class="lr-label">Hadir Bulan Ini</span>
                    </div>
                    <div class="lstat-row">
                        <i data-lucide="calendar-check"></i>
                        <span class="lr-value">${r.effectiveDays}</span>
                        <span class="lr-label">Hari Kerja</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Animasi donut mengisi
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            grid.querySelectorAll('.donut-fill').forEach(c => {
                const p = parseFloat(c.dataset.persen);
                c.style.strokeDashoffset = 264 - (264 * p / 100);
            });
        });
    });
}

// --- Chart.js: Perbandingan Antar Lembaga ---
function renderLembagaChart(results) {
    const canvas = document.getElementById('lembagaChart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (lembagaChartInstance) lembagaChartInstance.destroy();

    lembagaChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: results.map(r => r.kode),
            datasets: [{
                data: results.map(r => r.persentase),
                backgroundColor: results.map(r => r.chart),
                borderRadius: 10,
                barThickness: 26
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    max: 100,
                    grid: { color: 'rgba(6,78,59,0.06)' },
                    ticks: { callback: v => v + '%', color: '#64748b', font: { family: 'Poppins' } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#1e293b', font: { family: 'Poppins', weight: '600', size: 13 } }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#065f46',
                    padding: 12,
                    cornerRadius: 10,
                    titleFont: { family: 'Poppins' },
                    bodyFont: { family: 'Poppins' },
                    callbacks: {
                        title: (items) => results[items[0].dataIndex].namaLengkap,
                        label: (ctx) => ` Kehadiran: ${ctx.parsed.x}%`
                    }
                }
            }
        }
    });
}

// --- Segmented Bar: Statistik Status Bulan Ini ---
function renderMonthlyStats(counts) {
    const c = { hadir: 0, sakit: 0, izin: 0, alpha: 0, ...(counts || {}) };
    const total = c.hadir + c.sakit + c.izin + c.alpha;

    document.getElementById('segHadir').textContent = c.hadir;
    document.getElementById('segSakit').textContent = c.sakit;
    document.getElementById('segIzin').textContent  = c.izin;
    document.getElementById('segAlpha').textContent = c.alpha;

    // Nama bulan hijriyah di chip
    const h = HijriCalendar.toHijri(new Date());
    const chip = document.getElementById('statMonthChip');
    if (chip) chip.textContent = `Bulan ${h.month} H`;

    const widths = total === 0
        ? [0, 0, 0, 0]
        : [c.hadir, c.sakit, c.izin, c.alpha].map(v => (v / total) * 100);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            document.querySelectorAll('#segBar .seg-seg').forEach((seg, i) => {
                seg.style.width = widths[i] + '%';
            });
        });
    });
}

// --- Kartu Absensi Hari Ini ---
function renderTodayAbsensi(hadir, total) {
    const persen = total > 0 ? Math.round((hadir / total) * 100) : 0;

    const chip = document.getElementById('todayDateChip');
    if (chip) {
        const now = new Date();
        const bulanNama = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        chip.textContent = `${now.getDate()} ${bulanNama[now.getMonth()]} ${now.getFullYear()}`;
    }

    document.getElementById('todayHadir').textContent = hadir;
    document.getElementById('todayTotal').textContent = total;
    document.getElementById('todayPersen').textContent = persen + '%';

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const fill = document.getElementById('todayFill');
            if (fill) fill.style.width = persen + '%';
        });
    });
}

// --- Mini Stat Tiles (total gabungan) ---
function renderMiniStats(overall) {
    const o = { totalGuru: 0, hadirBulanIni: 0, hariKerja: 0, persentase: 0, ...(overall || {}) };
    document.getElementById('msTotalGuru').textContent  = o.totalGuru;
    document.getElementById('msHadirBulan').textContent = o.hadirBulanIni;
    document.getElementById('msHariKerja').textContent  = o.hariKerja;
    document.getElementById('msPersen').textContent     = o.persentase + '%';
}

/* ========================
   LOAD DATA DASHBOARD
======================== */
async function loadDashboardData(session) {
    try {
        const todayHijri = HijriCalendar.toHijri(new Date());
        const bulanTarget = todayHijri.month;
        const tahunTarget = todayHijri.year;

        const baseDate = new Date(2024, 6, 8); 
        const targetMonths = (tahunTarget - 1446) * 12 + (bulanTarget - 1);
        const approxDays = targetMonths * 29.53059;
        
        const midDateMasehi = new Date(baseDate.getTime() + approxDays * 24 * 60 * 60 * 1000);
        const startDateMasehi = new Date(midDateMasehi.getTime() - 20 * 24 * 60 * 60 * 1000);
        
        const formatD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const startStr = formatD(startDateMasehi);
        const endStr = todayLocal();

        const [lembagaRes, guruRes, absenRes, liburRes] = await Promise.all([
            db.from('lembaga').select('*').order('kode'),
            db.from('guru').select('id, lembaga_id'),
            db.from('absen').select('guru_id, status, tanggal').gte('tanggal', startStr).lte('tanggal', endStr),
            db.from('hari_libur').select('tanggal, lembaga_id')
        ]);

        const lembagaData = lembagaRes.data || [];
        const guruData = guruRes.data || [];
        const absenData = absenRes.data || [];
        const liburData = liburRes.data || [];

        // Pre-index absen per tanggal (biar loop ringan)
        const absenByDate = {};
        absenData.forEach(a => {
            if (!absenByDate[a.tanggal]) absenByDate[a.tanggal] = [];
            absenByDate[a.tanggal].push(a);
        });

        // Kumpulan tanggal valid bulan hijriyah ini (bukan Jumat)
        const monthDates = [];
        let loopDate = new Date(startDateMasehi);
        while (loopDate <= new Date()) {
            const h = HijriCalendar.toHijri(loopDate);
            if (h.month === bulanTarget && h.year === tahunTarget && loopDate.getDay() !== 5) {
                monthDates.push(formatD(loopDate));
            }
            loopDate.setDate(loopDate.getDate() + 1);
        }

        const results = [];
        let globalHadirBulan = 0;
        let globalMaxPossible = 0;
        let globalHariKerja = 0;

        lembagaData.forEach((lembaga, index) => {
            const guruLembaga = guruData.filter(g => g.lembaga_id === lembaga.id);
            const totalGuru = guruLembaga.length;
            const guruIds = new Set(guruLembaga.map(g => g.id));

            // Hitung Hari Kerja & Hadir (dengan pengecekan Hari Libur)
            let effectiveDays = 0;
            let hadirCount = 0;

            monthDates.forEach(dateStr => {
                const isLibur = liburData.some(l => l.tanggal === dateStr && l.lembaga_id === lembaga.id);
                if (isLibur) return;

                effectiveDays++;
                (absenByDate[dateStr] || []).forEach(a => {
                    if (a.status === 'hadir' && guruIds.has(a.guru_id)) hadirCount++;
                });
            });

            const maxAttendance = totalGuru * effectiveDays;
            const persentase = maxAttendance > 0 ? Math.round((hadirCount / maxAttendance) * 100) : 0;

            const t = LEMBAGA_THEMES[lembaga.kode] || FALLBACK_THEMES[index % FALLBACK_THEMES.length];

            results.push({
                kode: lembaga.kode,
                nama: lembaga.nama.replace('MMU ', ''),
                namaLengkap: `${lembaga.kode} - ${lembaga.nama.replace('MMU ', '')}`,
                totalGuru,
                hadirCount,
                effectiveDays,
                persentase,
                theme: t.theme,
                icon: t.icon,
                chart: t.chart
            });

            globalHadirBulan += hadirCount;
            globalMaxPossible += maxAttendance;
            globalHariKerja = Math.max(globalHariKerja, effectiveDays);
        });

        // === 1. Kartu lembaga (donut) + chart perbandingan ===
        renderLembagaStats(results);
        renderLembagaChart(results);

        // === 2. Segmented bar: hitung semua status di bulan hijriyah ini ===
        const statusCounts = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
        const monthDateSet = new Set(monthDates);
        absenData.forEach(a => {
            if (monthDateSet.has(a.tanggal) && statusCounts.hasOwnProperty(a.status)) {
                statusCounts[a.status]++;
            }
        });
        renderMonthlyStats(statusCounts);

        // === 3. Absensi hari ini ===
        const todayStr = todayLocal();
        const hadirToday = (absenByDate[todayStr] || []).filter(a => a.status === 'hadir').length;
        renderTodayAbsensi(hadirToday, guruData.length);

        // === 4. Mini stat tiles (gabungan semua lembaga) ===
        renderMiniStats({
            totalGuru: guruData.length,
            hadirBulanIni: globalHadirBulan,
            hariKerja: globalHariKerja,
            persentase: globalMaxPossible > 0 ? Math.round((globalHadirBulan / globalMaxPossible) * 100) : 0
        });

    } catch (error) {
        console.error('Error:', error.message);
        showToast('Gagal memuat data dashboard', 'error');
    }
}