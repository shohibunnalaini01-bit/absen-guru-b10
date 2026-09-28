// js/absen.js
document.addEventListener('DOMContentLoaded', async function() {
    await HijriCalendar.ready;
    
    const session = Auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    if (session.role === 'pembaca_rekap') {
        showToast('Anda tidak memiliki akses', 'error');
        setTimeout(() => window.location.href = 'rekap.html', 1500);
        return;
    }

    initUI(session);
    startClock();
    await loadLembagaDropdown(session);

    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    document.getElementById('tanggalAbsen').value = today;

    document.getElementById('btnLoadAbsen').addEventListener('click', loadAbsensi);
    document.getElementById('btnHariIni').addEventListener('click', function() {
        const d2 = new Date();
        const todayStr = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
        document.getElementById('tanggalAbsen').value = todayStr;
        loadAbsensi();
    });
    document.getElementById('btnSimpanAbsen').addEventListener('click', simpanSemuaAbsen);
    document.getElementById('btnHapusAbsen').addEventListener('click', hapusAbsenHariIni);

    // Cek status kunci absen saat pertama kali load
    checkAbsenStatus();
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
    document.getElementById('userName').textContent = session.nama;
    document.getElementById('userRole').textContent = session.role.replace(/_/g, ' ').toUpperCase();

    // Render Sidebar based on Role
    const sidebarNav = document.getElementById('sidebarNav');
    if (session.role.startsWith('pengabsen_')) {
        sidebarNav.innerHTML = `
            <a href="absen.html" class="nav-item active"><i data-lucide="clipboard-check"></i><span>Absensi</span></a>
        `;
    } else {
        sidebarNav.innerHTML = `
            <a href="index.html" class="nav-item"><i data-lucide="layout-dashboard"></i><span>Dashboard</span></a>
            <a href="jadwal.html" class="nav-item"><i data-lucide="calendar-days"></i><span>Jadwal & Data</span></a>
            <a href="absen.html" class="nav-item active"><i data-lucide="clipboard-check"></i><span>Absensi</span></a>
            <a href="rekap.html" class="nav-item"><i data-lucide="bar-chart-3"></i><span>Rekap Laporan</span></a>
            ${session.role === 'superadmin' ? '<a href="manajemen-user.html" class="nav-item"><i data-lucide="settings"></i><span>Manajemen</span></a>' : ''}
        `;
    }

    if (session.role === 'superadmin') {
        document.querySelector('.lembaga-select-wrapper').style.display = 'block';
    } else if (session.lembaga_id) {
        document.getElementById('absenLembaga').value = session.lembaga_id;
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

function startClock() {
    const clockEl = document.getElementById('realTimeClock');
    function updateClock() {
        const now = new Date();
        clockEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} WIB`;
    }
    updateClock();
    setInterval(updateClock, 1000);
}

async function loadLembagaDropdown(session) {
    const { data } = await db.from('lembaga').select('*').order('kode');
    if (data) {
        const select = document.getElementById('absenLembaga');
        select.innerHTML = '<option value="">-- Pilih Lembaga --</option>';
        data.forEach(l => select.innerHTML += `<option value="${l.id}">${l.kode} - ${l.nama}</option>`);
        if (session.lembaga_id) select.value = session.lembaga_id;

        // Otomatis load absen jika lembaga diganti
        select.addEventListener('change', () => {
            const tanggal = document.getElementById('tanggalAbsen').value;
            if(tanggal) loadAbsensi(); 
        });
    }
}

async function loadAbsensi() {
    const tanggal = document.getElementById('tanggalAbsen').value;
    const session = Auth.getSession();
    const lembagaId = document.getElementById('absenLembaga').value || session.lembaga_id;

    if (!tanggal) { showToast('Pilih tanggal terlebih dahulu', 'warning'); return; }
    if (!lembagaId) { showToast('Pilih Lembaga terlebih dahulu', 'warning'); return; }

    const hijriDate = HijriCalendar.format(new Date(tanggal + 'T00:00:00'));
    document.getElementById('hijriDisplay').textContent = hijriDate;

    const dayIndex = new Date(tanggal + 'T00:00:00').getDay();
    if (dayIndex === 5) {
        document.getElementById('kelasContainer').innerHTML = '<div class="empty-state" style="padding: 40px 0;">Hari Jumat - Libur</div>';
        document.getElementById('btnActionWrapper').style.display = 'none';
        return;
    }

    const hariMap = {6: 'Sabtu', 0: 'Ahad', 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis'};
    const dayName = hariMap[dayIndex];

    // Fetch Semua Rombel & Guru
    const { data: rombelData } = await db.from('rombel').select('*, kelas(nama)').eq('lembaga_id', lembagaId).order('nama');
    const { data: guruData } = await db.from('guru').select('*').eq('lembaga_id', lembagaId).order('nama');

    if (!rombelData || rombelData.length === 0) {
        document.getElementById('kelasContainer').innerHTML = '<div class="empty-state" style="padding: 40px 0;">Tidak ada data rombel untuk lembaga ini</div>';
        document.getElementById('btnActionWrapper').style.display = 'none';
        return;
    }

    let finalHtml = '';

    // LOOPING SETIAP ROMBEL
    for (const rombel of rombelData) {
        const { data: jadwalData } = await db.from('jadwal')
            .select('*, guru(nama), jam_pelajaran(jam_ke, jam_mulai, jam_selesai)')
            .eq('rombel_id', rombel.id)
            .eq('hari', dayName)
            .order('jam_ke', { referencedTable: 'jam_pelajaran', ascending: true });

        const { data: existingAbsen } = await db.from('absen').select('*').eq('tanggal', tanggal).eq('rombel_id', rombel.id);

        if (!jadwalData || jadwalData.length === 0) {
            finalHtml += `
            <div class="kelas-card" style="margin-bottom: 25px;">
                <div class="kelas-header"><i data-lucide="school"></i> Rombel ${rombel.nama}</div>
                <div class="empty-state">Tidak ada jadwal untuk rombel ini hari itu</div>
            </div>`;
            continue;
        }

        finalHtml += `
        <div class="kelas-card" style="margin-bottom: 25px;" data-rombel-id="${rombel.id}">
            <div class="kelas-header"><i data-lucide="school"></i> Rombel ${rombel.nama}</div>
            <table class="kelas-table">
                <thead>
                    <tr>
                        <th style="width:100px;">Jam</th>
                        <th>Guru</th>
                        <th>Mapel</th>
                        <th style="width:200px;">Status (H/S/I/A)</th>
                        <th style="width:180px;">Guru Pengganti</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const jadwal of jadwalData) {
            const existing = existingAbsen?.find(a => a.jadwal_id === jadwal.id);
            const currentStatus = existing ? existing.status : 'hadir'; 
            const currentPengganti = existing ? existing.guru_pengganti_id : '';

            let penggantiOptions = '<option value="">-- Kosong --</option>';
            guruData.forEach(g => {
                if (g.id !== jadwal.guru_id) {
                    penggantiOptions += `<option value="${g.id}" ${currentPengganti === g.id ? 'selected' : ''}>${g.nama}</option>`;
                }
            });

            const isPenggantiDisabled = currentStatus === 'hadir' ? 'disabled' : '';

            finalHtml += `
                <tr data-guru-id="${jadwal.guru_id}" data-rombel-id="${rombel.id}" data-jadwal-id="${jadwal.id}" data-jam-mulai="${jadwal.jam_pelajaran.jam_mulai}" data-jam-selesai="${jadwal.jam_pelajaran.jam_selesai}">
                    <td>${jadwal.jam_pelajaran.jam_ke} <br><small style="color:#64748b">${jadwal.jam_pelajaran.jam_mulai.substring(0,5)}-${jadwal.jam_pelajaran.jam_selesai.substring(0,5)}</small></td>
                    <td>${jadwal.guru.nama}</td>
                    <td>${jadwal.mata_pelajaran}</td>
                    <td class="status-col">
                        <div class="status-radio">
                            <label><input type="radio" name="status_${rombel.id}_${jadwal.id}" value="hadir" ${currentStatus === 'hadir' ? 'checked' : ''} onchange="togglePengganti(this)"> H</label>
                            <label><input type="radio" name="status_${rombel.id}_${jadwal.id}" value="sakit" ${currentStatus === 'sakit' ? 'checked' : ''} onchange="togglePengganti(this)"> S</label>
                            <label><input type="radio" name="status_${rombel.id}_${jadwal.id}" value="izin" ${currentStatus === 'izin' ? 'checked' : ''} onchange="togglePengganti(this)"> I</label>
                            <label><input type="radio" name="status_${rombel.id}_${jadwal.id}" value="alpha" ${currentStatus === 'alpha' ? 'checked' : ''} onchange="togglePengganti(this)"> A</label>
                        </div>
                    </td>
                    <td>
                        <select class="pengganti-select" ${isPenggantiDisabled}>
                            ${penggantiOptions}
                        </select>
                    </td>
                </tr>
            `;
        }
        finalHtml += `</tbody></table></div>`;
    }

    document.getElementById('kelasContainer').innerHTML = finalHtml;
    
    if (finalHtml !== '') {
        document.getElementById('btnActionWrapper').style.display = 'flex';
    } else {
        document.getElementById('btnActionWrapper').style.display = 'none';
    }
    
    lucide.createIcons();
}

function togglePengganti(radioBtn) {
    const row = radioBtn.closest('tr');
    const selectPengganti = row.querySelector('.pengganti-select');
    selectPengganti.disabled = radioBtn.value === 'hadir';
    if (radioBtn.value === 'hadir') selectPengganti.value = "";
}

async function simpanSemuaAbsen() {
    const tanggal = document.getElementById('tanggalAbsen').value;
    const btnSimpan = document.getElementById('btnSimpanAbsen');
    
    if (!tanggal) { showToast('Tanggal tidak valid', 'error'); return; }

    btnSimpan.disabled = true;
    btnSimpan.innerHTML = 'Menyimpan...';

    const rows = document.querySelectorAll('.kelas-table tbody tr');
    
    if (rows.length === 0) {
        showToast('Tidak ada data absensi untuk disimpan', 'warning');
        btnSimpan.disabled = false;
        btnSimpan.innerHTML = '<i data-lucide="save"></i> Simpan Absensi';
        lucide.createIcons();
        return;
    }

    let insertData = [];
    let jamTambahanData = [];
    let rombelIds = new Set();

    rows.forEach(row => {
        const jadwalId = row.dataset.jadwalId;
        const rombelId = row.dataset.rombelId;
        const guruId = row.dataset.guruId;
        const jamMulai = row.dataset.jamMulai;
        const jamSelesai = row.dataset.jamSelesai;
        
        if(!jadwalId) return;

        rombelIds.add(rombelId);

        const radioName = `status_${rombelId}_${jadwalId}`;
        const selectedRadio = row.querySelector(`input[name="${radioName}"]:checked`);
        const status = selectedRadio ? selectedRadio.value : 'hadir';
        
        const penggantiSelect = row.querySelector('.pengganti-select');
        const penggantiId = penggantiSelect ? penggantiSelect.value : null;

        insertData.push({
            jadwal_id: jadwalId,
            guru_id: guruId,
            rombel_id: rombelId,
            tanggal: tanggal,
            status: status,
            guru_pengganti_id: penggantiId || null
        });

        if (status !== 'hadir' && penggantiId) {
            jamTambahanData.push({
                guru_id: penggantiId,
                tanggal: tanggal,
                jam_mulai: jamMulai,
                jam_selesai: jamSelesai,
                keterangan: `Menggantikan guru`
            });
        }
    });

    try {
        const rombelIdsArray = Array.from(rombelIds);
        
        if (rombelIdsArray.length > 0) {
            await db.from('absen').delete().eq('tanggal', tanggal).in('rombel_id', rombelIdsArray);
        }

        if (insertData.length > 0) {
            const { error: absenError } = await db.from('absen').insert(insertData);
            if (absenError) throw absenError;
        }

        if (jamTambahanData.length > 0) {
            const guruIds = jamTambahanData.map(jt => jt.guru_id);
            await db.from('jam_tambahan').delete().eq('tanggal', tanggal).in('guru_id', guruIds);
            
            const { error: jtError } = await db.from('jam_tambahan').insert(jamTambahanData);
            if (jtError) throw jtError;
        }

        showToast('Absensi berhasil disimpan!', 'success');
        loadAbsensi(); // Load ulang agar data terbaru tampil

    } catch (error) {
        showToast('Gagal menyimpan: ' + error.message, 'error');
    }

    btnSimpan.disabled = false;
    btnSimpan.innerHTML = '<i data-lucide="save"></i> Simpan Absensi';
    lucide.createIcons();
}

async function hapusAbsenHariIni() {
    const tanggal = document.getElementById('tanggalAbsen').value;
    const session = Auth.getSession();
    const lembagaId = document.getElementById('absenLembaga').value || session.lembaga_id;
    
    if(!tanggal || !lembagaId) return;

    showToast('Menghapus absen...', 'warning', 1500);
    try {
        const { data: rombelData } = await db.from('rombel').select('id').eq('lembaga_id', lembagaId);
        const rombelIds = rombelData.map(r => r.id);

        if(rombelIds.length > 0) {
            await db.from('absen').delete().eq('tanggal', tanggal).in('rombel_id', rombelIds);
        }
        
        showToast('Absensi berhasil dihapus', 'success');
        loadAbsensi();
    } catch (error) {
        showToast('Gagal menghapus: ' + error.message, 'error');
    }
}

// ========================
// LOGIKA BUKA/TUTUP ABSENSI
// ========================

async function checkAbsenStatus() {
    const session = Auth.getSession();
    const { data, error } = await db.from('pengaturan').select('value').eq('key', 'absen_status').single();
    
    const isLocked = data && data.value === 'closed';
    const lockCard = document.getElementById('absenLockCard');
    const warningBox = document.getElementById('absenLockedWarning');
    const kelasWrapper = document.getElementById('kelasContainerWrapper');
    const btnActionWrapper = document.getElementById('btnActionWrapper');

    // Tampilkan tombol kunci hanya untuk Admin/Superadmin
    if (session.role === 'superadmin' || session.role.startsWith('admin_')) {
        lockCard.style.display = 'block';
        
        const lockLabel = document.getElementById('absenLockLabel');
        const lockDesc = document.getElementById('absenLockDesc');
        const btnToggle = document.getElementById('btnToggleAbsen');

        if (isLocked) {
            lockLabel.textContent = 'TERKUNCI';
            lockLabel.style.color = 'var(--danger)';
            lockDesc.textContent = 'Pengabsen tidak dapat mengisi absensi hari ini.';
            btnToggle.innerHTML = '<i data-lucide="unlock"></i> Buka Absensi';
            btnToggle.className = 'btn btn-success';
        } else {
            lockLabel.textContent = 'BUKA';
            lockLabel.style.color = 'var(--success)';
            lockDesc.textContent = 'Absensi sedang dibuka untuk diisi.';
            btnToggle.innerHTML = '<i data-lucide="lock"></i> Kunci Absensi';
            btnToggle.className = 'btn btn-danger';
        }
        lucide.createIcons();
    }

    // Terapkan status kunci ke layar
    if (isLocked) {
        warningBox.style.display = 'block';
        kelasWrapper.style.opacity = '0.4';
        kelasWrapper.style.pointerEvents = 'none'; // Blok klik
        if(btnActionWrapper) btnActionWrapper.style.display = 'none';
    } else {
        warningBox.style.display = 'none';
        kelasWrapper.style.opacity = '1';
        kelasWrapper.style.pointerEvents = 'auto';
    }
}

async function toggleAbsenStatus() {
    const { data, error } = await db.from('pengaturan').select('value').eq('key', 'absen_status').single();
    const currentStatus = data ? data.value : 'open';
    const newStatus = currentStatus === 'open' ? 'closed' : 'open';

    const { error: updateError } = await db.from('pengaturan').update({ value: newStatus }).eq('key', 'absen_status');
    
    if (updateError) {
        showToast('Gagal mengubah status: ' + updateError.message, 'error');
    } else {
        showToast(`Absensi berhasil ${newStatus === 'open' ? 'DIBUKA' : 'DIKUNCI'}!`, 'success');
        checkAbsenStatus(); // Refresh UI
    }
}

// ========================
// LOGIKA BUKA/TUTUP ABSENSI (GLOBAL LOCK)
// ========================

async function checkAbsenStatus() {
    const session = Auth.getSession();
    const { data, error } = await db.from('pengaturan').select('value').eq('key', 'absen_status').single();
    
    const isGlobalLocked = data && data.value === 'closed';

    const lockCard = document.getElementById('absenLockCard');
    const warningBox = document.getElementById('absenLockedWarning');
    const kelasWrapper = document.getElementById('kelasContainerWrapper');
    const btnActionWrapper = document.getElementById('btnActionWrapper');

    // 1. HANYA Superadmin yang bisa melihat dan mengakses tombol kunci
    if (session.role === 'superadmin') {
        lockCard.style.display = 'block';
        
        const lockLabel = document.getElementById('absenLockLabel');
        const lockDesc = document.getElementById('absenLockDesc');
        const btnToggle = document.getElementById('btnToggleAbsen');

        if (isGlobalLocked) {
            lockLabel.textContent = 'TERKUNCI';
            lockLabel.style.color = 'var(--danger)';
            lockDesc.textContent = 'Absensi dikunci. Pengabsen tidak dapat mengisi/mengubah data.';
            btnToggle.innerHTML = '<i data-lucide="unlock"></i> Buka Absensi';
            btnToggle.className = 'btn btn-success';
        } else {
            lockLabel.textContent = 'BUKA';
            lockLabel.style.color = 'var(--success)';
            lockDesc.textContent = 'Absensi dibuka untuk diisi.';
            btnToggle.innerHTML = '<i data-lucide="lock"></i> Kunci Absensi';
            btnToggle.className = 'btn btn-danger';
        }
        lucide.createIcons();
    } else {
        lockCard.style.display = 'none'; // Sembunyikan tombol untuk yang bukan superadmin
    }

    // 2. Terapkan efek kunci ke layar 
    // Kunci berlaku untuk SEMUA TANGGAL (Global), tapi Superadmin tetap bisa bypass (mengisi walau dikunci)
    if (isGlobalLocked && session.role !== 'superadmin') {
        warningBox.style.display = 'block';
        kelasWrapper.style.opacity = '0.4';
        kelasWrapper.style.pointerEvents = 'none'; // Blok klik total
        if(btnActionWrapper) btnActionWrapper.style.display = 'none';
    } else {
        warningBox.style.display = 'none';
        kelasWrapper.style.opacity = '1';
        kelasWrapper.style.pointerEvents = 'auto';
    }
}

async function toggleAbsenStatus() {
    const { data, error } = await db.from('pengaturan').select('value').eq('key', 'absen_status').single();
    const currentStatus = data ? data.value : 'open';
    const newStatus = currentStatus === 'open' ? 'closed' : 'open';

    const { error: updateError } = await db.from('pengaturan').update({ value: newStatus }).eq('key', 'absen_status');
    
    if (updateError) {
        showToast('Gagal mengubah status: ' + updateError.message, 'error');
    } else {
        showToast(`Absensi berhasil ${newStatus === 'open' ? 'DIBUKA' : 'DIKUNCI'}!`, 'success');
        checkAbsenStatus(); // Refresh UI
    }
}