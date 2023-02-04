import { FC, useContext } from 'react';
import { SearchUsers } from "./search-users";
import { DesoContext } from "../contexts/desoContext";

export const MessagingStartNewConversation: FC<{
  rehydrateConversation: (publicKey: string, autoScroll?: boolean) => void;
}> = ({ rehydrateConversation, }) => {
  const { deso } = useContext(DesoContext);

  return (
    <div>
      <div className="m-4">
        <SearchUsers
          deso={deso}
          onSelected={async (e) => {
            if (!e) {
              return;
            }
            await rehydrateConversation(e?.id + "default-key", true);
          }}
          placeholder="Search DeSo & Ethereum Addresses..."
          className="text-white placeholder:text-blue-100 bg-blue-900/10 placeholder-gray border border-blue-900 hover:border-blue-600"
        />
      </div>
    </div>
  );
};
