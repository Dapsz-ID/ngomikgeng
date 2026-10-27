# Ngomikgeng

Website baca komik mobile-first menggunakan HTML, CSS, JavaScript ESM, dan Vercel Serverless Functions. Data katalog dan chapter diambil dari `komiku.online` menggunakan Cheerio. Favorite, tema, dan riwayat baca disimpan di `localStorage` browser.

## Struktur project

```text
ngomikgeng/
├── api/
│   └── index.js
├── app.js
├── index.html
├── package.json
├── styles.css
├── vercel.json
└── README.md
```

## Deploy ke Vercel

1. Upload isi folder project ke repository Git.
2. Import repository tersebut ke Vercel.
3. Pilih Framework Preset `Other`.
4. Kosongkan Build Command dan Output Directory.
5. Deploy. Vercel memasang dependency dari `package.json` dan menjalankan `api/index.js` sebagai Serverless Function.

## Endpoint API

| Endpoint | Fungsi |
| --- | --- |
| `/api?action=home` | Beranda dan katalog sumber |
| `/api?action=latest&page=1` | Update terbaru |
| `/api?action=popular&page=1` | Komik populer |
| `/api?action=search&q=naruto&page=1` | Pencarian komik |
| `/api?action=type&type=manhwa&page=1` | Filter manga, manhwa, atau manhua |
| `/api?action=genre&genre=aksi&page=1` | Filter genre |
| `/api?action=detail&slug=slug-komik` | Detail komik dan daftar chapter |
| `/api?action=chapter&slug=slug-chapter` | Gambar chapter dan navigasi |
| `/api?action=random` | Komik acak |
| `/api?action=genres` | Daftar genre |

## Fitur

- Beranda, katalog, pencarian otomatis, filter tipe, dan filter genre.
- Detail komik, pencarian dan pengurutan daftar chapter.
- Reader vertikal, kontrol chapter, pengaturan jarak gambar dan latar.
- Overlay kontrol reader yang muncul saat gambar diketuk dan menghilang otomatis.
- Favorite, riwayat baca, progres membaca, serta pilihan tema berbasis browser.
- Layout responsif, lazy loading gambar, cache server singkat, dan state error dengan tombol coba lagi.

## Catatan operasional

- Ketersediaan data bergantung pada akses dan struktur HTML situs sumber. Perubahan struktur atau pembatasan request dari sumber dapat membuat endpoint gagal.
- Favorite, tema, dan riwayat tersimpan pada browser/perangkat yang digunakan; tidak tersinkron antarperangkat.
- Jangan gunakan konten tanpa hak atau izin yang sesuai.
- Deploy produksi tetap perlu diuji melalui URL Vercel untuk memverifikasi akses ke situs sumber dan seluruh gambar chapter.
