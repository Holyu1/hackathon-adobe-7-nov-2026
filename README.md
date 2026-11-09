# PreLaunch – simulator de reacții la reclame creat pentru publicul din România

Frontend React + Vite + Tailwind, backend Express, AI prin OpenRouter. Cheile API stau doar în `.env`, pe server.

## Cum pornești
1. Instalează Node.js 20 sau mai nou (https://nodejs.org, varianta LTS).
2. Copiază `.env.example` într-un fișier nou numit `.env` și completează `YOUTUBE_API_KEY` și `OPENROUTER_API_KEY`. Lasă `OPENROUTER_MODEL="auto"` ca aplicația să aleagă singură modelul.
3. În terminal, în acest folder:
   ```
   npm install
   npm start
   ```
4. Deschide http://localhost:3001
Pentru lucru pe cod: `npm run dev` (frontend pe http://localhost:5173, cu backend-ul pornit automat).

## Ce face backend-ul (server/index.js)
- `GET /api/youtube/trending-comments` – ia primele 50 de videoclipuri din Trending YouTube România și comentariile de top (cache 12h). `?refresh=1` forțează resincronizarea.
- `POST /api/simulate` – trimite descrierea + imaginea (sau 3 cadre din video) la AI prin OpenRouter, cu 40 de comentarii reale ca bază de calibrare. Un al doilea AI verifică problemele, apoi codul calculează scorul: `100 − probleme (−5 / −10 / −15 după gravitate) − sentiment negativ (până la −30)`.
- `POST /api/generate-image` – generează imaginea reclamei corectate.
- `GET /api/status` – arată dacă cheile sunt setate și ce model AI e folosit.
