/* UI 状态、菜单、设置、HUD 和死亡结算。保持阶段 2 的 FantasySurvivor.UI 接口。 */
(function (global) {
  "use strict";

  const UI = {
    saveData: null,
    toastTimer: 0,
    elements: {},
    selectedElement: "water",
    lastResult: null,
    settingsPausedRun: false,

    init(saveData) {
      this.saveData = saveData;

      [
        "menuScreen", "gameScreen", "elementModal", "settingsModal",
        "pauseModal", "settlementModal", "toast", "volumeInput",
        "volumeOutput", "particlesInput", "shakeInput", "hudElement",
        "hudElementIcon", "hudHealth", "healthFill", "hudLevel",
        "hudExpText", "expFill", "hudGold", "hudWave", "hudKills",
        "hudTime", "hudReaction", "resultTime", "resultKills",
        "resultLevel", "resultExperience", "resultGold", "resultTotalGold"
      ].forEach((id) => {
        this.elements[id] = document.getElementById(id);
      });

      document.addEventListener("click", (event) => this.handleClick(event));
      document.addEventListener("keydown", (event) => this.handleKeydown(event));

      global.FantasySurvivor.Game.setCallbacks({
        onHUD: (data) => this.updateHUD(data),
        onLevelUp: (level) => this.toast("等级提升至 Lv. " + level + "！攻击能力小幅增强。"),
        onReaction: (name, color) => this.showReaction(name, color),
        onGameOver: (result) => this.showSettlement(result),
        onPause: (reason) => {
          if (reason === "visibility") this.openModal("pauseModal");
        }
      });

      this.bindSettings();
      this.refreshSettings();
    },

    handleClick(event) {
      const actionNode = event.target.closest("[data-action]");
      const elementNode = event.target.closest("[data-element]");

      if (elementNode) {
        this.chooseElement(elementNode.dataset.element);
        return;
      }
      if (!actionNode) return;

      switch (actionNode.dataset.action) {
        case "start":
          this.openModal("elementModal");
          break;
        case "settings":
          this.openSettings();
          break;
        case "close-settings":
          this.closeSettings();
          break;
        case "close-element":
          this.closeModal("elementModal");
          break;
        case "shop":
          this.toast("永久升级商店将在阶段 4 开放。");
          break;
        case "prestige":
          this.toast("转生与声望系统将在阶段 4 开放。");
          break;
        case "pause":
          this.pauseGame();
          break;
        case "resume":
          this.resumeGame();
          break;
        case "quit":
          this.returnToMenu();
          break;
        case "retry":
          this.retryRun();
          break;
        case "settlement-menu":
          this.closeModal("settlementModal");
          this.returnToMenu();
          break;
        case "reset-save":
          this.resetSave();
          break;
        default:
          break;
      }
    },

    handleKeydown(event) {
      if (event.key !== "Escape") return;

      if (!this.elements.settingsModal.hidden) {
        this.closeSettings();
      } else if (!this.elements.elementModal.hidden) {
        this.closeModal("elementModal");
      } else if (!this.elements.pauseModal.hidden) {
        this.resumeGame();
      } else if (!this.elements.settlementModal.hidden) {
        this.closeModal("settlementModal");
        this.returnToMenu();
      } else if (!this.elements.gameScreen.hidden) {
        this.pauseGame();
      }
    },

    openModal(id) {
      const modal = this.elements[id];
      if (!modal) return;
      modal.hidden = false;
      const focusTarget = modal.querySelector("button, input");
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    },

    closeModal(id) {
      if (this.elements[id]) this.elements[id].hidden = true;
    },

    openSettings() {
      this.settingsPausedRun = !this.elements.gameScreen.hidden &&
        global.FantasySurvivor.Game.active;
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

    chooseElement(id) {
      const element = global.FantasySurvivor.Elements.get(id);
      if (!element) return;
      this.selectedElement = id;
      this.closeModal("elementModal");
      this.startRun(id);
    },

    startRun(elementId) {
      const element = global.FantasySurvivor.Elements.get(elementId) ||
        global.FantasySurvivor.Elements.get("water");
      this.selectedElement = element.id;
      this.closeModal("pauseModal");
      this.closeModal("settlementModal");
      this.elements.menuScreen.hidden = true;
      this.elements.gameScreen.hidden = false;

      this.elements.hudElement.textContent = element.name;
      this.elements.hudElementIcon.textContent = element.symbol;
      this.elements.hudElementIcon.style.color = element.color;
      this.elements.hudReaction.textContent = "等待元素附着……";
      this.elements.hudReaction.style.color = "";

      global.FantasySurvivor.Game.start(element.id);
      global.FantasySurvivor.Game.resize();
    },

    pauseGame() {
      if (this.elements.gameScreen.hidden) return;
      if (!global.FantasySurvivor.Game.active) return;
      global.FantasySurvivor.Game.pause();
      this.openModal("pauseModal");
    },

    resumeGame() {
      this.closeModal("pauseModal");
      global.FantasySurvivor.Game.resume();
    },

    returnToMenu() {
      this.closeModal("pauseModal");
      this.closeModal("settlementModal");
      this.closeModal("settingsModal");
      this.settingsPausedRun = false;
      global.FantasySurvivor.Game.stop();
      this.elements.gameScreen.hidden = true;
      this.elements.menuScreen.hidden = false;
    },

    retryRun() {
      const element = this.lastResult && this.lastResult.element
        ? this.lastResult.element
        : this.selectedElement;
      this.startRun(element);
    },

    updateHUD(data) {
      this.elements.hudHealth.textContent = data.hp + " / " + data.maxHp;
      this.elements.healthFill.style.width = data.hpPercent + "%";
      this.elements.hudLevel.textContent = String(data.level);
      this.elements.hudExpText.textContent = data.exp + " / " + data.expRequired;
      this.elements.expFill.style.width = data.expPercent + "%";
      this.elements.hudGold.textContent = String(data.gold);
      this.elements.hudWave.textContent = String(data.wave).padStart(2, "0");
      this.elements.hudKills.textContent = String(data.kills);
      this.elements.hudTime.textContent = this.formatTime(data.time);
    },

    showReaction(name, color) {
      this.elements.hudReaction.textContent = name;
      this.elements.hudReaction.style.color = color || "";
    },

    showSettlement(result) {
      this.lastResult = result;
      this.saveData.gold = Math.max(0, Number(this.saveData.gold) || 0) + result.gold;
      this.saveData.stats.lifetimeKills =
        Math.max(0, Number(this.saveData.stats.lifetimeKills) || 0) + result.kills;
      this.saveData.stats.bestSurvivalSeconds = Math.max(
        Number(this.saveData.stats.bestSurvivalSeconds) || 0,
        result.duration
      );
      this.saveData.stats.bestLevel = Math.max(
        Number(this.saveData.stats.bestLevel) || 1,
        result.level
      );
      this.saveData.lastSeenAt = Date.now();
      global.FantasySurvivor.Save.save(this.saveData);

      this.elements.resultTime.textContent = this.formatTime(result.duration);
      this.elements.resultKills.textContent = String(result.kills);
      this.elements.resultLevel.textContent = "Lv. " + result.level;
      this.elements.resultExperience.textContent = String(result.experience || 0);
      this.elements.resultGold.textContent = "+" + result.gold;
      this.elements.resultTotalGold.textContent = String(this.saveData.gold);
      this.openModal("settlementModal");
    },

    formatTime(seconds) {
      const total = Math.max(0, Math.floor(seconds || 0));
      const minutes = Math.floor(total / 60);
      const rest = total % 60;
      return String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
    },

    bindSettings() {
      const volume = this.elements.volumeInput;
      const particles = this.elements.particlesInput;
      const shake = this.elements.shakeInput;

      volume.addEventListener("input", () => {
        const value = Number(volume.value);
        this.saveData.settings.masterVolume = value;
        this.elements.volumeOutput.value = value + "%";
        global.FantasySurvivor.Audio.setVolume(value / 100);
        this.persist();
      });

      particles.addEventListener("change", () => {
        this.saveData.settings.particles = particles.checked;
        global.FantasySurvivor.Game.setParticlesEnabled(particles.checked);
        this.persist();
      });

      shake.addEventListener("change", () => {
        this.saveData.settings.screenShake = shake.checked;
        global.FantasySurvivor.Game.setScreenShakeEnabled(shake.checked);
        this.persist();
      });
    },

    refreshSettings() {
      const settings = this.saveData.settings;
      this.elements.volumeInput.value = settings.masterVolume;
      this.elements.volumeOutput.value = settings.masterVolume + "%";
      this.elements.particlesInput.checked = settings.particles;
      this.elements.shakeInput.checked = settings.screenShake;
      global.FantasySurvivor.Audio.setVolume(settings.masterVolume / 100);
      global.FantasySurvivor.Game.setParticlesEnabled(settings.particles);
      global.FantasySurvivor.Game.setScreenShakeEnabled(settings.screenShake);
    },

    persist() {
      global.FantasySurvivor.Save.save(this.saveData);
    },

    resetSave() {
      const accepted = global.confirm("确定重置金币、成长记录和设置吗？此操作不可撤销。");
      if (!accepted) return;
      this.saveData = global.FantasySurvivor.Save.reset();
      this.refreshSettings();
      this.toast("本地存档已重置。");
    },

    toast(message) {
      const node = this.elements.toast;
      node.textContent = message;
      node.classList.add("is-visible");
      global.clearTimeout(this.toastTimer);
      this.toastTimer = global.setTimeout(() => {
        node.classList.remove("is-visible");
      }, 2400);
    }
  };

  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.UI = UI;
})(window);
