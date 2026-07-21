// js/jadwal.js
document.addEventListener('DOMContentLoaded', async function() {
    const session = Auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    // GUARD: Pengabsen tidak boleh akses Jadwal
    if (session.role.startsWith('pengabsen_')) {
        window.location.href = 'absen.html'; 
        return;
    }

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

    // Setup Form & Load Rombel
    await loadLembagaDropdownRombel();
    setupRombelForm(session);
    await loadRombel(session);

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
            <td class="action-col" style="display: flex; gap: 5px; justify-content: center; border: none;">
                <button class="btn btn-sm" style="background: #0891b2; color: white;" onclick="showGuruDetail('${g.id}', '${g.nama.replace(/'/g, "\\'")}', '${g.lembaga ? g.lembaga.kode : ''}')" title="Detail Guru"><i data-lucide="eye"></i></button>
                <button class="btn btn-sm" style="background: #e2e8f0; color: #1e293b;" onclick="editGuru('${g.id}', '${g.nama.replace(/'/g, "\\'")}')" title="Edit Nama"><i data-lucide="edit-2"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deleteData('guru', '${g.id}', '${g.nama.replace(/'/g, "\\'")}')" title="Hapus Guru"><i data-lucide="trash-2"></i></button>
            </td>
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
            <td class="action-col" style="display: flex; gap: 5px; justify-content: center;">
                <button class="btn btn-sm" style="background: #e2e8f0; color: #1e293b;" onclick="editKelas('${k.id}', '${k.nama.replace(/'/g, "\\'")}')"><i data-lucide="edit-2"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deleteData('kelas', '${k.id}', '${k.nama.replace(/'/g, "\\'")}')"><i data-lucide="trash-2"></i></button>
            </td>
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
            <td class="action-col" style="display: flex; gap: 5px; justify-content: center;">
                <button class="btn btn-sm" style="background: #e2e8f0; color: #1e293b;" onclick="editJam('${j.id}', ${j.jam_ke}, '${j.jam_mulai.substring(0,5)}', '${j.jam_selesai.substring(0,5)}')"><i data-lucide="edit-2"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deleteData('jam_pelajaran', '${j.id}', 'Jam ${j.jam_ke}')"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

// ========================
// LOGIKA MATRIX JADWAL
// ========================
function setupJadwalGrid(session) {
    const jadwalLembagaFilter = document.getElementById('jadwalLembagaFilter');
    
    if (session.lembaga_id && session.role !== 'superadmin') {
        jadwalLembagaFilter.value = session.lembaga_id;
    }

    jadwalLembagaFilter.addEventListener('change', async function() {
        await loadRombelForGrid(session);
        document.getElementById('jadwalGridContainer').style.display = 'none';
    });

    // UBAH INI: Dari gridKelas jadi gridRombel
    document.getElementById('gridRombel').addEventListener('change', async function() {
        const rombelId = this.value;
        if (!rombelId) { document.getElementById('jadwalGridContainer').style.display = 'none'; return; }
        await loadJadwalGrid(rombelId, session);
    });

    document.getElementById('btnSimpanMatrix').addEventListener('click', simpanJadwalMatrix);
}

async function loadRombelForGrid(session) {
    const lembagaId = document.getElementById('jadwalLembagaFilter').value || session.lembaga_id;
    let query = db.from('rombel').select('*, kelas(nama)').order('nama');
    if (lembagaId) query = query.eq('lembaga_id', lembagaId);
    const { data, error } = await query;

    const select = document.getElementById('gridRombel');
    select.innerHTML = '<option value="">-- Pilih Rombel Terlebih Dahulu --</option>';
    if (data) {
        data.forEach(r => select.innerHTML += `<option value="${r.id}">${r.nama} (${r.kelas?.nama || ''})</option>`);
    }
    document.getElementById('jadwalGridContainer').style.display = 'none';
}

async function loadJadwalGrid(rombelId, session) {
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
        const { data: jadwalData } = await db.from('jadwal').select('*').eq('rombel_id', rombelId);

    // Dapatkan Nama Kelas
    const rombelEl = document.getElementById('gridRombel');
    const rombelNama = rombelEl.options[rombelEl.selectedIndex].text;
    document.getElementById('gridTitle').textContent = `Setting Jadwal KBM Rombel ${rombelNama}`;

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
    const rombelId = document.getElementById('gridRombel').value;
    if (!rombelId) { showToast('Pilih rombel dulu', 'warning'); return; }

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
                kelas_id: rombelId,
                hari: hari,
                jam_pelajaran_id: jamId,
                guru_id: guruId,
                mata_pelajaran: mapel
            });
        }
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

