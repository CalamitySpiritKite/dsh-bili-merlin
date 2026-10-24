// 给 B 站某条评论点赞 / 取消点赞（2026-10-24 加，照 like-video / follow 的结构）
//
// 用法:
//   node like-comment.mjs <BV号> <rpid> --dry         只打印将发的请求，不发任何网络请求
//   node like-comment.mjs <BV号> <rpid> --go          真发（点赞）
//   node like-comment.mjs <BV号> <rpid> --undo --dry  打印取消点赞的请求（不发送）
//   node like-comment.mjs <BV号> <rpid> --undo --go   真发取消点赞
//
// 接口:
//   ① BV → aid: GET https://api.bilibili.com/x/web-interface/view?bvid=<BV>  （返回 data.aid）
//   ② 点赞:   POST https://api.bilibili.com/x/v2/reply/action
//      body: oid=<aid>&type=1&rpid=<评论id>&action=<1|0>&csrf=<bili_jct>
// 写操作统一约定：必须显式给 --dry 或 --go，缺了就报错退出 exit 2。
import { loadCred, missingForWrite, explainCode, looksLikeJct } from '../lib/cred.mjs'
import { gate, record } from '../lib/quota-gate.mjs'

const argv = process.argv.slice(2)
const opt = {}
const positional = []
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) {
    const k = argv[i].slice(2)
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) { opt[k] = argv[i + 1]; i += 1 } else opt[k] = true
  } else positional.push(argv[i])
}
const DRY = !!opt.dry
const GO = !!opt.go
const UNDO = !!opt.undo

// ① BV 号校验（必须匹配 ^BV[0-9A-Za-z]{10}$）
const bv = String(positional[0] ?? '')
if (!/^BV[0-9A-Za-z]{10}$/.test(bv)) {
  console.error(`✗ BV 号不合法：${bv || '(未给)'}（应为 BV + 10 位字母数字，如 BV1xx411c7mD）`)
  console.error('  用法: node like-comment.mjs <BV> <rpid> --dry|--go [--undo]')
  process.exit(2)
}
// ② rpid 校验（纯数字）
const rpid = String(positional[1] ?? '')
if (!/^[0-9]+$/.test(rpid)) {
  console.error(`✗ 评论 rpid 不合法：${rpid || '(未给)'}（应为纯数字评论 id）`)
  console.error('  用法: node like-comment.mjs <BV> <rpid> --dry|--go [--undo]')
  process.exit(2)
}
// ③ 写操作必须显式 --dry 或 --go（且只能给一个）
if (DRY && GO) { console.error('✗ --dry 和 --go 只能给一个'); process.exit(2) }
if (!DRY && !GO) {
  console.error(`✗ 必须给 --dry（只看请求）或 --go（真发）—— 项目里所有写命令的统一约定`)
  console.error('  用法: node like-comment.mjs <BV> <rpid> --dry|--go [--undo]')
  process.exit(2)
}
// ④ 凭据：用共用层读，缺字段报清楚
let cred
try {
  cred = loadCred()
} catch (e) {
  console.error(`✗ ${String(e.message).split('\n')[0]}`)
  process.exit(3)
}
const miss = missingForWrite(cred)
if (miss.length) {
  console.error(`✗ 凭据缺字段：${miss.join('、')} —— 去设置页补全后再试`)
  process.exit(3)
}
if (!looksLikeJct(cred.bili_jct)) {
  console.error('✗ bili_jct 格式可疑（应为 32 位十六进制）—— 重新复制一次 bili_jct')
  process.exit(3)
}

// ⑤ 请求参数
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const H = {
  'user-agent': UA,
  referer: 'https://www.bilibili.com/',
  cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3 ?? ''}`,
}
const action = UNDO ? '0' : '1'
const URL_VIEW = 'https://api.bilibili.com/x/web-interface/view'
const URL_ACTION = 'https://api.bilibili.com/x/v2/reply/action'
const target = `${bv}:${rpid}`

// ⑥ 要打印的请求（脱敏）
console.log(`[like-comment] ${bv}  评论 ${rpid}  ${UNDO ? '取消点赞' : '点赞'}`)
// ⑦ 限额闸：发送前过闸（dry 也要过 —— 这是项目里写命令的统一习惯）
if (!gate({ type: 'like-comment', target })) {
  console.error('✗ 限额闸拒绝：今天的评论点赞额度用完了 —— 不记账、不发')
  process.exit(2)
}

// ⑧ dry 到此为止：只打印参数，不发任何网络请求（包括查 aid 的 GET）
if (DRY) {
  console.log(`  bvid   : ${bv}`)
  console.log(`  rpid   : ${rpid}`)
  console.log(`  action : ${action}  ${UNDO ? '（取消点赞）' : '（点赞）'}`)
  console.log(`  [go 时] 第 1 步 GET  ${URL_VIEW}?bvid=${bv}   → 取 data.aid`)
  console.log(`  [go 时] 第 2 步 POST ${URL_ACTION}`)
  console.log('           content-type: application/x-www-form-urlencoded')
  console.log('           headers: UA(Chrome 131) + referer=https://www.bilibili.com/ + cookie: SESSDATA=***; bili_jct=***; buvid3=***   (已脱敏)')
  console.log(`           body   : oid=<aid>&type=1&rpid=${rpid}&action=${action}&csrf=***（csrf 脱敏）`)
  console.log(`  [dry] 未发送任何请求 ✓ 确认后把 --dry 换成 --go${UNDO ? '（保留 --undo）' : ''}`)
  process.exit(0)
}

// ⑨ go：先查 aid，再发点赞
const v = await (await fetch(`${URL_VIEW}?bvid=${bv}`, { headers: H })).json().catch(async () => ({ code: -1, message: '查询 aid 失败（非 JSON 响应）' }))
if (v.code !== 0 || !v.data?.aid) {
  console.error(`✗ 查 aid 失败：code=${v.code ?? '?'}${v.message ? `（B站原文：${v.message}）` : ''}`)
  process.exit(4)
}
const aid = String(v.data.aid)
console.log(`  aid = ${aid}`)

const body = new URLSearchParams({
  oid: aid,
  type: '1',
  rpid,
  action,
  csrf: String(cred.bili_jct),
})
const res = await fetch(URL_ACTION, {
  method: 'POST',
  headers: { ...H, 'content-type': 'application/x-www-form-urlencoded' },
  body: body.toString(),
})
const j = await res.json().catch(async () => ({ code: -1, message: `HTTP ${res.status} 非 JSON 响应` }))
if (j.code !== 0) {
  // 评论点赞接口特有返回码（explainCode 没有的在这里补，没有的就回退 explainCode）
  const HINT = {
    '-101': '账号未登录 —— SESSDATA 失效了，重新复制一次 cookie',
    '-111': 'CSRF 校验失败 —— bili_jct 和 SESSDATA 不是同一个账号或已过期',
    '-400': '请求参数错误 —— 参数没传对（oid/type/rpid/action 检查一遍）',
    '-404': '评论不存在 —— rpid 不对或评论被删了',
    '-403': '没有权限 —— 该评论不允许点赞（可能是自己的、或 UP 主设置了权限）',
  }
  const hint = HINT[String(j.code)] ?? explainCode(j.code)
  console.error(`✗ ${UNDO ? '取消' : ''}点赞失败 ${hint}${j.message ? `（B站原文：${j.message}）` : ''}`)
  process.exit(4)
}
record({ type: 'like-comment', target, note: UNDO ? '取消点赞评论' : '点赞评论' })
console.log(`✓ ${UNDO ? '已取消点赞评论' : '已点赞评论'} ${rpid}`)
