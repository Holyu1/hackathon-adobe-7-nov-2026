import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Check, MessageCircle, ThumbsUp, Lightbulb, Quote } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Problem, SimComment, SimResult } from '@/lib/engine'

export function verdictTone(r: Pick<SimResult, 'scor_eficienta' | 'probleme_depistate'>) {
  const severe = r.probleme_depistate.filter((p) => p.gravitate === 'ridicată').length
  if (r.scor_eficienta < 55 || severe >= 2) return 'red'
  if (r.scor_eficienta >= 80 && severe === 0) return 'green'
  return 'amber'
}

/* Scor circular animat 0–100 */
export function Gauge({ value, tone, size = 180 }: { value: number; tone: 'green' | 'amber' | 'red'; size?: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1200)
      setV(Math.round(value * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  const r = 70
  const c = 2 * Math.PI * r
  const arc = c * 0.75
  const color = { green: '#10b981', amber: '#f59e0b', red: '#ef4444' }[tone]
  return (
    <svg width={size} height={size} viewBox="0 0 180 180" role="img" aria-label={`Scor ${value} din 100`}>
      <g transform="rotate(135 90 90)">
        <circle cx="90" cy="90" r={r} fill="none" strokeWidth="14" className="stroke-slate-200 dark:stroke-slate-800" strokeDasharray={`${arc} ${c}`} strokeLinecap="round" />
        <circle cx="90" cy="90" r={r} fill="none" strokeWidth="14" stroke={color} strokeDasharray={`${(arc * v) / 100} ${c}`} strokeLinecap="round" />
      </g>
      <text x="90" y="92" textAnchor="middle" className="fill-slate-900 dark:fill-white" fontSize="42" fontWeight="800">
        {v}
      </text>
      <text x="90" y="118" textAnchor="middle" className="fill-slate-500" fontSize="12">
        din 100
      </text>
    </svg>
  )
}

export function ScoreCard({ r }: { r: SimResult }) {
  const tone = verdictTone(r)
  const verdict = tone === 'green' ? 'Gata de postat' : tone === 'amber' ? 'Merită îmbunătățită' : 'Nu postați așa'
  return (
    <Card className="flex flex-col items-center gap-4 p-6 md:flex-row md:items-center">
      <Gauge value={r.scor_eficienta} tone={tone} />
      <div className="flex-1 space-y-2 text-center md:text-left">
        <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
          <h2 className="text-xl font-bold">Scor de eficiență</h2>
          <Badge tone={tone}>{verdict}</Badge>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">{r.sumar_executiv}</p>
        <div className="flex flex-wrap justify-center gap-2 text-xs text-slate-500 md:justify-start">
          <Badge tone="slate">
            100 − {r.penalizare_probleme ?? r.puncte_pierdute} (probleme) − {r.penalizare_sentiment ?? 0} (sentiment negativ) = {r.scor_eficienta}
          </Badge>
          <Badge tone="slate">{r.comentarii_simulate.length} comentarii simulate</Badge>
          {r.calibrare && (
            <Badge tone={r.calibrare.comentarii_reale_folosite ? 'brand' : 'amber'}>
              {r.calibrare.comentarii_reale_folosite
                ? `calibrat pe ${r.calibrare.comentarii_reale_folosite} comentarii reale din Trending RO`
                : 'fără comentarii reale (YouTube nesincronizat)'}
            </Badge>
          )}
        </div>
      </div>
    </Card>
  )
}

const sentimentStyle = {
  pozitiv: { dot: 'bg-emerald-500', badge: 'green' },
  neutru: { dot: 'bg-slate-400', badge: 'slate' },
  negativ: { dot: 'bg-red-500', badge: 'red' },
  ironic: { dot: 'bg-amber-500', badge: 'amber' },
} as const

const MIX = [
  { k: 'pozitiv', label: 'pozitive', bar: 'bg-emerald-500' },
  { k: 'neutru', label: 'neutre', bar: 'bg-slate-400' },
  { k: 'ironic', label: 'ironice', bar: 'bg-amber-500' },
  { k: 'negativ', label: 'negative', bar: 'bg-red-500' },
] as const

export function Feed({ comments, title, className }: { comments: SimComment[]; title?: string; className?: string }) {
  const sorted = [...comments].sort((a, b) => b.aprecieri_simulate - a.aprecieri_simulate)
  const total = comments.length || 1
  const counts = MIX.map((m) => ({ ...m, n: comments.filter((c) => c.sentiment === m.k).length }))
  return (
    <Card className={cn('flex max-h-[680px] flex-col', className)}>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" /> {title ?? 'Comentarii simulate'}
          </CardTitle>
          <Badge tone="red">YouTube</Badge>
        </div>
        {comments.length > 0 && (
          <div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              {counts.map((c) => (c.n ? <div key={c.k} className={c.bar} style={{ width: `${(100 * c.n) / total}%` }} /> : null))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
              {counts.map((c) => (
                <span key={c.k} className="flex items-center gap-1.5">
                  <span className={cn('h-2 w-2 rounded-full', c.bar)} />
                  {c.n} {c.label} ({Math.round((100 * c.n) / total)}%)
                </span>
              ))}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 space-y-3 overflow-y-auto">
        {sorted.map((c, i) => {
          const st = sentimentStyle[c.sentiment] ?? sentimentStyle.neutru
          return (
            <div key={i} className="flex animate-fade-up gap-3" style={{ animationDelay: `${Math.min(i, 15) * 90}ms` }}>
              <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white', st.dot)}>
                {c.autor_fictiv.replace(/^@/, '').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="font-semibold">@{c.autor_fictiv.replace(/^@/, '').replace(/\s+/g, '')}</span>
                  <span className="text-slate-500">{c.arhetip}</span>
                </div>
                <p className="mt-0.5 text-sm">{c.comentariu}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="h-3 w-3" /> {c.aprecieri_simulate}
                  </span>
                  <Badge tone={st.badge}>{c.sentiment}</Badge>
                </div>
              </div>
            </div>
          )
        })}
        {!comments.length && <p className="py-10 text-center text-sm text-slate-500">Nu există comentarii.</p>}
      </CardContent>
    </Card>
  )
}

const gravTone = { scăzută: 'slate', medie: 'amber', ridicată: 'red' } as const

export function Problems({ problems }: { problems: Problem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" /> Probleme depistate ({problems.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {problems.map((p) => (
          <div key={p.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold">{p.titlu}</div>
              <span className="shrink-0 text-sm font-bold text-red-600">−{p.penalizare}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone={gravTone[p.gravitate] ?? 'amber'}>gravitate {p.gravitate}</Badge>
              <Badge tone="slate">{p.categorie}</Badge>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{p.descriere}</p>
            {p.citate_relevante.map((q) => (
              <div key={q} className="mt-2 flex gap-2 rounded-md bg-slate-50 p-2 text-sm italic dark:bg-slate-800/60">
                <Quote className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {q}
              </div>
            ))}
          </div>
        ))}
        {!problems.length && (
          <p className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Nicio problemă depistată.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function Checklist({ items }: { items: string[] }) {
  const [done, setDone] = useState<Set<number>>(new Set())
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-brand-600" /> Recomandări de optimizare
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((it, i) => (
          <label key={i} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand-600"
              checked={done.has(i)}
              onChange={() =>
                setDone((s) => {
                  const n = new Set(s)
                  if (n.has(i)) n.delete(i)
                  else n.add(i)
                  return n
                })
              }
            />
            <span className={cn(done.has(i) && 'text-slate-400 line-through')}>{it}</span>
          </label>
        ))}
      </CardContent>
    </Card>
  )
}

export function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setOk(true)
          setTimeout(() => setOk(false), 1500)
        } catch {
          /* clipboard refuzat */
        }
      }}
    >
      {ok ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {ok ? 'Copiat' : 'Copiază'}
    </Button>
  )
}
