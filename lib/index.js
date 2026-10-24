/**
 * dsh-bili-merlin —— 宿主侧插件（在活鱼 dsh-bili-whale 工具链之上加三项能力）
 *
 * 三项新能力（不碰活鱼主流程，决策层/生物钟/抽帧/两本日记全沿用活鱼 ✓）：
 *   ① 私信双向（白名单）：lib/dm-peers.js + tick 里对每个白名单拉新消息 → 回 1 条（一天 ≤1）
 *   ② 观看记录卡片墙：GET /dsh-bili-merlin/api/history?limit=20&filter=all|picked|skipped|shared
 *   ③ 环境自检：POST /dsh-bili-merlin/api/selfcheck → [{name, ok, detail, fix}]
 *
 * 配置/凭据与活鱼共用同一份文件（~/.dsh/bili-whale.config.json + ~/.bili-ai/credentials.json）✓
 * 生物钟沿用活鱼的 sessionId（默认 bili-whale）—— 跨天复用同一会话，不新建 ✓
 *
 * 所有路由都过信任栅栏（connection.requestRejection）：DSH Web 端口是回环地址，
 * 浏览器里任何网页都能向回环发请求 —— 不加栅栏等于把配置与账号凭据开放给任意页面。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveWorkDir } from './work-dir.js'
import { resolveNodeRuntime, nodeEnv } from './node-runtime.js'
import { buildHistory } from './history.js'
import { startScheduler } from './scheduler.js'
import { runSelfcheck } from './selfcheck.js'
import { HOME, DSH_HOME, configPath, credentialsPath } from '../tools/lib/paths.mjs'

/** 生物钟状态：{ ok, reason, at } —— 设置页/体检用它回答「时钟是不是活的」 */
let SCHED_STATUS = { ok: false, reason: "未初始化", at: null }



/**
 * execFile 的安全包装：NODE_EXE 解析失败时不让 execFile(null, …) 抛 TypeError，
 * 而是把原因通过回调交给调用方（设置页就能显示真因，而不是一个空 stdout）。
 */
function execNode(args, options, cb) {
  if (!NODE_EXE) {
    const msg = globalThis.__biliWhaleNodeError || '未找到可用的 node 运行时'
    cb?.(new Error(msg), '', msg)
    return null
  }
  return execFile(NODE_EXE, args, { ...options, env: { ...nodeEnv(DSH_HOME), ...options?.env } }, cb)
}


// 2026-10-19：真 node 路径（Electron 的 process.execPath 是 Harness.exe ✗ 跑不了 node 脚本）
const NODE_EXE = (() => {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  try {
    return resolveNodeRuntime(dshHome)
  } catch (e) {
    // 不静默回退：process.execPath 在桌面端是 Electron 主程序，跑不了脚本。
    // 这里只记录，具体失败由各调用点按自身语义报出（设置页体检会显示原因）。
    globalThis.__biliWhaleNodeError = String(e?.message ?? e)
    return null
  }
})()

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CFG_FILE = configPath
const CRED_FILE = credentialsPath
// 2026-10-21 修 Issue #6：她的会话工作目录必须是**专用小目录**，不能用用户主目录 ✗
//   原因：DSH 的 Windows 沙箱会把会话 cwd 当"工作区"，主目录当工作区会让权限/完整性标签
//   影响到主目录下的其它程序（实测有人 DSH / VS Code 起不来）✗
//   放在 ~/.dsh/whale-work 里，范围最小，也不会碰任何别的东西 ✓
const WORK_DIR = path.join(DSH_HOME, 'whale-work')


/** 默认配置（与活鱼 lib/config.mjs 的中性默认对齐；梅林多 dmPeers / history / selfcheck 三块） */
const DEFAULTS = {
  owner: { mid: '', name: '' },
  night: {
    windows: [{ start: '20:00', end: '24:00', wakes: 1 }],
    skipChance: 0.3,
    minGapMin: 10, maxVideos: 5,
  },
  preferences: {
    like: ['DSH/AI 工具与插件', '鬼畜与怀旧向剪辑', '猫咪', 'Live2D/模型', 'B站生态八卦'],
    dislike: ['带货', '擦边', '标题党', '纯搬运'],
    keywords: [],
  },
  quota: { shareDaily: 3 },
  diary: { push: true, enabled: true },
  // ④ 补上 persona / self（和活鱼 tools/lib/config.mjs 对齐 ✓ 否则设置页首次打开是空的 ✗）
  persona: { name: '', ownerTitle: '主人', selfClaim: '我' },
  self: { mid: '', name: '' },
  notify: { type: 'none', url: '', template: 'text', cmd: '' },
  listen: { comment: true, commentIntervalSec: 300, scope: 'both', oncePerPerson: false, allDay: false, dm: false, live: false, liveRoom: '', liveScope: 'owner' },
  // 2026-10-23：分享方式默认改成 dm（不扰民 ✓ 不占评论区）；原 via 是 comment
  share: { enabled: true, via: 'dm', minScore: 13, silentAfterDays: 3 },
  toolsPath: '',
  // ── 梅林新增（2026-10-23）──────────────────────────────────────────
  // ① 私信双向（白名单）：只回这些 mid；对方没来消息就不发；一天 ≤ dailyLimit 条
  //   数据源 ~/.bili-ai/dm-peers.json；进度 ~/.bili-ai/dm-<mid>-state.json
  dm: {
    dailyLimit: 1,
  },
  // ② 观看记录卡片墙
  history: { pageSize: 20 },
  // ③ 环境自检（启动跑一次只记日志，不打扰）
  selfcheck: { onStart: true },
  // ── 动作开关（2026-10-24 加：六个 B 站互动动作的开关 + 每日上限）────────────
  // 设置页「动作开关」组改这里；工具链 tools/commands/quota.mjs 的 check 分支读它。
  // 缺键时 quota.mjs 按 enabled=true + 下面这些默认上限处理（不报错 ✓）。
  actions: {
    like: { enabled: true, dailyLimit: 10 },
    coin: { enabled: true, dailyLimit: 3 },
    fav: { enabled: true, dailyLimit: 3 },
    follow: { enabled: true, dailyLimit: 3 },
    "like-comment": { enabled: true, dailyLimit: 10 },
    triple: { enabled: true, dailyLimit: 2 },
  },
}

