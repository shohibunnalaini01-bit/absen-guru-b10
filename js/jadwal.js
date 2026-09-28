// js/jadwal.js
// Halaman Jadwal & Data — dengan Filter Lembaga Global + Group per Lembaga
// - Superadmin: filter pill (Semua | IBT | TS | ...) menyaring semua tab
//   Mode "Semua" = tabel dikelompokkan per lembaga (IBT dulu, lalu TS, dst)
// - Non-superadmin: otomatis hanya lihat lembaganya sendiri

document.addEventListener('DOMContentLoaded', async function() {
    await HijriCalendar.ready;

    const session = Auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    if (session.role.startsWith('pengabsen_')) {
        window.location.href = 'absen.html';
        return;
    }

    initUI(session);
    handleTabs();
    handleForms(session);
    handleLogout();

    await loadLembagaDropdown();
    await loadAllData(session);

    setupJadwalGrid(session);
    await setupRombelForm(session);

    setupLembagaFilterBar(session);
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
        document.querySelectorAll('.lembaga-select-wrapper').forEach(el => el.style.display = 'block');
    } else if (session.lembaga_id) {
        ['guruLembaga', 'kelasLembaga', 'jamLembaga', 'jadwalLembagaFilter', 'rombelLembaga'].forEach(id => {
            const s = document.getElementById(id);
            if (s) s.value = session.lembaga_id;
        });
    }

    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (menuToggle && sidebar && overlay) {
        menuToggle.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('show'); });
        overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); });
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function handleLogout() {
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', function() {
            showToast('Mengeluarkan akun...', 'warning', 1500);
            setTimeout(() => { Auth.logout(); }, 1000);
        });
    }
}

function handleTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.add('active');
        });
    });
}

async function loadLembagaDropdown() {
    const { data, error } = await db.from('lembaga').select('*').order('kode', { ascending: true });
    if (error) return;
    allLembaga = data || [];
    const dropdownIds = ['guruLembaga', 'kelasLembaga', 'jamLembaga', 'jadwalLembagaFilter', 'rombelLembaga'];
    dropdownIds.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '<option value="">Pilih Lembaga</option>';
            allLembaga.forEach(l => { select.innerHTML += `<option value="${l.id}">${l.kode} - ${l.nama}</option>`; });
        }
    });
}

/* ========================
   FILTER LEMBAGA GLOBAL
======================== */
let allLembaga = [];
let globalLembagaFilter = ''; // '' = Semua (grouped)

function isSuperadmin() {
    const session = Auth.getSession();
    return session && session.role === 'superadmin';
}

function setupLembagaFilterBar(session) {
    renderLembagaFilterBar();

    // Klik chip → filter semua tab sekaligus (event delegation)
    document.addEventListener('click', async function(e) {
        const chip = e.target.closest('.lf-chip');
        if (!chip) return;

        globalLembagaFilter = chip.dataset.lembaga || '';
        renderLembagaFilterBar();
        renderAllTables(session);

        // Sinkronkan dropdown lembaga di form & grid jadwal
        ['guruLembaga', 'kelasLembaga', 'jamLembaga', 'rombelLembaga', 'jadwalLembagaFilter'].forEach(id => {
            const s = document.getElementById(id);
            if (s && globalLembagaFilter) s.value = globalLembagaFilter;
        });

        // Refresh dropdown kelas (form rombel) & rombel grid (tab 4)
        await loadKelasForRombelDropdown(session);
        await loadRombelForGrid(session);
    });
}

function renderLembagaFilterBar() {
    const bar = document.getElementById('lembagaFilterBar');
    if (!bar) return;

    // Hanya superadmin yang butuh filter — non-superadmin sudah terfilter otomatis
    if (!isSuperadmin()) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';

    let html = `<button class="lf-chip ${globalLembagaFilter === '' ? 'active' : ''}" data-lembaga="">
        <i data-lucide="layout-grid"></i> Semua
    </button>`;
    allLembaga.forEach(l => {
        html += `<button class="lf-chip ${globalLembagaFilter === l.id ? 'active' : ''}" data-lembaga="${l.id}">
            ${l.kode}
        </button>`;
    });
    bar.innerHTML = html;
    lucide.createIcons();
}

// Data terfilter sesuai pill aktif
function filteredByLembaga(data) {
    return globalLembagaFilter ? data.filter(d => d.lembaga_id === globalLembagaFilter) : data;
}

/* ========================
   LOAD SEMUA DATA SEKALIGUS
   (1x fetch per tabel, lalu render dari memori — cepat & konsisten)
======================== */
let allGuru = [];
let allKelas = [];
let allJam = [];
let allRombel = [];

