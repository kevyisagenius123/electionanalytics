import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export interface ReportingLineProps {
  title: string;
  series: Array<[number, number]>; // [timestamp, pct]
  height?: number | string;
}

export default function ReportingLine({ title, series, height = 180 }: ReportingLineProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const instRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!instRef.current) instRef.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const chart = instRef.current;
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: title, left: 8, top: 6, textStyle: { color: '#e5e7eb', fontSize: 12, fontWeight: 600 } },
      grid: { left: 50, right: 20, top: 32, bottom: 28 },
      xAxis: { type: 'time', axisLabel: { color: '#9ca3af' } },
      yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: '#9ca3af' }, splitLine: { lineStyle: { color: '#1f2937' } } },
      series: [{ type: 'line', data: series, smooth: true, showSymbol: false, lineStyle: { color: '#10b981' } }]
    });
    const onResize = () => { try { instRef.current?.resize(); } catch {} };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); };
  }, [title, series]);

  useEffect(() => () => { try { instRef.current?.dispose(); } catch {}; instRef.current = null; }, []);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
