import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  UploadCloud, Play, Loader2, CheckCircle2, Circle, X, Wand2, FileText, ImagePlus,
  AlertCircle, History, Building2, MonitorPlay, RefreshCw,
} from 'lucide-react'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Progress, Textarea } from '@/components/ui'
import { CopyButton, Feed, Problems, ScoreCard, verdictTone } from '@/components/Results'
import { cn, safeGet, safeSet } from '@/lib/utils'
import {
  framesFromVideo, generateImage, getStatus, imageToDataUrl, simulate, syncTrending,
  type Company, type GeneratedAd, type ServerStatus, type SimResult, type TrendingStatus,
} from '@/lib/engine'

const schema = z.object({
  copy: z.string().min(5, 'Descrie reclama (minim 5 caractere)'),
})
type Form = z.infer<typeof schema>

const STEPS = [
  'Încarc comentariile reale din Trending YouTube România',
  'Trimit reclama (descriere + imagini) la model',
  'Simulez 15–25 de comentarii românești',
  'Verific problemele a doua oară (auditor) și calculez scorul',
]

const ACCEPT = 'image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime'
const OK_TYPE = /^(image\/(png|jpe?g|webp)|video\/(mp4|webm|quicktime))$/

type Saved = { before: SimResult }

export default function VerifyPage({
  company,
  onEditCompany,
  initialFile,
  onFileUsed,
}: {
  company: Company
  onEditCompany: () => void
  initialFile: File | null
  onFileUsed: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [serverDown, setServerDown] = useState(false)
  const [yt, setYt] = useState<TrendingStatus | null>(null)
  const [syncing, setSyncing] = useState(false)

  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle')
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [before, setBefore] = useState<SimResult | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState<GeneratedAd | null>(null)
  const imagesRef = useRef<string[]>([])
  const resultsRef = useRef<HTMLDivElement>(null)
  const [hasSaved, setHasSaved] = useState(() => !!safeGet<Saved | null>('pl-last-v2', null))

  const { register, handleSubmit, watch, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { copy: '' },
  })
  const copy = watch('copy')
  const ready = !!file && (copy?.trim().length ?? 0) >= 5

  useEffect(() => {
    getStatus()
      .then((s) => {
        setStatus(s)
        setYt(s.trending)
      })
      .catch(() => setServerDown(true))
  }, [])

  const pick = async (f: File | undefined | null) => {
    if (!f) return
    if (!OK_TYPE.test(f.type)) {
      setError('Format neacceptat. Folosește JPG, PNG, WEBP, MP4, WEBM sau MOV.')
      return
    }
    setError(null)
    if (preview) URL.revokeObjectURL(preview)
    const url = URL.createObjectURL(f)
    setFile(f)
    setPreview(url)
    try {
      imagesRef.current = f.type.startsWith('video') ? await framesFromVideo(url, 3) : await imageToDataUrl(f)
    } catch (e) {
      imagesRef.current = []
      setError(`${(e as Error).message} Analiza va folosi doar descrierea.`)
    }
  }

  useEffect(() => {
    if (initialFile) {
      pick(initialFile)
      onFileUsed()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile])

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    imagesRef.current = []
  }

  const doSync = async () => {
    setSyncing(true)
    const r = await syncTrending(true)
    setYt(r)
    setSyncing(false)
  }

  // Pașii de progres avansează cât timp așteptăm răspunsul serverului (un singur apel).
  const runWithSteps = async <T,>(fn: () => Promise<T>) => {
    setStep(0)
    const timers = [1500, 5000, 14000].map((ms, i) => setTimeout(() => setStep(i + 1), ms))
    try {
      return await fn()
    } finally {
      timers.forEach(clearTimeout)
    }
  }

  const start = handleSubmit(async (v) => {
    if (!file) return
    setError(null)
    setPhase('running')
    setBefore(null)
    setGenerated(null)
    try {
      const res = await runWithSteps(() => simulate(v.copy, '', company, imagesRef.current))
      setBefore(res)
      setPhase('done')
      safeSet('pl-last-v2', { before: res } satisfies Saved)
      setHasSaved(true)
      if (res.calibrare?.sincronizat_la) setYt((y) => ({ ...(y ?? { synced: true }), synced: true, fetchedAt: res.calibrare!.sincronizat_la! }))
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (e) {
      setError((e as Error).message)
      setPhase('idle')
    }
  })

  // Generează imaginea reclamei corectate, pornind de la reclama originală și de la problemele găsite.
  const doGenerate = async () => {
    if (!before?.varianta_corectata) return
    setGenerating(true)
    setGenerated(null) // rezumatul se resetează și se reface din reclama nouă
    setError(null)
    try {
      setGenerated(await generateImage(before, imagesRef.current[0] ?? null, company))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const loadSaved = () => {
    const s = safeGet<Saved | null>('pl-last-v2', null)
    if (!s) return
    setBefore(s.before)
    setGenerated(null)
    setPhase('done')
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const companyMissing = !company.name || !company.ageGroup
  const keyMissing = status && !status.aiKey

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Verificare reclamă</h1>
          <p className="text-sm text-slate-500">Încarcă reclama, apasă Start și vezi cum ar reacționa publicul din România.</p>
        </div>
        {hasSaved && phase !== 'running' && (
          <Button variant="outline" size="sm" onClick={loadSaved}>
            <History className="h-4 w-4" /> Încarcă ultima simulare salvată
          </Button>
        )}
      </div>

      {serverDown && (
        <Notice tone="red">
          Backend-ul nu rulează. Deschide un terminal în folderul proiectului și pornește-l cu <code>npm start</code>, apoi
          reîncarcă pagina.
        </Notice>
      )}
      {keyMissing && (
        <Notice tone="amber">
          Serverul rulează, dar lipsește cheia AI (OPENROUTER_API_KEY sau GEMINI_API_KEY) din fișierul{' '}
          <code>.env</code>. Completeaz-o și repornește serverul.
        </Notice>
      )}
      {companyMissing && (
        <Notice tone="slate">
          <Building2 className="mr-1 inline h-4 w-4" /> Profilul firmei nu e complet (nume, categorie de vârstă). Analiza merge și
          fără, dar e mai bună cu el.{' '}
          <button className="cursor-pointer font-medium text-brand-600 underline" onClick={onEditCompany}>
            Completează-l
          </button>
        </Notice>
      )}

      <form onSubmit={start} className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Adaugă reclama</CardTitle>
            <CardDescription>Fișierul media și descrierea reclamei sunt obligatorii.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!preview ? (
              <label
                onDragOver={(e) => {
                  e.preventDefault()
                  setDrag(true)
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDrag(false)
                  pick(e.dataTransfer.files[0])
                }}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition',
                  drag ? 'border-brand-500 bg-brand-50 dark:bg-brand-700/10' : 'border-slate-300 hover:border-brand-500 dark:border-slate-700',
                )}
              >
                <UploadCloud className="mb-3 h-10 w-10 text-slate-400" />
                <span className="font-medium">Trage imaginea sau clipul aici</span>
                <span className="mt-1 text-xs text-slate-500">sau apasă ca să alegi · JPG, PNG, WEBP, MP4, WEBM, MOV</span>
                <input type="file" accept={ACCEPT} className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
              </label>
            ) : (
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950">
                {file?.type.startsWith('video') ? (
                  <video src={preview} controls className="mx-auto max-h-80" />
                ) : (
                  <img src={preview} alt="Previzualizare reclamă" className="mx-auto max-h-80 object-contain" />
                )}
                <button type="button" onClick={clearFile} className="absolute right-2 top-2 cursor-pointer rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80">
                  <X className="h-4 w-4" />
                </button>
                <div className="truncate border-t border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  {file?.name} {file?.type.startsWith('video') && '· trimitem 3 cadre din clip'}
                </div>
              </div>
            )}
            <div>
              <Label>Descrierea reclamei</Label>
              <Textarea
                placeholder="ex: Un student doarme peste cărți, apoi bea Volt și pleacă la petrecere. Vocea din final: „Învață mai puțin, petrece mai mult. Sesiunea e pentru fraieri.”"
                {...register('copy')}
              />
              {formState.errors.copy && <p className="mt-1 text-xs text-red-600">{formState.errors.copy.message}</p>}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">Platforma:</span> <Badge tone="red">YouTube</Badge>
              {company.ageGroup && <Badge tone="slate">public {company.ageGroup} ani</Badge>}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MonitorPlay className="h-4 w-4 text-red-600" /> Date YouTube Trending România
              </CardTitle>
              <CardDescription>Comentariile reale după care se calibrează stilul publicului simulat.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {yt?.synced ? (
                <div className="space-y-1">
                  <div>
                    <b>{yt.commentCount ?? '—'}</b> comentarii din <b>{yt.videoCount ?? '—'}</b> videoclipuri
                  </div>
                  {yt.fetchedAt && (
                    <div className="text-xs text-slate-500">
                      sincronizat la {new Date(yt.fetchedAt).toLocaleString('ro-RO')} {yt.fresh === false && '· mai vechi de 12h'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-slate-500">Nesincronizat încă. Se sincronizează automat la prima verificare.</div>
              )}
              {yt?.error && <div className="text-xs text-red-600">{yt.error}</div>}
              <Button type="button" variant="outline" size="sm" onClick={doSync} disabled={syncing || serverDown}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sincronizează acum
              </Button>
              {yt?.sample && yt.sample.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-500">Exemple de comentarii reale</summary>
                  <ul className="mt-2 space-y-1 text-slate-600 dark:text-slate-400">
                    {yt.sample.slice(0, 6).map((s) => (
                      <li key={s} className="truncate">
                        „{s}”
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 pt-5">
              <Button type="submit" size="lg" className="w-full" disabled={!ready || phase === 'running' || serverDown}>
                {phase === 'running' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                {phase === 'running' ? 'Simulez…' : 'Start verificare'}
              </Button>
              {!ready && <p className="text-center text-xs text-slate-500">Adaugă fișierul și descrierea ca să pornești.</p>}
              {phase !== 'idle' && (
                <div className="space-y-2 pt-1">
                  <Progress value={phase === 'done' ? 100 : ((step + 0.5) / STEPS.length) * 100} />
                  {STEPS.map((s, i) => {
                    const doneStep = phase === 'done' || i < step
                    const active = phase === 'running' && i === step
                    return (
                      <div key={s} className={cn('flex items-center gap-2 text-sm', doneStep ? 'text-slate-700 dark:text-slate-300' : active ? 'font-medium' : 'text-slate-400')}>
                        {doneStep ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : active ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" /> : <Circle className="h-4 w-4 shrink-0" />}
                        {s}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </form>

      {error && <Notice tone="red">{error}</Notice>}

      {phase === 'done' && before && (
        <div ref={resultsRef} className="scroll-mt-6 space-y-6">
          <ScoreCard r={before} />
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Pe ecrane mari, comentariile ocupă toată înălțimea coloanei cu probleme și se derulează în interior. */}
            <div className="relative lg:min-h-[640px]">
              <Feed comments={before.comentarii_simulate} className="lg:absolute lg:inset-0 lg:max-h-none" />
            </div>
            <Problems problems={before.probleme_depistate} />
          </div>

          {before.varianta_corectata && (
            <Card className="border-brand-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-brand-600" /> Reclama corectată
                </CardTitle>
                <CardDescription>Ideea rescrisă ca să rezolve problemele de mai sus. AI-ul o poate desena ca reclamă nouă.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-brand-50 p-4 text-base font-medium dark:bg-brand-700/15">{before.varianta_corectata}</div>
                <Button onClick={doGenerate} disabled={generating || serverDown}>
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {generating ? 'Desenez reclama corectată… (10–40 secunde)' : generated ? 'Generează altă variantă' : 'Generează reclama corectată'}
                </Button>
                {generated && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {preview && !file?.type.startsWith('video') && (
                      <figure className="space-y-2">
                        <figcaption className="text-xs font-semibold uppercase tracking-wide text-slate-500">Înainte</figcaption>
                        <img src={preview} alt="Reclama inițială" className="w-full rounded-lg border border-slate-200 dark:border-slate-800" />
                      </figure>
                    )}
                    <figure className={cn('space-y-2', (!preview || file?.type.startsWith('video')) && 'md:col-span-2')}>
                      <figcaption className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-emerald-600">
                        După corectură
                        <a href={generated.image} download="reclama-corectata.png" className="normal-case text-brand-600 underline">
                          Descarcă imaginea
                        </a>
                      </figcaption>
                      <img src={generated.image} alt="Reclama corectată generată de AI" className="w-full rounded-lg border border-emerald-400" />
                      <p className="text-xs text-slate-500">
                        Text cerut pe imagine: „{generated.texte.titlu}” · „{generated.texte.subtitlu}” · „{generated.texte.buton}”. Generat cu {generated.model}.
                        Verifică diacriticele: modelele de imagine le pot scrie greșit.
                      </p>
                    </figure>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <TeamSummary before={before} generated={generated} generating={generating} />
        </div>
      )}
    </div>
  )
}



function Notice({ tone, children }: { tone: 'amber' | 'red' | 'slate'; children: React.ReactNode }) {
  const cls = {
    amber: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
    red: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200',
    slate: 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300',
  }
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', cls[tone])}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

// Rezumat construit direct din rezultate, fără AI: instant și fără erori. Se reface automat la fiecare reclamă generată.
function TeamSummary({ before, generated, generating }: { before: SimResult; generated: GeneratedAd | null; generating: boolean }) {
  const tone = verdictTone(before)
  const verdict = tone === 'green' ? 'Gata de postat' : tone === 'amber' ? 'Merită îmbunătățită' : 'Nu postați așa'
  const total = before.comentarii_simulate.length || 1
  const pct = (k: string) => Math.round((100 * before.comentarii_simulate.filter((c) => c.sentiment === k).length) / total)
  const lines = [
    `Verdict: ${verdict} (scor ${before.scor_eficienta}/100)`,
    '',
    `Reacția publicului (${before.comentarii_simulate.length} comentarii): ${pct('pozitiv')}% pozitive, ${pct('neutru')}% neutre, ${pct('ironic')}% ironice, ${pct('negativ')}% negative.`,
    '',
    before.probleme_depistate.length ? `Probleme principale (${before.probleme_depistate.length}):` : 'Nu am găsit probleme importante.',
    ...before.probleme_depistate.map((p) => `• ${p.titlu} (gravitate ${p.gravitate}, −${p.penalizare})`),
  ]
  if (before.varianta_corectata) lines.push('', `Corectura propusă: ${before.varianta_corectata}`)
  if (generated)
    lines.push(
      '',
      `Reclama corectată a fost generată. Text pe imagine: „${generated.texte.titlu}” / „${generated.texte.subtitlu}” / buton „${generated.texte.buton}”.`,
      'Recomandare: verificați diacriticele din imagine, apoi postați varianta corectată.',
    )
  else if (tone !== 'green') lines.push('', 'Recomandare: nu postați varianta actuală. Generați reclama corectată.')
  else lines.push('', 'Recomandare: reclama poate fi postată.')
  const text = lines.join('\n')
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4" /> Rezumat pentru echipă
        </CardTitle>
        <CardDescription>Se actualizează automat după fiecare reclamă corectată generată.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {generating ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Aștept reclama corectată ca să actualizez rezumatul…
          </div>
        ) : (
          <>
            <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-800/60">{text}</div>
            <CopyButton text={text} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