async function loadAllData(session) {
    const isSuper = isSuperadmin();

    let guruQ = db.from('guru').select('*, lembaga(kode)');
    let kelasQ = db.from('kelas').select('*, lembaga(kode)');
    let jamQ = db.from('jam_pelajaran').select('*, lembaga(kode)');
    let rombelQ = db.from('rombel').select('*, kelas(nama, tingkat), lembaga(kode)');

    if (!isSuper && session.lembaga_id) {
        guruQ = guruQ.eq('lembaga_id', session.lembaga_id);
        kelasQ = kelasQ.eq('lembaga_id', session.lembaga_id);
        jamQ = jamQ.eq('lembaga_id', session.lembaga_id);
        rombelQ = rombelQ.eq('lembaga_id', session.lembaga_id);
    }

    const [guruRes, kelasRes, jamRes, rombelRes] = await Promise.all([guruQ, kelasQ, jamQ, rombelQ]);

    allGuru = (guruRes.data || []).sort((a, b) =>
        (a.lembaga?.kode || '').localeCompare(b.lembaga?.kode || '') || a.nama.localeCompare(b.nama));
    allKelas = (kelasRes.data || []).sort((a, b) =>
        (a.lembaga?.kode || '').localeCompare(b.lembaga?.kode || '') || (a.tingkat || 0) - (b.tingkat || 0) || a.nama.localeCompare(b.nama));
    allJam = (jamRes.data || []).sort((a, b) =>
        (a.lembaga?.kode || '').localeCompare(b.lembaga?.kode || '') || a.jam_ke - b.jam_ke);
    allRombel = (rombelRes.data || []).sort((a, b) =>
        (a.lembaga?.kode || '').localeCompare(b.lembaga?.kode || '') || a.nama.localeCompare(b.nama));

    renderAllTables(session);
}

function renderAllTables(session) {
    renderGuruTable();
    renderKelasTable();
    renderJamTable();
    renderRombelTable();
    updateGridRombelDropdown();
}

// Render baris tabel dengan GROUP HEADER per lembaga (urut sesuai kode lembaga)
function renderGroupedByLembaga(data, colspan, rowMapper) {
    let html = '';
    let hasData = false;

    allLembaga.forEach(l => {
        const items = data.filter(d => d.lembaga_id === l.id);
        if (items.length === 0) return;
        hasData = true;
        html += `<tr class="group-row"><td colspan="${colspan}">
            <i data-lucide="building-2"></i> ${l.kode} — ${l.nama}
            <span class="group-count">${items.length} data</span>
        </td></tr>`;
        items.forEach((item, i) => { html += rowMapper(item, i + 1); });
    });

    if (!hasData) {
        html = `<tr><td colspan="${colspan}" class="empty-state">Belum ada data</td></tr>`;
    }
    return html;
}

/* ========================
   HANDLE FORMS (tambah data)
======================== */
function handleForms(session) {
    // Form Guru
    document.getElementById('guruForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        let lembaga_id = session.lembaga_id;
        if (session.role === 'superadmin') {
            lembaga_id = document.getElementById('guruLembaga').value;
            if (!lembaga_id) { showToast('Pilih lembaga terlebih dahulu', 'warning'); return; }
        }
        const nama = document.getElementById('guruNama').value;
        const { error } = await db.from('guru').insert({ nama, lembaga_id });
        if (error) { showToast('Gagal: ' + error.message, 'error'); }
        else { showToast('Guru berhasil ditambahkan', 'success'); document.getElementById('guruForm').reset(); await loadAllData(session); }
    });

    // Form Kelas
    document.getElementById('kelasForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        let lembaga_id = session.lembaga_id;
        if (session.role === 'superadmin') {
            lembaga_id = document.getElementById('kelasLembaga').value;
            if (!lembaga_id) { showToast('Pilih lembaga terlebih dahulu', 'warning'); return; }
        }
        const nama = document.getElementById('kelasNama').value;
        const tingkatRaw = document.getElementById('kelasTingkat').value;
        const { error } = await db.from('kelas').insert({
            nama, lembaga_id,
            tingkat: tingkatRaw ? parseInt(tingkatRaw) : null,
            huruf: null
        });
        if (error) { showToast('Gagal: ' + error.message, 'error'); }
        else { showToast('Kelas berhasil ditambahkan', 'success'); document.getElementById('kelasForm').reset(); await loadAllData(session); }
    });

    // Form Jam Pelajaran
    document.getElementById('jamForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        let lembaga_id = session.lembaga_id;
        if (session.role === 'superadmin') {
            lembaga_id = document.getElementById('jamLembaga').value;
            if (!lembaga_id) { showToast('Pilih lembaga terlebih dahulu', 'warning'); return; }
        }
        const jam_ke = document.getElementById('jamKe').value;
        const jam_mulai = document.getElementById('jamMulai').value;
        const jam_selesai = document.getElementById('jamSelesai').value;
        const { error } = await db.from('jam_pelajaran').insert({ jam_ke: parseInt(jam_ke), jam_mulai, jam_selesai, lembaga_id });
        if (error) { showToast('Gagal: ' + error.message, 'error'); }
        else { showToast('Jam pelajaran berhasil ditambahkan', 'success'); document.getElementById('jamForm').reset(); await loadAllData(session); }
    });
}