// ========================
// LOGIC ROMBEL
// ========================
async function loadLembagaDropdownRombel() {
    const { data } = await db.from('lembaga').select('*').order('kode');
    if (data) {
        const select = document.getElementById('rombelLembaga');
        select.innerHTML = '<option value="">Pilih Lembaga</option>';
        data.forEach(l => select.innerHTML += `<option value="${l.id}">${l.kode} - ${l.nama}</option>`);
    }
}

function setupRombelForm(session) {
    // Saat filter lembaga dirubah, load kelas & rombel
    document.getElementById('rombelLembaga').addEventListener('change', async function() {
        await loadKelasForRombelDropdown(session);
        await loadRombel(session);
    });

    // Submit Form Rombel
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
        else { showToast('Rombel berhasil ditambahkan', 'success'); document.getElementById('rombelForm').reset(); loadRombel(session); }
    });
}

async function loadKelasForRombelDropdown(session) {
    const lembagaId = document.getElementById('rombelLembaga').value || session.lembaga_id;
    let query = db.from('kelas').select('*').order('tingkat');
    if (lembagaId) query = query.eq('lembaga_id', lembagaId);
    const { data } = await query;
    
    const select = document.getElementById('rombelKelas');
    select.innerHTML = '<option value="">-- Pilih Kelas --</option>';
    if (data) {
        data.forEach(k => select.innerHTML += `<option value="${k.id}">${k.nama} (Tingkat ${k.tingkat})</option>`);
    }
}

