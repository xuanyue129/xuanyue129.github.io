# 《米饭的自我救赎》Stage 6.5 综合测试说明

本项目保留 Stage 6.1–6.4 的移动端全屏、大地图、Boss 和轮盘自定义功能，并新增 Stage 6.5 Boss 血量递增及三倍金币 HUD 奖励。

本次新增细节与测试明细见 `STAGE6_5_TEST_REPORT.md`。Stage 6.1–6.4 的测试明细保留在对应报告中。

自动化回归测试命令：

```bash
node run_stage6_tests.cjs
node run_stage6_1_layout_checks.cjs
node run_stage6_2_mobile_fullscreen_checks.cjs
node run_stage6_3_boss_checks.cjs
node run_stage6_4_camera_joystick_checks.cjs
node run_stage6_5_boss_gold_checks.cjs
```

真实浏览器视觉验收仍需在部署后的设备上完成。
