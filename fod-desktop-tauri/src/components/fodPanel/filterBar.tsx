import React, { useState, useEffect, useRef } from "react";
import { useSelector, useDispatch } from 'react-redux';
import InputRange from 'react-input-slider';
// import FilterIcon from "@/assets/images/svg/Filter/filter.svg";
import { config } from "@/config/clientConfig";
import { set_Class_Size, remove_Class, set_SortBy, setDashboardStatus } from "@/store/slices/fodReducer-slice";
import Image from "next/image";
import FilterIcon from "@/assets/images/svgr/filterIcon";
import { RootState } from "@/store";

const FilterBar = () => {
    return (
        <div className="w-full h-[6%] bg-[#F8F8F8] flex items-center justify-between mb-2 text-gray-600">
            <SortBy />
            <Filters />
        </div>
    );
};

export default FilterBar;

const SortBy = () => {
    const dispatch = useDispatch();
    const [isOpen, setIsOpen] = useState(false);
    const { sortby } = useSelector((state:RootState) => state.FodReducer.filters);
    const dropdownRef = useRef(null);

    const toggleDropdown = () => setIsOpen(!isOpen);

    const handleSelect = (e) => {
        dispatch(set_SortBy(e.target.value));
        setIsOpen(false);
    };

    //listen for clicking
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <div className="relative flex items-center gap-2" ref={dropdownRef}>
            <span className="font-medium">Sort By:</span>
            <select
                onClick={toggleDropdown}
                onChange={handleSelect}
                value={sortby}
                className="bg-gray-50 border border-gray-300 ring-gray-300 rounded-lg focus:ring-blue-400 focus:border-blue-400 block p-2.5 active:scale-95"
            >
                <option value="latest">Latest</option>
                <option value="oldest">Oldest</option>
                <option value="biggestTosmallest">Size: Biggest to Smallest</option>
                <option value="smallestTobiggest">Size: Smallest to Biggest</option>
                <option value="nearestFirst">Distance: Nearest First</option>
            </select>
        </div>
    );
};

const Filters = () => {
    const dispatch = useDispatch();
    const { size } = config.filters;
    const [formData, setFormData] = useState({
        Metallic: true,
        'Rocks/Ashpalt': true,
        Organic: true,
        'Non-Metallic': true,
    });
    const [isToolTipOpen, setToolTipVisibility] = useState(false);
    const [rangeValue, setRangeValue] = useState(size.min);
    const classes = [
        { name: 'Metallic Objects', value: 'Metallic' },
        { name: 'Rocks/Ashpalt Chunks', value: 'Rocks/Ashpalt' },
        { name: 'Organic Objects', value: 'Organic' },
        { name: 'Non-metallic objects', value: 'Non-Metallic' },
    ];

    const handleRangeChange = (newValue) => setRangeValue(newValue.x);

    const handleChange = (e) => {
        const { value, checked } = e.target;
        setFormData((prevState) => ({ ...prevState, [value]: checked }));
    };

    const handleRemoveOption = (keyToRemove) => {
        setFormData((prevState) => ({ ...prevState, [keyToRemove]: false }));
        dispatch(remove_Class(keyToRemove));
    };

    const handleApply = (e) => {
        e.preventDefault();
        const selectedClasses = Object.entries(formData)
            .filter(([_, value]) => value)
            .map(([key]) => key);
        const filter = { classes: selectedClasses, minSize: rangeValue };
        dispatch(set_Class_Size(filter));
        setToolTipVisibility(false);
    };

    return (
        <div className="relative w-[75%] flex justify-end items-center gap-4">
            <FilterIcon className={`${isToolTipOpen ? "text-blue-500" : "text-gray-500"}`} onClick={() => setToolTipVisibility(!isToolTipOpen)} />
            {/* <Image className="text-blue-500 relative cursor-pointer"  src={FilterIcon} alt="Filter" onClick={() => setToolTipVisibility(!isToolTipOpen)} /> */}
            {isToolTipOpen && (
                <div className="absolute right-6 top-full w-64 bg-white rounded-lg shadow-lg p-4 z-10">
                    <ClassForm
                        {...{ classes, formData, setFormData, handleApply, handleChange, handleRemoveOption, rangeValue, handleRangeChange, setToolTipVisibility }}
                    />
                </div>
            )}
        </div>
    );
};

const ClassForm = ({ rangeValue, handleRangeChange, classes, formData, setFormData, handleChange, handleApply, setToolTipVisibility }) => {
    const dispatch = useDispatch();
    const { groupStatus } = useSelector((state: RootState) => state.FodReducer.filters);
    const { size } = config.filters;
    const handleReset = () => {
        const selectedClasses = Object.entries({ Metallic: true, 'Rocks/Ashpalt': true, Organic: true, 'Non-Metallic': true })
            .filter(([_, value]) => value)
            .map(([key]) => key);
        // setFormData();
        const filter = { classes: selectedClasses, minSize: rangeValue };
        dispatch(set_Class_Size(filter));
        setToolTipVisibility(false);
    };

    const toggleAccept=(e)=>{
        e.preventDefault();
        if(groupStatus=='NEW'){
            dispatch(setDashboardStatus('ACCEPTED'))
        }else{
            dispatch(setDashboardStatus('NEW'))
        }
    }
    return (
        <form onSubmit={handleApply} className="w-full">
            <h3 className="text-lg font-semibold mb-2">Class</h3>
            <InputRange
                axis="x"
                xmin={size.min}
                xmax={size.max}
                x={rangeValue}
                onChange={handleRangeChange}
                styles={{
                    track: { background: '#60a5fa', height: '6px' },
                    active: { background: '#CCCCD6' },
                    thumb: {
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        backgroundColor: 'white',
                        border: '2px solid #60a5fa',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                    },
                }}
            />
            <div className="flex justify-between text-sm mt-2">
                <span>Min: {rangeValue} mm</span>
            </div>
            <ul className="list-none m-0 p-0 my-4">
                {classes.map((classData, index) => (
                    <li key={index} className={`flex items-center rounded-md py-2 px-2 mb-2 ${formData[classData.value] ? 'bg-blue-100' : 'bg-gray-100'}`}>
                        <input
                            id={classData.value}
                            type="checkbox"
                            value={classData.value}
                            checked={formData[classData.value]}
                            onChange={handleChange}
                            className="hidden"
                        />
                        <label htmlFor={classData.value} className="flex items-center cursor-pointer pl-4">
                            <span className={`w-5 h-5 border border-gray-500 rounded-md mr-2 ${formData[classData.value] ? 'bg-blue-400' : ''}`}></span>
                            {classData.name}
                        </label>
                    </li>
                ))}
            </ul>
            <label className="inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={groupStatus=='ACCEPTED'} value="" className="sr-only peer" onChange={toggleAccept}/>
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300  rounded-full peer  peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all  peer-checked:bg-blue-600"></div>
                <span className="ms-3 text-sm font-medium">Accepted</span>
            </label>
            <div className="flex gap-2 justify-center">
                <button
                    type="button"
                    className="border-2 border-blue-500 text-blue-border-blue-500 rounded-md py-1.5 px-4"
                    onClick={handleReset}
                >
                    Reset
                </button>
                <button
                    type="submit"
                    className="bg-blue-900 text-white rounded-md py-1.5 px-4"
                >
                    Apply
                </button>
            </div>
        </form>
    );
};
