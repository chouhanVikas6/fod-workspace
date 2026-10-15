import React, { useMemo } from "react";
import { useSelector } from "react-redux";
import { RootState } from "@/store";

// BITE (Built-In Test Equipment) diagnostics tab.
// Data flows in live via the /api/sse/health-data stream:
//   car_health  -> BiteState.carData   (temp/volt/memory/space/rtk)
//   AiHealth    -> SystemHealth.AiHealth.data  (26 cameras)

const StatTile = ({ label, value, unit, status }: { label: string; value: React.ReactNode; unit?: string; status?: 'ok' | 'warn' | 'error' | 'neutral' }) => {
    const color = status === 'ok' ? 'text-green-600' : status === 'warn' ? 'text-yellow-500' : status === 'error' ? 'text-red-600' : 'text-gray-800';
    return (
        <div className="flex flex-col items-center justify-center bg-white rounded-lg shadow p-4 min-w-[130px]">
            <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
            <span className={`text-2xl font-bold ${color}`}>{value}{unit ? <span className="text-sm font-normal ml-0.5">{unit}</span> : null}</span>
        </div>
    );
};

const Bite = () => {
    const bite = useSelector((state: RootState) => state.BiteState.carData);
    const aiHealth = useSelector((state: RootState) => state.SystemHealth.AiHealth.data);
    // Live GPS fix/sd/coords arrive on carData (same source as the GNSS header);
    // satellite count / status come from the backend BITE car_health.rtk.
    const carData = useSelector((state: RootState) => state.SystemHealth.carData.data);

    const cams = useMemo(() => (Array.isArray(aiHealth) ? aiHealth : Object.values(aiHealth || {})) as Array<{ CAM_ID?: string; CAMERA_CONNECTION?: boolean; INTR_FPS?: number }>, [aiHealth]);
    const camsConnected = useMemo(() => cams.filter((c) => c?.CAMERA_CONNECTION).length, [cams]);

    const tempStatus = bite.temp >= 80 ? 'error' : bite.temp >= 65 ? 'warn' : 'ok';
    const memPct = bite.memory_gb; // gb used (as reported)
    const rtk = bite.rtk || ({} as typeof bite.rtk);

    // Merge the live carData GPS node (fix/sd/lat/lon/heading) with the BITE
    // car_health node (satellite/status) for each RTK antenna.
    const gpsFor = (node: 'primary' | 'secondary') => {
        const live: any = (node === 'primary' ? carData?.primary_data : carData?.secondary_data) || {};
        const health: any = rtk?.[node] || {};
        return {
            status: live.fix || health.status || 'single',
            satellite: health.satellite ?? 0,
            sd: live.sd ?? health.location?.sd ?? 0,
            lat: live.lat ?? health.location?.lat ?? 0,
            lon: live.lon ?? health.location?.lon ?? 0,
            heading: live.heading ?? health.location?.heading ?? 0,
        };
    };

    const fmtTime = (t?: string) => {
        if (!t || t.startsWith('1970')) return '—';
        try { return new Date(t).toLocaleTimeString(); } catch { return '—'; }
    };

    return (
        <div className="relative w-full h-[80vh] bg-gray-100 overflow-y-auto p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-1">BITE / System Diagnostics</h2>
            <p className="text-sm text-gray-500 mb-5">Vehicle Built-In Test Equipment — updated {fmtTime(bite.updatedAt)}</p>

            <div className="flex items-center gap-2 mb-4">
                <span className={`w-3 h-3 rounded-full ${bite.connection ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className="font-semibold text-gray-700">Vehicle {bite.connection ? 'Connected' : 'Disconnected'}</span>
            </div>

            <h3 className="text-sm font-semibold text-gray-600 mb-2">Vehicle Health</h3>
            <div className="flex flex-wrap gap-3 mb-6">
                <StatTile label="CPU Temp" value={bite.temp ?? 0} unit="°C" status={tempStatus} />
                <StatTile label="Voltage" value={bite.volt ?? 0} unit="V" status={bite.volt > 0 ? 'ok' : 'neutral'} />
                <StatTile label="Memory Used" value={memPct ?? 0} unit="GB" status="neutral" />
                <StatTile label="Free Storage" value={bite.space_gb ?? 0} unit="GB" status={bite.space_gb < 5 ? 'warn' : 'ok'} />
            </div>

            <h3 className="text-sm font-semibold text-gray-600 mb-2">RTK GNSS</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                {(['primary', 'secondary'] as const).map((node) => {
                    const n = gpsFor(node);
                    return (
                        <div key={node} className="bg-white rounded-lg shadow p-4">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-semibold text-gray-700 capitalize">{node}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${n.status === 'RTK' ? 'bg-green-100 text-green-700' : n.status === 'GPS' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>{n.status}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-y-1 text-sm text-gray-600">
                                <span>Satellites</span><span className="text-right font-medium">{n.satellite}</span>
                                <span>SD</span><span className="text-right font-medium">{n.sd}</span>
                                <span>Lat</span><span className="text-right font-medium">{n.lat}</span>
                                <span>Lon</span><span className="text-right font-medium">{n.lon}</span>
                                <span>Heading</span><span className="text-right font-medium">{n.heading}°</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <h3 className="text-sm font-semibold text-gray-600 mb-2">Cameras &amp; AI</h3>
            <div className="flex flex-wrap gap-3">
                <StatTile label="Connected" value={`${camsConnected} / ${cams.length || 26}`} status={camsConnected === (cams.length || 26) ? 'ok' : camsConnected === 0 ? 'error' : 'warn'} />
                <StatTile label="RTK Delay" value={rtk?.timer_script_delay ?? 0} unit="ms" status="neutral" />
            </div>
        </div>
    );
};

export default Bite;
