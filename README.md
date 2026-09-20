# Walkie Talkie Web

Aplikasi komunikasi suara real-time berbasis web layaknya walkie talkie sungguhan, menggunakan WebRTC dan Socket.IO.

## Prasyarat
1. [Node.js](https://nodejs.org/) (versi 16 atau lebih baru) terinstal di sistem Anda.

## Instalasi
1. Clone atau masuk ke direktori proyek ini.
2. Jalankan perintah instalasi dependency:
   ```bash
   npm install
   ```
3. Buat file `.env` dan konfigurasikan (opsional):
   ```
   PORT=3000
   ```

## Menjalankan Server Lokal
Untuk menjalankan server pengembangan:
```bash
npm run dev
```
Aplikasi akan berjalan di `http://localhost:3000`.

## Testing Localhost (PC ke PC)
1. Buka browser (disarankan Google Chrome).
2. Akses `http://localhost:3000` di dua tab atau jendela berbeda.
3. Buat/masukkan kode channel dan nama pengguna.
4. Klik tombol "Gabung Channel".
5. Beri izin mikrofon.
6. Tekan dan tahan tombol "🎙️" (Push To Talk) atau tekan tombol `SPACE` pada keyboard untuk berbicara.

## Testing Jaringan Lokal (PC ke HP Android/iOS)
**PENTING**: Browser modern mewajibkan protokol aman (**HTTPS**) agar fitur mikrofon via WebRTC `getUserMedia()` dapat diakses dari perangkat lain selain `localhost`.
Jika Anda mengakses via IP lokal (misal `http://192.168.1.10:3000`), mikrofon **akan diblokir**.

### Solusi untuk Testing Jaringan Lokal:
Gunakan aplikasi *tunneling* seperti `ngrok` untuk mengekspos localhost Anda ke internet dengan HTTPS.
1. Install [ngrok](https://ngrok.com/).
2. Jalankan server lokal: `npm run dev`.
3. Buka terminal baru dan jalankan ngrok:
   ```bash
   ngrok http 3000
   ```
4. Ngrok akan memberikan URL HTTPS (misal: `https://abcd-12-34-56-78.ngrok-free.app`).
5. Buka URL tersebut di HP Anda. Mikrofon akan berfungsi dengan baik karena berjalan di atas HTTPS.

## Fitur Utama
1. **WebRTC Real-time Audio**: Kualitas suara yang jernih, latensi rendah, dengan peredam bising bawaan browser.
2. **Channel-based Communication**: Bergabung ke ruang percakapan (room) berbasis kode unik tanpa pendaftaran.
3. **Push-To-Talk & Hands-Free Mode**: Sistem interkom di mana hanya satu orang yang dapat berbicara pada satu waktu.
4. **Speaking Lock**: Mencegah tabrakan audio; jika User A sedang berbicara, User B tidak bisa mengambil alih hingga tombol dilepas.
5. **Progressive Web App (PWA)**: Dapat diinstal langsung ke perangkat seluler maupun desktop.
6. **QR Code Join**: Memindai QR Code untuk otomatis masuk ke *channel* tujuan.

## Deployment Production
Aplikasi ini terdiri dari frontend dan backend dalam satu paket Node.js (Fullstack Monorepo).
Untuk *deployment*, ikuti panduan ini:
- **Platform**: Anda dapat mendeploy ke layanan cloud seperti Railway, Render, Fly.io, atau VPS.
- **HTTPS & WSS**: Pastikan *load balancer* atau *reverse proxy* di platform penyedia layanan Anda telah menyediakan SSL/TLS (HTTPS). Koneksi WebSocket Socket.IO akan menggunakan `WSS://`.
- **STUN / TURN Server**: Secara bawaan, WebRTC di aplikasi ini menggunakan STUN server Google (`stun:stun.l.google.com:19302`). Untuk *production grade*, sangat disarankan untuk mengatur **TURN server** (seperti Twilio NAT, Metered TURN, atau Coturn di server sendiri). TURN diperlukan ketika pengguna berada di balik NAT simetris atau firewall ketat yang memblokir koneksi peer-to-peer langsung.
- **Skalabilitas**: Karena aplikasi ini menggunakan memori internal (in-memory state pada `rooms.js`) untuk menyimpan status channel, aplikasi tidak dapat langsung di-scale secara horizontal (multiple instance) kecuali diintegrasikan dengan Redis Adapter (untuk Socket.IO).

## Troubleshooting Mikrofon
- **Tidak ada suara**: Pastikan volume perangkat tidak dalam keadaan *mute*, dan browser memiliki izin (permission) penuh ke mikrofon.
- **Izin ditolak**: Di HP (iOS/Android), jika terlanjur menolak, Anda harus masuk ke pengaturan situs (*site settings*) pada browser dan mengaktifkan izin mikrofon secara manual.
- **Feedback (Suara mendengung)**: Jika menggunakan dua perangkat berdekatan, matikan *speaker* di salah satu perangkat atau gunakan *headset* untuk menghindari loop suara (echo).
