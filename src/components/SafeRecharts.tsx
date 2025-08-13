import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface SafePieChartProps {
  data: Array<{ name: string; value: number; color: string }>;
  innerRadius?: number;
  outerRadius?: number;
  paddingAngle?: number;
  centerContent?: React.ReactNode;
  legend?: React.ReactNode;
  tooltipFormatter?: (value: any, name: string) => [any, string];
}

export const SafePieChart: React.FC<SafePieChartProps> = ({
  data,
  innerRadius = 35,
  outerRadius = 60,
  paddingAngle = 2,
  centerContent,
  legend,
  tooltipFormatter
}) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // Ensure we're on the client side before rendering Recharts
    setIsClient(true);
  }, []);

  // Don't render on server side or during initial hydration
  if (!isClient) {
    return (
      <div className="w-32 h-32 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  try {
    return (
      <div className="relative w-32 h-32">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={paddingAngle}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              formatter={tooltipFormatter || ((value, name) => [value, name])}
              contentStyle={{ 
                backgroundColor: '#1f2937', 
                border: 'none', 
                borderRadius: '8px',
                color: '#f9fafb'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {centerContent && (
          <div className="absolute inset-0 flex items-center justify-center">
            {centerContent}
          </div>
        )}
        {legend && (
          <div className="mt-4">
            {legend}
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error('Error rendering chart:', error);
    return (
      <div className="w-32 h-32 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-full">
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
          Chart Error
        </div>
      </div>
    );
  }
};
