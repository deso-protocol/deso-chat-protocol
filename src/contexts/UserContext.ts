import { PrimaryDerivedKeyInfo } from "@deso-core/identity";
import { AccessGroupEntryResponse, User } from "deso-protocol-types";
import { createContext } from "react";

export type AppUser = User & {
  primaryDerivedKey: PrimaryDerivedKeyInfo;
  accessGroupsOwned?: AccessGroupEntryResponse[];
};

export interface UserContextType {
  appUser: AppUser | null;
  isLoadingUser: boolean;
  setAccessGroups: (groups: AccessGroupEntryResponse[]) => void;
}

export const UserContext = createContext<UserContextType>({
  appUser: null,
  isLoadingUser: false,
  setAccessGroups: (_: AccessGroupEntryResponse[]) => {},
});
