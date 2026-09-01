import React from 'react';
import type {MascotCharacterProps} from '../types';

const GyanuBeak: React.FC<{state: MascotCharacterProps['mouth']}> = ({state}) => {
  if (state === 'closed') {
    return (
      <>
        <path
          d="M188 220 Q200 246 212 220 Q200 232 188 220 Z"
          fill="#F59E0B"
          stroke="#B45309"
          strokeWidth={2.5}
        />
        <path
          d="M176 246 Q200 262 224 246"
          stroke="#B45309"
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
        />
      </>
    );
  }

  if (state === 'mid') {
    return (
      <>
        <path
          d="M186 218 Q200 214 214 218 Q210 238 200 246 Q190 238 186 218 Z"
          fill="#B45309"
        />
        <path
          d="M188 220 Q200 217 212 220 Q209 233 200 239 Q191 233 188 220 Z"
          fill="#F59E0B"
          stroke="#B45309"
          strokeWidth={2}
        />
      </>
    );
  }

  return (
    <>
      <path
        d="M178 216 Q200 210 222 216 Q220 250 200 260 Q180 250 178 216 Z"
        fill="#B45309"
      />
      <path
        d="M182 219 Q200 214 218 219 Q216 244 200 252 Q184 244 182 219 Z"
        fill="#F59E0B"
        stroke="#B45309"
        strokeWidth={2}
      />
      <ellipse cx={200} cy={240} rx={9} ry={6} fill="#EA9A2E" opacity={0.6} />
    </>
  );
};

const TalkingWingGesture: React.FC = () => (
  <>
    <path
      d="M112 262 C 78 272 56 300 62 336 C 66 358 88 372 112 366 C 132 361 146 344 150 322 C 152 302 146 282 132 268 C 126 262 118 260 112 262 Z"
      fill="url(#gyanuWingGrad)"
      stroke="#8A4708"
      strokeWidth={3}
    />
    <path
      d="M140 330 Q158 328 168 316"
      stroke="#8A4708"
      strokeWidth={6}
      fill="none"
      strokeLinecap="round"
    />
    <circle cx={172} cy={312} r={9} fill="url(#gyanuWingGrad)" stroke="#8A4708" strokeWidth={2.5} />
    <path
      d="M84 300 q10 10 8 26 M78 330 q12 8 12 26"
      stroke="#8A4708"
      strokeWidth={2.5}
      fill="none"
      strokeLinecap="round"
      opacity={0.7}
    />
  </>
);

