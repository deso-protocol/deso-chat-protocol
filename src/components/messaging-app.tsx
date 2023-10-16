import { Card, CardBody } from "@material-tailwind/react";
import { UserContext } from "contexts/UserContext";
import {
  ChatType,
  DecryptedMessageEntryResponse,
  getPaginatedAccessGroupMembers,
  getPaginatedDMThread,
  getPaginatedGroupChatThread,
  getUsersStateless,
  NewMessageEntryResponse,
  PublicKeyToProfileEntryResponseMap,
} from "deso-protocol";
import { useInterval } from "hooks/useInterval";
import difference from "lodash/difference";
import { FC, useContext, useEffect, useRef, useState } from "react";
import ClipLoader from "react-spinners/ClipLoader";
import { toast } from "react-toastify";
import { RefreshContext } from "../contexts/RefreshContext";
import { useMobile } from "../hooks/useMobile";
import {
  decryptAccessGroupMessagesWithRetry,
  encryptAndSendNewMessage,
  getConversations,
} from "../services/conversations.service";
import {
  BASE_TITLE,
  DEFAULT_KEY_MESSAGING_GROUP_NAME,
  MAX_MEMBERS_IN_GROUP_SUMMARY_SHOWN,
  MAX_MEMBERS_TO_REQUEST_IN_GROUP,
  MESSAGES_ONE_REQUEST_LIMIT,
  PUBLIC_KEY_LENGTH,
  PUBLIC_KEY_PREFIX,
  REFRESH_MESSAGES_INTERVAL_MS,
  REFRESH_MESSAGES_MOBILE_INTERVAL_MS,
  TITLE_DIVIDER,
} from "../utils/constants";
import {
  getChatNameFromConversation,
  hasSetupMessaging,
  scrollContainerToElement,
} from "../utils/helpers";
import { Conversation, ConversationMap } from "../utils/types";
import { ManageMembersDialog } from "./manage-members-dialog";
import { MessagingBubblesAndAvatar } from "./messaging-bubbles";
import { MessagingConversationAccount } from "./messaging-conversation-accounts";
import { MessagingConversationButton } from "./messaging-conversation-button";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { MessagingSetupButton } from "./messaging-setup-button";
import { shortenLongWord } from "./search-users";
import { SendMessageButtonAndInput } from "./send-message-button-and-input";
import { IoCheckmarkCircle } from "react-icons/io5";

