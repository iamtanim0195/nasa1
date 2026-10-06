import {
  Activity,
  AlertTriangle,
  Anchor,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  BarChart3,
  Building2,
  Calendar,
  Camera,
  ChartColumnBig,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Columns2,
  Crosshair,
  Download,
  Droplets,
  FileUp,
  Filter,
  Gauge,
  Globe2,
  Info,
  Layers,
  LineChart,
  Loader2,
  Map,
  MapPin,
  Maximize2,
  Menu,
  Minimize2,
  Moon,
  Mountain,
  MoveHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  PieChart,
  Play,
  Radar,
  Radio,
  RefreshCw,
  Route,
  Satellite,
  ScanLine,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sprout,
  Sun,
  Trash2,
  Trees,
  TrendingUp,
  Upload,
  Waves,
  Wheat,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Curated icon registry.
 *
 * Constants store icon names as strings (they come from a catalogue that the
 * backend will eventually drive), so they must be resolved dynamically. We keep
 * an explicit map instead of `import * as Icons` because a namespace import
 * defeats tree-shaking and would ship ~1000 unused icons.
 */
export const ICONS = {
  Activity,
  AlertTriangle,
  Anchor,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  BarChart3,
  Building2,
  Calendar,
  Camera,
  ChartColumnBig,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Columns2,
  Crosshair,
  Download,
  Droplets,
  FileUp,
  Filter,
  Gauge,
  Globe2,
  Info,
  Layers,
  LineChart,
  Loader2,
  Map,
  MapPin,
  Maximize2,
  Menu,
  Minimize2,
  Moon,
  Mountain,
  MoveHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  PieChart,
  Play,
  Radar,
  Radio,
  RefreshCw,
  Route,
  Satellite,
  ScanLine,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sprout,
  Sun,
  Trash2,
  Trees,
  TrendingUp,
  Upload,
  Waves,
  Wheat,
  X,
  Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName | string;
  className?: string;
  /** Rendered when the requested name is not in the registry. */
  fallback?: IconName;
  strokeWidth?: number;
}

export function Icon({ name, className, fallback = 'Info', strokeWidth = 1.9 }: IconProps) {
  const Component = (ICONS as Record<string, LucideIcon>)[name] ?? ICONS[fallback];

  return <Component className={cn('h-4 w-4', className)} strokeWidth={strokeWidth} aria-hidden />;
}

/** True when the catalogue name is actually renderable. */
export function hasIcon(name: string): name is IconName {
  return name in ICONS;
}
