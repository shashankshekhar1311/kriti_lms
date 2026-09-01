import React from 'react';
import type {MascotCharacterProps} from '../types';

const VoltMouth: React.FC<{state: MascotCharacterProps['mouth']}> = ({state}) => {
  if (state === 'closed') {
    return (
      <path
        d="M186 222 Q200 230 214 222"
        stroke="#6B3410"
        strokeWidth={3}
        fill="none"
        strokeLinecap="round"
      />
    );
  }

  if (state === 'mid') {
    return (
      <>
        <ellipse cx={200} cy={228} rx={14} ry={10} fill="#7A3B14" />
        <ellipse cx={200} cy={226} rx={10} ry={6} fill="#F0A0A0" />
      </>
    );
  }

  return (
    <>
      <path
        d="M180 218 Q200 252 220 218 Q200 238 180 218 Z"
        fill="#7A3B14"
        stroke="#6B3410"
        strokeWidth={2.5}
      />
      <path
        d="M186 222 Q200 242 214 222 Q200 234 186 222 Z"
        fill="#F0A0A0"
      />
    </>
  );
};

export const VoltMascot: React.FC<MascotCharacterProps> = ({mouth}) => {
  return (
    <svg viewBox="0 0 400 480" width="100%" height="100%" aria-hidden>
      <defs>
        <radialGradient id="voltFur" cx="45%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#E8964A" />
          <stop offset="60%" stopColor="#C2661A" />
          <stop offset="100%" stopColor="#8B4513" />
        </radialGradient>
        <radialGradient id="voltBelly" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#FDF6E3" />
          <stop offset="100%" stopColor="#F0DFC0" />
        </radialGradient>
        <linearGradient id="voltLens" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#BEF0FA" />
          <stop offset="100%" stopColor="#0891B2" />
        </linearGradient>
        <linearGradient id="voltTail" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8B4513" />
          <stop offset="55%" stopColor="#C2661A" />
          <stop offset="100%" stopColor="#E8964A" />
        </linearGradient>
      </defs>

      <ellipse cx={168} cy={452} rx={24} ry={11} fill="#8B4513" />
      <ellipse cx={232} cy={452} rx={24} ry={11} fill="#8B4513" />

      <path
        d="M296 316 C352 300 372 224 344 158 C332 132 306 118 288 128 C312 150 320 196 300 232 C286 258 262 274 250 296 C238 316 254 338 278 336 C284 336 290 328 296 316 Z"
        fill="url(#voltTail)"
        stroke="#6B3410"
        strokeWidth={4}
      />
      <path
        d="M296 200 C310 176 314 150 306 132"
        fill="none"
        stroke="#06B6D4"
        strokeWidth={7}
        strokeLinecap="round"
        opacity={0.85}
      />

      <ellipse cx={200} cy={336} rx={100} ry={108} fill="url(#voltFur)" stroke="#6B3410" strokeWidth={4} />
      <ellipse cx={200} cy={352} rx={62} ry={70} fill="url(#voltBelly)" />

      <polygon
        points="200,282 219,294 219,318 200,330 181,318 181,294"
        fill="#06B6D4"
        stroke="#F59E0B"
        strokeWidth={4}
      />
      <circle cx={200} cy={306} r={7} fill="#FDF6E3" opacity={0.85} />

      <path
        d="M108 320 C92 344 90 372 100 392 C106 404 122 402 126 388 C118 368 120 344 130 326 Z"
        fill="url(#voltFur)"
        stroke="#6B3410"
        strokeWidth={3}
      />
      <path
        d="M292 320 C308 344 310 372 300 392 C294 404 278 402 274 388 C282 368 280 344 270 326 Z"
        fill="url(#voltFur)"
        stroke="#6B3410"
        strokeWidth={3}
      />

      <rect x={90} y={384} width={34} height={22} rx={6} fill="#4B5563" stroke="#374151" strokeWidth={2} />
      <circle cx={107} cy={395} r={4} fill="#FDE047" />

      <circle cx={200} cy={178} r={92} fill="url(#voltFur)" stroke="#6B3410" strokeWidth={4} />
      <ellipse cx={200} cy={214} rx={46} ry={34} fill="url(#voltBelly)" />

      <path
        d="M146 108 C132 84 140 60 160 56 C176 54 186 70 182 90 C176 100 158 106 146 108 Z"
        fill="url(#voltFur)"
        stroke="#6B3410"
        strokeWidth={3}
      />
      <path d="M156 92 C150 78 154 66 164 64 C172 64 176 74 172 84 Z" fill="#F0DFC0" />
      <path
        d="M254 108 C268 84 260 60 240 56 C224 54 214 70 218 90 C224 100 242 106 254 108 Z"
        fill="url(#voltFur)"
        stroke="#6B3410"
        strokeWidth={3}
      />
      <path d="M244 92 C250 78 246 66 236 64 C228 64 224 74 228 84 Z" fill="#F0DFC0" />

      <rect x={118} y={156} width={164} height={16} rx={8} fill="#374151" />
      <circle cx={160} cy={168} r={38} fill="#4B5563" />
      <circle cx={160} cy={168} r={30} fill="url(#voltLens)" />
      <circle cx={240} cy={168} r={38} fill="#4B5563" />
      <circle cx={240} cy={168} r={30} fill="url(#voltLens)" />
      <circle cx={150} cy={158} r={7} fill="#FFFFFF" opacity={0.7} />
      <circle cx={230} cy={158} r={7} fill="#FFFFFF" opacity={0.7} />

      <ellipse cx={200} cy={216} rx={26} ry={18} fill="#F0DFC0" />
      <ellipse cx={200} cy={204} rx={8} ry={6} fill="#3F2A16" />
      <VoltMouth state={mouth} />

      <path
        d="M150 214 Q124 210 106 216"
        stroke="#6B3410"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        opacity={0.6}
      />
      <path
        d="M150 224 Q124 226 108 234"
        stroke="#6B3410"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        opacity={0.6}
      />
      <path
        d="M250 214 Q276 210 294 216"
        stroke="#6B3410"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        opacity={0.6}
      />
      <path
        d="M250 224 Q276 226 292 234"
        stroke="#6B3410"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        opacity={0.6}
      />
    </svg>
  );
};
