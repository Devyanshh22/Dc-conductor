import { useState, useRef } from 'react';
import { evaluate } from 'mathjs';

/* ── Style constants ──────────────────────────────────────────────────────── */
const inputBase =
  'w-full rounded-lg bg-slate-700/60 border border-slate-600 px-3 py-2 text-slate-100 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition disabled:opacity-40 disabled:cursor-not-allowed';
const labelBase = 'block text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1';
const errorText  = 'text-red-400 text-xs mt-1';

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function computeTotalPoints(xFrom, xTo, xStep) {
  if (xStep <= 0 || xTo <= xFrom) return 0;
  return Math.floor((xTo - xFrom) / xStep) + 1;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/* ── Component ────────────────────────────────────────────────────────────── */
/**
 * TaskForm — two-mode task input form.
 *
 * Props:
 *   onAddTask {function} - receives a task object
 *   locked    {boolean}  - disables the form while scheduling is in progress
 */
export default function TaskForm({ onAddTask, locked }) {
  /* ── Task type toggle ──────────────────────────────────────────────── */
  const [taskType, setTaskType] = useState('math'); // 'math' | 'image'

  /* ── Math fields ───────────────────────────────────────────────────── */
  const [mathName,  setMathName]  = useState('');
  const [equation,  setEquation]  = useState('');
  const [xFrom,     setXFrom]     = useState(-50);
  const [xTo,       setXTo]       = useState(50);
  const [xStep,     setXStep]     = useState(1);
  const [mathError, setMathError] = useState('');

  /* ── Image fields ──────────────────────────────────────────────────── */
  const [imageName,    setImageName]    = useState('');
  const [imageFile,    setImageFile]    = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageData,    setImageData]    = useState(null);
  const [imgDims,      setImgDims]      = useState(null);
  const [imageError,   setImageError]   = useState('');

  /* ── Auto-numbering ────────────────────────────────────────────────── */
  const mathNum  = useRef(1);
  const imageNum = useRef(1);
  const fileRef  = useRef(null);

  /* ── Derived ───────────────────────────────────────────────────────── */
  const totalPoints = computeTotalPoints(Number(xFrom), Number(xTo), Number(xStep));

  /* ── Handlers ──────────────────────────────────────────────────────── */
  function switchType(type) {
    if (type === taskType) return;
    setTaskType(type);
    setMathError('');
    setImageError('');
    // Clear math
    setEquation('');
    setXFrom(-50); setXTo(50); setXStep(1);
    // Clear image
    setImageFile(null); setImagePreview(null); setImageData(null); setImgDims(null);
    setMathName(''); setImageName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setImageError('Only JPG and PNG files are supported.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('File size must be under 5 MB.');
      return;
    }
    setImageError('');
    setImageFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target.result;
      setImageData(dataUrl);
      setImagePreview(dataUrl);

      const img = new Image();
      img.onload = () => setImgDims({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit(e) {
    e.preventDefault();

    /* ── Math submit ────────────────────────────────────────────────── */
    if (taskType === 'math') {
      if (!equation.trim()) {
        setMathError('Equation is required.');
        return;
      }
      if (Number(xTo) <= Number(xFrom)) {
        setMathError('X From must be less than X To.');
        return;
      }
      if (Number(xStep) <= 0) {
        setMathError('X Step must be greater than 0.');
        return;
      }
      try {
        evaluate(equation.trim(), { x: Number(xFrom) });
      } catch {
        setMathError('Invalid equation — check the syntax (use * for multiply, ^ for power).');
        return;
      }

      setMathError('');
      const pts = computeTotalPoints(Number(xFrom), Number(xTo), Number(xStep));
      const cpu = Math.min(16, Math.max(1, Math.ceil(pts / 1000)));

      onAddTask({
        id:           crypto.randomUUID(),
        name:         mathName.trim() || `Math Task #${mathNum.current}`,
        type:         'math',
        equation:     equation.trim(),
        xFrom:        Number(xFrom),
        xTo:          Number(xTo),
        xStep:        Number(xStep),
        totalPoints:  pts,
        estimatedCPU: cpu,
        estimatedRAM: 2,
        duration:     Math.max(2, Math.ceil(pts / 5000)),
      });

      mathNum.current++;
      setEquation('');
      setMathName('');

      /* ── Image submit ───────────────────────────────────────────────── */
    } else {
      if (!imageData || !imgDims) {
        setImageError('Please upload a JPG or PNG image.');
        return;
      }

      setImageError('');
      const ramMB = Math.max(1, Math.ceil(imgDims.width * imgDims.height * 3 / 1024 / 1024));

      onAddTask({
        id:           crypto.randomUUID(),
        name:         imageName.trim() || `Image Task #${imageNum.current}`,
        type:         'image',
        filename:     imageFile.name,
        width:        imgDims.width,
        height:       imgDims.height,
        fileSize:     imageFile.size,
        imageData:    imageData,
        estimatedCPU: 4,
        estimatedRAM: ramMB,
        duration:     Math.max(3, Math.ceil(imgDims.width * imgDims.height / 100_000)),
      });

      imageNum.current++;
      setImageFile(null); setImagePreview(null); setImageData(null); setImgDims(null);
      setImageName('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-800 rounded-2xl border border-slate-700 p-6 shadow-xl flex flex-col gap-5"
    >
      <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-indigo-400" />
        New Task
      </h2>

      {/* ── Type toggle ── */}
      <div className="grid grid-cols-2 gap-2">
        <TypeButton
          label="Math Equation"
          icon="∑"
          active={taskType === 'math'}
          color="blue"
          onClick={() => switchType('math')}
          disabled={locked}
        />
        <TypeButton
          label="Image Processing"
          icon="🖼"
          active={taskType === 'image'}
          color="purple"
          onClick={() => switchType('image')}
          disabled={locked}
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════
          MATH FIELDS
      ════════════════════════════════════════════════════════════════ */}
      {taskType === 'math' && (
        <>
          {/* Task name */}
          <div>
            <label className={labelBase}>Task Name</label>
            <input
              type="text"
              placeholder={`Math Task #${mathNum.current}`}
              className={inputBase}
              value={mathName}
              onChange={e => setMathName(e.target.value)}
              disabled={locked}
              maxLength={60}
            />
          </div>

          {/* Equation */}
          <div>
            <label className={labelBase}>Equation</label>
            <input
              type="text"
              placeholder="e.g. x^2 + 3*x - 5"
              className={`${inputBase} font-mono`}
              value={equation}
              onChange={e => { setEquation(e.target.value); setMathError(''); }}
              disabled={locked}
              spellCheck={false}
              autoComplete="off"
            />
            <p className="text-[10px] text-slate-600 mt-1">
              Supports: +  −  *  /  ^  sin()  cos()  sqrt()  abs()  log()
            </p>
          </div>

          {/* X Range */}
          <div>
            <label className={labelBase}>X Range</label>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-slate-500 mb-0.5 block">From</label>
                <input
                  type="number"
                  className={inputBase}
                  value={xFrom}
                  onChange={e => setXFrom(e.target.value)}
                  disabled={locked}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-0.5 block">To</label>
                <input
                  type="number"
                  className={inputBase}
                  value={xTo}
                  onChange={e => setXTo(e.target.value)}
                  disabled={locked}
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 mb-0.5 block">Step</label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  className={inputBase}
                  value={xStep}
                  onChange={e => setXStep(e.target.value)}
                  disabled={locked}
                />
              </div>
            </div>
          </div>

          {/* Preview line */}
          {totalPoints > 0 && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-950/30 border border-blue-700/30 px-3 py-2">
              <span className="text-blue-400 text-xs flex-shrink-0 mt-0.5">≈</span>
              <p className="text-[11px] text-blue-300 leading-snug">
                This will compute Y values across{' '}
                <strong>{xFrom}</strong> to <strong>{xTo}</strong>{' '}
                in steps of <strong>{xStep}</strong> ={' '}
                <strong>~{totalPoints.toLocaleString()} total points</strong>
              </p>
            </div>
          )}

          {mathError && <p className={errorText}>{mathError}</p>}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          IMAGE FIELDS
      ════════════════════════════════════════════════════════════════ */}
      {taskType === 'image' && (
        <>
          {/* Task name */}
          <div>
            <label className={labelBase}>Task Name</label>
            <input
              type="text"
              placeholder={`Image Task #${imageNum.current}`}
              className={inputBase}
              value={imageName}
              onChange={e => setImageName(e.target.value)}
              disabled={locked}
              maxLength={60}
            />
          </div>

          {/* File input */}
          <div>
            <label className={labelBase}>Image Upload</label>
            <label
              className={`
                flex flex-col items-center justify-center gap-2 w-full h-24 rounded-lg
                border-2 border-dashed border-slate-600 hover:border-purple-500/60
                bg-slate-700/30 hover:bg-purple-900/10
                cursor-pointer transition-all duration-150 text-slate-400 text-sm
                ${locked ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''}
              `}
            >
              <span className="text-2xl leading-none">🖼</span>
              <span className="text-xs">
                {imageFile ? imageFile.name : 'Click to upload JPG or PNG (max 5 MB)'}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".jpg,.jpeg,.png"
                className="hidden"
                onChange={handleImageUpload}
                disabled={locked}
              />
            </label>
          </div>

          {/* Preview */}
          {imagePreview && (
            <div className="space-y-2">
              <img
                src={imagePreview}
                alt="Upload preview"
                className="max-h-36 w-full object-contain rounded-lg border border-slate-600 bg-slate-900/40"
              />
              {imgDims && imageFile && (
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span>{imgDims.width} × {imgDims.height} px</span>
                  <span>·</span>
                  <span>{formatBytes(imageFile.size)}</span>
                </div>
              )}
            </div>
          )}

          {imageError && <p className={errorText}>{imageError}</p>}
        </>
      )}

      {/* ── Submit ── */}
      <button
        type="submit"
        disabled={locked}
        className="
          mt-1 w-full rounded-xl font-semibold py-2.5 text-sm transition-all duration-150
          bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white
          disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/30
          cursor-pointer
        "
      >
        + Add Task
      </button>
    </form>
  );
}

/* ── TypeButton ───────────────────────────────────────────────────────────── */
function TypeButton({ label, icon, active, color, onClick, disabled }) {
  const activeClass = color === 'blue'
    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/30'
    : 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/30';
  const inactiveClass = 'bg-slate-700/60 border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-200';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-semibold
        transition-all duration-150 cursor-pointer
        disabled:opacity-40 disabled:cursor-not-allowed
        ${active ? activeClass : inactiveClass}
      `}
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </button>
  );
}
