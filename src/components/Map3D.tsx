'use client';

import { useState, lazy, Suspense } from 'react';
import type { ElectionYear, MapMode } from '../lib/types';

// Dynamically import the ECharts wrapper
const EChartsWrapper = lazy(() => import('./EChartsWrapper'));

interface Map3DProps {
  year?: ElectionYear;
  mode?: MapMode;
  showCongressionalDistricts?: boolean;
  className?: string;
}

export default function Map3D({ 
  year = 2024, 
  mode = 'results', 
  showCongressionalDistricts = false,
  className = "h-full" 
}: Map3DProps) {
  const [currentYear, setCurrentYear] = useState<ElectionYear>(year);
  const [currentMode, setCurrentMode] = useState<MapMode>(mode);
  const [showCD, setShowCD] = useState(showCongressionalDistricts);

  return (
    <div className="w-full h-full">
      <Suspense 
        fallback={
          <div className="h-full flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-gray-600">Loading 3D Election Map...</p>
            </div>
          </div>
        }
      >
        <EChartsWrapper 
          year={year}
          mode={mode}
          showCongressionalDistricts={showCongressionalDistricts}
          className={className}
        />
      </Suspense>
    </div>
  );
}
