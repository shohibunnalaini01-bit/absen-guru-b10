// js/jadwal.js
document.addEventListener('DOMContentLoaded', async function() {
    const session = Auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    initUI(session);
    handleTabs();
    handleForms(session);
    handleLogout();

    await loadLembagaDropdown();
    await loadGuru(session);
    await loadKelas(session);
    await loadJam(session);

    // Setup Grid Jadwal Mingguan
    setupJadwalGrid(session);

    // Sembunyikan tombol CRUD jika role hanya Pengabsen
    if (session.role.startsWith('pengabsen_')) {
        document.querySelectorAll('.crud-section').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.action-col').forEach(el => el.style.display = 'none');
    }
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

    if (session.role === 'superadmin') {
        document.querySelector('.nav-admin-only').style.display = 'flex';
        document.querySelectorAll('.lembaga-select-wrapper').forEach(el => el.style.display = 'block');
    } else {
        if (session.lembaga_id) {
            ['guruLembaga', 'kelasLembaga', 'jamLembaga', 'jadwalLembagaFilter'].forEach(id => {
                const s = document.getElementById(id);
                if(s) s.value = session.lembaga_id;
            });
        }
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
    const dropdownIds = ['guruLembaga', 'kelasLembaga', 'jamLembaga', 'jadwalLembagaFilter'];
    dropdownIds.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = '<option value="">Pilih Lembaga</option>';
            data.forEach(l => { select.innerHTML += `<option value="${l.id}">${l.kode} - ${l.nama}</option>`; });
        }
    });
}

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
        else { showToast('Guru berhasil ditambahkan', 'success'); document.getElementById('guruForm').reset(); loadGuru(session); }
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
        const { error } = await db.from('kelas').insert({ nama, lembaga_id, tingkat: null, huruf: null });
        if (error) { showToast('Gagal: ' + error.message, 'error'); }
        else { showToast('Kelas berhasil ditambahkan', 'success'); document.getElementById('kelasForm').reset(); loadKelas(session); }
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
        else { showToast('Jam pelajaran berhasil ditambahkan', 'success'); document.getElementById('jamForm').reset(); loadJam(session); }
    });
}

// ========================
// LOAD DATA FUNGSI
// ========================
async function loadGuru(session) {
    let query = db.from('guru').select('*, lembaga(kode)').order('nama', { ascending: true });
    if (session.lembaga_id) query = query.eq('lembaga_id', session.lembaga_id);
    const { data, error } = await query;

    const tbody = document.getElementById('guruTable');
    if (error || !data.length) { tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Belum ada data guru</td></tr>`; return; }

    document.getElementById('guruCount').textContent = data.length;
    tbody.innerHTML = data.map((g, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${g.nama}</td>
            <td>${g.lembaga ? g.lembaga.kode : '-'}</td>
            <td class="action-col"><button class="btn btn-danger btn-sm" onclick="deleteData('guru', '${g.id}', '${g.nama}')"><i data-lucide="trash-2"></i></button></td>
        </tr>
    `).join('');
    lucide.createIcons();
}

