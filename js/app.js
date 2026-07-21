// js/app.js
// Dashboard Logic (Hijriyah Based & Real-time Clock)

let monthlyChartInstance = null;

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
            db.from('hari_libur').select('tanggal, lembaga_id') // FETCH HARI LIBUR
        ]);

        const lembagaData = lembagaRes.data || [];
        const guruData = guruRes.data || [];
        const absenData = absenRes.data || [];
        const liburData = liburRes.data || [];

        let html = '';
        const colors = [
            { bg: '#ecfdf5', border: '#166534', text: '#166534', icon: 'school' },
            { bg: '#eff6ff', border: '#1e40af', text: '#1e40af', icon: 'book-open' },
            { bg: '#fefce8', border: '#a16207', text: '#a16207', icon: 'graduation-cap' }
        ];

        lembagaData.forEach((lembaga, index) => {
            const guruLembaga = guruData.filter(g => g.lembaga_id === lembaga.id);
            const totalGuru = guruLembaga.length;
            const guruIds = guruLembaga.map(g => g.id);

            // Hitung Hari Kerja & Hadir (Dengan pengecekan Hari Libur)
            let effectiveDays = 0;
            let hadirCount = 0;

            let loopDate = new Date(startDateMasehi);
            while (loopDate <= new Date()) {
                let h = HijriCalendar.toHijri(loopDate);
                if (h.month === bulanTarget && h.year === tahunTarget && loopDate.getDay() !== 5) {
                    const dateStr = formatD(loopDate);
                    
                    // Cek apakah tanggal ini libur untuk lembaga ini
                    const isLibur = liburData.some(l => l.tanggal === dateStr && l.lembaga_id === lembaga.id);
                    
                    if (!isLibur) {
                        effectiveDays++; // Bukan Jumat & Bukan Libur = Hari Kerja
                        
                        // Hitung hadir di tanggal ini
                        absenData.forEach(a => {
                            if (a.tanggal === dateStr && a.status === 'hadir' && guruIds.includes(a.guru_id)) {
                                hadirCount++;
                            }
                        });
                    }
                }
                loopDate.setDate(loopDate.getDate() + 1);
            }

            const maxAttendance = totalGuru * effectiveDays;
            const persentase = maxAttendance > 0 ? Math.round((hadirCount / maxAttendance) * 100) : 0;

            const colorIndex = ['IBT', 'TS', 'IDAD'].indexOf(lembaga.kode);
            const color = colors[colorIndex !== -1 ? colorIndex : index % colors.length];

            html += `
            <div class="lembaga-card" style="background: ${color.bg}; border-top: 4px solid ${color.border};">
                <div class="lembaga-card-header">
                    <i data-lucide="${color.icon}" style="width: 24px; height: 24px; color: ${color.text};"></i>
                    <h3 style="color: ${color.text};">${lembaga.kode} - ${lembaga.nama.replace('MMU ', '')}</h3>
                </div>
                <div class="lembaga-stats-body">
                    <div class="lstat-item">
                        <span class="lstat-value" style="color: ${color.text};">${totalGuru}</span>
                        <span class="lstat-label">Total Guru</span>
                    </div>
                    <div class="lstat-item">
                        <span class="lstat-value" style="color: ${color.text};">${hadirCount}</span>
                        <span class="lstat-label">Hadir Bulan Ini</span>
                    </div>
                    <div class="lstat-item">
                        <span class="lstat-value" style="color: ${color.text};">${effectiveDays}</span>
                        <span class="lstat-label">Hari Kerja</span>
                    </div>
                    <div class="lstat-item big">
                        <span class="lstat-value" style="color: ${color.border};">${persentase}%</span>
                        <span class="lstat-label">Persentase</span>
                    </div>
                </div>
            </div>`;
        });

        document.getElementById('lembagaStatsGrid').innerHTML = html || '<div class="empty-state">Tidak ada data</div>';
        lucide.createIcons();

    } catch (error) {
        console.error('Error:', error.message);
    }
}