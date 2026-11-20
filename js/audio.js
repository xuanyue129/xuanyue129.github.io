/* 音频模块占位。预留 Web Audio API 音效接口；当前同步音量设置。 */
(function (global) {
  "use strict";
  let volume = 0.7;
  let enabled = true;
  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.Audio = {
    setVolume(value) { volume = Math.max(0, Math.min(1, Number(value) || 0)); },
    setEnabled(value) { enabled = Boolean(value); },
    getVolume() { return volume; },
    isEnabled() { return enabled; },
    playUi() { /* 预留音效接口。 */ }
  };
})(window);
