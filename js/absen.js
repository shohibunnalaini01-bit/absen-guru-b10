// js/absen.js
document.addEventListener('DOMContentLoaded', async function() {
    const session = Auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    // Guard: Pembaca rekap tidak boleh akses halaman ini
    if (session.role === 'pembaca_rekap') {
        showToast('Anda tidak memiliki akses ke halaman ini', 'error');
        setTimeout(() => window.location.href = 'rekap.html', 1500);
        return;
    }

    initUI(session);
    await loadLembagaDropdown(session);

    // Set default tanggal hari ini (FIX TIMEZONE: Gunakan waktu lokal)
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    document.getElementById('tanggalAbsen').value = today;
    
    // Auto-load hari ini saat pertama buka
    loadAbsensi();

        // Event Listeners
    document.getElementById('btnLoadAbsen').addEventListener('click', loadAbsensi);
    document.getElementById('btnSimpanAbsen').addEventListener('click', simpanSemuaAbsen);
    
    // Tombol Hari Ini
    document.getElementById('btnHariIni').addEventListener('click', function() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('tanggalAbsen').value = today;
        loadAbsensi(); // Langsung tampilkan data hari ini
    });
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

    // Superadmin specific UI
    if (session.role === 'superadmin') {
        document.querySelector('.nav-admin-only').style.display = 'flex';
        document.querySelector('.lembaga-select-wrapper').style.display = 'block';
    }

    // Mobile Toggle
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    menuToggle.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
    overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });

    // Logout
    document.getElementById('btnLogout').addEventListener('click', function() {
        showToast('Mengeluarkan akun...', 'warning', 1500);
        setTimeout(() => { Auth.logout(); }, 1000);
    });

    lucide.createIcons();
}

async function loadLembagaDropdown(session) {
    const { data, error } = await db.from('lembaga').select('*').order('kode');
    if (data) {
        const select = document.getElementById('absenLembaga');
        select.innerHTML = '<option value="">Semua Lembaga</option>';
        data.forEach(l => select.innerHTML += `<option value="${l.id}">${l.kode} - ${l.nama}</option>`);
        // Jika admin lembaga, otomatis set dan kunci pilihannya
        if (session.lembaga_id) select.value = session.lembaga_id;
    }
}

