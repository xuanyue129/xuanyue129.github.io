/* 关于页面仅启动共享的 Canvas 氛围背景，不初始化游戏 UI。 */
(function (global) {
  "use strict";
  function bootAboutBackground() {
    const canvas = document.getElementById("backgroundCanvas");
    if (canvas && global.FantasySurvivor && global.FantasySurvivor.Game) {
      global.FantasySurvivor.Game.init({ backgroundCanvas: canvas, arenaCanvas: null });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootAboutBackground, { once: true });
  else bootAboutBackground();
})(window);
