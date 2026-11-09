// PreLaunch – backend (Express)
// Model AI: OpenRouter (implicit) sau Google Gemini, ales după cheile din .env.
// Rute: GET /api/youtube/trending-comments, POST /api/simulate, POST /api/adapt, POST /api/report
// Cheile API stau DOAR aici, în .env, niciodată în frontend.

import 'dotenv/config'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'

const app = express()
app.use(express.json({ limit: '20mb' }))

const PORT = Number(process.env.PORT || 3001)
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || ''
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || ''
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'chatgpt 6 luna'
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
// Dacă există cheie OpenRouter, o folosim; altfel Gemini.
const PROVIDER = OPENROUTER_API_KEY ? 'openrouter' : 'gemini'
// Doar pentru teste locale; în mod normal rămân adresele oficiale.
const YT_BASE = process.env.YOUTUBE_BASE_URL || 'https://www.googleapis.com/youtube/v3'
const GEMINI_BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta'
const OR_BASE = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1'

const ROOT = path.resolve(import.meta.dirname, '..')
const CACHE_FILE = path.join(ROOT, '.cache', 'youtube-trending.json')
const CACHE_HOURS = 12

/* ------------------------------------------------------------------ */
/* 1. YouTube Data API v3: comentarii din Trending România             */
/* ------------------------------------------------------------------ */

let memoryCache = readCacheFile()

function readCacheFile() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
  } catch {
    return null
  }
}

function cacheFresh(c) {
  return c && Date.now() - c.fetchedAt < CACHE_HOURS * 3600 * 1000
}

async function ytGet(endpoint, params) {
  const url = new URL(`${YT_BASE}/${endpoint}`)
  for (const [k, v] of Object.entries({ ...params, key: YOUTUBE_API_KEY })) url.searchParams.set(k, String(v))
  const r = await fetch(url)
  const body = await r.json().catch(() => ({}))
  if (!r.ok) {
    const msg = body?.error?.message || `YouTube a răspuns ${r.status}`
    const err = new Error(msg)
    err.status = r.status
    throw err
  }
  return body
}

async function syncTrending() {
  if (!YOUTUBE_API_KEY) throw new Error('Lipsește YOUTUBE_API_KEY în fișierul .env')
  const videos = await ytGet('videos', {
    part: 'snippet,contentDetails,statistics',
    chart: 'mostPopular',
    regionCode: 'RO',
    maxResults: 50,
  })
  const items = videos.items || []
  const comments = []
  let skipped = 0
  // Câte 5 videoclipuri în paralel, ca să nu lovim limitele API-ului.
  for (let i = 0; i < items.length; i += 5) {
    const chunk = items.slice(i, i + 5)
    const results = await Promise.allSettled(
      chunk.map((v) =>
        ytGet('commentThreads', { part: 'snippet', videoId: v.id, maxResults: 20, order: 'relevance', textFormat: 'plainText' }),
      ),
    )
    results.forEach((res, k) => {
      if (res.status !== 'fulfilled') {
        skipped++ // comentarii dezactivate sau video indisponibil
        return
      }
      for (const t of res.value.items || []) {
        const s = t.snippet?.topLevelComment?.snippet
        if (!s?.textDisplay) continue
        comments.push({
          text: s.textDisplay.replace(/\s+/g, ' ').trim(),
          likes: s.likeCount || 0,
          video: chunk[k].snippet?.title || '',
        })
      }
    })
  }
  const data = {
    fetchedAt: Date.now(),
    videoCount: items.length,
    videosWithoutComments: skipped,
    commentCount: comments.length,
    videos: items.map((v) => ({ id: v.id, title: v.snippet?.title, channel: v.snippet?.channelTitle })),
    comments,
  }
  memoryCache = data
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true })
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data))
  } catch {
    /* cache-ul pe disc e opțional */
  }
  return data
}

async function getTrending(force = false) {
  if (!force && cacheFresh(memoryCache)) return memoryCache
  return syncTrending()
}

// Un eșantion variat de comentarii scurte, folosit ca „bază de calibrare” a stilului.
function styleSample(data, n = 40) {
  const pool = (data?.comments || []).filter((c) => c.text.length >= 8 && c.text.length <= 220)
  const sorted = [...pool].sort((a, b) => b.likes - a.likes)
  const top = sorted.slice(0, Math.ceil(n / 2))
  const rest = sorted.slice(Math.ceil(n / 2))
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  return [...top, ...rest.slice(0, n - top.length)].map((c) => c.text)
}

function trendingStatus(data) {
  if (!data) return { synced: false }
  return {
    synced: true,
    fetchedAt: data.fetchedAt,
    fresh: cacheFresh(data),
    videoCount: data.videoCount,
    commentCount: data.commentCount,
    videosWithoutComments: data.videosWithoutComments,
    exampleVideos: data.videos.slice(0, 5),
  }
}

