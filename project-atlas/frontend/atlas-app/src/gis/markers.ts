import { MarkerShape, MarkerStylePreset } from '../types/gis';

export interface ShapeOption {
  id: MarkerShape;
  label: string;
  category: 'Pins & Needles' | '3D Pinballs' | 'Geometric Badges' | 'Beacons & Targets' | 'Symbols';
}

export const SHAPE_OPTIONS: ShapeOption[] = [
  // Pins & Needles
  { id: 'pin', label: 'Classic Pin', category: 'Pins & Needles' },
  { id: 'pin-drop', label: '3D Drop Pin', category: 'Pins & Needles' },
  { id: 'modern-pin', label: 'Modern Drop Pin', category: 'Pins & Needles' },
  { id: 'teardrop-ring', label: 'Teardrop Ring', category: 'Pins & Needles' },

  // 3D Pinballs
  { id: 'pinball', label: '3D Pinball Sphere', category: '3D Pinballs' },
  { id: 'center-pinball', label: 'Pulse Pinball', category: '3D Pinballs' },
  { id: 'pinball-glow', label: 'Neon Glow Pinball', category: '3D Pinballs' },

  // Geometric Badges
  { id: 'hexagon', label: 'Hexagon Badge', category: 'Geometric Badges' },
  { id: 'octagon', label: 'Octagon Gem', category: 'Geometric Badges' },
  { id: 'squircle-badge', label: 'Squircle Badge', category: 'Geometric Badges' },
  { id: 'pill-badge', label: 'Pill Badge', category: 'Geometric Badges' },
  { id: 'square', label: 'Square Badge', category: 'Geometric Badges' },
  { id: 'diamond', label: 'Diamond Rhombus', category: 'Geometric Badges' },
  { id: 'shield', label: 'Crest Shield', category: 'Geometric Badges' },
  { id: 'circle', label: 'Solid Disc', category: 'Geometric Badges' },

  // Beacons & Targets
  { id: 'crosshair', label: 'Survey Reticle', category: 'Beacons & Targets' },
  { id: 'beacon-ring', label: 'Radar Beacon', category: 'Beacons & Targets' },
  { id: 'circle-dot', label: 'Bullseye Ring', category: 'Beacons & Targets' },
  { id: 'dots', label: 'Minimalist Dot', category: 'Beacons & Targets' },
  { id: 'navigation', label: 'Compass Nav', category: 'Beacons & Targets' },

  // Symbols
  { id: 'star-four', label: 'Sparkle Star', category: 'Symbols' },
  { id: 'star', label: '5-Point Star', category: 'Symbols' },
  { id: 'flag', label: 'Site Flag', category: 'Symbols' },
  { id: 'heart', label: 'Amenity Heart', category: 'Symbols' },
];

