import { useState } from 'react';
import { Home, Folder, Settings, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside 
      className={`h-screen bg-[#121214] border-r border-[#27272a] text-white flex flex-col justify-between transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Top Section: Logo & Nav Links */}
      <div>
        {/* Header / Logo */}
        <div className="flex items-center justify-between p-4 border-b border-[#27272a]">
          {!isCollapsed && <span className="font-semibold text-sm tracking-wide">FOD Simulator</span>}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg hover:bg-[#27272a] text-zinc-400 hover:text-white transition-colors ml-auto"
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="p-2 space-y-1">
          <NavItem icon={<Home size={18} />} label="Dashboard" isCollapsed={isCollapsed} active />
          <NavItem icon={<Folder size={18} />} label="Projects" isCollapsed={isCollapsed} />
          <NavItem icon={<Settings size={18} />} label="Settings" isCollapsed={isCollapsed} />
        </nav>
      </div>

      {/* Footer Section (Optional) */}
      <div className="p-4 border-t border-[#27272a] text-xs text-zinc-500">
        {!isCollapsed && <span>v0.1.0-beta</span>}
      </div>
    </aside>
  );
}

// Helper Item Component
function NavItem({ icon, label, isCollapsed, active = false }: { icon: React.ReactNode, label: string, isCollapsed: boolean, active?: boolean }) {
  return (
    <button 
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-[#27272a] text-white' : 'text-zinc-400 hover:bg-[#1a1a1e] hover:text-white'
      }`}
      title={isCollapsed ? label : undefined}
    >
      <span className="shrink-0">{icon}</span>
      {!isCollapsed && <span className="truncate">{label}</span>}
    </button>
  );
}