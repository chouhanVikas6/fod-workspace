import React, { useEffect, useCallback } from 'react';
import { useDispatch } from 'react-redux';
import socketClient from '@/utils/SocketClient/socketClient';
import { PayloadAction } from '@reduxjs/toolkit';
import { handleServerError } from "@/utils/alerts";
import { pushFod } from '@/store/slices/mission-slice';
import { updateSystemHealth } from '@/store/actions/systemHealth';

const GlobalEvents = () => {

  return null; // This component doesn't render any UI elements
};

export default GlobalEvents;
