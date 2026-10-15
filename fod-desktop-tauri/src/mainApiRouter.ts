import loginHandler from './pages/api/auth/login';
import logoutHandler from './pages/api/auth/logout';
import meHandler from './pages/api/auth/me';
import registerHandler from './pages/api/auth/register';
import missionIndexHandler from './pages/api/mission/index';
import missionCreateHandler from './pages/api/mission/create';
import missionStatHandler from './pages/api/mission/stat';
import missionToggleScanHandler from './pages/api/mission/toggle-scan';
import missionClearFodHandler from './pages/api/mission/clear-fod/index';
import missionDownloadHandler from './pages/api/mission/download/[id]';
import missionExportHandler from './pages/api/mission/export/[id]';
import missionDeleteHandler from './pages/api/mission/delete/[id]';
import missionExcludedHandler from './pages/api/mission/excluded/index';
import missionExploreHandler from './pages/api/mission/explore/[id]';
import missionGroupFodsHandler from './pages/api/mission/group-fods/[id]';
import missionJoinHandler from './pages/api/mission/join/[id]';
import missionLoadHandler from './pages/api/mission/load/[id]';
import missionLoadActiveHandler from './pages/api/mission/load/active';
import missionLoadNewHandler from './pages/api/mission/load/new';
import missionRestartHandler from './pages/api/mission/restart/[id]';
import missionRetriveDataHandler from './pages/api/mission/retrive-data/[id]';
import missionScanStatusHandler from './pages/api/mission/scan-status/index';
import missionTerminateHandler from './pages/api/mission/terminate/[id]';
import missionUpdateHandler from './pages/api/mission/update/[id]';
import cameraFeedPauseHandler from './pages/api/camera-feed/pause/[id]';
import cameraFeedPlayHandler from './pages/api/camera-feed/play/[id]';
import cameraFeedStopHandler from './pages/api/camera-feed/stop/[id]';
import clearedFodResponseHandler from './pages/api/cleared-fod/response';
import commandIndexHandler from './pages/api/command/index';
import fodGroupCountHandler from './pages/api/fod-group/count/[id]';
import fodGroupListFodHandler from './pages/api/fod-group/list-fod/[id]';
import fodGroupUpdateHandler from './pages/api/fod-group/update/[id]';
import healthDataHandler from './pages/api/health/health-data';

interface RoutePattern {
  pattern: RegExp;
  paramNames: string[];
  handler: any;
}