/* ========================
   RENDER TABEL (dari memori, grouped per lembaga)
======================== */
function renderGuruTable() {
    const data = filteredByLembaga(allGuru);
    const tbody = document.getElementById('guruTable');
    const countEl = document.getElementById('guruCount');
    if (countEl) countEl.textContent = data.length;

    tbody.innerHTML = renderGroupedByLembaga(data, 4, (g, no) => `
        <tr>
            <td class="col-no">${no}</td>
            <td class="cell-strong">${g.nama}</td>
            <td><span class="kode-chip">${g.lembaga ? g.lembaga.kode : '-'}</span></td>
            <td class="action-col">
                <div class="action-buttons">
                    <button class="btn-icon btn-icon-view" onclick="showGuruDetail('${g.id}', '${g.nama.replace(/'/g, "\\'")}', '${g.lembaga ? g.lembaga.kode : ''}')" title="Detail Guru"><i data-lucide="eye"></i></button>
                    <button class="btn-icon btn-icon-edit" onclick="editGuru('${g.id}', '${g.nama.replace(/'/g, "\\'")}')" title="Edit Nama"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon btn-icon-delete" onclick="deleteData('guru', '${g.id}', '${g.nama.replace(/'/g, "\\'")}')" title="Hapus"><i data-lucide="trash-2"></i></button>
                </div>
            </td>
        </tr>
    `);
    lucide.createIcons();
}

function renderKelasTable() {
    const data = filteredByLembaga(allKelas);
    const tbody = document.getElementById('kelasTable');

    tbody.innerHTML = renderGroupedByLembaga(data, 5, (k, no) => `
        <tr>
            <td class="col-no">${no}</td>
            <td class="cell-strong">${k.tingkat ?? '-'}</td>
            <td class="cell-strong">${k.nama}</td>
            <td><span class="kode-chip">${k.lembaga ? k.lembaga.kode : '-'}</span></td>
            <td class="action-col">
                <div class="action-buttons">
                    <button class="btn-icon btn-icon-edit" onclick="editKelas('${k.id}', '${k.nama.replace(/'/g, "\\'")}')" title="Edit"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon btn-icon-delete" onclick="deleteData('kelas', '${k.id}', '${k.nama.replace(/'/g, "\\'")}')" title="Hapus"><i data-lucide="trash-2"></i></button>
                </div>
            </td>
        </tr>
    `);
    lucide.createIcons();
}

