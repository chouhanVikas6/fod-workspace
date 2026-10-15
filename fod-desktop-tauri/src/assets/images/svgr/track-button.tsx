import * as React from "react"
import { SVGProps } from "react"
const TrackButton = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={40}
    height={40}
    fill="none"
    {...props}
  >
    <g filter="url(#filter0_d_192_1666)">
      <g filter="url(#filter1_b_192_1666)">
        <circle cx={38} cy={35.9} r={4.5} fill="#fff" fillOpacity="current" />
      </g>
      <path
        stroke="#fff"
        strokeLinecap="round"
        strokeMiterlimit={10}
        strokeWidth={3}
        d="M53.054 36.1h-3.36m0 0a11.759 11.759 0 0 1-11.76 11.76m11.76-11.76a11.76 11.76 0 0 0-11.76-11.76m0-3.36v3.36m0 0a11.76 11.76 0 0 0-8.317 20.075 11.762 11.762 0 0 0 8.316 3.446M22.813 36.1h3.36m11.76 15.12v-3.36"
      />
    </g>
  </svg>
)
export default TrackButton