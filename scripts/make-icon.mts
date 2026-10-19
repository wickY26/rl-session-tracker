/** Writes resources/icon.png: dark rounded square, three rising bars (1v1/2v2/3v3 colours) and a trend line. */
import { Jimp } from 'jimp'

const S = 256
const img = new Jimp({ width: S, height: S, color: 0x00000000 })
const r = 52 // corner radius
const inRounded = (x: number, y: number) => {
  const cx = Math.min(Math.max(x, r), S - 1 - r)
  const cy = Math.min(Math.max(y, r), S - 1 - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}
const bars = [
  { x0: 52, x1: 92, top: 150, color: 0x3ecf8eff },
  { x0: 108, x1: 148, top: 112, color: 0x2f8cffff },
  { x0: 164, x1: 204, top: 72, color: 0xff8a1fff }
]
// Trend line from bottom-left to top-right, 10px thick
const onLine = (x: number, y: number) => {
  const [ax, ay, bx, by] = [48, 132, 208, 44]
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
  return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) < 6
}
for (let y = 0; y < S; y++)
  for (let x = 0; x < S; x++) {
    if (!inRounded(x, y)) continue
    let c = 0x131a26ff
    for (const b of bars) if (x >= b.x0 && x < b.x1 && y >= b.top && y < 204) c = b.color
    if (onLine(x, y)) c = 0xf2f4f8ff
    img.setPixelColor(c >>> 0, x, y)
  }
await img.write('resources/icon.png')
console.log('resources/icon.png')
