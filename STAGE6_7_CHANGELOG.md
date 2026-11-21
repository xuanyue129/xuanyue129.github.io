# Stage 6.7 更新说明

1. **Boss 冲撞距离缩短 50%**：配置距离从 760 调整为 380，屏幕对角线动态距离系数从 1.2 调整为 0.6；冲撞预警长度系数从 0.72 调整为 0.36。
2. **Boss 战期间正常刷新普通敌人**：Boss 入场仍会清理已有小怪，但后续恢复正常刷怪间隔；Boss 与普通敌人共用 90 个敌人的场上数量上限。
3. **显示文本统一**：玩家可见的“宠物”文案改为“召唤物”，包括流派标题、升级描述、首页说明和元数据描述。
4. **BGM 默认音量减半**：默认值由 70% 改为 35%。存档版本升级到 v6，v5 及更早版本中的 BGM 音量值自动减半；总音量、音效音量和其他游戏数据保持不变。

## 回归测试

通过 JavaScript 语法检查、Stage 6 战斗逻辑、布局、手机全屏、Boss、摄像机/轮盘、金币和音频回归测试。浏览器实机试听与移动设备长时间实测仍需部署后完成。


## Stage 6.8 (2026-11-21)
- Repaired suspended Web Audio resume handling by queueing requested sound effects until the audio context is running; added an in-settings SFX test button and increased SFX audibility.
- Bosses summon elite minions up to three times; after the third summon, summon attacks are replaced and charge attacks become three consecutive dashes.
- Experience required to advance increases with level and caps at 325.
- Fortune Backlash now deals 12% of each target's maximum HP per second, with existing damage upgrades scaling it.
- Boss count increases by one every ten-level encounter after level 30 (one at Lv.30, two at Lv.40, three at Lv.50). Every defeated Boss drops a proximity chest with a three-choice reward.
- Upgrade drafts can be refreshed five times per run; chest rewards can add three refreshes or grant a one-time triple-pick sequence.
