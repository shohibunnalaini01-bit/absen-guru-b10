// js/hijri.js
// Konversi Kalender Hijriyah (Algoritma Diperbaiki & Akurat)

const HijriCalendar = {
    // Nama bulan Hijriyah dalam Bahasa Indonesia
    monthNames: [
        "Muharram", "Safar", "Rabi'ul Awal", "Rabi'ul Akhir",
        "Jumadil Ula", "Jumadil Akhirah", "Rajab", "Sya'ban",
        "Ramadhan", "Syawwal", "Dzulqa'dah", "Dzulhijjah"
    ],

    // Nama hari dalam Bahasa Indonesia
    dayNames: ["Ahad", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],

    // Konversi Masehi ke Hijriyah
    toHijri: function(gDate) {
        let date = new Date(gDate);
        if (isNaN(date.getTime())) return null;

        let gd = date.getDate();
        let gm = date.getMonth() + 1; // 1-12
        let gy = date.getFullYear();

        // Konversi ke Julian Day Number (Rumus Akurat)
        let A = Math.floor((14 - gm) / 12);
        let Y = gy + 4800 - A;
        let M = gm + 12 * A - 3;
        
        let JD = gd + Math.floor((153 * M + 2) / 5) + 365 * Y + Math.floor(Y / 4) - Math.floor(Y / 100) + Math.floor(Y / 400) - 32045;

        // Konversi Julian Day ke Hijriyah (Algoritma Umm al-Qura / Kuwaiti)
        let l = Math.floor(JD) - 1948440 + 10632;
        let n = Math.floor((l - 1) / 10631);
        l = l - 10631 * n + 354;
        let j = (Math.floor((10985 - l) / 5316)) * (Math.floor((50 * l) / 17719)) + (Math.floor(l / 5670)) * (Math.floor((43 * l) / 15238));
        l = l - (Math.floor((30 - j) / 15)) * (Math.floor((17719 * j) / 50)) - (Math.floor(j / 16)) * (Math.floor((15238 * j) / 73)) + 29;
        
        let hm = Math.floor((24 * l) / 709);
        let hd = l - Math.floor((709 * hm) / 24);
        let hy = 30 * n + j - 30;

        return { day: hd, month: hm, year: hy };
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
    }
};