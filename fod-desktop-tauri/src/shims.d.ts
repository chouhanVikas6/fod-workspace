declare module 'next' {
  export type NextApiRequest = any;
  export type NextApiResponse = any;
}

declare module 'next/server' {
  export type NextRequest = any;
  export type NextResponse = any;
}

declare module 'next/router' {
  export function useRouter(): any;
}

declare module '*.mp3' {
  const src: string;
  export default src;
}

declare module '*.wav' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const content: any;
  export default content;
}
