import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import atcCommImg from "@/assets/images/atc-comm.svg";
import axiosClient from '@/utils/axios';

function AtcIcon() {
    const [atc, setAtc] = useState(false);
    useEffect(() => {
        const checkStatus = () => {
            axiosClient({
                method: 'GET',
                url: '/api/health/atc-status',
            })
                .then((res) => setAtc(Boolean(res?.data?.connected)))
                .catch(() => setAtc(false));
        };
        checkStatus();
        const interval = setInterval(checkStatus, 2000);
        return () => clearInterval(interval);
    }, []);

    if (atc) {
        return (
            <div key="atc" className="flex items-center gap-1">
                <Image src={atcCommImg} alt="atc" width={15} height={15} />
                <span className="text-xs font-semibold">atc </span>
            </div>
        );
    }
    return null;
}

export default AtcIcon;
