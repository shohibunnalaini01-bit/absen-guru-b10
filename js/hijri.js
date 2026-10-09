// js/hijri.js
// Konversi Kalender Hijriyah
// PRIORITAS 1: Kalender manual dari tabel `kalender_hijri` (di-set admin)
// PRIORITAS 2: Algoritma matematis (fallback)

const HijriCalendar = {
    monthNames: [
        "Muharram", "Safar", "Rabi'ul Awal", "Rabi'ul Akhir",
        "Jumadil Ula", "Jumadil Akhirah", "Rajab", "Sya'ban",
        "Ramadhan", "Syawwal", "Dzulqa'dah", "Dzulhijjah"
    ],

    dayNames: ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],

    // Cache kalender manual (diisi otomatis dari Supabase)
    manualCalendar: [],

    // Cari entri manual yang berlaku untuk tanggal ini:
    // entri dengan tanggal_mulai TERAKHIR yang <= tanggal dicari
    _findManual: function(gDate) {
        if (!this.manualCalendar || this.manualCalendar.length === 0) return null;
        const t = new Date(gDate);
        t.setHours(0, 0, 0, 0);

        let best = null;
        for (const entry of this.manualCalendar) {
            const start = new Date(entry.tanggal_mulai + 'T00:00:00');
            if (start <= t) {
                if (!best || new Date(best.tanggal_mulai + 'T00:00:00') < start) {
                    best = entry;
                }
            }
        }
        return best;
    },

    // Konversi Masehi ke Hijriyah
    toHijri: function(gDate) {
        let date = new Date(gDate);
        if (isNaN(date.getTime())) return null;

        // === PRIORITAS 1: Kalender manual (setelan admin) ===
        const manual = this._findManual(date);
        if (manual) {
            const start = new Date(manual.tanggal_mulai + 'T00:00:00');
            const copy = new Date(date);
            copy.setHours(0, 0, 0, 0);
            const dayDiff = Math.round((copy - start) / 86400000) + 1;
            return {
                day: dayDiff,
                month: manual.bulan_hijri,
                year: manual.tahun_hijri,
                source: 'manual'
            };
        }

        // === PRIORITAS 2: Algoritma matematis (fallback) ===
        let gd = date.getDate();
        let gm = date.getMonth() + 1;
        let gy = date.getFullYear();

        let A = Math.floor((14 - gm) / 12);
        let Y = gy + 4800 - A;
        let M = gm + 12 * A - 3;

        let JD = gd + Math.floor((153 * M + 2) / 5) + 365 * Y + Math.floor(Y / 4) - Math.floor(Y / 100) + Math.floor(Y / 400) - 32045;

        let l = Math.floor(JD) - 1948440 + 10632;
        let n = Math.floor((l - 1) / 10631);
        l = l - 10631 * n + 354;
        let j = (Math.floor((10985 - l) / 5316)) * (Math.floor((50 * l) / 17719)) + (Math.floor(l / 5670)) * (Math.floor((43 * l) / 15238));
        l = l - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) - (Math.floor(j / 16)) * (Math.floor((15238 * j) / 73)) + 29;

        let hm = Math.floor((24 * l) / 709);
        let hd = l - Math.floor((709 * hm) / 24);
        let hy = 30 * n + j - 30;

        return { day: hd, month: hm, year: hy, source: 'algoritma' };
    },

    // Format tampilan (contoh: 5 Muharram 1446 H)
    format: function(gDate) {
        let h = this.toHijri(gDate);
        if (h) {
            return `${h.day} ${this.monthNames[h.month - 1]} ${h.year} H`;
        }
        return "";
    },

    // Format lengkap dengan hari (contoh: Sabtu, 5 Muharram 1446 H)
    formatFull: function(gDate) {
        let date = new Date(gDate);
        let dayName = this.dayNames[date.getDay()];
        let h = this.toHijri(gDate);
        if (h) {
            return `${dayName}, ${h.day} ${this.monthNames[h.month - 1]} ${h.year} H`;
        }
        return "";
    },

    // Cek hari efektif (Sabtu - Kamis), Jumat libur
    isEffectiveDay: function(gDate) {
        let day = new Date(gDate).getDay();
        return day !== 5; // 5 = Jumat
    },

    // Ambil kalender manual dari Supabase
    fetchManual: async function() {
        try {
            if (typeof db === 'undefined') return;
            const { data, error } = await db.from('kalender_hijri')
                .select('*')
                .order('tanggal_mulai', { ascending: true });
            if (!error && data) this.manualCalendar = data;
        } catch (e) {
            console.warn('Tabel kalender_hijri belum tersedia, pakai algoritma.', e);
        }
    },

    // Panggil ulang setelah admin mengubah kalender
    reloadManual: async function() {
        await this.fetchManual();
    }
};

// Auto-load kalender manual saat script termuat
// (config.js di-load sebelum hijri.js, jadi `db` sudah tersedia)
HijriCalendar.ready = (async function() {
    await HijriCalendar.fetchManual();
})();