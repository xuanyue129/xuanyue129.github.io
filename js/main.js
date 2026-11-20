/* 应用入口：按顺序初始化存档、Canvas 与 UI。 */
(function (global) {
  "use strict";
  function boot() {
    const app = global.FantasySurvivor;
    const saveData = app.Save.load();
    app.Game.init({
      backgroundCanvas: document.getElementById("backgroundCanvas"),
      arenaCanvas: document.getElementById("gameCanvas")
    });
    app.UI.init(saveData);
    global.addEventListener("beforeunload", () => {
      app.UI.saveData.lastSeenAt = Date.now();
      app.Save.save(app.UI.saveData);
    });
    console.info("[Fantasy Survivor] 阶段 2 初始化完成。当前为菜单与 Canvas 骨架版本。");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})(window);