export const GyanuMascot: React.FC<MascotCharacterProps> = ({pose, mouth}) => {
  const isTalkingPose = pose === 'talking';
  const isHappyPose = pose === 'happy';

  return (
    <svg viewBox="0 0 400 480" width="100%" height="100%" aria-hidden>
      <defs>
        <radialGradient id="gyanuBodyGrad" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#F3B655" />
          <stop offset="100%" stopColor="#D97706" />
        </radialGradient>
        <radialGradient id="gyanuFaceGrad" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#FFFCF2" />
          <stop offset="100%" stopColor="#FEF3C7" />
        </radialGradient>
        <linearGradient id="gyanuWingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C2670A" />
          <stop offset="100%" stopColor="#B45F09" />
        </linearGradient>
      </defs>

      {isHappyPose ? (
        <g fill="#06B6D4">
          <path d="M60 90 L66 104 L80 110 L66 116 L60 130 L54 116 L40 110 L54 104 Z" />
          <path d="M340 70 L344 80 L354 84 L344 88 L340 98 L336 88 L326 84 L336 80 Z" />
        </g>
      ) : null}

      <ellipse cx={163} cy={440} rx={22} ry={10} fill="#F59E0B" />
      <ellipse cx={237} cy={440} rx={22} ry={10} fill="#F59E0B" />
      <path
        d="M148 440 q-6 8 -12 6 M163 442 q0 9 -1 9 M178 440 q6 8 12 6"
        stroke="#B45309"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M222 440 q-6 8 -12 6 M237 442 q0 9 -1 9 M252 440 q6 8 12 6"
        stroke="#B45309"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />

      <ellipse cx={200} cy={330} rx={118} ry={112} fill="url(#gyanuBodyGrad)" stroke="#B45309" strokeWidth={4} />
      <ellipse cx={200} cy={352} rx={72} ry={80} fill="#FEF3C7" />
      <path d="M170 300 q30 14 60 0" stroke="#FDE9A8" strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.8} />
      <path d="M165 330 q35 16 70 0" stroke="#FDE9A8" strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.8} />
      <path d="M165 362 q35 16 70 0" stroke="#FDE9A8" strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.8} />
      <path d="M172 392 q28 13 56 0" stroke="#FDE9A8" strokeWidth={4} fill="none" strokeLinecap="round" opacity={0.8} />

      {isTalkingPose ? (
        <TalkingWingGesture />
      ) : (
        <path
          d="M92 268 C64 300 58 360 78 410 C92 428 112 424 118 404 C128 366 122 316 128 280 C120 262 102 254 92 268 Z"
          fill="url(#gyanuWingGrad)"
          stroke="#8A4708"
          strokeWidth={3}
        />
      )}

      <path
        d="M308 268 C336 300 342 360 322 410 C308 428 288 424 282 404 C272 366 278 316 272 280 C280 262 298 254 308 268 Z"
        fill="url(#gyanuWingGrad)"
        stroke="#8A4708"
        strokeWidth={3}
      />
      <path d="M88 320 q14 4 20 20 M84 355 q16 4 22 24" stroke="#8A4708" strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={0.7} />
      <path d="M312 320 q-14 4 -20 20 M316 355 q-16 4 -22 24" stroke="#8A4708" strokeWidth={2.5} fill="none" strokeLinecap="round" opacity={0.7} />

      <path
        d="M138 258 Q200 300 262 258 L262 278 Q200 322 138 278 Z"
        fill="#06B6D4"
        stroke="#0891B2"
        strokeWidth={3}
      />
      <circle cx={200} cy={295} r={7} fill="#FEF3C7" stroke="#0891B2" strokeWidth={2} />

      <path
        d="M200 88 C 130 88 92 150 100 210 C 106 252 130 268 150 276 C 168 282 186 250 200 250 C 214 250 232 282 250 276 C 270 268 294 252 300 210 C 308 150 270 88 200 88 Z"
        fill="url(#gyanuBodyGrad)"
        stroke="#B45309"
        strokeWidth={4}
      />
      <path
        d="M200 108 C 148 108 118 156 124 202 C 128 236 148 248 163 253 C 178 258 190 232 200 232 C 210 232 222 258 237 253 C 252 248 272 236 276 202 C 282 156 252 108 200 108 Z"
        fill="url(#gyanuFaceGrad)"
      />

      {isHappyPose ? (
        <>
          <path d="M132 192 Q164 160 196 192" stroke="#2B1808" strokeWidth={7} fill="none" strokeLinecap="round" />
          <path d="M204 192 Q236 160 268 192" stroke="#2B1808" strokeWidth={7} fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx={164} cy={isTalkingPose ? 184 : 188} r={isTalkingPose ? 42 : 40} fill="#FFFFFF" stroke="#F3D9A0" strokeWidth={2} />
          <circle cx={236} cy={isTalkingPose ? 184 : 188} r={isTalkingPose ? 42 : 40} fill="#FFFFFF" stroke="#F3D9A0" strokeWidth={2} />
          <circle cx={164} cy={isTalkingPose ? 186 : 192} r={isTalkingPose ? 25 : 24} fill="#7C4A1E" />
          <circle cx={236} cy={isTalkingPose ? 186 : 192} r={isTalkingPose ? 25 : 24} fill="#7C4A1E" />
          <circle cx={164} cy={isTalkingPose ? 186 : 192} r={isTalkingPose ? 12.5 : 12} fill="#2B1808" />
          <circle cx={236} cy={isTalkingPose ? 186 : 192} r={isTalkingPose ? 12.5 : 12} fill="#2B1808" />
          <circle cx={isTalkingPose ? 156 : 157} cy={isTalkingPose ? 175 : 182} r={isTalkingPose ? 7 : 6} fill="#FFFFFF" />
          <circle cx={isTalkingPose ? 228 : 229} cy={isTalkingPose ? 175 : 182} r={isTalkingPose ? 7 : 6} fill="#FFFFFF" />
        </>
      )}

      <g fill="none" stroke="#F59E0B" strokeWidth={6}>
        <circle cx={164} cy={isTalkingPose ? 184 : 188} r={46} />
        <circle cx={236} cy={isTalkingPose ? 184 : 188} r={46} />
      </g>
      <path
        d={isTalkingPose ? 'M210 182 Q200 174 190 182' : 'M210 186 Q200 178 190 186'}
        stroke="#F59E0B"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={isTalkingPose ? 'M118 182 Q104 178 96 186' : 'M118 186 Q104 182 96 190'}
        stroke="#F59E0B"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={isTalkingPose ? 'M282 182 Q296 178 304 186' : 'M282 186 Q296 182 304 190'}
        stroke="#F59E0B"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
      />

      <path
        d={isTalkingPose ? 'M130 138 Q150 122 178 136' : 'M132 148 Q150 136 176 146'}
        stroke="#B45309"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={isTalkingPose ? 'M270 138 Q250 122 222 136' : 'M268 148 Q250 136 224 146'}
        stroke="#B45309"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
      />

      <GyanuBeak state={mouth} />

      <ellipse cx={isTalkingPose ? 138 : 140} cy={isTalkingPose ? 218 : 222} rx={12} ry={8} fill="#FDBA74" opacity={0.5} />
      <ellipse cx={isTalkingPose ? 262 : 260} cy={isTalkingPose ? 218 : 222} rx={12} ry={8} fill="#FDBA74" opacity={0.5} />
    </svg>
  );
};
