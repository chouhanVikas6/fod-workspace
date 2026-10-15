import * as React from "react"
import { SVGProps } from "react"
const FilterIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={26}
    height={29}
    fill="none"
    {...props}
  >
    <path
      fill="currentColor"
      d="M17.89 26.296c.062.467-.094.966-.452 1.293a1.55 1.55 0 0 1-2.197 0l-6.247-6.247a1.54 1.54 0 0 1-.452-1.293v-7.976L1.08 2.523a1.558 1.558 0 0 1 .265-2.18C1.641.125 1.968 0 2.311 0h21.81c.342 0 .67.125.966.343a1.558 1.558 0 0 1 .264 2.18l-7.462 9.55v14.223ZM5.49 3.116l6.168 7.882v8.6l3.116 3.115v-11.73l6.169-7.867H5.489Z"
    />
  </svg>
)
export default FilterIcon
