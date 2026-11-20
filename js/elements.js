/* 七元素基础数据。反应触发和战斗效果由 game.js 统一管理。 */
(function (global) {
  "use strict";

  const ELEMENTS = {
    fire: {
      id: "fire", name: "火", color: "#FF7A45",
      symbol: "✹", style: "fire", trait: "灼烧 · 爆发"
    },
    water: {
      id: "water", name: "水", color: "#4FC3F7",
      symbol: "◉", style: "water", trait: "连击 · 扩散"
    },
    electro: {
      id: "electro", name: "雷", color: "#B388FF",
      symbol: "ϟ", style: "electro", trait: "连锁 · 感电"
    },
    dendro: {
      id: "dendro", name: "草", color: "#8BC34A",
      symbol: "❋", style: "dendro", trait: "持续 · 控制"
    },
    cryo: {
      id: "cryo", name: "冰", color: "#B3E5FC",
      symbol: "❄", style: "cryo", trait: "减速 · 冻结"
    },
    geo: {
      id: "geo", name: "岩", color: "#FFCA28",
      symbol: "◇", style: "geo", trait: "坚固 · 重击"
    },
    anemo: {
      id: "anemo", name: "风", color: "#80CBC4",
      symbol: "〰", style: "anemo", trait: "穿透 · 击退"
    }
  };

  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.Elements = {
    all: ELEMENTS,
    get(id) {
      return ELEMENTS[id] || null;
    },
    list() {
      return Object.keys(ELEMENTS).map((id) => ELEMENTS[id]);
    }
  };
})(window);
