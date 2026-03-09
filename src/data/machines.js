/**
 * Static machine fleet presets for Phase 2.
 * availCpu / availRam start equal to total for Idle nodes; 0 for Offline.
 * These will be mutated in later phases as tasks are assigned.
 */
export const MACHINES = [
  {
    id: 'alpha',
    name: 'Node-Alpha',
    type: 'High Performance',
    cpu: 16,
    ram: 64,
    status: 'Idle',
    uptime: '14h 22m',
  },
  {
    id: 'beta',
    name: 'Node-Beta',
    type: 'General Purpose',
    cpu: 8,
    ram: 32,
    status: 'Idle',
    uptime: '9h 05m',
  },
  {
    id: 'gamma',
    name: 'Node-Gamma',
    type: 'General Purpose',
    cpu: 8,
    ram: 16,
    status: 'Idle',
    uptime: '3h 47m',
  },
  {
    id: 'delta',
    name: 'Node-Delta',
    type: 'Low Power',
    cpu: 4,
    ram: 16,
    status: 'Idle',
    uptime: '21h 13m',
  },
  {
    id: 'epsilon',
    name: 'Node-Epsilon',
    type: 'Minimal',
    cpu: 2,
    ram: 8,
    status: 'Idle',
    uptime: '0h 01m',
  },
];