async function loadKelas(session) {
    let query = db.from('kelas').select('*, lembaga(kode)').order('nama', { ascending: true });
    if (session.lembaga_id) query = query.eq('lembaga_id', session.lembaga_id);
    const { data, error } = await query;

    const tbody = document.getElementById('kelasTable');
    if (error || !data.length) { tbody.innerHTML = `<tr><td colspan="4" class="empty-state">Belum ada data kelas</td></tr>`; return; }

    // Isi dropdown kelas di grid jadwal
    const gridKelas = document.getElementById('gridKelas');
    if(gridKelas) {
        gridKelas.innerHTML = '<option value="">-- Pilih Kelas Terlebih Dahulu --</option>' + data.map(k => `<option value="${k.id}">${k.nama}</option>`).join('');
    }

    tbody.innerHTML = data.map((k, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${k.nama}</td>
            <td>${k.lembaga ? k.lembaga.kode : '-'}</td>
            <td class="action-col"><button class="btn btn-danger btn-sm" onclick="deleteData('kelas', '${k.id}', '${k.nama}')"><i data-lucide="trash-2"></i></button></td>
        </tr>
    `).join('');
    lucide.createIcons();
}

async function loadJam(session) {
    let query = db.from('jam_pelajaran').select('*, lembaga(kode)').order('jam_ke', { ascending: true });
    if (session.lembaga_id) query = query.eq('lembaga_id', session.lembaga_id);
    const { data, error } = await query;

    const tbody = document.getElementById('jamTable');
    if (error || !data.length) { tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Belum ada data jam pelajaran</td></tr>`; return; }

    tbody.innerHTML = data.map(j => `
        <tr>
            <td>${j.jam_ke}</td>
            <td>${j.jam_mulai.substring(0,5)}</td>
            <td>${j.jam_selesai.substring(0,5)}</td>
            <td>${j.lembaga ? j.lembaga.kode : '-'}</td>
            <td class="action-col"><button class="btn btn-danger btn-sm" onclick="deleteData('jam_pelajaran', '${j.id}', 'Jam ${j.jam_ke}')"><i data-lucide="trash-2"></i></button></td>
        </tr>
    `).join('');
    lucide.createIcons();
}

// ========================
// LOGIKA MATRIX JADWAL
// ========================
function setupJadwalGrid(session) {
    const jadwalLembagaFilter = document.getElementById('jadwalLembagaFilter');
    
    // Set otomatis untuk Admin Lembaga
    if (session.lembaga_id && session.role !== 'superadmin') {
        jadwalLembagaFilter.value = session.lembaga_id;
    }

    jadwalLembagaFilter.addEventListener('change', async function() {
        await loadKelasForGrid(session);
        document.getElementById('jadwalGridContainer').style.display = 'none';
    });

    document.getElementById('gridKelas').addEventListener('change', async function() {
        const kelasId = this.value;
        if (!kelasId) { 
            document.getElementById('jadwalGridContainer').style.display = 'none'; 
            return; 
        }
        await loadJadwalGrid(kelasId, session);
    });

    document.getElementById('btnSimpanMatrix').addEventListener('click', simpanJadwalMatrix);
}

async function loadKelasForGrid(session) {
    const lembagaId = document.getElementById('jadwalLembagaFilter').value || session.lembaga_id;
    let query = db.from('kelas').select('*').order('nama');
    if (lembagaId) query = query.eq('lembaga_id', lembagaId);
    const { data, error } = await query;

    const select = document.getElementById('gridKelas');
    select.innerHTML = '<option value="">-- Pilih Kelas Terlebih Dahulu --</option>';
    if (data) {
        data.forEach(k => select.innerHTML += `<option value="${k.id}">${k.nama}</option>`);
    }
    document.getElementById('jadwalGridContainer').style.display = 'none';
}

async function loadJadwalGrid(kelasId, session) {
    const lembagaId = document.getElementById('jadwalLembagaFilter').value || session.lembaga_id;

    // 1. Get Jam Pelajaran (Kolom)
    let jamQuery = db.from('jam_pelajaran').select('*').order('jam_ke', { ascending: true });
    if (lembagaId) jamQuery = jamQuery.eq('lembaga_id', lembagaId);
    const { data: jamData } = await jamQuery;

    // 2. Get Data Guru untuk Dropdown
    let guruQuery = db.from('guru').select('*').order('nama');
    if (lembagaId) guruQuery = guruQuery.eq('lembaga_id', lembagaId);
    const { data: guruData } = await guruQuery;

    // 3. Get Jadwal yang sudah ada untuk kelas ini
    const { data: jadwalData } = await db.from('jadwal').select('*').eq('kelas_id', kelasId);

    // Dapatkan Nama Kelas
    const kelasEl = document.getElementById('gridKelas');
    const kelasNama = kelasEl.options[kelasEl.selectedIndex].text;
    document.getElementById('gridTitle').textContent = `Setting Jadwal KBM Kelas ${kelasNama}`;

    const hariList = ['Sabtu', 'Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis'];

    // 4. Render Header
    let thead = '<tr><th>Jam Ke</th>';
    hariList.forEach(h => thead += `<th>${h}</th>`);
    thead += '</tr>';
    document.getElementById('matrixThead').innerHTML = thead;

    // 5. Render Body
    let tbody = '';
    if (!jamData || jamData.length === 0) {
        tbody = '<tr><td colspan="7" class="empty-state">Data Jam Pelajaran untuk lembaga ini belum ditambahkan. Silakan isi dulu di tab "Jam Pelajaran".</td></tr>';
    } else {
        jamData.forEach(jam => {
            tbody += `<tr><td>${jam.jam_ke}<br><small style="font-weight:400; color:white; opacity:0.8">${jam.jam_mulai.substring(0,5)}-${jam.jam_selesai.substring(0,5)}</small></td>`;
            
            hariList.forEach(hari => {
                const existing = jadwalData?.find(j => j.hari === hari && j.jam_pelajaran_id === jam.id);
                
                let guruOptions = '<option value="">-- Kosong --</option>';
                guruData.forEach(g => {
                    const sel = existing && existing.guru_id === g.id ? 'selected' : '';
                    guruOptions += `<option value="${g.id}" ${sel}>${g.nama}</option>`;
                });

                const mapelVal = existing ? existing.mata_pelajaran : '';

                tbody += `
                    <td>
                        <div class="matrix-cell">
                            <select class="matrix-guru" data-hari="${hari}" data-jam="${jam.id}">${guruOptions}</select>
                            <input type="text" class="matrix-mapel" data-hari="${hari}" data-jam="${jam.id}" value="${mapelVal}" placeholder="Mapel">
                        </div>
                    </td>
                `;
            });
            tbody += '</tr>';
        });
    }
    
    document.getElementById('matrixTbody').innerHTML = tbody;
    document.getElementById('jadwalGridContainer').style.display = 'block';
    lucide.createIcons();
}

async function simpanJadwalMatrix() {
    const kelasId = document.getElementById('gridKelas').value;
    if (!kelasId) { showToast('Pilih kelas dulu', 'warning'); return; }

    const btnSimpan = document.getElementById('btnSimpanMatrix');
    const session = Auth.getSession();
    btnSimpan.disabled = true;
    btnSimpan.innerHTML = 'Menyimpan...';

    let dataToSave = [];
    const guruSelects = document.querySelectorAll('.matrix-guru');
    
    guruSelects.forEach(select => {
        const guruId = select.value;
        const hari = select.getAttribute('data-hari');
        const jamId = select.getAttribute('data-jam');
        
        const mapelInput = document.querySelector(`.matrix-mapel[data-hari="${hari}"][data-jam="${jamId}"]`);
        const mapel = mapelInput ? mapelInput.value : '';

        if (guruId) {
            dataToSave.push({
                kelas_id: kelasId,
                hari: hari,
                jam_pelajaran_id: jamId,
                guru_id: guruId,
                mata_pelajaran: mapel
            });
        }
    });

    try {
        await db.from('jadwal').delete().eq('kelas_id', kelasId);
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

// Global Delete Function
async function deleteData(table, id, name) {
    const session = Auth.getSession();
    showToast(`Menghapus ${name}...`, 'warning', 1500);
    const { error } = await db.from(table).delete().eq('id', id);
    
    if (error) { showToast('Gagal menghapus: ' + error.message, 'error'); }
    else {
        showToast(`${name} berhasil dihapus`, 'success');
        if (table === 'guru') loadGuru(session);
        if (table === 'kelas') loadKelas(session);
        if (table === 'jam_pelajaran') loadJam(session);
    }
}