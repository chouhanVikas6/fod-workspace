import RestPath from '@/constants/apiPaths';
import { start_Mission } from '@/store/slices/missionState-slice';
import axiosClient from '@/utils/axios';
import React, { useState } from 'react'
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';

const SPEED_RANGE = { min: 5, max: 45 };   // km/h (PDF mission template spec)
const PASS_RANGE = { min: 1, max: 3 };

const TEMPLATE_TYPES = [
    { key: 'PE', title: 'Pre-existing template', desc: 'Run a saved runway scan template' },
    { key: 'CN', title: 'Create new template', desc: 'Define a new scan area on the map' },
    { key: 'FR', title: 'Free run', desc: 'Manual drive with live FOD detection' },
];

function MissionTemplate({ stopTemplateView }: any) {
    const [selectedType, setSelectedType] = useState('')
    const [speed, setSpeed] = useState('')
    const [pass, setPass] = useState('')
    const [apiLoading, setApiLoading] = useState(false)
    const dispatch = useDispatch();

    function validateTemplate(): { speed: number, pass: number } | null {
        const speedNum = Number(speed);
        const passNum = Number(pass);
        if (!speed || !Number.isInteger(speedNum) || speedNum < SPEED_RANGE.min || speedNum > SPEED_RANGE.max) {
            toast.error(`Mission speed must be a whole number between ${SPEED_RANGE.min} and ${SPEED_RANGE.max} km/h`);
            return null;
        }
        if (!pass || !Number.isInteger(passNum) || passNum < PASS_RANGE.min || passNum > PASS_RANGE.max) {
            toast.error(`Number of passes must be between ${PASS_RANGE.min} and ${PASS_RANGE.max}`);
            return null;
        }
        return { speed: speedNum, pass: passNum };
    }

    function newMission() {
        const params = validateTemplate();
        if (!params) return;
        setApiLoading(true);
        axiosClient({
            method: "POST",
            url: RestPath.LOADNEWMISSION,
            data: params
        }).then((response) => {
            console.log({response})
            if (!!response?.data?.id) {
                // Backend returns `timer` (elapsed ms); the mission state slice
                // tracks it as `duration`.
                dispatch(start_Mission({ ...response.data, isActive: true, duration: response.data.timer ?? 0 }));
            } else {
                toast.error(response?.data?.error || response?.data?.message || 'Failed to start mission');
            }
        }).catch((error) => {
            toast.error(error?.data?.error || error?.data?.message || 'Failed to start mission — is the vehicle connected?');
        }).finally(() => {
            setApiLoading(false);
        })
    }

    return (
        <div className="w-full h-full flex flex-col gap-4 p-4 bg-[#F5F5F5]">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <h1 className="text-xl font-bold text-[#002756]">New Mission</h1>
                <button
                    onClick={stopTemplateView}
                    title="Close"
                    className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700 active:scale-95 transition-transform"
                >
                    ✕
                </button>
            </div>

            {selectedType == 'CN' ?
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 bg-white border border-gray-200 rounded-lg text-center p-6">
                    <h2 className="font-bold text-lg text-[#002756]">Mission Template Creation</h2>
                    <p className="text-sm text-gray-500 max-w-md">
                        Draw the scan boundary on the map, enter its coordinates and choose a fast or slow
                        mission profile. This planner is under construction.
                    </p>
                    <button
                        onClick={() => setSelectedType('')}
                        className="mt-2 h-10 px-5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 active:scale-95 transition-transform"
                    >
                        Back to template selection
                    </button>
                </div>
                :
                <>
                    <div className="shrink-0">
                        <p className="text-sm font-semibold text-gray-600 mb-2">Mission template</p>
                        <div className="grid grid-cols-3 gap-3">
                            {TEMPLATE_TYPES.map(({ key, title, desc }) => (
                                <div
                                    key={key}
                                    onClick={() => setSelectedType(key)}
                                    className={`rounded-lg bg-[#FCFCFC] p-4 cursor-pointer user-select-none transition-all active:scale-[0.98] border ${selectedType == key
                                        ? 'border-[#017ED7] border-2 shadow-sm'
                                        : 'border-gray-300 hover:border-gray-400'
                                        }`}
                                >
                                    <p className="font-semibold text-[#002756]">{title}</p>
                                    <p className="text-sm text-gray-500 mt-1">{desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="shrink-0">
                        <p className="text-sm font-semibold text-gray-600 mb-2">Parameters</p>
                        <div className="flex gap-6 bg-white border border-gray-200 rounded-lg p-4">
                            <label className="block">
                                <span className="text-sm text-gray-600">Mission speed (km/h)</span>
                                <input
                                    min={SPEED_RANGE.min} max={SPEED_RANGE.max} type='number'
                                    value={speed} onChange={(e) => setSpeed(e.target.value)}
                                    placeholder={`${SPEED_RANGE.min}–${SPEED_RANGE.max}`}
                                    className='mt-1 block w-36 h-10 px-3 rounded-lg border border-gray-300 bg-white focus:border-[#017ED7] focus:outline-none'
                                />
                            </label>
                            <label className="block">
                                <span className="text-sm text-gray-600">Number of passes</span>
                                <input
                                    min={PASS_RANGE.min} max={PASS_RANGE.max} type='number'
                                    value={pass} onChange={(e) => setPass(e.target.value)}
                                    placeholder={`${PASS_RANGE.min}–${PASS_RANGE.max}`}
                                    className='mt-1 block w-36 h-10 px-3 rounded-lg border border-gray-300 bg-white focus:border-[#017ED7] focus:outline-none'
                                />
                            </label>
                        </div>
                    </div>
                </>
            }

            <div className="mt-auto flex justify-end shrink-0">
                <button
                    onClick={newMission}
                    disabled={apiLoading}
                    className={`h-10 px-6 rounded-lg font-medium text-white transition-transform ${apiLoading ? 'bg-gray-400' : 'bg-[#017ED7] hover:bg-[#0171c0] active:scale-95'}`}
                >
                    {apiLoading ? 'Launching…' : 'Launch Mission'}
                </button>
            </div>
        </div>
    )
}

export default MissionTemplate
