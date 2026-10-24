// dm-peek.mjs —— 白名单私信（梅林）：对指定 peer mid 读私信 / 发私信 / 推进状态
//
// 为什么单独一个命令（不扩 dm.mjs）：
//   活鱼的 dm.mjs 三条写死 —— 一天只锁定 1 个收信人 + 只发给 owner.mid + 必须互关。
//   白名单回复要发给**任意白名单 mid**（一天可多个 peer 各 1 条 ✓ 但每个 peer 受 dailyLimit 限制）。
//   所以单独开一条通道，复用同样的 send 接口、同样的稳定 dev_id、同样的凭据层 ✓。
//
// 用法:
//   node bili.mjs dm-peek --mid <peer-mid> --list            读最近 20 条（含时间戳 / 谁发的 / 正文）
//   node bili.mjs dm-peek --mid <peer-mid> --msg "…" --go    发 1 条给该 peer（必须互关 ✓）
//   node bili.mjs dm-peek --mid <peer-mid> --advance        推进 ~/.bili-ai/dm-<mid>-state.json 的 lastPeerTs
//
// 三条硬规则（与规格一致）：
//   ① 只回白名单 —— 白名单在 ~/.bili-ai/dm-peers.json，这里的 --mid 必须在里面且 enabled ✓
//   ② 对方没来消息就不发（--list 只读；--msg 只在你看到对方新消息后才用）
//   ③ 一天 ≤ dailyLimit 条（读 state.json 的 repliedToday 判断，到上限就拒发）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../lib/config.mjs'
import { loadCred, missingForWrite, explainCode } from '../lib/cred.mjs'
import { stableDevIdIfAny } from './dm-devid.mjs'

const argv = process.argv.slice(2)
const opt = {}
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) {
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) opt[argv[i].slice(2)] = true
    else { opt[argv[i].slice(2)] = v; i += 1 }
  }
}
const MID = String(opt.mid ?? '').trim()
if (!MID || !/^\d{2,15}$/.test(MID)) {
  console.error('用法: node dm-peek.mjs --mid <数字> [--list | --msg "…" --go | --advance]')
  process.exit(2)
}

const HOME = process.env.USERPROFILE || process.env.HOME || '.'
const PEERS_FILE = path.join(HOME, '.bili-ai', 'dm-peers.json')
const STATE_FILE = path.join(HOME, '.bili-ai', `dm-${MID}-state.json`)
const today = () => new Date().toLocaleDateString('sv-SE')

const readPeers = () => { try { const j = JSON.parse(fs.readFileSync(PEERS_FILE, 'utf8')); return Array.isArray(j) ? j : [] } catch { return [] } }
const readState = () => {
  let st = { lastPeerTs: 0, repliedToday: 0, repliedTodayDate: today() }
  try { st = { ...st, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } } catch {}
  if (st.repliedTodayDate !== today()) { st.repliedToday = 0; st.repliedTodayDate = today() }
  return st
}
const writeState = (st) => { fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2) + '\n') }

// ── ① 只回白名单 ─────────────────────────────────────────────────────
const peer = readPeers().find((p) => String(p.mid) === MID)
if (!peer) {
  console.error(`✗ mid ${MID} 不在白名单（~/.bili-ai/dm-peers.json）—— 白名单外一律不理 ✗`)
  process.exit(2)
}
if (peer.enabled === false) {
  console.error(`✗ mid ${MID} 在白名单里但已停用 —— 设置页里把它启用再试`)
  process.exit(2)
}
const dailyLimit = Math.min(10, Math.max(1, Number(config().dm?.dailyLimit ?? peer.dailyLimit ?? 1)))

