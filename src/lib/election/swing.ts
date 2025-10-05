// Shared swing and styling utilities matching Iowa behavior

// Iowa-style palettes for margin bins (6 bins): 0-1, 1-5, 5-10, 10-20, 20-30, 30+
export const IOWA_GOP = ['#FFC4C4','#FFA0A0','#FF7070','#E03B2F','#B51400','#730900'];
export const IOWA_DEM = ['#B7C8FF','#8FAEFF','#5D90FF','#2D6BFF','#0047D6','#001E5C'];

export function clamp(v:number, lo:number, hi:number){ return Math.max(lo, Math.min(hi, v)); }

export function hexToRgba(h: string, a=235): [number,number,number,number] {
  try {
    const s=h.replace('#',''); const n=parseInt(s.length===3? s.split('').map(c=>c+c).join(''):s,16);
    return [(n>>16)&255, (n>>8)&255, n&255, a];
  } catch { return [100,116,139,a]; }
}

export function iowaMarginBinIndex(absMargin:number){
  const m = Math.abs(absMargin);
  return (m < 1) ? 0 : (m < 5) ? 1 : (m < 10) ? 2 : (m < 20) ? 3 : (m < 30) ? 4 : 5;
}

export function iowaMarginRgba(marginPct:number, alpha:number=235): [number,number,number,number] {
  if(!isFinite(marginPct)) return [100,116,139,alpha];
  const idx = iowaMarginBinIndex(Math.abs(marginPct));
  const base = marginPct >= 0 ? IOWA_GOP[idx] : IOWA_DEM[idx];
  return hexToRgba(base, alpha);
}

// Extrusion from margin (pp), Iowa-style: 1000 + (|m|/40) * 18000 (cap at 40pp)
export function extrusionFromMarginIOWA(marginPct:number): number {
  const mag = Math.min(40, Math.abs(marginPct));
  return 1000 + (mag/40)*18000;
}

// Turnout height from votes, Iowa-style normalization using p95 baseline
export function turnoutHeightFromVotesIOWA(totalVotes:number, turnoutFactor:number, p95:number): number {
  const tf = clamp(turnoutFactor, 0.5, 1.5);
  const scaledVotes = Math.max(0, totalVotes||0) * tf;
  const norm = Math.min(1.2, (p95>0? (scaledVotes / p95) : 0));
  return 1000 + norm * 18000;
}

// Compute D/R shares after applying additive swings (pp) to shares and renormalizing to keep D+R<=1
export function computeSharesAfterSwing(dShare0:number, gShare0:number, demSwingPP:number, gopSwingPP:number): { dShare:number; gShare:number } {
  let dShare = dShare0 + (demSwingPP/100);
  let gShare = gShare0 + (gopSwingPP/100);
  dShare = clamp(dShare, 0, 1);
  gShare = clamp(gShare, 0, 1);
  const sumDG = dShare + gShare;
  if (sumDG > 1) {
    const scale = 1 / sumDG;
    dShare *= scale; gShare *= scale;
  }
  return { dShare, gShare };
}

export function computeProjectedMargin(
  demVotes:number,
  gopVotes:number,
  totalVotes:number,
  demSwingPP:number,
  gopSwingPP:number,
  localDemPP:number=0,
  localGopPP:number=0
): { baseMargin:number; newMargin:number }{
  const T = Math.max(1, totalVotes||0);
  const d0 = (demVotes||0)/T;
  const g0 = (gopVotes||0)/T;
  const baseMargin = (g0 - d0) * 100;
  const { dShare, gShare } = computeSharesAfterSwing(d0, g0, demSwingPP + localDemPP, gopSwingPP + localGopPP);
  const newMargin = (gShare - dShare) * 100;
  return { baseMargin, newMargin };
}
