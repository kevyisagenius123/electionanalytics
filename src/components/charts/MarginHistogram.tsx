import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export interface MarginHistogramProps {
  title: string;
  labels: string[];
  values: number[];
  height?: number | string;
}

export default function MarginHistogram({ title, labels, values, height = 150 }: MarginHistogramProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const instRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!instRef.current) instRef.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const chart = instRef.current;
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: title, left: 8, top: 6, textStyle: { color: '#e5e7eb', fontSize: 12, fontWeight: 600 } },
      grid: { left: 40, right: 10, top: 32, bottom: 20 },
      xAxis: { type: 'category', data: labels, axisLabel: { color: '#9ca3af', interval: 1 } },
      yAxis: { type: 'value', axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#1f2937' } } },
      series: [{ type: 'bar', data: values, itemStyle: { color: '#64748b' } }]
    });
    const onResize = () => { try { instRef.current?.resize(); } catch {} };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); };
  }, [title, labels, values]);

  useEffect(() => () => { try { instRef.current?.dispose(); } catch {}; instRef.current = null; }, []);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