const clone = (o) => JSON.parse(JSON.stringify(o))
const merge = (base, over) => {
  const out = { ...base }
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(base[k] ?? {}, v) : v
  }
  return out
}

/** 工具链里 bili.mjs 的位置：① 设置里的 toolsPath ② 插件自带的 tools/ ③ 开发目录 */
function resolveBiliMjs() {
  const cfg = readConfig()
  // 2026-10-18：去掉"作者机器"回退 ✗（换机器就是静默失效）→ 只有两个候选：设置里的 toolsPath / 插件自带 tools/ ✓
  return cfg.toolsPath || path.join(HERE, '..', 'tools', 'bili.mjs')
}

function readConfig() {
  let user = {}
  try { user = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) } catch { /* 没配就用默认 */ }
  return { ...merge(DEFAULTS, user), __hasUserFile: Object.keys(user).length > 0 }
}

function writeConfig(next) {
  // 2026-10-24 修：readConfig() 会带一个 __hasUserFile 标记，那是内存用的，
  // 不能写回磁盘 —— 以前每次保存都会把它留在配置文件里。
  const out = { ...next }
  delete out.__hasUserFile
  fs.mkdirSync(path.dirname(CFG_FILE), { recursive: true })
  fs.writeFileSync(CFG_FILE, JSON.stringify(out, null, 2) + '\n')
}

