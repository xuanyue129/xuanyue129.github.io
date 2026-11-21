# Stage 6.8 测试报告

## 自动检查

- `node --check js/*.js`：全部 JavaScript 文件通过语法检查。
- `run_stage6_tests.cjs`：通过。
- `run_stage6_1_layout_checks.cjs`：15/15 通过。
- `run_stage6_2_mobile_fullscreen_checks.cjs`：9/9 通过。
- `run_stage6_3_boss_checks.cjs`：通过，覆盖 Boss 战刷怪、缩短冲撞距离、精英召唤与宝箱掉落。
- `run_stage6_4_camera_joystick_checks.cjs`：通过。
- `run_stage6_5_boss_gold_checks.cjs`：通过。
- `run_stage6_6_audio_checks.cjs`：通过。
- `run_stage6_8_feature_checks.cjs`：通过，覆盖经验 325 上限、百分比反噬、Lv.40/Lv.50 多 Boss、三次召唤额度、三连冲撞、宝箱拾取、三项宝箱奖励实际效果、五次初始刷新和 UI 连选三次流程。
- `run_stage6_8_audio_resume_checks.cjs`：通过，在模拟初始 suspended 的 AudioContext 下验证音效排队与恢复补播、BGM 解锁及设置页试听音效。

## 仍需部署后人工验证

当前自动化验证覆盖逻辑和 DOM 标记，不等于真实设备音频试听或手机实机体验。BGM MP3 仍需由部署者自行放入 `assets/audio/bgm1.mp3`；程序合成音效不依赖外部音效文件。建议部署后在设置页点击“试听音效”，确认设备未静音且“启用音频”开关开启。