export const ICON_SVGS: Record<string, string> = {
  pin: '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"></path><circle cx="12" cy="10" r="2.5"></circle>',
  'pin-drop': '<path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z"></path><circle cx="12" cy="9" r="2.5"></circle>',
  'modern-pin': '<path d="M12 2a6 6 0 0 0-6 6c0 4.5 6 13 6 13s6-8.5 6-13a6 6 0 0 0-6-6z"></path><circle cx="12" cy="8" r="2.5"></circle>',
  'teardrop-ring': '<path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z"></path><circle cx="12" cy="9" r="4.5" fill="none" stroke-width="1.8"></circle>',
  pinball: '<circle cx="12" cy="9" r="6.5"></circle><line x1="12" y1="15.5" x2="12" y2="22"></line><ellipse cx="12" cy="22" rx="3.5" ry="1"></ellipse>',
  'center-pinball': '<circle cx="12" cy="9" r="6.5"></circle><line x1="12" y1="15.5" x2="12" y2="22"></line><circle cx="12" cy="9" r="2"></circle><ellipse cx="12" cy="22" rx="4.5" ry="1.5"></ellipse>',
  'pinball-glow': '<circle cx="12" cy="9" r="7"></circle><line x1="12" y1="16" x2="12" y2="22"></line><circle cx="12" cy="9" r="3.5"></circle>',
  circle: '<circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3.5"></circle>',
  'circle-dot': '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="2"></circle>',
  dots: '<circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2.5" fill="#ffffff"></circle>',
  star: '<path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8-6.1-3.4-6.1 3.4 1.4-6.8L2.2 9.1l6.9-.8z"></path>',
  'star-four': '<path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5Z"></path>',
  diamond: '<path d="M12 2L21 12L12 22L3 12Z"></path><circle cx="12" cy="12" r="3"></circle>',
  square: '<rect x="4" y="4" width="16" height="16" rx="4"></rect><circle cx="12" cy="12" r="3"></circle>',
  'squircle-badge': '<rect x="3" y="3" width="18" height="18" rx="6"></rect><circle cx="12" cy="12" r="3.5"></circle>',
  'pill-badge': '<rect x="2" y="6" width="20" height="12" rx="6"></rect><circle cx="12" cy="12" r="3"></circle>',
  hexagon: '<polygon points="12 2 21 7 21 17 12 22 3 17 3 7"></polygon><circle cx="12" cy="12" r="3.5"></circle>',
  octagon: '<polygon points="7.8 2 16.2 2 22 7.8 22 16.2 16.2 22 7.8 22 2 16.2 2 7.8"></polygon><circle cx="12" cy="12" r="3.5"></circle>',
  crosshair: '<circle cx="12" cy="12" r="7.5"></circle><line x1="12" y1="1" x2="12" y2="5"></line><line x1="12" y1="19" x2="12" y2="23"></line><line x1="1" y1="12" x2="5" y2="12"></line><line x1="19" y1="12" x2="23" y2="12"></line>',
  'beacon-ring': '<circle cx="12" cy="12" r="9.5"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2.5"></circle>',
  flag: '<path d="M6 22V3"></path><path d="M6 4h11l-2 4 2 4H6"></path>',
  heart: '<path d="M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.4-7 10-7 10z"></path>',
  navigation: '<polygon points="12 2 19 21 12 17 5 21 12 2"></polygon>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
  'vicinity-logo': '<rect x="2" y="2" width="20" height="20" rx="5"></rect><circle cx="12" cy="12" r="6" stroke-dasharray="2 1"></circle><circle cx="12" cy="12" r="2"></circle>',
};

/**
 * Adjust color brightness by percentage (-1.0 to 1.0)
 */
export function adjustColorBrightness(hex: string, percent: number): string {
  let clean = (hex || '#1e40af').replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16) || 0;
  let r = (num >> 16) + Math.round(255 * percent);
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * percent);
  let b = (num & 0x0000ff) + Math.round(255 * percent);

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Draws a 3D Pinball with realistic ground drop shadow, needle, and specular highlight.
 */
