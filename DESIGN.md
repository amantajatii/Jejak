# UI Design Guide

Dokumen ini menjelaskan arah visual UI saja. Jangan menyalin teks, logo, brand asset, nama produk, URL, ilustrasi, atau konten spesifik dari screenshot referensi. Semua konten di implementasi harus memakai copy dan asset milik project sendiri.

## Purpose

- Ambil bahasa visual: layout bersih, whitespace besar, tipografi tipis, card besar membulat, CTA pill, dan warna lavender/navy.
- Jangan ambil konten: headline, paragraf, logo, badge sertifikasi, nama menu, ilustrasi, mockup layar, atau copy button dari referensi.
- Gunakan placeholder generik saat membangun komponen: `Brand`, `Product`, `Feature`, `Primary action`, `Secondary action`.

## Font

Gunakan `Plus Jakarta Sans` via `next/font/google`; tidak perlu file font lokal.

- Primary: `Plus Jakarta Sans, Arial, Helvetica, sans-serif`.
- Semua heading besar pakai weight `300` atau `400`.
- Body dan nav tetap ringan; jangan pakai font tebal kecuali label kecil atau state aktif.

## Color System

- `--color-ink: #050505` untuk teks utama dan CTA gelap.
- `--color-paper: #f7f7f5` untuk background terang hangat.
- `--color-white: #ffffff` untuk nav, panel dalam, dan card bersih.
- `--color-muted: #6f6f6f` untuk body copy dan secondary nav.
- `--color-line: #dedee8` untuk divider halus.
- `--color-lavender: #dedeff` untuk section soft ungu.
- `--color-periwinkle: #8588ff` untuk media block, badge, dan aksen visual.
- `--color-navy: #02063f` untuk section gelap.
- `--color-navy-card: #17164d` untuk card di atas navy.
- Source-accurate alternates dari attachment: gunakan `#F6F6F6` untuk page shell, `#1E1E1E` untuk body gelap, `#2B2B2B` untuk footer/menu text, `#7379FC`/`#8A8FFD` untuk violet accent, `#D3D5FF`/`#E9EAFF` untuk lavender surface.

## Typography

- Hero title: desktop target `84px`, line-height `84px`; responsive fallback `clamp(56px, 7vw, 116px)`, tracking `-0.05em`, center-aligned.
- Section title: `clamp(48px, 5vw, 88px)`, line-height `1.05`, tracking `-0.045em`.
- Card title: `24–32px`, line-height `1.15`, tracking ketat.
- Body/intro: `22px`, line-height `29px`, warna muted.
- Card/menu body: `14–19px`, line-height `1.2–1.4`, weight `300`.
- Nav/action text: `15–16px`, line-height `21px`, warna ink.
- Hindari banyak font weight; kontras utama datang dari ukuran, ruang, dan warna.

## Layout

- Page memakai background terang netral, bukan putih murni di semua section.
- Container utama fixed centered: max-width `1440–1640px`, padding horizontal `24–64px`.
- Content rail untuk hero/footer/menu: max-width `1184px`.
- Section spacing besar: padding vertical `96–180px`.
- Hero: konten center, max-width teks `900–1200px`, title/subtitle gap `16px`, CTA row gap `16px`, jarak besar sebelum media/logos.
- Header: top white bar, height `76–96px`, border bawah `1px solid var(--color-line)`, content grid 3 zona: brand kiri, nav tengah, actions kanan.
- Dark section: full-width navy, konten center, title putih, media/card mulai setelah whitespace besar.
- Footer/mega-menu: lavender panel besar, max-width centered, border radius bawah besar, grid multi-column, divider tipis di atas.

## Components

### Buttons

- Primary pill: black background, white text, height `56–64px`, padding `0 28–36px`, radius `999px`.
- Compact pill from reference scale: padding `16px 24px`, gap `8px`, font `15px/21px`, radius `9999px`.
- Secondary pill on dark: white background, black text, same shape.
- Text link: no box, inline arrow kanan, gap `12–16px`, hover geser arrow sedikit.
- Semua CTA boleh punya arrow icon sederhana; jangan pakai ikon brand referensi.

### Cards and Media Blocks

- Large media card: radius `32–40px`, overflow hidden, flat fill, no heavy shadow.
- Precise large-card radius boleh `31.5–32px`; pakai `32px` di CSS.
- Product grid card: image/mockup block di atas, title/body di bawah, gap `20–28px`.
- Dark feature panel: navy-card di atas navy background, radius `32–40px`, isi center, gunakan ikon abstrak kecil.
- Lavender mockup panel: periwinkle/lavender gradient halus, inner white rounded rectangle untuk simulasi UI.
- Card tidak perlu border berat; cukup background contrast dan clipping radius.

### Badges and Logo Rows

- Badge chip: small pill, periwinkle fill, white text, radius `8–12px`, tinggi `34–44px`.
- Logo row: grayscale placeholder marks, opacity `0.45–0.65`, divider vertikal tipis antar item.
- Certification/logo tile: white rounded square/rectangle di atas lavender, radius `18–24px`, gunakan icon placeholder.
- Jangan menyalin logo, nama perusahaan, atau badge sertifikasi dari screenshot.

### Navigation and Footer

- Nav center: horizontal links, gap `28–36px`, dropdown caret sederhana.
- Header actions: 2 text links + 1 primary pill.
- Mobile: nav bisa collapse ke menu button; pertahankan brand kiri dan CTA/menu kanan.
- Footer mega-menu: heading kecil per kolom, link muted, row gap besar, 5–6 kolom desktop, 2 kolom tablet, 1 kolom mobile.

## Content Safety Rules

- Dilarang copy-paste semua teks dari screenshot, termasuk headline, body, menu, CTA, caption, badge, dan label UI kecil.
- Dilarang memakai logo, mark, ilustrasi, mockup, screenshot crop, atau asset visual dari website referensi.
- Gunakan bentuk abstrak untuk mengganti konten visual: rounded rectangle, line chart, node graph, phone frame, dashboard frame, icon outline.
- Jika butuh contoh text, pakai placeholder netral: `Feature title`, `Short supporting description`, `Action label`.
- Tujuan implementasi adalah konsistensi tampilan, bukan cloning konten atau brand.

## Quick Implementation Checklist

- `Plus Jakarta Sans` sudah terdaftar via `next/font/google` dan dipakai global.
- Semua section memakai token warna di atas, bukan random hex baru.
- Heading besar tipis, center, tracking ketat.
- CTA utama berbentuk pill hitam dengan arrow kanan.
- Card/media punya radius besar dan overflow hidden.
- Tidak ada teks atau asset yang berasal dari screenshot referensi.
