// js/toast.js
// Sistem Notifikasi Dynamic Island Ala Apple

function showToast(message, type = 'success', duration = 3000) {
    let container = document.getElementById('dynamic-island-container');
    
    // Jika container belum ada, buat dan masukkan ke body
    if (!container) {
        container = document.createElement('div');
        container.id = 'dynamic-island-container';
        container.className = 'dynamic-island-container';
        document.body.appendChild(container);
    }

    // Buat elemen toast
    const toast = document.createElement('div');
    toast.className = `dynamic-island ${type}`;

    // Pilih ikon berdasarkan tipe
    let iconSvg = '';
    if (type === 'success') iconSvg = '<i data-lucide="check-circle"></i>';
    else if (type === 'error') iconSvg = '<i data-lucide="alert-circle"></i>';
    else if (type === 'warning') iconSvg = '<i data-lucide="alert-triangle"></i>';
    else iconSvg = '<i data-lucide="info"></i>';

    toast.innerHTML = `
        <div class="island-icon">${iconSvg}</div>
        <div class="island-text">${message}</div>
    `;

    container.appendChild(toast);

    // Inisialisasi ikon Lucide di dalam toast
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // Animasi masuk (expand)
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Animasi keluar (shrink) setelah durasi
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        
        // Hapus elemen dari DOM setelah animasi selesai
        setTimeout(() => {
            toast.remove();
        }, 400);
    }, duration);
}