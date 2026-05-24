import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'strict',
  fontFamily: 'Inter, sans-serif',
});

interface MermaidChartProps {
  chart: string;
}

const MermaidChart: React.FC<MermaidChartProps> = ({ chart }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const chartId = useRef(`mermaid-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const renderChart = async () => {
      if (!chartRef.current || !chart) return;
      
      try {
        setError(null);
        // Validar sintaxis antes de renderizar
        const isValid = await mermaid.parse(chart);
        if (isValid) {
          const { svg: renderedSvg } = await mermaid.render(chartId.current, chart);
          setSvg(renderedSvg);
        } else {
          throw new Error('Sintaxis Mermaid inválida');
        }
      } catch (err) {
        console.error('Error rendering Mermaid:', err);
        setError('No se pudo renderizar esta gráfica. Código Mermaid inválido.');
      }
    };

    renderChart();
  }, [chart]);

  if (error) {
    return (
      <div className="my-4 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-2xl">
        <p className="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-widest mb-2">{error}</p>
        <pre className="text-[10px] bg-black/5 dark:bg-white/5 p-3 rounded-xl overflow-x-auto font-mono text-neutral-600 dark:text-neutral-400 max-h-40">
          {chart}
        </pre>
      </div>
    );
  }

  return (
    <div className="my-6 flex justify-center w-full overflow-x-auto bg-white dark:bg-neutral-900/50 p-4 sm:p-8 rounded-3xl border border-neutral-100 dark:border-neutral-800 shadow-sm animate-fade-in group/mermaid relative">
        <div className="absolute top-4 left-4 flex items-center gap-2">
            <div className="p-1.5 bg-brand-primary/10 rounded-lg">
                <Icon name="chart" className="w-3 h-3 text-brand-primary"/>
            </div>
            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-neutral-400">Visualización Inteligente</span>
        </div>
        <div 
          ref={chartRef} 
          className="mermaid-chart flex justify-center w-full max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }} 
        />
        {!svg && !error && (
            <div className="flex items-center gap-2 py-10">
                <div className="w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Generando Gráfica...</span>
            </div>
        )}
    </div>
  );
};

// Mock Icon component if not available, but user has one in components/Icon
import Icon from './Icon';

export default MermaidChart;
