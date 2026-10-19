import { useEffect, useState } from 'react'

const parse = (raw: string): number | null => {
  const t = raw.trim()
  if (t === '' || t === '-' || t === '+') return null
  const n = Math.trunc(Number(t))
  return Number.isNaN(n) ? null : n
}

const show = (value: number | null, signed: boolean) => (value === null ? '' : signed && value > 0 ? `+${value}` : String(value))

/**
 * Integer field that keeps the typed text (so "-" or "+" can be typed first) and reports
 * the parsed value. Follows outside changes of `value`.
 */
export function IntInput(props: {
  value: number | null
  onChange: (value: number | null) => void
  signed?: boolean
  className?: string
  title?: string
}) {
  const { value, onChange, signed = false, className, title } = props
  const [text, setText] = useState(show(value, signed))
  useEffect(() => {
    if (parse(text) !== value) setText(show(value, signed))
    // only react to outside changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      className={className}
      title={title}
      inputMode="numeric"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        onChange(parse(e.target.value))
      }}
    />
  )
}
