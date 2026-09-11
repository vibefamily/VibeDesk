/**
 * Info Center (M3) - multi-source news & tweet center.
 *
 * Left: source configuration (RSS / Twitter), pull status, add/delete.
 * Right: the information stream, filterable by symbol/kind, searchable.
 * Pulls run in the main process on a per-source schedule; agents can
 * query the same local cache via read_information.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useInfoStore } from '../stores/infoStore'
import type { InfoSourceConfig } from '@vibe/shared'

const winBtn: React.CSSProperties = {
  padding: '3px 10px',
  fontSize: 11,
  background: '#c0c0c0',
  border: '2px outset',
  borderColor: '#fff #808080 #808080 #fff',
  cursor: 'pointer',
}

const insetBox: React.CSSProperties = {
  border: '2px inset',
  borderColor: '#808080 #fff #fff #808080',
  background: '#fff',
  padding: 6,
  fontSize: 11,
}

const InfoCenter: React.FC = () => {
  const { sources, statuses, items, loading, error, init, upsertSource, deleteSource, refreshNow } =
    useInfoStore()
  const [filterKind, setFilterKind] = useState<'all' | 'news' | 'tweet'>('all')
  const [filterSymbol, setFilterSymbol] = useState<string>('')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState({
    kind: 'rss' as 'rss' | 'twitter',
    name: '',
    url: '',
    symbols: 'TSLA',
    keywords: '',
    intervalMinutes: 15,
  })

  useEffect(() => {
    void init()
  }, [init])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const sym = filterSymbol.toUpperCase().trim()
    return items.filter((it) => {
      if (filterKind !== 'all' && it.kind !== filterKind) return false
      if (sym && !it.symbols.includes(sym)) return false
      if (q) {
        const hay = `${it.title} ${it.summary ?? ''} ${it.author ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, filterKind, filterSymbol, search])

  const submit = async () => {
    if (!draft.name) return
    await upsertSource({
      kind: draft.kind,
      name: draft.name,
      enabled: true,
      url: draft.kind === 'rss' ? draft.url || undefined : undefined,
      symbols: draft.symbols
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
      keywords: draft.kind === 'twitter' ? draft.keywords.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      intervalMinutes: Math.max(1, draft.intervalMinutes),
    })
    setDraft({ ...draft, name: '', url: '', keywords: '' })
    setShowAdd(false)
  }

  const fmtTime = (ms: number | null): string =>
    ms ? new Date(ms).toLocaleTimeString() : 'never'

  const fmtItemTime = (iso: string): string => {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString() + ' ' + d.toLocaleTimeString()
  }

  const symbolOptions = useMemo(() => {
    const set = new Set<string>()
    items.forEach((it) => it.symbols.forEach((s) => set.add(s)))
    sources.forEach((s) => s.symbols.forEach((x) => set.add(x)))
    return [...set].sort()
  }, [items, sources])

  return (
    <div style={{ padding: 10, background: '#fff', minHeight: '100%', boxSizing: 'border-box' }}>
      {/* Header */}
      <div
        style={{
          border: '2px outset',
          borderColor: '#fff #808080 #808080 #fff',
          background: '#c0c0c0',
          padding: '6px 10px',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontSize: 18 }}>📰</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Info Center</div>
          <div style={{ fontSize: 10 }}>
            Scheduled news & tweet pulls · local cache · agents can read it
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, border: '1px inset', borderColor: '#808080 #fff #fff #808080', padding: '2px 6px' }}>
          {items.length} cached · {sources.filter((s) => s.enabled).length} sources
        </span>
      </div>

      {error && (
        <div style={{ ...insetBox, marginBottom: 8, color: '#a00' }}>{error}</div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        {/* --- Left: sources --- */}
        <div style={{ flex: '0 0 300px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              border: '2px outset',
              borderColor: '#fff #808080 #808080 #fff',
              background: '#c0c0c0',
              padding: '4px 8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 12 }}>Sources</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={winBtn} onClick={() => void refreshNow()} disabled={loading}>
                ↻ Pull now
              </button>
              <button style={{ ...winBtn, fontWeight: 700 }} onClick={() => setShowAdd((v) => !v)}>
                + Add
              </button>
            </div>
          </div>

          {showAdd && (
            <div style={{ ...insetBox, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['rss', 'twitter'] as const).map((k) => (
                  <label key={k} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <input
                      type="radio"
                      checked={draft.kind === k}
                      onChange={() => setDraft({ ...draft, kind: k })}
                    />
                    {k === 'rss' ? 'RSS news' : 'Twitter'}
                  </label>
                ))}
              </div>
              <input style={inputStyle} placeholder="Source name" value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              {draft.kind === 'rss' ? (
                <>
                  <input style={inputStyle} placeholder="RSS feed URL (e.g. https://finance.yahoo.com/rss/headline?s=TSLA)"
                    value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} />
                  <input style={inputStyle} placeholder="Symbols (comma-separated, e.g. TSLA, NVDA)"
                    value={draft.symbols} onChange={(e) => setDraft({ ...draft, symbols: e.target.value })} />
                </>
              ) : (
                <>
                  <input style={inputStyle} placeholder="Twitter keywords (comma-separated)"
                    value={draft.keywords} onChange={(e) => setDraft({ ...draft, keywords: e.target.value })} />
                  <div style={{ fontSize: 10, color: '#888' }}>
                    Twitter needs an Apify token (env APIFY_API_TOKEN); disabled until then.
                  </div>
                </>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <span>Every</span>
                <input type="number" min={1} style={{ ...inputStyle, width: 52 }}
                  value={draft.intervalMinutes}
                  onChange={(e) => setDraft({ ...draft, intervalMinutes: Number(e.target.value) })} />
                <span>min</span>
                <div style={{ flex: 1 }} />
                <button style={winBtn} onClick={() => void submit()}>Create</button>
              </div>
            </div>
          )}

          {sources.length === 0 && (
            <div style={{ ...insetBox, color: '#888' }}>No sources yet. Add one above.</div>
          )}
          {sources.map((s: InfoSourceConfig) => {
            const st = statuses[s.id]
            return (
              <div key={s.id} style={{ ...insetBox, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>
                    {s.kind === 'twitter' ? '🐦' : '📰'} {s.name}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      padding: '0 4px',
                      background: s.enabled ? '#c6efce' : '#e2e2e2',
                      border: '1px solid #808080',
                    }}
                  >
                    {s.enabled ? 'on' : 'off'}
                  </span>
                  <div style={{ flex: 1 }} />
                  <button style={winBtn} onClick={() => void refreshNow(s.id)} title="Pull now">
                    ↻
                  </button>
                  <button
                    style={{ ...winBtn, color: '#a00' }}
                    onClick={() => void deleteSource(s.id)}
                    title="Delete source"
                  >
                    ✕
                  </button>
                </div>
                <div style={{ fontSize: 10, color: '#555' }}>
                  {s.kind === 'rss' ? s.url : `keywords: ${(s.keywords ?? []).join(', ')}`} ·{' '}
                  {s.symbols.join(', ') || 'any'}
                </div>
                <div style={{ fontSize: 10, color: st?.error ? '#a00' : '#666' }}>
                  last pull {fmtTime(st?.lastPullAt ?? null)} · {st?.lastCount ?? 0} items
                  {st?.error ? ` · ${st.error}` : ''}
                </div>
              </div>
            )
          })}
        </div>

        {/* --- Right: information stream --- */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              border: '2px outset',
              borderColor: '#fff #808080 #808080 #fff',
              background: '#c0c0c0',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <input style={{ ...inputStyle, width: 170 }} placeholder="Search title/summary…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <select style={{ ...inputStyle, width: 110 }} value={filterSymbol}
              onChange={(e) => setFilterSymbol(e.target.value)}>
              <option value="">All symbols</option>
              {symbolOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select style={{ ...inputStyle, width: 90 }} value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as 'all' | 'news' | 'tweet')}>
              <option value="all">All kinds</option>
              <option value="news">News</option>
              <option value="tweet">Tweets</option>
            </select>
            <span style={{ fontSize: 10, color: '#555' }}>{filtered.length} shown</span>
          </div>

          <div
            style={{
              border: '2px outset',
              borderColor: '#fff #808080 #808080 #fff',
              background: '#fff',
              overflow: 'auto',
              maxHeight: 520,
            }}
          >
            {filtered.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#888', fontSize: 11 }}>
                {loading ? 'Loading…' : 'No items yet. Add an RSS source and hit “Pull now”.'}
              </div>
            ) : (
              filtered.slice(0, 120).map((it) => (
                <a
                  key={it.id}
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                >
                  <div style={{ padding: '6px 10px', borderBottom: '1px solid #c0c0c0' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span>{it.kind === 'tweet' ? '🐦' : '📰'}</span>
                      <span style={{ fontWeight: 600, fontSize: 12, color: '#000' }}>{it.title}</span>
                      <div style={{ flex: 1 }} />
                      <span style={{ fontSize: 9, color: '#888' }}>{fmtItemTime(it.publishedAt)}</span>
                    </div>
                    {it.summary && (
                      <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{it.summary}</div>
                    )}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
                      <span style={{ fontSize: 9, color: '#888' }}>{it.sourceName}</span>
                      {it.author && <span style={{ fontSize: 9, color: '#888' }}>@{it.author}</span>}
                      {it.symbols.map((s) => (
                        <span
                          key={s}
                          style={{
                            fontSize: 9,
                            background: '#e2e2e2',
                            border: '1px solid #808080',
                            padding: '0 4px',
                          }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '3px 6px',
  fontSize: 11,
  border: '2px inset',
  borderColor: '#808080 #fff #fff #808080',
  background: '#fff',
  color: '#000',
  boxSizing: 'border-box',
}

export default InfoCenter
