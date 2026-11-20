# 阶段 3 自测记录

## 已完成的自动检查

- 所有 `js/*.js` 文件通过 `node --check` 语法检查。
- `index.html` 与 `about.html` 通过 Python HTMLParser 解析。
- `index.html` 中引用的脚本路径均存在。
- UI 代码依赖的主要 DOM ID 均在 `index.html` 中找到。
- 使用 Node VM + Canvas/DOM stub 对战斗状态更新做模拟：玩家位移、敌人刷新、元素反应、金币拾取、经验升级、死亡结算回调、重新开局清理均通过。

## 模拟测试观察值（单次随机测试，不代表固定游戏平衡）

- WASD 位移：0.5 秒约移动 120 CSS 像素。
- 出现敌人并执行自动攻击。
- 至少一次元素反应成功触发。
- 金币掉落拾取后 runGold 增加。
- 加入 200 点经验后达到等级 5。
- 死亡回调返回 duration、kills、level、gold、experience、element。
- 再次开局时本局击杀、敌人列表和等级重置。

## 尚需人工在目标浏览器验收

当前运行环境的 Chromium 页面导航被环境策略阻止（ERR_BLOCKED_BY_ADMINISTRATOR），因此没有声称完成真实浏览器点击测试。请按 README.md 中的自测步骤，在本机 Chrome / Edge 和 GitHub Pages 部署地址实际验收画面、键盘焦点、存档及手机布局。
