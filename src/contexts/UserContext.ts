import { AccessGroupEntryResponse, User } from "deso-protocol";
import { createContext } from "react";

export type AppUser = User & {
  messagingPublicKeyBase58Check: string;
  accessGroupsOwned?: AccessGroupEntryResponse[];
};

export interface UserContextType {
  appUser: AppUser | null;
  isLoadingUser: boolean;
  setAccessGroups: (groupsOwned: AccessGroupEntryResponse[]) => void;
  setAllAccessGroups: (groups: AccessGroupEntryResponse[]) => void;
  allAccessGroups: AccessGroupEntryResponse[];
}

export const UserContext = createContext<UserContextType>({
  appUser: null,
  isLoadingUser: false,
  setAccessGroups: () => {
    return;
  },
  setAllAccessGroups: () => {
    return;
  },
  allAccessGroups: [],
});
