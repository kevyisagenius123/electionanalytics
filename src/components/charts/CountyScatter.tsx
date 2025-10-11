import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export interface CountyScatterProps {
  title: string;
  points: Array<[number, number, number]>; // [gopPct, demPct, total]
  height?: number | string;
}

export default function CountyScatter({ title, points, height = 220 }: CountyScatterProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const instRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!instRef.current) instRef.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const chart = instRef.current;
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: title, left: 8, top: 6, textStyle: { color: '#e5e7eb', fontSize: 12, fontWeight: 600 } },
      grid: { left: 40, right: 20, top: 32, bottom: 28 },
      tooltip: { trigger: 'item', formatter: (p: any)=> `GOP ${p.value[0].toFixed(1)}% · Dem ${p.value[1].toFixed(1)}% · Total ${Math.round(p.value[2]).toLocaleString()}` },
      xAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: '#9ca3af', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#1f2937' } } },
      yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: '#9ca3af', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#1f2937' } } },
      series: [{ type: 'scatter', data: points, symbolSize: (v: any)=> Math.max(4, Math.sqrt(v[2]) / 50), itemStyle: { color: '#60a5fa' }, emphasis: { itemStyle: { color: '#93c5fd' } } }]
    });
    const onResize = () => { try { instRef.current?.resize(); } catch {} };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); };
  }, [title, points]);

  useEffect(() => () => { try { instRef.current?.dispose(); } catch {}; instRef.current = null; }, []);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
