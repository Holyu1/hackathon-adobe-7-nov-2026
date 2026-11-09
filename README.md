# PreLaunch – simulator de reacții la reclame creat pentru publicul din România

Frontend React + Vite + Tailwind, backend Express, AI: Google Gemini. Cheile API stau doar în `.env`, pe server.

## Cum pornești

1. Instalează Node.js 20 sau mai nou (https://nodejs.org, varianta LTS).
2. Fișierul `.env` e deja completat cu cheile YouTube și Gemini. Modelul se schimbă din `GEMINI_MODEL` (implicit `gemini-2.5-flash`).
3. În terminal, în acest folder:
   ```
   npm install
   npm start
   ```
4. Deschide http://localhost:3001

Pentru lucru pe cod: `npm run dev` (frontend pe http://localhost:5173, cu backend-ul pornit automat).

## Ce face backend-ul (server/index.js)

- `GET /api/youtube/trending-comments` – ia primele 50 de videoclipuri din Trending YouTube România și comentariile de top (cache 12h, în memorie și în `.cache/`). `?refresh=1` forțează resincronizarea.
- `POST /api/simulate` – trimite descrierea + imaginile (sau 3 cadre din video) la Google Gemini, cu promptul de sistem din specificație și 40 de comentarii reale ca bază de calibrare. Scorul se calculează în cod: `max(0, 100 − 3 × număr_probleme)`.
- `POST /api/adapt` – adaptează reclama pentru bumper 6s, YouTube Shorts și descrierea video-ului.
- `POST /api/report` – raport scurt pentru manager.
- `GET /api/status` – arată dacă cheile sunt setate.
