import { resolveRuntime } from '../tools/lib/runtime.mjs'
const cache = new Map()
export function nodeRuntime(dshHome) {
  if (!cache.has(dshHome)) cache.set(dshHome, resolveRuntime(dshHome))
  return cache.get(dshHome)
}
export const resolveNodeRuntime = dshHome => nodeRuntime(dshHome).file
export const nodeEnv = dshHome => nodeRuntime(dshHome).env
