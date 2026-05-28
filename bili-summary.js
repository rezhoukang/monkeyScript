// ==UserScript==
// @name         bili一键总结
// @namespace    http://tampermonkey.net/
// @icon         https://www.bilibili.com/favicon.ico
// @version      1.0
// @description  刷新后点击中文字幕并复制整理后的 ai_subtitle 文本
// @author       rezhoukang
// @match        https://www.bilibili.com/video/*
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function () { // 自执行函数，避免污染全局
    'use strict'; // 严格模式
    if (window.__biliAiSubtitleCopierInstalled) { return; } // 已安装则退出，防重复执行
    window.__biliAiSubtitleCopierInstalled = true; // 标记已安装

    const PK = '__bili_ai_subtitle_pending__'; // sessionStorage 键名
    let armed = false, copied = false, timer = null; // 状态变量：捕获开关、已复制标记、定时器

    const isPending = () => sessionStorage.getItem(PK) === '1'; // 判断是否有待执行任务
    const setPending = () => sessionStorage.setItem(PK, '1'); // 设置待执行任务标记
    const clearPending = () => sessionStorage.removeItem(PK); // 清除待执行任务标记
    const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } }; // 停止定时器

    function decode(f) { try { return JSON.parse(f); } catch { return ''; } } // 解码 JSON 字符串

    function extract(src) { // 从原始字幕数据提取纯文本
        src = String(src || '').trim(); // 转字符串去空格
        if (!src) { return ''; } // 空数据直接返回
        try { // 尝试完整 JSON 解析
            const data = JSON.parse(src); // 解析 JSON
            if (Array.isArray(data.body)) { // body 是数组
                const lines = data.body // 遍历 body
                    .map(i => String(i && i.content ? i.content : '').trim()) // 取每条 content
                    .filter(Boolean); // 过滤空行
                if (lines.length) { return lines.join('\n'); } // 换行拼接返回
            }
        } catch {} // 解析失败走正则兜底
        const m = src.match(/"body"\s*:\s*\[([\s\S]*?)\]\s*\}/); // 正则匹配 body 数组
        const body = m ? m[1] : src; // 取 body 部分或原始数据
        const re = /"content"\s*:\s*("(?:\\.|[^"\\])*")\s*,\s*"music"\s*:/g; // 匹配 content 字段
        const lines = []; let match; // 结果数组、匹配变量
        while ((match = re.exec(body))) { // 循环匹配所有 content
            const ln = decode(match[1]).trim(); // 解码并去空格
            if (ln) { lines.push(ln); } // 非空则收集
        }
        return lines.length ? lines.join('\n') : src; // 有内容返回拼接，无内容返回原文
    }

    function isTarget(url) { // 判断是否为 AI 字幕接口
        if (!url || !url.includes('ai_subtitle')) { return false; } // 不含 ai_subtitle 直接排除
        try { // 解析 URL 取文件名
            return !(new URL(url, location.href).pathname.split('/').pop() || '').toLowerCase().startsWith('web');
        } // 排除 web 开头的非 AI 字幕文件
        catch { return !/\/web[^/?#]*/i.test(String(url)); } // 兼容异常用正则兜底
    }

    function restoreSubtitle() { // 复制完成后关闭字幕
        setTimeout(function () { // 等字幕稳定后再操作
            var sw = document.querySelector('.bpx-player-ctrl-subtitle-close-switch'); // 关闭字幕开关
            if (sw) { sw.click(); } // 点击关闭
        }, 800); // 等 0.8 秒
    }

    function copyPayload(url, text) { // 执行复制
        const summary = extract(String(text || '').trim()); // 提取整理后的字幕
        if (!armed || copied || !isTarget(url) || !summary) { return; } // 条件不满足则跳过
        armed = false; copied = true; // 关闭捕获、标记已复制
        clearPending(); stopTimer(); // 清除任务标记、停止定时器
        GM_setClipboard(summary, 'text'); // 复制到剪贴板
        restoreSubtitle(); // 复制完后切回非 AI 字幕
    }

    const rawFetch = window.fetch; // 保存原生 fetch
    window.fetch = async function (...args) { // 重写 fetch 劫持请求
        const res = await rawFetch.apply(this, args); // 执行原始请求
        try { // 尝试拦截响应
            const u = res.url || String(args[0] || ''); // 获取请求 URL
            if (isTarget(u)) { // 是 AI 字幕接口
                res.clone().text() // 克隆响应读文本
                    .then(t => copyPayload(u, t)) // 交给复制逻辑
                    .catch(() => {}); // 忽略错误
            }
        } catch {}
        return res; // 返回原始响应
    };

    const rawOpen = XMLHttpRequest.prototype.open; // 保存原生 XHR open
    const rawSend = XMLHttpRequest.prototype.send; // 保存原生 XHR send
    XMLHttpRequest.prototype.open = function (m, u, ...r) { // 重写 open 记录 URL
        this.__u = u; // 存储请求地址
        return rawOpen.call(this, m, u, ...r); // 调用原生 open
    };
    XMLHttpRequest.prototype.send = function (...args) { // 重写 send 监听完成
        this.addEventListener('load', () => { // 监听 load 事件
            try {
                const u = this.responseURL || this.__u || ''; // 获取请求 URL
                if (!isTarget(u)) { return; } // 非目标接口跳过
                if (this.responseType && this.responseType !== '' && this.responseType !== 'text') { return; } // 非文本跳过
                copyPayload(u, this.responseText); // 执行复制
            } catch {}
        }, { once: true }); // 只监听一次
        return rawSend.apply(this, args); // 调用原生 send
    };

    function pulse() { // 模拟鼠标唤醒播放器控件
        const p = document.querySelector('.bpx-player-container, .bpx-player-video-wrap, video'); // 查找播放器
        if (!p) { return; } // 没找到则退出
        const r = p.getBoundingClientRect(); // 获取播放器位置
        const e = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; // 事件参数
        p.dispatchEvent(new MouseEvent('mouseenter', e)); // 触发 mouseenter
        p.dispatchEvent(new MouseEvent('mouseover', e)); // 触发 mouseover
        p.dispatchEvent(new MouseEvent('mousemove', e)); // 触发 mousemove
    }

    function openMenu() { // 打开字幕菜单
        pulse(); // 先唤醒播放器
        const btn = document.querySelector( // 查找字幕按钮
            '.bpx-player-ctrl-subtitle, [class*="bpx-player-ctrl-subtitle"], [aria-label*="字幕"], [title*="字幕"]'
        );
        if (!btn) { return; } // 没找到退出
        btn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); // 模拟悬浮
        btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); // 模拟悬浮
        btn.click(); // 点击打开菜单
    }

    function clickCN() { // 点击字幕菜单中的「中文」
        const item = Array.from( // 查找所有语言选项
            document.querySelectorAll('div.bpx-player-ctrl-subtitle-language-item-text, [class*="language-item-text"]')
        ).find(n => n.textContent && n.textContent.trim() === '中文'); // 匹配「中文」
        if (item) { item.click(); return true; } else { openMenu(); return false; } // 找到中文则点击，否则打开菜单
    }

    function startCapture() { // 开始捕获字幕
        armed = true; copied = false; stopTimer(); // 开启捕获、重置状态、清定时器
        let n = 0; // 重试计数
        timer = setInterval(() => { // 定时循环
            if (copied) { stopTimer(); return; } // 已复制则停止
            if (n >= 2) { // 重试 2 次仍失败
                stopTimer(); // 停止定时器
                armed = false; // 关闭捕获
                clearPending(); // 清除任务标记
                alert('字幕复制失败，请手动选择中文字幕后重试'); // 弹窗提示
                return;
            }
            n++; clickCN(); // 计数+1，尝试点击中文
        }, 1500); // 间隔 1.5 秒
    }

    function requestSummary() { setPending(); location.reload(); } // 设置标记并刷新页面

    function init() { if (isPending()) { startCapture(); } } // 初始化：有待执行任务则开始捕获

    GM_registerMenuCommand('✔一键复制', requestSummary); // 注册油猴菜单命令
    if (document.readyState === 'loading') { // DOM 未就绪
        document.addEventListener('DOMContentLoaded', init, { once: true }); // 等就绪后初始化
    } else { init(); } // 已就绪直接初始化
})();