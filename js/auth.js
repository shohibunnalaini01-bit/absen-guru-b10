// js/auth.js
// Sistem Login, Session, dan Role Guard

const Auth = {
    // Key untuk menyimpan session di localStorage
    SESSION_KEY: 'absen_guru_session',

    // Mendapatkan data sesi yang sedang aktif
    getSession: function() {
        const session = localStorage.getItem(this.SESSION_KEY);
        return session ? JSON.parse(session) : null;
    },

    // Proses Login
    login: async function(username, password) {
        // Cari user di tabel Supabase
        const { data, error } = await db
            .from('users')
            .select('*, lembaga:lembaga_id(*)') // Join tabel lembaga
            .eq('username', username)
            .eq('password', password) // Sesuai permintaan, pakai plain text dulu
            .single();

        if (error || !data) {
            throw new Error('Username atau password salah!');
        }

        // Simpan data user ke localStorage
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(data));
        return data;
    },

    // Proses Logout
    logout: function() {
        localStorage.removeItem(this.SESSION_KEY);
        window.location.href = 'login.html';
    },

    // Mendapatkan Role user yang login
    getRole: function() {
        const session = this.getSession();
        return session ? session.role : null;
    },

    // Mendapatkan Lembaga ID user yang login
    getLembagaId: function() {
        const session = this.getSession();
        return session ? session.lembaga_id : null;
    },

    // Mendapatkan Nama Lembaga (dari join data)
    getLembagaNama: function() {
        const session = this.getSession();
        if (session && session.lembaga) {
            return session.lembaga.nama;
        }
        return 'Semua Lembaga'; // Untuk superadmin
    },

    // Melindungi halaman (Panggil di setiap halaman)
    guard: function(allowedRoles) {
        const session = this.getSession();
        
        // Jika belum login, lempar ke halaman login
        if (!session) {
            window.location.href = 'login.html';
            return false;
        }

        // Jika role tidak diizinkan, lempar ke dashboard
        if (allowedRoles && !allowedRoles.includes(session.role)) {
            alert('Anda tidak memiliki akses ke halaman ini!');
            window.location.href = 'index.html';
            return false;
        }

        return true;
    },

    // ==============================
    // HELPER CEK ROLE
    // ==============================
    isSuperAdmin: function() {
        return this.getRole() === 'superadmin';
    },

    isAdmin: function() {
        return this.getRole() ? this.getRole().startsWith('admin_') : false;
    },

    isPengabsen: function() {
        return this.getRole() ? this.getRole().startsWith('pengabsen_') : false;
    },

    isPembacaRekap: function() {
        return this.getRole() === 'pembaca_rekap';
    }
};