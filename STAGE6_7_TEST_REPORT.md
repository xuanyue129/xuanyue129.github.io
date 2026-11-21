# Stage 6.7 测试报告

## 已验证修改

- Boss 冲撞配置距离从 760 降至 380，视口对角线伸缩系数由 1.2 降至 0.6；冲撞预警线伸缩系数由 0.72 降至 0.36。
- Boss 入场清理原有小怪后，Boss 存活期间会继续按正常刷怪间隔刷新普通敌人；Boss 与普通敌人共享场上敌人数量上限。
- 玩家可见的升级流派与升级描述、首页提示均使用“召唤物”称呼。
- BGM 默认音量由 70% 降到 35%；存档由 v5 升级至 v6，已有 BGM 音量设置自动减半，总音量、音效音量和其他数据保留。

## 自动测试结果

- `node --check`：所有 JavaScript 文件通过。
- `run_stage6_tests.cjs`：通过。
- `run_stage6_1_layout_checks.cjs`：15/15 通过。
- `run_stage6_2_mobile_fullscreen_checks.cjs`：9/9 通过。
- `run_stage6_3_boss_checks.cjs`：通过，包含 Boss 战正常刷新敌人和冲撞距离缩短检查。
- `run_stage6_4_camera_joystick_checks.cjs`：通过，包含 v6 存档迁移。
- `run_stage6_5_boss_gold_checks.cjs`：通过。
- `run_stage6_6_audio_checks.cjs`：通过，包含 v4 存档迁移后 BGM 值为 35 的检查。

未在当前环境完成真实手机浏览器视觉测试与音频试听；BGM 文件仍需由部署者放入 `assets/audio/bgm1.mp3`。
