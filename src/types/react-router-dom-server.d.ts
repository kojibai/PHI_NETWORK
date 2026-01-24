declare module "react-router-dom/server" {
  import type { ReactNode } from "react";

  export interface StaticRouterProps {
    basename?: string;
    location?: string;
    children?: ReactNode;
  }

  export function StaticRouter(props: StaticRouterProps): JSX.Element;
}
