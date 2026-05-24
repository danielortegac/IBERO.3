
import React from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  PieChart, 
  Pie, 
  Cell, 
  LineChart, 
  Line 
} from 'recharts';
import { motion } from 'framer-motion';
import { 
  exportToCSV, 
  exportToExcel, 
  exportComponentAsImage, 
  exportComponentAsPDF 
} from '../utils/exportUtils';

import Icon from './Icon';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

interface ChatChartProps {
  type: 'bar' | 'pie' | 'line';
  title: string;
  data: any[];
  analysis?: string;
}

export const ChatChart: React.FC<ChatChartProps> = ({ type, title, data, analysis }) => {
  const renderChart = () => {
    switch (type) {
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              fill="#8884d8"
              paddingAngle={5}
              dataKey="value"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '8px', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
          </PieChart>
        );
      case 'line':
        return (
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="name" stroke="#999" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#999" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '8px', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Legend />
            <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={3} dot={{ r: 6 }} activeDot={{ r: 8 }} />
          </LineChart>
        );
      case 'bar':
      default:
        return (
          <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="name" stroke="#999" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#999" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '8px', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Legend />
            <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
          </BarChart>
        );
    }
  };

  const chartId = `chart-${title.replace(/\s+/g, '-')}`;

  const [isExporting, setIsExporting] = React.useState(false);

  const onExport = async (format: 'csv' | 'excel' | 'pdf' | 'image') => {
    const filename = `${title.replace(/\s+/g, '_')}_${new Date().getTime()}`;
    
    if (format === 'csv' || format === 'excel') {
      if (format === 'csv') exportToCSV(data, filename);
      else await exportToExcel(data, filename);
      return;
    }

    setIsExporting(true);
    // Pequeño delay para dejar que React oculte los botones antes de la captura
    setTimeout(async () => {
        try {
            if (format === 'pdf') {
                await exportComponentAsPDF(chartId, filename, title);
            } else {
                await exportComponentAsImage(chartId, filename);
            }
        } finally {
            setIsExporting(false);
        }
    }, 150);
  };

  return (
    <motion.div 
      id={chartId}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full bg-white dark:bg-neutral-900/50 backdrop-blur-xl border border-neutral-200 dark:border-neutral-800 rounded-3xl p-6 my-4 shadow-2xl relative group/chart"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-black text-neutral-800 dark:text-white uppercase tracking-widest">{title}</h3>
        <div className={`flex flex-wrap gap-2 justify-end transition-opacity duration-200 ${isExporting ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <button 
            onClick={() => onExport('csv')}
            title="Exportar CSV"
            className="p-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg text-[8px] font-black uppercase text-neutral-500 hover:text-brand-primary transition-all flex items-center gap-1 border border-neutral-200 dark:border-neutral-700 shadow-sm"
          >
            <Icon name="file" className="w-2.5 h-2.5" />
            CSV
          </button>
          <button 
            onClick={() => onExport('excel')}
            title="Exportar Excel"
            className="p-1.5 bg-green-500/10 hover:bg-green-500/20 rounded-lg text-[8px] font-black uppercase text-green-600 dark:text-green-400 transition-all flex items-center gap-1 border border-green-500/20 shadow-sm"
          >
            <Icon name="table" className="w-2.5 h-2.5" />
            XLSX
          </button>
          <button 
            onClick={() => onExport('pdf')}
            title="Exportar PDF"
            className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-[8px] font-black uppercase text-red-600 dark:text-red-400 transition-all flex items-center gap-1 border border-red-500/20 shadow-sm"
          >
            <Icon name="file-text" className="w-2.5 h-2.5" />
            PDF
          </button>
          <button 
            onClick={() => onExport('image')}
            title="Exportar Imagen"
            className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg text-[8px] font-black uppercase text-blue-600 dark:text-blue-400 transition-all flex items-center gap-1 border border-blue-500/20 shadow-sm"
          >
            <Icon name="image" className="w-2.5 h-2.5" />
            IMG
          </button>
        </div>
      </div>
      
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>

      {analysis && (
        <div className="mt-6 p-4 bg-blue-500/5 dark:bg-blue-500/10 rounded-2xl border border-blue-500/20">
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed italic">
            <span className="font-bold text-blue-500 not-italic uppercase mr-1">Shivo Insight:</span>
            {analysis}
          </p>
        </div>
      )}
    </motion.div>
  );
};
