import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import { Building2, Upload, Sparkles, ArrowRight, Check, MessageSquareText, Eye, ShieldCheck, Users, FileText } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@/components/ui'
import type { Company } from '@/lib/engine'
import { cn } from '@/lib/utils'

export const AGE_GROUPS = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-65', '65-80', '18-65']

const schema = z.object({
  name: z.string().min(2, 'Scrie numele firmei'),
  industry: z.string().min(2, 'Scrie industria'),
  ageGroup: z.string().min(2, 'Alege categoria de vârstă'),
})

export default function HomePage({
  company,
  onSave,
  onStart,
  onFile,
}: {
  company: Company
  onSave: (c: Company) => void
  onStart: () => void
  onFile: (f: File) => void
}) {
  const [saved, setSaved] = useState(false)
  const [drag, setDrag] = useState(false)
  const { register, handleSubmit, formState } = useForm<Omit<Company, 'tone'>>({ resolver: zodResolver(schema), defaultValues: company })

  const submit = handleSubmit((c) => {
    onSave({ ...c, tone: '' })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  })

  const criteria = [
    { icon: MessageSquareText, t: 'Claritate, cringe, scepticism, clickbait' },
    { icon: Eye, t: 'Analiză vizuală (imagine sau cadre din video)' },
    { icon: ShieldCheck, t: 'Scor: −5 / −10 / −15 pe problemă, după gravitate, plus sentimentul publicului' },
    { icon: Users, t: '15–25 de comentarii simulate, calibrate pe Trending YouTube România' },
  ]

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Cum folosești PreLaunch în 3 pași</h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">Află dacă reclama ta de YouTube vinde sau face scandal, înainte să o postezi.</p>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <StepBadge n={1} icon={Building2} />
              <CardTitle>Definește profilul firmei</CardTitle>
              <CardDescription>
                Contextul de brand schimbă tot: aceeași glumă merge pentru o băutură energizantă, dar nu pentru o bancă.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-3">
                <Field label="Nume firmă" error={formState.errors.name?.message}>
                  <Input placeholder="ex: Volt Energy" {...register('name')} />
                </Field>
                <Field label="Industrie" error={formState.errors.industry?.message}>
                  <Input placeholder="ex: băuturi energizante" {...register('industry')} />
                </Field>
                <Field label="Categorie de vârstă" error={formState.errors.ageGroup?.message}>
                  <select
                    {...register('ageGroup')}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="">Alege…</option>
                    {AGE_GROUPS.map((a) => (
                      <option key={a} value={a}>
                        {a} ani
                      </option>
                    ))}
                  </select>
                </Field>
                <Button type="submit" variant={saved ? 'success' : 'default'} className="w-full">
                  {saved ? (
                    <>
                      <Check className="h-4 w-4" /> Salvat
                    </>
                  ) : (
                    'Salvează profilul'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <StepBadge n={2} icon={Upload} />
              <CardTitle>Încarcă reclama și descrierea</CardTitle>
              <CardDescription>Adaugi imaginea sau clipul și descrierea reclamei.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <p>• Imagini JPG, PNG, WEBP sau video MP4, WEBM, MOV</p>
              <p>• Descrierea reclamei: ce se vede și ce se spune</p>
              <label
                onDragOver={(e) => {
                  e.preventDefault()
                  setDrag(true)
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDrag(false)
                  const f = e.dataTransfer.files[0]
                  if (f) onFile(f)
                }}
                className={cn(
                  'mt-4 block cursor-pointer rounded-lg border-2 border-dashed p-6 text-center text-xs transition',
                  drag ? 'border-brand-500 bg-brand-50 dark:bg-brand-700/10' : 'border-slate-300 hover:border-brand-500 dark:border-slate-700',
                )}
              >
                <Upload className="mx-auto mb-2 h-6 w-6 text-slate-400" />
                <span className="font-medium text-slate-700 dark:text-slate-300">Trage fișierul aici</span>
                <br />
                sau apasă ca să-l alegi din calculator
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) onFile(f)
                  }}
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <StepBadge n={3} icon={Sparkles} />
              <CardTitle>Rulează analiza automată</CardTitle>
              <CardDescription>AI-ul verifică reclama și simulează reacția publicului român.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {criteria.map((c) => (
                <div key={c.t} className="flex items-center gap-3 text-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-700/20 dark:text-brand-100">
                    <c.icon className="h-4 w-4" />
                  </div>
                  {c.t}
                </div>
              ))}
              <div className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800">
                Apoi, automat: <FileText className="inline h-3.5 w-3.5" /> raport pentru manager.
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="flex justify-center pb-6">
        <Button size="lg" onClick={onStart}>
          Începe verificarea acum <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function StepBadge({ n, icon: Icon }: { n: number; icon: typeof Upload }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-100">Pasul {n}</span>
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
