import { AccessGroupEntryResponse, User } from "deso-protocol-types";
import { createContext } from "react";
import { hasSetupMessaging } from "../utils/helpers";

export type AppUser = User & {
  messagingPublicKeyBase58Check: string;
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
