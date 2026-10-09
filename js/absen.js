// js/absen.js
// Halaman Absensi — FINAL v3
// Tambahan: hari ujian → KBM tidak berjalan (seperti hari libur)

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

    const today = toLocalDateStr(new Date());
    document.getElementById('tanggalAbsen').value = today;

    document.getElementById('btnLoadAbsen').addEventListener('click', loadAbsensi);
    document.getElementById('btnHariIni').addEventListener('click', async function() {
        document.getElementById('tanggalAbsen').value = toLocalDateStr(new Date());
        await loadAbsensi();
    });
    document.getElementById('btnSimpanAbsen').addEventListener('click', simpanSemuaAbsen);
    document.getElementById('btnHapusAbsen').addEventListener('click', hapusAbsenHariIni);

    checkAbsenStatus();
});

/* ========================
   HELPERS
======================== */
function toLocalDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ========================
   LOADING STATE
======================== */
let isLoadingAbsen = false;

function setAbsenLoading(isLoading) {
    const btnLoad = document.getElementById('btnLoadAbsen');
    const btnToday = document.getElementById('btnHariIni');
    const container = document.getElementById('kelasContainer');

    if (!btnLoad.dataset.origHtml) btnLoad.dataset.origHtml = btnLoad.innerHTML;
    if (!btnToday.dataset.origHtml) btnToday.dataset.origHtml = btnToday.innerHTML;

    if (isLoading) {
        isLoadingAbsen = true;
        btnLoad.disabled = true;
        btnToday.disabled = true;
        btnLoad.innerHTML = '<i data-lucide="loader-2" class="spin-icon"></i> Memuat...';
        container.innerHTML = `
            <div class="absen-loading">
                <i data-lucide="loader-2" class="spin-icon-big"></i>
                <p>Memuat data absensi...</p>
            </div>`;
    } else {
        isLoadingAbsen = false;
        btnLoad.disabled = false;
        btnToday.disabled = false;
        btnLoad.innerHTML = btnLoad.dataset.origHtml;
        btnToday.innerHTML = btnToday.dataset.origHtml;
    }
    lucide.createIcons();
}

/* ========================
   INIT UI
======================== */
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
        const wrapper = document.querySelector('.lembaga-select-wrapper');
        if (wrapper) wrapper.style.display = 'block';
    } else if (session.lembaga_id) {
        document.getElementById('absenLembaga').value = session.lembaga_id;
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

        select.addEventListener('change', () => {
            const tanggal = document.getElementById('tanggalAbsen').value;
            if (tanggal) loadAbsensi();
        });
    }
}