function renderJamTable() {
    let data = filteredByLembaga(allJam);

    // Dedupe: jam sama (ke + waktu) dalam lembaga yang sama hanya tampil sekali
    const seen = new Set();
    data = data.filter(j => {
        const key = `${j.lembaga_id}|${j.jam_ke}|${j.jam_mulai}|${j.jam_selesai}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    const tbody = document.getElementById('jamTable');

    tbody.innerHTML = renderGroupedByLembaga(data, 5, (j, no) => `
        <tr>
            <td><span class="jam-badge">${j.jam_ke}</span></td>
            <td class="cell-strong">${j.jam_mulai.substring(0,5)}</td>
            <td class="cell-strong">${j.jam_selesai.substring(0,5)}</td>
            <td><span class="kode-chip">${j.lembaga ? j.lembaga.kode : '-'}</span></td>
            <td class="action-col">
                <div class="action-buttons">
                    <button class="btn-icon btn-icon-edit" onclick="editJam('${j.id}', ${j.jam_ke}, '${j.jam_mulai.substring(0,5)}', '${j.jam_selesai.substring(0,5)}')" title="Edit"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon btn-icon-delete" onclick="deleteData('jam_pelajaran', '${j.id}', 'Jam ${j.jam_ke}')" title="Hapus"><i data-lucide="trash-2"></i></button>
                </div>
            </td>
        </tr>
    `);
    lucide.createIcons();
}

function renderRombelTable() {
    const data = filteredByLembaga(allRombel);
    const tbody = document.getElementById('rombelTable');

    tbody.innerHTML = renderGroupedByLembaga(data, 5, (r, no) => `
        <tr>
            <td class="col-no">${no}</td>
            <td class="cell-strong">${r.nama}</td>
            <td>${r.kelas ? r.kelas.nama : '-'}</td>
            <td><span class="kode-chip">${r.lembaga ? r.lembaga.kode : '-'}</span></td>
            <td class="action-col">
                <div class="action-buttons">
                    <button class="btn-icon btn-icon-edit" onclick="editRombel('${r.id}', '${r.nama.replace(/'/g, "\\'")}')" title="Edit"><i data-lucide="pencil"></i></button>
                    <button class="btn-icon btn-icon-delete" onclick="deleteData('rombel', '${r.id}', '${r.nama.replace(/'/g, "\\'")}')" title="Hapus"><i data-lucide="trash-2"></i></button>
                </div>
            </td>
        </tr>
    `);
    lucide.createIcons();
}

// Dropdown rombel di Tab 4 mengikuti filter global
function updateGridRombelDropdown() {
    const gridRombel = document.getElementById('gridRombel');
    if (!gridRombel) return;

    const session = Auth.getSession();
    const lembagaId = globalLembagaFilter || session.lembaga_id;
    const filtered = lembagaId ? allRombel.filter(r => r.lembaga_id === lembagaId) : allRombel;

    const currentVal = gridRombel.value;
    gridRombel.innerHTML = '<option value="">-- Pilih Rombel --</option>' +
        filtered.map(r => `<option value="${r.id}">${r.nama}${r.kelas ? ` (${r.kelas.nama})` : ''}</option>`).join('');

    // Pertahankan pilihan jika masih ada di daftar
    if (currentVal && filtered.some(r => r.id === currentVal)) {
        gridRombel.value = currentVal;
    }
}

/* ========================
   MATRIX JADWAL
======================== */
let gridGuruData = [];
let currentSchedule = {};
let currentRombelId = null;

function setupJadwalGrid(session) {
    const jadwalLembagaFilter = document.getElementById('jadwalLembagaFilter');

    if (session.lembaga_id && session.role !== 'superadmin') {
        jadwalLembagaFilter.value = session.lembaga_id;
    }

    jadwalLembagaFilter.addEventListener('change', async function() {
        await loadRombelForGrid(session);
        document.getElementById('jadwalGridContainer').style.display = 'none';
    });

    document.getElementById('gridRombel').addEventListener('change', async function() {
        const rombelId = this.value;
        if (!rombelId) { document.getElementById('jadwalGridContainer').style.display = 'none'; return; }
        await loadJadwalGrid(rombelId, session);
    });

    document.getElementById('btnSimpanMatrix').addEventListener('click', simpanJadwalMatrix);
}

async function loadRombelForGrid(session) {
    const lembagaId = globalLembagaFilter ||
                      document.getElementById('jadwalLembagaFilter').value ||
                      session.lembaga_id;

    const filtered = lembagaId ? allRombel.filter(r => r.lembaga_id === lembagaId) : allRombel;

    const select = document.getElementById('gridRombel');
    select.innerHTML = '<option value="">-- Pilih Rombel Terlebih Dahulu --</option>';
    filtered.forEach(r => {
        select.innerHTML += `<option value="${r.id}">${r.nama} (${r.kelas?.nama || ''})</option>`;
    });
    document.getElementById('jadwalGridContainer').style.display = 'none';
}

async function loadJadwalGrid(rombelId, session) {
    currentRombelId = rombelId;
    currentSchedule = {};

    const lembagaId = globalLembagaFilter ||
                      document.getElementById('jadwalLembagaFilter').value ||
                      session.lembaga_id;

    // 1. Jam Pelajaran (kolom) — DEDUPE anti dobel
    let jamQuery = db.from('jam_pelajaran').select('*').order('jam_ke', { ascending: true });
    if (lembagaId) jamQuery = jamQuery.eq('lembaga_id', lembagaId);
    const { data: jamDataRaw } = await jamQuery;

    const seenJam = new Set();
    const jamData = (jamDataRaw || []).filter(j => {
        const key = `${j.jam_ke}|${j.jam_mulai}|${j.jam_selesai}`;
        if (seenJam.has(key)) return false;
        seenJam.add(key);
        return true;
    });

    // 2. Data Guru untuk popup pilih
    let guruQuery = db.from('guru').select('*').order('nama');
    if (lembagaId) guruQuery = guruQuery.eq('lembaga_id', lembagaId);
    const { data: guruData } = await guruQuery;
    gridGuruData = guruData || [];

    // 3. Jadwal yang sudah ada → masukkan ke state
    const { data: jadwalData } = await db.from('jadwal').select('*').eq('rombel_id', rombelId);
    if (jadwalData) {
        jadwalData.forEach(j => {
            const guru = gridGuruData.find(g => g.id === j.guru_id);
            currentSchedule[`${j.hari}|${j.jam_pelajaran_id}`] = {
                guruId: j.guru_id,
                guruNama: guru ? guru.nama : 'Guru'
            };
        });
    }

    const rombelEl = document.getElementById('gridRombel');
    const rombelNama = rombelEl.options[rombelEl.selectedIndex].text;
    document.getElementById('gridTitle').textContent = `Jadwal KBM Rombel ${rombelNama}`;

    const hariList = ['Sabtu', 'Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis'];

    // 4. Header — Jam di atas
    let thead = '<tr><th class="th-hari">Hari</th>';
    jamData.forEach(jam => {
        thead += `
            <th class="th-jam">
                <span class="th-jam-num">Jam ${jam.jam_ke}</span>
                <span class="th-jam-time">${jam.jam_mulai.substring(0,5)}–${jam.jam_selesai.substring(0,5)}</span>
            </th>`;
    });
    thead += '</tr>';
    document.getElementById('matrixThead').innerHTML = thead;

    // 5. Body — Hari ke bawah, sel berupa tombol (klik → popup)
    let tbody = '';
    if (jamData.length === 0) {
        tbody = `<tr><td colspan="2" class="empty-state">Data Jam Pelajaran untuk lembaga ini belum ada. Isi dulu di tab "Jam Pelajaran".</td></tr>`;
    } else {
        hariList.forEach(hari => {
            tbody += `<tr><td class="hari-col">${hari}</td>`;

            jamData.forEach(jam => {
                const entry = currentSchedule[`${hari}|${jam.id}`];
                const filled = !!entry;

                tbody += `
                    <td>
                        <button type="button"
                                class="matrix-cell-btn ${filled ? 'filled' : ''}"
                                data-hari="${hari}" data-jam="${jam.id}"
                                data-jam-ke="${jam.jam_ke}">
                            ${filled ? escapeHtml(entry.guruNama) : '<span class="mcb-empty">+ Pilih Guru</span>'}
                        </button>
                    </td>`;
            });
            tbody += '</tr>';
        });
    }

    document.getElementById('matrixTbody').innerHTML = tbody;
    document.getElementById('jadwalGridContainer').style.display = 'block';

    document.querySelectorAll('.matrix-cell-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            openGuruPicker(btn.dataset.hari, btn.dataset.jam, btn.dataset.jamKe);
        });
    });

    lucide.createIcons();
}

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- POPUP PILIH GURU ---
function openGuruPicker(hari, jamId, jamKe) {
    const current = currentSchedule[`${hari}|${jamId}`];

    let modal = document.getElementById('guruPickerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'guruPickerModal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    const initials = (nama) => {
        const parts = nama.trim().split(/\s+/);
        return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
    };

    modal.innerHTML = `
        <div class="modal-content modal-sm">
            <div class="modal-header">
                <h3><i data-lucide="user" class="modal-title-icon"></i>Pilih Guru — ${hari}, Jam ${jamKe}</h3>
                <button class="modal-close" id="gpClose">&times;</button>
            </div>
            <div class="modal-body">
                <input type="text" id="gpSearch" class="guru-picker-search" placeholder="Cari nama guru..." autocomplete="off">
                <div class="guru-picker-list" id="gpList">
                    ${gridGuruData.map(g => `
                        <button type="button" class="guru-picker-item ${current && current.guruId === g.id ? 'selected' : ''}" data-id="${g.id}" data-nama="${escapeHtml(g.nama)}">
                            <span class="gp-avatar">${initials(g.nama)}</span>
                            <span class="gp-name">${escapeHtml(g.nama)}</span>
                            <i data-lucide="check-circle-2" class="gp-check"></i>
                        </button>
                    `).join('')}
                    ${gridGuruData.length === 0 ? '<div class="empty-state">Belum ada guru di lembaga ini</div>' : ''}
                </div>
                <button type="button" class="btn btn-secondary gp-clear" id="gpClear">
                    <i data-lucide="eraser"></i> Kosongkan Slot Ini
                </button>
            </div>
        </div>
    `;
    modal.classList.add('show');
    lucide.createIcons();

    const cellBtn = document.querySelector(`.matrix-cell-btn[data-hari="${hari}"][data-jam="${jamId}"]`);

    const close = () => modal.classList.remove('show');
    modal.querySelector('#gpClose').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };

    modal.querySelectorAll('.guru-picker-item').forEach(item => {
        item.addEventListener('click', () => {
            const guruId = item.dataset.id;
            const guruNama = item.dataset.nama;

            currentSchedule[`${hari}|${jamId}`] = { guruId, guruNama };

            cellBtn.textContent = guruNama;
            cellBtn.classList.add('filled');
            close();
        });
    });

    modal.querySelector('#gpClear').addEventListener('click', () => {
        delete currentSchedule[`${hari}|${jamId}`];
        cellBtn.innerHTML = '<span class="mcb-empty">+ Pilih Guru</span>';
        cellBtn.classList.remove('filled');
        close();
    });

    const searchInput = modal.querySelector('#gpSearch');
    searchInput.addEventListener('input', function() {
        const q = this.value.toLowerCase();
        modal.querySelectorAll('.guru-picker-item').forEach(item => {
            const nama = item.dataset.nama.toLowerCase();
            item.style.display = nama.includes(q) ? '' : 'none';
        });
    });

    setTimeout(() => searchInput.focus(), 120);
}

async function simpanJadwalMatrix() {
    const rombelId = currentRombelId || document.getElementById('gridRombel').value;
    if (!rombelId) { showToast('Pilih rombel dulu', 'warning'); return; }

    const btnSimpan = document.getElementById('btnSimpanMatrix');
    btnSimpan.disabled = true;
    btnSimpan.innerHTML = 'Menyimpan...';

    const dataToSave = [];
    Object.entries(currentSchedule).forEach(([key, val]) => {
        const [hari, jamId] = key.split('|');
        dataToSave.push({
            rombel_id: rombelId,
            hari: hari,
            jam_pelajaran_id: jamId,
            guru_id: val.guruId,
            mata_pelajaran: ''
        });
    });

    try {
        await db.from('jadwal').delete().eq('rombel_id', rombelId);
        if (dataToSave.length > 0) {
            const { error } = await db.from('jadwal').insert(dataToSave);
            if (error) throw error;
        }
        showToast('Jadwal mingguan berhasil disimpan!', 'success');
    } catch (error) {
        showToast('Gagal menyimpan jadwal: ' + error.message, 'error');
    }

    btnSimpan.disabled = false;
    btnSimpan.innerHTML = '<i data-lucide="save"></i> Simpan Jadwal Mingguan';
    lucide.createIcons();
}

/* ========================
   ROMBEL FORM
======================== */
async function setupRombelForm(session) {
    document.getElementById('rombelLembaga').addEventListener('change', async function() {
        await loadKelasForRombelDropdown(session);
    });

    document.getElementById('rombelForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        let lembaga_id = session.lembaga_id;
        if (session.role === 'superadmin') {
            lembaga_id = document.getElementById('rombelLembaga').value;
            if (!lembaga_id) { showToast('Pilih lembaga', 'warning'); return; }
        }
        const kelas_id = document.getElementById('rombelKelas').value;
        const nama = document.getElementById('rombelNama').value;
        if (!kelas_id) { showToast('Pilih kelas/tingkat', 'warning'); return; }

        const { error } = await db.from('rombel').insert({ nama, kelas_id, lembaga_id });
        if (error) { showToast('Gagal: ' + error.message, 'error'); }
        else { showToast('Rombel berhasil ditambahkan', 'success'); document.getElementById('rombelForm').reset(); await loadAllData(session); }
    });

    await loadKelasForRombelDropdown(session);
}

async function loadKelasForRombelDropdown(session) {
    const lembagaId = globalLembagaFilter ||
                      document.getElementById('rombelLembaga').value ||
                      session.lembaga_id;

    const filtered = lembagaId ? allKelas.filter(k => k.lembaga_id === lembagaId) : allKelas;

    const select = document.getElementById('rombelKelas');
    select.innerHTML = '<option value="">-- Pilih Kelas --</option>';
    filtered.forEach(k => {
        select.innerHTML += `<option value="${k.id}">${k.nama}${k.tingkat ? ` (Tingkat ${k.tingkat})` : ''}</option>`;
    });
}

/* ========================
   MODAL GENERIK (Edit & Confirm)
======================== */
function showFormModal({ title, icon = 'pencil', fields, saveLabel = 'Simpan', onSave }) {
    let modal = document.getElementById('formModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'formModal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    const fieldsHtml = fields.map((f, i) => `
        <div class="form-group">
            <label>${f.label}</label>
            ${f.type === 'select'
                ? `<select id="fm-field-${i}">${f.options.map(o => `<option value="${o.value}" ${o.value == f.value ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`
                : `<input id="fm-field-${i}" type="${f.type || 'text'}" value="${f.value ?? ''}" ${f.attrs || ''}>`}
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="modal-content modal-sm">
            <div class="modal-header">
                <h3><i data-lucide="${icon}" class="modal-title-icon"></i>${title}</h3>
                <button class="modal-close" id="fmClose">&times;</button>
            </div>
            <div class="modal-body">
                <form id="fmForm">
                    ${fieldsHtml}
                    <div class="modal-actions">
                        <button type="button" class="btn btn-secondary" id="fmCancel">Batal</button>
                        <button type="submit" class="btn btn-primary"><i data-lucide="save"></i> ${saveLabel}</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    modal.classList.add('show');
    lucide.createIcons();

    const close = () => modal.classList.remove('show');
    modal.querySelector('#fmClose').onclick = close;
    modal.querySelector('#fmCancel').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };

    modal.querySelector('#fmForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const values = fields.map((_, i) => modal.querySelector(`#fm-field-${i}`).value);
        await onSave(values, close);
    });

    setTimeout(() => modal.querySelector('input, select')?.focus(), 120);
}