const cred = loadCred()
const miss = missingForWrite(cred)
if (miss.length) {
  console.error('✗ 凭据不完整：')
  for (const m of miss) console.error('   · 缺 ' + m)
  process.exit(2)
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'
const H = {
  'user-agent': UA,
  referer: 'https://message.bilibili.com/',
  cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3}`,
}
const jget = async (u) => (await fetch(u, { headers: H })).json()

if (opt.list) {
  // 读最近 20 条
  const url = `https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs?talker_id=${MID}&session_type=1&size=20&build=0&mobi_app=web`
  const j = await jget(url)
  if (j.code !== 0) { console.error(`查询失败 code=${j.code} ${j.message ?? ''}`); process.exit(1) }
  const raw = j.data?.messages ?? []
  const msgs = raw.map((m) => {
    let text = ''
    try {
      const c = typeof m.content === 'string' ? JSON.parse(m.content) : m.content
      const mt = Number(m.msg_type) || 1
      if ((mt === 7 || mt === 8) && (c.jump_url || c.bvid || c.title)) {
        const bv = String(c.bvid ?? '') || (String(c.jump_url ?? '').match(/BV[0-9A-Za-z]{10}/) || [])[0]
        text = '[分享视频] ' + String(c.title ?? '').slice(0, 80) + (bv ? ' ' + bv : '')
      } else text = String(c?.content ?? c?.text ?? '')
    } catch { text = String(m.content ?? '') }
    return { ts: Number(m.timestamp ?? 0), from: Number(m.sender_uid) !== Number(peer.mid) ? 'peer' : 'me', text: text.slice(0, 500) }
  }).filter((m) => m.text).sort((a, b) => a.ts - b.ts)
  console.log(`mid ${MID}（${peer.name ?? ''}）最近 ${msgs.length} 条：`)
  for (const m of msgs.slice(-10)) {
    console.log(`  [${new Date(m.ts * 1000).toLocaleString('zh-CN', { hour12: false })}] ${m.from === 'peer' ? '对方' : '我'}：${m.text.slice(0, 120)}`)
  }
  const st = readState()
  const fresh = msgs.filter((m) => m.from === 'peer' && m.ts > (st.lastPeerTs || 0))
  console.log(`\n新消息（比 lastPeerTs 新）：${fresh.length} 条`)
  process.exit(0)
}

if (opt.advance) {
  // 推进 lastPeerTs 到「最近一条对方消息」+ 记 repliedToday+1
  const url = `https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs?talker_id=${MID}&session_type=1&size=20&build=0&mobi_app=web`
  const j = await jget(url)
  if (j.code !== 0) { console.error(`查询失败 code=${j.code}`); process.exit(1) }
  const raw = j.data?.messages ?? []
  const st = readState()
  let lastPeerTs = 0
  for (const m of raw) {
    const t = Number(m.timestamp ?? 0)
    if (Number(m.sender_uid) !== Number(peer.mid)) continue
    let isPeer = true
    try {
      const c = typeof m.content === 'string' ? JSON.parse(m.content) : m.content
      // 自己发的内容里 content 也在，但 sender_uid 已经判定过了 → 信 sender_uid
    } catch {}
    if (t > lastPeerTs) lastPeerTs = t
  }
  st.lastPeerTs = lastPeerTs
  st.repliedToday = (st.repliedToday ?? 0) + 1
  writeState(st)
  console.log(`✓ 已推进 lastPeerTs 到 ${new Date(lastPeerTs * 1000).toLocaleString('zh-CN', { hour12: false })}（repliedToday=${st.repliedToday}/${dailyLimit}）`)
  process.exit(0)
}

// ── 发消息 ───────────────────────────────────────────────────────────
const MSG = String(opt.msg ?? '').trim()
if (!MSG) { console.error('发消息需要 --msg "…"'); process.exit(2) }
if (MSG.length > 500) { console.error(`✗ 太长了（${MSG.length} 字 > 500），私信上限 500`); process.exit(2) }

// ③ 一天 ≤ dailyLimit 条
const st = readState()
if ((st.repliedToday ?? 0) >= dailyLimit) {
  console.error(`✗ 今日该 peer 已回 ${st.repliedToday}/${dailyLimit} 条 —— 到上限就**别再回**（对方下条消息等明天）`)
  process.exit(4)
}

// 互关校验（白名单 peer 也要互关才能发 ✓）
const rel = await jget(`https://api.bilibili.com/x/relation?fid=${MID}`)
const attr = Number(rel?.data?.attribute ?? -1)
if (rel.code !== 0 || (attr !== 2 && attr !== 6)) {
  console.error(`✗ 拒发：与 mid ${MID} 的 relation attribute=${attr}（需要 2 或 6 互关）—— 先去 B站 互关`)
  process.exit(4)
}

if (!opt.go) {
  console.log(`[dry] 关系 OK（attribute=${attr}），将发送 ${MSG.length} 字：\n${MSG}\n（未发送 ✓）`)
  process.exit(0)
}

// 发送（复用活鱼 dm.mjs 的 send_msg 接口 + 稳定 dev_id ✓）
const nav = await jget('https://api.bilibili.com/x/web-interface/nav')
if (!nav.data?.isLogin) { console.error('✗ 未登录（cookie 失效 ✗）'); process.exit(3) }
const myMid = String(nav.data.mid)
const devId = stableDevIdIfAny() || 'WEB-' + Math.random().toString(16).toUpperCase().replace(/-/g, '').slice(0, 20)

const body = new URLSearchParams()
body.set('msg[sender_uid]', myMid)
body.set('msg[receiver_id]', MID)
body.set('msg[receiver_type]', '1')
body.set('msg[msg_type]', '1')
body.set('msg[dev_id]', devId)
body.set('msg[timestamp]', String(Math.floor(Date.now() / 1000)))
body.set('msg[content]', JSON.stringify({ content: MSG }))
body.set('csrf', cred.bili_jct)
body.set('csrf_token', cred.bili_jct)

const s = await fetch('https://api.vc.bilibili.com/web_im/v1/web_im/send_msg', {
  method: 'POST',
  headers: { ...H, 'content-type': 'application/x-www-form-urlencoded' },
  body: body.toString(),
})
const sj = await s.json().catch(() => ({}))
if (sj.code !== 0) {
  console.error(`✗ 发送失败 code=${sj.code} ${explainCode(sj.code)}${sj.message ? '（B站原文：' + sj.message + '）' : ''}`)
  process.exit(3)
}
// 发成功 → 记账（统一走 quota 账本 ✓）
console.log(`✓ 已发送给 mid ${MID}（${MSG.length} 字）msg_key=${sj.data?.msg_key ?? '-'}`)
// 让 quota 记一笔（dm-reply 类型，统一记账入口）
try {
  const here2 = path.dirname(fileURLToPath(import.meta.url))
  const { NODE_EXE } = await import('../lib/nodebin.mjs')
  const { execFileSync } = await import('../lib/capture.mjs')
  execFileSync(NODE_EXE, [path.join(here2, 'quota.mjs'), 'record', '--type', 'dm-reply', '--target', `peer:${MID}`, '--auto'], { stdio: 'inherit' })
} catch { /* quota 记账失败不挡发送 */ }
process.exit(0)
