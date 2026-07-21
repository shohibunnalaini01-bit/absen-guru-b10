// js/rekap.js
document.addEventListener('DOMContentLoaded', async function() {
    const session = Auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    initUI(session);
    await loadLembagaDropdown(session);

    const todayHijri = HijriCalendar.toHijri(new Date());
    document.getElementById('filterBulan').value = todayHijri.month;
    
    const tahunSelect = document.getElementById('filterTahun');
    for(let y = todayHijri.year - 5; y <= todayHijri.year + 5; y++) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y + ' H';
        if(y === todayHijri.year) opt.selected = true;
        tahunSelect.appendChild(opt);
    }

    document.getElementById('btnTampilkan').addEventListener('click', generateRekap);
    document.getElementById('btnExportCSV').addEventListener('click', exportCSV);
    document.getElementById('btnExportImage').addEventListener('click', exportImage);
});

function initUI(session) {
    const today = new Date();
    const masehiStr = `${['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][today.getDay()]}, ${today.getDate()} ${['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][today.getMonth()]} ${today.getFullYear()}`;
    const hijriStr = HijriCalendar.format(today);
    
    document.getElementById('hijriSidebar').textContent = hijriStr;
    document.getElementById('gregorianSidebar').textContent = masehiStr;
    document.getElementById('todayDisplay').textContent = `${hijriStr} | ${masehiStr}`;
    document.getElementById('userName').textContent = session.nama;
    document.getElementById('userRole').textContent = session.role.replace(/_/g, ' ').toUpperCase();

    if (session.role === 'superadmin') {
        document.querySelector('.nav-admin-only').style.display = 'flex';
        document.querySelector('.lembaga-select-wrapper').style.display = 'block';
    }

    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    menuToggle.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
    overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });

    document.getElementById('btnLogout').addEventListener('click', function() {
        showToast('Mengeluarkan akun...', 'warning', 1500);
        setTimeout(() => { Auth.logout(); }, 1000);
    });
    lucide.createIcons();
}

async function loadLembagaDropdown(session) {
    const { data } = await db.from('lembaga').select('*').order('kode');
    if (data) {
        const select = document.getElementById('rekapLembaga');
        select.innerHTML = '<option value="">Semua Lembaga</option>';
        data.forEach(l => select.innerHTML += `<option value="${l.id}">${l.kode}</option>`);
        if (session.lembaga_id) select.value = session.lembaga_id;
    }
}

