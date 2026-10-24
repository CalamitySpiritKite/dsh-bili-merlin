// 给 B 站视频点赞（2026-10-24 加）
//
// 用法:
//   node bili.mjs like-video <BV> --dry          只打印将发的请求，不发送
//   node bili.mjs like-video <BV> --go           真发（点赞）
//   node bili.mjs like-video <BV> --undo --dry   打印取消点赞的请求
//   node bili.mjs like-video <BV> --undo --go    真发取消点赞
//
// 接口: POST https://api.bilibili.com/x/web-interface/archive/like
//   body: bvid=<BV>&like=1|2&csrf=<bili_jct>（like=1 点赞，like=2 取消）
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
  console.error('  用法: node bili.mjs like-video <BV> --dry|--go [--undo]')
  process.exit(2)
}
// ② 写操作必须显式 --dry 或 --go（且只能给一个）
if (DRY && GO) { console.error('✗ --dry 和 --go 只能给一个'); process.exit(2) }
if (!DRY && !GO) {
  console.error(`✗ 必须给 --dry（只看请求）或 --go（真发）—— 项目里所有写命令的统一约定`)
  console.error('  用法: node bili.mjs like-video <BV> --dry|--go [--undo]')
  process.exit(2)
}
// ③ 凭据：用共用层读，缺字段报清楚
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

// ④ 请求参数
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const H = {
  'user-agent': UA,
  referer: 'https://www.bilibili.com/',
  cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3 ?? ''}`,
}
const like = UNDO ? '2' : '1'
const URL_LIKE = 'https://api.bilibili.com/x/web-interface/archive/like'

// ④ 要打印的请求（脱敏）
console.log(`[like-video] ${bv}  ${UNDO ? '取消点赞' : '点赞'}`)
// ⑤ 限额闸：发送前过闸（dry 也要过 —— 这是项目里写命令的统一习惯）
if (!gate({ type: 'like', target: bv })) {
  console.error('✗ 限额闸拒绝：今天的点赞额度用完了 —— 不记账、不发')
  process.exit(2)
}

// ⑤ dry 到此为止：打印将要发的请求，不发送、不记账
if (DRY) {
  const body = new URLSearchParams({ bvid: bv, like, csrf: String(cred.bili_jct) })
  console.log(`  POST ${URL_LIKE}`)
  console.log('  content-type: application/x-www-form-urlencoded')
  console.log('  headers: UA(Chrome 131) + referer=https://www.bilibili.com/ + cookie: SESSDATA=***; bili_jct=***; buvid3=***   (已脱敏)')
  console.log('  body   : ' + body.toString().replace(encodeURIComponent(String(cred.bili_jct)), '***csrf***'))
  console.log(`  [dry] 未发送 ✓ 确认后把 --dry 换成 --go${UNDO ? '（保留 --undo）' : ''}`)
  process.exit(0)
}

// ⑥ go：真发，失败不记账，成功才记账
const body = new URLSearchParams({ bvid: bv, like, csrf: String(cred.bili_jct) })
const res = await fetch(URL_LIKE, {
  method: 'POST',
  headers: { ...H, 'content-type': 'application/x-www-form-urlencoded' },
  body: body.toString(),
})
const j = await res.json().catch(async () => ({ code: -1, message: `HTTP ${res.status} 非 JSON 响应` }))
if (j.code !== 0) {
  // 点赞接口特有返回码（explainCode 没有的在这里补，没有的就回退 explainCode）
  const HINT = {
    '65004': '重复操作或已取消过 —— 不用再发了',
    '65006': '已经赞过了 —— 不用再发',
  }
  const hint = HINT[String(j.code)] ?? explainCode(j.code)
  console.error(`✗ ${UNDO ? '取消' : ''}点赞失败 ${hint}${j.message ? `（B站原文：${j.message}）` : ''}`)
  process.exit(4)
}
record({ type: 'like', target: bv, note: UNDO ? '取消点赞' : '点赞' })
console.log(`✓ ${UNDO ? '已取消点赞' : '已点赞'} ${bv}`)
