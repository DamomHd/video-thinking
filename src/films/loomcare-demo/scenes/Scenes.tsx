import React from 'react';
import { Stage } from '../../../components/Stage';
import { PhoneShot, PhoneBodyManifest } from '../../../components/PhoneShot';
import { careScreenQuad, careBodyQuad, careTrackSig } from './careRig';
import phoneBody from '../three/phoneBody.json' with { type: 'json' };

/** 机位签名只算一次（纯函数、无副作用，模块级缓存即可） */
const CARE_SIG = careTrackSig();
import { camEaseOut, easeOutCubic } from '../../../shared/anim';

interface SceneProps {
  t: number; // 幕内秒数
}

// 统一色彩规范 (LoomCare 品牌设计语言)
const THEME = {
  bg: '#F3F0E8',
  paper: '#FFFFFF',
  ink: '#1E2A2E',
  inkLight: '#4B5563',
  teal: '#1F7F72',
  tealSoft: '#E6F2EF',
  tealBorder: '#B2D8D2',
  gold: '#B8862B', // 仅标 AI 时刻
  border: 'rgba(30, 42, 46, 0.1)',
  shadow: '0 4px 20px rgba(30, 42, 46, 0.06)',
};

/**
 * 00 序幕 (12.0s)
 */
export const PrologueScene: React.FC<SceneProps> = ({ t }) => {
  const p = camEaseOut(Math.min(1, t / 12.0));
  const camera = { x: 0, y: 0, z: 1.25 - p * 0.25 };

  return (
    <Stage camera={camera}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 20, letterSpacing: '0.28em', color: THEME.teal, textTransform: 'uppercase', fontWeight: 700, marginBottom: 18, opacity: Math.min(1, t / 1.2) }}>
          Loom Care
        </div>
        <div style={{ fontSize: 52, color: THEME.ink, fontWeight: 800, letterSpacing: '0.04em', opacity: Math.min(1, Math.max(0, (t - 0.6) / 1.5)) }}>
          把病历组织成指引
        </div>
        <div style={{ fontSize: 20, color: THEME.inkLight, marginTop: 16, opacity: Math.min(1, Math.max(0, (t - 1.8) / 1.5)) }}>
          每一个生命，都值得被结构化地守护
        </div>
      </div>
    </Stage>
  );
};

/**
 * 片名 (8.2s)
 */
export const TitleScene: React.FC<SceneProps> = ({ t }) => {
  const scale = 1.0 + Math.min(0.08, t * 0.01);
  return (
    <Stage camera={{ x: 0, y: 0, z: 1.0 / scale }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 68, fontWeight: 900, color: THEME.teal, letterSpacing: '0.06em', opacity: Math.min(1, t / 1.0) }}>
          LOOM CARE
        </div>
        <div style={{ fontSize: 22, color: THEME.gold, fontWeight: 600, letterSpacing: '0.2em', marginTop: 14, opacity: Math.min(1, Math.max(0, (t - 0.8) / 1.2)) }}>
          医护指引引擎 · 第二代架构
        </div>
      </div>
    </Stage>
  );
};

/**
 * 01 接入 (5.6s)
 */
export const ConnectScene: React.FC<SceneProps> = ({ t }) => {
  const p = easeOutCubic(Math.min(1, t / 1.5));
  const cardOffset = (1 - p) * 120;
  return (
    <Stage camera={{ x: 0, y: 0, z: 1.0 }}>
      <div style={{ width: '100%', height: '100%', padding: '120px 200px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 16, color: THEME.teal, fontWeight: 700, letterSpacing: '0.15em', marginBottom: 12 }}>
          01 · 接入 MULTI-SOURCE INGESTION
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, color: THEME.ink, marginBottom: 40 }}>
          多源病历一键汇聚，秒级对齐
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, transform: `translateY(${cardOffset}px)`, opacity: p }}>
          {[
            { title: 'HIS 门诊系统', meta: '诊断记录 / 处方单', count: '1,420 条' },
            { title: 'PACS 影像报告', meta: 'CT / 核磁扫描附言', count: '84 份' },
            { title: 'LIS 检验指标', meta: '血常规 / 免疫生化', count: '312 项' },
          ].map((c, i) => (
            <div key={i} style={{ background: THEME.paper, padding: 32, borderRadius: 16, border: `1px solid ${THEME.border}`, boxShadow: THEME.shadow }}>
              <div style={{ fontSize: 14, color: THEME.teal, fontWeight: 600 }}>{c.meta}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: THEME.ink, margin: '12px 0' }}>{c.title}</div>
              <div style={{ fontSize: 18, color: THEME.gold, fontWeight: 700 }}>{c.count}</div>
            </div>
          ))}
        </div>
      </div>
    </Stage>
  );
};

