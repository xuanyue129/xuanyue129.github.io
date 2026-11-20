/* 阶段6 UI：心数 HUD、流派随机升级、虚拟摇杆、永久商店、转生与结算。 */
(function (global) {
  "use strict";

  const UI = {
    saveData: null,
    elements: {},
    toastTimer: 0,
    lastResult: null,
    goldAnimatedTarget: null,
    goldDisplayedValue: 0,
    goldAnimationFrame: 0,
    settingsPausedRun: false,
    init(saveData) {
      this.saveData = saveData;
      const ids = [
        "menuScreen", "gameScreen", "settingsModal", "pauseModal", "settlementModal", "toast",
        "volumeInput", "volumeOutput", "bgmVolumeInput", "bgmVolumeOutput", "sfxVolumeInput", "sfxVolumeOutput", "audioEnabledInput",
        "particlesInput", "shakeInput", "hudHealth", "hudHearts",
        "hudLevel", "hudExpText", "expFill", "hudGold", "hudGoldGain", "hudWave", "hudKills", "hudTime", "hudBuffs",
        "resultTime", "resultKills", "resultLevel", "resultExperience", "resultGold", "resultTotalGold",
        "upgradeModal", "upgradeCards", "shopModal", "shopCards", "shopGold", "prestigeModal",
        "prestigeInfo", "offlineModal", "offlineInfo", "upgradeTitle", "upgradeSubtitle", "confirmPrestige",
        "joystickPreviewArea", "joystickPreviewControl"
      ];
      ids.forEach(id => { this.elements[id] = document.getElementById(id); });

      const app = global.FantasySurvivor;
      app.Game.setProgression(this.saveData, app.Upgrades.shardMultiplier(this.saveData));
      app.Game.setCallbacks({
        onHUD: data => this.updateHUD(data),
        onLevelUp: (level, count) => this.showUpgrade(level, count),
        onGameOver: result => this.showSettlement(result),
        onPause: reason => {
          if (reason === "visibility") this.openModal("pauseModal");
        }
      });

      document.addEventListener("click", event => this.handleClick(event));
      document.addEventListener("keydown", event => this.handleKeydown(event));
      // 浏览器要求由用户手势触发音频，第一次点击/按键后启动共享 BGM。
      const unlockAudio = () => {
        app.Audio.unlock();
        document.removeEventListener("pointerdown", unlockAudio, true);
        document.removeEventListener("keydown", unlockAudio, true);
      };
      document.addEventListener("pointerdown", unlockAudio, { capture: true, passive: true });
      document.addEventListener("keydown", unlockAudio, { capture: true });
      this.bindSettings();
      this.bindJoystickPreview();
      this.refreshSettings();
      this.refreshMenu();

      if (this.saveData.offlineReward && this.saveData.offlineReward.gold > 0) {
        const reward = this.saveData.offlineReward;
        this.elements.offlineInfo.textContent = `离开期间 ${this.formatHours(reward.hours)}，依据最高波次 ${reward.wave} 获得 ${reward.gold} 金币（最多计算 8 小时）。`;
        this.openModal("offlineModal");
        this.saveData.offlineReward.gold = 0;
      }
    },

    handleClick(event) {
      const action = event.target.closest("[data-action]");
      if (!action) return;
      const audio = global.FantasySurvivor.Audio;
      if (audio && action.dataset.action !== "upgrade-card") audio.playUi();
      switch (action.dataset.action) {
        case "start": this.startRun(); break;
        case "landscape": this.requestLandscape(); break;
        case "settings": this.openSettings(); break;
        case "close-settings": this.closeSettings(); break;
        case "shop": this.openShop(); break;
        case "close-shop": this.closeModal("shopModal"); break;
        case "prestige": this.openPrestige(); break;
        case "close-prestige": this.closeModal("prestigeModal"); break;
        case "confirm-prestige": this.doPrestige(); break;
        case "close-offline": this.closeModal("offlineModal"); break;
        case "pause": this.pauseGame(); break;
        case "resume": this.resumeGame(); break;
        case "quit": this.returnToMenu(); break;
        case "retry": this.retryRun(); break;
        case "settlement-menu": this.returnToMenu(); break;
        case "reset-save": this.resetSave(); break;
        case "reset-joystick-position": this.resetJoystickPosition(); break;
        case "upgrade-card": this.chooseUpgrade(Number(action.dataset.index)); break;
        case "buy-upgrade": this.buyUpgrade(action.dataset.key); break;
      }
    },

    handleKeydown(event) {
      if (event.key !== "Escape") return;
      if (!this.elements.upgradeModal.hidden) return;
      if (!this.elements.settingsModal.hidden) this.closeSettings();
      else if (!this.elements.pauseModal.hidden) this.resumeGame();
      else if (!this.elements.gameScreen.hidden) this.pauseGame();
    },

    openModal(id) {
      const modal = this.elements[id];
      if (!modal) return;
      modal.hidden = false;
      const focusable = modal.querySelector("button, input");
      if (focusable) focusable.focus({ preventScroll: true });
    },

    closeModal(id) {
      if (this.elements[id]) this.elements[id].hidden = true;
    },

    isMobileLayout() {
      return global.matchMedia ? global.matchMedia("(max-width: 900px), (pointer: coarse)").matches : (global.innerWidth || 0) <= 900;
    },

    async requestFullscreenIfSupported() {
      const root = document.documentElement;
      if (document.fullscreenElement || !root.requestFullscreen) return false;
      try {
        await root.requestFullscreen({ navigationUI: "hide" });
        return true;
      } catch (optionsError) {
        // Older implementations may support Fullscreen API but reject the options object.
        try {
          await root.requestFullscreen();
          return true;
        } catch (error) {
          console.info("[米饭的自我救赎] 当前浏览器未允许全屏，将保留横屏适配布局。", error);
          return false;
        }
      }
    },

    async lockLandscapeIfSupported() {
      const orientation = global.screen && global.screen.orientation;
      if (!orientation || typeof orientation.lock !== "function") return false;
      try {
        await orientation.lock("landscape");
        return true;
      } catch (error) {
        // iOS Safari and some embedded browsers do not support orientation locking.
        console.info("[米饭的自我救赎] 当前浏览器不支持自动锁定横屏，请手动旋转设备。", error);
        return false;
      }
    },

    async requestLandscape() {
      // Both APIs require a secure context / supported browser; the UI falls back to manual rotation.
      await this.requestFullscreenIfSupported();
      await this.lockLandscapeIfSupported();
    },

    enterMobileImmersiveMode() {
      if (!this.isMobileLayout()) return;
      document.body.classList.add("mobile-game-active");
      // Called synchronously from the start button gesture; fullscreen is best-effort.
      this.requestFullscreenIfSupported().then(() => this.lockLandscapeIfSupported());
    },

    exitMobileImmersiveMode() {
      document.body.classList.remove("mobile-game-active");
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    },

    startRun() {
      const app = global.FantasySurvivor;
      ["pauseModal", "settlementModal", "upgradeModal"].forEach(id => this.closeModal(id));
      this.elements.menuScreen.hidden = true;
      this.elements.gameScreen.hidden = false;
      this.enterMobileImmersiveMode();
      app.Game.setProgression(this.saveData, app.Upgrades.shardMultiplier(this.saveData));
      app.Game.start();
      app.Game.resize();
    },

    pauseGame() {
      const game = global.FantasySurvivor.Game;
      if (game.active) {
        game.pause();
        this.openModal("pauseModal");
      }
    },

    resumeGame() {
      this.closeModal("pauseModal");
      global.FantasySurvivor.Game.resume();
    },

    returnToMenu() {
      const app = global.FantasySurvivor;
      ["pauseModal", "settlementModal", "settingsModal", "upgradeModal"].forEach(id => this.closeModal(id));
      this.settingsPausedRun = false;
      app.Game.stop();
      this.elements.gameScreen.hidden = true;
      this.elements.menuScreen.hidden = false;
      this.exitMobileImmersiveMode();
      this.refreshMenu();
    },

    retryRun() {
      this.startRun();
    },

    updateHUD(data) {
      const currentHearts = Math.max(0, Math.ceil(data.hp));
      const maximumHearts = Math.max(1, Math.ceil(data.maxHp));
      this.elements.hudHealth.textContent = `${currentHearts} / ${maximumHearts}`;
      this.elements.hudHearts.innerHTML = Array.from({ length: maximumHearts }, (_, index) =>
        `<span class="${index < currentHearts ? "heart-full" : "heart-empty"}" aria-hidden="true">${index < currentHearts ? "♥" : "♡"}</span>`
      ).join("");
      this.elements.hudHearts.setAttribute("aria-label", `剩余 ${currentHearts} 颗心，共 ${maximumHearts} 颗心`);
      this.elements.hudLevel.textContent = data.level;
      this.elements.hudExpText.textContent = `${Math.floor(data.exp)} / ${data.expRequired}`;
      this.elements.expFill.style.width = `${data.expPercent}%`;
      this.animateGoldCounter(data.gold);
      this.elements.hudWave.textContent = String(data.wave).padStart(2, "0");
      this.elements.hudKills.textContent = data.kills;
      this.elements.hudTime.textContent = this.formatTime(data.time);
      this.elements.hudBuffs.textContent = data.buffs;
    },

    animateGoldCounter(targetValue) {
      const value = Math.max(0, Math.floor(Number(targetValue) || 0));
      const counter = this.elements.hudGold;
      if (!counter) return;

      if (this.goldAnimatedTarget === null) {
        this.goldAnimatedTarget = value;
        this.goldDisplayedValue = value;
        counter.textContent = String(value);
        return;
      }
      if (value === this.goldAnimatedTarget) return;

      // 新的一局会把本局金币归零；重置时不播放负增长动画。
      if (value < this.goldAnimatedTarget) {
        if (this.goldAnimationFrame && global.cancelAnimationFrame) global.cancelAnimationFrame(this.goldAnimationFrame);
        this.goldAnimatedTarget = value;
        this.goldDisplayedValue = value;
        counter.textContent = String(value);
        return;
      }

      const gained = value - this.goldAnimatedTarget;
      const startValue = this.goldDisplayedValue;
      const startTime = global.performance && global.performance.now ? global.performance.now() : Date.now();
      const duration = Math.min(720, 320 + Math.log10(gained + 1) * 105);
      this.goldAnimatedTarget = value;

      const gainLabel = this.elements.hudGoldGain;
      if (gainLabel) {
        gainLabel.textContent = `+${gained}`;
        gainLabel.classList.remove("is-active");
        void gainLabel.offsetWidth;
        gainLabel.classList.add("is-active");
      }

      if (this.goldAnimationFrame && global.cancelAnimationFrame) global.cancelAnimationFrame(this.goldAnimationFrame);
      const tick = now => {
        const progress = Math.min(1, Math.max(0, (now - startTime) / duration));
        const eased = 1 - Math.pow(1 - progress, 3);
        const shown = Math.round(startValue + (value - startValue) * eased);
        this.goldDisplayedValue = shown;
        counter.textContent = String(shown);
        if (progress < 1 && global.requestAnimationFrame) {
          this.goldAnimationFrame = global.requestAnimationFrame(tick);
        } else {
          this.goldDisplayedValue = value;
          counter.textContent = String(value);
          this.goldAnimationFrame = 0;
        }
      };
      if (global.requestAnimationFrame) this.goldAnimationFrame = global.requestAnimationFrame(tick);
      else {
        this.goldDisplayedValue = value;
        counter.textContent = String(value);
      }
    },

    showUpgrade(level, count) {
      const app = global.FantasySurvivor;
      const cards = app.Upgrades.rollCards(3, app.Game.player);
      this.currentCards = cards;
      this.elements.upgradeCards.innerHTML = cards.map((card, index) => {
        const rarity = app.Upgrades.rarities[card.rarity];
        const path = app.Upgrades.CONFIG.archetypes[card.archetype];
        return `<button class="upgrade-card rarity-${card.rarity} path-${card.archetype}" type="button" data-action="upgrade-card" data-index="${index}" style="--rarity:${rarity.color};--path-color:${path.color}">
          <span class="upgrade-path">${path.label}</span>
          <span class="upgrade-rarity">${rarity.name}</span>
          <span class="upgrade-icon">${card.icon || "✧"}</span>
          <strong>${card.name}</strong>
          <small>${card.desc}</small>
        </button>`;
      }).join("");
      this.elements.upgradeTitle.textContent = `等级提升 · Lv.${level}`;
      this.elements.upgradeSubtitle.textContent = count > 1
        ? `还有 ${count} 次强化待选择 · 四大流派与通用词条随机出现`
        : "射击、宠物、聚怪、大运与通用词条混合随机出现，选择你的构筑方向";
      this.openModal("upgradeModal");
    },

    chooseUpgrade(index) {
      const card = this.currentCards && this.currentCards[index];
      if (!card) return;
      const game = global.FantasySurvivor.Game;
      if (!game.applyUpgrade(card)) return;
      global.FantasySurvivor.Audio.playSfx("upgrade");
      this.persist();
      this.closeModal("upgradeModal");
      game.continueAfterUpgrade();
    },

    showSettlement(result) {
      this.lastResult = result;
      this.saveData.gold += Math.floor(result.gold);
      this.saveData.stats.lifetimeKills += result.kills;
      this.saveData.stats.bestSurvivalSeconds = Math.max(this.saveData.stats.bestSurvivalSeconds, result.duration);
      this.saveData.stats.bestLevel = Math.max(this.saveData.stats.bestLevel, result.level);
      this.saveData.stats.bestWave = Math.max(this.saveData.stats.bestWave, result.wave || 1);
      this.saveData.lastSeenAt = Date.now();
      this.persist();
      this.elements.resultTime.textContent = this.formatTime(result.duration);
      this.elements.resultKills.textContent = result.kills;
      this.elements.resultLevel.textContent = `Lv. ${result.level}`;
      this.elements.resultExperience.textContent = Math.floor(result.experience || 0);
      this.elements.resultGold.textContent = `+${Math.floor(result.gold)}`;
      this.elements.resultTotalGold.textContent = this.saveData.gold;
      this.openModal("settlementModal");
    },

    openShop() {
      this.renderShop();
      this.openModal("shopModal");
    },

    renderShop() {
      const upgrades = global.FantasySurvivor.Upgrades;
      this.elements.shopGold.textContent = this.saveData.gold;
      this.elements.shopCards.innerHTML = Object.entries(upgrades.CONFIG.shop).map(([key, config]) => {
        const level = this.saveData.permanentUpgrades[key] || 0;
        const price = upgrades.getPermanentPrice(key, level);
        const maxed = level >= config.maxLevel;
        const disabled = maxed || this.saveData.gold < price;
        return `<article class="shop-upgrade"><div><strong>${config.label}</strong><small>${config.description}</small><small>等级 ${level}/${config.maxLevel}</small></div>
          <button class="shop-buy" type="button" data-action="buy-upgrade" data-key="${key}" ${disabled ? "disabled" : ""}>${maxed ? "已满级" : `✧ ${price} 金币`}</button></article>`;
      }).join("");
    },

    buyUpgrade(key) {
      const upgrades = global.FantasySurvivor.Upgrades;
      const config = upgrades.CONFIG.shop[key];
      if (!config) return;
      const level = this.saveData.permanentUpgrades[key] || 0;
      const price = upgrades.getPermanentPrice(key, level);
      if (level >= config.maxLevel || this.saveData.gold < price) {
        this.toast("金币不足或已达到最高等级。");
        return;
      }
      this.saveData.gold -= price;
      this.saveData.permanentUpgrades[key] = level + 1;
      this.persist();
      this.renderShop();
      this.toast(`${config.label}提升至 Lv.${level + 1}`);
    },

    openPrestige() {
      const upgrades = global.FantasySurvivor.Upgrades;
      const canPrestige = this.saveData.stats.bestWave >= upgrades.CONFIG.prestige.minimumBestWave;
      this.elements.prestigeInfo.textContent = `当前星辉碎片：${this.saveData.shards}；全局倍率：×${upgrades.shardMultiplier(this.saveData).toFixed(2)}。转生将重置金币与永久商店等级，换取 1 枚星辉碎片。${canPrestige ? "" : "需要至少到达第 2 波才能转生。"}`;
      this.elements.confirmPrestige.disabled = !canPrestige;
      this.openModal("prestigeModal");
    },

    doPrestige() {
      const accepted = global.confirm("确认转生？金币和四项永久商店等级将清零，星辉碎片及其全局倍率永久保留。");
      if (!accepted) return;
      this.saveData.gold = 0;
      this.saveData.permanentUpgrades = { maxHp: 0, damage: 0, goldRate: 0, expRate: 0 };
      this.saveData.shards += global.FantasySurvivor.Upgrades.CONFIG.prestige.shardsPerPrestige;
      this.saveData.prestigeCount += 1;
      this.persist();
      this.closeModal("prestigeModal");
      this.toast("转生完成，获得 1 枚星辉碎片。");
    },

    refreshMenu() {
      const summary = document.getElementById("menuSaveSummary");
      if (summary) {
        summary.textContent = `金币 ${this.saveData.gold} · 星辉碎片 ${this.saveData.shards} · 全局倍率 ×${global.FantasySurvivor.Upgrades.shardMultiplier(this.saveData).toFixed(2)}`;
      }
    },

    formatTime(seconds) {
      const time = Math.max(0, Math.floor(seconds || 0));
      return `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`;
    },

    formatHours(hours) {
      return `${Math.floor(hours)}小时${Math.floor((hours % 1) * 60)}分钟`;
    },

    openSettings() {
      this.settingsPausedRun = !this.elements.gameScreen.hidden && global.FantasySurvivor.Game.active;
      if (this.settingsPausedRun) global.FantasySurvivor.Game.pause();
      this.openModal("settingsModal");
    },

    closeSettings() {
      this.closeModal("settingsModal");
      if (this.settingsPausedRun) {
        this.settingsPausedRun = false;
        global.FantasySurvivor.Game.resume();
      }
    },

    bindSettings() {
      const audio = global.FantasySurvivor.Audio;
      this.elements.volumeInput.addEventListener("input", () => {
        const value = Number(this.elements.volumeInput.value);
        this.saveData.settings.masterVolume = value;
        this.elements.volumeOutput.value = `${value}%`;
        audio.setMasterVolume(value / 100);
        this.persist();
      });
      this.elements.bgmVolumeInput.addEventListener("input", () => {
        const value = Number(this.elements.bgmVolumeInput.value);
        this.saveData.settings.bgmVolume = value;
        this.elements.bgmVolumeOutput.value = `${value}%`;
        audio.setBgmVolume(value / 100);
        this.persist();
      });
      this.elements.sfxVolumeInput.addEventListener("input", () => {
        const value = Number(this.elements.sfxVolumeInput.value);
        this.saveData.settings.sfxVolume = value;
        this.elements.sfxVolumeOutput.value = `${value}%`;
        audio.setSfxVolume(value / 100);
        this.persist();
      });
      this.elements.audioEnabledInput.addEventListener("change", () => {
        this.saveData.settings.audioEnabled = this.elements.audioEnabledInput.checked;
        audio.setEnabled(this.saveData.settings.audioEnabled);
        this.persist();
      });
      this.elements.particlesInput.addEventListener("change", () => {
        this.saveData.settings.particles = this.elements.particlesInput.checked;
        global.FantasySurvivor.Game.setParticlesEnabled(this.saveData.settings.particles);
        this.persist();
      });
      this.elements.shakeInput.addEventListener("change", () => {
        this.saveData.settings.screenShake = this.elements.shakeInput.checked;
        global.FantasySurvivor.Game.setScreenShakeEnabled(this.saveData.settings.screenShake);
        this.persist();
      });
    },

    refreshSettings() {
      const settings = this.saveData.settings;
      this.elements.volumeInput.value = settings.masterVolume;
      this.elements.volumeOutput.value = `${settings.masterVolume}%`;
      this.elements.bgmVolumeInput.value = settings.bgmVolume;
      this.elements.bgmVolumeOutput.value = `${settings.bgmVolume}%`;
      this.elements.sfxVolumeInput.value = settings.sfxVolume;
      this.elements.sfxVolumeOutput.value = `${settings.sfxVolume}%`;
      this.elements.audioEnabledInput.checked = settings.audioEnabled;
      this.elements.particlesInput.checked = settings.particles;
      this.elements.shakeInput.checked = settings.screenShake;
      global.FantasySurvivor.Audio.setMasterVolume(settings.masterVolume / 100);
      global.FantasySurvivor.Audio.setBgmVolume(settings.bgmVolume / 100);
      global.FantasySurvivor.Audio.setSfxVolume(settings.sfxVolume / 100);
      global.FantasySurvivor.Audio.setEnabled(settings.audioEnabled);
      global.FantasySurvivor.Game.setParticlesEnabled(settings.particles);
      global.FantasySurvivor.Game.setScreenShakeEnabled(settings.screenShake);
      this.applyJoystickPosition(settings.joystickPosition || { x: 0.86, y: 0.78 }, false);
    },

    bindJoystickPreview() {
      const area = this.elements.joystickPreviewArea;
      const control = this.elements.joystickPreviewControl;
      if (!area || !control) return;
      let pointerId = null;
      const update = (event) => {
        const rect = area.getBoundingClientRect();
        const knobRect = control.getBoundingClientRect();
        const halfW = knobRect.width / 2 + 3;
        const halfH = knobRect.height / 2 + 3;
        const px = Math.max(halfW, Math.min(rect.width - halfW, event.clientX - rect.left));
        const py = Math.max(halfH, Math.min(rect.height - halfH, event.clientY - rect.top));
        this.applyJoystickPosition({ x: px / rect.width, y: py / rect.height }, false);
      };
      control.addEventListener("pointerdown", (event) => {
        pointerId = event.pointerId;
        if (control.setPointerCapture) control.setPointerCapture(pointerId);
        update(event);
        event.preventDefault();
      });
      control.addEventListener("pointermove", (event) => {
        if (pointerId !== event.pointerId) return;
        update(event);
        event.preventDefault();
      });
      const release = (event) => {
        if (pointerId !== event.pointerId) return;
        pointerId = null;
        this.saveData.settings.joystickPosition = { ...this.pendingJoystickPosition };
        this.persist();
        event.preventDefault();
      };
      control.addEventListener("pointerup", release);
      control.addEventListener("pointercancel", release);
    },

    applyJoystickPosition(position, persist = false) {
      const rawX = Number(position && position.x);
      const rawY = Number(position && position.y);
      const x = Math.max(0.08, Math.min(0.92, Number.isFinite(rawX) ? rawX : 0.86));
      const y = Math.max(0.10, Math.min(0.90, Number.isFinite(rawY) ? rawY : 0.78));
      this.pendingJoystickPosition = { x, y };
      const control = this.elements.joystickPreviewControl;
      if (control) {
        control.style.left = `${x * 100}%`;
        control.style.top = `${y * 100}%`;
      }
      global.FantasySurvivor.Game.setJoystickPosition(this.pendingJoystickPosition);
      if (persist) {
        this.saveData.settings.joystickPosition = { x, y };
        this.persist();
      }
    },

    resetJoystickPosition() {
      this.applyJoystickPosition({ x: 0.86, y: 0.78 }, true);
    },

    persist() {
      global.FantasySurvivor.Save.save(this.saveData);
      this.refreshMenu();
    },

    resetSave() {
      if (!global.confirm("确定彻底重置所有存档？金币、星辉碎片、永久升级、统计和设置都会清空。此操作不可撤销。")) return;
      this.saveData = global.FantasySurvivor.Save.reset();
      global.FantasySurvivor.Game.setProgression(this.saveData, 1);
      this.refreshSettings();
      this.refreshMenu();
      this.toast("存档已重置。");
    },

    toast(message) {
      const node = this.elements.toast;
      node.textContent = message;
      node.classList.add("is-visible");
      global.clearTimeout(this.toastTimer);
      this.toastTimer = global.setTimeout(() => node.classList.remove("is-visible"), 2400);
    }
  };

  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.UI = UI;
})(window);
