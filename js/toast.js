// js/toast.js
// Sistem Notifikasi — Clean Alert Card (Tema AL ANWAR)
// Tipe: info | success | warning | error

const TOAST_CONFIG = {
  info:    { title: 'Informasi',  icon: 'info' },
  success: { title: 'Berhasil',   icon: 'check-circle' },
  warning: { title: 'Peringatan', icon: 'alert-triangle' },
  error:   { title: 'Kesalahan',  icon: 'alert-circle' }
};

function showToast(message, type = 'success', duration = 3000) {
  const config = TOAST_CONFIG[type] || TOAST_CONFIG.info;

  // 1. Buat container jika belum ada
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  // 2. Maksimal 4 toast — yang paling lama dihapus dulu
  const active = container.querySelectorAll('.toast-card:not(.hide)');
  if (active.length >= 4) {
    const oldest = active[0];
    oldest.classList.remove('show');
    oldest.classList.add('hide');
    setTimeout(() => oldest.remove(), 350);
  }

  // 3. Bangun elemen toast
  const toast = document.createElement('div');
  toast.className = `toast-card ${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.innerHTML = `
    <div class="toast-icon"><i data-lucide="${config.icon}"></i></div>
    <div class="toast-body">
      <p class="toast-title">${config.title}</p>
      <p class="toast-message">${message}</p>
    </div>
    <button class="toast-close" aria-label="Tutup notifikasi">
      <i data-lucide="x"></i>
    </button>
  `;
  container.appendChild(toast);

  // 4. Render ikon Lucide
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // 5. Animasi masuk
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'));
  });

  // 6. Mekanisme tutup (tombol ×, auto close, pause saat hover)
  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 350);
  };

  toast.querySelector('.toast-close').addEventListener('click', dismiss);

  const startTimer = (ms) => { timer = setTimeout(dismiss, ms); };
  startTimer(duration);
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  toast.addEventListener('mouseleave', () => startTimer(1500));
}

// Shorthand: showToast.success('pesan') dll
showToast.info    = (msg, d) => showToast(msg, 'info', d);
showToast.success = (msg, d) => showToast(msg, 'success', d);
showToast.warning = (msg, d) => showToast(msg, 'warning', d);
showToast.error   = (msg, d) => showToast(msg, 'error', d);