/** 只回"能不能用"，不回显任何凭据内容 */
function credState() {
  try {
    const c = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'))
    return { present: true, hasSess: !!c.sessdata, hasJct: !!c.bili_jct, hasBuvid: !!c.buvid3 }
  } catch { return { present: false, hasSess: false, hasJct: false, hasBuvid: false } }
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export default {
  name: 'dsh-bili-merlin',
  // ⚠️ 2026-10-18 踩的坑：这里以前**写了两个 inject 键** ✗ —— 对象字面量后者覆盖前者 →
  //   `sessionController` 没被注入 → 生物钟每 60 秒静默 `return`（不报错、也不干活 ✗）
  //   一个数组写全 ✓
  inject: ['sessionController', 'webServer', 'connection'],
  apply(ctx) {

/** 写操作只认本机回环（2026-10-17 加，Kimi 评审指出）：DSH 的 Web 端口万一绑到 0.0.0.0，
 *  局域网里任何人都能改 cookie / 换主人 mid —— 那样"@分享"就全 @ 给攻击者了。
 *  这一层是兜底：host 不是回环就直接 403。 */
function isLoopbackReq(req) {
  const host = String(req.headers?.host ?? '').toLowerCase()
  const h = host.split(':')[0]
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1'
}

    // P1-1（Kimi 评审 #8）：这条路以前是 fail-open —— connection 缺失/抛错就**放行** ✗
    // 安全组件的默认值必须是"关"：栅栏不可用 → 拒绝（写操作尤其），只对静态页面留一条活路。
    function rejected(req, res, { strict = true } = {}) {
      if (isLoopbackReq(req) === false) {
        // 连 Host 都不是回环 → 一律拒（防"服务绑到 0.0.0.0"那种情况）
        json(res, 403, { ok: false, error: '只接受本机回环访问' })
        return true
      }
      try {
        const conn = ctx.get('connection') || ctx.connection
        if (!conn || typeof conn.requestRejection !== 'function') {
          if (!rejected.warned) {
            rejected.warned = true
            console.warn('[bili-whale] 信任栅栏不可用：connection 服务缺失 → 按 fail-closed 处理')
          }
          if (strict) { json(res, 503, { ok: false, error: '信任栅栏不可用，拒绝访问（fail-closed）' }); return true }
          return false
        }
        const code = conn.requestRejection(req)
        if (code === undefined || code === null || code === false) return false
        res.statusCode = typeof code === 'number' ? code : 403
        res.end()
        return true
      } catch (e) {
        if (strict) { json(res, 503, { ok: false, error: '信任栅栏异常，拒绝访问（fail-closed）' }); return true }
        return false
      }
    }

    const disposers = []
    function route(kind, pathname, handler) {
      disposers.push(ctx.webServer.register({
        kind,
        path: pathname,
        handler: async (req, res) => {
          if (rejected(req, res)) return
          try { await handler(req, res) } catch (err) {
            try { json(res, 500, { ok: false, error: String(err?.message ?? err) }) } catch {}
          }
        },
      }))
    }

    // 旧的独立设置页已下线（2026-10-18）：DSH 的信任栅栏不认插件路径，这个页面在浏览器里永远 403 ✗
    // 设置页唯一的入口是「设置 → 养鱼」（lib/client.js）。旧的 lib/settings.html 已删除（2026-10-22）✓
    // 需要本地直开时：把该文件拷到桌面双击（它的 API 调用会被栅栏拒，只作静态预览 ✓）

    // 写设置：浅合并，但**只接受已知的顶层字段** ✓（2026-10-18 加白名单，兑现这句注释 ✗ 原来是什么都收）
    // P0-2（Kimi 评审 #2）：读和写**合成一个 handler**（原来同一路径注册两次，
    //   宿主若是"首个匹配即终止"，后注册的 POST 永远收不到请求 ✗）
    // ── 梅林说明 ── 旧的 /dsh-bili/api/* 路由由已装的 dsh-bili-whale 提供 ✓ 这里不再重复注册（避免 duplicate exact route）
//    客户端 client.js 里的 API = /dsh-bili/api/* 走的是 whale 的注册 ✓

    // ══ 梅林自立（2026-10-23）：配置 / 凭据 / 人设 / 体检 / 待审 / 通知 / 状态 ══
    // 这些原本依赖活鱼 dsh-bili-whale 的 /dsh-bili/api/* 接口。
    // 现在全部搬进梅林自己的 /dsh-bili-merlin/api/*，活鱼在不在都能用。

    const PERSONA_FILE = path.join(HOME, '.bili-ai', 'persona.md')
    const PENDING_FILE = path.join(HOME, '.bili-ai', 'pending-replies.json')

    // 读 / 写配置（浅合并 + 顶层白名单）
    route('exact', '/dsh-bili-merlin/api/settings', async (req, res) => {
      if (req.method === 'GET') { json(res, 200, { ok: true, config: readConfig(), credentials: credState(), configPath: CFG_FILE }); return }
      if (!isLoopbackReq(req)) { json(res, 403, { ok: false, error: '只接受本机回环访问' }); return }
      if (req.method !== 'POST') { json(res, 405, { ok: false }); return }
      const body = JSON.parse(await readBody(req) || '{}')
      const cur = readConfig()
      delete cur.__hasUserFile
      const incoming = (body && typeof body.config === 'object' && body.config) || body || {}
      const KNOWN = new Set(['persona', 'preferences', 'notify', 'aliases', 'owner', 'self', 'quota', 'share', 'listen', 'diary', 'night', 'toolsPath', 'home', 'dm', 'history', 'selfcheck', 'actions'])
      const filtered = {}
      for (const [k, v] of Object.entries(incoming)) if (KNOWN.has(k)) filtered[k] = v
      const next = merge(cur, filtered)
      const n = next.night
      if (!Array.isArray(n.windows) || !n.windows.length) { json(res, 400, { ok: false, error: '至少要有一个作息窗口' }); return }
      n.maxWakesPerDay = Math.min(12, Math.max(0, Number(n.maxWakesPerDay ?? 0) || 0))
      n.skipChance = Math.min(0.95, Math.max(0, Number(n.skipChance) || 0))
      n.minGapMin = Number.isFinite(Number(n.minGapMin)) ? Math.max(1, Number(n.minGapMin)) : 10
      n.maxVideos = Math.min(20, Math.max(1, Number(n.maxVideos) || 5))
      const sd = Number(next.quota.shareDaily)
      next.quota.shareDaily = Number.isFinite(sd) ? Math.min(20, Math.max(0, sd)) : 3
      writeConfig(next)
      json(res, 200, { ok: true, config: next, warn: next.quota.shareDaily > 3 ? '分享条数 >3：看起来会像刷量，平台可能限流/封号' : null })
    })

    // 写凭据（只写不读回）
    route('exact', '/dsh-bili-merlin/api/cookie', async (req, res) => {
      if (!isLoopbackReq(req)) { json(res, 403, { ok: false, error: '只接受本机回环访问' }); return }
      if (req.method !== 'POST') { json(res, 405, { ok: false }); return }
      const b = JSON.parse(await readBody(req) || '{}')
      const pick = (raw, key) => {
        let v = String(raw ?? '').trim()
        const m = v.match(new RegExp('(?:^|;)\\s*' + key + '=([^;]+)', 'i'))
        if (m) return m[1].trim()
        v = v.replace(new RegExp('^' + key + '\\s*=', 'i'), '')
        v = v.replace(/^["'\s]+|["';\s]+$/g, '')
        return v
      }
      const sessdata = pick(b.sessdata, 'SESSDATA')
      const bili_jct = pick(b.bili_jct, 'bili_jct')
      const buvid3 = pick(b.buvid3, 'buvid3')
      const problems = []
      if (!sessdata) problems.push('SESSDATA 空着（它是 HttpOnly，document.cookie 读不到，必须 F12 手动复制）')
      else if (sessdata.length < 20) problems.push('SESSDATA 太短（长度 ' + sessdata.length + '）—— 大概只复制到一半')
      if (!bili_jct) problems.push('bili_jct 空着')
      else if (!/^[0-9a-fA-F]{32}$/.test(bili_jct)) problems.push('bili_jct 格式不对（长度 ' + bili_jct.length + '，B站目前是 32 位十六进制）')
      const buvid3LooksOdd = buvid3 && !/^[0-9A-Za-z]{6,}-[0-9A-Za-z-]{18,}$/.test(buvid3)
      if (problems.length) {
        json(res, 400, {
          ok: false,
          error: '凭据有问题，没写入：\n  · ' + problems.join('\n  · ') +
            '\n\n正确做法：浏览器打开 bilibili.com，F12，Application，Cookies，逐个双击 Value 复制（SESSDATA 和 bili_jct 两个都要）',
        })
        return
      }
      fs.mkdirSync(path.dirname(CRED_FILE), { recursive: true })
      fs.writeFileSync(CRED_FILE, JSON.stringify({ sessdata, bili_jct, buvid3 }, null, 2) + '\n')
      try { fs.chmodSync(CRED_FILE, 0o600) } catch {}
      let whoNow = null
      let navCode = null
      let navMsg = ''
      let navErr = null
      try {
        const navRes = await fetch('https://api.bilibili.com/x/web-interface/nav', {
          headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://www.bilibili.com/', cookie: `SESSDATA=${sessdata}; bili_jct=${bili_jct}; buvid3=${buvid3}` },
        })
        const navJson = await navRes.json().catch(() => ({}))
        navCode = navJson?.code ?? null
        navMsg = String(navJson?.message ?? '')
        if (navJson?.data?.isLogin && navJson.data.mid) {
          whoNow = { mid: String(navJson.data.mid), name: String(navJson.data.uname ?? '') }
          const cur = readConfig()
          writeConfig({ ...cur, self: whoNow })
        }
      } catch (e) { navErr = String(e?.message ?? e).slice(0, 120) }
      json(res, 200, {
        ok: true,
        warn: buvid3LooksOdd ? 'buvid3 格式有点怪（不影响使用）' : null,
        detail: whoNow
          ? `已写入，当前登录：${whoNow.name}（mid ${whoNow.mid}）`
          : '已写入，但 B站不认这个 cookie'
            + (navCode != null ? `（nav 返回 code=${navCode}${navMsg ? ' ' + navMsg : ''}）` : '')
            + (navErr ? `（请求失败：${navErr}）` : ''),
        self: whoNow,
      })
    })

    // 人设文件（只影响她的 bili 会话）
    route('exact', '/dsh-bili-merlin/api/persona', async (req, res) => {
      if (!isLoopbackReq(req)) { json(res, 403, { ok: false, error: '只接受本机回环访问' }); return }
      if (req.method === 'GET') {
        let text = ''
        try { text = fs.readFileSync(PERSONA_FILE, 'utf8') } catch {}
        let updatedAt = null
        try { updatedAt = fs.statSync(PERSONA_FILE).mtime.toISOString() } catch {}
        json(res, 200, { ok: true, text, bytes: Buffer.byteLength(text, 'utf8'), updatedAt })
        return
      }
      if (req.method !== 'POST') { json(res, 405, { ok: false }); return }
      const b = JSON.parse(await readBody(req) || '{}')
      const text = String(b.text ?? '')
      if (text.length > 20000) { json(res, 400, { ok: false, error: '太长（上限 20000 字）' }); return }
      try {
        fs.mkdirSync(path.dirname(PERSONA_FILE), { recursive: true })
        fs.writeFileSync(PERSONA_FILE, text, 'utf8')
        try { fs.chmodSync(PERSONA_FILE, 0o600) } catch {}
      } catch (e) { json(res, 500, { ok: false, error: '写入失败：' + String(e?.message ?? e).slice(0, 120) }); return }
      const bytes = Buffer.byteLength(text, 'utf8')
      json(res, 200, {
        ok: true,
        bytes,
        detail: text.trim() ? '已注入（' + bytes + ' 字节），下一次唤醒生效' : '已清空',
      })
    })

    // 依赖体检
    route('exact', '/dsh-bili-merlin/api/deps', async (req, res) => {
      const cfg = readConfig()
      const tools = cfg.toolsPath || path.join(HERE, '..', 'tools', 'bili.mjs')
      if (!fs.existsSync(tools)) {
        json(res, 200, { ok: false, error: `找不到 bili.mjs：${tools}（在设置里填「工具目录」）`, items: [], scheduler: SCHED_STATUS })
        return
      }
      execNode([tools, 'deps', '--json'], { timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
        try {
          const parsed = JSON.parse(String(stdout || '{}'))
          let selfNow = null
          try {
            const ck = (parsed.items ?? []).find((it) => it.name === 'B站 cookie')
            const m = String(ck?.detail ?? '').match(/已登录：(.+?)（mid (\d+)）/)
            if (m) {
              selfNow = { name: m[1], mid: m[2] }
              const cur = readConfig()
              if (String(cur.self?.mid ?? '') !== selfNow.mid || String(cur.self?.name ?? '') !== selfNow.name) writeConfig({ ...cur, self: selfNow })
            }
          } catch {}
          let selftestPassed = false
          try { selftestPassed = fs.existsSync(path.join(HOME, '.bili-ai', 'selftest-passed.json')) } catch {}
          json(res, 200, { ok: !!parsed.ok, items: parsed.items ?? [], node: parsed.node, self: selfNow, selftestPassed, scheduler: SCHED_STATUS })
        } catch {
          json(res, 200, { ok: false, error: String(stderr || err?.message || 'deps 跑失败').slice(0, 300), items: [] })
        }
      })
    })

    // 待审回复（读）
    route('exact', '/dsh-bili-merlin/api/pending', async (req, res) => {
      if (!isLoopbackReq(req)) { json(res, 403, { ok: false, error: '只接受本机回环访问' }); return }
      let items = []
      try { items = JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8')).items ?? [] } catch {}
      json(res, 200, { ok: true, items })
    })

    // 待审回复（否掉）
    route('exact', '/dsh-bili-merlin/api/pending/reject', async (req, res) => {
      if (!isLoopbackReq(req)) { json(res, 403, { ok: false, error: '只接受本机回环访问' }); return }
      if (req.method !== 'POST') { json(res, 405, { ok: false }); return }
      const b = JSON.parse(await readBody(req) || '{}')
      const id = String(b.id ?? '')
      if (!id) { json(res, 400, { ok: false, error: '需要 id' }); return }
      execNode([resolveBiliMjs(), 'reply-draft', 'drop', id], { timeout: 20000, windowsHide: true }, (err, stdout) => {
        if (!err) {
          try {
            fs.appendFileSync(path.join(DSH_HOME, 'whale-log.jsonl'),
              JSON.stringify({ at: new Date().toISOString(), kind: 'reply-rejected', target: null, note: `主人否掉了草稿 ${id}` }) + '\n')
          } catch {}
        }
        json(res, 200, { ok: !err, out: String(stdout ?? '').slice(0, 300) })
      })
    })

    // 待审回复（批准并发出）
    route('exact', '/dsh-bili-merlin/api/pending/approve', async (req, res) => {
      if (!isLoopbackReq(req)) { json(res, 403, { ok: false, error: '只接受本机回环访问' }); return }
      if (req.method !== 'POST') { json(res, 405, { ok: false }); return }
      const b = JSON.parse(await readBody(req) || '{}')
      const id = String(b.id ?? '')
      if (!id) { json(res, 400, { ok: false, error: '需要 id' }); return }
      const bili = resolveBiliMjs()
      let cfgNow = {}
      try { cfgNow = readConfig() } catch {}
      execNode([bili, 'reply-draft', 'take', id], { timeout: 20000, windowsHide: true }, (err, stdout) => {
        let item = null
        try { item = JSON.parse(String(stdout ?? '')) } catch {}
        if (!item) { json(res, 400, { ok: false, error: '队列里没有这条（可能已经发过）' }); return }
        const args = ['comment', '--oid', item.oid, '--root', item.root, '--parent', item.parent,
          '--message', item.message, '--auto', ...(cfgNow.listen?.oncePerPerson !== false ? ['--once-per-person'] : []), '--go']
        if (item.bvid) args.push('--bvid', item.bvid)
        execNode([bili, ...args], { timeout: 120000, windowsHide: true }, (e2, out2, err2) => {
          const text = String(out2 ?? '')
          const ok = !e2 && /code=0/.test(text)
          const rpid = (text.match(/rpid=(\d+)/) ?? [])[1] ?? null
          try {
            fs.appendFileSync(path.join(DSH_HOME, 'whale-log.jsonl'),
              JSON.stringify({ at: new Date().toISOString(), kind: ok ? 'reply-sent' : 'reply-failed', target: item.who || item.parent, note: `${ok ? '主人批准并发出' : '发送失败'} · ${String(item.message).slice(0, 60)}` }) + '\n')
          } catch {}
          if (!ok) {
            try {
              const back = ['reply-draft', 'add', '--oid', item.oid, '--message', item.message]
              if (item.bvid) back.push('--bvid', item.bvid)
              if (item.root) back.push('--root', item.root)
              if (item.parent) back.push('--parent', item.parent)
              if (item.who) back.push('--who', item.who)
              if (item.src) back.push('--src', item.src)
              execNode([bili, ...back], { timeout: 20000, windowsHide: true }, () => {})
            } catch {}
          }
          json(res, 200, { ok, rpid, out: text.slice(-600), err: String(err2 ?? '').slice(0, 400) })
        })
      })
    })

    // 通知渠道测试
    route('exact', '/dsh-bili-merlin/api/notify-test', async (req, res) => {
      if (!isLoopbackReq(req)) { json(res, 403, { ok: false, error: '只接受本机回环访问' }); return }
      if (req.method !== 'POST') { json(res, 405, { ok: false }); return }
      const cfg = readConfig()
      const tools = cfg.toolsPath || path.join(HERE, '..', 'tools', 'bili.mjs')
      const notifyMjs = path.join(path.dirname(tools), 'commands', 'notify.mjs')
      if (!fs.existsSync(notifyMjs)) { json(res, 200, { ok: false, error: `找不到 notify.mjs：${notifyMjs}` }); return }
      execNode([notifyMjs, '--test'], { timeout: 60000, windowsHide: true }, (err, stdout, stderr) => {
        json(res, 200, {
          ok: !err,
          out: String(stdout ?? '').slice(0, 800),
          err: String(stderr ?? '').slice(0, 800),
          type: cfg.notify?.type ?? 'none',
        })
      })
    })

    // 状态（只读）
    route('exact', '/dsh-bili-merlin/api/status', async (req, res) => {
      const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null } }
      const quota = readJson(path.join(HOME, '.bili-ai', 'quota.json')) ?? { log: [] }
      const today = new Date().toLocaleDateString('sv-SE')
      const todays = (quota.log ?? []).filter((x) => new Date(x.at).toLocaleDateString('sv-SE') === today)
      const night = readJson(path.join(DSH_HOME, 'whale-night.json'))
      const replied = readJson(path.join(HOME, '.bili-ai', 'replied.json'))
      json(res, 200, {
        ok: true, today,
        shares: todays.filter((x) => x.share).length,
        sharesMax: readConfig().quota?.shareDaily ?? 3,
        commentsToday: todays.length,
        repliedPeople: Object.keys(replied?.byUid ?? {}).length,
        plan: night ? { date: night.date, action: night.action, atText: night.atText ?? null, wakes: Number(night.wakes ?? 0), windows: night.usedWindows ?? [] } : null,
      })
    })

// ── 梅林新增②：观看记录卡片墙（纯读，不阻塞刷 B站 主流程 ✓）────────────────────
     //   GET /dsh-bili-merlin/api/history?limit=20&filter=all|picked|skipped|shared
     //   数据源：~/.bili-ai/seen.md + ~/.dsh/shots/covers + whale-log.jsonl + whale-session.json
     route('exact', '/dsh-bili-merlin/api/history', async (req, res) => {
       if (req.method !== 'GET') { json(res, 405, { ok: false }); return }
       const u = new URL(req.url, 'http://127.0.0.1')
       const limit = Math.min(100, Math.max(1, Number(u.searchParams.get('limit')) || 20))
       const filter = ['all', 'picked', 'skipped', 'shared'].includes(u.searchParams.get('filter'))
         ? u.searchParams.get('filter') : 'all'
       const items = buildHistory({ limit, filter })
       json(res, 200, { ok: true, count: items.length, limit, filter, items })
     })

     // ── 梅林新增③：环境自检（一键诊断，红绿列表 + 每项「怎么修」）──────────────────
     //   POST /dsh-bili-merlin/api/selfcheck → { ok, items: [{ name, ok, detail, fix }] }
     route('exact', '/dsh-bili-merlin/api/selfcheck', async (req, res) => {
       if (!isLoopbackReq(req)) { json(res, 403, { ok: false, error: '只接受本机回环访问' }); return }
       if (req.method !== 'POST' && req.method !== 'GET') { json(res, 405, { ok: false }); return }
       const items = await runSelfcheck()
       json(res, 200, { ok: items.every((i) => i.ok), items, at: new Date().toISOString() })
     })

     // ── 梅林新增④：私信白名单（dm.peers 的增删查）────────────────────────────────
     //   白名单存在 ~/.bili-ai/dm-peers.json（与活鱼凭据同目录，换机一起拷 ✓）
     //   GET  /dsh-bili-merlin/api/dm-peers           列
     //   POST /dsh-bili-merlin/api/dm-peers           加/改 { mid, name?, enabled?, dailyLimit? }
     //   POST /dsh-bili-merlin/api/dm-peers/delete    删 { mid }
     const DM_PEERS = path.join(HOME, '.bili-ai', 'dm-peers.json')
     const readPeers = () => { try { const j = JSON.parse(fs.readFileSync(DM_PEERS, 'utf8')); return Array.isArray(j) ? j : [] } catch { return [] } }
     const writePeers = (arr) => { fs.mkdirSync(path.dirname(DM_PEERS), { recursive: true }); fs.writeFileSync(DM_PEERS, JSON.stringify(arr, null, 2) + '\n') }
     route('exact', '/dsh-bili-merlin/api/dm-peers', async (req, res) => {
       if (req.method === 'GET') { json(res, 200, { ok: true, peers: readPeers() }); return }
       if (!isLoopbackReq(req)) { json(res, 403, { ok: false, error: '只接受本机回环访问' }); return }
       if (req.method !== 'POST') { json(res, 405, { ok: false }); return }
       const b = JSON.parse(await readBody(req) || '{}')
       const mid = String(b.mid ?? '').trim()
       if (!/^\d{2,15}$/.test(mid)) { json(res, 400, { ok: false, error: 'mid 必须是 2–15 位数字' }); return }
       let peers = readPeers()
       const idx = peers.findIndex((p) => String(p.mid) === mid)
       if (idx >= 0) {
         peers[idx] = { ...peers[idx], name: b.name ?? peers[idx].name, enabled: b.enabled ?? peers[idx].enabled ?? true, dailyLimit: b.dailyLimit != null ? Math.min(10, Math.max(1, Number(b.dailyLimit))) : peers[idx].dailyLimit }
       } else {
         peers.push({ mid, name: String(b.name ?? '').slice(0, 30), enabled: b.enabled !== false, dailyLimit: b.dailyLimit != null ? Math.min(10, Math.max(1, Number(b.dailyLimit))) : 1 })
       }
       writePeers(peers)
       json(res, 200, { ok: true, peers })
     })
     route('exact', '/dsh-bili-merlin/api/dm-peers/delete', async (req, res) => {
       if (!isLoopbackReq(req)) { json(res, 403, { ok: false, error: '只接受本机回环访问' }); return }
       if (req.method !== 'POST') { json(res, 405, { ok: false }); return }
       const b = JSON.parse(await readBody(req) || '{}')
       const mid = String(b.mid ?? '').trim()
       if (!/^\d{2,15}$/.test(mid)) { json(res, 400, { ok: false, error: 'mid 必须是 2–15 位数字' }); return }
       writePeers(readPeers().filter((p) => String(p.mid) !== mid))
       json(res, 200, { ok: true, peers: readPeers() })
     })

     // ── 梅林新增①：私信双向（白名单）轻量轮询（并入现有 tick，不另起进程 ✓）────────
     //   每 20s 对每个 enabled 白名单拉一次 fetch_session_msgs(size=20)；
     //   有新消息（ts > lastPeerTs 且 sender != 自己）→ 叫醒会话，让 agent 生成 1 条回复并 send；
     //   该 peer 今日回复数（repliedToday）达 dailyLimit → 跳过；
     //   对方没来消息 → 什么都不做（零开销 ✓）。
     //   白名单外一律不理 ✗。记账走 ~/.bili-ai/dm-<mid>-state.json。
     let dmPeersBusy = false
     let lastDmPeersAt = 0
     let merlinStopped = false
     const DM_PEERS_STATE = (mid) => path.join(HOME, '.bili-ai', `dm-${mid}-state.json`)
     const writePeersState = (mid, st) => {
       const f = DM_PEERS_STATE(mid)
       try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(st, null, 2) + '\n') } catch {}
     }
     // 会话 id：固定一个（跨天复用 ✓ 禁止在 tick 里新建会话 ✗）
     //   默认沿用活鱼的 bili-whale；配置里 merlin.sessionId 可覆盖
     const merlinSessionId = () => String(readConfig().merlin?.sessionId ?? 'bili-whale')
     let peersSessionReady = false
     async function ensureWhaleSession() {
       if (peersSessionReady) return
       try { await ctx.sessionController.create({ sessionId: merlinSessionId(), cwd: resolveWorkDir(readConfig().home, WORK_DIR) }) } catch {}
       peersSessionReady = true
     }
     async function dmPeersTick() {
       if (merlinStopped || dmPeersBusy) return
       if (Date.now() - lastDmPeersAt < 20_000) return
       const peers = readPeers().filter((p) => p.enabled !== false && /^\d{2,15}$/.test(String(p.mid)))
       if (!peers.length) return
       lastDmPeersAt = Date.now()
       dmPeersBusy = true
       try {
         let cfg
         try { cfg = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) } catch { cfg = {} }
         const dailyLimit = Math.min(10, Math.max(1, Number(cfg.dm?.dailyLimit ?? 1)))
         let cred
         try { cred = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8').replace(/^\uFEFF/, '')) } catch { return }
         if (!cred?.sessdata) return
         const H = {
           'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
           referer: 'https://message.bilibili.com/',
           cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3}`,
         }
         const selfMid = String(cfg.self?.mid ?? '').trim()
         const today = new Date().toLocaleDateString('sv-SE')
         for (const peer of peers) {
           if (merlinStopped) break
           const mid = String(peer.mid)
           if (selfMid && mid === selfMid) continue   // 不跟自己玩
           let st = { lastPeerTs: 0, repliedToday: 0, repliedTodayDate: today }
           try { st = { ...st, ...JSON.parse(fs.readFileSync(DM_PEERS_STATE(mid), 'utf8')) } } catch {}
           // 跨天重置 repliedToday
           if (st.repliedTodayDate !== today) { st.repliedToday = 0; st.repliedTodayDate = today }
           if ((st.repliedToday ?? 0) >= dailyLimit) continue   // 今日额度用完 → 跳过
           try {
             const url = `https://api.vc.bilibili.com/svr_sync/v1/svr_sync/fetch_session_msgs?talker_id=${mid}&session_type=1&size=20&build=0&mobi_app=web`
             const j = await (await fetch(url, { headers: H, signal: AbortSignal.timeout(15000) })).json().catch(() => ({}))
             if (j.code !== 0) continue
             // 接口返回倒序 → 反转成时间升序
             const msgs = (j.data?.messages ?? []).slice().reverse()
             let self = selfMid
             if (!self) {
               // 没配置 self.mid → 从消息里找「非对方」的 uid 推
               const other = msgs.find((m) => String(m.sender_uid) !== mid)
               self = other ? String(other.sender_uid) : ''
             }
             const fresh = msgs.filter((m) =>
               String(m.sender_uid) !== mid &&
               String(m.sender_uid) !== self && String(m.sender_uid) !== '0' &&
               Number(m.timestamp ?? 0) > Number(st.lastPeerTs ?? 0))
             if (!fresh.length) continue
             // 有新消息 → 叫醒她（走固定会话 id，跨天复用 ✓）
             const latest = fresh[fresh.length - 1]
             let latestText = ''
             try {
               const c = typeof latest.content === 'string' ? JSON.parse(latest.content) : latest.content
               latestText = String(c?.content ?? c?.text ?? '').slice(0, 500)
             } catch { latestText = String(latest.content ?? '').slice(0, 500) }
             await ensureWhaleSession()
             await ctx.sessionController.prompt({
               requestId: `bili-merlin-dm-${mid}-${latest.timestamp ?? Date.now()}`,
               sessionId: merlinSessionId(),
               mode: 'queue',
               content: [{
                 type: 'text',
                 text: [
                   personaLine(),
                   `【白名单私信】${peer.name ?? '对方'}（mid ${mid}）刚给你发了私信：`,
                   '',
                   latestText,
                   '',
                   '按 AGENTS.md「白名单私信」做（不要等我说话，直接做）：',
                   `1) 回**最多 1 条**（短一点、像聊天；私信不是评论区 ✗ 一两句就够），用 \`node bili.mjs dm --msg "…" --go\`（发给 mid ${mid}）`,
                   '2) 回完把这一笔记进 quota 账本（统一记账入口 ✓ 别处不许自己记）：\`node bili.mjs quota record --type dm-reply --target peer:' + mid + '\`',
                   `3) 今日该 peer 已回 ${st.repliedToday ?? 0}/${dailyLimit} 条 —— 到上限就**别再回**（对方下条消息等明天）`,
                   '4) 非白名单的中转/系统消息一律不理 ✗',
                 ].join('\n'),
               }],
             }, new AbortController().signal)
             // 唤醒后立刻把 lastPeerTs 推进到这条新消息（防止下一轮重复叫醒 ✓）
             st.lastPeerTs = Number(latest.timestamp ?? 0)
             st.repliedToday = (st.repliedToday ?? 0) + 1
             writePeersState(mid, st)
           } catch (e) {
             try { console.warn('[bili-merlin] 白名单私信轮询失败（' + mid + '）：' + String(e?.message ?? e).slice(0, 120)) } catch {}
           }
         }
       } finally {
         dmPeersBusy = false
       }
     }
     const timerPeers = setInterval(() => { dmPeersTick().catch(() => {}) }, 20_000)
     const bootPeers = setTimeout(() => { dmPeersTick().catch(() => {}) }, 30_000)

      // ── 自主生物钟：梅林自己管（2026-10-23 接管）────────────────────────────
      // 原先调度器由 dsh-bili-whale 负责；现在梅林全面接管，whale 可以删除。
      // sessionId 用 merlinSessionId()，默认 'bili-whale' —— 跨天复用同一会话，不新建。
      let sched = null
      try {
        sched = startScheduler(ctx, {
          dshHome: DSH_HOME,
          biliMjs: resolveBiliMjs(),
          cwd: resolveWorkDir(readConfig().home, WORK_DIR),
          sessionId: merlinSessionId(),
          log: (m) => { try { console.log(m) } catch {} },
        })
        SCHED_STATUS = { ok: true, reason: '已启动（每 60 秒 tick）', at: new Date().toISOString() }
      } catch (e) {
        SCHED_STATUS = { ok: false, reason: String(e?.message ?? e).slice(0, 300), at: new Date().toISOString() }
        try { console.warn('[bili-merlin] 生物钟启动失败：' + e.message) } catch {}
      }
