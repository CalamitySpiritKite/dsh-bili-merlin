// 给 B 站视频投币（2026-10-24 加）
//
// 用法:
//   node bili.mjs coin <BV> --dry               只打印将发的请求，不发送
//   node bili.mjs coin <BV> --go                真发（投 1 枚）
//   node bili.mjs coin <BV> --coins 2 --go      一次投 2 枚（默认 1，最多 2）
//
// ⚠ 投币是不可撤销的：B 站没有"取消投币"接口，投出去就收不回来。
//   所以 dry 模式的提示语要把这点说清楚。
//
// 接口: POST https://api.bilibili.com/x/web-interface/coin/add
//   body: bvid=<BV>&multiply=<1|2>&select_like=0&csrf=<bili_jct>
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

// ① BV 号校验（必须匹配 ^BV[0-9A-Za-z]{10}$）
const bv = String(positional[0] ?? '')
if (!/^BV[0-9A-Za-z]{10}$/.test(bv)) {
  console.error(`✗ BV 号不合法：${bv || '(未给)'}（应为 BV + 10 位字母数字，如 BV1xx411c7mD）`)
  console.error('  用法: node bili.mjs coin <BV> --dry|--go [--coins 1|2]')
  process.exit(2)
}
// ② 写操作必须显式 --dry 或 --go（且只能给一个）
if (DRY && GO) { console.error('✗ --dry 和 --go 只能给一个'); process.exit(2) }
if (!DRY && !GO) {
  console.error(`✗ 必须给 --dry（只看请求）或 --go（真发）—— 项目里所有写命令的统一约定`)
  console.error('  用法: node bili.mjs coin <BV> --dry|--go [--coins 1|2]')
  process.exit(2)
}
// ③ 投币数：只允许 1 或 2，其他报错退出
const coins = opt.coins === undefined ? 1 : Number(opt.coins)
if (coins !== 1 && coins !== 2) {
  console.error(`✗ --coins 只允许 1 或 2（给了 ${opt.coins}）`)
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
const multiply = String(coins)
const URL_COIN = 'https://api.bilibili.com/x/web-interface/coin/add'

// ⑥ 要打印的请求（脱敏）
console.log(`[coin] ${bv}  投 ${coins} 枚硬币`)
// ⑦ 限额闸：发送前过闸（dry 也要过 —— 这是项目里写命令的统一习惯）
if (!gate({ type: 'coin', target: bv })) {
  console.error('✗ 限额闸拒绝：今天的投币额度用完了 —— 不记账、不发')
  process.exit(2)
}

// ⑧ dry 到此为止：打印将要发的请求，不发送、不记账
if (DRY) {
  const body = new URLSearchParams({ bvid: bv, multiply, select_like: '0', csrf: String(cred.bili_jct) })
  console.log(`  POST ${URL_COIN}`)
  console.log('  content-type: application/x-www-form-urlencoded')
  console.log('  headers: UA(Chrome 131) + referer=https://www.bilibili.com/ + cookie: SESSDATA=***; bili_jct=***; buvid3=***   (已脱敏)')
  console.log('  body   : ' + body.toString().replace(encodeURIComponent(String(cred.bili_jct)), '***csrf***'))
  console.log(`  [dry] 未发送 ✓ 确认后把 --dry 换成 --go —— 注意：投币不可撤销，B 站没有"取消投币"接口，投出去就收不回来`)
  process.exit(0)
}

// ⑨ go：真发，失败不记账，成功才记账
const body = new URLSearchParams({ bvid: bv, multiply, select_like: '0', csrf: String(cred.bili_jct) })
const res = await fetch(URL_COIN, {
  method: 'POST',
  headers: { ...H, 'content-type': 'application/x-www-form-urlencoded' },
  body: body.toString(),
})
const j = await res.json().catch(async () => ({ code: -1, message: `HTTP ${res.status} 非 JSON 响应` }))
if (j.code !== 0) {
  // 投币接口特有返回码（explainCode 没有的在这里补，没有的就回退 explainCode）
  const HINT = {
    '34005': '投币数超过上限（该视频已投满）',
    '34006': '不能给自己的稿件投币',
    '34017': '投币余额不足',
  }
  const hint = HINT[String(j.code)] ?? explainCode(j.code)
  console.error(`✗ 投币失败 ${hint}${j.message ? `（B站原文：${j.message}）` : ''}`)
  process.exit(4)
}
record({ type: 'coin', target: bv, note: `投 ${coins} 枚` })
console.log(`✓ 已投 ${coins} 枚硬币 ${bv}`)
