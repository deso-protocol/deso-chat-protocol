import {
  Tab,
  TabPanel,
  Tabs,
  TabsBody,
  TabsHeader,
  Tooltip,
} from "@material-tailwind/react";
import { ChatType, identity, ProfileEntryResponse } from "deso-protocol";
import { ethers } from "ethers";
import sortBy from "lodash/sortBy";
import { FC, useState } from "react";
import {
  MAX_MEMBERS_IN_GROUP_SUMMARY_SHOWN,
  MAX_MEMBERS_TO_REQUEST_IN_GROUP,
} from "../utils/constants";
import { getChatNameFromConversation } from "../utils/helpers";
import { ConversationMap } from "../utils/types";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { MessagingStartNewConversation } from "./messaging-start-new-conversation";
import { shortenLongWord } from "./search-users";
import { SaveToClipboard } from "./shared/save-to-clipboard";
import { StartGroupChat } from "./start-group-chat";

export const MessagingConversationAccount: FC<{
  conversations: ConversationMap;
  getUsernameByPublicKeyBase58Check: { [key: string]: string };
  selectedConversationPublicKey: string;
  onClick: (publicKey: string) => void;
  rehydrateConversation: (publicKey?: string) => void;
  membersByGroupKey: {
    [groupKey: string]: { [publicKey: string]: ProfileEntryResponse | null };
  };
}> = ({
  conversations,
  getUsernameByPublicKeyBase58Check,
  selectedConversationPublicKey,
  onClick,
  rehydrateConversation,
  membersByGroupKey,
}) => {
  // TODO: move to identity package
  const provider = new ethers.providers.InfuraProvider("homestead"); //, process.env.REACT_APP_INFURA_API_KEY);
  const activeTab = { className: "bg-blue-800" };
  return (
    <div className="h-full rounded-md rounded-r-none">
      <div className="m-0">
        <StartGroupChat onSuccess={rehydrateConversation} />
      </div>

      <MessagingStartNewConversation
        rehydrateConversation={rehydrateConversation}
      />

      <Tabs
        id="main-chat-tabs"
        value="chats"
        className="h-full max-h-[calc(100%-144px)]"
      >
        <TabsHeader
          className="bg-blue-900/20 py-2 px-4"
          indicatorProps={activeTab}
        >
          <Tab key="chats" value="chats" className="text-blue-100 font-bold">
            Chats
          </Tab>

          <Tab
            key="requests"
            value="requests"
            className="text-blue-100 font-bold"
          >
            Requests
          </Tab>
        </TabsHeader>

        <TabsBody
          className="h-[calc(100%-50px)] relative py-4"
          animate={{
            mount: { transition: { duration: 0, times: 0 } },
            unmount: { transition: { duration: 0, times: 0 } },
          }}
        >
          <TabPanel
            key="chats"
            value="chats"
            className="conversations-list overflow-y-auto max-h-full [&>:nth-child(1)]:border-t-0 custom-scrollbar"
          >
            <div className="h-full">
              {Object.entries(conversations)
                .sort(([aPub, convoA], [bPub, convoB]) => {
                  if (convoA.messages.length === 0) {
                    return aPub === selectedConversationPublicKey ? -1 : 1;
                  }
                  if (convoB.messages.length === 0) {
                    return bPub === selectedConversationPublicKey ? 1 : -1;
                  }
                  return (
                    convoB.messages[0].MessageInfo.TimestampNanos -
                    convoA.messages[0].MessageInfo.TimestampNanos
                  );
                })
                .map(([key, value]) => {
                  const isDM = value.ChatType === ChatType.DM;
                  const isGroupChat = value.ChatType === ChatType.GROUPCHAT;
                  const publicKey = isDM
                    ? value.firstMessagePublicKey
                    : value.messages[0].RecipientInfo.OwnerPublicKeyBase58Check;
                  const chatName = getChatNameFromConversation(
                    value,
                    getUsernameByPublicKeyBase58Check
                  );
                  const selectedConversationStyle =
                    key === selectedConversationPublicKey
                      ? "selected-conversation bg-blue-900/20"
                      : "";
                  return (
                    <div
                      onClick={() => onClick(key)}
                      className={`px-2 py-4 ${selectedConversationStyle} hover:bg-blue-900/10 cursor-pointer flex justify-start`}
                      key={`message-thread-${key}`}
                    >
                      <MessagingDisplayAvatar
                        username={isDM ? chatName : undefined}
                        publicKey={
                          isDM ? value.firstMessagePublicKey : chatName || ""
                        }
                        groupChat={isGroupChat}
                        diameter={50}
                        classNames="mx-2"
                      />
                      <div className="w-[calc(100%-70px)] text-left">
                        <header className="flex items-center justify-between">
                          <div className="text-left ml-2 text-blue-100 font-semibold">
                            {isDM && chatName ? "@" : ""}
                            {shortenLongWord(chatName, 7, 7) ||
                              shortenLongWord(publicKey)}
                          </div>

                          {isDM && (
                            <ETHSection
                              desoPublicKey={publicKey}
                              provider={provider}
                            />
                          )}

                          {isGroupChat && (
                            <MessagingGroupMembers
                              membersMap={membersByGroupKey[key] || {}}
                            />
                          )}
                        </header>

                        {value.messages[0] && (
                          <div className="text-left break-all truncate w-full text-blue-300/60 ml-2">
                            {value.messages[0].DecryptedMessage.slice(0, 50)}...
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </TabPanel>

          <TabPanel key="requests" value="requests">
            <h2 className="text-white font-semibold text-2xl mt-5 mb-2">
              Coming soon!
            </h2>
            <div className="text-blue-300/60 text-xl px-10">
              An on-chain message request & approval flow will be launching
              soon.
            </div>
          </TabPanel>
        </TabsBody>
      </Tabs>
    </div>
  );
};

export const MessagingGroupMembers: FC<{
  membersMap: { [publicKey: string]: ProfileEntryResponse | null };
  maxMembersShown?: number;
}> = ({ membersMap, maxMembersShown = MAX_MEMBERS_IN_GROUP_SUMMARY_SHOWN }) => {
  // Sorting by members who have a profile, and then by 'Username' in ascending order
  const allPubKeys = sortBy(Object.keys(membersMap), (key) =>
    membersMap[key]?.Username.toLowerCase()
  );
  const pubKeys = allPubKeys.slice(0, maxMembersShown);
  const hiddenMembersNum = allPubKeys.slice(maxMembersShown).length;

  return (
    <div className="flex justify-start ml-2">
      {pubKeys &&
        pubKeys.map((pubKey) => (
          <Tooltip
            key={pubKey}
            content={membersMap[pubKey]?.Username || shortenLongWord(pubKey)}
          >
            <div>
              <MessagingDisplayAvatar
                username={membersMap[pubKey]?.Username}
                publicKey={pubKey}
                diameter={26}
                classNames="-ml-2 pb-1"
                borderColor="border-black"
              />
            </div>
          </Tooltip>
        ))}

      {hiddenMembersNum > 0 && (
        <Tooltip content={`${hiddenMembersNum} members more in this group`}>
          <div className="-ml-2 rounded-full bg-indigo-50 w-[25px] h-[25px] text-center text-[10px] font-black flex items-center justify-center">
            {hiddenMembersNum > MAX_MEMBERS_TO_REQUEST_IN_GROUP
              ? `>${MAX_MEMBERS_TO_REQUEST_IN_GROUP}`
              : `+${hiddenMembersNum}`}
          </div>
        </Tooltip>
      )}
    </div>
  );
};

export const ETHSection: FC<{
  desoPublicKey: string;
  provider: ethers.providers.InfuraProvider;
}> = ({ desoPublicKey }) => {
  const [ensName] = useState<string | null>(null);
  const ethAddress = identity.desoAddressToEthereumAddress(desoPublicKey);

  // Disabling ENS name display for now
  // useEffect(() => {
  //   const getENSName = async () => {
  //       const name = await provider.lookupAddress(ethAddress);
  //       setENSName(name);
  //   }
  //   if (ethAddress) {
  //       getENSName();
  //   } else {
  //       setENSName(null);
  //   }
  // }, [ethAddress, provider]);

  return (
    <div className="relative inline-flex align-baseline font-sans text-[10px] font-bold uppercase center leading-none whitespace-nowrap py-1 px-2 rounded-lg select-none bg-blue-900/40 text-blue-200/80">
      <SaveToClipboard text={ensName ? ensName : ethAddress}>
        {ensName ? "ENS" : "ETH"}
        <i className="ml-1">
          {ensName
            ? shortenLongWord(ensName, 6, 6)
            : shortenLongWord(ethAddress, 3, 3)}
        </i>
      </SaveToClipboard>
    </div>
  );
};
