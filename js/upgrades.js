/* 四种专精流派 + 通用祝福。所有局内机制均由随机升级词条解锁和强化。 */
(function (global) {
  "use strict";

  const CONFIG = Object.freeze({
    shop: {
      offlineRate: { label: "离线收益倍率", description: "每级离线金币收益提高 10%", baseCost: 45, growth: 1.48, maxLevel: 20, unit: "+10%" },
      damage: { label: "初始伤害", description: "每级开局伤害 +1.5", baseCost: 45, growth: 1.46, maxLevel: 30, unit: "+1.5" },
      goldRate: { label: "金币获取率", description: "每级金币收益 +8%", baseCost: 55, growth: 1.52, maxLevel: 20, unit: "+8%" },
      expRate: { label: "经验获取率", description: "每级经验收益 +7%", baseCost: 55, growth: 1.52, maxLevel: 20, unit: "+7%" }
    },
    prestige: { shardsPerPrestige: 1, multiplierPerShard: 0.04, minimumBestWave: 2 },
    rarities: {
      common: { name: "普通", color: "#A7B0BA", weight: 58 },
      rare: { name: "稀有", color: "#58B9F6", weight: 27 },
      epic: { name: "史诗", color: "#B68AFF", weight: 12 },
      legendary: { name: "传说", color: "#F0C56A", weight: 3 }
    },
    archetypes: {
      shooting: { label: "射击流派", className: "shooting", color: "#70C8E8" },
      pet: { label: "召唤物流派", className: "pet", color: "#B99AFF" },
      gather: { label: "聚怪流派", className: "gather", color: "#83D7C5" },
      fortune: { label: "大运流派", className: "fortune", color: "#F0C56A" },
      general: { label: "通用词条", className: "general", color: "#D7DFEA" }
    }
  });

  const CARDS = [
    // 射击流派
    { id: "shootDamage", archetype: "shooting", name: "锋芒淬炼", desc: "子弹伤害提高 18%", rarity: "common", icon: "⚔", apply: p => { p.damage *= 1.18; } },
    { id: "attackSpeed", archetype: "shooting", name: "迅捷回响", desc: "射击间隔缩短 10%", rarity: "common", available: p => p.attackInterval > 0.221, apply: p => { p.attackInterval = Math.max(0.22, p.attackInterval * 0.9); } },
    { id: "ricochet", archetype: "shooting", name: "折光弹道", desc: "子弹命中后有 14% 概率弹射至另一名敌人", rarity: "rare", icon: "⤷", available: p => (p.ricochetChance || 0) < 0.81, apply: p => { p.ricochetChance = Math.min(0.82, (p.ricochetChance || 0) + 0.14); } },
    { id: "criticalChance", archetype: "shooting", name: "洞察弱点", desc: "暴击率提高 8%", rarity: "rare", icon: "✧", available: p => (p.critChance || 0) < 0.75, apply: p => { p.critChance = Math.min(0.75, (p.critChance || 0) + 0.08); } },
    { id: "criticalDamage", archetype: "shooting", name: "致命校准", desc: "暴击伤害倍率提高 0.35", rarity: "epic", icon: "✹", available: p => (p.critMultiplier || 1.8) < 4.49, apply: p => { p.critMultiplier = Math.min(4.5, (p.critMultiplier || 1.8) + 0.35); } },
    { id: "volley", archetype: "shooting", name: "双星齐射", desc: "每轮射击额外发射 1 枚子弹（最多 6 枚）", rarity: "epic", icon: "❖", available: p => (p.projectileCount || 1) < 6, apply: p => { p.projectileCount = Math.min(6, (p.projectileCount || 1) + 1); } },
    { id: "piercing", archetype: "shooting", name: "星矢贯穿", desc: "子弹额外穿透 1 名敌人", rarity: "epic", icon: "➳", available: p => (p.projectilePierce || 0) < 5, apply: p => { p.projectilePierce = Math.min(5, (p.projectilePierce || 0) + 1); } },
    { id: "projectileSpeed", archetype: "shooting", name: "流光弹芯", desc: "子弹飞行速度提高 20%", rarity: "common", icon: "➶", apply: p => { p.projectileSpeed *= 1.2; } },
    { id: "attackRange", archetype: "shooting", name: "远星锁定", desc: "自动索敌范围提高 18%", rarity: "rare", icon: "◎", apply: p => { p.attackRange *= 1.18; } },

    // 召唤物流派：首次必须召唤，随后召唤物沿直线冲撞，路径上的所有敌人均会受伤。
    { id: "petSummon", archetype: "pet", name: "灵伴初现", desc: "召唤 1 只环绕自身、能够冲撞攻击的召唤物", rarity: "rare", icon: "✧", available: p => (p.petCount || 0) <= 0, apply: p => { p.petCount = 1; p.petAttackTimers = [0.25]; p.petCharges = [null]; } },
    { id: "petCount", archetype: "pet", name: "灵伴增援", desc: "额外召唤 1 只召唤物（最多 6 只）", rarity: "epic", icon: "✦", available: p => (p.petCount || 0) > 0 && p.petCount < 6, apply: p => { p.petCount += 1; p.petAttackTimers = p.petAttackTimers || []; p.petAttackTimers.push(0.35); p.petCharges = p.petCharges || []; p.petCharges.push(null); } },
    { id: "petDamage", archetype: "pet", name: "灵核淬炼", desc: "召唤物每次冲撞伤害提高 25%", rarity: "common", icon: "◆", available: p => (p.petCount || 0) > 0, apply: p => { p.petDamage *= 1.25; } },
    { id: "petChargeDistance", archetype: "pet", name: "长驱直入", desc: "召唤物冲撞距离提高 22%", rarity: "common", icon: "➶", available: p => (p.petCount || 0) > 0 && p.petChargeDistance < 470, apply: p => { p.petChargeDistance = Math.min(480, p.petChargeDistance * 1.22); } },
    { id: "petChargeWidth", archetype: "pet", name: "横扫千军", desc: "召唤物冲撞范围（宽度）提高 22%", rarity: "rare", icon: "↔", available: p => (p.petCount || 0) > 0 && p.petChargeWidth < 82, apply: p => { p.petChargeWidth = Math.min(88, p.petChargeWidth * 1.22); } },
    { id: "petChargeInterval", archetype: "pet", name: "迅捷回身", desc: "召唤物冲撞间隔缩短 12%", rarity: "rare", icon: "↻", available: p => (p.petCount || 0) > 0 && p.petChargeInterval > 0.42, apply: p => { p.petChargeInterval = Math.max(0.4, p.petChargeInterval * 0.88); } },
    { id: "petChargeSpeed", archetype: "pet", name: "疾风冲阵", desc: "召唤物冲撞速度提高 18%", rarity: "epic", icon: "➤", available: p => (p.petCount || 0) > 0 && p.petChargeSpeed < 1450, apply: p => { p.petChargeSpeed = Math.min(1500, p.petChargeSpeed * 1.18); } },

    // 聚怪流派
    { id: "vortexUnlock", archetype: "gather", name: "风眼初现", desc: "解锁风漩涡：每射击 8 次召唤一个牵引敌人并持续造成伤害的漩涡", rarity: "rare", icon: "🌀", available: p => !p.vortexUnlocked, apply: p => { p.vortexUnlocked = true; p.vortexShotCounter = 0; } },
    { id: "vortexFrequency", archetype: "gather", name: "风眼连缀", desc: "风漩涡所需射击次数减少 1 次（最低 2 次）", rarity: "common", icon: "↻", available: p => p.vortexUnlocked && p.vortexShotsPerSummon > 2, apply: p => { p.vortexShotsPerSummon = Math.max(2, p.vortexShotsPerSummon - 1); } },
    { id: "vortexCount", archetype: "gather", name: "双重风眼", desc: "每次触发额外生成 1 个风漩涡（最多 4 个）", rarity: "epic", icon: "◉", available: p => p.vortexUnlocked && p.vortexCount < 4, apply: p => { p.vortexCount = Math.min(4, p.vortexCount + 1); } },
    { id: "vortexDamage", archetype: "gather", name: "风蚀加剧", desc: "风漩涡持续伤害提高 35%", rarity: "common", icon: "✥", available: p => p.vortexUnlocked, apply: p => { p.vortexDamage *= 1.35; } },
    { id: "vortexRadius", archetype: "gather", name: "广域风场", desc: "风漩涡牵引范围与视觉大小提高 20%", rarity: "rare", icon: "◎", available: p => p.vortexUnlocked && p.vortexRadius < 259, apply: p => { p.vortexRadius = Math.min(260, p.vortexRadius * 1.2); } },
    { id: "vortexDuration", archetype: "gather", name: "长驻风眼", desc: "风漩涡持续时间增加 0.8 秒", rarity: "common", icon: "⌛", available: p => p.vortexUnlocked && p.vortexDuration < 7.99, apply: p => { p.vortexDuration = Math.min(8, p.vortexDuration + 0.8); } },
    { id: "vortexPull", archetype: "gather", name: "强引涡流", desc: "风漩涡牵引力度提高 22%", rarity: "rare", icon: "⟲", available: p => p.vortexUnlocked, apply: p => { p.vortexPullStrength *= 1.22; } },

    // 大运流派：受伤后短时间开启伤害光环；回血词条仅保留用户明确要求的三种。
    { id: "fortuneUnlock", archetype: "fortune", name: "大运临身", desc: "解锁气运反噬：每次受伤后，周围敌人会持续受到伤害", rarity: "rare", icon: "☯", available: p => !p.fortuneUnlocked, apply: p => { p.fortuneUnlocked = true; p.fortuneAuraTimer = 0; } },
    { id: "fortuneDamage", archetype: "fortune", name: "否极泰来", desc: "气运反噬每秒造成目标最大生命值 12% 的伤害，强化后再提高 35%", rarity: "common", icon: "✹", available: p => p.fortuneUnlocked, apply: p => { p.fortuneDamage *= 1.35; } },
    { id: "fortuneRadius", archetype: "fortune", name: "运势扩张", desc: "气运反噬伤害范围提高 22%", rarity: "rare", icon: "◎", available: p => p.fortuneUnlocked && p.fortuneRadius < 210, apply: p => { p.fortuneRadius = Math.min(220, p.fortuneRadius * 1.22); } },
    { id: "fortuneDuration", archetype: "fortune", name: "时来运转", desc: "每次受伤触发的气运反噬持续时间增加 1.5 秒", rarity: "common", icon: "⌛", available: p => p.fortuneUnlocked && p.fortuneAuraDuration < 10, apply: p => { p.fortuneAuraDuration = Math.min(11, p.fortuneAuraDuration + 1.5); } },
    { id: "fortuneKillHeal", archetype: "fortune", name: "以战养运", desc: "解锁击杀回复：每击杀 20 只怪物恢复 1 颗心；再次选择可减少所需击杀数", rarity: "epic", icon: "♥", available: p => p.fortuneUnlocked && p.fortuneKillHealEvery > 4, apply: p => { p.fortuneKillHealEvery = p.fortuneKillHealEvery === Infinity ? 20 : Math.max(4, p.fortuneKillHealEvery - 4); } },
    { id: "fortuneMaxHearts", archetype: "fortune", name: "福泽绵长", desc: "生命上限增加 1 颗心", rarity: "rare", icon: "♥", available: p => p.fortuneUnlocked && p.maxHp < 20, apply: p => { p.maxHp += 1; } },
    { id: "fortuneTimedHeal", archetype: "fortune", name: "否极生福", desc: "解锁定时回复：每 60 秒恢复 1 颗心；再次选择可缩短 10 秒间隔", rarity: "epic", icon: "⏳", available: p => p.fortuneUnlocked && p.fortuneRegenInterval > 20, apply: p => { p.fortuneRegenInterval = p.fortuneRegenInterval === Infinity ? 60 : Math.max(20, p.fortuneRegenInterval - 10); } },

    // 通用词条：不属于任何专精，任何构筑都能受益。
    { id: "pickup", archetype: "general", name: "星辉牵引", desc: "经验与金币吸附范围提高 25%", rarity: "common", icon: "◇", apply: p => { p.pickupRadius *= 1.25; } },
    { id: "expWisdom", archetype: "general", name: "星识启迪", desc: "本局获得的经验提高 12%", rarity: "rare", icon: "✴", apply: p => { p.expMultiplier *= 1.12; } },
    { id: "goldFind", archetype: "general", name: "丰饶祝福", desc: "本局金币收益提高 15%", rarity: "common", icon: "✦", apply: p => { p.goldMultiplier *= 1.15; } },
    { id: "movement", archetype: "general", name: "逐风步伐", desc: "移动速度提高 12%", rarity: "common", icon: "〰", apply: p => { p.speed *= 1.12; } }
  ];

  function price(key, level) {
    const item = CONFIG.shop[key];
    return item ? Math.floor(item.baseCost * Math.pow(item.growth, Math.max(0, level))) : Infinity;
  }

  function weightedPick(pool) {
    const total = pool.reduce((sum, card) => sum + CONFIG.rarities[card.rarity].weight, 0);
    let roll = Math.random() * total;
    for (const card of pool) {
      roll -= CONFIG.rarities[card.rarity].weight;
      if (roll <= 0) return card;
    }
    return pool[pool.length - 1];
  }

  function getEligibleCards(player) {
    const state = player || {};
    return CARDS.filter(card => typeof card.available !== "function" || card.available(state));
  }

  function rollCards(count = 3, player = null) {
    const pool = getEligibleCards(player).slice();
    const result = [];
    while (result.length < count && pool.length) {
      const card = weightedPick(pool);
      result.push(card);
      pool.splice(pool.indexOf(card), 1);
    }
    return result;
  }

  function shardMultiplier(save) {
    return 1 + Math.max(0, save.shards || 0) * CONFIG.prestige.multiplierPerShard;
  }

  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.Upgrades = { CONFIG, CARDS, rarities: CONFIG.rarities, getPermanentPrice: price, getEligibleCards, rollCards, shardMultiplier };
})(window);