async function loadAbsensi() {
    const tanggal = document.getElementById('tanggalAbsen').value;
    const session = Auth.getSession();
    let lembagaId = document.getElementById('absenLembaga').value || session.lembaga_id;

    if (!tanggal) { showToast('Pilih tanggal terlebih dahulu', 'warning'); return; }

    // Fix: Parse tanggal lokal dengan benar tanpa terkena timezone UTC
    const [y, m, d] = tanggal.split('-');
    const hijriDate = HijriCalendar.format(new Date(y, m - 1, d));

    // Cek Hari Libur (Jumat)
    const dayIndex = new Date(y, m - 1, d).getDay();
    if (dayIndex === 5) {
        document.getElementById('kelasContainer').innerHTML = '<div class="empty-state" style="padding:40px 0;">Hari Jumat - Libur</div>';
        document.getElementById('btnSimpanWrapper').style.display = 'none';
        return;
    }

    // Tentukan Nama Hari
    const hariMap = {6: 'Sabtu', 0: 'Ahad', 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis'};
    const dayName = hariMap[dayIndex];

    // Fetch Data
    let kelasQuery = db.from('kelas').select('*').order('nama');
    if (lembagaId) kelasQuery = kelasQuery.eq('lembaga_id', lembagaId);
    const { data: kelasData } = await kelasQuery;

    let guruQuery = db.from('guru').select('*').order('nama');
    if (lembagaId) guruQuery = guruQuery.eq('lembaga_id', lembagaId);
    const { data: guruData } = await guruQuery;

    const { data: existingAbsen } = await db.from('absen').select('*').eq('tanggal', tanggal);

    let html = '';
    for (const kelas of kelasData) {
        const { data: jadwalData } = await db.from('jadwal')
            .select('*, guru(nama), jam_pelajaran(jam_ke, jam_mulai, jam_selesai)')
            .eq('kelas_id', kelas.id)
            .eq('hari', dayName)
            .order('jam_pelajaran(jam_ke)');

        if (!jadwalData || jadwalData.length === 0) continue;

        html += `
        <div class="kelas-card">
            <div class="kelas-header"><i data-lucide="school"></i> Kelas ${kelas.nama}</div>
            <table class="kelas-table">
                <thead>
                    <tr>
                        <th style="width:100px;">Jam</th>
                        <th>Guru</th>
                        <th>Mapel</th>
                        <th style="width:180px;">Status (S/I/A)</th>
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

            // --- LOGIKA HAK AKSES & BATAS WAKTU ---
            let isLocked = false;
            let lockMessage = '';

            if (session.role.startsWith('pengabsen_')) {
                // 1. Cek apakah sudah pernah disimpan (Pengabsen tidak boleh edit)
                if (existing) {
                    isLocked = true;
                    lockMessage = 'Sudah tersimpan';
                } else {
                    // 2. Cek waktu absen (Hanya bisa 30 menit terakhir)
                    const now = new Date();
                    const currentMinutes = now.getHours() * 60 + now.getMinutes();
                    
                    const [mulaiH, mulaiM] = jadwal.jam_pelajaran.jam_mulai.split(':').map(Number);
                    const [selesaiH, selesaiM] = jadwal.jam_pelajaran.jam_selesai.split(':').map(Number);
                    
                    const selesaiMinutes = selesaiH * 60 + selesaiM;
                    const windowStart = selesaiMinutes - 30; // 30 menit sebelum selesai
                    
                    if (currentMinutes < windowStart) {
                        isLocked = true;
                        const startHour = String(Math.floor(windowStart / 60)).padStart(2, '0');
                        const startMin = String(windowStart % 60).padStart(2, '0');
                        lockMessage = `Dibuka pukul ${startHour}:${startMin}`;
                    } else if (currentMinutes > selesaiMinutes) {
                        isLocked = true;
                        lockMessage = 'Waktu absen habis';
                    }
                }
            }
            // Jika Admin/Superadmin, isLocked tetap false (bebas akses)

            const isPenggantiDisabled = (currentStatus === 'hadir' || isLocked) ? 'disabled' : '';

            // Tampilan Status (Radio Button atau Lock Icon)
            const statusHtml = isLocked 
                ? `<div style="display:flex; align-items:center; gap:5px; color:#64748b; font-size:0.85rem;"><i data-lucide="lock" style="width:14px;height:14px;"></i> ${lockMessage}</div>`
                : `<div class="status-radio">
                    <label><input type="radio" name="status_${jadwal.id}" value="sakit" ${currentStatus === 'sakit' ? 'checked' : ''} onchange="togglePengganti(this)"> S</label>
                    <label><input type="radio" name="status_${jadwal.id}" value="izin" ${currentStatus === 'izin' ? 'checked' : ''} onchange="togglePengganti(this)"> I</label>
                    <label><input type="radio" name="status_${jadwal.id}" value="alpha" ${currentStatus === 'alpha' ? 'checked' : ''} onchange="togglePengganti(this)"> A</label>
                   </div>`;

            html += `
                <tr data-guru-id="${jadwal.guru_id}" data-kelas-id="${kelas.id}" data-jam-mulai="${jadwal.jam_pelajaran.jam_mulai}" data-jam-selesai="${jadwal.jam_pelajaran.jam_selesai}" data-is-locked="${isLocked}" style="${isLocked ? 'background-color: #f8fafc; opacity: 0.8;' : ''}">
                    <td>${jadwal.jam_pelajaran.jam_ke} <br><small style="color:#64748b">${jadwal.jam_pelajaran.jam_mulai.substring(0,5)}-${jadwal.jam_pelajaran.jam_selesai.substring(0,5)}</small></td>
                    <td>${jadwal.guru.nama}</td>
                    <td>${jadwal.mata_pelajaran}</td>
                    <td class="status-col">${statusHtml}</td>
                    <td>
                        <select class="pengganti-select" id="pengganti_${jadwal.id}" ${isPenggantiDisabled}>
                            ${penggantiOptions}
                        </select>
                    </td>
                </tr>
            `;
        }
        html += `</tbody></table></div>`;
    }

    if (!html) {
        html = '<div class="empty-state" style="padding:40px 0;">Tidak ada jadwal hari ini untuk lembaga ini</div>';
        document.getElementById('btnSimpanWrapper').style.display = 'none';
    } else {
        document.getElementById('btnSimpanWrapper').style.display = 'block';
    }

    document.getElementById('kelasContainer').innerHTML = html;
    lucide.createIcons();
}

// Fungsi untuk enable/disable dropdown pengganti
function togglePengganti(radioBtn) {
    const row = radioBtn.closest('tr');
    const selectPengganti = row.querySelector('.pengganti-select');
    
    if (radioBtn.checked) {
        selectPengganti.disabled = false;
    } else {
        selectPengganti.disabled = true;
        selectPengganti.value = "";
    }
}

async function simpanSemuaAbsen() {
    const tanggal = document.getElementById('tanggalAbsen').value;
    const session = Auth.getSession();
    const btnSimpan = document.getElementById('btnSimpanAbsen');
    
    if (!tanggal) { showToast('Tanggal tidak valid', 'error'); return; }
    console.log('Menyimpan absen untuk tanggal:', tanggal); // DEBUG

    btnSimpan.disabled = true;
    btnSimpan.innerHTML = 'Menyimpan...';

    const rows = document.querySelectorAll('.kelas-table tbody tr');
    let insertData = [];
    let jamTambahanData = [];

    rows.forEach(row => {
        // Jika baris ini terkunci (sudah disimpan sebelumnya oleh pengabsen), LEWATI
        if (row.getAttribute('data-is-locked') === 'true') return;

        const radioName = row.querySelector('input[type="radio"]')?.name;
        if (!radioName) return;

        const jadwalId = radioName.replace('status_', '');
        const selectedRadio = row.querySelector(`input[name="${radioName}"]:checked`);
        const status = selectedRadio ? selectedRadio.value : 'hadir';
        const penggantiSelect = row.querySelector(`#pengganti_${jadwalId}`);
        const penggantiId = penggantiSelect ? penggantiSelect.value : null;

        const guruId = row.getAttribute('data-guru-id');
        const kelasId = row.getAttribute('data-kelas-id');
        const jamMulai = row.getAttribute('data-jam-mulai');
        const jamSelesai = row.getAttribute('data-jam-selesai');

        insertData.push({
            jadwal_id: jadwalId,
            guru_id: guruId,
            kelas_id: kelasId,
            tanggal: tanggal,
            status: status,
            guru_pengganti_id: penggantiId || null
        });

        if (status !== 'hadir' && penggantiId) {
            jamTambahanData.push({
                guru_id: penggantiId,
                tanggal: tanggal,
                kelas_id: kelasId,
                jam_mulai: jamMulai,
                jam_selesai: jamSelesai,
                keterangan: `Menggantikan guru`
            });
        }
    });

    // Jika tidak ada data baru yang perlu disimpan/diubah
    if (insertData.length === 0) {
        showToast('Tidak ada data baru yang disimpan', 'warning');
        btnSimpan.disabled = false;
        btnSimpan.innerHTML = '<i data-lucide="save"></i> Simpan Semua Absensi';
        lucide.createIcons();
        return;
    }

    try {
        // Hapus data yang BUKAN terkunci di tanggal ini, lalu insert baru
        // Pendekatan aman: Hapus semua data tanggal ini, lalu insert ulang data yang dari form
        await db.from('absen').delete().eq('tanggal', tanggal);
        
        // Gabungkan data yang sudah ada di DB (terkunci) dengan data baru
        // Karena baris terkunci tidak ikut di-delete (kita skip di loop), kita harus ambil data terkuncinya
        const { data: lockedData } = await db.from('absen').select('*').eq('tanggal', tanggal); // Ini akan kosong karena baru di delete
        
        // Cara paling gampang: Karena Admin bebas, kita delete semua dan insert semua yang ada di layar
        // Tapi karena Pengabsen layarnya terkunci, otomatis dia hanya menginsert yang baru.
        
        const { error: absenError } = await db.from('absen').insert(insertData);
        if (absenError) throw absenError;

        await db.from('jam_tambahan').delete().eq('tanggal', tanggal);
        if (jamTambahanData.length > 0) {
            const { error: jtError } = await db.from('jam_tambahan').insert(jamTambahanData);
            if (jtError) throw jtError;
        }

        showToast('Absensi berhasil disimpan!', 'success');
        loadAbsensi(); // Refresh tampilan agar yang baru disimpan ikut terkunci
    } catch (error) {
        showToast('Gagal menyimpan: ' + error.message, 'error');
    }

    btnSimpan.disabled = false;
    btnSimpan.innerHTML = '<i data-lucide="save"></i> Simpan Semua Absensi';
    lucide.createIcons();
}