import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'
import { usePageTitle } from '../lib/usePageTitle'

type Result = {
  created: { line: number; name: string; lead_id: number }[]
  duplicates: { line: number; name: string; lead_id: number }[]
  errors: { line: number; name: string; problems: string[] }[]
}

export default function DeskImport() {
  usePageTitle('Import portal CSV')
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)

  const upload = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('file', file!)
      return api.post<Result>('/leads/import', fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['desk-stats'] })
    },
  })
  const r = upload.data

  return (
    <div className="wrap max-w-3xl pt-8">
      <Link to="/desk" className="text-[14px] text-ink-3 hover:text-ink">
        ← Lead desk
      </Link>
      <h1 className="mt-4 text-[30px] font-semibold tracking-tight">Import portal CSV</h1>
      <p className="mt-2 text-[15px] text-ink-2">
        Export leads from CarDekho, CarWale or any portal and drop the file here. Each new lead is assigned straight away; a phone we’ve seen in the last 30 days is added to the
        existing lead instead.
      </p>

      <div className="card mt-8 p-6">
        <p className="text-[14px] text-ink-2">
          Needs <b className="font-medium text-ink">name</b> and <b className="font-medium text-ink">phone</b> columns. Model, showroom, city, email, source and remarks are
          picked up if present. UTF-8, up to 1 MB.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            id="csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              upload.reset()
            }}
          />
          <label htmlFor="csv" className="btn-quiet cursor-pointer">
            {file ? 'Choose another file' : 'Choose CSV file'}
          </label>
          <span className="truncate text-[14px] text-ink-3">{file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : 'No file chosen'}</span>
          <button className="btn-primary sm:ml-auto" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
            {upload.isPending ? 'Importing…' : 'Import'}
          </button>
        </div>
        {upload.error && (
          <p className="mt-4 rounded-xl bg-bad-soft px-4 py-3 text-[14px] text-bad" role="alert">
            {upload.error.message}
          </p>
        )}
      </div>

      {r && (
        <div className="mt-8 space-y-6" role="status">
          <p className="text-[17px] font-medium">
            {r.created.length} imported · {r.duplicates.length} already known · {r.errors.length} need fixing
          </p>
          {r.created.length > 0 && (
            <section>
              <h2 className="eyebrow">Imported and assigned</h2>
              <ul className="card mt-2 divide-y divide-line">
                {r.created.map((x) => (
                  <li key={x.line} className="flex justify-between px-4 py-2.5 text-[14px]">
                    <span>{x.name}</span>
                    <Link to={`/desk/leads/${x.lead_id}`} className="text-ink-2 underline underline-offset-2">
                      Open lead
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {r.duplicates.length > 0 && (
            <section>
              <h2 className="eyebrow">Added to an existing lead</h2>
              <ul className="card mt-2 divide-y divide-line">
                {r.duplicates.map((x) => (
                  <li key={x.line} className="flex justify-between px-4 py-2.5 text-[14px]">
                    <span>
                      Line {x.line} · {x.name}
                    </span>
                    <Link to={`/desk/leads/${x.lead_id}`} className="text-ink-2 underline underline-offset-2">
                      Open lead
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {r.errors.length > 0 && (
            <section>
              <h2 className="eyebrow">Skipped, fix and re-import</h2>
              <ul className="card mt-2 divide-y divide-line">
                {r.errors.map((x) => (
                  <li key={x.line} className="px-4 py-2.5 text-[14px]">
                    <span className="text-ink-3">Line {x.line}</span> · {x.name || 'no name'} — <span className="text-bad">{x.problems.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
