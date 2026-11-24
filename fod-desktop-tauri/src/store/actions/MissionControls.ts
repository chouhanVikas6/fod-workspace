import axiosClient from "@/utils/axios";
import { toast } from "react-toastify";
import { pauseResumeMissionApiCall } from "../../ApiCalls/MissionControls";
import {
  pause_resumeMission,
  set_ExitTransition,
  set_PauseLoader,
  set_Terminate,
  setIsLoading,
} from "../slices/missionState-slice";
import { resetFods } from "../slices/fodReducer-slice";
import { persistor } from "../index";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const pauseResumeMission = async (dispatch: any, getState: any) => {
  try {
    const { isStart, isPause } = getState().MissionState;
    if (!isStart || typeof isPause !== "boolean") {
      return;
    }

    dispatch(set_PauseLoader(true));
    const response = await pauseResumeMissionApiCall(!isPause);

    if (response) {
      dispatch(pause_resumeMission(!isPause));
    }
    dispatch(set_PauseLoader(false));
  } catch (e) {
    console.log(e);
    dispatch(set_PauseLoader(false));
  }
};

export const terminateMission = async (dispatch: any, getState: any): Promise<void> => {
  const mission = getState().MissionState;
  if (!mission || mission.exitTransition?.active) {
    return;
  }

  const missionNumber = mission.missionNumber;
  const displayId = mission.displayId ?? missionNumber;
  const startedAt = Date.now();

  try {
    dispatch(setIsLoading(true));
    dispatch(
      set_ExitTransition({
        active: true,
        mode: "terminate",
        missionNumber,
        displayId,
        stage: "working",
      })
    );

    await axiosClient({
      method: "POST",
      url: "/api/mission/terminate/" + missionNumber,
    });

    const elapsed = Date.now() - startedAt;
    if (elapsed < 1000) {
      await sleep(1000 - elapsed);
    }

    dispatch(set_Terminate());
    dispatch(resetFods());
    void persistor.purge();

    await sleep(250);
    dispatch(set_ExitTransition(null));
  } catch (e: any) {
    console.log(e);
    dispatch(set_ExitTransition(null));
    toast.error(
      e?.data?.error || "Failed to terminate mission — is the vehicle connected?"
    );
  } finally {
    dispatch(setIsLoading(false));
  }
};

export const exitMission = async (dispatch: any, getState: any): Promise<void> => {
  const mission = getState().MissionState;
  if (mission?.exitTransition?.active) {
    return;
  }

  const missionNumber = mission?.missionNumber ?? null;
  const displayId = mission?.displayId ?? missionNumber;

  try {
    dispatch(setIsLoading(true));
    dispatch(
      set_ExitTransition({
        active: true,
        mode: "exit",
        missionNumber,
        displayId,
        stage: "working",
      })
    );

    await sleep(900);

    dispatch(set_Terminate());
    dispatch(resetFods());
    void persistor.purge();

    await sleep(250);
    dispatch(set_ExitTransition(null));
  } catch (e) {
    console.log(e);
    dispatch(set_ExitTransition(null));
  } finally {
    dispatch(setIsLoading(false));
  }
};