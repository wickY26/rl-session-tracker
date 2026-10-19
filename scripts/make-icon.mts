/** Writes resources/icon.png: dark rounded square, three rising bars (1v1/2v2/3v3 colours) and a trend line. */
import { writeFileSync } from 'node:fs'
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

/**
 * Windows icon with every size it asks for (tray 16, title bar 24/32, taskbar 32/48, explorer 64–256).
 * ICO entries hold PNG data (supported since Vista), downscaled from the 256 px drawing.
 */
const SIZES = [16, 24, 32, 48, 64, 128, 256]
const pngs: Buffer[] = []
for (const size of SIZES) {
  const copy = img.clone()
  if (size !== S) copy.resize({ w: size, h: size })
  pngs.push(await copy.getBuffer('image/png'))
}
const header = Buffer.alloc(6 + 16 * SIZES.length)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(SIZES.length, 4)
let offset = header.length
SIZES.forEach((size, i) => {
  const e = 6 + i * 16
  header.writeUInt8(size === 256 ? 0 : size, e) // 0 means 256
  header.writeUInt8(size === 256 ? 0 : size, e + 1)
  header.writeUInt8(0, e + 2) // palette colours
  header.writeUInt8(0, e + 3) // reserved
  header.writeUInt16LE(1, e + 4) // colour planes
  header.writeUInt16LE(32, e + 6) // bits per pixel
  header.writeUInt32LE(pngs[i].length, e + 8)
  header.writeUInt32LE(offset, e + 12)
  offset += pngs[i].length
})
writeFileSync('resources/icon.ico', Buffer.concat([header, ...pngs]))
console.log('resources/icon.png, resources/icon.ico')
