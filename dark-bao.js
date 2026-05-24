// ==UserScript==
// @name         豆包暗黑模式
// @namespace    https://github.com/rezhoukang/
// @version      1.0
// @description  邪恶暗黑小豆包来袭，深色主题美化
// @author       rezhoukang
// @icon         https://lf-flow-web-cdn.doubao.com/obj/flow-doubao/doubao/web/doubao_avatar.png
// @match        *://www.doubao.com/*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';
    const css = document.createElement('style');
    css.textContent = `
      html, body, .container, .main, .chat-wrapper,
      [class*="header"], [class*="sidebar"], [class*="chat"] {
        background-color: #1a1a1a !important;
      }
      /* 全局正文白色：排除代码区域，避免覆盖语法高亮 */
      :not(code *):not([class*="code-canvas-body"] *){
        color: #ffffff !important;
      }
      /* 去除输入框聚焦/active 时的蓝色发光边框 */
      div[class*="input-content-container-"]:focus-within,
      div[class*="input-content-container-"]:active,
      div[class*="input-content-container-"]:has(:active),
      div[class*="input-content-container-"]:has([data-state="active"]) {
        box-shadow: none !important;
        outline: none !important;
      }
      div[class*="input-content-container-"]:focus-within::after,
      div[class*="input-content-container-"]:active::after,
      div[class*="input-content-container-"]:has(:active)::after,
      div[class*="input-content-container-"]:has([data-state="active"])::after {
        border-color: transparent !important;
      }
    `;
    document.head.appendChild(css);

    function forceDark() {
        try {
            document.documentElement.dataset.theme = 'dark';
            document.body.dataset.theme = 'dark';
        } catch (e) { }
    }
    forceDark();
    setInterval(forceDark, 50);
    console.log('🌙 豆包深色模式已启用');
})();