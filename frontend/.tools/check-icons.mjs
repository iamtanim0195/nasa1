// Temporary verification helper — confirms every curated icon name exists in
// the installed lucide-react version before the app is built.
import * as Lucide from 'lucide-react';

const NAMES = [
  'Activity',
  'AlertTriangle',
  'Anchor',
  'ArrowDownRight',
  'ArrowUpRight',
  'BarChart2',
  'BarChart3',
  'Building2',
  'Calendar',
  'Camera',
  'ChartColumnBig',
  'CheckCircle2',
  'ChevronDown',
  'ChevronRight',
  'ChevronUp',
  'Clock',
  'Columns2',
  'Crosshair',
  'Download',
  'Droplets',
  'FileUp',
  'Filter',
  'Gauge',
  'Globe2',
  'Info',
  'Layers',
  'LineChart',
  'Loader2',
  'Map',
  'MapPin',
  'Maximize2',
  'Menu',
  'Minimize2',
  'Moon',
  'Mountain',
  'MoveHorizontal',
  'PanelLeftClose',
  'PanelLeftOpen',
  'Pause',
  'PieChart',
  'Play',
  'Radar',
  'Radio',
  'RefreshCw',
  'Route',
  'Satellite',
  'ScanLine',
  'Search',
  'SearchX',
  'ShieldCheck',
  'SlidersHorizontal',
  'Sprout',
  'Sun',
  'Trash2',
  'Trees',
  'TrendingUp',
  'Upload',
  'Waves',
  'Wheat',
  'X',
  'XCircle',
  'Zap',
];

const missing = NAMES.filter((name) => !(name in Lucide));
console.log('total checked:', NAMES.length);
console.log('missing:', missing.length ? missing.join(', ') : 'none');

const version = await import('lucide-react/package.json', { with: { type: 'json' } })
  .then((mod) => mod.default.version)
  .catch(() => 'unknown');
console.log('lucide-react version:', version);