app.get('/api/youtube/trending-comments', async (req, res) => {
  try {
    const data = await getTrending(req.query.refresh === '1')
    res.json({ ...trendingStatus(data), sample: styleSample(data, 12) })
  } catch (e) {
    res.status(502).json({ error: `YouTube: ${e.message}`, ...trendingStatus(memoryCache) })
  }
})

app.get('/api/status', (_req, res) => {
  res.json({
    aiKey: PROVIDER === 'openrouter' ? !!OPENROUTER_API_KEY : !!GEMINI_API_KEY,
    provider: PROVIDER,
    model: PROVIDER === 'openrouter' ? resolvedModel || OPENROUTER_MODEL : GEMINI_MODEL,
    youtubeKey: !!YOUTUBE_API_KEY,
    trending: trendingStatus(memoryCache),
  })
})

/* ------------------------------------------------------------------ */
/* 2. Gemini: simularea                                               */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `Ești un sistem avansat de predicție socioculturală specializat pe comportamentul publicului din România.
Sarcina ta este să evaluezi o reclamă (vizual + descriere) și să generezi reacțiile reale, necenzurate și autentice pe care le-ar avea utilizatorii români pe platformele sociale (YouTube, TikTok, Instagram).

Baza ta de calibrare este reprezentată de tipologiile de comentarii din primele 50 de videoclipuri din Trending YouTube România:
- Umor spontan, sarcasm, autoironie și identificarea rapidă a oricărui clișeu.
- Reacție promptă la sponsorizări forțate sau reclame care încearcă „să vândă prea agresiv”.
- Limbaj autentic: utilizarea expresiilor curente, a argoului urban, variații de ton (de la susținere entuziastă până la glume malițioase sau indiferență).

Instrucțiuni de execuție:
1. Analizează reclama transmisă (imagine/video + descriere).
2. Simulează 15-25 comentarii din partea unor personaje fictive diverse (adolescenți, tineri profesioniști, persoane sceptice, fani de brand, vânători de oferte, troli inofensivi).
3. Identifică problemele REALE: elementele care chiar ar deranja o parte importantă a publicului sau ar scădea vânzările. Nu căuta nod în papură.
4. Calculează scorul de eficiență pornind de la 100 și scăzând 5 puncte pentru o problemă de gravitate scăzută, 10 pentru una medie și 15 pentru una ridicată.

Răspunde exclusiv în format JSON valid, conform schemei furnizate.`

const CATEGORIES = [
  'Lipsă de claritate / mesaj confuz',
  'Efect de „cringe” / umor forțat',
  'Scepticism / Neîncredere în ofertă',
  'Nepotrivire culturală / de context',
  'Agasare / Iritare vizuală sau sonoră',
  'Senzație de clickbait / reclamă înșelătoare',
]

const SCHEMA_HINT = `Schema JSON (respect-o exact):
{
  "scor_eficienta": 0-100,
  "puncte_pierdute": număr,
  "numar_probleme_identificate": număr,
  "sumar_executiv": "2 propoziții",
  "probleme_depistate": [
    {"id": 1, "titlu": "titlul scurt al problemei", "categorie": "una din: ${CATEGORIES.join(' | ')}", "gravitate": "scăzută | medie | ridicată", "descriere": "ce anume din reclamă a declanșat problema", "penalizare": 5 | 10 | 15, "citate_relevante": ["comentarii din lista de mai jos care o exemplifică"]}
  ],
  "comentarii_simulate": [
    {"autor_fictiv": "nume sau username", "arhetip": "...", "comentariu": "...", "sentiment": "pozitiv | neutru | negativ | ironic", "aprecieri_simulate": număr}
  ],
  "recomandari_optimizare": ["..."],
  "varianta_corectata": "descrierea, în 2-4 propoziții, a unei variante a reclamei care rezolvă FIECARE problemă depistată și păstrează produsul, oferta și ideea de bază"
}

Cum stabilești gravitatea (fii consecvent):
- scăzută: deranjează puțini oameni, nu afectează decizia de cumpărare.
- medie: scade claritatea sau încrederea pentru o parte importantă a publicului.
- ridicată: poate stârni critici publice, jignește un grup de oameni, sau îi face pe mulți să nu cumpere.
Reguli:
- Problemele trebuie să fie susținute de comentariile simulate: pune în citate_relevante TOATE comentariile care o susțin. Dacă mulți comentatori sunt negativi sau ironici din același motiv, acea problemă e cel puțin medie; un mesaj care jignește un grup de oameni e ridicată.
- Nu inventa probleme mărunte doar ca să ai ce raporta. O reclamă bună poate avea 0-2 probleme.
- Calibrare: o reclamă profesionistă, clară și fără mesaje jignitoare obține de obicei 75-95. Sub 50 doar reclamele care jignesc, induc în eroare sau nu se înțeleg deloc.
- Preferințele de gust ale unui singur comentator, glumele trolilor și detaliile de execuție minore NU sunt probleme.
- Pe YouTube există mereu câțiva troli și sceptici; la o reclamă bună ei sunt o minoritate (sub 20%), majoritatea comentariilor sunt neutre sau pozitive.
- Limbă: scrie corect în română; forma corectă este „cofeină” (niciodată „cafeină”).
- Comentariile reflectă cinstit reacția: dacă reclama e proastă, majoritatea sunt negative sau ironice; dacă e bună, majoritatea sunt pozitive sau neutre.`

