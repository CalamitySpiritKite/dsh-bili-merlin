# 给 AI 助手的排查说明

> 如果你正在帮用户处理 `dsh-bili-merlin`（养鱼·梅林）的问题，先读这份。读完再动手，别一上来就改代码。

---

## 这是什么

一个 DeepSeek Harness（DSH）插件。核心能力：按作息自己醒来、刷 B站、看懂视频、写两本日记、分享给主人；另有私信白名单、六个互动动作（点赞/投币/收藏/关注/评论点赞/三连）、观看记录、环境自检。

**它不是一个独立程序**，是挂进 DSH profile 的一个 bundle。所有问题优先怀疑「配置 / 挂载」，其次才怀疑「代码」。

---

## 第一步永远是：分清楚是哪一类问题

按顺序问用户三个问题，别猜：

1. **设置页能看到「养鱼 · 梅林」吗？**
   - 看不到 → 挂载问题，看 §1
   - 看得到但报错 → 接口问题，看 §2

2. **DSH 本身能启动吗？**
   - 启动报错弹框 → 看 §3
   - 能启动但插件不动 → 看 §4

3. **"不动"具体是什么？**
   - 生物钟不醒 → §4.1
   - 外站操作失败（点赞/投币/私信）→ §4.2
   - 设置存不住 → §4.3

---

## §1 设置页看不到 / 404

**检查挂载三处是否一致**：

```
~/.dsh/profiles/<profile>/package.json          → dependencies 里有 dsh-bili-merlin
~/.dsh/profiles/<profile>/package.json          → dsh.profile.bundles 里有 dsh-bili-merlin
~/.dsh/profiles/<profile>/node_modules/dsh-bili-merlin/   → 目录存在（通常是 junction/软链）
插件目录/cordis.patch.yml                        → id 和 name 都必须等于 dsh-bili-merlin
```

**`cordis.patch.yml` 的 id/name 写错，表现就是"装上了但设置页 404"。** 这是最常见的原因。

修复：

```bash
dsh plugin --profile <profile> remove dsh-bili-merlin
dsh plugin --profile <profile> add "link:<插件绝对路径>"
```

---

## §2 设置页能开但接口报错

插件自己提供 13 个接口，全在 `/dsh-bili-merlin/api/*`。**它们只在 DSH 宿主进程里存在**，用浏览器直接访问会 401（信任栅栏，正常现象）。

判断办法：看设置页里哪一块报错。

| 报错位置 | 接口 | 常见原因 |
|---|---|---|
| 整页"读取配置失败" | `/settings` | 配置文件损坏或不存在（会自动建默认，不会致命） |
| 人设区 | `/persona` | `~/.bili-ai/persona.md` 权限问题 |
| 观看记录 | `/history` | 没有数据（返回空数组是正常的，不是错误） |
| 环境自检 | `/selfcheck` | 某项检查失败，看返回的 `fix` 字段 |
| 私信白名单 | `/dm-peers` | `~/.bili-ai/dm-peers.json` 格式坏了 |

**看到 401 不要当成 bug。** 那是 DSH 的信任栅栏在保护接口。

---

## §3 DSH 启动失败 / 弹「Web authentication failed」

### §3.1 先看日志，别看代码

```
%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-*-host.log
%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-*-web-boot.log
```

`web-boot.log` 里的 `1 entry did not activate` + 插件名 = **插件的 client.js 加载失败**，通常是语法陷阱。

### §3.2 最常见的两个致命坑（本插件历史上都踩过）

**坑 A：client.js 注释里有 `*/`**

块注释 `/* ... */` 里如果出现 `*/`（比如写路径 `/api/*` 又恰好前面有个 `*`），注释会提前闭合，后面的中文变成代码执行，报 `ReferenceError: xxx is not defined`。

**`node --check` 查不出来**（语法合法），只有真加载才炸。

验证方法：

```bash
node -e "const fs=require('fs');let d=null;const w={__ModuleLoader__:{load:x=>{d=x}}};const doc={getElementById:()=>null,createElement:()=>({style:{},appendChild(){}}),head:{appendChild(){}}};const R={createElement:()=>null,useCallback:f=>f,useEffect:()=>{},useState:v=>[v,()=>{}]};new Function('window','document','globalThis',fs.readFileSync('lib/client.js','utf8'))(w,doc,globalThis);d.factory(n=>n==='react'?R:null);console.log('OK')"
```

**坑 B：`cordis.patch.yml` 被写空**

DSH 在某些操作（崩溃恢复、装插件失败）会把 profile 的 `cordis.patch.yml` 重写成只剩 UI 条目的残缺版本，甚至空 `[]`。

症状：**模型列表突然空了**（Agnes / Ollama 等 provider 全没了）。

检查：

```powershell
(Get-Item "$env:USERPROFILE\.dsh\profiles\<profile>\cordis.patch.yml").Length
```

