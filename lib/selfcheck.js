/**
 * lib/selfcheck.js —— 环境自检（一键诊断，红绿列表 + 每项「怎么修」）
 *
 * 检查项（每一项失败都给 fix）：
 *   ① cookie 有效      nav isLogin=false → 「扫码/换 cookie」
 *   ② B站 风控状态     有 412/429 / api-ban.json → 「等 N 分钟再来」
 *   ③ ffmpeg           找不到 → 「放 ~/.dsh/bili-whale/bin/ 或加 PATH」
 *   ④ node 版本        < 20 → 「升级 node」
 *   ⑤ 与主人互关       relation.attribute != 6 → 「去 B站 互关」
 *   ⑥ 时间/时区        本机与 B站 服务器差 > 5 分钟 → 「生物钟会算错，校时」
 *   ⑦ 磁盘             剩余 < 2 GB → 「抽帧和下载会把盘写满」
 *
 * 输出：[{ name, ok, detail, fix }] —— 前端渲染红绿列表 ✓
 * 纯读 + 少量网络（nav / relation），不写任何配置 ✓。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { HOME, DSH_HOME, credentialsPath } from '../tools/lib/paths.mjs'
import { ffmpegPath, ffmpegInfo } from '../tools/lib/ffmpeg.mjs'
import { apiState } from '../tools/lib/bili-api.mjs'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'

function readCred() {
  try {
    return JSON.parse(fs.readFileSync(credentialsPath, 'utf8').replace(/^\uFEFF/, ''))
  } catch { return null }
}

function credHeaders(cred) {
  return {
    'user-agent': UA,
    referer: 'https://www.bilibili.com/',
    cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3}`,
  }
}

export async function runSelfcheck() {
  const results = []

  // ① cookie 有效
  {
    const cred = readCred()
    if (!cred || !cred.sessdata) {
      results.push({ name: 'cookie 有效', ok: false, detail: '没读到凭据文件', fix: '去设置页粘贴一次 cookie（SESSDATA + bili_jct）并保存' })
    } else {
      try {
        const j = await (await fetch('https://api.bilibili.com/x/web-interface/nav', { headers: credHeaders(cred) })).json().catch(() => ({}))
        const login = j?.data?.isLogin
        const mid = j?.data?.mid
        const uname = j?.data?.uname
        if (login) {
          results.push({ name: 'cookie 有效', ok: true, detail: `已登录：${uname}（mid ${mid}）`, fix: '' })
        } else {
          const code = j?.code ?? '?'
          results.push({ name: 'cookie 有效', ok: false, detail: `nav code=${code} isLogin=false`, fix: '扫码 / 重新复制 cookie（SESSDATA 失效了）' })
        }
      } catch (e) {
        results.push({ name: 'cookie 有效', ok: false, detail: 'nav 请求失败：' + String(e?.message ?? e).slice(0, 80), fix: '检查网络；若仍不行换 cookie' })
      }
    }
  }

  // ② 风控状态（读本地熔断文件，不打网络）
  {
    const st = apiState()
    if (st.banned) {
      results.push({ name: 'B站 风控状态', ok: false, detail: `本机被限流中，约 ${st.banMinutesLeft} 分钟后自动恢复（${st.banWhy ?? '原因未知'}）`, fix: '等一会儿再来，别继续刷接口' })
    } else {
      results.push({ name: 'B站 风控状态', ok: true, detail: '正常（无熔断）', fix: '' })
    }
  }

  // ③ ffmpeg
  {
    const info = ffmpegInfo()
    if (info.ok) {
      results.push({ name: 'ffmpeg', ok: true, detail: `${info.version}（${info.path}）`, fix: '' })
    } else {
      results.push({ name: 'ffmpeg', ok: false, detail: info.path ? `找到但跑不起来：${info.error ?? ''}` : '找不到 ffmpeg', fix: '放 ~/.dsh/bili-whale/bin/ffmpeg(.exe) 或 winget install ffmpeg（加 PATH）' })
    }
  }

  // ④ node 版本（读当前运行时；宿主是 Electron，用 DSH 自带的真 node 探测）
  {
    let ok = false
    let detail = ''
    let fix = ''
    const home = process.env.USERPROFILE || process.env.HOME || '.'
    const cands = []
    try {
      for (const root of [path.join(DSH_HOME, 'dsh-runtimes'), path.join(home, '.dsh', 'dsh-runtimes')]) {
        let dirs = []
        try { dirs = fs.readdirSync(root) } catch {}
        for (const d of dirs) cands.push(path.join(root, d, 'dependencies', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node'))
      }
    } catch {}
    for (const c of cands) {
      if (!c || !fs.existsSync(c)) continue
      try {
        const out = execFileSync(c, ['--version'], { encoding: 'utf8', timeout: 8000 }).trim()
        const major = Number((out.match(/^v(\d+)/) || [])[1] ?? 0)
        if (major >= 20) { ok = true; detail = `${out}（${c}）`; break }
        else { detail = `${out}（低于 20，${c}）`; fix = '升级 node ≥ 20，或在 DSH 里配 DSH_NODE' }
      } catch {}
    }
    if (!detail) { detail = '没找到可用的真 node 运行时'; fix = '设置 DSH_NODE 为真实 node 的绝对路径' }
    results.push({ name: 'node 版本', ok, detail, fix })
  }

  // ⑤ 与主人互关
  {
    let cfg = {}
    try { cfg = JSON.parse(fs.readFileSync(path.join(DSH_HOME, 'bili-whale.config.json'), 'utf8')) } catch {}
    const ownerMid = String(cfg.owner?.mid ?? '').trim()
    const cred = readCred()
    if (!ownerMid) {
      results.push({ name: '与主人互关', ok: false, detail: '配置里没填 owner.mid', fix: '设置页填主人的 mid，再去 B站 互关' })
    } else if (!cred?.sessdata) {
      results.push({ name: '与主人互关', ok: false, detail: '缺凭据，查不了关系', fix: '先粘 cookie' })
    } else {
      try {
        const j = await (await fetch(`https://api.bilibili.com/x/relation?fid=${ownerMid}`, { headers: credHeaders(cred) })).json().catch(() => ({}))
        const attr = Number(j?.data?.attribute ?? -1)
        if (attr === 6) {
          results.push({ name: '与主人互关', ok: true, detail: `attribute=6（互关 ✓）`, fix: '' })
        } else {
          results.push({ name: '与主人互关', ok: false, detail: `attribute=${attr}（${attr === 2 ? '只关注了主人' : '未互关'}）`, fix: `去 B站 互关：https://space.bilibili.com/${ownerMid} 双向关注（私信要求互关 ✓）` })
        }
      } catch (e) {
        results.push({ name: '与主人互关', ok: false, detail: 'relation 请求失败：' + String(e?.message ?? e).slice(0, 80), fix: '稍后重试' })
      }
    }
  }

  // ⑥ 时间/时区（本机 vs B站 服务器）
  {
    try {
      const r = await fetch('https://api.bilibili.com/x/web-interface/nav', { method: 'GET', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) })
      const via = Date.parse(String(r.headers.get('date') ?? ''))
      const diffMin = Math.abs(Date.now() - via) / 60000
      if (Number.isFinite(diffMin)) {
        if (diffMin <= 5) results.push({ name: '时间/时区', ok: true, detail: `与 B站 服务器差 ${diffMin.toFixed(1)} 分钟`, fix: '' })
        else results.push({ name: '时间/时区', ok: false, detail: `本机与 B站 服务器差 ${diffMin.toFixed(0)} 分钟`, fix: '校时（生物钟窗口会算错）：Windows 里「设置 → 时间和语言 → 同步时间」' })
      }
    } catch {
      results.push({ name: '时间/时区', ok: true, detail: '没取到服务器时间（不影响主流程）', fix: '' })
    }
  }

  // ⑦ 磁盘剩余
  {
    try {
      const root = (process.platform === 'win32' ? 'C:' : '/') + (process.platform === 'win32' ? '\\' : '')
      const s = fs.statfsSync ? fs.statfsSync(path.dirname(os.tmpdir())) : null
      let freeGb = null
      if (s) {
        freeGb = (s.bavail * s.bsize) / (1024 ** 3)
      } else {
        // 回退：statvfs 不可用时用 df 类探测（Windows 没有，直接跳过）
      }
      if (freeGb != null) {
        if (freeGb >= 2) results.push({ name: '磁盘', ok: true, detail: `剩余 ${freeGb.toFixed(1)} GB`, fix: '' })
        else results.push({ name: '磁盘', ok: false, detail: `剩余 ${freeGb.toFixed(1)} GB（< 2 GB）`, fix: '抽帧和下载会把盘写满：清点空间或换个盘符' })
      } else {
        results.push({ name: '磁盘', ok: true, detail: '没取到磁盘信息（不影响）', fix: '' })
      }
    } catch {
      results.push({ name: '磁盘', ok: true, detail: '没取到磁盘信息（不影响）', fix: '' })
    }
  }

  return results
}
