import { useEffect, useState } from 'react'
import { Home as HomeIcon, ScanSearch, Moon, Sun, Rocket, Building2 } from 'lucide-react'
import { cn, safeGet, safeSet } from '@/lib/utils'
import type { Company } from '@/lib/engine'
import HomePage from '@/pages/Home'
import VerifyPage from '@/pages/Verify'

type Route = 'acasa' | 'verificare'

const readRoute = (): Route => (location.hash === '#verificare' ? 'verificare' : 'acasa')

export const EMPTY_COMPANY: Company = { name: '', industry: '', ageGroup: '', tone: '' }

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [dark, setDark] = useState<boolean>(() => safeGet('pl-dark', false))
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [company, setCompany] = useState<Company>(() => {
    // Profilul firmei NU se mai păstrează între deschideri: la fiecare pornire se completează din nou.
    try {
      localStorage.removeItem('pl-company')
    } catch {
      /* storage indisponibil */
    }
    return EMPTY_COMPANY
  })

  useEffect(() => {
    const on = () => setRoute(readRoute())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    safeSet('pl-dark', dark)
  }, [dark])

  const go = (r: Route) => {
    location.hash = r
    setRoute(r)
  }

  const saveCompany = (c: Company) => {
    setCompany(c)
  }

  const nav = [
    { id: 'acasa' as const, label: 'Acasă', icon: HomeIcon },
    { id: 'verificare' as const, label: 'Verificare', icon: ScanSearch },
  ]

  return (
    <div className="flex h-full">
      <aside className="flex w-16 shrink-0 flex-col border-r border-slate-200 bg-white md:w-60 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 items-center gap-2 px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Rocket className="h-5 w-5" />
          </div>
          <span className="hidden text-lg font-bold tracking-tight md:block">PreLaunch</span>
        </div>
        <nav className="mt-2 flex flex-1 flex-col gap-1 px-2">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => go(n.id)}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                route === n.id
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              <n.icon className="h-5 w-5 shrink-0" />
              <span className="hidden md:block">{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <div className="hidden items-center gap-3 rounded-lg px-2 py-2 md:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <Building2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{company.name || 'Firma ta'}</div>
              <div className="truncate text-xs text-slate-500">{company.industry || 'Profil necompletat'}</div>
            </div>
          </div>
          <button
            onClick={() => setDark((d) => !d)}
            className="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {dark ? <Sun className="h-5 w-5 shrink-0" /> : <Moon className="h-5 w-5 shrink-0" />}
            <span className="hidden md:block">{dark ? 'Temă luminoasă' : 'Temă întunecată'}</span>
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div key={route} className="page-enter mx-auto max-w-6xl p-4 md:p-8">
          {route === 'acasa' ? (
            <HomePage
              company={company}
              onSave={saveCompany}
              onStart={() => go('verificare')}
              onFile={(f) => {
                setPendingFile(f)
                go('verificare')
              }}
            />
          ) : (
            <VerifyPage company={company} onEditCompany={() => go('acasa')} initialFile={pendingFile} onFileUsed={() => setPendingFile(null)} />
          )}
        </div>
      </main>
    </div>
  )
}
