/**
 * dsh-bili-merlin —— 客户端半边：DSH「设置」里的 **养鱼·梅林** section
 *
 * 在活鱼（dsh-bili-whale）工具链之上加三块 UI：
 *   ① 私信白名单（增删查 + 每条 dailyLimit）→ /dsh-bili-merlin/api/dm-peers
 *   ② 观看记录卡片墙（封面+标题+BV+时间+状态色标，纯读）→ /dsh-bili-merlin/api/history
 *   ③ 环境自检（一键按钮，红绿列表 + 每项怎么修）→ /dsh-bili-merlin/api/selfcheck
 *
 * 数据流与活鱼一致：section ⇄ `/dsh-bili/api/*` 和 `/dsh-bili-merlin/api/*`（同源 fetch ✓）⇄ 共用配置。
 */
window.__ModuleLoader__.load({
  id: "dsh-bili-merlin",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const { createElement: h, useCallback, useEffect, useState } = React;

    const API = "/dsh-bili-merlin/api";     // 梅林自立：配置/凭据/人设/体检/待审都在自己身上
    const MAPI = "/dsh-bili-merlin/api";    // 三项新能力（dm-peers / history / selfcheck）同源
    const CSS_TAG = "dsh-bili-merlin/section.css";
    const CSS = [
      ".blw{max-width:760px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:6px}",
      ".blw-title{margin:0;font-size:16px;font-weight:500;line-height:24px}",
      ".blw-intro{color:var(--dsw-alias-label-tertiary);margin:0 0 4px;font-size:13px;line-height:20px}",
      ".blw-group{margin-top:14px;font-size:13px;font-weight:600;line-height:20px}",
      ".blw-rows{display:flex;flex-direction:column}",
      ".blw-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px 20px;padding:10px 0;border-bottom:.5px solid var(--dsw-alias-border-l2);flex-wrap:wrap}",
      ".blw-row:last-child{border-bottom:none}",
      ".blw-row>div:first-child{flex:1;min-width:190px}",
      ".blw-label{font-size:13px;line-height:19px}",
      ".blw-hint{color:var(--dsw-alias-label-tertiary);margin-top:3px;font-size:11.5px;line-height:17px}",
      ".blw-input,.blw-select{background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font-size:12.5px;height:28px;padding:0 8px;min-width:180px;outline:none}",
      ".blw-input:focus-visible,.blw-select:focus-visible{border-color:var(--dsw-alias-brand-primary)}",
      ".blw-input.blw-wide{min-width:260px}",
      ".blw-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l2)}",
      ".blw-btn{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-brand-primary);border-radius:6px;font-size:12.5px;height:30px;padding:0 12px;cursor:pointer;font-weight:500}",
      ".blw-btn:hover{filter:brightness(1.15)}",
      ".blw-btn:disabled{opacity:.5;cursor:default}",
      ".blw-btn2{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}",
      ".blw-out{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary);background:rgba(127,127,127,.08);border-radius:8px;padding:10px 12px;max-height:240px;overflow:auto;margin-top:10px}",
      ".blw-err{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin-top:8px;white-space:pre-line}",
      ".blw-hint.blw-pre{white-space:pre-line}",
      ".blw-badge{display:inline-block;font-size:11px;line-height:16px;padding:1px 7px;border-radius:999px;background:rgba(127,127,127,.14);color:var(--dsw-alias-label-secondary);margin-left:6px}",
      ".blw-cookie{display:flex;flex-direction:column;gap:8px;min-width:250px}",
      // ── 梅林新增 ──
      ".blm-history{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:10px}",
      ".blm-card{border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;overflow:hidden;background:rgba(127,127,127,.06)}",
      ".blm-cover{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:rgba(127,127,127,.2)}",
      ".blm-cover-ph{width:100%;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:rgba(127,127,127,.15);color:var(--dsw-alias-label-tertiary);font-size:11px}",
      ".blm-card-body{padding:8px 10px;font-size:12px;line-height:17px;display:flex;flex-direction:column;gap:4px}",
      ".blm-card-title{font-weight:500;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
      ".blm-card-meta{color:var(--dsw-alias-label-tertiary);font-size:11px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}",
      ".blm-status{display:inline-block;font-size:10.5px;line-height:15px;padding:0 6px;border-radius:999px}",
      ".blm-status-picked{background:rgba(59,130,246,.18);color:#5b9cf6}",
      ".blm-status-skipped{background:rgba(127,127,127,.18);color:var(--dsw-alias-label-secondary)}",
      ".blm-status-shared{background:rgba(236,72,153,.18);color:#f08bc4}",
      ".blm-status-watched{background:rgba(127,127,127,.14);color:var(--dsw-alias-label-tertiary)}",
      ".blm-filters{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}",
      ".blm-filter{font-size:11.5px;line-height:24px;padding:0 10px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}",
      ".blm-filter-on{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-brand-primary);font-weight:600}",
      ".blm-tabs{display:flex;gap:2px;flex-wrap:wrap;margin:12px 0 2px;border-bottom:.5px solid var(--dsw-alias-border-l2);padding-bottom:8px}",
      ".blm-tab{font-size:12.5px;line-height:26px;padding:0 11px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}",
      ".blm-tab:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}",
      ".blm-tab-on{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:inset 0 -2px 0 var(--dsw-alias-brand-primary)}",
      ".blm-pane{padding-top:8px}",
      ".blm-check{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}",
      ".blm-check li{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:8px;background:rgba(127,127,127,.07);font-size:12.5px;line-height:18px}",
      ".blm-check li .blm-fix{color:var(--dsw-alias-state-error-primary);font-size:11.5px;margin-top:3px;display:block}",
      ".blm-check li .blm-dot{flex:none;width:9px;height:9px;border-radius:50%;margin-top:6px}",
      ".blm-dot-ok{background:#3fb950}",
      ".blm-dot-bad{background:#f85149}",
      ".blm-peer{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}",
      ".blm-peer-mid{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}",
    ].join("");

    // ── 唯一真相：字段清单（加字段只改这里 ✓）────────────────────────────
    //   kind: text | number | list（逗号分隔数组）| switch | select
    const FIELDS = [
      { group: "工具链", path: ["home"], label: "专用会话目录", hint: "已存在目录的绝对路径；留空用默认目录。重启后新建会话生效，已有会话不迁移", kind: "text", wide: true },
      { group: "日记与推送", path: ["listen", "mentionSummary"], label: "主人 @ 请求总结", hint: "默认关闭。开启后处理主人含总结/摘要/概括的新 @，通过消息推送通道发送", kind: "switch" },
      { group: "作息", path: ["night", "minGapMin"], label: "最小唤醒间隔（分钟）", hint: "默认 10；窗口放不下就少醒几次", kind: "number" },
      { group: "她是谁", path: ["persona", "name"], label: "角色名", hint: "她怎么被称呼", kind: "text" },
      { group: "她是谁", path: ["persona", "ownerTitle"], label: "她怎么称呼你", hint: "例如「主人」", kind: "text" },
      { group: "她是谁", path: ["persona", "selfClaim"], label: "她怎么自称", hint: "例如「我」/「人家」", kind: "text" },

      { group: "你（主人）", path: ["owner", "mid"], label: "主人 mid", hint: "用来认「谁回过她 / 谁点了赞」", kind: "text" },
      { group: "你（主人）", path: ["owner", "name"], label: "主人昵称", hint: "@ 分享时写进正文", kind: "text" },
      { group: "你（主人）", path: ["self", "mid"], label: "她自己 mid", hint: "只读（来自 cookie）", kind: "text", readOnly: true },
      { group: "你（主人）", path: ["self", "name"], label: "她自己昵称", hint: "只读（来自 nav）", kind: "text", readOnly: true },

      { group: "作息", path: ["night", "skipChance"], label: "今晚不看的概率", hint: "0.3 = 三成", kind: "number" },
      { group: "作息", path: ["night", "maxVideos"], label: "单次醒来观看视频数量", hint: "初筛的候选数；筛完再挑 2–3 条深读", kind: "number" },

      { group: "口味", path: ["preferences", "like"], label: "爱看", hint: "逗号分隔", kind: "list" },
      { group: "口味", path: ["preferences", "dislike"], label: "不爱看", hint: "逗号分隔", kind: "list" },

      { group: "日记与推送", path: ["diary", "push"], label: "推送日记摘要", hint: "关掉 = 她照写两本日记，但不推给你（日记本身不能关 ✓）", kind: "switch" },

      // ── 梅林新增（2026-10-23）────────────────────────────────────────
      { group: "梅林·私信双向", path: ["dm", "dailyLimit"], label: "白名单私信·每日回复上限", hint: "每个白名单一天最多回几条（默认 1，可配 1–10）", kind: "number" },
      { group: "梅林·卡片墙", path: ["history", "pageSize"], label: "观看记录·每次显示条数", hint: "卡片墙一页显示多少条（默认 20）", kind: "number" },
      { group: "梅林·自检", path: ["selfcheck", "onStart"], label: "启动时跑一次自检", hint: "默认开：DSH 起的时候静默跑一遍，只记日志不打扰你", kind: "switch" },

      { group: "工具链", path: ["toolsPath"], label: "工具目录", hint: "留空 = 用插件自带的 tools/ 或开发目录", kind: "text", wide: true },

      // ── 动作开关（2026-10-24 加：六个 B 站互动动作的开关 + 每日上限）──────────
      // 路径里带点的键名（like-comment）用字符串形式写，别写成标识符 ✓
      { group: "动作开关", path: ["actions", "like", "enabled"], label: "给视频点赞", hint: "关掉后 like-video 会被拒绝执行", kind: "switch" },
      { group: "动作开关", path: ["actions", "like", "dailyLimit"], label: "点赞·每日上限", kind: "number" },
      { group: "动作开关", path: ["actions", "coin", "enabled"], label: "给视频投币", hint: "会消耗硬币，不可撤销", kind: "switch" },
      { group: "动作开关", path: ["actions", "coin", "dailyLimit"], label: "投币·每日上限", kind: "number" },
      { group: "动作开关", path: ["actions", "fav", "enabled"], label: "给视频收藏", kind: "switch" },
      { group: "动作开关", path: ["actions", "fav", "dailyLimit"], label: "收藏·每日上限", kind: "number" },
      { group: "动作开关", path: ["actions", "follow", "enabled"], label: "关注 UP 主", kind: "switch" },
      { group: "动作开关", path: ["actions", "follow", "dailyLimit"], label: "关注·每日上限", kind: "number" },
      { group: "动作开关", path: ["actions", "like-comment", "enabled"], label: "给评论点赞", kind: "switch" },
      { group: "动作开关", path: ["actions", "like-comment", "dailyLimit"], label: "评论点赞·每日上限", kind: "number" },
      { group: "动作开关", path: ["actions", "triple", "enabled"], label: "一键三连", hint: "点赞+投币+收藏", kind: "switch" },
      { group: "动作开关", path: ["actions", "triple", "dailyLimit"], label: "三连·每日上限", kind: "number" },
    ];

    const getPath = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
    const setPath = (obj, path, value) => {
      let cur = obj;
      for (let i = 0; i < path.length - 1; i += 1) {
        const k = path[i];
        if (cur[k] == null || typeof cur[k] !== "object") cur[k] = typeof path[i + 1] === "number" ? [] : {};
        cur = cur[k];
      }
      cur[path[path.length - 1]] = value;
    };

    function useStyleOnce() {
      useEffect(() => {
        if (typeof document === "undefined") return;
        if (!document.getElementById(CSS_TAG)) {
          const el = document.createElement("style");
          el.id = CSS_TAG;
          el.textContent = CSS;
          document.head.appendChild(el);
        }
      }, []);
    }

    function Row({ f, cfg, set }) {
      const raw = getPath(cfg, f.path);
      const common = { className: "blw-input" + (f.wide ? " blw-wide" : "") };
      // 2026-10-18 修：list 字段以前"值 = 数组 join、改动 = split 回数组" ✗
      //   → 你一打逗号，join 立刻把它吞掉（输入框里根本打不出逗号 ✗）
      //   现在：本地文本 state 管显示 ✓ 数组只在解析时更新 ✓（逗号能打、末尾逗号也不会乱跳 ✓）
      const [listText, setListText] = useState(Array.isArray(raw) ? raw.join("，") : (raw ?? ""));
      useEffect(() => {
        setListText(Array.isArray(raw) ? raw.join("，") : (raw ?? ""));
      }, [JSON.stringify(raw ?? null)]);
      let control;
      if (f.kind === "list") {
        control = h("input", {
          ...common,
          value: listText,          // ← 显示用本地文本（逗号不会被吞 ✓）
          readOnly: !!f.readOnly,
          onChange: (e) => {
            const v = e.target.value;
            setListText(v);          // 先原样显示（中文逗号、英文逗号、末尾逗号都能打 ✓）
            // 再解析成数组写进配置（空项过滤掉，不会因为末尾逗号多出一个空串 ✓）
            set(f.path, v.split(/[,，]/).map((s) => s.trim()).filter(Boolean));
          },
        });
      } else if (f.kind === "number") {
        control = h("input", { ...common, type: "number", step: "any", value: raw ?? "", readOnly: !!f.readOnly,
          onChange: (e) => set(f.path, e.target.value === "" ? undefined : Number(e.target.value)) });
      } else if (f.kind === "switch") {
        control = h("input", { type: "checkbox", checked: !!raw, disabled: !!f.readOnly,
          onChange: (e) => set(f.path, e.target.checked) });
      } else if (f.kind === "select") {
        control = h("select", { className: "blw-select", value: raw ?? "", disabled: !!f.readOnly,
          onChange: (e) => set(f.path, e.target.value) },
          f.options.map((o) => h("option", { key: o, value: o }, o)));
      } else {
        control = h("input", { ...common, value: raw ?? "", readOnly: !!f.readOnly,
          onChange: (e) => set(f.path, e.target.value) });
      }
      return h("div", { className: "blw-row" },
        h("div", null,
          h("div", { className: "blw-label" }, f.label, f.readOnly ? h("span", { className: "blw-badge" }, "只读") : null),
          f.hint ? h("div", { className: "blw-hint" }, f.hint) : null),
        control);
    }

    // ── 作息窗口编辑器（2026-10-18 主人画的草图）─────────────────────────
    //   ①  07:00 – 09:00   （醒来 1 次）   [x]
    //   ②  17:00 – 18:00   （醒来 1 次）   [x]
    //   [ + 添加窗口 ]
    //   每个窗口自带"醒来几次"；保存时把总和写回 night.maxWakesPerDay（工具链读它 ✓）
    const NUMS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
    function WindowsEditor({ cfg, set }) {
      const wins = getPath(cfg, ["night", "windows"]);
      const list = Array.isArray(wins) ? wins : [];
      const upd = (i, patch) => set(["night", "windows"], list.map((w, j) => (j === i ? { ...w, ...patch } : w)));
      const del = (i) => set(["night", "windows"], list.filter((_, j) => j !== i));
      const add = () => set(["night", "windows"], [...list, { start: "20:00", end: "22:00", wakes: 1 }]);
      const timeInput = (v, onChange) =>
        h("input", { className: "blw-input", style: { width: "86px", minWidth: "86px" }, value: v ?? "", onChange: (e) => onChange(e.target.value) });
      return h("div", null,
        h("div", { className: "blw-rows" },
          list.length === 0
            ? h("div", { className: "blw-hint" }, "（没有窗口 = 永远不醒；至少加一个）")
            : list.map((w, i) =>
                h("div", { className: "blw-row", key: i },
                  h("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" } },
                    h("span", { className: "blw-hint", style: { minWidth: "18px" } }, NUMS[i] ?? String(i + 1)),
                    timeInput(w.start, (v) => upd(i, { start: v })),
                    h("span", { className: "blw-hint" }, "–"),
                    timeInput(w.end, (v) => upd(i, { end: v })),
                    h("span", { className: "blw-hint" }, "醒来"),
                    h("input", { className: "blw-input", style: { width: "56px", minWidth: "56px" }, type: "number", min: 1,
                      value: w.wakes ?? 1, onChange: (e) => upd(i, { wakes: Number(e.target.value) || 1 }) }),
                    h("span", { className: "blw-hint" }, "次")),
                  h("button", { className: "blw-btn blw-btn2", disabled: list.length <= 1, onClick: () => del(i), title: "删掉这个窗口" }, "×"))),
        h("div", { style: { marginTop: "8px" } },
          h("button", { className: "blw-btn blw-btn2", onClick: add }, "+ 添加窗口"))));
    }

    // ── 开关行（复选框 + 说明）──────────────────────────────────────────
    function SwitchRow({ label, hint, value, onChange, disabled }) {
      return h("div", { className: "blw-row" },
        h("div", null,
          h("div", { className: "blw-label" }, label),
          hint ? h("div", { className: "blw-hint" }, hint) : null),
        h("input", { type: "checkbox", checked: !!value, disabled: !!disabled, onChange: (e) => onChange(e.target.checked) }));
    }

    // ── 【分享评论】（主动 @ 你）· 2026-10-18 主人给的排版 ────────────────
    function ShareEditor({ cfg, set }) {
      const s = cfg.share ?? {};
      const daily = cfg.quota?.shareDaily ?? 3;
      // 2026-10-19：分享方式二选一 —— comment=评论区公开 @ / dm=私信给你（必须带视频链接）
      const via = s.via === "dm" ? "dm" : "comment";
      const viaRadio = ([value, label, hint]) =>
        h("label", { key: value, style: { display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "10px", cursor: "pointer" } },
          h("input", { type: "radio", name: "blw-share-via", checked: via === value, style: { marginTop: "3px" }, onChange: () => set(["share", "via"], value) }),
          h("div", null,
            h("div", { className: "blw-label" }, label),
            h("div", { className: "blw-hint" }, hint)));
      return h("div", null,
        h("div", { className: "blw-group" }, "分享（主动告诉你 · 二选一）"),
        h("div", { className: "blw-rows" },
          h(SwitchRow, { label: "开启", hint: "关掉 = 她只看不说 ✓", value: s.enabled !== false, onChange: (v) => set(["share", "enabled"], v) }),
          h("div", { className: "blw-row" },
            h("div", null,
              h("div", { className: "blw-label" }, "分享方式（二选一）"),
              h("div", { className: "blw-hint" }, "只在「有值得分享的」时才发；一条都不值得就一条都不发 ✓")),
            h("div", null,
              viaRadio(["comment", "评论区 @ 你", "在视频评论区发一条带 @ 的公开评论 ✓（原功能 · 别人也看得到）"]),
              viaRadio(["dm", "B站私信", "不发公开评论 ✗ 直接把分享内容 + 视频链接私信给你 ✓（更干净 ✓ 需要互关 ✓）"]))),
          h("div", { className: "blw-row" },
            h("div", null,
              h("div", { className: "blw-label" }, "每天上限"),
              h("div", { className: "blw-hint" }, via === "dm"
                ? "私信：一天只锁定你一个收信人 ✓ 条数不限 ✓"
                : "同一视频 7 天内一次 · 只从「深读过的」里挑 · 调大时会弹警告")),
            h("input", { className: "blw-input", style: { width: "80px", minWidth: "80px" }, type: "number", min: 0,
              value: daily, onChange: (e) => set(["quota", "shareDaily"], Number(e.target.value)) }))));
    }

    // ── 【全天监听】（别人找她）· 2026-10-18 主人给的排版 ──────────────────
    function ListenEditor({ cfg, set }) {
      const L = cfg.listen ?? {};
      const mins = Math.max(1, Math.round((L.commentIntervalSec ?? 300) / 60));
      const sel = (value, options, onChange) =>
        h("select", { className: "blw-select", value, onChange: (e) => onChange(e.target.value) },
          options.map(([v, label]) => h("option", { key: v, value: v }, label)));
      const num = (value, onChange, w = "70px") =>
        h("input", { className: "blw-input", style: { width: w, minWidth: w }, type: "number", min: 0, value: value ?? "", onChange: (e) => onChange(Number(e.target.value)) });
      return h("div", null,
        h("div", { className: "blw-group" }, "全天监听（别人找她）"),
        h("div", { className: "blw-rows" },
          h(SwitchRow, { label: "评论区监听", hint: `每 ${mins} 分钟查一次「回复我的 / @我的」`, value: L.comment !== false, onChange: (v) => set(["listen", "comment"], v) }),
          h("div", { className: "blw-row" },
            h("div", null, h("div", { className: "blw-label" }, "查一次间隔（分钟）"),
              h("div", { className: "blw-hint" }, "别小于 1 分钟，免得像刷接口")),
            num(mins, (v) => set(["listen", "commentIntervalSec"], Math.max(60, v * 60)))),
          h("div", { className: "blw-row" },
            h("div", null, h("div", { className: "blw-label" }, "只回"), h("div", { className: "blw-hint" }, "哪种通知算「找她」")),
            sel(L.scope ?? "both", [["both", "直接回我的 + @我的"], ["reply", "只回直接回我的"]], (v) => set(["listen", "scope"], v))),
          h(SwitchRow, { label: "同一个人最多只回一条", hint: "30 天内只回一次同一人（默认开 ✓）", value: L.oncePerPerson !== false, onChange: (v) => set(["listen", "oncePerPerson"], v) }),
          h(SwitchRow, { label: "全天（我睡着时也回）", hint: "关掉 = 只在她醒着的窗口里回 ✓", value: !!L.allDay, onChange: (v) => set(["listen", "allDay"], v) }),

          h(SwitchRow, { label: "私信监听（只认主人）", value: !!L.dm, onChange: (v) => set(["listen", "dm"], v),
            hint: "每 20 秒看一次主人有没有给你发私信 —— 有就叫醒你，实时回 ✓ 他不说话就零开销 ✓" }),
          h(SwitchRow, { label: "直播间监听", hint: "蹲直播间弹幕里有没有叫她", value: !!L.live, onChange: (v) => set(["listen", "live"], v) }),
          h("div", { className: "blw-row" },
            h("div", null, h("div", { className: "blw-label" }, "直播间房间号"), h("div", { className: "blw-hint" }, "留空 = 不蹲直播")),
            h("input", { className: "blw-input", style: { width: "120px", minWidth: "120px" }, value: L.liveRoom ?? "", placeholder: "例如 12345", onChange: (e) => set(["listen", "liveRoom"], e.target.value) })),
          h("div", { className: "blw-row" },
            h("div", null, h("div", { className: "blw-label" }, "直播间只回"), h("div", { className: "blw-hint" }, "只回主人 = 观众的一律不理；只回艾特她的 = 只看有没有人叫她")),
            sel(L.liveScope ?? "owner", [["owner", "只回主人"], ["mention", "只回艾特她的"]], (v) => set(["listen", "liveScope"], v)))),
        h("div", { className: "blw-out" },
          "【风控护栏 · 不可关】撞到 12015 / 12051 / 10031 → 立刻停监听 + 报你\n" +
          "【权限说明 · 只读】这一轮只注册只读工具；「发评论」必须显式打开；\n不注册：上传视频、发动态、私信、抓全站"));
    }

    // ── 【待审核】（2026-10-18 主人选 B 档：她的回复先给你看，你点「发」才发）──────
    function PendingEditor() {
      const [items, setItems] = useState([]);
      const [busy, setBusy] = useState("");
      const [msg, setMsg] = useState("");

      const load = useCallback(async () => {
        try { const r = await fetch(`${API}/pending`, { headers: { accept: "application/json" } }); const j = await r.json(); setItems(j.items ?? []) } catch {}
      }, []);
      useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load]);

      const act = async (id, what) => {
        setBusy(id + what); setMsg("");
        try {
          const r = await fetch(`${API}/pending/${what}`, {
            method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ id }),
          });
          const j = await r.json().catch(() => ({}));
          setMsg(j.ok
            ? (what === "approve" ? `✓ 已发出${j.rpid ? " · rpid=" + j.rpid : ""}` : "✓ 已删掉（也记了一笔「否」✓）")
            : `✗ ${j.error ?? "失败"}`);
          await load();
        } catch (e) { setMsg("✗ " + e.message) } finally { setBusy("") }
      };

      return h("div", null,
        h("div", { className: "blw-group" }, "待审核" + (items.length ? `（${items.length} 条）` : "")),
        h("div", { className: "blw-hint", style: { marginTop: "2px" } }, "她回复别人之前，草稿先到这儿 —— 你点「发」才发 ✓（否掉也会记一笔，她会学着改 ✓）"),
        h("div", { className: "blw-rows" },
          items.length === 0
            ? h("div", { className: "blw-hint", style: { padding: "8px 0" } }, "（队列是空的 ✓）")
            : items.map((x) => h("div", { className: "blw-row", key: x.id },
              h("div", null,
                h("div", { className: "blw-label" }, `→ ${x.who || "对方"}`, h("span", { className: "blw-badge" }, String(x.at ?? "").slice(5, 16).replace("T", " "))),
                x.src ? h("div", { className: "blw-hint" }, `他说：${String(x.src).slice(0, 80)}`) : null,
                h("div", { className: "blw-hint", style: { color: "var(--dsw-alias-label-primary)", marginTop: "4px" } }, `你要回：${x.message}`)),
              h("div", { style: { display: "flex", gap: "6px" } },
                h("button", { className: "blw-btn", disabled: !!busy, onClick: () => act(x.id, "approve") }, busy === x.id + "approve" ? "发出中…" : "发"),
                h("button", { className: "blw-btn blw-btn2", disabled: !!busy, onClick: () => act(x.id, "reject") }, "删"))))),
        msg ? h("div", { className: msg.startsWith("✓") ? "blw-hint" : "blw-err" }, msg) : null);
    }

    // ── 【消息推送】（她看完一轮，把摘要送到哪）· 2026-10-18 主人给的排版 ──────
    function NotifyEditor({ cfg, set, save }) {
      const n = cfg.notify ?? {};
      // 旧配置里可能是 stdout / file → 界面上按「不推送」显示（不误导 ✓），选新方式时会被覆盖 ✓
      const type = ["none", "desktop", "dm", "webhook", "command"].includes(n.type) ? n.type : "none";
      const [testing, setTesting] = useState(false);
      const [testOut, setTestOut] = useState("");
      const setType = (v) => set(["notify", "type"], v);
      const radio = ([value, label]) =>
        h("label", { key: value, style: { display: "inline-flex", alignItems: "center", gap: "6px", marginRight: "14px", cursor: "pointer", fontSize: "13px" } },
          h("input", { type: "radio", name: "blw-notify", checked: type === value, onChange: () => setType(value) }),
          label);
      const test = async () => {
        setTesting(true); setTestOut("…正在保存设置（测试前先落盘 ✓）\n");
        try {
          // 2026-10-19：测试前**先保存** ✓
          //   以前测试读的是磁盘上的旧配置 → "点了别的单选、测试却还发到旧通道" ✗
          //   现在"你看到的就是你测的" ✓
          await save();
          const r = await fetch(`${API}/notify-test`, { method: "POST", headers: { accept: "application/json" } });
          const j = await r.json().catch(() => ({}));
          setTestOut((j.ok ? "✓ 已发送（设置已自动保存 ✓）\n" : "✗ 失败（设置已自动保存 ✓）\n") + (j.out || "") + (j.err ? "\n" + j.err : ""));
        } catch (e) { setTestOut("✗ " + e.message); } finally { setTesting(false); }
      };
      const box = { className: "blw-out", style: { marginTop: "8px" } };
      return h("div", null,
        h("div", { className: "blw-group" }, "消息推送"),
        h("div", { className: "blw-hint", style: { marginTop: "2px" } }, "她看完一轮，把摘要送到哪？"),
        h("div", { className: "blw-rows" },
          h("div", { className: "blw-row" },
            h("div", null, h("div", { className: "blw-label" }, "方式"),
              h("div", { className: "blw-hint" }, "不推送 = 只写日记与事件流")),
            h("div", null, ["none", "desktop", "dm", "webhook", "command"].map((v, i) =>
              radio([v, ["不推送", "桌面通知", "B站私信", "Webhook", "自定义命令"][i]])))),

          type === "webhook" ? h("div", null,
            h("div", { className: "blw-row" },
              h("div", null, h("div", { className: "blw-label" }, "Webhook 地址"),
                h("div", { className: "blw-hint" }, "飞书 / 钉钉 / 企业微信 / QQ机器人 / WorkBuddy —— 把机器人给的地址贴进来就行（报文按域名自动适配 ✓）")),
              h("input", { className: "blw-input blw-wide", style: { minWidth: "300px" }, value: n.url ?? "", placeholder: "https://open.feishu.cn/open-apis/bot/v2/hook/…", onChange: (e) => set(["notify", "url"], e.target.value) })),
            h("div", { className: "blw-row" },
              h("div", null, h("div", { className: "blw-label" }, "模板"),
                h("div", { className: "blw-hint" }, "纯文本最稳；飞书/钉钉选 markdown 会漂亮一些")),
              h("select", { className: "blw-select", value: n.template ?? "text", onChange: (e) => set(["notify", "template"], e.target.value) },
                h("option", { value: "text" }, "纯文本"),
                h("option", { value: "markdown" }, "markdown")))) : null,

          type === "command" ? h("div", { className: "blw-row" },
            h("div", null, h("div", { className: "blw-label" }, "自定义命令"),
              h("div", { className: "blw-hint" }, "cmd = 可执行文件（如 node.exe）；消息**自动作为最后一个参数**传进去 ✓"),
              h("div", { className: "blw-hint" }, "⚠️ 不再支持 $MSG（2026-10-18 弃用：走 shell 有命令注入风险 ✗）")),
            h("input", { className: "blw-input blw-wide", style: { minWidth: "300px" }, value: n.cmd ?? "", placeholder: 'C:\\path\\to\\node.exe', onChange: (e) => set(["notify", "cmd"], e.target.value) }),
            h("div", { className: "blw-hint", style: { marginTop: "6px" } }, "参数（JSON 数组，可留空；比如 [\"C:/path/to/cli.js\"]）"),
            h("input", {
              className: "blw-input blw-wide", style: { minWidth: "300px" },
              value: JSON.stringify(n.args ?? []),
              onChange: (e) => {
                try { const v = JSON.parse(e.target.value); set(["notify", "args"], Array.isArray(v) ? v : []) } catch {}
              },
              placeholder: '["C:/path/to/cli.js"]',
            })) : null),

        h("div", { className: "blw-actions", style: { borderTop: "none", marginTop: "8px", paddingTop: "0" } },
          h("button", { className: "blw-btn blw-btn2", onClick: test, disabled: testing }, testing ? "发送中…" : "发条测试"),
          type === "none" ? h("span", { className: "blw-hint" }, "（方式=不推送时，测试只验证命令能跑通）") : null),
        testOut ? h("div", box, testOut) : null);
    }

    function BiliWhaleSection() {
      useStyleOnce();
      const [cfg, setCfg] = useState(null);
      const [savedJson, setSavedJson] = useState("");   // 2026-10-19：用来判断"有没有未保存的改动" ✓
      const [out, setOut] = useState("");
      const [err, setErr] = useState("");
      const [busy, setBusy] = useState("");
      const [ck, setCk] = useState({ sessdata: "", bili_jct: "", buvid3: "" });
      const [ckMsg, setCkMsg] = useState("");
      // 2026-10-21：她专属的人设（~/.bili-ai/persona.md）—— 自由输入 + 注入 ✓
      const [personaText, setPersonaText] = useState("");
      const [personaMsg, setPersonaMsg] = useState("");
      const [personaBytes, setPersonaBytes] = useState(0);
      // 2026-10-24：顶部模块切换（一页太长，按功能分块）
      const [tab, setTab] = useState("basic");

      const load = useCallback(async () => {
        setErr("");
        try {
          const r = await fetch(`${API}/settings`, { headers: { accept: "application/json" } });
          if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 403 ? "（被信任栅栏拒绝）" : ""}`);
          const j = await r.json();
          setCfg(j.config ?? {});
          setSavedJson(JSON.stringify(j.config ?? {}));
          // 人设单独一个文件，顺手读一下 ✓
          try {
            const pr = await fetch(`${API}/persona`, { headers: { accept: "application/json" } });
            if (pr.ok) { const pj = await pr.json(); setPersonaText(pj.text ?? ""); setPersonaBytes(pj.bytes ?? 0); }
          } catch {}
        } catch (e) { setErr(`读取配置失败：${e.message}`); }
      }, []);

      useEffect(() => { load(); }, [load]);

      const set = (path, value) => setCfg((c) => {
        const next = JSON.parse(JSON.stringify(c ?? {}));
        setPath(next, path, value);
        return next;
      });

      const save = async () => {
        setBusy("save"); setErr(""); setOut("");
        try {
          const wins = cfg?.night?.windows ?? [];
          const total = Math.max(1, wins.reduce((s, w) => s + (Number(w.wakes) || 1), 0));
          const body = { ...(cfg ?? {}), night: { ...(cfg?.night ?? {}), maxWakesPerDay: total } };
          const r = await fetch(`${API}/settings`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            // 2026-10-18：宿主现在两种都收 ✓，这里显式包一层最稳（以前发裸对象 → 宿主 merge 到 {}
            body: JSON.stringify({ config: body }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
          setOut(`✓ 已保存${j.warn ? `\n⚠️ ${j.warn}` : ""}\n配置：${j.configPath ?? "~/.dsh/bili-whale.config.json"}`);
          if (j.config) { setCfg(j.config); setSavedJson(JSON.stringify(j.config)); }
        } catch (e) { setErr(`保存失败：${e.message}`); } finally { setBusy(""); }
      };

      const injectPersona = async () => {
        setBusy("persona"); setPersonaMsg("");
        try {
          const r = await fetch(`${API}/persona`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ text: personaText }),
          });
          const j = await r.json();
          if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
          setPersonaBytes(j.bytes ?? 0);
          setPersonaMsg(j.detail ?? "✓ 已注入");
        } catch (e) { setPersonaMsg("✗ " + e.message); }
        finally { setBusy(""); }
      };

      const deps = async () => {
        setBusy("deps"); setErr(""); setOut("检查中…");
        try {
          const r = await fetch(`${API}/deps`, { headers: { accept: "application/json" } });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
          const lines = (j.items ?? []).map((i) => `${i.ok ? "✓" : "✗"} ${i.name} — ${i.detail ?? ""}`);
          const schedulerOk = j.scheduler?.ok === true;
          lines.push(`${schedulerOk ? "✓" : "✗"} 生物钟 — ${j.scheduler?.reason ?? "未返回调度器状态"}`);
          if (j.error) lines.push(j.error);
          // 2026-10-19：体检后顺手重读配置 ✓ 不然「她自己 mid/昵称」那两格永远显示旧值 ✗
          if (j.self) lines.push("", `她自己：${j.self.name}（mid ${j.self.mid}）✓`);
          await load();
          setOut([...lines, "", j.ok && schedulerOk ? "全部可用 ✓" : "有项不可用 ✗"].join("\n"));
        } catch (e) { setErr(`依赖体检失败：${e.message}`); } finally { setBusy(""); }
      };

      const saveCookie = async () => {
        setBusy("cookie"); setErr(""); setCkMsg("");
        try {
          const r = await fetch(`${API}/cookie`, {
            method: "POST",
            headers: { "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify(ck),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
          setCkMsg(`✓ ${j.detail ?? "已写入"}` + (j.warn ? `\n${j.warn}` : ""));   // 永不回显 cookie ✓（warn 要说出来 ✗ 不然等于没查）
          setCk({ sessdata: "", bili_jct: "", buvid3: "" });
        } catch (e) { setCkMsg(`✗ ${e.message}`); } finally { setBusy(""); }
      };

      if (!cfg) {
        return h("div", { className: "blw" },
          h("h3", { className: "blw-title" }, "养鱼"),
          err ? h("div", { className: "blw-err" }, err) : h("div", { className: "blw-hint" }, "读取中…"));
      }

      const groups = [];
      for (const f of FIELDS) {
        let g = groups.find((x) => x.name === f.group);
        if (!g) { g = { name: f.group, fields: [] }; groups.push(g); }
        g.fields.push(f);
      }
      // 渲染顺序（2026-10-22 主人定，见下面的 GROUP_ORDER）：
      //   她是谁 → 你（主人）→ 口味 → 作息 →【分享评论 + 全天监听】→ 日记与推送 → 消息推送 → 工具链
      // 2026-10-21：人设块 —— 挂在「她是谁」那一组下面 ✓（主人要求放这三个字段下面）
      const personaBlock = () => [
          h("div", { className: "blw-group" }, "她的人设（只属于她）"),
          h("div", { className: "blw-rows" },
            h("div", { className: "blw-row" },
              h("div", null,
                h("div", { className: "blw-label" }, "人设正文"),
                h("div", { className: "blw-hint" },
                  "写到 ", h("code", null, "~/.bili-ai/persona.md"),
                  "，只影响她（不影响别的会话 ✓）。每次唤醒/监听都会附在提示里 ✓",
                  h("br"),
                  "建议写：身份与来历 / 说话腔调 / 在意什么、怕什么 / 明确不要的行为。上限 20000 字，注入时只取前 3000 字 ✓")),
              h("div", { className: "blw-cookie", style: { minWidth: "420px" } },
                h("textarea", {
                  className: "blw-input",
                  rows: 12,
                  placeholder: "例如：\n她的名字是…\n她说话时会…\n她在意…\n她绝对不会…",
                  value: personaText,
                  onChange: (e) => setPersonaText(e.target.value),
                  style: { resize: "vertical", fontFamily: "inherit", lineHeight: "1.6" },
                }),
                h("div", { className: "blw-hint" },
                  "当前 " + personaBytes + " 字节" + (personaText.length > 20000 ? "（超过 20000 上限 ✗）" : "")),
                h("button", { className: "blw-btn", onClick: injectPersona, disabled: !!busy || personaText.length > 20000 },
                  busy === "persona" ? "注入中…" : "注入人设"),
                personaMsg ? h("div", { className: personaMsg.startsWith("✓") ? "blw-hint" : "blw-err" }, personaMsg) : null))),
      ];

      const renderGroup = (g) => h("div", { key: g.name },
        h("div", { className: "blw-group" }, g.name),
        g.name === "作息" ? h(WindowsEditor, { cfg, set }) : null,
        h("div", { className: "blw-rows" }, g.fields.map((f) => h(Row, { key: f.path.join("."), f, cfg, set }))),
        // 2026-10-21：人设块放在这三个字段【下面】✓（主人要求）
        g.name === "她是谁" ? h("div", null, personaBlock()) : null);
      // 2026-10-22 修：分组顺序显式定死 ✗ 不再靠 FIELDS 里字段出现的先后
      //   （v0.4.2 把新字段插在 FIELDS 最前面 → 工具链跑到了第一位 ✗ 整个页面顺序乱了）
      //   主人定的顺序：她是谁 → 你 → 口味 → 作息 →【分享 / 监听】→ 日记与推送 → 消息推送 → 工具链
      const GROUP_ORDER = ["她是谁", "你（主人）", "口味", "作息"]
      const byName = (n) => groups.find((g) => g.name === n)
      const orderedTop = GROUP_ORDER.map(byName).filter(Boolean)
      const orderedMid = ["日记与推送"].map(byName).filter(Boolean)
      const orderedTool = ["工具链"].map(byName).filter(Boolean)
      // 兜底：万一以后又加了新分组，别让它消失 ✗
      const known = new Set([...GROUP_ORDER, "日记与推送", "工具链"])
      const leftovers = groups.filter((g) => !known.has(g.name))
      const ci = { className: "blw-input" };

      // ── 2026-10-24：按功能分块，顶部一排模块切换（主人要求：一页太长）─────────
      const TABS = [
        { id: "basic",    label: "基本" },
        { id: "schedule", label: "作息" },
        { id: "engage",   label: "互动" },
        { id: "push",     label: "推送" },
        { id: "merlin",   label: "梅林" },
        { id: "advanced", label: "高级" },
      ]
      const pick = (names) => names.map(byName).filter(Boolean)
      const cookieBlock = [
        h("div", { className: "blw-group" }, "B 站 cookie"),
        h("div", { className: "blw-rows" },
          h("div", { className: "blw-row" },
            h("div", null,
              h("div", { className: "blw-label" }, "凭据"),
              h("div", { className: "blw-hint" }, "浏览器 F12 → Cookie 里复制（SESSDATA 是 HttpOnly，console 拿不到 ✗）；写入后永不回显 ✓")),
            h("div", { className: "blw-cookie" },
              h("input", { ...ci, placeholder: "SESSDATA", value: ck.sessdata, onChange: (e) => setCk((s) => ({ ...s, sessdata: e.target.value })) }),
              h("input", { ...ci, placeholder: "bili_jct", value: ck.bili_jct, onChange: (e) => setCk((s) => ({ ...s, bili_jct: e.target.value })) }),
              h("input", { ...ci, placeholder: "buvid3（可空）", value: ck.buvid3, onChange: (e) => setCk((s) => ({ ...s, buvid3: e.target.value })) }),
              h("button", { className: "blw-btn blw-btn2", onClick: saveCookie, disabled: !!busy || !ck.sessdata || !ck.bili_jct },
                busy === "cookie" ? "写入中…" : "写入凭据"),
              ckMsg ? h("div", { className: (ckMsg.startsWith("✓") ? "blw-hint blw-pre" : "blw-err") }, ckMsg) : null))),
      ]
      const pane = () => {
        if (tab === "basic")    return [...pick(["她是谁", "你（主人）", "口味"]).map(renderGroup), ...cookieBlock]
        if (tab === "schedule") return pick(["作息"]).map(renderGroup)
        if (tab === "engage")   return [...pick(["动作开关"]).map(renderGroup), h(ShareEditor, { cfg, set }), h(ListenEditor, { cfg, set }), h(PendingEditor)]
        if (tab === "push")     return [...pick(["日记与推送"]).map(renderGroup), h(NotifyEditor, { cfg, set, save })]
        if (tab === "merlin")   return [
          ...pick(["梅林·私信双向", "梅林·卡片墙", "梅林·自检"]).map(renderGroup),
          h(DmPeersEditor, { mapi: MAPI }),
          h(HistoryWall, { mapi: MAPI, limit: (cfg?.history?.pageSize ?? 20) }),
          h(SelfCheckPanel, { mapi: MAPI }),
        ]
        return pick(["工具链"]).map(renderGroup)
      }

      return h("div", { className: "blw" },
        h("h3", { className: "blw-title" }, "养鱼·梅林"),
        h("p", { className: "blw-intro" },
          "让 agent 自己按作息刷 B 站、看懂视频、写两本日记，把值得的 @ 你。",
          "所有值写进 ", h("code", null, "~/.dsh/bili-whale.config.json"), "。"),

        h("div", { className: "blm-tabs" }, TABS.map((t) =>
          h("button", {
            key: t.id,
            className: "blm-tab" + (tab === t.id ? " blm-tab-on" : ""),
            onClick: () => setTab(t.id),
          }, t.label))),

        h("div", { className: "blm-pane" }, ...pane()),

        h("div", { className: "blw-actions" },
          h("button", { className: "blw-btn", onClick: save, disabled: !!busy }, busy === "save" ? "保存中…" : "保存"),
          cfg && savedJson && JSON.stringify(cfg) !== savedJson
            ? h("span", { style: { marginLeft: "10px", color: "#ffb020", fontSize: "13px" } }, "● 有改动还没保存")
            : null,
          h("button", { className: "blw-btn blw-btn2", onClick: deps, disabled: !!busy }, busy === "deps" ? "体检中…" : "依赖体检"),
          h("button", { className: "blw-btn blw-btn2", onClick: load, disabled: !!busy }, "重新读取")),

        err ? h("div", { className: "blw-err" }, err) : null,
        out ? h("div", { className: "blw-out" }, out) : null);
    }

    // ── 梅林①：私信白名单（只回这些人；对方没来消息就不发；一天 ≤ dailyLimit）────
    function DmPeersEditor({ mapi }) {
      const [peers, setPeers] = useState([]);
      const [newMid, setNewMid] = useState("");
      const [newName, setNewName] = useState("");
      const [newLimit, setNewLimit] = useState("1");
      const [msg, setMsg] = useState("");
      const [busy, setBusy] = useState(false);
      const refresh = useCallback(async () => {
        try {
          const r = await fetch(mapi + "/dm-peers");
          const j = await r.json().catch(() => ({}));
          setPeers(j.peers ?? []);
        } catch { /* 静默 */ }
      }, [mapi]);
      useEffect(() => { refresh(); }, [refresh]);
      const add = async () => {
        const mid = newMid.trim();
        if (!/^\d{2,15}$/.test(mid)) { setMsg("✗ mid 必须是 2–15 位数字"); return }
        setBusy(true); setMsg("");
        try {
          const r = await fetch(mapi + "/dm-peers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mid, name: newName.trim(), dailyLimit: Number(newLimit) || 1 }) });
          const j = await r.json().catch(() => ({}));
          setMsg(j.ok ? "✓ 已加入白名单" : "✗ " + (j.error ?? "失败"));
          if (j.ok) { setNewMid(""); setNewName(""); setNewLimit("1"); refresh(); }
        } catch (e) { setMsg("✗ " + e.message) } finally { setBusy(false) }
      };
      const del = async (mid) => {
        setBusy(true);
        try {
          const r = await fetch(mapi + "/dm-peers/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mid }) });
          const j = await r.json().catch(() => ({}));
          setMsg(j.ok ? "✓ 已移除" : "✗ " + (j.error ?? "失败"));
          if (j.ok) refresh();
        } catch (e) { setMsg("✗ " + e.message) } finally { setBusy(false) }
      };
      const toggle = async (p) => {
        try {
          await fetch(mapi + "/dm-peers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mid: p.mid, name: p.name, enabled: !p.enabled, dailyLimit: p.dailyLimit }) });
          refresh();
        } catch {}
      };
      return h("div", null,
        h("div", { className: "blw-group" }, "梅林① 私信白名单"),
        h("div", { className: "blw-hint", style: { marginTop: "2px" } },
          "只回这些 mid 的私信（白名单外一律不理 ✗）；对方没来消息就不发；一天最多回 dailyLimit 条。进度记在 ~/.bili-ai/dm-<mid>-state.json。"),
        h("div", { className: "blm-peer" },
          h("input", { className: "blw-input", style: { minWidth: "120px" }, placeholder: "mid（数字）", value: newMid, onChange: (e) => setNewMid(e.target.value) }),
          h("input", { className: "blw-input", style: { minWidth: "140px" }, placeholder: "昵称（可选）", value: newName, onChange: (e) => setNewName(e.target.value) }),
          h("input", { className: "blw-input", style: { width: "70px" }, type: "number", min: "1", max: "10", placeholder: "日限", value: newLimit, onChange: (e) => setNewLimit(e.target.value) }),
          h("button", { className: "blw-btn", disabled: busy, onClick: add }, "加白名单")),
        peers.length
          ? h("div", { className: "blw-rows" }, peers.map((p) => h("div", { className: "blw-row", key: p.mid },
              h("div", null,
                h("div", { className: "blw-label" }, h("span", { className: "blm-peer-mid" }, p.mid), (p.name ? " · " + p.name : "")),
                h("div", { className: "blw-hint" }, "日限 " + (p.dailyLimit ?? 1) + " 条")),
              h("div", { style: { display: "flex", gap: "6px", alignItems: "center" } },
                h("button", { className: "blw-btn blw-btn2", disabled: busy, onClick: () => toggle(p) }, p.enabled !== false ? "停用" : "启用"),
                h("button", { className: "blw-btn blw-btn2", disabled: busy, onClick: () => del(p.mid) }, "删")))))
          : h("div", { className: "blw-hint", style: { marginTop: "6px" } }, "（白名单是空的 —— 加一个 mid 试试 ✓）"),
        msg ? h("div", { className: msg.startsWith("✓") ? "blw-hint" : "blw-err" }, msg) : null);
    }

    // ── 梅林②：观看记录卡片墙（封面 + 标题 + BV + 时间 + 状态色标，纯读）────────
    function HistoryWall({ mapi, limit }) {
      const [items, setItems] = useState([]);
      const [filter, setFilter] = useState("all");
      const [err, setErr] = useState("");
      const [loading, setLoading] = useState(false);
      const load = useCallback(async (f) => {
        setLoading(true); setErr("");
        try {
          const r = await fetch(mapi + "/history?limit=" + limit + "&filter=" + f);
          const j = await r.json().catch(() => ({}));
          if (!j.ok) setErr(j.error ?? "读取失败");
          setItems(j.items ?? []);
        } catch (e) { setErr(e.message) } finally { setLoading(false) }
      }, [mapi, limit]);
      useEffect(() => { load(filter); }, [load, filter]);
      const statusOf = (s) => s === "shared" ? { cls: "blm-status-shared", label: "已发你" }
        : s === "picked" ? { cls: "blm-status-picked", label: "挑了" }
        : s === "skipped" ? { cls: "blm-status-skipped", label: "跳过" }
        : { cls: "blm-status-watched", label: "看过" };
      return h("div", null,
        h("div", { className: "blw-group" }, "梅林② 观看记录"),
        h("div", { className: "blw-hint", style: { marginTop: "2px" } },
          "读 seen.md + shots/ + 事件流（纯读 ✓ 不阻塞刷 B站）。点卡片跳 B站原视频。"),
        h("div", { className: "blm-filters" },
          [["all", "全部"], ["picked", "挑了"], ["skipped", "跳过"], ["shared", "已发你"]].map(([v, l]) =>
            h("button", { key: v, className: "blm-filter" + (filter === v ? " blm-filter-on" : ""), onClick: () => setFilter(v) }, l)))
          ,
        loading ? h("div", { className: "blw-hint", style: { marginTop: "8px" } }, "…读取中") : null,
        err ? h("div", { className: "blw-err" }, err) : null,
        !loading && !err && items.length === 0
          ? h("div", { className: "blw-hint", style: { marginTop: "8px" } }, "（还没有观看记录 ✓）")
          : h("div", { className: "blm-history" }, items.map((it) => {
            const st = statusOf(it.status);
            const meta = h("div", { className: "blm-card-meta" },
              h("span", { className: "blm-status " + st.cls }, st.label),
              it.when ? h("span", null, String(it.when).slice(5, 16).replace("T", " ")) : null,
              it.sharedTo ? h("span", null, "→ " + it.sharedTo) : null);
            const body = h("div", { className: "blm-card-body" },
              h("div", { className: "blm-card-title" }, it.title || it.bv),
              meta);
            const cover = it.cover
              ? h("img", { className: "blm-cover", src: it.cover, alt: it.title ?? it.bv, loading: "lazy" })
              : h("div", { className: "blm-cover-ph" }, it.bv);
            return h("a", {
              key: it.bv + String(it.when),
              className: "blm-card",
              href: "https://www.bilibili.com/video/" + it.bv,
              target: "_blank",
              rel: "noreferrer",
              style: { textDecoration: "none", color: "inherit" },
            }, cover, body);
          })))
      }

    // ── 梅林③：环境自检（一键按钮 + 红绿列表 + 每项怎么修）────────────────────
    function SelfCheckPanel({ mapi }) {
      const [items, setItems] = useState(null);
      const [running, setRunning] = useState(false);
      const [err, setErr] = useState("");
      const run = async () => {
        setRunning(true); setErr("");
        try {
          const r = await fetch(mapi + "/selfcheck", { method: "POST", headers: { "content-type": "application/json" } });
          const j = await r.json().catch(() => ({}));
          setItems(j.items ?? []);
          if (!Array.isArray(j.items)) setErr(j.error ?? "自检失败");
        } catch (e) { setErr(e.message) } finally { setRunning(false) }
      };
      const bad = items ? items.filter((i) => !i.ok) : [];
      return h("div", null,
        h("div", { className: "blw-group" }, "梅林③ 环境自检"),
        h("div", { className: "blw-hint", style: { marginTop: "2px" } },
          "一键检查：cookie / 风控 / ffmpeg / node / 互关 / 时差 / 磁盘。每项失败都给「怎么修」。"),
        h("button", { className: "blw-btn blw-btn2", onClick: run, disabled: running }, running ? "检查中…" : "一键自检"),
        items ? h("ul", { className: "blm-check" }, items.map((i) => h("li", { key: i.name },
          h("div", { style: { display: "flex", gap: "8px", flex: "1" } },
            h("span", { className: "blm-dot " + (i.ok ? "blm-dot-ok" : "blm-dot-bad") }),
            h("div", null,
              h("strong", null, i.name + (i.ok ? " ✓" : " ✗")),
              i.detail ? h("span", { className: "blw-hint", style: { display: "block", marginTop: "2px" } }, i.detail) : null,
              !i.ok && i.fix ? h("span", { className: "blm-fix" }, "怎么修：" + i.fix) : null))
            ))
          ) : null,
        err ? h("div", { className: "blw-err" }, err) : null,
        items && !bad.length ? h("div", { className: "blw-hint", style: { marginTop: "6px" } }, "全部可用 ✓") : null);
    }

    const inject = ["slots"];
    const NS = "bili-merlin";
    const NAMES = { nav: "养鱼·梅林" };

    function apply(ctx) {
      ctx.effect(
        () =>
          ctx.slots.inject("settings.section", () =>
            ctx.slots.register(
              { name: "settings.section", id: NS, order: 7, label: () => NAMES.nav },
              BiliWhaleSection,
            ),
            "bili-merlin: settings section",
          ),
        "bili-merlin: settings section",
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.BiliWhaleSection = BiliWhaleSection;
    exports.FIELDS = FIELDS;
    return module.exports;
  },
});
