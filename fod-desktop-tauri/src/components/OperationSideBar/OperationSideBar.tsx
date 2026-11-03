import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MissionControlPanel from './MissionControlPanel';
import MissionProgress from './MissionProgress';

const OperationSideBar = ({ tab, setTab }: any) => {
  const isDark = useSelector((state: RootState) => state.theme.theme === 'dark');

  return (
    <aside
      className={`sidebar-native-theme h-full w-[78px] shrink-0 flex flex-col items-center py-2.5 overflow-y-auto border-r select-none transition-colors duration-200 ${
        isDark ? 'bg-[#181C23] border-[#252B35]' : 'bg-[#FCFCFC] border-[#DDDDE7]'
      }`}
    >
      <MissionControlPanel tab={tab} setTab={setTab} />
    </aside>
  );
};

export default OperationSideBar;