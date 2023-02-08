import { FC } from "react";
import { DEFAULT_KEY_MESSAGING_GROUP_NAME } from "../utils/constants";
import { SearchUsers } from "./search-users";

export const MessagingStartNewConversation: FC<{
  rehydrateConversation: (publicKey: string, autoScroll?: boolean) => void;
}> = ({ rehydrateConversation }) => {
  return (
    <div>
      <div className="m-4">
        <SearchUsers
          onSelected={async (e) => {
            if (!e) {
              return;
            }
            await rehydrateConversation(
              e?.id + DEFAULT_KEY_MESSAGING_GROUP_NAME,
              true
            );
          }}
          placeholder="Search DeSo & Ethereum Addresses..."
          className="text-white placeholder:text-blue-100 bg-blue-900/10 placeholder-gray border border-blue-900 hover:border-blue-600"
        />
      </div>
    </div>
  );
};
