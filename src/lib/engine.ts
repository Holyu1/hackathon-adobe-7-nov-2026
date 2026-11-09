/* Tipurile și apelurile către backend (server/index.js). Frontend-ul nu vede nicio cheie API. */

export type Company = { name: string; industry: string; ageGroup: string; tone: string }

export type Problem = {
  id: number
  titlu: string
  categorie: string
  gravitate: 'scăzută' | 'medie' | 'ridicată'
  descriere: string
  penalizare: number
  citate_relevante: string[]
}

export type SimComment = {
  autor_fictiv: string
  arhetip: string
  comentariu: string
  sentiment: 'pozitiv' | 'neutru' | 'negativ' | 'ironic'
  aprecieri_simulate: number
}

export type SimResult = {
  scor_eficienta: number
  puncte_pierdute: number
  penalizare_probleme: number
  penalizare_sentiment: number
  numar_probleme_identificate: number
  sumar_executiv: string
  probleme_depistate: Problem[]
  comentarii_simulate: SimComment[]
  recomandari_optimizare: string[]
  varianta_corectata: string
  calibrare?: { comentarii_reale_folosite: number; sincronizat_la: number | null }
  description: string // descrierea testată (adăugată în frontend)
}

export type Adaptations = {
  bumper: string
  shorts: { text: string; idee_video: string }
  descriere: { titlu: string; text: string }
}

export type TrendingStatus = {
  synced: boolean
  fetchedAt?: number
  fresh?: boolean
  videoCount?: number
  commentCount?: number
  videosWithoutComments?: number
  exampleVideos?: { id: string; title: string; channel: string }[]
  sample?: string[]
  error?: string
}

export type ServerStatus = { aiKey: boolean; model: string | null; youtubeKey: boolean; trending: TrendingStatus }

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let r: Response
  try {
    r = await fetch(url, init)
  } catch {
    throw new Error('Backend-ul nu răspunde. Pornește serverul cu „npm start” (sau „npm run dev”).')
  }
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body?.error || `Eroare ${r.status}`)
  return body as T
}

const post = <T,>(url: string, data: unknown) =>
  call<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })

export const getStatus = () => call<ServerStatus>('/api/status')

export const syncTrending = (refresh: boolean) =>
  call<TrendingStatus>(`/api/youtube/trending-comments${refresh ? '?refresh=1' : ''}`).catch((e: Error) => ({
    synced: false,
    error: e.message,
  }) as TrendingStatus)

export async function simulate(
  description: string,
  offer: string,
  company: Company,
  images: string[],
  previous?: SimResult | null,
): Promise<SimResult> {
  const prev = previous ? { description: previous.description, probleme: previous.probleme_depistate } : null
  const r = await post<Omit<SimResult, 'description'>>('/api/simulate', { description, offer, company, images, previous: prev })
  return { ...r, description }
}

export const adapt = (description: string, company: Company) => post<Adaptations>('/api/adapt', { description, company })

export const report = (company: Company, before: SimResult, after: SimResult | null) =>
  post<{ raport: string }>('/api/report', { company, before, after }).then((r) => r.raport)

/* ---------- Media: imagini și cadre din video, ca data URL JPEG ---------- */

export async function framesFromVideo(url: string, count = 3): Promise<string[]> {
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.src = url
  await new Promise<void>((res, rej) => {
    v.addEventListener('loadeddata', () => res(), { once: true })
    v.addEventListener('error', () => rej(new Error('Nu pot citi clipul video.')), { once: true })
  })
  const d = v.duration && Number.isFinite(v.duration) ? v.duration : 3
  const out: string[] = []
  for (let i = 1; i <= count; i++) {
    v.currentTime = (d * i) / (count + 1)
    await new Promise<void>((res) => v.addEventListener('seeked', () => res(), { once: true }))
    const j = toJpeg(v, v.videoWidth, v.videoHeight)
    if (j) out.push(j)
  }
  return out
}

export async function imageToDataUrl(file: Blob): Promise<string[]> {
  const bmp = await createImageBitmap(file)
  const j = toJpeg(bmp, bmp.width, bmp.height)
  return j ? [j] : []
}

function toJpeg(src: CanvasImageSource, w: number, h: number): string | null {
  if (!w || !h) return null
  const scale = Math.min(1, 1024 / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * scale)
  c.height = Math.round(h * scale)
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', 0.85)
}

export type GeneratedAd = { image: string; model: string; texte: { titlu: string; subtitlu: string; buton: string } }

export const generateImage = (before: SimResult, image: string | null, company: Company) =>
  post<GeneratedAd>('/api/generate-image', {
    description: before.description,
    corrected: before.varianta_corectata,
    problems: before.probleme_depistate.map((p) => ({ titlu: p.titlu, descriere: p.descriere })),
    image,
    company,
  })
