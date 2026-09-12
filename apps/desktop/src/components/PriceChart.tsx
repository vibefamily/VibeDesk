/**
 * PriceChart - dependency-free SVG line chart comparing one symbol's
 * price history across multiple data sources on a shared time axis.
 *
 * Renders one polyline per provider with a legend, grid lines and
 * time/price axes. Keeps the Win95 look (sharp 1px lines, plain
 * colors) and reacts to container resizes.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'

export interface ChartSeries {
  provider: string
  points: { ts: number; price: number }[]
}

const PALETTE = ['#008000', '#000080', '#800080', '#B8860B', '#A0522D', '#2F4F4F']

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const colorFor = (provider: string): string => PALETTE[hash(provider) % PALETTE.length]!

function fmtAxis(ts: number, rangeSec: number): string {
  const d = new Date(ts * 1000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (rangeSec <= 2 * 3600) return `${hh}:${mm}`
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hh}:${mm}`
}

const PAD_L = 8
const PAD_R = 8
const PAD_T = 16
const PAD_B = 24

interface Props {
  series: ChartSeries[]
  height?: number
}

const PriceChart: React.FC<Props> = ({ series, height = 220 }) => {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = (): void => setWidth(Math.max(320, el.clientWidth - 2))
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [])

  const data = useMemo(
    () =>
      series
        .map((s) => ({ provider: s.provider, points: s.points.filter((p) => Number.isFinite(p.price)) }))
        .filter((s) => s.points.length > 0),
    [series],
  )

  const geom = useMemo(() => {
    if (data.length === 0) return null

    const plotW = width - PAD_L - PAD_R
    const plotH = height - PAD_T - PAD_B

    let minTs = Infinity
    let maxTs = -Infinity
    let minP = Infinity
    let maxP = -Infinity
    for (const s of data) {
      for (const p of s.points) {
        if (p.ts < minTs) minTs = p.ts
        if (p.ts > maxTs) maxTs = p.ts
        if (p.price < minP) minP = p.price
        if (p.price > maxP) maxP = p.price
      }
    }
    if (!Number.isFinite(minTs)) return null
    if (minTs === maxTs) maxTs = minTs + 60
    if (minP === maxP) {
      minP -= 1
      maxP += 1
    }
    const padP = (maxP - minP) * 0.08
    minP -= padP
    maxP += padP
    const rangeT = maxTs - minTs

    const x = (ts: number): number => PAD_L + ((ts - minTs) / rangeT) * plotW
    const y = (p: number): number => PAD_T + (1 - (p - minP) / (maxP - minP)) * plotH

    const paths = data.map((s) => {
      const last = s.points[s.points.length - 1]!
      return {
        provider: s.provider,
        d: s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.ts).toFixed(1)},${y(p.price).toFixed(1)}`).join(' '),
        color: colorFor(s.provider),
        lastX: x(last.ts),
        lastY: y(last.price),
      }
    })

    const yLabels: { v: number; yv: number }[] = []
    for (let i = 0; i <= 4; i++) {
      const v = minP + ((maxP - minP) * i) / 4
      yLabels.push({ v, yv: PAD_T + (1 - i / 4) * plotH })
    }
    const xLabels: { label: string; xv: number }[] = []
    for (let i = 0; i <= 3; i++) {
      const ts = minTs + (rangeT * i) / 3
      xLabels.push({ label: fmtAxis(ts, rangeT), xv: PAD_L + (plotW * i) / 3 })
    }
    return { paths, yLabels, xLabels, minP, maxP, rangeT }
  }, [data, width, height])

  if (!geom) {
    return (
      <div
        ref={wrapRef}
        style={{
          width: '100%',
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#808080',
          fontSize: 12,
          background: '#fff',
          border: '1px inset',
          borderColor: '#808080 #fff #fff #808080',
          boxSizing: 'border-box',
        }}
      >
        No history recorded yet - a point per source is stored every minute
        once live polling starts.
      </div>
    )
  }

  return (
    <div ref={wrapRef} style={{ width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', marginBottom: 4 }}>
        {data.map((s) => (
          <span key={s.provider} style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 12, height: 2, background: colorFor(s.provider), display: 'inline-block' }} />
            {s.provider}
          </span>
        ))}
      </div>
      <svg
        width={width}
        height={height}
        style={{
          display: 'block',
          background: '#fff',
          border: '1px inset',
          borderColor: '#808080 #fff #fff #808080',
        }}
      >
        {geom.yLabels.map(({ v, yv }, i) => (
          <g key={`y${i}`}>
            <line x1={PAD_L} x2={width - PAD_R} y1={yv} y2={yv} stroke="#d4d0c8" strokeWidth={1} />
            <text x={PAD_L + 2} y={yv - 3} fontSize={9} fill="#555">
              {v.toFixed(v >= 100 ? 0 : 2)}
            </text>
          </g>
        ))}
        {geom.xLabels.map(({ label, xv }, i) => (
          <text
            key={`x${i}`}
            x={xv}
            y={height - 8}
            fontSize={9}
            fill="#555"
            textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}
          >
            {label}
          </text>
        ))}
        {geom.paths.map((p) => (
          <path key={p.provider} d={p.d} fill="none" stroke={p.color} strokeWidth={1.6} strokeLinejoin="round" />
        ))}
        {/* Latest point markers */}
        {geom.paths.map((p) => (
          <circle key={`dot${p.provider}`} cx={p.lastX} cy={p.lastY} r={2.5} fill={p.color} />
        ))}
      </svg>
    </div>
  )
}

export default PriceChart