正常是几千字节。变成几百 → 被啃了。

**恢复**：项目目录里没有这个文件的备份，要去 `~/.dsh/patch-backups/` 找历史快照，或者让用户从 DSH 里重新配一遍模型。

→ **提醒用户：这个文件一定要定期备份。**

### §3.3 双击没反应、也不报错

多半是**单实例锁**：DSH 主进程 `requestSingleInstanceLock()` 失败会直接 `app.quit()`，不打印任何东西。

判断：任务管理器里有没有残留的 `DeepSeek Harness.exe`。

**不要用 `Stop-Process -Name "DeepSeek Harness"` 一把梭** —— 如果当前 agent 自己也跑在这个进程里，会把自己杀掉（表现为界面"重新连接中"）。

只杀桌面端那棵进程树（命令行是裸 `"E:\...\DeepSeek Harness.exe"` 的那个，不带 `--expose-internals`）。

---

## §4 插件在跑但功能不对

### §4.1 生物钟不醒

**先看配置，不要看代码。**

```bash
cat ~/.dsh/bili-whale.config.json
```

重点看：

```json
"night": { "windows": [...], "skipChance": 0.3 }
```

- `windows` 是空数组 `[]` → **永远不会醒**（这是用户可能故意设的，问清楚再改）
- `skipChance` 是 1 → 100% 跳过

再看状态文件 `~/.dsh/whale-night.json`：

- `"action": "done"` + `"done": true` → 今天的计划已经算完，`reason` 字段会写原因
- 文件几分钟内被写过 → 调度器活着

**`windows` 为空是合法的用户选择，不是 bug。** 别看到空数组就"修复"。

设置页保存空窗口会被拒绝（返回 400「至少要有一个作息窗口」），这是有意校验。想让插件彻底不醒，只能直接改配置文件。

### §4.2 点赞 / 投币 / 私信失败

按顺序查：

1. **cookie 过期** —— 最常见。跑环境自检，或直接测：
   ```bash
   node tools/bili.mjs deps --json
   ```
   看 `B站 cookie` 那项是不是「已登录」。

2. **动作开关被关** —— 设置页 → 互动，看对应开关。关掉后命令会 `exit 2` 并提示「该动作已在设置里关闭」。

3. **每日上限到了** —— 同上，提示「今日已达上限 N 次」。

4. **没有互关** —— 私信要求双方互关（`relation.attribute === 6`）。

5. **风控** —— B站返回 `-352`。停手，等几小时。

### §4.3 设置存不住

配置写在 `~/.dsh/bili-whale.config.json`。

保存走 `POST /dsh-bili-merlin/api/settings`，逻辑是「只接受已知顶层键 + 浅合并」。

**如果某个字段保存后消失**，检查它是否在 `lib/index.js` 的 `KNOWN` 白名单里。不在就会被过滤掉。

---

## 关键路径速查

| 内容 | 路径 |
|---|---|
| 主配置 | `~/.dsh/bili-whale.config.json` |
| B站凭据 | `~/.bili-ai/credentials.json` |
| 人设 | `~/.bili-ai/persona.md` |
| 两本日记 | `~/.dsh/whale-diary.md`、`~/.dsh/whale-diary-private.md` |
| 生物钟状态 | `~/.dsh/whale-night.json` |
| 判重表 | `~/.bili-ai/seen.md` |
| 事件流 | `~/.dsh/whale-log.jsonl` |
| 私信白名单 | `~/.bili-ai/dm-peers.json` |
| 待审回复 | `~/.bili-ai/pending-replies.json` |
| profile 配置 | `~/.dsh/profiles/<profile>/cordis.patch.yml` |
| 崩溃日志 | `%APPDATA%\@deepseek-ai\dsh-desktop\logs\` |

---

## 改代码前的规矩

1. **先备份** `~/.dsh/profiles/<profile>/cordis.patch.yml` 和 `package.json`。DSH 的插件管理操作会重写它们。
2. **改 `lib/client.js` 后必须模拟加载**（见 §3.2 那条命令），不能只跑 `node --check`。
3. **改 `lib/index.js` 后要真跑一遍 apply**，确认 13 条路由都注册上、调度器能起。
4. **不要动** `~/.dsh/profiles/<profile>/cordis.yml`（那是空的根，本来就该是 `[]`）。
5. **不要用 `plugin_manager` 反复 install/remove** —— 那是重写 profile 配置的高危操作，容易把用户的模型配置搞没。

---

## 最后

如果你排查完发现是**这个插件自己的 bug**，去仓库提 issue，带上：

- DSH 版本（`dsh --version`）
- 插件版本（`package.json` 里的 version）
- 崩溃日志原文
- 你跑了什么命令、期望什么、实际什么

**不要**只贴一句「不工作了」。
