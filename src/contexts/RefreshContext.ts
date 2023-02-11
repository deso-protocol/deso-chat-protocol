import { createContext } from "react";

type IRefreshContext = {
  lockRefresh: boolean;
  setLockRefresh: (state: boolean) => void;
};

export const RefreshContext = createContext<IRefreshContext>({
  lockRefresh: false,
  setLockRefresh: () => {
    return;
  },
});
