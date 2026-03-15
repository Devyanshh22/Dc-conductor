import { Fragment } from 'react';

const STEPS = [
  { id: 1,   label: 'Task Queue' },
  { id: 2,   label: 'Machine Fleet' },
  { id: 2.5, label: 'Decompose', display: '⚙' },
  { id: 3,   label: 'Matching' },
  { id: 4,   label: 'Execution' },
  { id: 5,   label: 'Output' },
];

export default function StepIndicator({ currentStep }) {
  return (
    <nav
      className="flex items-center w-full max-w-xl mx-auto"
      aria-label="Workflow progress"
    >
      {STEPS.map((step, i) => {
        const done   = step.id < currentStep;
        const active = step.id === currentStep;
        const locked = step.id > currentStep;

        return (
          <Fragment key={step.id}>
            {/* Connector line */}
            {i > 0 && (
              <div
                className={`flex-1 h-px transition-colors duration-500 ${
                  done ? 'bg-indigo-500' : 'bg-slate-700'
                }`}
              />
            )}

            {/* Step node */}
            <div
              className={`flex flex-col items-center gap-1 ${locked ? 'opacity-35' : ''}`}
            >
              <div
                className={`
                  w-7 h-7 rounded-full flex items-center justify-center
                  text-xs font-bold transition-all duration-300
                  ${active
                    ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900 shadow-lg shadow-indigo-900/50'
                    : done
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-800 border border-slate-700 text-slate-500'
                  }
                `}
              >
                {done ? '✓' : (step.display ?? step.id)}
              </div>

              <span
                className={`
                  text-[10px] font-medium whitespace-nowrap hidden sm:block
                  ${active ? 'text-indigo-300' : done ? 'text-slate-400' : 'text-slate-600'}
                `}
              >
                {step.label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </nav>
  );
}