ctx.effect(() => () => {
       merlinStopped = true
       try { sched?.stop() } catch {}
       clearInterval(timerPeers)
       clearTimeout(bootPeers)
       for (const d of disposers) { try { d() } catch {} }
     })

     try {
       console.log(`[bili-merlin] 设置页已挂载：/dsh-bili-merlin/ · 配置 ${CFG_FILE}`)
     } catch {}

     // 2026-10-23 梅林：selfcheck.onStart 默认 true —— 启动跑一次只记日志，不打扰用户
     try {
       const cfg0 = readConfig()
       if (cfg0.selfcheck?.onStart !== false) {
         runSelfcheck().then((items) => {
           const bad = items.filter((i) => !i.ok)
           try {
             console.log(`[bili-merlin] 启动自检：${items.length - bad.length}/${items.length} 项可用` +
               (bad.length ? ` · 不可用：${bad.map((i) => i.name).join('、')}` : ''))
           } catch {}
         }).catch(() => {})
       }
     } catch {}
   },
 }

// ── 梅林：personaLine（独立于活鱼 scheduler.js 内部那份 ✓）──────────────────────────
// 人设只从一处注入：~/.bili-ai/persona.md 优先 + 配置里的 persona 三字段兜底 ✓
// 不再靠 AGENTS.md 硬链 ✗
function personaLine() {
  let cfg = {}
  try { cfg = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) } catch {}
  const p = cfg.persona ?? {}
  const bits = []
  if (p.name) bits.push(`你是「${p.name}」`)
  if (p.ownerTitle) bits.push(`称用户「${p.ownerTitle}」`)
  if (p.selfClaim) bits.push(`自称「${p.selfClaim}」`)
  let extra = ''
  try {
    const pf = path.join(HOME, '.bili-ai', 'persona.md')
    const txt = fs.readFileSync(pf, 'utf8').trim()
    if (txt) extra = `\n\n［她的人设］以下是她专属的设定，写日记 / 说话 / 选题都以它为准 ✓：\n${txt.slice(0, 3000)}`
  } catch {}
  const base = bits.length ? `［身份］${bits.join('，')}。（以此为准，别用别的称呼 ✓）` : ''
  return base + extra
}
