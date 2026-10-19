import { useEffect, useMemo, useRef, useState } from 'react'

export interface ChartSeries {
  key: string
  label: string
  color: string
}

export interface ChartPoint {
  label: string
  values: Record<string, number | undefined>
}

interface Props {
  series: ChartSeries[]
  points: ChartPoint[]
  /** Should the y axis start at 0 (yes for counts, no for MMR) */
  zeroBased?: boolean
  format?: (n: number) => string
  /** Point indexes where a new session starts; drawn as dashed vertical lines. */
  boundaries?: number[]
  empty?: string
}

/** Drawn at the box's real width so text stays readable. */
const DEFAULT_W = 820
const H = 280

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1
  const raw = span / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = Math.floor(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100)
  return ticks
}

/** Multi-series line chart: one axis, 2px lines, direct labels at the line ends, tooltip on hover. */
export function LineChart({
  series,
  points,
  zeroBased = false,
  format = (n) => String(Math.round(n)),
  boundaries = [],
  empty = 'Not enough data for a chart yet.'
}: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(DEFAULT_W)
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setW(Math.max(300, Math.round(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
    // No chart box is rendered without data; reconnect once data arrives
  }, [points.length > 0])
  const M = useMemo(() => ({ top: 16, right: W < 500 ? 80 : 96, bottom: 30, left: W < 500 ? 40 : 52 }), [W])

  const { x, y, ticks } = useMemo(() => {
    const values = points.flatMap((p) => series.map((s) => p.values[s.key]).filter((v): v is number => v !== undefined))
    let min = values.length ? Math.min(...values) : 0
    let max = values.length ? Math.max(...values) : 1
    if (zeroBased) min = 0
    if (max === min) max = min + 1
    const pad = zeroBased ? 0 : (max - min) * 0.1
    const ticks = niceTicks(min - pad, max + pad)
    const lo = Math.min(ticks[0], min)
    const hi = Math.max(ticks[ticks.length - 1], max)
    const innerW = W - M.left - M.right
    const innerH = H - M.top - M.bottom
    const x = (i: number) => M.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
    const y = (v: number) => M.top + innerH - ((v - lo) / (hi - lo)) * innerH
    return { x, y, ticks: ticks.filter((t) => t >= lo && t <= hi) }
  }, [points, series, zeroBased, W, M])

  // Line-end labels: spread vertically so they don't overlap
  const endLabels = useMemo(() => {
    const items = series
      .map((s) => {
        const idx = [...points.keys()].reverse().find((i) => points[i].values[s.key] !== undefined)
        return idx === undefined ? null : { s, y: y(points[idx].values[s.key]!), value: points[idx].values[s.key]! }
      })
      .filter((v): v is { s: ChartSeries; y: number; value: number } => !!v)
      .sort((a, b) => a.y - b.y)
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 15) items[i].y = items[i - 1].y + 15
    return items
  }, [points, series, y])

  if (!points.length) return <div className="empty">{empty}</div>

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    points.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
    })
    setHover(best)
  }

  const hoverPoint = hover !== null ? points[hover] : null
  const tooltipLeft = hover !== null ? (x(hover) / W) * 100 : 0

  return (
    <div className="chart" ref={wrap}>
      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => (
            <span key={s.key}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="chart-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img">
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
              <text className="axis" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {boundaries
            .filter((i) => i > 0 && i < points.length)
            .map((i) => {
              const bx = (x(i - 1) + x(i)) / 2
              return <line key={`b${i}`} className="boundary" x1={bx} x2={bx} y1={M.top} y2={H - M.bottom} />
            })}
          {points.map((p, i) => {
            const step = Math.ceil(points.length / 8)
            const last = points.length - 1
            // Every step-th label plus the last one, skipping a regular label that would collide with the last
            const show = points.length <= 8 || i === last || (i % step === 0 && last - i >= step / 2)
            return show ? (
              <text key={i} className="axis" x={x(i)} y={H - 8} textAnchor="middle">
                {p.label}
              </text>
            ) : null
          })}
          {hover !== null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={M.top} y2={H - M.bottom} />}
          {series.map((s) => {
            const pts = points.map((p, i) => (p.values[s.key] === undefined ? null : `${x(i)},${y(p.values[s.key]!)}`)).filter(Boolean)
            return (
              <g key={s.key}>
                <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {points.map((p, i) =>
                  p.values[s.key] === undefined || (hover !== i && points.length > 1 && i !== points.length - 1) ? null : (
                    <circle key={i} className="marker" cx={x(i)} cy={y(p.values[s.key]!)} r={4} fill={s.color} />
                  )
                )}
              </g>
            )
          })}
          {endLabels.map(({ s, y: ly, value }) => (
            <text key={s.key} className="end-label" x={W - M.right + 10} y={ly} dy="0.32em">
              <tspan fill={s.color}>●</tspan> {series.length > 1 ? s.label : format(value)}
            </text>
          ))}
          <rect
            x={M.left}
            y={M.top}
            width={W - M.left - M.right}
            height={H - M.top - M.bottom}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
        {hoverPoint && (
          <div className="chart-tooltip" style={{ left: `${tooltipLeft}%` }}>
            <strong>{hoverPoint.label}</strong>
            {series
              .filter((s) => hoverPoint.values[s.key] !== undefined)
              .map((s) => (
                <div key={s.key}>
                  <i style={{ background: s.color }} />
                  <span>{s.label}</span>
                  <b>{format(hoverPoint.values[s.key]!)}</b>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
