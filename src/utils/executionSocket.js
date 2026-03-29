/**
 * executionSocket.js — WebSocket client singleton
 *
 * Connects to the Conductor backend at ws://localhost:3001.
 * Exported as a singleton so every component shares one connection.
 *
 * Usage:
 *   executionSocket.connect()
 *   const unsub = executionSocket.onProgress(msg => ...)
 *   unsub()   // unsubscribe
 *   executionSocket.disconnect()
 */

const WS_URL = 'ws://localhost:3001';

/* ── Listener registry ──────────────────────────────────────────────────── */
const _listeners = {
  progress:      [],   // task_progress messages
  complete:      [],   // task_complete messages
  allDone:       [],   // execution_complete message
  error:         [],   // connection errors
  statusChange:  [],   // 'connecting' | 'connected' | 'disconnected'
  mathSegment:   [],   // math_segment_complete messages
  imageStrip:    [],   // image_strip_complete messages
  imageComplete: [],   // image_complete messages
};

function _emit(channel, payload) {
  for (const cb of _listeners[channel]) cb(payload);
}

function _subscribe(channel, cb) {
  _listeners[channel].push(cb);
  /* Returns an unsubscribe function */
  return () => {
    const idx = _listeners[channel].indexOf(cb);
    if (idx !== -1) _listeners[channel].splice(idx, 1);
  };
}

/* ── Internal state ─────────────────────────────────────────────────────── */
let _ws               = null;
let _status           = 'disconnected';
let _reconnectPending = false;

function _setStatus(s) {
  _status = s;
  _emit('statusChange', s);
}

/* ── Core connect / disconnect ──────────────────────────────────────────── */

function connect() {
  if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) return;

  _setStatus('connecting');
  _reconnectPending = false;

  try {
    _ws = new WebSocket(WS_URL);
  } catch (err) {
    _setStatus('disconnected');
    _emit('error', err);
    return;
  }

  _ws.onopen = () => {
    _setStatus('connected');
    console.log('[Socket] Connected to', WS_URL);
  };

  _ws.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    switch (msg.type) {
      case 'task_progress':         _emit('progress',       msg); break;
      case 'task_complete':         _emit('complete',       msg); break;
      case 'execution_complete':    _emit('allDone',        msg); break;
      case 'math_segment_complete': _emit('mathSegment',    msg); break;
      case 'image_strip_complete':  _emit('imageStrip',     msg); break;
      case 'image_complete':        _emit('imageComplete',  msg); break;
      default: break;
    }
  };

  _ws.onerror = (err) => {
    console.warn('[Socket] Error:', err);
    _emit('error', err);
  };

  _ws.onclose = () => {
    _setStatus('disconnected');
    console.log('[Socket] Connection closed');

    /* Auto-reconnect once after 1.5 s */
    if (!_reconnectPending) {
      _reconnectPending = true;
      setTimeout(() => {
        _reconnectPending = false;
        connect();
      }, 1500);
    }
  };
}

function disconnect() {
  _reconnectPending = true;   // prevent auto-reconnect
  if (_ws) {
    _ws.close();
    _ws = null;
  }
  _setStatus('disconnected');
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/** Returns current status: 'connecting' | 'connected' | 'disconnected' */
function getStatus() { return _status; }

/** Register callback for task_progress events. Returns unsubscribe fn. */
function onProgress(cb)     { return _subscribe('progress',     cb); }

/** Register callback for task_complete events. Returns unsubscribe fn. */
function onComplete(cb)     { return _subscribe('complete',     cb); }

/** Register callback for execution_complete event. Returns unsubscribe fn. */
function onAllDone(cb)      { return _subscribe('allDone',      cb); }

/** Register callback for connection errors. Returns unsubscribe fn. */
function onError(cb)        { return _subscribe('error',        cb); }

/** Register callback for status changes. Returns unsubscribe fn. */
function onStatusChange(cb) { return _subscribe('statusChange', cb); }

/** Register callback for math_segment_complete events. Returns unsubscribe fn. */
function onMathSegment(cb)    { return _subscribe('mathSegment',   cb); }

/** Register callback for image_strip_complete events. Returns unsubscribe fn. */
function onImageStrip(cb)     { return _subscribe('imageStrip',    cb); }

/** Register callback for image_complete events. Returns unsubscribe fn. */
function onImageComplete(cb)  { return _subscribe('imageComplete', cb); }

const executionSocket = {
  connect,
  disconnect,
  getStatus,
  onProgress,
  onComplete,
  onAllDone,
  onError,
  onStatusChange,
  onMathSegment,
  onImageStrip,
  onImageComplete,
};

export default executionSocket;
