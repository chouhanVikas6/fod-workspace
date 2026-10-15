import Image from 'next/image';
import React, { useEffect, useState } from 'react';
import atcCommImg from "@/assets/images/atc-comm.svg";
import { ServerBase } from '@/config/clientConfig';

function AtcIcon() {
    const [atc, setAtc] = useState(false);
    useEffect(() => {
        const interval = setInterval(() => {
            fetch(`${ServerBase}/api/health/atc-status`)
                .then((res) => res.json())
                .then((data) => setAtc(Boolean(data?.connected)))
                .catch(() => setAtc(false));
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    if (atc) {
        return (
            <div key="atc" className="flex items-center">
                <Image src={atcCommImg} alt="atc" width={15} height={15} />
                <span>atc </span>
            </div>
        );
    }
    return null;
}

export default AtcIcon;