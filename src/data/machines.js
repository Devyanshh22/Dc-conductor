/**
 * Static machine fleet presets for Phase 2.
 * availCpu / availRam start equal to total for Idle nodes; 0 for Offline.
 * These will be mutated in later phases as tasks are assigned.
 *
 * id and name both use the "Node-X" format to match the backend worker registry.
 */
export const MACHINES = [
  {
    id: 'Node-Alpha',
    name: 'Node-Alpha',
    type: 'High Performance',
    cpu: 16,
    ram: 64,
    status: 'Idle',
    uptime: '14h 22m',
  },
  {
    id: 'Node-Beta',
    name: 'Node-Beta',
    type: 'General Purpose',
    cpu: 8,
    ram: 32,
    status: 'Idle',
    uptime: '9h 05m',
  },
  {
    id: 'Node-Gamma',
    name: 'Node-Gamma',
    type: 'General Purpose',
    cpu: 8,
    ram: 16,
    status: 'Idle',
    uptime: '3h 47m',
  },
  {
    id: 'Node-Delta',
    name: 'Node-Delta',
    type: 'Low Power',
    cpu: 4,
    ram: 16,
    status: 'Idle',
    uptime: '21h 13m',
  },
  {
    id: 'Node-Epsilon',
    name: 'Node-Epsilon',
    type: 'Minimal',
    cpu: 2,
    ram: 8,
    status: 'Offline',
    uptime: '0h 01m',
  },
];
