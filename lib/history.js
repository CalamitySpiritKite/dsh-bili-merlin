/**
 * lib/history.js —— 观看记录卡片墙的数据层（纯读，不阻塞刷 B站 主流程）
 *
 * 数据源（活鱼工具链已有的）：
 *   · ~/.bili-ai/seen.md          判重表 → 挑了/未挑/跳过（一行一条）
 *   · ~/.dsh/shots/covers/*.jpg   封面（BV.jpg）
 *   · ~/.dsh/whale-log.jsonl      事件流（kind: reply-sent / share-* / dm-*）
 *   · ~/.dsh/whale-session.json   session 记录（标题、BV）
 *
 * 输出统一形态：
 *   { bv, title, cover, when, status: 'picked'|'skipped'|'shared'|'watched', commentRpid?, sharedTo? }
 *
 * 设计：只拼数据 + 把本地封面 base64 出来给前端显示（封面是本地文件，不走网络 ✓）。
 * 纯读：任何一步失败都不抛，前端拿到空列表也能渲染 ✓。
 */
import fs from 'node:fs'
import path from 'node:path'
import { HOME, DSH_HOME } from '../tools/lib/paths.mjs'

const SHOTS_COVER = path.join(DSH_HOME, 'shots', 'covers')

/** 把本地封面读成 dataURL（不存在 / 读失败 → null，前端用占位图） */
function coverDataUrl(bv) {
  if (!bv) return null
  try {
    const f = path.join(SHOTS_COVER, `${bv}.jpg`)
    if (!fs.existsSync(f)) return null
    const buf = fs.readFileSync(f)
    if (buf.length > 300 * 1024) return null   // 太大的封面不进界面（省流量）
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/** 解析 seen.md：活鱼判重表，按 BV 聚合。
 *  活鱼 seen.md 的形态（一行一条）大致是：
 *    | BV | rpid | 时间 | 备注 |   或   BV xxx ... 等
 *  这里做**宽容解析**：按行扫，抓 BV + 时间 + 结果词（挑了/跳过/发了/看过）。
 *  解析不出来就不报错误，返回空。 */
function parseSeen() {
  const file = path.join(HOME, '.bili-ai', 'seen.md')
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  const out = []
  for (const line of text.split('\n')) {
    const bv = (line.match(/BV[0-9A-Za-z]{10}/) || [])[0]
    if (!bv) continue
    // 时间：抓 "YYYY-MM-DD HH:MM" 或 "M月D日" 或 ISO
    const tIso = (line.match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/) || [])[0] || null
    const tCn = (line.match(/\d{1,2}月\d{1,2}日/) || [])[0] || null
    // 状态词：优先看显式结果
    let status = 'watched'
    if (/跳过|skip/i.test(line)) status = 'skipped'
    else if (/挑了|选中|pick/i.test(line)) status = 'picked'
    else if (/已发|share|分享|dm|私信/i.test(line)) status = 'shared'
    out.push({
      bv,
      when: tIso || tCn || null,
      status,
      raw: line.trim().slice(0, 160),
    })
  }
  return out
}

/** whale-log.jsonl：抓分享/回复事件，按 BV 关联 */
function parseWhaleLog() {
  const file = path.join(DSH_HOME, 'whale-log.jsonl')
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  const out = []
  for (const line of text.trim().split('\n').filter(Boolean)) {
    let j
    try { j = JSON.parse(line) } catch { continue }
    const bv = (String(j.target ?? '').match(/BV[0-9A-Za-z]{10}/) || [])[0] || null
    out.push({
      kind: j.kind || null,
      bv,
      at: j.at || null,
      note: String(j.note ?? '').slice(0, 120),
      commentRpid: j.rpid ? String(j.rpid) : null,
      sharedTo: j.sharedTo ? String(j.sharedTo) : null,
    })
  }
  return out
}

/** session 记录：补标题 */
function parseSession() {
  const file = path.join(DSH_HOME, 'whale-session.json')
  let j
  try { j = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return {} }
  // 形态可能是 { last: { bv, title, ... } } 或 { sessions: [...] } 或 直接数组
  const arr = Array.isArray(j) ? j : (j.sessions ?? (j.last ? [j.last] : []))
  const map = {}
  for (const s of arr) {
    const bv = (String(s.bv ?? s.bvid ?? '').match(/BV[0-9A-Za-z]{10}/) || [])[0]
    if (!bv) continue
    map[bv] = { title: String(s.title ?? '').slice(0, 80), when: s.at || s.when || null }
  }
  return map
}

/** 合并三源，按 BV 聚合；同一 BV 多条取最近。
 *  同一 BV 多条记录时，按"最新一条的状态"归一：
 *    ① log 里的 rpid（评论发出记录）→ 最高级 = 'shared'
 *    ② log 里 dm 类型的 kind（dm/dm-reply/dm-share）→ 'shared'
 *    ③ 其余（纯观看/跳过/挑中）→ 'watched'
 *  这样"既看过又评论"的片会显示成"已发你"而不是"看过" ✓
 *  limit 默认 20；filter：all | picked | skipped | shared */
export function buildHistory({ limit = 20, filter = 'all' } = {}) {
  const seen = parseSeen()
  const log = parseWhaleLog()
  const sess = parseSession()
  const byBv = new Map()
  // 先看 seen 表（挑了/跳过的判定）
  for (const s of seen) {
    const e = byBv.get(s.bv) || { bv: s.bv, title: sess[s.bv]?.title || s.raw?.slice(0, 60), when: s.when, status: s.status }
    if (s.when && (!e.when || String(s.when) > String(e.when))) e.when = s.when
    byBv.set(s.bv, e)
  }
  // 再看 log 事件流（发评论/发私信会升级状态）
  for (const l of log) {
    if (!l.bv) continue
    const e = byBv.get(l.bv) || { bv: l.bv, title: sess[l.bv]?.title || l.note, when: null, status: 'watched' }
    if (l.at && (!e.when || String(l.at) > String(e.when))) e.when = l.at
    if (l.commentRpid || l.kind === 'dm-reply' || l.kind === 'dm-share' || l.kind === 'share') {
      e.status = 'shared'
      if (l.commentRpid) e.commentRpid = l.commentRpid
      if (l.sharedTo) e.sharedTo = l.sharedTo
    }
    e.note = l.note || e.note
    byBv.set(l.bv, e)
  }
  // 排序：按时间倒序（没时间的排后面）
  const list = [...byBv.values()].map((e) => ({ ...e, cover: coverDataUrl(e.bv) }))
  list.sort((a, b) => String(b.when ?? '').localeCompare(String(a.when ?? '')))
  const filtered = filter === 'all' ? list : list.filter((e) => e.status === filter)
  return filtered.slice(0, Math.max(1, Number(limit) || 20))
}
