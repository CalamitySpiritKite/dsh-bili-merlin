#!/usr/bin/env node
// 一键三连：点赞 + 投币 + 收藏
//
// 做法：依次调用三个已经做好的命令（like-video / coin / fav），
// 不自己重写三套接口 —— 每个子命令内部已经过了限额闸、有 dry/go 约定，
// 这里只负责串联 + 汇总，不会再重复记账。
//
// 用法:
//   node triple.mjs <BV号> --dry
//   node triple.mjs <BV号> --go
//   node triple.mjs <BV号> --reason "一句话理由" --go
//   node triple.mjs <BV号> --no-coin --go     只点赞+收藏，省硬币
//   node triple.mjs <BV号> --no-fav --go      跳过收藏
//
// 注意：投币消耗硬币且不可撤销；收藏会留下记录。所以 dry 模式先把三步都列出来。
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NODE_EXE } from '../lib/nodebin.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const biliMjs = path.join(here, '..', 'bili.mjs')

const argv = process.argv.slice(2)
const opt = {}
const positional = []
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith('--')) {
    const k = argv[i].slice(2)
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) { opt[k] = argv[i + 1]; i += 1 }
    else opt[k] = true
  } else positional.push(argv[i])
}

const BV = String(positional[0] ?? '').trim()
const DRY = !!opt.dry
const GO = !!opt.go
const NO_COIN = !!opt['no-coin']
const NO_FAV = !!opt['no-fav']
const REASON = String(opt.reason ?? '一键三连收藏')

if (!BV || !/^BV[0-9A-Za-z]{10}$/.test(BV)) {
  console.error('用法: node triple.mjs <BV号> --dry|--go [--reason "理由"] [--no-coin] [--no-fav]')
  process.exit(2)
}
if (DRY === GO) {
  console.error('✗ 必须给 --dry 或 --go（只能给一个）')
  process.exit(2)
}

const steps = [
  { name: '点赞', cmd: 'like-video', args: [BV], skip: false },
  { name: '投币', cmd: 'coin', args: [BV], skip: NO_COIN, why: '--no-coin' },
  { name: '收藏', cmd: 'fav', args: [BV, '--reason', REASON], skip: NO_FAV, why: '--no-fav' },
]

if (DRY) {
  console.log(`[triple] ${BV}  一键三连`)
  for (const s of steps) {
    console.log(s.skip ? `  ${s.name.padEnd(4)} 跳过（${s.why}）` : `  ${s.name.padEnd(4)} ✓ 计划`)
  }
  console.log('  [dry] 未发送任何请求 ✓ 确认后把 --dry 换成 --go')
  console.log('  注意：投币消耗硬币且不可撤销；收藏会留下记录')
  process.exit(0)
}

const results = []
for (const s of steps) {
  if (s.skip) { results.push({ name: s.name, ok: false, skipped: true }); continue }
  console.log(`\n--- ${s.name} ---`)
  const r = spawnSync(NODE_EXE, [biliMjs, s.cmd, ...s.args, '--go'], { stdio: 'inherit' })
  results.push({ name: s.name, ok: r.status === 0, skipped: false, code: r.status })
}

const active = results.filter((r) => !r.skipped)
const done = active.filter((r) => r.ok).length
console.log('\n=== 三连结果 ===')
for (const r of results) {
  if (r.skipped) console.log(`  -  ${r.name} 跳过`)
  else console.log(`  ${r.ok ? '✓' : '✗'}  ${r.name}`)
}
console.log(`  结果：${done}/${active.length} 成功`)
process.exit(done === active.length ? 0 : 1)
