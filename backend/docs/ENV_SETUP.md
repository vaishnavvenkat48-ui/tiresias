# Backend — Environment Setup

1. `cd backend && npm install`
2. `cp .env.example .env` (Windows: `copy .env.example .env`)
3. Edit `.env`:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/tiresias
JWT_SECRET=<long random string, min 32 chars>
JWT_REFRESH_SECRET=<different long random string>
CLIENT_URL=http://localhost:5173
```

4. Run: `npm run dev` (or `npm start`). No local MongoDB? The server
   falls back to an ephemeral in-memory MongoDB so auth works out of the box
   (data resets on restart). For persistence use MongoDB Atlas or local mongod.
5. Health: `http://localhost:5000/api/health` → `db: "connected"`.
6. Seed demo data (needs real `MONGO_URI`): `npm run seed`.
7. Optional AI keys: `GEMINI_API_KEY`, `YOUTUBE_API_KEY` — services return
   mock data until these are set, so the API contract is stable either way.
