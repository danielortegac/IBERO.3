import React from 'react';
import Icon from './Icon';

const CAMPUS_URL = 'https://qlase.goatify.app/';

const Campus: React.FC = () => {
  const openCampus = () => {
    window.open(CAMPUS_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-full flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl overflow-hidden rounded-[2rem] border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface shadow-2xl">
        <div className="relative p-6 sm:p-8 lg:p-10">
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-brand-primary/10 via-transparent to-brand-secondary/10" />
          <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-primary/20 bg-brand-primary/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-brand-primary mb-6">
                <Icon name="book" className="w-4 h-4" />
                Campus conectado
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-light-text-primary dark:text-white mb-5">
                Campus
              </h2>
              <p className="text-base sm:text-lg text-light-text-secondary dark:text-dark-text-secondary leading-relaxed max-w-2xl mb-8">
                Accede a tus cursos, clases, certificados y plataforma académica desde QLASE. Goatify mantiene sus herramientas de productividad, IA, proyectos y operación; la formación vive en el Campus.
              </p>
              <button
                type="button"
                onClick={openCampus}
                className="inline-flex items-center justify-center gap-3 rounded-2xl bg-brand-primary px-6 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg hover:scale-[1.02] hover:shadow-xl transition-all"
              >
                Entrar al Campus
                <Icon name="arrowRight" className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-[1.75rem] border border-light-border dark:border-dark-border bg-white/70 dark:bg-black/20 p-5 sm:p-6 backdrop-blur">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                  <Icon name="globe" className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-light-text-primary dark:text-white">QLASE</h3>
                  <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary">App académica externa</p>
                </div>
              </div>
              <div className="space-y-3 text-sm text-light-text-secondary dark:text-dark-text-secondary">
                <div className="flex items-start gap-3"><Icon name="check" className="w-4 h-4 mt-0.5 text-brand-primary" /><span>Cursos, clases y certificados fuera de Goatify.</span></div>
                <div className="flex items-start gap-3"><Icon name="check" className="w-4 h-4 mt-0.5 text-brand-primary" /><span>Sin duplicar alumnos, docentes ni roles académicos.</span></div>
                <div className="flex items-start gap-3"><Icon name="check" className="w-4 h-4 mt-0.5 text-brand-primary" /><span>Goatify queda limpio como suite de productividad e IA.</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Campus;
