
import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import MissionControlPanel from './MissionControlPanel';

const OperationSideBar = ({ tab, setTab }: any) => {
  const isDark = useSelector(
    (state: RootState) => state.theme.theme === 'dark'
  );

  return (
    <aside
      className={`sidebar-native-theme h-full sm:w-[70px] lg:w-[80px] shrink-0 flex flex-col items-center overflow-hidden select-none transition-colors duration-200 ${
        isDark
          ? 'bg-[#262A30] border-[#252B35]'
          : 'bg-[#FCFCFC] border-[#DDDDE7]'
      }`}
    >
      <MissionControlPanel tab={tab} setTab={setTab} />
    </aside>
  );
};

export default OperationSideBar;