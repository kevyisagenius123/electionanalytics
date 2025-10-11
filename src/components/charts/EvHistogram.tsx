import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export interface EvHistogramProps {
  title: string;
  histogram: number[]; // index = EV
  mean?: number;
  p50?: number;
  p95?: number;
  height?: number | string;
}

export default function EvHistogram({ title, histogram, mean, p50, p95, height = 200 }: EvHistogramProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const instRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!instRef.current) instRef.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const chart = instRef.current;
    const x: number[] = Array.from({ length: histogram.length }, (_, i) => i);
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: title, left: 8, top: 6, textStyle: { color: '#e5e7eb', fontSize: 12, fontWeight: 600 } },
      grid: { left: 40, right: 20, top: 32, bottom: 28 },
      tooltip: { trigger: 'axis', formatter: (p: any)=> {
        const item = Array.isArray(p) ? p[0] : p;
        const ev = item?.axisValue ?? 0; const cnt = item?.data ?? 0; const iters = histogram.reduce((a,b)=>a+b,0) || 1;
        const pct = (cnt/iters*100).toFixed(2);
        return `${ev} EV<br/>${cnt} draws (${pct}%)`;
      } },
      xAxis: { type: 'category', data: x, axisLabel: { color: '#9ca3af', interval: 40 }, boundaryGap: false },
      yAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#1f2937' } } },
      series: [{ type: 'line', data: histogram, smooth: true, areaStyle: { color: 'rgba(66,165,245,0.15)' }, lineStyle: { color: '#60a5fa' } }],
      markLine: mean!=null || p50!=null || p95!=null ? { symbol: 'none', lineStyle: { color: '#f59e0b', type: 'dashed' }, data: [
        ...(mean!=null ? [{ xAxis: Math.round(mean), label: { formatter: `Mean ${Math.round(mean)}` } }] : []),
        ...(p50!=null ? [{ xAxis: Math.round(p50), label: { formatter: `P50 ${Math.round(p50)}` } }] : []),
        ...(p95!=null ? [{ xAxis: Math.round(p95), label: { formatter: `P95 ${Math.round(p95)}` } }] : []),
      ]} : undefined
    });
    const onResize = () => { try { instRef.current?.resize(); } catch {} };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); };
  }, [title, histogram, mean, p50, p95]);

  useEffect(() => () => { try { instRef.current?.dispose(); } catch {}; instRef.current = null; }, []);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
