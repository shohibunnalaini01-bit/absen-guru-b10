// js/config.js
// Konfigurasi Supabase Utama (Dipakai di semua halaman)

// GANTI DENGAN URL DAN API KEY SUPABASE ANDA
const SUPABASE_URL = 'https://rwsnhmdapwgpqsedprir.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dj184SGO3Z3F9mkyDSZS8A_HECYsR0l';

// Inisialisasi Supabase Client
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);