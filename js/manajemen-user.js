// js/manajemen-user.js
// Manajemen User + Hari Libur + Hari Ujian + Kalender Hijriyah Manual

document.addEventListener('DOMContentLoaded', async function() {
    await HijriCalendar.ready;

    const session = Auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    if (session.role !== 'superadmin') {
        showToast('Anda tidak memiliki akses ke halaman ini', 'error');
        setTimeout(() => window.location.href = 'index.html', 1500);
        return;
    }

    initUI(session);
    handleTabs();

    // User
    await loadLembagaDropdown();
    await loadUsers(session);
    handleUserForm(session);

    // Libur
    await loadLembagaDropdownLibur();
    await loadLibur();
    handleLiburForm();

    // Ujian
    await loadLembagaDropdownUjian();
    await loadUjian();
    handleUjianForm();

    // Kalender Hijriyah
    setupHijriCalendar();
    await loadHijriCalendar();
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

    document.querySelectorAll('.lembaga-select-wrapper').forEach(el => el.style.display = 'block');

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

/* ========================
   1. USER LOGIC
======================== */
async function loadLembagaDropdown() {
    const { data } = await db.from('lembaga').select('*').order('kode');
    if (data) {
        const select = document.getElementById('userLembaga');
        select.innerHTML = '<option value="">Pilih Lembaga</option>';
        data.forEach(l => select.innerHTML += `<option value="${l.id}">${l.kode}</option>`);
    }
}

function handleUserForm(session) {
    document.getElementById('userRoleSelect').addEventListener('change', function() {
        const showLembaga = !['superadmin', 'pembaca_rekap'].includes(this.value);
        document.getElementById('userLembagaGroup').style.display = showLembaga ? 'block' : 'none';
    });

    document.getElementById('userForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nama = document.getElementById('userNama').value;
        const username = document.getElementById('userUsername').value;
        const password = document.getElementById('userPassword').value;
        const role = document.getElementById('userRoleSelect').value;
        let lembaga_id = document.getElementById('userLembaga').value;

        if (['superadmin', 'pembaca_rekap'].includes(role)) lembaga_id = null;
        else if (!lembaga_id) { showToast('Role ini wajib memilih lembaga', 'warning'); return; }

        const { error } = await db.from('users').insert({ nama, username, password, role, lembaga_id });
        if (error) { showToast('Gagal: ' + error.message, 'error'); }
        else {
            showToast('User berhasil ditambahkan', 'success');
            document.getElementById('userForm').reset();
            document.getElementById('userLembagaGroup').style.display = 'none';
            loadUsers(session);
        }
    });
}

async function loadUsers(session) {
    const { data, error } = await db.from('users').select('*, lembaga(kode)').order('created_at', { ascending: true });
    const tbody = document.getElementById('userTable');
    if (error || !data.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Tidak ada data user</td></tr>'; return; }

    tbody.innerHTML = data.map((u, i) => {
        const roleName = u.role.replace(/_/g, ' ').toUpperCase();
        const lembagaName = u.lembaga ? u.lembaga.kode : '-';
        const isSelf = u.id === session.id;
        const actionBtn = isSelf
            ? '<span class="self-note">Aktif</span>'
            : `<button class="btn-icon btn-icon-delete" onclick="deleteUser('${u.id}', '${u.nama.replace(/'/g, "\\'")}')" title="Hapus"><i data-lucide="trash-2"></i></button>`;
        return `<tr>
            <td class="col-no">${i + 1}</td>
            <td class="cell-strong">${u.nama}</td>
            <td>${u.username}</td>
            <td><span class="role-chip">${roleName}</span></td>
            <td><span class="kode-chip">${lembagaName}</span></td>
            <td class="action-col">${actionBtn}</td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}

async function deleteUser(id, name) {
    showConfirmModal({
        title: 'Hapus User',
        message: `Yakin ingin menghapus user <strong>${name}</strong>? User tidak akan bisa login lagi.`,
        onConfirm: async (close) => {
            const session = Auth.getSession();
            const { error } = await db.from('users').delete().eq('id', id);
            if (error) { showToast('Gagal menghapus: ' + error.message, 'error'); return; }
            showToast('User berhasil dihapus', 'success');
            close();
            loadUsers(session);
        }
    });
}

/* ========================
   2. HARI LIBUR LOGIC
======================== */
async function loadLembagaDropdownLibur() {
    const { data } = await db.from('lembaga').select('*').order('kode');
    const select = document.getElementById('liburLembaga');
    select.innerHTML = '<option value="all">Semua Lembaga</option>';
    if (data) data.forEach(l => select.innerHTML += `<option value="${l.id}">${l.kode} - ${l.nama}</option>`);
}

function handleLiburForm() {
    document.getElementById('liburForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tanggal = document.getElementById('liburTanggal').value;
        const lembagaVal = document.getElementById('liburLembaga').value;
        const keterangan = document.getElementById('liburKeterangan').value;

        let inserts = [];
        if (lembagaVal === 'all') {
            const { data: lembagas } = await db.from('lembaga').select('id');
            lembagas.forEach(l => inserts.push({ tanggal, lembaga_id: l.id, keterangan }));
        } else {
            inserts.push({ tanggal, lembaga_id: lembagaVal, keterangan });
        }

        const { error } = await db.from('hari_libur').insert(inserts);
        if (error) { showToast('Gagal: ' + error.message, 'error'); }
        else { showToast('Hari libur berhasil ditambahkan', 'success'); document.getElementById('liburForm').reset(); loadLibur(); }
    });
}

async function loadLibur() {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const { data, error } = await db.from('hari_libur').select('*, lembaga(kode)').gte('tanggal', today).order('tanggal');
    const tbody = document.getElementById('liburTable');

    if (error || !data.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Belum ada hari libur</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(l => `
        <tr>
            <td class="cell-strong">${formatTanggalID(l.tanggal)}</td>
            <td>${HijriCalendar.format(new Date(l.tanggal + 'T00:00:00'))}</td>
            <td><span class="kode-chip">${l.lembaga ? l.lembaga.kode : 'Semua'}</span></td>
            <td>${l.keterangan}</td>
            <td class="action-col">
                <button class="btn-icon btn-icon-delete" onclick="deleteLibur('${l.id}', '${(l.keterangan || '').replace(/'/g, "\\'")}')" title="Hapus"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

async function deleteLibur(id, name) {
    showConfirmModal({
        title: 'Hapus Hari Libur',
        message: `Yakin ingin menghapus libur <strong>${name}</strong>?`,
        onConfirm: async (close) => {
            const { error } = await db.from('hari_libur').delete().eq('id', id);
            if (error) { showToast('Gagal menghapus: ' + error.message, 'error'); return; }
            showToast('Hari libur berhasil dihapus', 'success');
            close();
            loadLibur();
        }
    });
}

/* ========================
   3. HARI UJIAN LOGIC
======================== */
async function loadLembagaDropdownUjian() {
    const { data } = await db.from('lembaga').select('*').order('kode');
    const select = document.getElementById('ujianLembaga');
    select.innerHTML = '<option value="">Semua Lembaga</option>';
    if (data) data.forEach(l => select.innerHTML += `<option value="${l.id}">${l.kode} - ${l.nama}</option>`);
}

function handleUjianForm() {
    document.getElementById('ujianForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const mulai = document.getElementById('ujianMulai').value;
        const selesai = document.getElementById('ujianSelesai').value;
        const keterangan = document.getElementById('ujianKeterangan').value;
        const lembagaVal = document.getElementById('ujianLembaga').value;

        if (selesai < mulai) { showToast('Tanggal selesai harus setelah tanggal mulai', 'warning'); return; }

        const { error } = await db.from('hari_ujian').insert({
            tanggal_mulai: mulai,
            tanggal_selesai: selesai,
            keterangan,
            lembaga_id: lembagaVal || null
        });

        if (error) { showToast('Gagal: ' + error.message, 'error'); return; }
        showToast('Hari ujian berhasil ditambahkan', 'success');
        document.getElementById('ujianForm').reset();
        loadUjian();
    });
}

async function loadUjian() {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const { data, error } = await db.from('hari_ujian')
        .select('*, lembaga(kode)')
        .gte('tanggal_selesai', today)
        .order('tanggal_mulai');

    const tbody = document.getElementById('ujianTable');
    if (error || !data.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Belum ada hari ujian</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(u => `
        <tr>
            <td class="cell-strong">${formatTanggalID(u.tanggal_mulai)}</td>
            <td class="cell-strong">${formatTanggalID(u.tanggal_selesai)}</td>
            <td><span class="kode-chip">${u.lembaga ? u.lembaga.kode : 'Semua'}</span></td>
            <td>${u.keterangan || '-'}</td>
            <td class="action-col">
                <button class="btn-icon btn-icon-delete" onclick="deleteUjian('${u.id}', '${(u.keterangan || 'Hari Ujian').replace(/'/g, "\\'")}')" title="Hapus"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

async function deleteUjian(id, name) {
    showConfirmModal({
        title: 'Hapus Hari Ujian',
        message: `Yakin ingin menghapus <strong>${name}</strong>? Tanggal pada rentang itu akan kembali dihitung sebagai hari kerja normal.`,
        onConfirm: async (close) => {
            const { error } = await db.from('hari_ujian').delete().eq('id', id);
            if (error) { showToast('Gagal menghapus: ' + error.message, 'error'); return; }
            showToast('Hari ujian berhasil dihapus', 'success');
            close();
            loadUjian();
        }
    });
}

/* ========================
   4. KALENDER HIJRIYAH MANUAL
======================== */
function setupHijriCalendar() {
    const bulanSelect = document.getElementById('hijriBulan');
    bulanSelect.innerHTML = HijriCalendar.monthNames
        .map((nama, i) => `<option value="${i + 1}">${i + 1}. ${nama}</option>`)
        .join('');

    const today = new Date();
    const h = HijriCalendar.toHijri(today);
    if (h) {
        bulanSelect.value = h.month;
        document.getElementById('hijriTahun').value = h.year;
    }
    document.getElementById('hijriTanggal').value = todayLocal();

    document.getElementById('hijriForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const bulan = parseInt(document.getElementById('hijriBulan').value);
        const tahun = parseInt(document.getElementById('hijriTahun').value);
        const tanggal = document.getElementById('hijriTanggal').value;

        if (!bulan || !tahun || !tanggal) { showToast('Lengkapi semua field', 'warning'); return; }

        const { data: existing } = await db.from('kalender_hijri')
            .select('id')
            .eq('bulan_hijri', bulan)
            .eq('tahun_hijri', tahun)
            .maybeSingle();

        const namaBulan = HijriCalendar.monthNames[bulan - 1];

        if (existing) {
            const { error } = await db.from('kalender_hijri')
                .update({ tanggal_mulai: tanggal })
                .eq('id', existing.id);
            if (error) { showToast('Gagal: ' + error.message, 'error'); return; }
            showToast(`${namaBulan} ${tahun} H diperbarui: mulai ${formatTanggalID(tanggal)}`, 'success');
        } else {
            const { error } = await db.from('kalender_hijri')
                .insert({ bulan_hijri: bulan, tahun_hijri: tahun, tanggal_mulai: tanggal });
            if (error) { showToast('Gagal: ' + error.message, 'error'); return; }
            showToast(`${namaBulan} ${tahun} H dimulai ${formatTanggalID(tanggal)}`, 'success');
        }

        await HijriCalendar.reloadManual();
        loadHijriCalendar();
    });
}

async function loadHijriCalendar() {
    const { data, error } = await db.from('kalender_hijri')
        .select('*')
        .order('tanggal_mulai', { ascending: true });

    const tbody = document.getElementById('hijriTable');
    if (error || !data.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Belum ada pengaturan. Semua tanggal memakai hitungan algoritma otomatis.</td></tr>';
        return;
    }

    HijriCalendar.manualCalendar = data;

    tbody.innerHTML = data.map((row, i) => {
        const namaBulan = HijriCalendar.monthNames[row.bulan_hijri - 1];

        let berlakuSampai = 'Sampai bulan berikutnya di-set';
        if (i < data.length - 1) {
            const nextStart = new Date(data[i + 1].tanggal_mulai + 'T00:00:00');
            nextStart.setDate(nextStart.getDate() - 1);
            berlakuSampai = formatTanggalID(toLocalDateStr(nextStart));
        }

        const h = HijriCalendar.toHijri(new Date());
        const isAktif = h && h.month === row.bulan_hijri && h.year === row.tahun_hijri;
        const aktifBadge = isAktif ? '<span class="hijri-aktif">Bulan Ini</span>' : '';

        return `<tr>
            <td class="cell-strong">${namaBulan} ${aktifBadge}</td>
            <td>${row.tahun_hijri} H</td>
            <td class="cell-strong">${formatTanggalID(row.tanggal_mulai)}</td>
            <td>${berlakuSampai}</td>
            <td class="action-col">
                <button class="btn-icon btn-icon-delete" onclick="deleteHijri('${row.id}', '${namaBulan} ${row.tahun_hijri} H')" title="Hapus"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>`;
    }).join('');
    lucide.createIcons();
}

async function deleteHijri(id, name) {
    showConfirmModal({
        title: 'Hapus Pengaturan',
        message: `Hapus pengaturan <strong>${name}</strong>? Tanggal di rentang itu akan kembali memakai hitungan algoritma otomatis.`,
        onConfirm: async (close) => {
            const { error } = await db.from('kalender_hijri').delete().eq('id', id);
            if (error) { showToast('Gagal menghapus: ' + error.message, 'error'); return; }
            showToast('Pengaturan kalender dihapus', 'success');
            close();
            await HijriCalendar.reloadManual();
            loadHijriCalendar();
        }
    });
}

/* ========================
   UTIL
======================== */
function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toLocalDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTanggalID(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
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