/* ========================
   LOAD ABSENSI
======================== */
async function loadAbsensi() {
    if (isLoadingAbsen) return;

    const tanggal = document.getElementById('tanggalAbsen').value;
    const session = Auth.getSession();
    const lembagaId = document.getElementById('absenLembaga').value || session.lembaga_id;

    if (!tanggal) { showToast('Pilih tanggal terlebih dahulu', 'warning'); return; }
    if (!lembagaId) { showToast('Pilih Lembaga terlebih dahulu', 'warning'); return; }

    setAbsenLoading(true);

    try {
        const hijriDate = HijriCalendar.format(new Date(tanggal + 'T00:00:00'));
        document.getElementById('hijriDisplay').textContent = hijriDate;

        const dayIndex = new Date(tanggal + 'T00:00:00').getDay();

        // Jumat = libur
        if (dayIndex === 5) {
            document.getElementById('kelasContainer').innerHTML = '<div class="empty-state" style="padding: 40px 0;">Hari Jumat - Libur</div>';
            document.getElementById('btnActionWrapper').style.display = 'none';
            return;
        }

        // Hari ujian = KBM tidak berjalan
        const { data: ujianRows } = await db.from('hari_ujian')
            .select('keterangan, lembaga_id')
            .lte('tanggal_mulai', tanggal)
            .gte('tanggal_selesai', tanggal);

        const ujianBerlaku = (ujianRows || []).find(u => !u.lembaga_id || u.lembaga_id === lembagaId);
        if (ujianBerlaku) {
            document.getElementById('kelasContainer').innerHTML = `
                <div class="empty-state" style="padding: 40px 0;">
                    <strong style="color: var(--accent-dark);">Hari Ujian — Tidak Ada KBM</strong><br>
                    <small>${ujianBerlaku.keterangan || ''}</small>
                </div>`;
            document.getElementById('btnActionWrapper').style.display = 'none';
            return;
        }

        const hariMap = {6: 'Sabtu', 0: 'Ahad', 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis'};
        const dayName = hariMap[dayIndex];

        const { data: rombelData } = await db.from('rombel').select('*, kelas(nama)').eq('lembaga_id', lembagaId).order('nama');
        const { data: guruData } = await db.from('guru').select('*').eq('lembaga_id', lembagaId).order('nama');

        if (!rombelData || rombelData.length === 0) {
            document.getElementById('kelasContainer').innerHTML = '<div class="empty-state" style="padding: 40px 0;">Tidak ada data rombel untuk lembaga ini</div>';
            document.getElementById('btnActionWrapper').style.display = 'none';
            return;
        }

        const rombelIds = rombelData.map(r => r.id);

        const { data: allJadwal } = await db.from('jadwal')
            .select('*, guru(nama), jam_pelajaran(jam_ke, jam_mulai, jam_selesai)')
            .in('rombel_id', rombelIds)
            .eq('hari', dayName);

        const { data: allAbsen } = await db.from('absen').select('*')
            .eq('tanggal', tanggal)
            .in('rombel_id', rombelIds);

        const jadwalByRombel = {};
        (allJadwal || []).forEach(j => {
            if (!jadwalByRombel[j.rombel_id]) jadwalByRombel[j.rombel_id] = [];
            jadwalByRombel[j.rombel_id].push(j);
        });
        Object.values(jadwalByRombel).forEach(arr =>
            arr.sort((a, b) => (a.jam_pelajaran?.jam_ke ?? 0) - (b.jam_pelajaran?.jam_ke ?? 0))
        );

        const absenByRombel = {};
        (allAbsen || []).forEach(a => {
            if (!absenByRombel[a.rombel_id]) absenByRombel[a.rombel_id] = [];
            absenByRombel[a.rombel_id].push(a);
        });

        /* ===== STATUS PER ROMBEL (banner) ===== */
        let rombelTotal = 0, rombelSudah = 0, slotTotal = 0, slotTerisi = 0;

        rombelData.forEach(rombel => {
            const jadwalData = jadwalByRombel[rombel.id] || [];
            if (jadwalData.length === 0) return;
            rombelTotal++;
            slotTotal += jadwalData.length;

            const existingAbsen = absenByRombel[rombel.id] || [];
            if (existingAbsen.length > 0) {
                rombelSudah++;
                slotTerisi += existingAbsen.length;
            }
        });

        const tglObj = new Date(tanggal + 'T00:00:00');
        const tglID = tglObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        let bannerClass = 'asb-none', bannerIcon = 'circle-dashed', bannerText = 'Belum ada rombel yang diabsen';
        if (rombelTotal > 0 && rombelSudah === rombelTotal) {
            bannerClass = 'asb-done'; bannerIcon = 'check-check';
            bannerText = 'Semua rombel sudah diabsen';
        } else if (rombelSudah > 0) {
            bannerClass = 'asb-partial'; bannerIcon = 'circle-dotted';
            bannerText = 'Absensi sebagian — ada rombel yang belum diisi';
        }

        const bannerHtml = `
            <div class="absen-status-banner ${bannerClass}">
                <i data-lucide="${bannerIcon}"></i>
                <div class="asb-info">
                    <strong>Absensi ${tglID}</strong>
                    <span>${bannerText} — ${rombelSudah}/${rombelTotal} rombel · ${slotTerisi}/${slotTotal} slot tercatat</span>
                    <div class="asb-track"><div class="asb-fill" style="width: ${rombelTotal > 0 ? Math.round(rombelSudah / rombelTotal * 100) : 0}%"></div></div>
                </div>
            </div>
        `;

        /* ===== RENDER KARTU ROMBEL ===== */
        let finalHtml = bannerHtml;

        for (const rombel of rombelData) {
            const jadwalData = jadwalByRombel[rombel.id] || [];
            const existingAbsen = absenByRombel[rombel.id] || [];

            const sudah = existingAbsen.length > 0;
            const badge = jadwalData.length > 0
                ? (sudah
                    ? `<span class="rombel-badge rb-done"><i data-lucide="check"></i> Sudah diabsen · ${existingAbsen.length}/${jadwalData.length} slot</span>`
                    : `<span class="rombel-badge rb-belum"><i data-lucide="circle"></i> Belum diisi</span>`)
                : '';

            if (jadwalData.length === 0) {
                finalHtml += `
                <div class="kelas-card" style="margin-bottom: 25px;">
                    <div class="kelas-header"><i data-lucide="school"></i> Rombel ${rombel.nama}</div>
                    <div class="empty-state">Tidak ada jadwal untuk rombel ini hari itu</div>
                </div>`;
                continue;
            }

            finalHtml += `
            <div class="kelas-card" style="margin-bottom: 25px;" data-rombel-id="${rombel.id}">
                <div class="kelas-header">
                    <i data-lucide="school"></i> Rombel ${rombel.nama}
                    ${badge}
                </div>
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
                const jp = jadwal.jam_pelajaran || {};
                const existing = existingAbsen.find(a => a.jadwal_id === jadwal.id);
                const currentStatus = existing ? existing.status : 'hadir';
                const currentPengganti = existing ? (existing.guru_pengganti_id || '') : '';

                let penggantiOptions = '<option value="">-- Kosong --</option>';
                (guruData || []).forEach(g => {
                    if (g.id !== jadwal.guru_id) {
                        penggantiOptions += `<option value="${g.id}" ${currentPengganti === g.id ? 'selected' : ''}>${g.nama}</option>`;
                    }
                });

                const isPenggantiDisabled = currentStatus === 'hadir' ? 'disabled' : '';

                finalHtml += `
                    <tr data-guru-id="${jadwal.guru_id}" data-rombel-id="${rombel.id}" data-jadwal-id="${jadwal.id}"
                        data-jam-mulai="${jp.jam_mulai || ''}" data-jam-selesai="${jp.jam_selesai || ''}">
                        <td>${jp.jam_ke ?? '-'} <br><small style="color:#64748b">${(jp.jam_mulai || '').substring(0,5)}-${(jp.jam_selesai || '').substring(0,5)}</small></td>
                        <td>${jadwal.guru ? jadwal.guru.nama : '-'}</td>
                        <td>${jadwal.mata_pelajaran || '-'}</td>
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
        document.getElementById('btnActionWrapper').style.display = finalHtml !== '' ? 'flex' : 'none';

    } catch (error) {
        console.error('Error loadAbsensi:', error);
        document.getElementById('kelasContainer').innerHTML = `<div class="empty-state" style="padding: 40px 0;">Gagal memuat: ${error.message}</div>`;
        document.getElementById('btnActionWrapper').style.display = 'none';
    } finally {
        setAbsenLoading(false);
    }
}

function togglePengganti(radioBtn) {
    const row = radioBtn.closest('tr');
    const selectPengganti = row.querySelector('.pengganti-select');
    selectPengganti.disabled = radioBtn.value === 'hadir';
    if (radioBtn.value === 'hadir') selectPengganti.value = "";
}

/* ========================
   SIMPAN SEMUA ABSEN
======================== */
async function simpanSemuaAbsen() {
    const tanggal = document.getElementById('tanggalAbsen').value;
    const btnSimpan = document.getElementById('btnSimpanAbsen');

    if (!tanggal) { showToast('Tanggal tidak valid', 'error'); return; }
    if (btnSimpan && btnSimpan.disabled) return;

    const rows = document.querySelectorAll('.kelas-table tbody tr');

    if (rows.length === 0) {
        showToast('Tidak ada data absensi untuk disimpan', 'warning');
        return;
    }

    if (btnSimpan) {
        btnSimpan.disabled = true;
        btnSimpan.innerHTML = '<i data-lucide="loader-2" class="spin-icon"></i> Menyimpan...';
        lucide.createIcons();
    }

    let insertData = [];
    let jamTambahanData = [];
    let rombelIds = new Set();
    const seenJadwal = new Set();
    const seenJamTambah = new Set();

    rows.forEach(row => {
        const jadwalId = row.dataset.jadwalId;
        const rombelId = row.dataset.rombelId;
        const guruId = row.dataset.guruId;
        const jamMulai = row.dataset.jamMulai;
        const jamSelesai = row.dataset.jamSelesai;

        if (!jadwalId) return;
        if (seenJadwal.has(jadwalId)) return;
        seenJadwal.add(jadwalId);

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
            const jtKey = `${penggantiId}|${jamMulai}|${jamSelesai}`;
            if (!seenJamTambah.has(jtKey)) {
                seenJamTambah.add(jtKey);
                jamTambahanData.push({
                    guru_id: penggantiId,
                    tanggal: tanggal,
                    jam_mulai: jamMulai,
                    jam_selesai: jamSelesai,
                    keterangan: `Menggantikan guru`
                });
            }
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
        loadAbsensi();

    } catch (error) {
        showToast('Gagal menyimpan: ' + error.message, 'error');
    }

    if (btnSimpan) {
        btnSimpan.disabled = false;
        btnSimpan.innerHTML = '<i data-lucide="save"></i> Simpan Absensi';
        lucide.createIcons();
    }
}

async function hapusAbsenHariIni() {
    const tanggal = document.getElementById('tanggalAbsen').value;
    const session = Auth.getSession();
    const lembagaId = document.getElementById('absenLembaga').value || session.lembaga_id;

    if (!tanggal || !lembagaId) return;

    showToast('Menghapus absen...', 'warning', 1500);
    try {
        const { data: rombelData } = await db.from('rombel').select('id').eq('lembaga_id', lembagaId);
        const rombelIds = rombelData.map(r => r.id);

        if (rombelIds.length > 0) {
            await db.from('absen').delete().eq('tanggal', tanggal).in('rombel_id', rombelIds);
        }

        showToast('Absensi berhasil dihapus', 'success');
        loadAbsensi();
    } catch (error) {
        showToast('Gagal menghapus: ' + error.message, 'error');
    }
}

/* ========================
   HADIR SEMUA + AUTO-SAVE
======================== */
(function setupHadirSemua() {

    function injectButton() {
        const wrapper = document.getElementById('btnActionWrapper');
        if (wrapper && !document.getElementById('btnHadirSemua')) {
            const btn = document.createElement('button');
            btn.id = 'btnHadirSemua';
            btn.className = 'btn btn-success';
            btn.type = 'button';
            btn.innerHTML = '<i data-lucide="check-check"></i> Hadir Semua';
            wrapper.prepend(btn);
            lucide.createIcons();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectButton);
    } else {
        injectButton();
    }

    const wrapperEl = document.getElementById('btnActionWrapper');
    if (wrapperEl) {
        const observer = new MutationObserver(() => {
            if (wrapperEl.style.display !== 'none' && !document.getElementById('btnHadirSemua')) {
                injectButton();
            }
        });
        observer.observe(wrapperEl, { childList: true, subtree: true, attributes: true });
    }

    let isHadirSemuaRunning = false;

    document.addEventListener('click', async function(e) {
        const btn = e.target.closest('#btnHadirSemua');
        if (!btn) return;
        e.preventDefault();

        if (isHadirSemuaRunning) return;
        if (isLoadingAbsen) return;

        const btnSimpan = document.getElementById('btnSimpanAbsen');
        if (btnSimpan && btnSimpan.disabled) return;

        isHadirSemuaRunning = true;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin-icon"></i> Menyimpan...';
        lucide.createIcons();

        const rows = document.querySelectorAll('.kelas-table tbody tr');
        rows.forEach(row => {
            const jadwalId = row.dataset.jadwalId;
            const rombelId = row.dataset.rombelId;
            if (!jadwalId || !rombelId) return;

            const radio = row.querySelector(`input[name="status_${rombelId}_${jadwalId}"][value="hadir"]`);
            if (radio) {
                radio.checked = true;
                togglePengganti(radio);
            }
        });

        try {
            await simpanSemuaAbsen();
        } catch (err) {
            showToast('Gagal menyimpan: ' + err.message, 'error');
        }

        const existing = document.getElementById('btnHadirSemua');
        if (existing) {
            existing.disabled = false;
            existing.innerHTML = '<i data-lucide="check-check"></i> Hadir Semua';
            lucide.createIcons();
        }
        isHadirSemuaRunning = false;
    });

})();

/* ========================
   GLOBAL LOCK ABSENSI
======================== */
async function checkAbsenStatus() {
    const session = Auth.getSession();
    const { data, error } = await db.from('pengaturan').select('value').eq('key', 'absen_status').single();

    const isGlobalLocked = data && data.value === 'closed';

    const lockCard = document.getElementById('absenLockCard');
    const warningBox = document.getElementById('absenLockedWarning');
    const kelasWrapper = document.getElementById('kelasContainerWrapper');
    const btnActionWrapper = document.getElementById('btnActionWrapper');

    if (session.role === 'superadmin' && lockCard) {
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
    } else if (lockCard) {
        lockCard.style.display = 'none';
    }

    if (isGlobalLocked && session.role !== 'superadmin') {
        warningBox.style.display = 'block';
        kelasWrapper.style.opacity = '0.4';
        kelasWrapper.style.pointerEvents = 'none';
        if (btnActionWrapper) btnActionWrapper.style.display = 'none';
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
        checkAbsenStatus();
    }
}