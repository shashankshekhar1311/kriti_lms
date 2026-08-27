import {AbsoluteFill, interpolate, random, useCurrentFrame} from 'remotion';
import {motion} from 'framer-motion';
import {COLORS, LAYOUT} from '../theme';

const PARTICLE_COUNT = 18;

type ParticleSeed = {
  id: number;
  x: number;
  size: number;
  opacity: number;
  riseFrames: number;
  phase: number;
  drift: number;
};

const PARTICLES: ParticleSeed[] = Array.from({length: PARTICLE_COUNT}, (_, i) => ({
  id: i,
  x: random(`ambient-x-${i}`) * LAYOUT.width,
  size: 1.5 + random(`ambient-size-${i}`) * 3.5,
  opacity: 0.12 + random(`ambient-op-${i}`) * 0.28,
  riseFrames: Math.round(LAYOUT.fps * (14 + random(`ambient-rise-${i}`) * 16)),
  phase: random(`ambient-phase-${i}`),
  drift: (random(`ambient-drift-${i}`) - 0.5) * 90,
}));

type OrbConfig = {
  color: string;
  size: number;
  cx: number;
  cy: number;
  orbitX: number;
  orbitY: number;
  rotateSpeed: number;
  orbitSpeed: number;
  blur: number;
  opacity: number;
};

const ORBS: OrbConfig[] = [
  {
    color: COLORS.cyan,
    size: 780,
    cx: LAYOUT.width * 0.28,
    cy: LAYOUT.height * 0.32,
    orbitX: 140,
    orbitY: 90,
    rotateSpeed: 0.18,
    orbitSpeed: 0.011,
    blur: 72,
    opacity: 0.42,
  },
  {
    color: COLORS.pink,
    size: 700,
    cx: LAYOUT.width * 0.74,
    cy: LAYOUT.height * 0.58,
    orbitX: 120,
    orbitY: 110,
    rotateSpeed: -0.14,
    orbitSpeed: 0.009,
    blur: 80,
    opacity: 0.36,
  },
  {
    color: COLORS.cyan,
    size: 520,
    cx: LAYOUT.width * 0.58,
    cy: LAYOUT.height * 0.22,
    orbitX: 80,
    orbitY: 60,
    rotateSpeed: 0.22,
    orbitSpeed: 0.014,
    blur: 64,
    opacity: 0.22,
  },
];

const MeshOrb: React.FC<{orb: OrbConfig; frame: number}> = ({orb, frame}) => {
  const angle = frame * orb.orbitSpeed;
  const ox = Math.cos(angle) * orb.orbitX;
  const oy = Math.sin(angle * 0.85) * orb.orbitY;
  const rotate = frame * orb.rotateSpeed;

  return (
    <motion.div
      initial={false}
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: orb.size,
        height: orb.size,
        borderRadius: '50%',
        background: `radial-gradient(circle at 40% 35%, ${orb.color} 0%, transparent 68%)`,
        opacity: orb.opacity,
        filter: `blur(${orb.blur}px)`,
        willChange: 'transform',
        transform: `translate3d(${orb.cx - orb.size / 2 + ox}px, ${orb.cy - orb.size / 2 + oy}px, 0) rotate(${rotate}deg)`,
        pointerEvents: 'none',
      }}
    />
  );
};

const DustMote: React.FC<{particle: ParticleSeed; frame: number}> = ({
  particle,
  frame,
}) => {
  const cycle = particle.riseFrames;
  const local = (frame + particle.phase * cycle) % cycle;
  const progress = local / cycle;

  const y = interpolate(progress, [0, 1], [LAYOUT.height + 24, -48], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const xWobble = Math.sin(progress * Math.PI * 2 + particle.phase * 6) * particle.drift;
  const fade = interpolate(progress, [0, 0.12, 0.82, 1], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: particle.size,
        height: particle.size,
        borderRadius: '50%',
        background: COLORS.white,
        opacity: particle.opacity * fade,
        boxShadow: `0 0 ${particle.size * 3}px rgba(248, 250, 252, 0.35)`,
        willChange: 'transform',
        transform: `translate3d(${particle.x + xWobble}px, ${y}px, 0)`,
        pointerEvents: 'none',
      }}
    />
  );
};

/**
 * Full-bleed 1920×1080 ambient motion stage: dark mesh, slow cyan/pink orbs,
 * and dust motes. Frame-driven for deterministic Remotion seeks/renders.
 */
export const AmbientBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const meshRotate = interpolate(frame, [0, LAYOUT.fps * 40], [0, 360], {
    extrapolateRight: 'extend',
  });

  return (
    <AbsoluteFill
      style={{
        width: LAYOUT.width,
        height: LAYOUT.height,
        backgroundColor: COLORS.slate,
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {/* Base depth wash */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(ellipse 85% 65% at 50% 0%, rgba(30, 41, 59, 0.55), transparent 62%),
            linear-gradient(180deg, #0B1224 0%, ${COLORS.slate} 45%, #0A1328 100%)
          `,
        }}
      />

      {/* Slow-rotating gradient mesh */}
      <motion.div
        initial={false}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: LAYOUT.width * 1.45,
          height: LAYOUT.height * 1.45,
          marginLeft: -(LAYOUT.width * 1.45) / 2,
          marginTop: -(LAYOUT.height * 1.45) / 2,
          background: `
            conic-gradient(
              from 0deg at 50% 50%,
              rgba(6, 182, 212, 0.14) 0deg,
              rgba(15, 23, 42, 0) 70deg,
              rgba(236, 72, 153, 0.12) 140deg,
              rgba(15, 23, 42, 0) 210deg,
              rgba(6, 182, 212, 0.1) 280deg,
              rgba(15, 23, 42, 0) 360deg
            )
          `,
          willChange: 'transform',
          transform: `translate3d(0, 0, 0) rotate(${meshRotate}deg)`,
          opacity: 0.9,
          pointerEvents: 'none',
        }}
      />

      {ORBS.map((orb, i) => (
        <MeshOrb key={`orb-${i}`} orb={orb} frame={frame} />
      ))}

      {PARTICLES.map((particle) => (
        <DustMote key={particle.id} particle={particle} frame={frame} />
      ))}
    </AbsoluteFill>
  );
};
