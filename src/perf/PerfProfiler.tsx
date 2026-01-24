import React from "react";

import { isPerfEnabled, logPerf } from "./perfDebug";

type PerfProfilerProps = {
  id: string;
  children: React.ReactNode;
};

export const PerfProfiler = ({ id, children }: PerfProfilerProps): React.JSX.Element => {
  if (!isPerfEnabled()) return <>{children}</>;
  return (
    <React.Profiler
      id={id}
      onRender={(profilerId, phase, actualDuration, baseDuration) => {
        logPerf("react-profiler", {
          id: profilerId,
          phase,
          actualDuration,
          baseDuration,
        });
      }}
    >
      {children}
    </React.Profiler>
  );
};

export default PerfProfiler;