export function draw3DPinball(
  ctx: CanvasRenderingContext2D,
  color: string,
  variant: 'standard' | 'center' | 'glow' = 'standard'
) {
  const isCenter = variant === 'center';
  const isGlow = variant === 'glow';

  // 1. Realistic ground contact drop shadow
  ctx.save();
  const shadowGrad = ctx.createRadialGradient(32, 57, 1, 32, 57, isCenter ? 16 : 13);
  shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
  shadowGrad.addColorStop(0.45, 'rgba(0, 0, 0, 0.45)');
  shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(32, 57, isCenter ? 16 : 13, isCenter ? 5 : 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // If center marker or glow, draw subtle pulse target ring at ground
  if (isCenter || isGlow) {
    ctx.strokeStyle = isGlow ? (color || '#38bdf8') : '#ffffff';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.ellipse(32, 57, 16, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // 2. Metallic needle stem (Pure chrome/steel gradient)
  ctx.save();
  const needleGrad = ctx.createLinearGradient(29, 36, 35, 36);
  needleGrad.addColorStop(0, '#18181b');
  needleGrad.addColorStop(0.35, '#ffffff');
  needleGrad.addColorStop(0.7, '#71717a');
  needleGrad.addColorStop(1, '#000000');

  ctx.fillStyle = needleGrad;
  ctx.beginPath();
  ctx.moveTo(30.5, 35);
  ctx.lineTo(33.5, 35);
  ctx.lineTo(32.5, 57);
  ctx.lineTo(31.5, 57);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.restore();

  // 3. 3D Ball Sphere
  const cx = 32;
  const cy = 23;
  const r = isCenter ? 16 : 14;

  const baseColor = isCenter && !color ? '#fbbf24' : (color || '#1e40af');
  const lightColor = adjustColorBrightness(baseColor, 0.45);
  const darkColor = adjustColorBrightness(baseColor, -0.45);
  const rimColor = adjustColorBrightness(baseColor, -0.7);

  // Outer glow aura for 'pinball-glow'
  if (isGlow) {
    ctx.save();
    const glowGrad = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 1.5);
    glowGrad.addColorStop(0, adjustColorBrightness(baseColor, 0.2) + 'aa');
    glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  // 3D Spherical gradient
  const sphereGrad = ctx.createRadialGradient(
    cx - r * 0.35,
    cy - r * 0.35,
    1,
    cx,
    cy,
    r
  );
  sphereGrad.addColorStop(0, '#ffffff');
  sphereGrad.addColorStop(0.2, lightColor);
  sphereGrad.addColorStop(0.65, baseColor);
  sphereGrad.addColorStop(0.9, darkColor);
  sphereGrad.addColorStop(1.0, rimColor);

  ctx.fillStyle = sphereGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 4. Outer rim outline in crisp silver/white
  ctx.save();
  ctx.strokeStyle = isCenter ? '#ffffff' : adjustColorBrightness(baseColor, 0.6);
  ctx.lineWidth = isCenter ? 2 : 1.25;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 5. Specular highlight glints for pure 3D glass/chrome sheen
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.38, cy - r * 0.38, r * 0.35, r * 0.2, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();

  // Secondary soft bounce glint at bottom-right
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(cx + r * 0.4, cy + r * 0.4, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws a 3D Sleek Drop Pin with needle tip and shadow
 */
export function draw3DDropPin(ctx: CanvasRenderingContext2D, color: string) {
  // Ground contact shadow
  ctx.save();
  const shadowGrad = ctx.createRadialGradient(32, 59, 1, 32, 59, 12);
  shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
  shadowGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
  shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(32, 59, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const baseColor = color || '#1e40af';
  const lightColor = adjustColorBrightness(baseColor, 0.3);
  const darkColor = adjustColorBrightness(baseColor, -0.3);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;

  const pinGrad = ctx.createLinearGradient(16, 8, 48, 58);
  pinGrad.addColorStop(0, lightColor);
  pinGrad.addColorStop(0.5, baseColor);
  pinGrad.addColorStop(1, darkColor);

  ctx.fillStyle = pinGrad;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(32, 22, 16, Math.PI * 0.82, Math.PI * 0.18, false);
  ctx.lineTo(32, 58);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Specular sheen
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.beginPath();
  ctx.ellipse(26, 17, 7, 3, -Math.PI / 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Center core
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(32, 22, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = baseColor;
  ctx.beginPath();
  ctx.arc(32, 22, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws Open Node's modern drop-pin with ground drop shadow, dark metal pin stalk, and vibrant round head
 */
export function drawModernPin(ctx: CanvasRenderingContext2D, color: string) {
  // 1. Realistic ground contact drop shadow
  ctx.save();
  const shadowGrad = ctx.createRadialGradient(32, 56, 1, 32, 56, 12);
  shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
  shadowGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.25)');
  shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(32, 56, 12, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Dark metallic pin stalk
  ctx.save();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(32, 24);
  ctx.lineTo(32, 54);
  ctx.stroke();
  ctx.restore();

  // 3. Vibrant circular head with outline and specular gloss
  const cx = 32;
  const cy = 20;
  const r = 14;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  // Outer border & fill
  ctx.fillStyle = color || '#003366';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();

  // Subtle inner gloss curve
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.ellipse(cx - 3, cy - 4, 5, 2.5, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws a clean circular dot marker with crisp white border and ground registration
 */
export function drawDotMarker(ctx: CanvasRenderingContext2D, color: string) {
  // Ground contact shadow
  ctx.save();
  const shadowGrad = ctx.createRadialGradient(32, 56, 1, 32, 56, 10);
  shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.4)');
  shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(32, 56, 10, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Outer dot circle
  const cx = 32;
  const cy = 40;
  const r = 13;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;

  ctx.fillStyle = color || '#003366';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // White inner core
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draws a marker icon procedurally on a 64x64 canvas
 */
export function renderIconCanvas(shape: string, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  ctx.clearRect(0, 0, 64, 64);
  const baseColor = color || '#1e40af';

  // Modern Drop-Pin (Open Node signature)
  if (shape === 'modern-pin') {
    drawModernPin(ctx, color);
    return c;
  }

  // Dots / Minimalist Dot (Open Node signature)
  if (shape === 'dots') {
    drawDotMarker(ctx, color);
    return c;
  }

  // 1. 3D Pinball Drop Variants
  if (shape === 'pinball') {
    draw3DPinball(ctx, baseColor, 'standard');
    return c;
  }
  if (shape === 'center-pinball') {
    draw3DPinball(ctx, baseColor, 'center');
    return c;
  }
  if (shape === 'pinball-glow') {
    draw3DPinball(ctx, baseColor, 'glow');
    return c;
  }

  // 2. 3D Drop Pin
  if (shape === 'pin-drop') {
    draw3DDropPin(ctx, baseColor);
    return c;
  }

  // Ground contact shadow for all pins / badges
  ctx.save();
  const shadowGrad = ctx.createRadialGradient(32, 58, 1, 32, 58, 11);
  shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
  shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(32, 58, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.fillStyle = baseColor;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();

  if (shape === 'pin') {
    ctx.arc(32, 24, 16, Math.PI * 0.8, Math.PI * 0.2, false);
    ctx.lineTo(32, 58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 24, 5, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'star') {
    // 5-Point Star
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 10 : 22;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = 32 + r * Math.cos(a);
      const py = 30 + r * Math.sin(a);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 30, 4.5, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'star-four') {
    // 4-Point Sparkle Star
    const points = [
      [32, 8], [37, 24], [53, 30], [37, 36],
      [32, 52], [27, 36], [11, 30], [27, 24]
    ];
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 30, 4, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'circle') {
    // Solid circular badge
    ctx.arc(32, 32, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 32, 7, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'circle-dot') {
    // Bullseye / target concentric circles
    ctx.arc(32, 32, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Middle ring
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.arc(32, 32, 13, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 32, 5, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'diamond') {
    // Faceted diamond / rhombus
    ctx.moveTo(32, 9);
    ctx.lineTo(53, 31);
    ctx.lineTo(32, 53);
    ctx.lineTo(11, 31);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 31, 5, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'square') {
    // Rounded square badge
    const x = 12, y = 11, w = 40, h = 40, rad = 8;
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 31, 5, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'flag') {
    ctx.moveTo(18, 56);
    ctx.lineTo(18, 10);
    ctx.lineTo(48, 22);
    ctx.lineTo(18, 34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return c;
  }

  if (shape === 'heart') {
    ctx.moveTo(32, 52);
    ctx.bezierCurveTo(6, 32, 14, 8, 32, 20);
    ctx.bezierCurveTo(50, 8, 58, 32, 32, 52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return c;
  }

  if (shape === 'navigation') {
    ctx.moveTo(32, 8);
    ctx.lineTo(51, 52);
    ctx.lineTo(32, 42);
    ctx.lineTo(13, 52);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    return c;
  }

  if (shape === 'shield') {
    ctx.moveTo(32, 10);
    ctx.lineTo(50, 16);
    ctx.lineTo(50, 32);
    ctx.quadraticCurveTo(50, 48, 32, 54);
    ctx.quadraticCurveTo(14, 48, 14, 32);
    ctx.lineTo(14, 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 28, 4.5, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'teardrop-ring') {
    ctx.arc(32, 22, 16, Math.PI * 0.8, Math.PI * 0.2, false);
    ctx.lineTo(32, 56);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 22, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.fillStyle = baseColor;
    ctx.arc(32, 22, 4.5, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'hexagon') {
    const cx = 32, cy = 32, r = 22;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 32, 5.5, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'octagon') {
    const cx = 32, cy = 32, r = 22;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 8;
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 32, 5.5, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'squircle-badge') {
    const x = 11, y = 11, w = 42, h = 42, rad = 14;
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 32, 6, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'pill-badge') {
    const x = 7, y = 18, w = 50, h = 28, rad = 14;
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 32, 5, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'crosshair') {
    ctx.arc(32, 32, 19, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.moveTo(32, 6); ctx.lineTo(32, 14);
    ctx.moveTo(32, 50); ctx.lineTo(32, 58);
    ctx.moveTo(6, 32); ctx.lineTo(14, 32);
    ctx.moveTo(50, 32); ctx.lineTo(58, 32);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 32, 4.5, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'beacon-ring') {
    ctx.arc(32, 32, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.arc(32, 32, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(32, 32, 7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.arc(32, 32, 3.5, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  if (shape === 'vicinity-logo') {
    const x = 9, y = 9, w = 46, h = 46, rad = 13;
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.fillStyle = baseColor;
    ctx.arc(32, 32, 7, 0, Math.PI * 2);
    ctx.fill();
    return c;
  }

  // Fallback pin
  ctx.arc(32, 24, 16, Math.PI * 0.8, Math.PI * 0.2, false);
  ctx.lineTo(32, 58);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = '#ffffff';
  ctx.arc(32, 24, 5, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

export interface VicinityPresetLogo {
  id: string;
  name: string;
  category: 'Cafe & Dining' | 'Retail & Malls' | 'Banking' | 'Fuel & Transit' | 'Convenience';
  color: string;
  bg: string;
  border: string;
  monogram: string;
  logoUrl?: string;
}

export const VICINITY_PRESET_LOGOS: VicinityPresetLogo[] = [
  // Cafes & Dining
  {
    id: 'kopi-saigon',
    name: 'Kopi Saigon',
    category: 'Cafe & Dining',
    color: '#783819',
    bg: '#ffffff',
    border: '#783819',
    monogram: 'KS',
    logoUrl: '/logos/logo.svg',
  },
  {
    id: 'starbucks',
    name: 'Starbucks',
    category: 'Cafe & Dining',
    color: '#006241',
    bg: '#ffffff',
    border: '#006241',
    monogram: 'SBX',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/d/d3/Starbucks_Corporation_Logo_2011.svg/120px-Starbucks_Corporation_Logo_2011.svg.png',
  },
  {
    id: 'mcdonalds',
    name: "McDonald's",
    category: 'Cafe & Dining',
    color: '#da291c',
    bg: '#ffffff',
    border: '#ffbc0d',
    monogram: 'MCD',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/McDonald%27s_Golden_Arches.svg/120px-McDonald%27s_Golden_Arches.svg.png',
  },
  {
    id: 'jollibee',
    name: 'Jollibee',
    category: 'Cafe & Dining',
    color: '#e31837',
    bg: '#ffffff',
    border: '#e31837',
    monogram: 'JB',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/84/Jollibee_2011_logo.svg/120px-Jollibee_2011_logo.svg.png',
  },
  {
    id: 'kfc',
    name: 'KFC',
    category: 'Cafe & Dining',
    color: '#a3080c',
    bg: '#ffffff',
    border: '#a3080c',
    monogram: 'KFC',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/b/bf/KFC_logo.svg/120px-KFC_logo.svg.png',
  },
  {
    id: 'tim-hortons',
    name: 'Tim Hortons',
    category: 'Cafe & Dining',
    color: '#c8102e',
    bg: '#ffffff',
    border: '#c8102e',
    monogram: 'TIM',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Tim_Hortons_logo.svg/120px-Tim_Hortons_logo.svg.png',
  },

  // Retail & Malls
  {
    id: 'sm-supermalls',
    name: 'SM Supermalls',
    category: 'Retail & Malls',
    color: '#002f6c',
    bg: '#ffffff',
    border: '#002f6c',
    monogram: 'SM',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/SM_Supermalls_Logo_2022.svg/120px-SM_Supermalls_Logo_2022.svg.png',
  },
  {
    id: 'ayala-malls',
    name: 'Ayala Malls',
    category: 'Retail & Malls',
    color: '#d91b5b',
    bg: '#ffffff',
    border: '#d91b5b',
    monogram: 'AYL',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Ayala_Malls_logo.svg/120px-Ayala_Malls_logo.svg.png',
  },
  {
    id: 'robinsons',
    name: 'Robinsons Malls',
    category: 'Retail & Malls',
    color: '#008542',
    bg: '#ffffff',
    border: '#008542',
    monogram: 'RLC',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Robinsons_Malls_logo.svg/120px-Robinsons_Malls_logo.svg.png',
  },
  {
    id: 'uniqlo',
    name: 'UNIQLO',
    category: 'Retail & Malls',
    color: '#ff0000',
    bg: '#ffffff',
    border: '#ff0000',
    monogram: 'UQ',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/UNIQLO_logo.svg/120px-UNIQLO_logo.svg.png',
  },
  {
    id: 'ikea',
    name: 'IKEA',
    category: 'Retail & Malls',
    color: '#0058a3',
    bg: '#ffcc00',
    border: '#0058a3',
    monogram: 'IKEA',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Ikea_logo.svg/120px-Ikea_logo.svg.png',
  },
  {
    id: 'snr',
    name: 'S&R Membership',
    category: 'Retail & Malls',
    color: '#00205b',
    bg: '#ffffff',
    border: '#ba0c2f',
    monogram: 'S&R',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/0/05/S%26R_Membership_Shopping_logo.svg/120px-S%26R_Membership_Shopping_logo.svg.png',
  },

  // Banking
  {
    id: 'bdo',
    name: 'BDO Unibank',
    category: 'Banking',
    color: '#003366',
    bg: '#ffffff',
    border: '#fdb913',
    monogram: 'BDO',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/BDO_Unibank_%28logo%29.svg/120px-BDO_Unibank_%28logo%29.svg.png',
  },
  {
    id: 'bpi',
    name: 'BPI Bank',
    category: 'Banking',
    color: '#b11116',
    bg: '#ffffff',
    border: '#b11116',
    monogram: 'BPI',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Bank_of_the_Philippine_Islands_logo.svg/120px-Bank_of_the_Philippine_Islands_logo.svg.png',
  },
  {
    id: 'metrobank',
    name: 'Metrobank',
    category: 'Banking',
    color: '#002d72',
    bg: '#ffffff',
    border: '#002d72',
    monogram: 'MB',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Metrobank_logo.svg/120px-Metrobank_logo.svg.png',
  },
  {
    id: 'unionbank',
    name: 'UnionBank',
    category: 'Banking',
    color: '#ff6600',
    bg: '#ffffff',
    border: '#ff6600',
    monogram: 'UBP',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/UnionBank_of_the_Philippines_Logo.svg/120px-UnionBank_of_the_Philippines_Logo.svg.png',
  },

  // Fuel & Transit
  {
    id: 'shell',
    name: 'Shell',
    category: 'Fuel & Transit',
    color: '#dd1d21',
    bg: '#ffffff',
    border: '#fecd00',
    monogram: 'SHL',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e8/Shell_logo.svg/120px-Shell_logo.svg.png',
  },
  {
    id: 'petron',
    name: 'Petron',
    category: 'Fuel & Transit',
    color: '#0033a0',
    bg: '#ffffff',
    border: '#da291c',
    monogram: 'PET',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Petron_Corporation_logo.svg/120px-Petron_Corporation_logo.svg.png',
  },

  // Convenience & Health
  {
    id: 'seven-eleven',
    name: '7-Eleven',
    category: 'Convenience',
    color: '#008060',
    bg: '#ffffff',
    border: '#f58220',
    monogram: '7-11',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/7-eleven_logo.svg/120px-7-eleven_logo.svg.png',
  },
  {
    id: 'mercury-drug',
    name: 'Mercury Drug',
    category: 'Convenience',
    color: '#da291c',
    bg: '#ffffff',
    border: '#da291c',
    monogram: 'MDC',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Mercury_Drug_logo.svg/120px-Mercury_Drug_logo.svg.png',
  },
  {
    id: 'watsons',
    name: 'Watsons',
    category: 'Convenience',
    color: '#00a3ad',
    bg: '#ffffff',
    border: '#00a3ad',
    monogram: 'WAT',
    logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Watsons_logo.svg/120px-Watsons_logo.svg.png',
  },
];

export interface UniformLogoOptions {
  logoUrl?: string;
  monogramText?: string;
  frame?: 'circle' | 'squircle' | 'hexagon' | 'pin-badge';
  bg?: string;
  border?: string;
  borderWidth?: number;
  scale?: number; // 0.45 - 0.85
  color?: string;
}

/**
 * Procedurally draws a perfectly symmetrical, uniform brand logo badge with ground shadow and specular gloss
 */
export async function renderUniformLogoMarker(
  options: UniformLogoOptions,
  map?: any
): Promise<{ key: string; dataUrl: string }> {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 96;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const {
    logoUrl,
    monogramText,
    frame = 'circle',
    bg = '#ffffff',
    border = '#ffffff',
    borderWidth = 3,
    scale = 0.72,
    color = '#1e40af',
  } = options;

  ctx.clearRect(0, 0, 96, 96);

  const isPin = frame === 'pin-badge';
  const cx = 48;
  const cy = isPin ? 38 : 46;
  const radius = isPin ? 30 : 36;

  // 1. Realistic ground contact shadow
  ctx.save();
  const shadowGrad = ctx.createRadialGradient(48, 88, 1, 48, 88, isPin ? 18 : 22);
  shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
  shadowGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)');
  shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(48, 88, isPin ? 18 : 22, isPin ? 5 : 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 2. Metallic needle stem if pin badge
  if (isPin) {
    ctx.save();
    const stemGrad = ctx.createLinearGradient(44, 60, 52, 60);
    stemGrad.addColorStop(0, '#18181b');
    stemGrad.addColorStop(0.35, '#ffffff');
    stemGrad.addColorStop(0.7, '#71717a');
    stemGrad.addColorStop(1, '#09090b');
    ctx.fillStyle = stemGrad;
    ctx.beginPath();
    ctx.moveTo(46, 56);
    ctx.lineTo(50, 56);
    ctx.lineTo(49, 87);
    ctx.lineTo(47, 87);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 3. Frame Geometry with elevation shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = borderWidth;
  ctx.beginPath();

  if (frame === 'circle' || frame === 'pin-badge') {
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  } else if (frame === 'squircle') {
    const x = cx - radius;
    const y = cy - radius;
    const w = radius * 2;
    const h = radius * 2;
    const rad = 16;
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  } else if (frame === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      const px = cx + radius * Math.cos(a);
      const py = cy + radius * Math.sin(a);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 4. Logo Content: Contain image or centered monogram
  const maxBoxSize = radius * 2 * Math.min(Math.max(scale, 0.45), 0.88);

  const drawMonogram = (text: string) => {
    ctx.save();
    ctx.fillStyle = color || '#0c1322';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cleanText = text.slice(0, 4).toUpperCase();
    const fontSize = cleanText.length > 2 ? radius * 0.75 : radius * 0.9;
    ctx.font = `900 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(cleanText, cx, cy + 1);
    ctx.restore();
  };

  if (logoUrl) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Failed to load image'));
        img.src = logoUrl;
      });

      const aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);
      let drawW = maxBoxSize;
      let drawH = maxBoxSize;
      if (aspect > 1) {
        drawH = maxBoxSize / aspect;
      } else {
        drawW = maxBoxSize * aspect;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
      ctx.restore();
    } catch (_) {
      if (monogramText) {
        drawMonogram(monogramText);
      }
    }
  } else if (monogramText) {
    drawMonogram(monogramText);
  } else {
    // Clean blank badge: soft subtle inner guide ring
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Specular highlight for 3D glassy finish
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx - radius * 0.35, cy - radius * 0.4, radius * 0.4, radius * 0.18, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.fill();
  ctx.restore();

  const dataUrl = c.toDataURL('image/png');
  const key = `vicinity_logo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  if (map) {
    const imgData = ctx.getImageData(0, 0, 96, 96);
    try {
      if (map.hasImage(key)) map.removeImage(key);
      map.addImage(key, imgData, { pixelRatio: 2 });
    } catch (e) {
      console.warn('Failed to add uniform logo image to map:', e);
    }
  }

  return { key, dataUrl };
}

/**
 * Registers a dynamic sprite into MapLibre GL instance if not already cached
 */
export function getIconKey(shape: string, color: string, map: any): string {
  const cleanColor = (color || '#1e40af').replace('#', '');
  const key = `ico_${shape || 'pin'}_${cleanColor}`;
  if (map && !map.hasImage(key)) {
    const cv = renderIconCanvas(shape, color);
    const ctx = cv.getContext('2d');
    if (ctx) {
      const imgData = ctx.getImageData(0, 0, 64, 64);
      try {
        if (map.hasImage(key)) map.removeImage(key);
        map.addImage(key, imgData, { pixelRatio: 2 });
      } catch (e) {
        console.warn('Failed to add image to map:', e);
      }
    }
  }
  return key;
}

/**
 * Loads a user uploaded custom image and registers it as a custom pin
 */
export async function registerCustomImageMarker(dataUrl: string, map: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const ctx = c.getContext('2d');
      if (!ctx) return reject('Canvas context missing');
      ctx.drawImage(img, 0, 0, 64, 64);
      const key = `custom_marker_${Date.now()}`;
      const imgData = ctx.getImageData(0, 0, 64, 64);
      try {
        if (map.hasImage(key)) map.removeImage(key);
        map.addImage(key, imgData, { pixelRatio: 2 });
        resolve(key);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
