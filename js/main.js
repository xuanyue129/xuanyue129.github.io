/* 应用入口：按顺序初始化存档、Canvas、战斗模块与 UI。 */
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
      if (app.UI.saveData) {
        app.UI.saveData.lastSeenAt = Date.now();
        app.Save.save(app.UI.saveData);
      }
    });

    console.info(
      "[Fantasy Survivor] 阶段 3 初始化完成：战斗循环、实体、元素与 UI 已就绪。"
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})(window);
