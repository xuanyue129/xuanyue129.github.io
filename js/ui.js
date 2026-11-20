/* UI 状态、弹窗、菜单点击与设置交互。 */
(function (global) {
  "use strict";
  const UI = {
    saveData: null,
    toastTimer: 0,
    elements: {},

    init(saveData) {
      this.saveData = saveData;
      ["menuScreen", "gameScreen", "elementModal", "settingsModal", "pauseModal", "toast", "volumeInput", "volumeOutput", "particlesInput", "shakeInput", "hudElement", "hudElementIcon", "arenaElementName"].forEach((id) => {
        this.elements[id] = document.getElementById(id);
      });
      document.addEventListener("click", (event) => this.handleClick(event));
      document.addEventListener("keydown", (event) => this.handleKeydown(event));
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
      const action = actionNode.dataset.action;
      switch (action) {
        case "start": this.openModal("elementModal"); break;
        case "settings": this.openModal("settingsModal"); break;
        case "close-settings": this.closeModal("settingsModal"); break;
        case "close-element": this.closeModal("elementModal"); break;
        case "shop": this.toast("永久升级商店将在阶段 4 开放。"); break;
        case "prestige": this.toast("转生与声望系统将在阶段 4 开放。"); break;
        case "pause": this.pauseGame(); break;
        case "resume": this.resumeGame(); break;
        case "quit": this.returnToMenu(); break;
        case "reset-save": this.resetSave(); break;
        default: break;
      }
    },

    handleKeydown(event) {
      if (event.key !== "Escape") return;
      if (!this.elements.settingsModal.hidden) this.closeModal("settingsModal");
      else if (!this.elements.elementModal.hidden) this.closeModal("elementModal");
      else if (!this.elements.pauseModal.hidden) this.resumeGame();
      else if (!this.elements.gameScreen.hidden) this.pauseGame();
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

    chooseElement(id) {
      const element = global.FantasySurvivor.Elements.get(id);
      if (!element) return;
      this.closeModal("elementModal");
      this.elements.menuScreen.hidden = true;
      this.elements.gameScreen.hidden = false;
      this.elements.hudElement.textContent = element.name;
      this.elements.hudElementIcon.textContent = element.symbol;
      this.elements.hudElementIcon.style.color = element.color;
      this.elements.arenaElementName.textContent = element.name + "元素 · 场景预览";
      this.elements.arenaElementName.style.color = element.color;
      global.FantasySurvivor.Game.start(id);
      global.FantasySurvivor.Game.resize();
    },

    pauseGame() {
      if (this.elements.gameScreen.hidden) return;
      global.FantasySurvivor.Game.pause();
      this.openModal("pauseModal");
    },

    resumeGame() {
      this.closeModal("pauseModal");
      global.FantasySurvivor.Game.resume();
    },

    returnToMenu() {
      this.closeModal("pauseModal");
      global.FantasySurvivor.Game.stop();
      this.elements.gameScreen.hidden = true;
      this.elements.menuScreen.hidden = false;
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
    },

    persist() {
      global.FantasySurvivor.Save.save(this.saveData);
    },

    resetSave() {
      const accepted = global.confirm("确定重置本地存档和设置吗？此操作不可撤销。");
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
      this.toastTimer = global.setTimeout(() => node.classList.remove("is-visible"), 2600);
    }
  };
  global.FantasySurvivor = global.FantasySurvivor || {};
  global.FantasySurvivor.UI = UI;
})(window);
