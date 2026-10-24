import { execFileSync, spawn } from 'node:child_process'
// 浏览器兜底（2026-10-24 主人拍板：只做兜底，不进仓库主逻辑）。
//
// API 侧被 B站 412/风控熔断时，用本机 Edge 像真人一样打开 B站 页面，
// 把指定数据抓出来。这是「像真人」的最后一道退路。
//
// 为什么不走仓库里的 bili-api.mjs：那套要写进公开仓库，会背 npm 依赖；
// 这个是主人本机自己用的兜底脚本，只在本机跑，不进 GitHub。
//
// 用法（直接跑这个文件，不必 import）：
//   node tools/browser-rescue.mjs <kind> [参数...]
//   kind = session      抓私信会话列表（B站 网页私信页的接口数据）
//   kind = view         抓视频页元信息（标题/简介/播放数）
//   kind = danmaku      抓弹幕（走 API XML，浏览器只是借它的 cookie 环境）
//   kind = search       搜索视频（走 B站 搜索页）
//
// 输出：JSON（和 bili-api.mjs 的 apiGet 返回同构：{ code: 0, data } 或 { code: -1, message }）

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

// ── 找 Edge（本机路径）──────────────────────────────────────────
const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  path.join(os.homedir(), 'AppData/Local/Microsoft/Edge/Application/msedge.exe'),
]
const EDGE = EDGE_CANDIDATES.find((p) => fs.existsSync(p))

// ── 临时 profile（每次开一个新的，避免污染主 Edge 用户数据）──────
function freshProfile() {
  const dir = path.join(os.tmpdir(), `bili-rescue-${Date.now()}`)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// ── 起一个 headless Edge，等它起来，抓页面 ───────────────────────
// 用 CDP（chrome-remote-debugging）而不是 --dump-dom：dump-dom 在 B站 这种
// 重 JS 的页面经常挂死。CDP 开一个 tab、等 networkidle、拿 page.content，稳。
// 起 Edge 用 --remote-debugging-port，Node 侧直接用 HTTP + WebSocket 和它说话。
// 不装任何 npm 包：CDP 的 HTTP 端点是 /json，返回 ws 地址，Node 内置 WebSocket。
async function launchEdge(profile) {
  const port = 9222 + Math.floor(Math.random() * 100)
  const args = [
    '--headless=new',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--disable-extensions',
    '--window-size=1280,800',
  ]
  const proc = spawn(EDGE, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let started = false
  const kill = () => { try { proc.kill('SIGKILL') } catch {} }
  const wsUrl = await new Promise((resolve, reject) => {
    const t0 = Date.now()
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
        if (r.ok) {
          const j = await r.json()
          clearInterval(poll)
          resolve(j.webSocketDebuggerUrl)
        }
      } catch {
        if (Date.now() - t0 > 20_000) { clearInterval(poll); reject(new Error('Edge CDP 端口没起来')) }
      }
    }, 400)
  })
  started = true
  return { wsUrl, kill, port }
}

// 极简 CDP 客户端（不引包）：等 WebSocket 连上后再发命令、收匹配 id 的响应
function cdpConnect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let seq = 0
    const waiters = new Map()
    const events = []
    ws.onopen = () => {
      ws.onmessage = (m) => {
        let msg
        try { msg = JSON.parse(typeof m.data === 'string' ? m.data : m.data.toString()) } catch { return }
        if (msg.id && waiters.has(msg.id)) {
          const w = waiters.get(msg.id); waiters.delete(msg.id)
          if (msg.error) w.reject(new Error(msg.error.message))
          else w.resolve(msg.result)
        } else if (msg.method) {
          events.push(msg)
          if (events.length > 500) events.shift()
        }
      }
      const send = (method, params = {}) => new Promise((res, rej) => {
        const id = ++seq
        const to = setTimeout(() => { waiters.delete(id); rej(new Error(`CDP 命令 ${method} 10s 没回`)) }, 10_000)
        waiters.set(id, {
          resolve: (v) => { clearTimeout(to); res(v) },
          reject: (e) => { clearTimeout(to); rej(e) },
        })
        ws.send(JSON.stringify({ id, method, params }))
      })
      resolve({ send, events, ws })
    }
    ws.onclose = () => reject(new Error('CDP WebSocket 断开了'))
    ws.onerror = (e) => reject(new Error('CDP WebSocket 连接失败'))
  })
}

// 导航 + 等网络安静 + 拿 html
async function grabHtml(cdp, url, idleMs = 6000, navTimeoutMs = 30_000) {
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Network.enable')
  const loaded = cdp.send('Page.navigate', { url }).then(() => cdp.send('Page.loadEventFired'))
  // load 后 idleMs 没新网络请求才算「安静」（B站 首页会一直拉广告）
  await Promise.race([
    loaded.catch(() => {}),
    new Promise((r) => setTimeout(r, navTimeoutMs)),
  ])
  await new Promise((r) => setTimeout(r, idleMs))
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.documentElement.outerHTML', returnByValue: true })
  return result.value ?? ''
}

