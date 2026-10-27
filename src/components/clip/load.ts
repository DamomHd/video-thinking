/**
 * 按上游 index.html 的顺序加载 huashu-clip（src/vendor/huashu-clip，原样收录的浏览器全局脚本）。
 * 只在 Remotion 渲染端 import；Node 端（测试、脚本）不要 import 这个文件。
 */
import './globals';
import '../../vendor/huashu-clip/lib/util.js';
import '../../vendor/huashu-clip/lib/paint.js';
import '../../vendor/huashu-clip/lib/kit.js';
import '../../vendor/huashu-clip/lib/motion.js';
import '../../vendor/huashu-clip/lib/camera.js';
import '../../vendor/huashu-clip/lib/diagram.js';
import '../../vendor/huashu-clip/lib/typo.js';
import '../../vendor/huashu-clip/lib/chart.js';
import '../../vendor/huashu-clip/lib/ui.js';
import '../../vendor/huashu-clip/lib/collage.js';
import '../../vendor/huashu-clip/lib/toon.js';
import '../../vendor/huashu-clip/cues.js';
import '../../vendor/huashu-clip/grammars/t1_3b1b.js';
import '../../vendor/huashu-clip/grammars/t2_keynote_ui.js';
import '../../vendor/huashu-clip/grammars/t3_finance_chart.js';
import '../../vendor/huashu-clip/grammars/y1_kurzgesagt.js';
import '../../vendor/huashu-clip/grammars/y2_vox.js';
import '../../vendor/huashu-clip/grammars/y3_whiteboard.js';
import '../../vendor/huashu-clip/grammars/y5_kinetic_type.js';
