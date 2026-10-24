// 稳定的私信设备 ID（2026-10-22 起）：
//   真浏览器里 dev_id 是【固定的】—— 发私信时每带一个不同的 dev_id，风控看到的是
//   「同一个人在不同设备间高频切换」→ 私信容易被封控 ✗。
//   所以这里：只生成一次、存到 ~/.bili-ai/dev_id、之后永远复用 ✓。
//   文件丢了/删了会自动重建一次（等于"换了台设备"，但只发生一次 ✓）。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export function stableDevIdIfAny() {
  const HOME = process.env.USERPROFILE || process.env.HOME || '.'
  const file = path.join(HOME, '.bili-ai', 'dev_id')
  try {
    const v = fs.readFileSync(file, 'utf8').trim()
    if (v) return v
  } catch { /* 没文件 → 重建一次 */ }
  const v = 'WEB-' + crypto.randomUUID().toUpperCase()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, v + '\n')
    try { fs.chmodSync(file, 0o600) } catch {}
  } catch {
    return null   // 存不了就返回 null，调用方用临时值（能发，但风控风险高一点 ✗）
  }
  return v
}
