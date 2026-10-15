import { NextFunction ,Request,Response} from "express";
import retriveData from "./retrive-data";
import healthData from "./health-data";

export function dynamicMiddleware(req: Request, res: Response, next: NextFunction) {
    console.log('Stream request detected',req.path);

    if(req.path.startsWith('/api/sse/retrive-data')){
        retriveData(req,res,next);
        next();
    }else if(req.path.startsWith('/api/sse/health-data')){
        healthData(req,res,next);
        next();
    }

  }
  
