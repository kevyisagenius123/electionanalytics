import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

export interface VoteSharePieProps {
  title: string;
  dem: number;
  gop: number;
  height?: number | string;
}

export default function VoteSharePie({ title, dem, gop, height = 180 }: VoteSharePieProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const instRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (!instRef.current) instRef.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const chart = instRef.current;
    chart.setOption({
      backgroundColor: 'transparent',
      title: { text: title, left: 8, top: 6, textStyle: { color: '#e5e7eb', fontSize: 12, fontWeight: 600 } },
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie', radius: ['35%', '65%'], center: ['50%', '55%'],
        label: { color: '#cbd5e1', formatter: '{b}: {d}%' },
        data: [ { name: 'Dem', value: dem }, { name: 'GOP', value: gop } ],
        itemStyle: { color: (p: any)=> p.name==='Dem' ? '#42a5f5' : '#e53935' }
      }]
    });
    const onResize = () => { try { instRef.current?.resize(); } catch {} };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); };
  }, [title, dem, gop]);

  useEffect(() => () => { try { instRef.current?.dispose(); } catch {}; instRef.current = null; }, []);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