/**
 * 02 对话 A (4.1s)
 */
export const DialogAScene: React.FC<SceneProps> = ({ t }) => {
  const p = easeOutCubic(Math.min(1, t / 1.2));
  return (
    <Stage camera={{ x: 0, y: 0, z: 1.0 }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 800, background: THEME.paper, borderRadius: 20, padding: 36, border: `1px solid ${THEME.border}`, boxShadow: THEME.shadow, transform: `scale(${0.9 + p * 0.1})`, opacity: p }}>
          <div style={{ fontSize: 14, color: THEME.teal, fontWeight: 700, marginBottom: 8 }}>患者主诉录入</div>
          <div style={{ fontSize: 26, fontWeight: 600, color: THEME.ink, lineHeight: 1.6 }}>
            “患者术后第 3 天，偶有低热 37.8℃，诉伤口轻微牵拉痛，伴乏力...”
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <span style={{ background: THEME.tealSoft, color: THEME.teal, padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>低热 37.8℃</span>
            <span style={{ background: THEME.tealSoft, color: THEME.teal, padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>伤口牵拉痛</span>
            <span style={{ background: '#FDF2E9', color: '#B45309', padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>高敏待复查</span>
          </div>
        </div>
      </div>
    </Stage>
  );
};

/**
 * 芯片过场 (8.2s)
 */
export const ChipScene: React.FC<SceneProps> = ({ t }) => {
  const rot = t * 12;
  const p = Math.min(1, t / 2.0);
  return (
    <Stage camera={{ x: 0, y: 0, z: 1.0 }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 280, height: 280, borderRadius: 36, background: `linear-gradient(135deg, ${THEME.teal}, #14605A)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 20px 60px rgba(31, 127, 114, 0.35)', transform: `rotate(${rot}deg) scale(${0.8 + p * 0.2})` }}>
          <div style={{ width: 180, height: 180, borderRadius: 24, border: '2px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, fontWeight: 800, letterSpacing: '0.1em' }}>
            LC-AI
          </div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: THEME.ink, marginTop: 40, opacity: p }}>
          本地离线医疗推理引擎 · 毫秒响应
        </div>
      </div>
    </Stage>
  );
};

/**
 * 02 对话 B (25.9s)
 */
export const DialogBScene: React.FC<SceneProps> = ({ t }) => {
  return (
    <Stage camera={{ x: 0, y: 0, z: 1.0 }}>
      <div style={{ width: '100%', height: '100%', padding: '100px 240px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontSize: 14, color: THEME.teal, fontWeight: 700, letterSpacing: '0.15em' }}>02 · 智能追问与流式排版</div>
        <div style={{ background: THEME.paper, padding: 24, borderRadius: 16, border: `1px solid ${THEME.border}`, maxWidth: 680, alignSelf: 'flex-start' }}>
          <div style={{ fontSize: 18, color: THEME.ink, lineHeight: 1.6 }}>请确认患者伤口敷料有无渗出？引流液颜色是否呈淡血性？</div>
        </div>
        {t > 3.0 && (
          <div style={{ background: THEME.tealSoft, padding: 24, borderRadius: 16, border: `1px solid ${THEME.tealBorder}`, maxWidth: 680, alignSelf: 'flex-end' }}>
            <div style={{ fontSize: 18, color: THEME.teal, lineHeight: 1.6 }}>敷料干燥清洁，引流袋 24h 引流量 45ml，淡红色。</div>
          </div>
        )}
        {t > 6.0 && (
          <div style={{ background: THEME.paper, padding: 24, borderRadius: 16, border: `1px solid ${THEME.gold}`, maxWidth: 680, alignSelf: 'flex-start' }}>
            <div style={{ fontSize: 13, color: THEME.gold, fontWeight: 700, marginBottom: 4 }}>AI 护理指引生成中...</div>
            <div style={{ fontSize: 18, color: THEME.ink, lineHeight: 1.6 }}>已评估为术后良性反应，无需升级抗生素，建议维持现行抗炎镇痛。</div>
          </div>
        )}
      </div>
    </Stage>
  );
};

/**
 * 03 读懂 (23.8s)
 */
export const UnderstandScene: React.FC<SceneProps> = ({ t }) => {
  return (
    <Stage camera={{ x: 0, y: 0, z: 1.0 }}>
      <div style={{ width: '100%', height: '100%', padding: '100px 180px' }}>
        <div style={{ fontSize: 36, fontWeight: 800, color: THEME.ink, marginBottom: 30 }}>
          03 · 读懂：病程全要素关联抽取
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 32 }}>
          <div style={{ background: THEME.paper, padding: 32, borderRadius: 16, border: `1px solid ${THEME.border}` }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: THEME.teal, marginBottom: 16 }}>动态病历结构图谱</div>
            <div style={{ fontSize: 15, color: THEME.inkLight, lineHeight: 1.8 }}>
              • 诊断轴：腹腔镜胆囊切除术后（Day 3）<br/>
              • 指标轴：白细胞 8.4×10⁹/L，CRP 12mg/L（回落趋势）<br/>
              • 用药轴：头孢呋辛酯 0.25g bid po（完成第 3 天疗程）
            </div>
          </div>
          <div style={{ background: THEME.paper, padding: 32, borderRadius: 16, border: `1px solid ${THEME.gold}` }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: THEME.gold, marginBottom: 16 }}>金准研判与警示</div>
            <div style={{ fontSize: 15, color: THEME.ink, lineHeight: 1.8 }}>
              体温波动处于术后吸收热安全窗口，无腹膜刺激征迹象，指引安全级别：优（Green-Level）。
            </div>
          </div>
        </div>
      </div>
    </Stage>
  );
};

/**
 * 04 有人负责 (14.2s)
 */
export const HumanScene: React.FC<SceneProps> = ({ t }) => {
  return (
    <Stage camera={{ x: 0, y: 0, z: 1.0 }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: THEME.ink, marginBottom: 36 }}>
          04 · 闭环：AI 提炼，医生把关
        </div>
        <div style={{ display: 'flex', gap: 32 }}>
          {[
            { role: '责任主治医生', name: '张建军 主任医师', hospital: '三甲普外科' },
            { role: '专科跟进护理师', name: '李晓敏 主管护师', hospital: '快速康复小组' },
            { role: '临床药学顾问', name: '陈文 药剂师', hospital: '处方审核中心' },
          ].map((d, i) => (
            <div key={i} style={{ background: THEME.paper, padding: 32, width: 280, borderRadius: 16, border: `1px solid ${THEME.border}`, textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: THEME.tealSoft, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.teal, fontSize: 24, fontWeight: 700 }}>
                {d.name.slice(0, 1)}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: THEME.ink }}>{d.name}</div>
              <div style={{ fontSize: 14, color: THEME.teal, margin: '6px 0' }}>{d.role}</div>
              <div style={{ fontSize: 12, color: THEME.inkLight }}>{d.hospital}</div>
            </div>
          ))}
        </div>
      </div>
    </Stage>
  );
};

/**
 * 05 有温度 (24.0s · 3D 手机机身透视)
 */
export const CareScene: React.FC<SceneProps> = ({ t }) => {
  // 机位、屏幕四角、机身四角全部来自 careRig 这一个单源（Node 与渲染端同源）
  const screenQuad = careScreenQuad(t);
  const bodyQuad = careBodyQuad(t);

  return (
    <Stage camera={{ x: 0, y: 0, z: 1.0 }}>
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <PhoneShot
          t={t}
          screenQuad={screenQuad}
          bodyQuad={bodyQuad}
          phoneBodyManifest={phoneBody as PhoneBodyManifest}
          currentSig={CARE_SIG}
        >
          <div style={{ width: '100%', height: '100%', background: '#F8FAFC', padding: 24, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: THEME.teal, marginBottom: 16 }}>今日医护看板</div>
            <div style={{ background: '#fff', borderRadius: 14, padding: 18, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 12, color: THEME.inkLight }}>当前体温监测</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: THEME.teal, marginTop: 4 }}>36.8 ℃ <span style={{ fontSize: 12, color: '#10B981' }}>已平稳</span></div>
            </div>
            <div style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 12, color: THEME.inkLight }}>下步行动指引</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: THEME.ink, marginTop: 6 }}>14:00 伤口换药检查</div>
              <div style={{ fontSize: 13, color: THEME.inkLight, marginTop: 4 }}>普外科换药室 · 护士站已派发指引</div>
            </div>
          </div>
        </PhoneShot>
      </div>
    </Stage>
  );
};

/**
 * 06 织 (11.6s · 过场)
 */
export const WeaveScene: React.FC<SceneProps> = ({ t }) => {
  return (
    <Stage camera={{ x: 0, y: 0, z: 1.0 }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 44, fontWeight: 900, color: THEME.teal, letterSpacing: '0.1em' }}>
          织 · 医疗全息知识经纬
        </div>
        <div style={{ fontSize: 18, color: THEME.inkLight, marginTop: 16 }}>
          14,000+ 临床诊疗路径 · 跨医院连续互认
        </div>
      </div>
    </Stage>
  );
};

/**
 * 07 越用越懂 (54.25s)
 */
export const LearnScene: React.FC<SceneProps> = ({ t }) => {
  return (
    <Stage camera={{ x: 0, y: 0, z: 1.0 }}>
      <div style={{ width: '100%', height: '100%', padding: '100px 200px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 38, fontWeight: 900, color: THEME.ink, marginBottom: 32 }}>
          06 · 进化：越用越懂的指引中枢
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {[
            { tag: '患者端', title: '看得懂的白话解读', desc: '医学名词转换为温和、明确的家庭护理步骤。' },
            { tag: '医护端', title: '免重复手写的摘要', desc: '交班查房无需翻箱倒柜，核心态势一屏呈现。' },
            { tag: '管理端', title: '质量与风险早感知', desc: '并发症预警前置 48 小时，全程留痕可溯源。' },
          ].map((item, i) => (
            <div key={i} style={{ background: THEME.paper, padding: 32, borderRadius: 16, border: `1px solid ${THEME.border}` }}>
              <div style={{ fontSize: 13, color: THEME.gold, fontWeight: 700, marginBottom: 8 }}>{item.tag}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: THEME.ink, marginBottom: 12 }}>{item.title}</div>
              <div style={{ fontSize: 14, color: THEME.inkLight, lineHeight: 1.7 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </Stage>
  );
};

/**
 * 08 底座 / 落版 (13.75s)
 */
export const FinaleScene: React.FC<SceneProps> = ({ t }) => {
  const p = Math.min(1, t / 1.5);
  return (
    <Stage camera={{ x: 0, y: 0, z: 1.0 }}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 24, letterSpacing: '0.3em', color: THEME.teal, fontWeight: 800, textTransform: 'uppercase', marginBottom: 20 }}>
          LOOM CARE
        </div>
        <div style={{ fontSize: 56, fontWeight: 900, color: THEME.ink, letterSpacing: '0.04em', opacity: p }}>
          让医疗数据，长成有温度的指引
        </div>
        <div style={{ fontSize: 18, color: THEME.gold, fontWeight: 600, letterSpacing: '0.15em', marginTop: 24, opacity: p }}>
          基于第二代程序化影片工作室驱动交付
        </div>
      </div>
    </Stage>
  );
};