async function loadRombel(session) {
    const lembagaId = document.getElementById('rombelLembaga')?.value || session.lembaga_id;
    let query = db.from('rombel').select('*, kelas(nama, tingkat), lembaga(kode)').order('nama');
    if (lembagaId) query = query.eq('lembaga_id', lembagaId);
    const { data, error } = await query;

    const tbody = document.getElementById('rombelTable');
    if (error || !data.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Belum ada data rombel</td></tr>'; return; }

    // Update dropdown Rombel di Tab 4 (Grid Jadwal)
    const gridRombel = document.getElementById('gridRombel');
    if(gridRombel) {
        gridRombel.innerHTML = '<option value="">-- Pilih Rombel --</option>';
        data.forEach(r => gridRombel.innerHTML += `<option value="${r.id}">${r.nama}</option>`);
    }

    tbody.innerHTML = data.map((r, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${r.nama}</td>
            <td>${r.kelas ? r.kelas.nama : '-'}</td>
            <td>${r.lembaga ? r.lembaga.kode : '-'}</td>
            <td class="action-col" style="display: flex; gap: 5px; justify-content: center;">
                <button class="btn btn-sm" style="background: #e2e8f0; color: #1e293b;" onclick="editRombel('${r.id}', '${r.nama.replace(/'/g, "\\'")}')"><i data-lucide="edit-2"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deleteData('rombel', '${r.id}', '${r.nama.replace(/'/g, "\\'")}')"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>
    `).join('');
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

// Fungsi Edit Guru
async function editGuru(id, oldName) {
    const newName = prompt('Ubah nama guru:', oldName);
    
    // Jika user klik batal atau tidak mengetik apa-apa, batalkan
    if (!newName || newName.trim() === '' || newName.trim() === oldName) return;

    const { error } = await db.from('guru').update({ nama: newName.trim() }).eq('id', id);
    
    if (error) {
        showToast('Gagal mengubah nama: ' + error.message, 'error');
    } else {
        showToast('Nama guru berhasil diubah!', 'success');
        const session = Auth.getSession();
        loadGuru(session); // Refresh tabel
    }
}

// ========================
// DETAIL GURU MODAL
// ========================

// Fungsi format tanggal ke Bahasa Indonesia
function formatTanggalID(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

async function showGuruDetail(guruId, guruNama, lembagaKode) {
    // Buat Modal HTML jika belum ada
    let modal = document.getElementById('guruModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'guruModal';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    // Tampilkan loading
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Detail Guru: ${guruNama}</h3>
                <button class="modal-close" onclick="closeGuruModal()">&times;</button>
            </div>
            <div class="modal-body" style="text-align: center; padding: 40px;">
                Memuat data...
            </div>
        </div>
    `;
    modal.classList.add('show');

    // Ambil data Jadwal Mengajar
    const { data: jadwalData } = await db.from('jadwal')
        .select('hari, rombel(nama), jam_pelajaran(jam_ke)')
        .eq('guru_id', guruId);

    // Ambil data Riwayat Absen
    const { data: absenData } = await db.from('absen')
        .select('status, tanggal')
        .eq('guru_id', guruId)
        .order('tanggal', { ascending: false });

    // Proses Data Jadwal
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

    let jadwalHtml = '<ul>';
    hariOrder.forEach(hari => {
        if (jadwalMap[hari]) {
            jadwalHtml += `<li><strong>${hari}:</strong> ${jadwalMap[hari].length} jam <br><small style="color:#64748b; margin-left: 15px;">↳ ${jadwalMap[hari].join(', ')}</small></li>`;
        } else {
            jadwalHtml += `<li><strong>${hari}:</strong> <span style="color:#cbd5e1;">- Tidak mengajar</span></li>`;
        }
    });
    jadwalHtml += `</ul><p style="font-weight:700; margin-top:10px; color:var(--primary);">Total: ${totalJamMingguan} Jam / Minggu</p>`;

    // Proses Data Absen
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

    let absenHtml = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div class="badge badge-hadir" style="padding: 8px; font-size: 0.9rem;">Hadir: ${stats.hadir}</div>
            <div class="badge badge-sakit" style="padding: 8px; font-size: 0.9rem;">Sakit: ${stats.sakit}</div>
            <div class="badge badge-izin" style="padding: 8px; font-size: 0.9rem;">Izin: ${stats.izin}</div>
            <div class="badge badge-alpha" style="padding: 8px; font-size: 0.9rem;">Alpha: ${stats.alpha}</div>
        </div>
    `;

    if (riwayatSakit.length > 0) absenHtml += `<p><strong>🤒 Riwayat Sakit:</strong><br><small>${riwayatSakit.join('<br>')}</small></p>`;
    if (riwayatIzin.length > 0) absenHtml += `<p style="margin-top:10px;"><strong>📩 Riwayat Izin:</strong><br><small>${riwayatIzin.join('<br>')}</small></p>`;
    if (riwayatAlpha.length > 0) absenHtml += `<p style="margin-top:10px;"><strong>❌ Riwayat Alpha:</strong><br><small>${riwayatAlpha.join('<br>')}</small></p>`;
    
    if (absenData && absenData.length === 0) {
        absenHtml += `<p style="color:#64748b; font-style:italic;">Belum ada riwayat absensi</p>`;
    }

    // Render ke Modal
    modal.querySelector('.modal-body').innerHTML = `
        <p style="margin-top:0; color: var(--text-secondary);">Lembaga: <strong>${lembagaKode}</strong></p>
        <h4>📅 Jadwal Mengajar Mingguan</h4>
        ${jadwalHtml}
        <h4>📊 Riwayat Kehadiran (Keseluruhan)</h4>
        ${absenHtml}
    `;
}

function closeGuruModal() {
    const modal = document.getElementById('guruModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// ========================
// FUNGSI EDIT MASTER DATA
// ========================

async function editKelas(id, oldNama) {
    const newNama = prompt('Ubah nama kelas:', oldNama);
    if (!newNama || newNama.trim() === '' || newNama.trim() === oldNama) return;

    const { error } = await db.from('kelas').update({ nama: newNama.trim() }).eq('id', id);
    if (error) { showToast('Gagal mengubah: ' + error.message, 'error'); }
    else { showToast('Nama kelas berhasil diubah!', 'success'); loadKelas(Auth.getSession()); }
}

async function editJam(id, oldJamKe, oldMulai, oldSelesai) {
    const newJamKe = prompt('Ubah Jam Ke-', oldJamKe);
    if (!newJamKe) return;
    
    const newMulai = prompt('Ubah Jam Mulai (format HH:MM):', oldMulai);
    if (!newMulai) return;
    
    const newSelesai = prompt('Ubah Jam Selesai (format HH:MM):', oldSelesai);
    if (!newSelesai) return;

    const { error } = await db.from('jam_pelajaran').update({ 
        jam_ke: parseInt(newJamKe), 
        jam_mulai: newMulai, 
        jam_selesai: newSelesai 
    }).eq('id', id);

    if (error) { showToast('Gagal mengubah: ' + error.message, 'error'); }
    else { showToast('Jam pelajaran berhasil diubah!', 'success'); loadJam(Auth.getSession()); }
}

async function editRombel(id, oldNama) {
    const newNama = prompt('Ubah nama rombel:', oldNama);
    if (!newNama || newNama.trim() === '' || newNama.trim() === oldNama) return;

    const { error } = await db.from('rombel').update({ nama: newNama.trim() }).eq('id', id);
    if (error) { showToast('Gagal mengubah: ' + error.message, 'error'); }
    else { showToast('Nama rombel berhasil diubah!', 'success'); loadRombel(Auth.getSession()); }
}