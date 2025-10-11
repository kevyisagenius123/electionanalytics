import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export interface BattlegroundBarsProps {
  title: string;
  categories: string[];
  values: number[]; // Dem win % values (0..100)
  height?: number | string;
}

export default function BattlegroundBars({ title, categories, values, height = 180 }: BattlegroundBarsProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const instRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!instRef.current) instRef.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const chart = instRef.current;
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: title, left: 8, top: 6, textStyle: { color: '#e5e7eb', fontSize: 12, fontWeight: 600 } },
      grid: { left: 40, right: 20, top: 32, bottom: 20 },
      xAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: '#9ca3af', formatter: '{value}%' }, splitLine: { lineStyle: { color: '#1f2937' } } },
      yAxis: { type: 'category', data: categories, axisLabel: { color: '#cbd5e1' } },
      series: [{ type: 'bar', data: values.map(v=> +v.toFixed(1)), itemStyle: { color: '#60a5fa' }, label: { show: true, position: 'right', formatter: '{c}%' } }]
    });
    const onResize = () => { try { instRef.current?.resize(); } catch {} };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); };
  }, [title, categories, values]);

  useEffect(() => () => { try { instRef.current?.dispose(); } catch {}; instRef.current = null; }, []);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
