// js/manajemen-user.js
document.addEventListener('DOMContentLoaded', async function() {
    const session = Auth.getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    if (session.role !== 'superadmin') {
        showToast('Anda tidak memiliki akses ke halaman ini', 'error');
        setTimeout(() => window.location.href = 'index.html', 1500);
        return;
    }

    initUI(session);
    handleTabs();
    
    // User Logic
    await loadLembagaDropdown();
    await loadUsers(session);
    handleUserForm(session);

    // Libur Logic
    await loadLembagaDropdownLibur();
    await loadLibur();
    handleLiburForm();
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

// ========================
// 1. USER LOGIC
// ========================
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
        else { showToast('User berhasil ditambahkan', 'success'); document.getElementById('userForm').reset(); document.getElementById('userLembagaGroup').style.display = 'none'; loadUsers(session); }
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
        const actionBtn = isSelf ? '<span style="font-size:0.8rem; color:#64748b;">Aktif</span>' : `<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}', '${u.nama}')"><i data-lucide="trash-2"></i></button>`;
        return `<tr><td>${i + 1}</td><td>${u.nama}</td><td>${u.username}</td><td><span class="badge badge-hadir">${roleName}</span></td><td>${lembagaName}</td><td class="action-col">${actionBtn}</td></tr>`;
    }).join('');
    lucide.createIcons();
}

async function deleteUser(id, name) {
    const session = Auth.getSession();
    showToast(`Menghapus user ${name}...`, 'warning', 1500);
    const { error } = await db.from('users').delete().eq('id', id);
    if (error) { showToast('Gagal menghapus: ' + error.message, 'error'); }
    else { showToast('User berhasil dihapus', 'success'); loadUsers(session); }
}


// ========================
// 2. HARI LIBUR LOGIC
// ========================
async function loadLembagaDropdownLibur() {
    const { data } = await db.from('lembaga').select('*').order('kode');
    const select = document.getElementById('liburLembaga');
    data.forEach(l => select.innerHTML += `<option value="${l.id}">${l.kode} - ${l.nama}</option>`);
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
            <td>${l.tanggal}</td>
            <td>${HijriCalendar.format(new Date(l.tanggal + 'T00:00:00'))}</td>
            <td>${l.lembaga ? l.lembaga.kode : '-'}</td>
            <td>${l.keterangan}</td>
            <td class="action-col">
                <button class="btn btn-danger btn-sm" onclick="deleteLibur('${l.id}', '${l.keterangan}')"><i data-lucide="trash-2"></i></button>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

async function deleteLibur(id, name) {
    showToast(`Menghapus libur ${name}...`, 'warning', 1500);
    await db.from('hari_libur').delete().eq('id', id);
    showToast('Berhasil dihapus', 'success');
    loadLibur();
}