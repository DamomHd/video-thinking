# 绘本感 3D 阿尔卑斯航拍 · Storybook 3D Alpine Aerial

> 原文：lemo-opuscar `styleboard/opuscar98_styles.json` 第 38 条（OPUSCAR 98 纪念片里《音乐之声》The Sound of Music（1965）那一段的风格；LemoLab，MIT，commit `413a6bd`），2026-10-27 收入本仓库作参考（不在风格库里，片子不能选它当风格），未改动。
> 这是约 5 秒片段的风格，没有完整的十一节说明，所以不进风格库。用法：当视觉语言的参考——某一段画面想要这种质感时，借它的提示词写进决策单，声音、镜头、坑由模型自己补。

**渲染**：3D（3D）　**手法组合**：程序生成 3D 地形（three.js） · 托德宽银幕色彩 · Ted McCord 直升机开场 · 宫崎骏的草原（Procedural 3D terrain (three.js) · Todd-AO widescreen colour · Ted McCord's helicopter opening · Miyazaki meadows）

## 风格提示词（中文原文）

绘本感的 3D 风景，60 年代宽银幕的饱和色，形体圆润光滑有雕塑感，不写实也不做低多边形。默认光：太阳高挂、略在镜头身后，大地满色：翠绿草地 #3FA33A、钴蓝天空 #2F6FD0、干净的白雪白云。风化山脊圆润，雪线顺坡，岩层暖灰赭，有云影。空气透视只加在最远的山脊，约两成半淡紫。积云是受光的白色棉花团。前景是齐膝密草和野花，随阵风弯伏。太阳低时只拉长影子、让云边变暖；其他场景也用这些颜色。一个连续镜头：前两秒高空飞越，再两秒降到草坡，之后贴草低机位环绕主体（每秒约 20°，主体约占画面高四分之一）。对标摄影师 Ted McCord（《音乐之声》，1965）和宫崎骏的草地。避免：泛紫、针尖山峰、写实灰岩、不动的草。

## Style prompt (English original)

Storybook 3D landscape in saturated 1960s widescreen colour: smooth sculpted forms, not low-poly or photoreal. Default light: bright sun high, a little behind the camera: emerald grass #3FA33A, cobalt sky #2F6FD0, clean white snow and clouds. Rounded ridges, snow lines following slope, grey-ochre rock bands, cloud shadows. Haze only on the farthest ridges, about 25% lilac. Cumulus are lit white cotton puffs. Knee-high grass and wildflowers fill the foreground, bending in gusts. A lower sun lengthens shadows and warms only cloud edges; other settings keep these colours. Camera: one continuous move: 0–2 s high flight, 2–4 s descent, then a low orbit through the grass around the subject (about 20° per second, subject about 1/4 of frame height). References: cinematographer Ted McCord (*The Sound of Music*, 1965); Miyazaki's meadows. Avoid: violet wash, needle peaks, grey photoreal rock, static grass.

## 这个风格是什么（上游说明）

绘本感的 3D 程序阿尔卑斯：饱和的翠绿、钴蓝、雪白，雕塑感的山脊，棉花团积云，风吹过草地的草浪。重演开场的直升机航拍，最后落到山顶转圈的玛丽亚。

Storybook 3D over procedural Alps: saturated emerald, cobalt and snow white, sculpted ridges, cotton-ball cumulus and gusts running through the grass. It restages the helicopter opening that ends on Maria spinning on the hilltop.

## 上游示范用法（只是一个例子，不要照搬故事和镜头）

Clawd 扮玛丽亚：头顶一朵雪绒花和一个小头巾结，照海报一手拎条纹毯包、一手拎吉他琴盒。转圈是一条贯穿三个镜头的连续曲线，每一刀都切在转到一半的时候；最后一拍双臂高举。

| 机位 | 镜头 | Shot |
|---|---|---|
| far | 画面从上一部的两个望远镜圆圈里打开到全屏：高空航拍，穿过棉花团积云掠过雪峰。 | Inside the two binocular circles carried over from My Fair Lady, which open to full frame: a high aerial gliding over snow peaks through cotton-ball clouds. |
| approach | 下降逼近山顶草坡：Clawd 小小地在画面正中，已经甩着毯包和琴盒转起来，远处是森林和田地拼块；镜头朝它降下去。 | Descent onto the hilltop meadow: Clawd small at frame centre, already turning with carpet bag and guitar case flung out, forest and field patchwork beyond; the camera drops toward it. |
| meadow | 贴着草的低机位，镜头环绕转了一整圈的 Clawd，毯包和琴盒甩开，身后是雪峰和积云；最后它双臂高举。 | Low in the grass, the camera orbits as Clawd twirls a full turn, bag and case swinging, snow peaks and clouds behind, then throws its arms up. |

参考：Robert Wise, 1965；Ted McCord (cinematography)；Howard Terpning (1965 poster)；Hayao Miyazaki (meadows)

![画面帧](img/38.jpg)