const routes: RoutePattern[] = [
  { pattern: /^\/api\/auth\/login$/, paramNames: [], handler: loginHandler },
  { pattern: /^\/api\/auth\/logout$/, paramNames: [], handler: logoutHandler },
  { pattern: /^\/api\/auth\/me$/, paramNames: [], handler: meHandler },
  { pattern: /^\/api\/auth\/register$/, paramNames: [], handler: registerHandler },
  { pattern: /^\/api\/mission$/, paramNames: [], handler: missionIndexHandler },
  { pattern: /^\/api\/mission\/create$/, paramNames: [], handler: missionCreateHandler },
  { pattern: /^\/api\/mission\/stat$/, paramNames: [], handler: missionStatHandler },
  { pattern: /^\/api\/mission\/toggle-scan$/, paramNames: [], handler: missionToggleScanHandler },
  { pattern: /^\/api\/mission\/clear-fod$/, paramNames: [], handler: missionClearFodHandler },
  { pattern: /^\/api\/mission\/download\/([^/]+)$/, paramNames: ['id'], handler: missionDownloadHandler },
  { pattern: /^\/api\/mission\/export\/([^/]+)$/, paramNames: ['id'], handler: missionExportHandler },
  { pattern: /^\/api\/mission\/delete\/([^/]+)$/, paramNames: ['id'], handler: missionDeleteHandler },
  { pattern: /^\/api\/mission\/excluded$/, paramNames: [], handler: missionExcludedHandler },
  { pattern: /^\/api\/mission\/explore\/([^/]+)$/, paramNames: ['id'], handler: missionExploreHandler },
  { pattern: /^\/api\/mission\/group-fods\/([^/]+)$/, paramNames: ['id'], handler: missionGroupFodsHandler },
  { pattern: /^\/api\/mission\/join\/([^/]+)$/, paramNames: ['id'], handler: missionJoinHandler },
  { pattern: /^\/api\/mission\/load\/active$/, paramNames: [], handler: missionLoadActiveHandler },
  { pattern: /^\/api\/mission\/load\/new$/, paramNames: [], handler: missionLoadNewHandler },
  { pattern: /^\/api\/mission\/load\/([^/]+)$/, paramNames: ['id'], handler: missionLoadHandler },
  { pattern: /^\/api\/mission\/restart\/([^/]+)$/, paramNames: ['id'], handler: missionRestartHandler },
  { pattern: /^\/api\/mission\/retrive-data\/([^/]+)$/, paramNames: ['id'], handler: missionRetriveDataHandler },
  { pattern: /^\/api\/mission\/scan-status$/, paramNames: [], handler: missionScanStatusHandler },
  { pattern: /^\/api\/mission\/terminate\/([^/]+)$/, paramNames: ['id'], handler: missionTerminateHandler },
  { pattern: /^\/api\/mission\/update\/([^/]+)$/, paramNames: ['id'], handler: missionUpdateHandler },
  { pattern: /^\/api\/camera-feed\/pause\/([^/]+)$/, paramNames: ['id'], handler: cameraFeedPauseHandler },
  { pattern: /^\/api\/camera-feed\/play\/([^/]+)$/, paramNames: ['id'], handler: cameraFeedPlayHandler },
  { pattern: /^\/api\/camera-feed\/stop\/([^/]+)$/, paramNames: ['id'], handler: cameraFeedStopHandler },
  { pattern: /^\/api\/cleared-fod\/response$/, paramNames: [], handler: clearedFodResponseHandler },
  { pattern: /^\/api\/command$/, paramNames: [], handler: commandIndexHandler },
  { pattern: /^\/api\/fod-group\/count\/([^/]+)$/, paramNames: ['id'], handler: fodGroupCountHandler },
  { pattern: /^\/api\/fod-group\/list-fod\/([^/]+)$/, paramNames: ['id'], handler: fodGroupListFodHandler },
  { pattern: /^\/api\/fod-group\/update\/([^/]+)$/, paramNames: ['id'], handler: fodGroupUpdateHandler },
  { pattern: /^\/api\/health\/health-data$/, paramNames: [], handler: healthDataHandler },
];

export async function handleApiRequest(url: string, method: string, body: any, headers: any, queryParams: any) {
  // Extract path without query string
  const cleanUrl = url.split('?')[0];
  
  const route = routes.find(r => r.pattern.test(cleanUrl));
  if (!route) {
    console.error(`Route not found for URL: ${url}`);
    return {
      status: 404,
      data: { error: `Not Found: ${url}` }
    };
  }

  // Parse params from URL pattern
  const match = cleanUrl.match(route.pattern);
  const params: any = {};
  if (match) {
    route.paramNames.forEach((name, index) => {
      params[name] = match[index + 1];
    });
  }

  const query = { ...queryParams, ...params };

  let statusVal = 200;
  let responseData: any = null;
  let headersSent: any = {};

  const req: any = {
    // Handlers branch on uppercase methods (req.method === 'GET'); callers pass
    // mixed case ('get' from many axiosClient calls). Normalise so a lowercase
    // method never yields a spurious 405.
    method: (method || 'GET').toUpperCase(),
    url,
    query,
    body: body || {},
    headers: headers || {},
  };

  const res: any = {
    statusCode: 200,
    status(code: number) {
      statusVal = code;
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
    send(data: any) {
      responseData = data;
      return this;
    },
    setHeader(name: string, value: string) {
      headersSent[name] = value;
      return this;
    },
    end(data?: any) {
      if (data) responseData = data;
      return this;
    }
  };

  try {
    await route.handler(req, res);
    return {
      status: statusVal,
      data: responseData,
      headers: headersSent
    };
  } catch (error: any) {
    console.error(`Error executing handler for ${url}:`, error);
    return {
      status: 500,
      data: { error: 'Internal server error', details: error.message }
    };
  }
}