export const MockBubble: FC<{
    username: string;
    avatar: string;
    timestamp: string;
    text: string;
    direction: string;
  }> = ({
    username,
    avatar,
    timestamp,
    text,
    direction = "left",
  }) => {
  return (
    <>
      { direction == "receiver" && (
        <div className="flex flex-row items-start gap-3">
          <div className="flex flex-col w-[60px] top-2 relative justify-center items-center">
            <img src={avatar} className="w-[38px] rounded-full mb-2"/>
            <span className="whitespace-nowrap text-xs text-blue-100/30">{timestamp}</span>
          </div>
          <div className="flex flex-col items-start">
            <div className="mb-2 text-blue-300/80 text-xs">{username}</div>
            <div className="text-xs w-auto bg-blue-200/20 rounded-2xl rounded-tl-none rounded-bl-xl pl-5 mt-auto mb-2 md:mb-5 py-2 px-2 md:px-4 text-white break-words flex text-left relative items-center">
              <div className="text-white text-sm">{text}</div>
            </div>
          </div>
        </div>
      )}
      { direction == "sender" && (
        <div className="flex flex-row-reverse items-start gap-3">
          <div className="flex flex-col w-[60px] justify-center items-center">
            <img src={avatar} className="w-[38px] rounded-full mb-2"/>
            <span className="whitespace-nowrap text-xs text-blue-100/30">{timestamp}</span>
          </div>
          <div className="flex flex-col items-end">
            <div className="mb-2 text-blue-300/80 text-xs">{username}</div>
            <div className="bg-blue-900/70 text-blue-100 rounded-2xl rounded-tr-none rounded-br-xl pl-5 mt-auto mb-2 md:mb-5 py-2 px-2 md:px-4 break-words inline-flex text-left relative items-center">
              <div className="text-white text-sm">{text}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const MessagingApp: FC = () => {
  const { appUser, isLoadingUser, allAccessGroups, setAllAccessGroups } =
    useContext(UserContext);
  const { lockRefresh, setLockRefresh } = useContext(RefreshContext);
  const [usernameByPublicKeyBase58Check, setUsernameByPublicKeyBase58Check] =
    useState<{ [key: string]: string }>({});
  const [autoFetchConversations, setAutoFetchConversations] = useState(false);
  const [pubKeyPlusGroupName, setPubKeyPlusGroupName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [selectedConversationPublicKey, setSelectedConversationPublicKey] =
    useState("");
  const [conversations, setConversations] = useState<ConversationMap>({});
  const [membersByGroupKey, setMembersByGroupKey] = useState<{
    [groupKey: string]: PublicKeyToProfileEntryResponseMap;
  }>({});
  const { isMobile } = useMobile();

  // Dependencies of useInterval must use `useRef` to get the most recent state
  const lockRefreshRef = useRef(lockRefresh); // reference to lockRefresh that keeps current state in setInterval
  const selectedConversationPublicKeyRef = useRef(
    selectedConversationPublicKey
  );

  useEffect(() => {
    lockRefreshRef.current = lockRefresh;
    selectedConversationPublicKeyRef.current = selectedConversationPublicKey;
  });

  useEffect(() => {
    if (!appUser) return;
    if (hasSetupMessaging(appUser)) {
      setLoading(true);
      setAutoFetchConversations(true);
      rehydrateConversation("", false, !isMobile, isLoadingUser);
    } else {
      setLoading(false);
    }
  }, [appUser, isMobile]);

  useEffect(() => {
    setSelectedConversationPublicKey("");
    setLockRefresh(isLoadingUser);
    if (isLoadingUser && appUser) {
      setLoading(true);
    }
  }, [isLoadingUser, appUser]);

  useEffect(() => {
    if (conversations[selectedConversationPublicKey]) {
      const chatName = getChatNameFromConversation(
        conversations[selectedConversationPublicKey],
        usernameByPublicKeyBase58Check
      );

      if (chatName) {
        document.title = [chatName, BASE_TITLE].join(TITLE_DIVIDER);
      }
    }

    return () => {
      document.title = BASE_TITLE;
    };
  }, [
    selectedConversationPublicKey,
    conversations,
    usernameByPublicKeyBase58Check,
  ]);

  useInterval(
    async () => {
      const initConversationKey = selectedConversationPublicKey;

      if (
        !appUser ||
        !selectedConversationPublicKey ||
        lockRefreshRef.current ||
        !navigator.onLine
      ) {
        return;
      }
      const { conversations, updatedAllAccessGroups } = await getConversations(
        appUser.PublicKeyBase58Check,
        allAccessGroups
      );
      setAllAccessGroups(updatedAllAccessGroups);
      const { updatedConversations, pubKeyPlusGroupName } =
        await getConversation(selectedConversationPublicKey, {
          ...conversations,
          [selectedConversationPublicKey]:
            conversations[selectedConversationPublicKey],
        });

      if (
        !lockRefreshRef.current &&
        conversations[selectedConversationPublicKey] &&
        initConversationKey === selectedConversationPublicKeyRef.current
      ) {
        // Live updates to the current conversation.
        // We get the last processed message and inject the unread messages into existing conversation
        setConversations((conversations) => {
          const currentMessages =
            conversations[selectedConversationPublicKey].messages;

          // This takes the last processed message, meaning we filter out mocked messages sent by current user
          const lastProcessedMessageIdx = currentMessages.findIndex(
            (e) => e.MessageInfo.TimestampNanosString
          );

          const updatedMessages =
            updatedConversations[selectedConversationPublicKey].messages;
          const lastProcessedMessageIdxInUpdated = currentMessages[
            lastProcessedMessageIdx
          ]
            ? updatedMessages.findIndex(
                (e) =>
                  e.MessageInfo.TimestampNanosString ===
                  currentMessages[lastProcessedMessageIdx].MessageInfo
                    .TimestampNanosString
              )
            : -1;

          const unreadMessages =
            lastProcessedMessageIdxInUpdated > 0
              ? updatedMessages.slice(0, lastProcessedMessageIdxInUpdated)
              : [];

          return {
            ...updatedConversations,
            [selectedConversationPublicKey]: {
              ...conversations[selectedConversationPublicKey],
              messages: [
                ...unreadMessages,
                ...conversations[selectedConversationPublicKey].messages.slice(
                  lastProcessedMessageIdx
                ),
              ],
            },
          };
        });
        setPubKeyPlusGroupName(pubKeyPlusGroupName);
      }
    },
    isMobile
      ? REFRESH_MESSAGES_MOBILE_INTERVAL_MS
      : REFRESH_MESSAGES_INTERVAL_MS
  );

  const fetchUsersStateless = async (newPublicKeysToGet: Array<string>) => {
    const diff = difference(
      newPublicKeysToGet,
      Object.keys(usernameByPublicKeyBase58Check)
    );

    if (diff.length === 0) {
      return Promise.resolve(usernameByPublicKeyBase58Check);
    }

    return getUsersStateless({
      PublicKeysBase58Check: Array.from(newPublicKeysToGet),
      SkipForLeaderboard: true,
    }).then((usersStatelessResponse) => {
      const newPublicKeyToUsernames: { [k: string]: string } = {};

      (usersStatelessResponse.UserList || []).forEach((u) => {
        newPublicKeyToUsernames[u.PublicKeyBase58Check] =
          u.ProfileEntryResponse?.Username || "";
      });

      setUsernameByPublicKeyBase58Check((state) => ({
        ...state,
        ...newPublicKeyToUsernames,
      }));
      return usernameByPublicKeyBase58Check;
    });
  };

  const fetchGroupMembers = async (conversation: Conversation) => {
    if (conversation.ChatType !== ChatType.GROUPCHAT) {
      return;
    }

    const { AccessGroupKeyName, OwnerPublicKeyBase58Check } =
      conversation.messages[0].RecipientInfo;

    const { PublicKeyToProfileEntryResponse } =
      await getPaginatedAccessGroupMembers({
        AccessGroupOwnerPublicKeyBase58Check: OwnerPublicKeyBase58Check,
        AccessGroupKeyName,
        MaxMembersToFetch:
          MAX_MEMBERS_TO_REQUEST_IN_GROUP + MAX_MEMBERS_IN_GROUP_SUMMARY_SHOWN,
      });

    setMembersByGroupKey((state) => ({
      ...state,
      [`${OwnerPublicKeyBase58Check}${AccessGroupKeyName}`]:
        PublicKeyToProfileEntryResponse,
    }));
    const usernamesByPublicKeyFromGroup = Object.keys(chatMembers || {}).reduce(
      (acc, curr) => ({ ...acc, [curr]: chatMembers[curr]?.Username || "" }),
      {}
    );
    setUsernameByPublicKeyBase58Check((state) => ({
      ...state,
      ...usernamesByPublicKeyFromGroup,
    }));

    return PublicKeyToProfileEntryResponse;
  };

  const rehydrateConversation = async (
    selectedKey = "",
    autoScroll = false,
    selectConversation = true,
    userChange = false
  ) => {
    if (!appUser) {
      toast.error("You must be logged in to use this feature");
      return;
    }
    const {
      conversations,
      publicKeyToProfileEntryResponseMap,
      updatedAllAccessGroups,
    } = await getConversations(appUser.PublicKeyBase58Check, allAccessGroups);
    setAllAccessGroups(updatedAllAccessGroups);
    let conversationsResponse = conversations || {};
    const keyToUse =
      selectedKey ||
      (!userChange && selectedConversationPublicKey) ||
      Object.keys(conversationsResponse)[0];

    if (!conversationsResponse[keyToUse]) {
      // This is just to make the search bar work. we have 0 messages in this thread originally.
      conversationsResponse = {
        [keyToUse]: {
          ChatType: ChatType.DM,
          firstMessagePublicKey: keyToUse.slice(0, PUBLIC_KEY_LENGTH),
          messages: [],
        },
        ...conversationsResponse,
      };
    }

    const DMChats = Object.values(conversationsResponse).filter(
      (e) => e.ChatType === ChatType.DM
    );
    const GroupChats = Object.values(conversationsResponse).filter(
      (e) => e.ChatType === ChatType.GROUPCHAT
    );

    const publicKeyToUsername: { [k: string]: string } = {};
    Object.entries(publicKeyToProfileEntryResponseMap).forEach(
      ([publicKey, profileEntryResponse]) =>
        (publicKeyToUsername[publicKey] = profileEntryResponse?.Username || "")
    );
    setUsernameByPublicKeyBase58Check((state) => ({
      ...state,
      ...publicKeyToUsername,
    }));
    await updateUsernameToPublicKeyMapFromConversations(DMChats);
    await Promise.all(GroupChats.map((e) => fetchGroupMembers(e)));

    if (selectConversation) {
      // This is mostly used to control "chats view" vs "messages view" on mobile
      setSelectedConversationPublicKey(keyToUse);
    }
    setLoadingConversation(true);

    try {
      const { updatedConversations, pubKeyPlusGroupName } =
        await getConversation(keyToUse, conversationsResponse);
      setConversations(updatedConversations);
      setPubKeyPlusGroupName(pubKeyPlusGroupName);
    } catch (e) {
      toast.error(`Error fetching current conversation: ${e}`);
      console.error(e);
    } finally {
      setLoadingConversation(false);
      setLoading(false);
    }

    setAutoFetchConversations(false);

    if (autoScroll) {
      scrollContainerToElement(".conversations-list", ".selected-conversation");
    }
  };

  const updateUsernameToPublicKeyMapFromConversations = async (
    DMChats: Conversation[]
  ) => {
    const newPublicKeysToGet = new Set<string>();
    DMChats.map((e) => {
      newPublicKeysToGet.add(e.firstMessagePublicKey);
      e.messages.forEach((m: NewMessageEntryResponse) => {
        newPublicKeysToGet.add(m.RecipientInfo.OwnerPublicKeyBase58Check);
        newPublicKeysToGet.add(m.SenderInfo.OwnerPublicKeyBase58Check);
      });
    });
    return await fetchUsersStateless(Array.from(newPublicKeysToGet));
  };

  // TODO: add support pagination
  const getConversation = async (
    pubKeyPlusGroupName: string,
    currentConversations = conversations
  ): Promise<{
    updatedConversations: ConversationMap;
    pubKeyPlusGroupName: string;
  }> => {
    if (!appUser) {
      toast.error("You must be logged in to use this feature");
      return { updatedConversations: {}, pubKeyPlusGroupName: "" };
    }

    const currentConvo = currentConversations[pubKeyPlusGroupName];
    if (!currentConvo) {
      return { updatedConversations: {}, pubKeyPlusGroupName: "" };
    }
    const convo = currentConvo.messages;

    if (currentConvo.ChatType === ChatType.DM) {
      const messages = await getPaginatedDMThread({
        UserGroupOwnerPublicKeyBase58Check: appUser.PublicKeyBase58Check,
        UserGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
        PartyGroupOwnerPublicKeyBase58Check: currentConvo.firstMessagePublicKey,
        PartyGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
        MaxMessagesToFetch: MESSAGES_ONE_REQUEST_LIMIT,
        StartTimeStamp: new Date().valueOf() * 1e6,
      });

      const { decrypted, updatedAllAccessGroups } =
        await decryptAccessGroupMessagesWithRetry(
          appUser.PublicKeyBase58Check,
          messages.ThreadMessages,
          allAccessGroups
        );

      setAllAccessGroups(updatedAllAccessGroups);

      const updatedConversations = {
        ...currentConversations,
        ...{
          [pubKeyPlusGroupName]: {
            firstMessagePublicKey: decrypted.length
              ? decrypted[0].IsSender
                ? decrypted[0].RecipientInfo.OwnerPublicKeyBase58Check
                : decrypted[0].SenderInfo.OwnerPublicKeyBase58Check
              : currentConvo.firstMessagePublicKey,
            messages: decrypted,
            ChatType: ChatType.DM,
          },
        },
      };

      if (
        currentConvo &&
        currentConvo.firstMessagePublicKey &&
        usernameByPublicKeyBase58Check[currentConvo.firstMessagePublicKey] ===
          undefined
      ) {
        await fetchUsersStateless([currentConvo.firstMessagePublicKey]);
      }

      return {
        updatedConversations,
        pubKeyPlusGroupName,
      };
    } else {
      if (!convo) {
        return {
          updatedConversations: {},
          pubKeyPlusGroupName,
        };
      }
      const firstMessage = convo[0];
      const messages = await getPaginatedGroupChatThread({
        UserPublicKeyBase58Check:
          firstMessage.RecipientInfo.OwnerPublicKeyBase58Check,
        AccessGroupKeyName: firstMessage.RecipientInfo.AccessGroupKeyName,
        StartTimeStamp: firstMessage.MessageInfo.TimestampNanos * 10,
        MaxMessagesToFetch: MESSAGES_ONE_REQUEST_LIMIT,
      });

      const { decrypted, updatedAllAccessGroups } =
        await decryptAccessGroupMessagesWithRetry(
          appUser.PublicKeyBase58Check,
          messages.GroupChatMessages,
          allAccessGroups
        );
      setAllAccessGroups(updatedAllAccessGroups);

      const updatedConversations = {
        ...currentConversations,
        ...{
          [pubKeyPlusGroupName]: {
            firstMessagePublicKey:
              firstMessage.RecipientInfo.OwnerPublicKeyBase58Check,
            messages: decrypted,
            ChatType: ChatType.GROUPCHAT,
          },
        },
      };

      return {
        updatedConversations,
        pubKeyPlusGroupName,
      };
    }
  };

  const getCurrentChatName = () => {
    if (!selectedConversation || !Object.keys(activeChatUsersMap).length) {
      return "";
    }

    const name = getChatNameFromConversation(
      selectedConversation,
      activeChatUsersMap
    );
    return (
      name ||
      shortenLongWord(
        selectedConversation.messages.length
          ? selectedConversation.messages[0].RecipientInfo
              .OwnerPublicKeyBase58Check
          : selectedConversation.firstMessagePublicKey
      ) ||
      ""
    );
  };

  const conversationsReady = Object.keys(conversations).length > 0;
  const selectedConversation = conversations[selectedConversationPublicKey];
  const isGroupChat = selectedConversation?.ChatType === ChatType.GROUPCHAT;
  const isChatOwner =
    isGroupChat &&
    appUser &&
    selectedConversation?.messages[0]?.RecipientInfo
      ?.OwnerPublicKeyBase58Check === appUser.PublicKeyBase58Check;
  const isGroupOwner = isGroupChat && isChatOwner;
  const chatMembers = membersByGroupKey[selectedConversationPublicKey];
  const activeChatUsersMap = isGroupChat
    ? Object.keys(chatMembers || {}).reduce(
        (acc, curr) => ({ ...acc, [curr]: chatMembers[curr]?.Username || "" }),
        {}
      )
    : usernameByPublicKeyBase58Check;
  return (
    <div className="h-full">      
      {(!conversationsReady ||
        !hasSetupMessaging(appUser) ||
        isLoadingUser ||
        loading) && (
        <div className="m-auto relative top-8 overflow-hidden pt-[30px] pb-[50px]">
          <div className="bg-gradient"></div>
          <Card className="w-full lg:max-w-[1200px] m-auto bg-transparent p-0 shadow-none">
            <CardBody>
              {(autoFetchConversations || isLoadingUser || loading) && (
                <div className="text-center">
                  <span className="font-bold text-white text-xl">
                    Loading Your Chat Experience
                  </span>
                  <br />
                  <ClipLoader
                    color={"#0d3679"}
                    loading={true}
                    size={44}
                    className="mt-4"
                  />
                </div>
              )}
              {!autoFetchConversations &&
                !hasSetupMessaging(appUser) &&
                !isLoadingUser &&
                !loading && (
                  <div className="text-left flex flex-col lg:flex-row items-center justify-between">
                    <div className="w-full lg:w-[50%]">
                      <div>
                        {appUser ? (
                          <div>
                            <h2 className="text-2xl font-bold mb-3 text-white">
                              Set up your account
                            </h2>
                            <p className="text-lg mb-6 text-blue-300/60">
                              It seems like your account needs more configuration
                              to be able to send messages. Press the button below
                              to set it up automatically
                            </p>
                          </div>
                        ) : (
                          <div className="text-left w-full md:max-w-[100%]">
                            <h2 className="text-3xl lg:text-3xl font-semibold mb-6 text-white">
                              Chat with anyone, on DeSo or Ethereum. Without the risk of being censored.
                            </h2>
                            <p className="text-sm mb-5 text-blue-300/60">
                              DeSo Chat Protocol is a censorship-resistant messaging
                              protocol built on top of the DeSo blockchain. It enables fully decentralized cross-chain 
                              messaging between DeSo and Ethereum wallets (and soon, Solana). 
                            </p>
                            <p className="text-sm mb-5 text-blue-300/60">
                              This is possible due to DeSo's infinite-state blockchain & derived keys cryptography.
                            </p>
                            <p className="text-sm mb-5 text-blue-300/60">
                              Messages are stored directly on-chain, at an average cost of ~$0.000002 (<em>basically free</em>), with end-to-end encryption, and support for DMs & group chats — including fully on-chain social, identity, creator coins, tokens & NFTs.
                            </p>                            
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mb-6 text-green-500">
                          <div className="flex items-center gap-2"><IoCheckmarkCircle className="text-xl"/> E2EE messages & group chats</div>
                          <div className="flex items-center gap-2"><IoCheckmarkCircle className="text-xl"/> 100% on-chain (fully synced)</div>
                          <div className="flex items-center gap-2"><IoCheckmarkCircle className="text-xl"/> Sign in with DeSo & MetaMask</div>
                          <div className="flex items-center gap-2"><IoCheckmarkCircle className="text-xl"/> Message DeSo & Ethereum wallets</div>
                          <div className="flex items-center gap-2"><IoCheckmarkCircle className="text-xl"/> Open-source & built on DeSo</div>
                          <div className="flex items-center gap-2"><IoCheckmarkCircle className="text-xl"/> On-chain social, identity & assets</div>
                      </div>
                      <MessagingSetupButton />
                      <p className="mt-5 text-sm mb-5 text-blue-300/40">
                        This project is fully open-sourced for developers to fork & build on top of.
                        You can add features like ENS support, NFT profile pictures, message tipping, paid DMs, token-gated group chats and more. 
                        Visit&nbsp;
                        <a
                          target="_blank"
                          className="underline text-blue-300/40 hover:text-blue-300"
                          href="https://github.com/deso-protocol/deso-chat-protocol"
                          rel="noreferrer"
                        >
                          Github Repository &rarr;
                        </a> or&nbsp;
                        <a
                          target="_blank"
                          className="underline text-blue-300/40 hover:text-blue-300"
                          href="https://github.com/deso-protocol/deso-chat-protocol"
                          rel="noreferrer"
                        >
                          Developer Docs &rarr;
                        </a>
                      </p>
                    </div>
                    <div className="w-full lg:-mt-12 lg:w-[35%] border border-blue-400/40 iphone-container flex flex-col justify-between">
                      <div className="w-full rounded-tr-[40px] rounded-tl-[40px] bg-blue-900/20 flex items-center text-center justify-center border-b border-b-blue-400/20 p-2">
                        <div className="text-sm text-blue-400/40">
                          Founding Fathers (Group Chat)
                        </div>
                      </div>
                      <div className="p-6 bg-black/30">
                        <MockBubble
                          username="@MrWashington.deso"
                          text="Gents, please have a taste of freedom."
                          timestamp="9:40pm"
                          avatar="/assets/avatar-george.png"
                          direction="receiver"
                        />
                        <MockBubble
                          username="@ThomasJefferson.eth"
                          text="With liberty & justice for all my frens."
                          timestamp="9:44pm"
                          avatar="/assets/avatar-jefferson.png"
                          direction="receiver"
                        />
                        <MockBubble
                          username="@BenFranklin.eth"
                          text="💯"
                          timestamp="10:23pm"
                          avatar="/assets/avatar-ben.png"
                          direction="receiver"
                        />
                        <MockBubble
                          username="@SamuelAdams.deso"
                          text="yooo 🍺"
                          timestamp="10:26pm"
                          avatar="/assets/avatar-sam.png"
                          direction="receiver"
                        />
                        <MockBubble
                          username="@hamilton.deso"
                          text="The sacred rights of mankind are not to be rummaged for among old parchments or musty records. They are written, as with a sunbeam, in the whole volume of human nature, by the hand of the divinity itself; and can never be erased or obscured by mortal power."
                          timestamp="10:44pm"
                          avatar="/assets/avatar-hamilton.png"
                          direction="sender"
                        />
                         <MockBubble
                          username="@BenFranklin.eth"
                          text="1) What"
                          timestamp="10:45pm"
                          avatar="/assets/avatar-ben.png"
                          direction="receiver"
                        />
                      </div>
                      <div className="w-full flex items-end text-center justify-end border-t border-t-blue-400/20 py-4 px-6">
                        <div className="text-sm text-blue-600/40 w-full relative">
                          <input type="text" className="w-full border-0 bg-blue-900/20 rounded-full px-4 py-2 text-sm text-blue-100/70" placeholder="Send message..."/>
                          <button className="absolute z-4 right-2 top-[6px]"><img src="/assets/send.png" className="bg-blue-400/30 rounded-full h-6 w-6 p-1"/></button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              {!autoFetchConversations &&
                hasSetupMessaging(appUser) &&
                !isLoadingUser &&
                !loading && (
                  <MessagingConversationButton
                    onClick={rehydrateConversation}
                  />
                )}
            </CardBody>
          </Card>
        </div>
      )}
      {hasSetupMessaging(appUser) &&
        conversationsReady &&
        appUser &&
        !isLoadingUser &&
        !loading && (
          <div className="flex h-full border-t border-blue-300/20">
            <Card className="w-full md:w-[400px] border-r border-blue-800/30 bg-black/40 rounded-none border-solid shrink-0">
              <MessagingConversationAccount
                rehydrateConversation={rehydrateConversation}
                onClick={async (key: string) => {
                  if (key === selectedConversationPublicKey) {
                    return;
                  }
                  setSelectedConversationPublicKey(key);

                  setLoadingConversation(true);
                  setLockRefresh(true);

                  try {
                    const { updatedConversations, pubKeyPlusGroupName } =
                      await getConversation(key);
                    setConversations(updatedConversations);
                    setPubKeyPlusGroupName(pubKeyPlusGroupName);
                  } finally {
                    setLoadingConversation(false);
                    setLockRefresh(false);
                  }
                }}
                membersByGroupKey={membersByGroupKey}
                conversations={conversations}
                getUsernameByPublicKeyBase58Check={
                  usernameByPublicKeyBase58Check
                }
                selectedConversationPublicKey={selectedConversationPublicKey}
              />
            </Card>

            <div
              className={`w-full md:w-[calc(100vw-400px)] bg-[#050e1d] md:ml-0 md:z-auto ${
                selectedConversationPublicKey ? "ml-[-100%] z-50" : ""
              }`}
            >
              <header
                className={`flex justify-between ${
                  !isGroupChat ? "md:hidden" : ""
                } items-center border-b border-t border-blue-200/20 relative px-5 md:px-4 h-[69px]`}
              >
                <div
                  className="cursor-pointer py-4 pl-0 pr-6 md:hidden"
                  onClick={() => {
                    setSelectedConversationPublicKey("");
                  }}
                >
                  <img src="/assets/left-chevron.png" width={20} alt="back" />
                </div>
                {selectedConversation &&
                  (selectedConversation.messages[0] ||
                    (!isGroupChat &&
                      selectedConversation.firstMessagePublicKey)) && (
                    <div className="text-white font-bold text-lg truncate px-2 md:hidden">
                      {!isGroupChat &&
                      !getCurrentChatName().startsWith(PUBLIC_KEY_PREFIX)
                        ? "@"
                        : ""}
                      {getCurrentChatName()}
                    </div>
                  )}
                <div
                  className={`text-blue-300/70 items-center hidden ${
                    isGroupOwner ? "md:block" : "md:hidden"
                  }`}
                >
                  You're the<strong> owner of this group</strong>
                </div>
                <div
                  className={`flex justify-end ${
                    !isGroupOwner ? "md:w-full" : ""
                  }`}
                >
                  {isGroupChat ? (
                    <ManageMembersDialog
                      conversation={selectedConversation}
                      onSuccess={rehydrateConversation}
                      isGroupOwner={!!isGroupOwner}
                    />
                  ) : (
                    selectedConversation &&
                    selectedConversation.firstMessagePublicKey && (
                      <MessagingDisplayAvatar
                        username={
                          activeChatUsersMap[
                            selectedConversation.firstMessagePublicKey
                          ]
                        }
                        publicKey={selectedConversation.firstMessagePublicKey}
                        diameter={40}
                      />
                    )
                  )}
                </div>
              </header>

              <Card
                className={`pr-2 rounded-none w-[100%] bg-transparent ml-[calc-400px] pb-0 h-[calc(100%-69px)] ${
                  isGroupChat ? "" : "md:h-full"
                }`}
              >
                <div className="border-none flex flex-col justify-between h-full">
                  <div className="max-h-[calc(100%-130px)] overflow-hidden">
                    {loadingConversation ? (
                      <ClipLoader
                        color={"#0d3679"}
                        loading={true}
                        size={44}
                        className="mt-4"
                      />
                    ) : (
                      <MessagingBubblesAndAvatar
                        conversationPublicKey={pubKeyPlusGroupName}
                        conversations={conversations}
                        getUsernameByPublicKey={activeChatUsersMap}
                        onScroll={(e: Array<DecryptedMessageEntryResponse>) => {
                          setConversations((prev) => ({
                            ...prev,
                            [selectedConversationPublicKey]: {
                              ...prev[selectedConversationPublicKey],
                              messages: [
                                ...prev[selectedConversationPublicKey].messages,
                                ...e,
                              ],
                            },
                          }));
                        }}
                      />
                    )}
                  </div>

                  <SendMessageButtonAndInput
                    key={selectedConversationPublicKey}
                    onClick={async (messageToSend: string) => {
                      // Generate a mock message to display in the UI to give
                      // the user immediate feedback.
                      const TimestampNanos = new Date().getTime() * 1e6;
                      const recipientPublicKey =
                        selectedConversation.ChatType === ChatType.DM
                          ? selectedConversation.firstMessagePublicKey
                          : selectedConversation.messages[0].RecipientInfo
                              .OwnerPublicKeyBase58Check;
                      const recipientAccessGroupKeyName =
                        selectedConversation.ChatType === ChatType.DM
                          ? DEFAULT_KEY_MESSAGING_GROUP_NAME
                          : selectedConversation.messages[0].RecipientInfo
                              .AccessGroupKeyName;
                      const mockMessage = {
                        DecryptedMessage: messageToSend,
                        IsSender: true,
                        SenderInfo: {
                          OwnerPublicKeyBase58Check:
                            appUser.PublicKeyBase58Check,
                          AccessGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
                        },
                        RecipientInfo: {
                          OwnerPublicKeyBase58Check: recipientPublicKey,
                          AccessGroupKeyName: recipientAccessGroupKeyName,
                        },
                        MessageInfo: {
                          TimestampNanos,
                        },
                      } as DecryptedMessageEntryResponse;
                      // Put this new message into the conversations object.
                      const oldMessages =
                        conversations[selectedConversationPublicKey].messages;
                      const newMessages = [mockMessage, ...oldMessages];
                      setConversations((prevConversations) => ({
                        ...prevConversations,
                        [selectedConversationPublicKey]: {
                          ...prevConversations[selectedConversationPublicKey],
                          messages: newMessages,
                        },
                      }));
                      setLockRefresh(true);

                      try {
                        // Try sending the message
                        await encryptAndSendNewMessage(
                          messageToSend,
                          appUser.PublicKeyBase58Check,
                          recipientPublicKey,
                          recipientAccessGroupKeyName,
                          DEFAULT_KEY_MESSAGING_GROUP_NAME
                        );
                      } catch (e: any) {
                        // If we fail to send the message for any reason, remove the mock message
                        // by shifting the newMessages array and then updating the conversations
                        // object.
                        newMessages.shift();
                        setConversations((prevConversations) => ({
                          ...prevConversations,
                          [selectedConversationPublicKey]: {
                            ...prevConversations[selectedConversationPublicKey],
                            messages: newMessages,
                          },
                        }));
                        toast.error(
                          `An error occurred while sending your message. Error: ${e.toString()}`
                        );
                        // Rethrow the error so that the caller can handle it.
                        return Promise.reject(e);
                      } finally {
                        setLockRefresh(false);
                      }
                    }}
                  />
                </div>
              </Card>
            </div>
          </div>
        )}
    </div>
  );
};