/* ---------- OpenRouter ---------- */

let resolvedModel = null
let candidates = []
const badModels = new Set()

// Găsește identificatorul exact al modelului în lista OpenRouter, pornind de la ce scrie în .env
// (ex: "chatgpt 6 luna" -> "openai/..."). Preferă modelele care acceptă imagini.
async function resolveModel() {
  if (resolvedModel) return resolvedModel
  const wanted = OPENROUTER_MODEL.trim()
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const tokens = wanted.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  let list = []
  try {
    const r = await fetch(`${OR_BASE}/models`)
    list = (await r.json()).data || []
  } catch {
    resolvedModel = wanted === 'auto' ? 'google/gemini-2.5-flash' : wanted
    return resolvedModel
  }
  const vision = (m) => (m.architecture?.input_modalities || []).includes('image') || /image/.test(m.architecture?.modality || '')
  const price = (m) => Number(m.pricing?.prompt || 0) + 4 * Number(m.pricing?.completion || 0)

  // 1. Modelul cerut în .env, dacă există în listă.
  if (wanted && wanted !== 'auto') {
    const scored = list
      .map((m) => {
        const id = norm(m.id)
        const short = norm(String(m.id).split('/').pop())
        const name = norm(m.name)
        let score = 0
        if (m.id === wanted) score = 100
        else if (short === norm(wanted) || id === norm(wanted)) score = 90
        else if (name === norm(wanted) || name.endsWith(norm(wanted))) score = 80
        else if (tokens.length && tokens.every((t) => (id + name).includes(t))) score = 60
        if (score && vision(m)) score += 5
        return { m, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
    const okScored = scored.filter((x) => !String(x.m.id).includes(':') && !badModels.has(x.m.id))
    if (okScored.length) {
      resolvedModel = okScored[0].m.id
      console.log(`  Model OpenRouter: "${wanted}" -> ${resolvedModel}`)
      return resolvedModel
    }
    console.log(`  Model OpenRouter: "${wanted}" nu există pe OpenRouter, aleg automat unul ieftin.`)
  }

  // 2. Automat: cel mai ieftin model plătit (nu ":free", care are limite) care acceptă imagini,
  //    preferând familii bune la JSON și română: Gemini Flash, GPT mini, Claude Haiku.
  // Excludem variantele speciale (":free", ":batch", ":online" etc.): merg doar ID-urile simple.
  const textOnly = (m) => !(m.architecture?.output_modalities || []).includes('image') && !/image/i.test(m.id)
  const usable = list.filter((m) => vision(m) && textOnly(m) && !String(m.id).includes(':') && !badModels.has(m.id) && price(m) > 0 && (m.context_length || 0) >= 32000)
  // Evităm variantele „lite” / „nano”: sunt cele mai ieftine, dar și cele mai inconsecvente la evaluare.
  const good = usable.filter((m) => /gemini.*flash|gpt.*mini|claude.*haiku/i.test(m.id) && !/lite|nano/i.test(m.id))
  const pool = (good.length ? good : usable).sort((a, b) => price(a) - price(b))
  candidates = pool.map((m) => m.id)
  resolvedModel = pool[0]?.id || 'google/gemini-2.5-flash'
  const p = pool[0]?.pricing
  console.log(`  Model OpenRouter ales automat: ${resolvedModel}${p ? ` (intrare $${(Number(p.prompt) * 1e6).toFixed(2)} / 1M tokeni)` : ''}`)
  return resolvedModel
}

// Dacă modelul ales nu poate fi folosit, îl marcăm ca stricat și trecem automat la următorul.
async function openrouterCall(args) {
  let lastErr
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await openrouterOnce(args)
    } catch (e) {
      lastErr = e
      const m = e.message || ''
      const modelProblem = /cannot be used|not a valid model|no endpoints|not found for model|model.*(unavailable|not supported|does not support)|image input|support image/i.test(m)
      if (!modelProblem || !resolvedModel) throw e
      console.log(`  Modelul ${resolvedModel} nu merge (${m.slice(0, 120)}). Încerc altul...`)
      badModels.add(resolvedModel)
      resolvedModel = null
      const next = candidates.find((c) => !badModels.has(c))
      if (next) resolvedModel = next
      else await resolveModel()
      console.log(`  Încerc acum modelul: ${resolvedModel}`)
    }
  }
  throw lastErr
}

async function openrouterOnce({ system, text, images = [] }) {
  const model = resolvedModel || (await resolveModel())
  const content = [{ type: 'text', text }]
  for (const img of images.slice(0, 4)) {
    if (typeof img === 'string' && img.startsWith('data:image/')) content.push({ type: 'image_url', image_url: { url: img } })
  }
  const send = (withJsonMode) =>
    fetch(`${OR_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'PreLaunch',
      },
      body: JSON.stringify({
        model,
        messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }],
        temperature: 0.6,
        ...(withJsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    })
  let r = await send(true)
  let body = await r.json().catch(() => ({}))
  // Unele modele nu acceptă response_format: reîncercăm fără el.
  if ((!r.ok || body.error) && /response_format|json/i.test(body?.error?.message || '')) {
    r = await send(false)
    body = await r.json().catch(() => ({}))
  }
  if (!r.ok || body.error) {
    const msg = body?.error?.message || `răspuns ${r.status}`
    const hint = /model/i.test(msg) && /(not|invalid|exist)/i.test(msg) ? ` Verifică OPENROUTER_MODEL în .env (acum: ${model}).` : ''
    const e = new Error(`OpenRouter: ${msg.replace(/\.+$/, '')}.${hint}${/user not found|no auth|invalid.*key|401/i.test(msg) ? ' Cheia OPENROUTER_API_KEY din .env nu este validă: fă una nouă pe openrouter.ai/keys.' : ''}`)
    e.status = 502
    throw e
  }
  const out = body.choices?.[0]?.message?.content ?? ''
  if (!out) {
    const e = new Error('OpenRouter a returnat un răspuns gol. Încearcă din nou.')
    e.status = 502
    throw e
  }
  return parseJson(out)
}

/* ---------- Gemini (rezervă) ---------- */

async function gemini(args) {
  return PROVIDER === 'openrouter' ? openrouterCall(args) : geminiCall(args)
}

// Un apel către Gemini. images = data URL-uri JPEG (data:image/jpeg;base64,...).
async function geminiCall({ system, text, images = [] }) {
  if (!GEMINI_API_KEY) {
    const e = new Error('Lipsește GEMINI_API_KEY în fișierul .env')
    e.status = 500
    throw e
  }
  const parts = [{ text }]
  for (const img of images.slice(0, 4)) {
    const m = typeof img === 'string' && img.match(/^data:(image\/[a-z]+);base64,(.+)$/)
    if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } })
  }
  const r = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.6, responseMimeType: 'application/json' },
    }),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok || body.error) {
    const e = new Error(`Gemini: ${body?.error?.message || `răspuns ${r.status}`}`)
    e.status = 502
    throw e
  }
  const cand = body.candidates?.[0]
  const out = (cand?.content?.parts || []).map((p) => p.text || '').join('')
  if (!out) {
    const why = cand?.finishReason || body.promptFeedback?.blockReason || 'răspuns gol'
    const e = new Error(`Gemini nu a returnat text (${why}). Încearcă din nou sau reformulează descrierea.`)
    e.status = 502
    throw e
  }
  return parseJson(out)
}

// Corecturi de limbă aplicate pe TOT ce vine de la AI (forma corectă în română e „cofeină”, nu „cafeină”).
function fixRo(str) {
  return String(str)
    .replace(/\bcafein/g, 'cofein')
    .replace(/\bCafein/g, 'Cofein')
    .replace(/\bCAFEIN/g, 'COFEIN')
}

function fixDeep(v) {
  if (typeof v === 'string') return fixRo(v)
  if (Array.isArray(v)) return v.map(fixDeep)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fixDeep(x)]))
  return v
}

function parseJson(text) {
  return fixDeep(parseJsonRaw(text))
}

function parseJsonRaw(text) {
  const s = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try {
    return JSON.parse(s)
  } catch {
    const a = s.indexOf('{')
    const b = s.lastIndexOf('}')
    if (a >= 0 && b > a) return JSON.parse(s.slice(a, b + 1))
    throw new Error('Modelul nu a răspuns cu JSON valid. Încearcă din nou.')
  }
}

// Scorul se calculează în cod, nu se ia de la model:
//   100 − Σ penalizări probleme (scăzută 5, medie 10, ridicată 15) − penalizare de sentiment (max 20)
// Penalizarea de sentiment = 45 × (cota negative + 0,5 × ironice − 15%), între 0 și 30, ca scorul să reflecte emoțiile publicului.
const PENALTY = { scăzută: 5, medie: 10, ridicată: 15 }

function normalize(raw) {
  const probleme = (Array.isArray(raw.probleme_depistate) ? raw.probleme_depistate : []).map((p, i) => ({
    id: i + 1,
    titlu: String(p.titlu || p.categorie || `Problema ${i + 1}`),
    categorie: String(p.categorie || 'Altele'),
    gravitate: ['scăzută', 'medie', 'ridicată'].includes(p.gravitate) ? p.gravitate : 'medie',
    descriere: String(p.descriere || ''),
    penalizare: 0,
    citate_relevante: Array.isArray(p.citate_relevante) ? p.citate_relevante.map(String) : [],
  }))
  const comentarii = (Array.isArray(raw.comentarii_simulate) ? raw.comentarii_simulate : []).map((c) => ({
    autor_fictiv: String(c.autor_fictiv || 'Anonim'),
    arhetip: String(c.arhetip || ''),
    comentariu: String(c.comentariu || ''),
    sentiment: ['pozitiv', 'neutru', 'negativ', 'ironic'].includes(c.sentiment) ? c.sentiment : 'neutru',
    aprecieri_simulate: Math.max(0, Math.round(Number(c.aprecieri_simulate) || 0)),
  }))
  for (const p of probleme) p.penalizare = PENALTY[p.gravitate]
  const n = probleme.length
  const penProbleme = probleme.reduce((a, p) => a + p.penalizare, 0)
  const neg = comentarii.filter((c) => c.sentiment === 'negativ').length
  const iro = comentarii.filter((c) => c.sentiment === 'ironic').length
  // Ignorăm primii 15% de comentarii negative (trolii există mereu); peste prag, penalizarea crește până la 20.
  const share = comentarii.length ? (neg + 0.5 * iro) / comentarii.length : 0
  const penSentiment = Math.min(30, Math.round(45 * Math.max(0, share - 0.15)))
  return {
    scor_eficienta: Math.max(0, 100 - penProbleme - penSentiment),
    puncte_pierdute: Math.min(100, penProbleme + penSentiment),
    penalizare_probleme: penProbleme,
    penalizare_sentiment: penSentiment,
    numar_probleme_identificate: n,
    sumar_executiv: String(raw.sumar_executiv || ''),
    probleme_depistate: probleme,
    comentarii_simulate: comentarii,
    recomandari_optimizare: (Array.isArray(raw.recomandari_optimizare) ? raw.recomandari_optimizare : []).map(String),
    varianta_corectata: String(raw.varianta_corectata || ''),
  }
}

// Al doilea pas: un „auditor” strict verifică fiecare problemă și o păstrează doar dacă e reală.
// Poate elimina o problemă sau îi poate scădea gravitatea, dar niciodată nu o crește.
async function auditProblems(raw, description) {
  const list = Array.isArray(raw.probleme_depistate) ? raw.probleme_depistate : []
  if (!list.length) return
  const order = { scăzută: 0, medie: 1, ridicată: 2 }
  try {
    const comments = (Array.isArray(raw.comentarii_simulate) ? raw.comentarii_simulate : []).map((c) => `${c.sentiment}: ${c.comentariu}`)
    const out = await gemini({
      text: `Ești director de marketing cu experiență și verifici raportul unui analist junior, care tinde să exagereze.
Reclama: """${description}"""
Comentariile simulate ale publicului: ${JSON.stringify(comments)}
Problemele raportate: ${JSON.stringify(list.map((p, i) => ({ id: i, titlu: p.titlu, gravitate: p.gravitate, descriere: p.descriere })))}

Pentru FIECARE problemă decide:
- "elimina" dacă e o preferință de gust, un detaliu minor de execuție, o glumă a trolilor, sau nu e susținută de mai mulți comentatori;
- altfel "pastreaza", cu gravitatea corectă (scăzută / medie / ridicată). Gravitatea ridicată doar dacă reclama jignește, induce în eroare sau îi face pe mulți să nu cumpere.
Întrebarea de control: „Aș respinge sau aș modifica reclama din cauza asta înainte de lansare?” Dacă nu, elimin-o.
Răspunde DOAR cu JSON: {"decizii":[{"id":0,"decizie":"pastreaza|elimina","gravitate":"scăzută|medie|ridicată"}]}`,
    })
    const dec = Array.isArray(out.decizii) ? out.decizii : []
    const kept = []
    const levels = ['scăzută', 'medie', 'ridicată']
    list.forEach((p, i) => {
      const d = dec.find((x) => Number(x.id) === i)
      // Dovezi = câte comentarii simulate susțin problema. Cu 2+ dovezi, problema e reală:
      // nu poate fi ștearsă și poate coborî cel mult un nivel de gravitate.
      const evidence = Array.isArray(p.citate_relevante) ? p.citate_relevante.length : 0
      const strong = evidence >= 2
      if (d && d.decizie === 'elimina' && !strong) return
      const cur = order[p.gravitate]
      const want = d ? order[d.gravitate] : undefined
      if (cur !== undefined && want !== undefined && want < cur) p.gravitate = levels[strong ? Math.max(want, cur - 1) : want]
      kept.push(p)
    })
    console.log(`  Auditor: ${list.length} probleme raportate -> ${kept.length} păstrate`)
    raw.probleme_depistate = kept
  } catch (e) {
    console.log(`  Auditorul nu a răspuns (${String(e.message).slice(0, 80)}); păstrez problemele inițiale.`)
  }
}

app.post('/api/simulate', async (req, res) => {
  try {
    const { description = '', offer = '', company = {}, images = [], previous = null } = req.body || {}
    if (String(description).trim().length < 5) return res.status(400).json({ error: 'Descrierea reclamei lipsește.' })

    let trending = null
    let calibration = []
    try {
      trending = await getTrending(false)
      calibration = styleSample(trending, 40)
    } catch {
      trending = memoryCache // dacă YouTube pică, folosim ce avem în cache (sau nimic)
      calibration = styleSample(trending, 40)
    }

    const userText = [
      `Firma: ${company.name || 'nespecificată'} · industrie: ${company.industry || 'nespecificată'} · categoria de vârstă a publicului: ${company.ageGroup || 'toate'} ani.`,
      'Platforma: YouTube (reclamă video).',
      `Descrierea reclamei: """${description}"""`,
      offer ? `Oferta / context: """${offer}"""` : '',
      calibration.length
        ? `Comentarii REALE din Trending YouTube România azi (doar pentru stil, ton și argou; nu le copia):\n${calibration.map((c) => `- ${c}`).join('\n')}`
        : 'Nu avem comentarii reale sincronizate; folosește cunoașterea ta despre comentatorii români de pe YouTube.',
      `Comentariile simulate trebuie să fie ale unor oameni din categoria de vârstă ${company.ageGroup || 'indicată'}, cu câteva excepții.`,
      previous && Array.isArray(previous.probleme)
        ? `ATENȚIE: aceasta este o VARIANTĂ CORECTATĂ a unei reclame testate anterior.
Varianta inițială: """${String(previous.description || '').slice(0, 1500)}"""
Problemele găsite atunci: ${JSON.stringify(previous.probleme.map((p) => ({ titlu: p.titlu, gravitate: p.gravitate })))}
Evaluează cu EXACT același standard de gravitate ca la varianta inițială. Pentru fiecare problemă veche: dacă a fost rezolvată, nu o mai trece; dacă există încă, păstreaz-o cu aceeași gravitate. Adaugă probleme noi doar dacă sunt reale și introduse de noua variantă, nu detalii mărunte care existau și înainte.`
        : '',
      SCHEMA_HINT,
    ]
      .filter(Boolean)
      .join('\n\n')

    const raw = await gemini({ system: SYSTEM_PROMPT, text: userText, images })
    await auditProblems(raw, description)
    const result = normalize(raw)
    res.json({
      ...result,
      calibrare: { comentarii_reale_folosite: calibration.length, sincronizat_la: trending?.fetchedAt || null },
    })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
})

/* ------------------------------------------------------------------ */
/* 3. Automatizări: adaptare pe formate YouTube + raport              */
/* ------------------------------------------------------------------ */

app.post('/api/adapt', async (req, res) => {
  try {
    const { description = '', company = {} } = req.body || {}
    const out = await gemini({
      text: `Adaptează această reclamă video a firmei ${company.name || ''} pentru 3 formate YouTube, păstrând mesajul și oferta:
"""${description}"""
- bumper: reclamă de 6 secunde care nu se poate sări: ce se vede și ce se spune, maxim 2 propoziții
- shorts: un YouTube Short vertical de 15-30 de secunde: textul de pe ecran + prima frază care oprește scroll-ul în 3 secunde, plus ideea de video
- descriere: titlul și descrierea video-ului reclamei pe canalul firmei (maxim 3 propoziții, 3 hashtag-uri)
Răspunde DOAR cu JSON: {"bumper":"...","shorts":{"text":"...","idee_video":"..."},"descriere":{"titlu":"...","text":"..."}}`,
    })
    res.json({
      bumper: String(out.bumper || ''),
      shorts: { text: String(out.shorts?.text || ''), idee_video: String(out.shorts?.idee_video || '') },
      descriere: { titlu: String(out.descriere?.titlu || ''), text: String(out.descriere?.text || '') },
    })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
})

/* ------------------------------------------------------------------ */
/* 3b. Generarea imaginii reclamei corectate (OpenRouter, model de imagine) */
/* ------------------------------------------------------------------ */

const OPENROUTER_IMAGE_MODEL = process.env.OPENROUTER_IMAGE_MODEL || 'auto'
let imageCandidates = null
const badImageModels = new Set()

// Alege modelele care pot GENERA imagini și, ideal, pot primi și imaginea originală (ca s-o redeseneze).
async function imageModels() {
  if (imageCandidates) return imageCandidates.filter((m) => !badImageModels.has(m))
  let list = []
  try {
    const r = await fetch(`${OR_BASE}/models?output_modalities=image`)
    list = (await r.json()).data || []
  } catch {
    list = []
  }
  const outImg = (m) => (m.architecture?.output_modalities || []).includes('image')
  const inImg = (m) => (m.architecture?.input_modalities || []).includes('image')
  const price = (m) => Number(m.pricing?.prompt || 0) + Number(m.pricing?.completion || 0) + Number(m.pricing?.image || 0)
  let usable = list.filter((m) => outImg(m) && !String(m.id).includes(':'))
  if (OPENROUTER_IMAGE_MODEL !== 'auto') {
    const wanted = usable.filter((m) => m.id === OPENROUTER_IMAGE_MODEL)
    imageCandidates = [OPENROUTER_IMAGE_MODEL, ...usable.filter((m) => m.id !== OPENROUTER_IMAGE_MODEL).map((m) => m.id)]
    if (!wanted.length) console.log(`  Modelul de imagine "${OPENROUTER_IMAGE_MODEL}" nu apare în listă, îl încerc oricum.`)
  } else {
    // Preferăm modelele care primesc și imagine (pot edita reclama originală) și familiile Gemini / GPT image,
    // care scriu mai bine textul pe imagine; apoi cele mai ieftine.
    usable.sort((a, b) => {
      const sa = (inImg(a) ? 0 : 10) + (/gemini|gpt.*image/i.test(a.id) ? 0 : 5)
      const sb = (inImg(b) ? 0 : 10) + (/gemini|gpt.*image/i.test(b.id) ? 0 : 5)
      return sa - sb || price(a) - price(b)
    })
    imageCandidates = usable.map((m) => m.id)
    if (!imageCandidates.length) imageCandidates = ['google/gemini-2.5-flash-image']
  }
  console.log(`  Modele de imagine disponibile (în ordinea încercării): ${imageCandidates.slice(0, 4).join(', ')}`)
  imageCandidates.modalities = Object.fromEntries(list.map((m) => [m.id, (m.architecture?.output_modalities || []).includes('text')]))
  return imageCandidates.filter((m) => !badImageModels.has(m))
}

async function generateImageOnce(model, prompt, original) {
  const content = [{ type: 'text', text: prompt }]
  if (original) content.push({ type: 'image_url', image_url: { url: original } })
  const alsoText = imageCandidates?.modalities?.[model] !== false
  const r = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3001',
      'X-Title': 'PreLaunch',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      modalities: alsoText ? ['image', 'text'] : ['image'],
      image_config: { aspect_ratio: '16:9' },
    }),
  })
  const body = await r.json().catch(() => ({}))
  if (!r.ok || body.error) throw new Error(body?.error?.message || `răspuns ${r.status}`)
  const msg = body.choices?.[0]?.message || {}
  const img = (msg.images || [])[0]
  const url = img?.image_url?.url || img?.imageUrl?.url
  if (!url) throw new Error('modelul nu a returnat nicio imagine')
  return url
}

app.post('/api/generate-image', async (req, res) => {
  try {
    if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'Generarea imaginii are nevoie de OPENROUTER_API_KEY în .env' })
    const { description = '', corrected = '', problems = [], image = null, company = {} } = req.body || {}
    if (!corrected) return res.status(400).json({ error: 'Lipsește varianta corectată.' })

    // Pasul 1: modelul de text scrie textele exacte de pe reclamă (scurte, în română corectă) și instrucțiunea vizuală.
    const plan = await gemini({
      text: `Pregătești redesenarea unei reclame (imagine statică, 16:9) pentru firma ${company.name || ''} (${company.industry || ''}), public ${company.ageGroup || ''} ani.
Reclama inițială: """${description}"""
Probleme de rezolvat: ${JSON.stringify(problems.map((p) => `${p.titlu}: ${p.descriere}`))}
Varianta corectată (ideea nouă): """${corrected}"""
Scrie textele care vor apărea PE imagine: scurte (titlu max 6 cuvinte, subtitlu max 8 cuvinte, buton max 4 cuvinte), în română corectă, fără nimic care să reproducă problemele de mai sus.
Descrie apoi în engleză, pe scurt, ce se vede în imagine (produs, oameni, decor, culori, compoziție), păstrând produsul și identitatea brandului.
Răspunde DOAR cu JSON: {"titlu":"...","subtitlu":"...","buton":"...","scena":"..."}`,
    })
    const titlu = String(plan.titlu || '').trim()
    const subtitlu = String(plan.subtitlu || '').trim()
    const buton = String(plan.buton || '').trim()

    const prompt = `${image ? 'Redesign the attached advertisement image.' : 'Create an advertisement image.'} Brand: ${company.name || 'the brand'}. Format: 16:9 YouTube ad frame, clean professional design.
${image ? 'Keep the same product, brand name, logo style and color palette as the attached ad, but change the message and scene as described.' : ''}
Scene: ${plan.scena || corrected}
Render EXACTLY this Romanian text on the image, spelled exactly as written including diacritics (ă â î ș ț), large and readable, and no other text except the brand name and a small legal line:
- Headline: "${titlu}"
- Subheadline: "${subtitlu}"
- Button: "${buton}"
Important spelling: the Romanian word is "cofeină" (NOT "cafeină"); if a caffeine warning appears, write exactly "Conține cofeină".
Do not include any of these problems: ${problems.map((p) => p.titlu).join('; ') || 'none'}.`

    // Pasul 2: modelul de imagine; dacă unul nu merge, încercăm următorul.
    let lastErr = null
    for (const model of (await imageModels()).slice(0, 4)) {
      try {
        const url = await generateImageOnce(model, prompt, image)
        console.log(`  Imagine generată cu ${model}`)
        return res.json({ image: url, model, texte: { titlu, subtitlu, buton } })
      } catch (e) {
        lastErr = e
        console.log(`  Modelul de imagine ${model} nu merge (${String(e.message).slice(0, 120)}). Încerc altul...`)
        badImageModels.add(model)
      }
    }
    res.status(502).json({ error: `Nu am putut genera imaginea: ${lastErr?.message || 'niciun model de imagine disponibil'}` })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
})

app.post('/api/report', async (req, res) => {
  try {
    const { company = {}, before, after } = req.body || {}
    if (!before) return res.status(400).json({ error: 'Lipsește rezultatul simulării.' })
    const brief = (r) =>
      r && {
        scor: r.scor_eficienta,
        probleme: r.probleme_depistate.map((p) => `${p.titlu} (${p.gravitate})`),
        sumar: r.sumar_executiv,
      }
    const out = await gemini({
      text: `Scrie un raport scurt (maxim 10 rânduri, text simplu, fără markdown) pentru managerul de marketing al firmei ${company.name || ''}, despre testarea unei reclame YouTube.
Varianta inițială: ${JSON.stringify(brief(before))}
${after ? `Varianta corectată: ${JSON.stringify(brief(after))}` : 'Varianta corectată nu a fost încă testată.'}
Începe cu "Verdict:" (postăm / nu postăm / postăm varianta corectată), apoi cifrele cheie, apoi recomandarea.
Răspunde DOAR cu JSON: {"raport":"..."}`,
    })
    res.json({ raport: String(out.raport || '') })
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message })
  }
})

/* ------------------------------------------------------------------ */
/* 4. Servește frontend-ul construit (npm start)                      */
/* ------------------------------------------------------------------ */

const DIST = path.join(ROOT, 'dist')
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

// Serverul nu se oprește la o eroare neașteptată: o scrie în fereastră și continuă.
process.on('uncaughtException', (e) => console.error('  [EROARE neașteptată, serverul continuă]', e?.message || e))
process.on('unhandledRejection', (e) => console.error('  [EROARE neașteptată, serverul continuă]', e?.message || e))

const server = app.listen(PORT, () => {
  console.log(`PreLaunch rulează pe http://localhost:${PORT}`)
  if (PROVIDER === 'openrouter') {
    console.log(`  AI: OpenRouter · model cerut: ${OPENROUTER_MODEL}`)
    resolveModel()
  } else console.log(`  AI: Gemini ${GEMINI_API_KEY ? '(cheie setată)' : '(LIPSEȘTE CHEIA)'} · model: ${GEMINI_MODEL}`)
  console.log(`  YouTube: ${YOUTUBE_API_KEY ? 'cheie setată' : 'LIPSEȘTE CHEIA'}`)
})

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`  [EROARE] Portul ${PORT} e deja folosit: probabil PreLaunch rulează deja în altă fereastră. Închide-o și pornește din nou.`)
  else console.error('  [EROARE server]', e.message)
  process.exit(1)
})
