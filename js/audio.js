/* 音频模块占位。阶段 5 再接入 Web Audio API 音效；本阶段只同步音量设置。 */
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
    playUi() { /* 阶段 5 接入音效。 */ }
  };
})(window);