function showConfirmModal({ title = 'Konfirmasi', message, confirmLabel = 'Ya, Hapus', onConfirm }) {
    let modal = document.getElementById('confirmModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'confirmModal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content modal-sm">
            <div class="modal-body confirm-body">
                <div class="confirm-icon"><i data-lucide="alert-triangle"></i></div>
                <h3 class="confirm-title">${title}</h3>
                <p class="confirm-message">${message}</p>
                <div class="modal-actions modal-actions-center">
                    <button type="button" class="btn btn-secondary" id="cmCancel">Batal</button>
                    <button type="button" class="btn btn-danger" id="cmOk"><i data-lucide="trash-2"></i> ${confirmLabel}</button>
                </div>
            </div>
        </div>
    `;
    modal.classList.add('show');
    lucide.createIcons();

    const close = () => modal.classList.remove('show');
    modal.querySelector('#cmCancel').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };
    modal.querySelector('#cmOk').onclick = () => onConfirm(close);
}

async function deleteData(table, id, name) {
    showConfirmModal({
        title: 'Hapus Data',
        message: `Yakin ingin menghapus <strong>${name}</strong>? Tindakan ini tidak bisa dibatalkan.`,
        onConfirm: async (close) => {
            const session = Auth.getSession();
            const { error } = await db.from(table).delete().eq('id', id);
            if (error) { showToast('Gagal menghapus: ' + error.message, 'error'); return; }
            showToast(`${name} berhasil dihapus`, 'success');
            close();
            await loadAllData(session);
        }
    });
}

/* ========================
   EDIT (modal form)
======================== */
async function editGuru(id, oldName) {
    showFormModal({
        title: 'Edit Nama Guru',
        icon: 'pencil',
        fields: [{ label: 'Nama Guru', type: 'text', value: oldName, attrs: 'required' }],
        onSave: async ([nama], close) => {
            if (!nama.trim() || nama.trim() === oldName) return;
            const { error } = await db.from('guru').update({ nama: nama.trim() }).eq('id', id);
            if (error) { showToast('Gagal mengubah: ' + error.message, 'error'); return; }
            showToast('Nama guru berhasil diubah!', 'success');
            close();
            await loadAllData(Auth.getSession());
        }
    });
}

async function editKelas(id, oldNama) {
    showFormModal({
        title: 'Edit Kelas',
        icon: 'door-open',
        fields: [{ label: 'Nama Kelas', type: 'text', value: oldNama, attrs: 'required' }],
        onSave: async ([nama], close) => {
            if (!nama.trim() || nama.trim() === oldNama) return;
            const { error } = await db.from('kelas').update({ nama: nama.trim() }).eq('id', id);
            if (error) { showToast('Gagal mengubah: ' + error.message, 'error'); return; }
            showToast('Nama kelas berhasil diubah!', 'success');
            close();
            await loadAllData(Auth.getSession());
        }
    });
}

async function editJam(id, oldJamKe, oldMulai, oldSelesai) {
    showFormModal({
        title: 'Edit Jam Pelajaran',
        icon: 'clock',
        fields: [
            { label: 'Jam Ke-', type: 'number', value: oldJamKe, attrs: 'min="1" required' },
            { label: 'Jam Mulai', type: 'time', value: oldMulai, attrs: 'required' },
            { label: 'Jam Selesai', type: 'time', value: oldSelesai, attrs: 'required' }
        ],
        onSave: async ([jamKe, mulai, selesai], close) => {
            const { error } = await db.from('jam_pelajaran').update({
                jam_ke: parseInt(jamKe), jam_mulai: mulai, jam_selesai: selesai
            }).eq('id', id);
            if (error) { showToast('Gagal mengubah: ' + error.message, 'error'); return; }
            showToast('Jam pelajaran berhasil diubah!', 'success');
            close();
            await loadAllData(Auth.getSession());
        }
    });
}

async function editRombel(id, oldNama) {
    showFormModal({
        title: 'Edit Rombel',
        icon: 'users',
        fields: [{ label: 'Nama Rombel', type: 'text', value: oldNama, attrs: 'required' }],
        onSave: async ([nama], close) => {
            if (!nama.trim() || nama.trim() === oldNama) return;
            const { error } = await db.from('rombel').update({ nama: nama.trim() }).eq('id', id);
            if (error) { showToast('Gagal mengubah: ' + error.message, 'error'); return; }
            showToast('Nama rombel berhasil diubah!', 'success');
            close();
            await loadAllData(Auth.getSession());
        }
    });
}

/* ========================
   DETAIL GURU MODAL
======================== */
function formatTanggalID(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

async function showGuruDetail(guruId, guruNama, lembagaKode) {
    let modal = document.getElementById('guruModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'guruModal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Detail Guru: ${guruNama}</h3>
                <button class="modal-close" id="gmClose">&times;</button>
            </div>
            <div class="modal-body" style="text-align: center; padding: 40px;">
                Memuat data...
            </div>
        </div>
    `;
    modal.classList.add('show');
    modal.querySelector('#gmClose').onclick = () => modal.classList.remove('show');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('show'); };

    const { data: jadwalData } = await db.from('jadwal')
        .select('hari, rombel(nama), jam_pelajaran(jam_ke)')
        .eq('guru_id', guruId);

    const { data: absenData } = await db.from('absen')
        .select('status, tanggal')
        .eq('guru_id', guruId)
        .order('tanggal', { ascending: false });

    const hariOrder = ['Sabtu', 'Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis'];
    let jadwalMap = {};
    let totalJamMingguan = 0;

    if (jadwalData) {
        jadwalData.forEach(j => {
            if (!jadwalMap[j.hari]) jadwalMap[j.hari] = [];
            jadwalMap[j.hari].push(`Jam ${j.jam_pelajaran.jam_ke} (${j.rombel ? j.rombel.nama : '-'})`);
            totalJamMingguan++;
        });
    }

    let jadwalHtml = '<ul class="jadwal-detail-list">';
    hariOrder.forEach(hari => {
        if (jadwalMap[hari]) {
            jadwalHtml += `<li><strong>${hari}</strong><span class="jd-count">${jadwalMap[hari].length} jam</span><small>${jadwalMap[hari].join(' · ')}</small></li>`;
        } else {
            jadwalHtml += `<li class="jd-empty"><strong>${hari}</strong><span>Tidak mengajar</span></li>`;
        }
    });
    jadwalHtml += `</ul><div class="jadwal-total">Total: <strong>${totalJamMingguan} Jam / Minggu</strong></div>`;

    let stats = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
    let riwayatSakit = [], riwayatIzin = [], riwayatAlpha = [];

    if (absenData) {
        absenData.forEach(a => {
            if (stats[a.status] !== undefined) stats[a.status]++;
            if (a.status === 'sakit') riwayatSakit.push(formatTanggalID(a.tanggal));
            else if (a.status === 'izin') riwayatIzin.push(formatTanggalID(a.tanggal));
            else if (a.status === 'alpha') riwayatAlpha.push(formatTanggalID(a.tanggal));
        });
    }

    const buildRiwayat = (title, icon, dates) => dates.length === 0 ? '' : `
        <div class="riwayat-box">
            <h5><i data-lucide="${icon}"></i> ${title} (${dates.length})</h5>
            ${dates.map(d => `<span class="riwayat-date">${d}</span>`).join('')}
        </div>`;

    let absenHtml = `
        <div class="detail-stats">
            <div class="detail-stat ds-hadir"><span class="ds-num">${stats.hadir}</span><span class="ds-label">Hadir</span></div>
            <div class="detail-stat ds-sakit"><span class="ds-num">${stats.sakit}</span><span class="ds-label">Sakit</span></div>
            <div class="detail-stat ds-izin"><span class="ds-num">${stats.izin}</span><span class="ds-label">Izin</span></div>
            <div class="detail-stat ds-alpha"><span class="ds-num">${stats.alpha}</span><span class="ds-label">Alpha</span></div>
        </div>
        ${buildRiwayat('Riwayat Sakit', 'thermometer', riwayatSakit)}
        ${buildRiwayat('Riwayat Izin', 'mail', riwayatIzin)}
        ${buildRiwayat('Riwayat Alpha', 'x-circle', riwayatAlpha)}
    `;

    if (!absenData || absenData.length === 0) {
        absenHtml += `<p class="no-data-note">Belum ada riwayat absensi</p>`;
    }

    modal.querySelector('.modal-body').innerHTML = `
        <p class="detail-lembaga">Lembaga: <strong>${lembagaKode || '-'}</strong></p>
        <h4>Jadwal Mengajar Mingguan</h4>
        ${jadwalHtml}
        <h4>Riwayat Kehadiran (Keseluruhan)</h4>
        ${absenHtml}
    `;
    lucide.createIcons();
}