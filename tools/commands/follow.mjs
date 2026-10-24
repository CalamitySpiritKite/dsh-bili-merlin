// 关注 / 取消关注 B 站 UP 主（2026-10-24 加，照 like-video / coin 的结构）
//
// 用法:
//   node bili.mjs follow <mid> --dry              只打印将发的请求，不发送
//   node bili.mjs follow <mid> --go               真发（关注）
//   node bili.mjs follow <mid> --undo --dry       打印取消关注的请求
//   node bili.mjs follow <mid> --undo --go        真发取消关注
//   可加 --name <昵称>：纯显示用，写进输出，不参与请求
//
// 接口: POST https://api.bilibili.com/x/relation/modify
//   body: fid=<UP主mid>&act=<1|2>&re_src=11&csrf=<bili_jct>（act=1 关注，act=2 取消）
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

// ① UP 主 mid 校验（纯数字，2~15 位）
const mid = String(positional[0] ?? '')
if (!/^[0-9]{2,15}$/.test(mid)) {
  console.error(`✗ UP 主 mid 不合法：${mid || '(未给)'}（应为 2~15 位纯数字）`)
  console.error('  用法: node bili.mjs follow <mid> --dry|--go [--undo] [--name 昵称]')
  process.exit(2)
}
// ② 写操作必须显式 --dry 或 --go（且只能给一个）
if (DRY && GO) { console.error('✗ --dry 和 --go 只能给一个'); process.exit(2) }
if (!DRY && !GO) {
  console.error(`✗ 必须给 --dry（只看请求）或 --go（真发）—— 项目里所有写命令的统一约定`)
  console.error('  用法: node bili.mjs follow <mid> --dry|--go [--undo] [--name 昵称]')
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
  referer: 'https://space.bilibili.com/',
  cookie: `SESSDATA=${cred.sessdata}; bili_jct=${cred.bili_jct}; buvid3=${cred.buvid3 ?? ''}`,
}
const act = UNDO ? '2' : '1'
const URL_FOLLOW = 'https://api.bilibili.com/x/relation/modify'
const name = opt.name ? `（${String(opt.name)}）` : ''

// ⑤ 要打印的请求（脱敏）
console.log(`[follow] ${mid}${name}  ${UNDO ? '取消关注' : '关注'}`)
// ⑥ 限额闸：发送前过闸（dry 也要过 —— 这是项目里写命令的统一习惯）
if (!gate({ type: 'follow', target: `uid:${mid}` })) {
  console.error('✗ 限额闸拒绝：今天的关注额度用完了 —— 不记账、不发')
  process.exit(2)
}

// ⑦ dry 到此为止：打印将要发的请求，不发送、不记账
if (DRY) {
  const body = new URLSearchParams({ fid: mid, act, re_src: '11', csrf: String(cred.bili_jct) })
  console.log(`  POST ${URL_FOLLOW}`)
  console.log('  content-type: application/x-www-form-urlencoded')
  console.log('  headers: UA(Chrome 131) + referer=https://space.bilibili.com/ + cookie: SESSDATA=***; bili_jct=***; buvid3=***   (已脱敏)')
  console.log('  body   : ' + body.toString().replace(encodeURIComponent(String(cred.bili_jct)), '***csrf***'))
  console.log(`  [dry] 未发送 ✓ 确认后把 --dry 换成 --go${UNDO ? '（保留 --undo）' : ''}`)
  process.exit(0)
}

// ⑧ go：真发，失败不记账，成功才记账
const body = new URLSearchParams({ fid: mid, act, re_src: '11', csrf: String(cred.bili_jct) })
const res = await fetch(URL_FOLLOW, {
  method: 'POST',
  headers: { ...H, 'content-type': 'application/x-www-form-urlencoded' },
  body: body.toString(),
})
const j = await res.json().catch(async () => ({ code: -1, message: `HTTP ${res.status} 非 JSON 响应` }))
if (j.code !== 0) {
  // 关注接口特有返回码（explainCode 没有的在这里补，没有的就回退 explainCode）
  const HINT = {
    '22001': '关注失败',
    '22002': '已经关注过了',
    '22003': '不能关注自己',
  }
  const hint = HINT[String(j.code)] ?? explainCode(j.code)
  console.error(`✗ ${UNDO ? '取消关注' : '关注'}失败 ${hint}${j.message ? `（B站原文：${j.message}）` : ''}`)
  process.exit(4)
}
record({ type: 'follow', target: `uid:${mid}`, note: UNDO ? '取消关注' : '关注' })
console.log(`✓ ${UNDO ? '已取消关注' : '已关注'} UP 主 ${mid}${name}`)
