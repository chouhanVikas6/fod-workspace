import React, { Suspense, lazy } from 'react';

export default function dynamic(loader: () => Promise<any>, options: any = {}) {
  const LazyComponent = lazy(loader);
  
  return function DynamicComponent(props: any) {
    const Fallback = options.loading ? options.loading : () => null;
    return (
      <Suspense fallback={<Fallback />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