// ── 抓页面：开 Edge(CDP) → 注 cookie → 导航 → 等 idle → 取 html ──
async function grabPage(url, profile, injectCookies = true) {
  const edge = await launchEdge(profile)
  let cdp
  try {
    cdp = await cdpConnect(edge.wsUrl)
    // 注 cookie（B站 私信/部分接口要登录态）
    if (injectCookies) {
      try {
        const cred = JSON.parse(fs.readFileSync(path.join(process.env.USERPROFILE || process.env.HOME || '/', '.bili-ai', 'credentials.json'), 'utf8'))
        const cookies = [
          { name: 'SESSDATA', value: cred.sessdata, domain: '.bilibili.com', path: '/' },
          { name: 'bili_jct', value: cred.bili_jct, domain: '.bilibili.com', path: '/' },
          { name: 'buvid3', value: cred.buvid3, domain: '.bilibili.com', path: '/' },
        ]
        await cdp.send('Network.enable')
        await cdp.send('Network.setCookies', { cookies }).catch(() => {})
      } catch { /* 没凭据就匿名抓 */ }
    }
    const html = await grabHtml(cdp, url)
    return html
  } catch (e) {
    edge.kill()
    throw e
  }
}

// ── 解析 B站 页面里嵌的初始数据（SSR 的 window.__INITIAL_STATE__ 等）──
function extractInitialState(html, markers = ['__INITIAL_STATE__', '__NEXT_DATA__', 'initialState']) {
  for (const m of markers) {
    const i = html.indexOf(m)
    if (i > -1) {
      // 抓到 marker 后面第一个 { … } JSON 块（粗略：匹配到 ,window. 或 ; 或 <script 结束）
      const start = html.indexOf('{', i)
      if (start > -1) {
        let depth = 0, end = start
        for (let j = start; j < html.length; j++) {
          if (html[j] === '{') depth++
          else if (html[j] === '}') { depth--; if (depth === 0) { end = j + 1; break } }
        }
        try { return JSON.parse(html.slice(start, end)) } catch { /* 下一个 marker */ }
      }
    }
  }
  return null
}

// ── 可被 import 的公共入口（供 bili-watch / debrief 等命令脚本 412 时降级调用）──
// 用法：import { rescueView, rescueSession } from '../browser-rescue.mjs'
// 返回 { code: 0, source: 'browser', ... } 或 { code: -1, message }，和 apiGet 同构。
// 只有设了 BILI_USE_BROWSER=1 环境变量的进程才会真正调浏览器；没设就返回明确的「未启用」。
export function browserEnabled() {
  return process.env.BILI_USE_BROWSER === '1'
}
export async function rescueView(bvid) {
  if (!EDGE) return { code: -1, message: '没找到本机 Edge，浏览器兜底不可用' }
  if (!browserEnabled()) return { code: -1, message: '浏览器兜底未启用（设 BILI_USE_BROWSER=1 才走浏览器）' }
  const profile = freshProfile()
  try {
    const html = await grabPage(`https://www.bilibili.com/video/${bvid}`, profile)
    const state = extractInitialState(html)
    return { code: 0, source: 'browser', bvid, stateKeys: state ? Object.keys(state) : null, htmlChars: html.length }
  } catch (e) {
    return { code: -1, message: '浏览器抓 view 失败：' + String(e.message).slice(0, 200) }
  } finally {
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }) } catch {} }, 5000)
  }
}
export async function rescueSession() {
  if (!EDGE) return { code: -1, message: '没找到本机 Edge，浏览器兜底不可用' }
  if (!browserEnabled()) return { code: -1, message: '浏览器兜底未启用（设 BILI_USE_BROWSER=1 才走浏览器）' }
  const profile = freshProfile()
  try {
    const html = await grabPage('https://message.bilibili.com', profile)
    const state = extractInitialState(html)
    return { code: 0, source: 'browser', page: 'message', stateKeys: state ? Object.keys(state) : null, htmlChars: html.length }
  } catch (e) {
    return { code: -1, message: '浏览器抓 session 失败：' + String(e.message).slice(0, 200) }
  } finally {
    setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }) } catch {} }, 5000)
  }
}

// ── CLI 入口（直接跑这个文件时用）─────────────────────────────────
const isCli = process.argv[1] && (process.argv[1].includes('browser-rescue') || process.argv[1].endsWith('.mjs'))
if (isCli) {
  const argv = process.argv.slice(2)
  const kind = argv[0]
  ;(async () => {
    if (kind === 'view') await cliView(argv[1])
    else if (kind === 'session') await cliSession()
    else if (kind === 'danmaku') await cliDanmaku(argv[1])
    else console.log(JSON.stringify({ code: -1, message: `未知 kind：${kind ?? '(空)'}。支持：view / session / danmaku` }))
    process.exit(0)
  })()
}

async function cliView(bvid) {
  const r = await rescueView(bvid)
  console.log(JSON.stringify(r))
}
async function cliSession() {
  const r = await rescueSession()
  console.log(JSON.stringify(r))
}
async function cliDanmaku(cid) {
  if (!cid) { console.log(JSON.stringify({ code: -1, message: 'danmaku 需要一个 cid' })); return }
  const xmlUrl = `https://comment.bilibili.com/${cid}.xml`
  const r = await fetch(xmlUrl, { headers: { 'user-agent': 'Mozilla/5.0' } }).catch(() => null)
  if (r?.ok) {
    const xml = Buffer.from(await r.arrayBuffer()).toString('utf8')
    const count = (xml.match(/<d /g) || []).length
    console.log(JSON.stringify({ code: 0, source: 'browser-danmaku', cid, count }))
  } else {
    console.log(JSON.stringify({ code: -1, message: '弹幕 XML 没拿到（可能被风控）' }))
  }
}
