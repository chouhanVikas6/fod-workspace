import React, { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, isAuthenticated } from "@/utils/auth";
import Loader from "./commen/loader";

type ProtectedRouteProps = {
  authenticated:boolean;
  children: ReactNode;
};

const PrivateRoute = ({ children,authenticated }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  React.useEffect(() => {
    if (authenticated && !isAuthenticated() ) navigate("/login"); 
  }, [navigate]);

  return <>{children}</>;
};

export default PrivateRoute;
