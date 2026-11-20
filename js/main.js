/* 阶段6入口：初始化存档、流派成长系统与移动端全视口 UI。 */
(function (global) {
  'use strict';

  function boot() {
    const app = global.FantasySurvivor;
    const saveData = app.Save.load();
    const mobileQuery = global.matchMedia && global.matchMedia('(pointer: coarse), (max-width: 900px)');
    const applyMobileSiteMode = () => {
      if ((mobileQuery && mobileQuery.matches) || (!mobileQuery && (global.innerWidth || 0) <= 900)) {
        document.body.classList.add('mobile-site-mode');
      } else {
        document.body.classList.remove('mobile-site-mode');
      }
    };

    applyMobileSiteMode();
    if (mobileQuery && mobileQuery.addEventListener) {
      mobileQuery.addEventListener('change', applyMobileSiteMode);
    } else {
      global.addEventListener('resize', applyMobileSiteMode, { passive: true });
    }

    app.Game.init({
      backgroundCanvas: document.getElementById('backgroundCanvas'),
      arenaCanvas: document.getElementById('gameCanvas'),
      joystickElement: document.getElementById('moveJoystick'),
      joystickKnob: document.getElementById('joystickKnob')
    });
    app.Game.setProgression(saveData, app.Upgrades.shardMultiplier(saveData));
    app.UI.init(saveData);

    const refreshViewport = () => {
      global.requestAnimationFrame(() => app.Game.resize());
    };
    global.addEventListener('orientationchange', refreshViewport, { passive: true });
    global.addEventListener('resize', refreshViewport, { passive: true });
    document.addEventListener('fullscreenchange', refreshViewport);
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', refreshViewport, { passive: true });
    }
    global.addEventListener('beforeunload', () => {
      if (app.UI.saveData) {
        app.UI.saveData.lastSeenAt = Date.now();
        app.Save.save(app.UI.saveData);
      }
    });
    console.info('[米饭的自我救赎] 大地图摄像机、角色跟随与可自定义移动轮盘已就绪。');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window);
