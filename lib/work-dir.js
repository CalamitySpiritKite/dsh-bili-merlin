import fs from 'node:fs'
import path from 'node:path'
export function resolveWorkDir(value, fallback, warn = console.warn) {
  if (value !== undefined && value !== null && value !== '') {
    try {
      if (typeof value !== 'string' || !path.isAbsolute(value) || !fs.statSync(value).isDirectory()) throw Error('必须是已存在目录的绝对路径')
      return fs.realpathSync(value)
    } catch (e) { warn(`[bili-whale] home 配置无效，使用专用目录：${e.message}`) }
  }
  fs.mkdirSync(fallback, { recursive: true })
  return fallback
}
