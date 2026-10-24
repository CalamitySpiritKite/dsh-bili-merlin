// 私信监听（只回主人）—— 2026-10-19 主人提议：私信比评论区更安静、风险更小
//   只在【主人那个会话】有新消息时命中；其他会话（系统通知 / 陌生人）一律忽略 ✗
//   用法:
//     node dm-await.mjs --baseline          把当前状态记为"已读"，从现在起只认新消息
//     node dm-await.mjs --once [--json]     轮询一次（命中打印 DM_HIT）
//     node dm-await.mjs --once --json --peek  持久化待交付消息，返回 receipt
//     node dm-await.mjs --ack <receipt>    宿主成功接收后确认，不访问网络
//     node dm-await.mjs --interval 20       持续轮询（插件里用 --once 自带循环 ✗）
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { config } from '../lib/config.mjs'

const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) opt[argv[i].slice(2)] = true
    else { opt[argv[i].slice(2)] = v; i += 1 }
  }
}
const BASE = !!opt.baseline
const ONCE = !!opt.once || BASE
const JSONOUT = !!opt.json
const PEEK = !!opt.peek

const U = process.env.USERPROFILE || process.env.HOME || '/'
const STATE = path.join(U, '.bili-ai', 'dm-await-state.json')
const c = JSON.parse(fs.readFileSync(path.join(U, '.bili-ai', 'credentials.json'), 'utf8'))
const cfg = config()
const OWNER = String(cfg.owner?.mid ?? '').trim()
const OWNER_NAME = String(cfg.owner?.name ?? '主人')
if (!OWNER) { console.error('✗ 配置里 owner.mid 为空'); process.exit(2) }

const H = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  referer: 'https://www.bilibili.com/',
  cookie: `SESSDATA=${c.sessdata}; bili_jct=${c.bili_jct}; buvid3=${c.buvid3}`,
}
const loadState = () => {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('私信状态无法读取，已停止推进已读位置：' + error.message) }
}
const saveState = (o) => {
  fs.mkdirSync(path.dirname(STATE), { recursive: true })
  const temp = STATE + '.' + process.pid + '.tmp'
  try { fs.writeFileSync(temp, JSON.stringify(o, null, 2) + '\n'); fs.renameSync(temp, STATE) }
  finally { fs.rmSync(temp, { force: true }) }
}
const parsed = (content) => {
  // 私信内容可能是 {"content":"…"} 或纯文本
  try { const j = JSON.parse(String(content)); return String(j.content ?? j.text ?? content) } catch { return String(content ?? '') }
}

async function poll() {
  const u = 'https://api.vc.bilibili.com/session_svr/v1/session_svr/get_sessions?session_type=1&group_id=0&count=20&mobi_app=web'
  const r = await fetch(u, { headers: H })
  const j = await r.json().catch(() => ({}))
  if (j.code !== 0) return { ok: false, why: `get_sessions code=${j.code} ${j.message ?? ''}` }
  const list = j.data?.session_list ?? []
  const mine = list.find((s) => String(s.talker_id) === OWNER)
  if (!mine) return { ok: true, hit: false, why: '没找到主人的会话' }
  const last = mine.last_msg ?? {}
  const ts = Number(last.timestamp ?? 0)
  const text = parsed(last.content)
  const sender = Number(last.sender_uid ?? 0)
  const fromOwner = String(sender) === OWNER      // 只有主人发的才算
  const key = String(last.msg_key ?? last.msg_seqno ?? crypto.createHash('sha256').update(JSON.stringify([ts, sender, text])).digest('hex'))
  return { ok: true, ts, key, text, fromOwner, unread: Number(mine.unread_count ?? 0) }
}

if (BASE) {
  const r = await poll()
  if (!r.ok) { console.error(`✗ ${r.why}`); process.exit(3) }
  saveState({ owner: OWNER, lastSeen: r.ts || 0, lastKey: r.key, at: new Date().toISOString() })
  console.log(`已把当前私信状态标记为已读（lastSeen=${r.ts}）✓ 从现在起只认新消息`)
  process.exit(0)
}

let st = loadState()
if (st.owner && st.owner !== OWNER) st = {}
// Scheduler delivery is two-phase: persist a receipt before returning a hit,
// acknowledge only once the host accepts the prompt. Retries read the same hit.
if (opt.ack) {
  if (!st.pending || st.pending.receipt !== String(opt.ack) || st.pending.mid !== OWNER) {
    console.error('私信确认凭据不匹配，未推进已读状态'); process.exit(2)
  }
  saveState({ owner: OWNER, lastSeen: st.pending.ts, lastKey: st.pending.key, at: new Date().toISOString() })
  console.log('私信交付已确认'); process.exit(0)
}
if (st.pending?.mid === OWNER) {
  console.log(JSONOUT ? JSON.stringify(st.pending) : `DM_HIT mid=${OWNER} ts=${st.pending.ts} text=${st.pending.text}`)
  process.exit(0)
}
const r = await poll()
if (!r.ok) { console.error(`✗ ${r.why}`); process.exit(3) }
const lastSeen = Number(st.lastSeen ?? 0)
const hit = r.fromOwner && (r.ts > lastSeen || (r.ts === lastSeen && st.lastKey && r.key !== st.lastKey))
if (hit) {
  const result = { hit: true, mid: OWNER, name: OWNER_NAME, text: r.text, ts: r.ts, key: r.key }
  if (PEEK) {
    result.receipt = crypto.randomUUID()
    saveState({ ...st, owner: OWNER, pending: result })
  } else saveState({ owner: OWNER, lastSeen: r.ts, lastKey: r.key, at: new Date().toISOString() })
  if (JSONOUT) console.log(JSON.stringify(result))
  else console.log(`DM_HIT mid=${OWNER} name=${OWNER_NAME} ts=${r.ts} text=${r.text.replace(/\n/g, ' ').slice(0, 200)}`)
  process.exit(0)
}
// 没命中：把 lastSeen 往前推（避免旧消息反复触发；但只在对方是主人时推）
if (r.ts > lastSeen) saveState({ owner: OWNER, lastSeen: r.ts, lastKey: r.key, at: new Date().toISOString() })
if (JSONOUT) console.log(JSON.stringify({ hit: false }))
else if (!ONCE) console.log('无新私信')
process.exit(1)
