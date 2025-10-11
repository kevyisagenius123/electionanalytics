import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export interface TopBarChartProps {
  title: string;
  categories: string[];
  dem: number[];
  gop: number[];
  height?: number | string;
}

export default function TopBarChart({ title, categories, dem, gop, height = 180 }: TopBarChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const instRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!instRef.current) instRef.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const chart = instRef.current;
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: title, left: 8, top: 6, textStyle: { color: '#e5e7eb', fontSize: 12, fontWeight: 600 } },
      grid: { left: 60, right: 20, top: 32, bottom: 20 },
      tooltip: { trigger: 'axis' },
      legend: { data: ['Dem', 'GOP'], top: 6, right: 12, textStyle: { color: '#9ca3af', fontSize: 11 } },
      xAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#1f2937' } } },
      yAxis: { type: 'category', data: categories, axisLabel: { color: '#cbd5e1' } },
      series: [
        { name: 'Dem', type: 'bar', stack: 'total', data: dem, itemStyle: { color: '#42a5f5' } },
        { name: 'GOP', type: 'bar', stack: 'total', data: gop, itemStyle: { color: '#e53935' } },
      ]
    });
    const onResize = () => { try { instRef.current?.resize(); } catch {} };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); };
  }, [title, categories, dem, gop]);

  useEffect(() => () => { try { instRef.current?.dispose(); } catch {}; instRef.current = null; }, []);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