async function generateRekap() {
    const bulanTarget = parseInt(document.getElementById('filterBulan').value);
    const tahunTarget = parseInt(document.getElementById('filterTahun').value);
    const session = Auth.getSession();
    const lembagaId = document.getElementById('rekapLembaga').value || session.lembaga_id;

    showToast('Menghitung rekap data...', 'info', 2000);

    const baseDate = new Date(2024, 6, 8); // 1 Muharram 1446 H
    const targetMonths = (tahunTarget - 1446) * 12 + (bulanTarget - 1);
    const approxDays = targetMonths * 29.53059;
    
    const midDateMasehi = new Date(baseDate.getTime() + approxDays * 24 * 60 * 60 * 1000);
    const startDateMasehi = new Date(midDateMasehi.getTime() - 20 * 24 * 60 * 60 * 1000);
    const endDateMasehi = new Date(midDateMasehi.getTime() + 20 * 24 * 60 * 60 * 1000);

    const formatD = (d) => d.toISOString().split('T')[0];
    const startStr = formatD(startDateMasehi);
    const endStr = formatD(endDateMasehi);

    const hariMap = {6: 'Sabtu', 0: 'Ahad', 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis'};
    let effectiveDays = 0; 
    let totalScheduled = {}; 

    const [absenRes, jtRes, guruRes, jadwalRes] = await Promise.all([
        db.from('absen').select('guru_id, status, tanggal').gte('tanggal', startStr).lte('tanggal', endStr),
        db.from('jam_tambahan').select('guru_id, tanggal').gte('tanggal', startStr).lte('tanggal', endStr),
        db.from('guru').select('id, nama, lembaga_id'),
        db.from('jadwal').select('guru_id, hari')
    ]);

    let filteredGuru = guruRes.data || [];
    if (lembagaId) filteredGuru = filteredGuru.filter(g => g.lembaga_id === lembagaId);

    let filteredJadwal = jadwalRes.data || [];
    filteredJadwal = filteredJadwal.filter(j => filteredGuru.some(g => g.id === j.guru_id));

    // Hitung Hari Efektif Sekolah & Total Jadwal Per Guru
    let loopDate = new Date(startDateMasehi);
    while (loopDate <= endDateMasehi && loopDate <= new Date()) {
        let h = HijriCalendar.toHijri(loopDate);
        if (h.month === bulanTarget && h.year === tahunTarget && loopDate.getDay() !== 5) {
            effectiveDays++;
            
            let dayName = hariMap[loopDate.getDay()];
            filteredJadwal.forEach(j => {
                if (j.hari === dayName) {
                    if (!totalScheduled[j.guru_id]) totalScheduled[j.guru_id] = 0;
                    totalScheduled[j.guru_id]++;
                }
            });
        }
        loopDate.setDate(loopDate.getDate() + 1);
    }

    if (effectiveDays === 0) {
        document.getElementById('rekapTableBody').innerHTML = '<tr><td colspan="9" class="empty-state">Belum ada hari kerja di bulan ini atau bulan belum terjadi</td></tr>';
        document.getElementById('rekapStats').style.display = 'none';
        document.getElementById('exportSection').style.display = 'none';
        return;
    }

    // Hitung Rekap Per Guru
    let rekapData = filteredGuru.map(guru => {
        let hadir = 0, sakit = 0, izin = 0, alpha = 0;
        
        absenRes.data.forEach(a => {
            if (a.guru_id === guru.id) {
                let hAbsen = HijriCalendar.toHijri(new Date(a.tanggal + 'T00:00:00'));
                if (hAbsen.month === bulanTarget && hAbsen.year === tahunTarget) {
                    if(a.status === 'hadir') hadir++;
                    else if(a.status === 'sakit') sakit++;
                    else if(a.status === 'izin') izin++;
                    else if(a.status === 'alpha') alpha++;
                }
            }
        });

        let jtCount = 0;
        jtRes.data.forEach(jt => {
            if (jt.guru_id === guru.id) {
                let hJt = HijriCalendar.toHijri(new Date(jt.tanggal + 'T00:00:00'));
                if (hJt.month === bulanTarget && hJt.year === tahunTarget) jtCount++;
            }
        });

        let totalJadwalGuru = totalScheduled[guru.id] || 0;
        let persentase = totalJadwalGuru > 0 ? ((hadir / totalJadwalGuru) * 100) : 100; 

        return { guru_id: guru.id, nama: guru.nama, hadir, sakit, izin, alpha, jtCount, totalJadwalGuru, persentase: Math.round(persentase * 100) / 100 };
    });

    // Sorting & Ranking (Jika % sama, yang jam ngajarnya lebih banyak menang)
    rekapData.sort((a, b) => {
        if (b.persentase !== a.persentase) return b.persentase - a.persentase;
        return b.totalJadwalGuru - a.totalJadwalGuru; 
    });

    let rank = 1;
    rekapData.forEach((d, i) => {
        d.rank = (i > 0 && d.persentase === rekapData[i-1].persentase && d.totalJadwalGuru === rekapData[i-1].totalJadwalGuru) ? rekapData[i-1].rank : i + 1;
    });

    // Render UI
    let totalPersentase = 0;
    let html = '';
    rekapData.forEach(d => {
        totalPersentase += d.persentase;
        let rankClass = d.rank === 1 ? 'rank-1' : d.rank === 2 ? 'rank-2' : d.rank === 3 ? 'rank-3' : '';

        html += `
        <tr>
            <td><span class="${rankClass}">${d.rank}</span></td>
            <td style="text-align:left; font-weight:500;">${d.nama}</td>
            <td style="font-weight:600;">${d.totalJadwalGuru}</td>
            <td>${d.hadir}</td>
            <td>${d.sakit}</td>
            <td>${d.izin}</td>
            <td>${d.alpha}</td>
            <td>${d.jtCount}</td>
            <td style="font-weight:700; color:${d.persentase >= 80 ? 'var(--primary)' : 'var(--danger)'}">${d.persentase}%</td>
        </tr>`;
    });

    document.getElementById('rekapTableBody').innerHTML = html || '<tr><td colspan="9" class="empty-state">Tidak ada data</td></tr>';
    
    document.getElementById('statTotalGuru').textContent = filteredGuru.length;
    document.getElementById('statHariKerja').textContent = effectiveDays;
    document.getElementById('statRataHadir').textContent = filteredGuru.length > 0 ? Math.round(totalPersentase / filteredGuru.length) + '%' : '0%';
    
    document.getElementById('rekapStats').style.display = 'grid';
    document.getElementById('exportSection').style.display = 'flex';
    
    // Simpan data global untuk export
    window.currentRekapData = rekapData;
    window.currentEffectiveDays = effectiveDays;
    window.currentBulanNama = ['', 'Muharram', 'Safar', "Rabi'ul Awal", "Rabi'ul Akhir", 'Jumadil Ula', 'Jumadil Akhirah', 'Rajab', "Sya'ban", 'Ramadhan', 'Syawwal', "Dzulqa'dah", 'Dzulhijjah'][bulanTarget];
    window.currentTahun = tahunTarget;

    showToast('Rekap berhasil dimuat', 'success');
}

function exportCSV() {
    if (!window.currentRekapData || window.currentRekapData.length === 0) {
        showToast('Tidak ada data untuk di-export', 'warning'); return;
    }

    let csv = 'Rank,Nama Guru,Total Jam,Hadir,Sakit,Izin,Alpha,Jam Tambahan,Persentase\n';
    window.currentRekapData.forEach(d => {
        csv += `${d.rank},"${d.nama}",${d.totalJadwalGuru},${d.hadir},${d.sakit},${d.izin},${d.alpha},${d.jtCount},${d.persentase}%\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Rekap_Absensi_${window.currentBulanNama}_${window.currentTahun}_H.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    showToast('File CSV berhasil diunduh', 'success');
}

async function exportImage() {
    if (!window.currentRekapData || window.currentRekapData.length === 0) {
        showToast('Tidak ada data untuk dijadikan gambar', 'warning'); return;
    }

    showToast('Memproses gambar...', 'info', 1500);

    const captureArea = document.getElementById('captureArea');
    const captureHeader = document.getElementById('captureHeader');
    const captureBulanTahun = document.getElementById('captureBulanTahun');
    
    // Set informasi di header gambar
    captureBulanTahun.textContent = `Bulan: ${window.currentBulanNama} ${window.currentTahun} H`;
    
    // Tampilkan header khusus gambar
    captureHeader.style.display = 'block';

    try {
        const canvas = await html2canvas(captureArea, { 
            scale: 2, // Resolusi tinggi
            useCORS: true,
            backgroundColor: "#ffffff"
        });
        
        const link = document.createElement('a');
        link.download = `Rekap_Absensi_${window.currentBulanNama}_${window.currentTahun}_H.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        showToast('Gambar berhasil diunduh! Siap dikirim ke WA', 'success');
    } catch (error) {
        showToast('Gagal membuat gambar', 'error');
        console.error(error);
    } finally {
        // Sembunyikan lagi header khusus gambar setelah selesai
        captureHeader.style.display = 'none';
    }
}