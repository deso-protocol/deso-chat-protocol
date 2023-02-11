import { Card, CardBody } from "@material-tailwind/react";
import { UserContext } from "contexts/UserContext";
import {
  ChatType,
  DecryptedMessageEntryResponse,
  NewMessageEntryResponse,
  PublicKeyToProfileEntryResponseMap,
} from "deso-protocol-types";
import difference from "lodash/difference";
import { FC, useContext, useEffect, useRef, useState } from "react";
import ClipLoader from "react-spinners/ClipLoader";
import { toast } from "react-toastify";
import { desoAPI } from "services/desoAPI.service";
import { useMobile } from "../hooks/useMobile";
import {
  decryptAccessGroupMessages,
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
import { useInterval } from "hooks/useInterval";
import { RefreshContext } from "../contexts/RefreshContext";
import { SendMessageButtonAndInput } from "./send-message-button-and-input";

export const MessagingApp: FC = () => {
  const { appUser, isLoadingUser } = useContext(UserContext);
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
  const lockRefreshRef = useRef(lockRefresh); // reference to lockRefresh that keeps current state in setInterval

  useEffect(() => {
    lockRefreshRef.current = lockRefresh;
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
      if (
        !appUser ||
        !selectedConversationPublicKey ||
        lockRefreshRef.current
      ) {
        return;
      }

      const [res] = await getConversations(appUser.PublicKeyBase58Check);
      const { updatedConversations, pubKeyPlusGroupName } =
        await getConversation(selectedConversationPublicKey, {
          ...res,
          [selectedConversationPublicKey]:
            conversations[selectedConversationPublicKey],
        });

      if (
        !lockRefreshRef.current &&
        conversations[selectedConversationPublicKey]
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

    return await desoAPI.user
      .getUsersStateless({
        PublicKeysBase58Check: Array.from(newPublicKeysToGet),
        SkipForLeaderboard: true,
      })
      .then((usersStatelessResponse) => {
        const newPublicKeyToUsernames: { [k: string]: string } = {};

        (usersStatelessResponse.UserList || []).forEach((u) => {
          if (u.ProfileEntryResponse?.Username) {
            newPublicKeyToUsernames[u.PublicKeyBase58Check] =
              u.ProfileEntryResponse.Username;
          }
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
      await desoAPI.accessGroup.GetPaginatedAccessGroupMembers({
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
    const [res, publicKeyToProfileEntryResponseMap] = await getConversations(
      appUser.PublicKeyBase58Check
    );
    let conversationsResponse = res || {};
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
    await Promise.all(
      DMChats.map((e) =>
        updateUsernameToPublicKeyMapFromMessages(
          e.messages,
          e.firstMessagePublicKey
        )
      )
    );
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

  const updateUsernameToPublicKeyMapFromMessages = async (
    messages: NewMessageEntryResponse[],
    firstMessagePublicKey: string
  ) => {
    const newPublicKeysToGet = new Set<string>([firstMessagePublicKey]);

    messages.forEach((m: NewMessageEntryResponse) => {
      newPublicKeysToGet.add(m.RecipientInfo.OwnerPublicKeyBase58Check);
      newPublicKeysToGet.add(m.SenderInfo.OwnerPublicKeyBase58Check);
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

    const myAccessGroups = await desoAPI.accessGroup.GetAllUserAccessGroups({
      PublicKeyBase58Check: appUser.PublicKeyBase58Check,
    });
    const allMyAccessGroups = Array.from(
      new Set([
        ...(myAccessGroups.AccessGroupsOwned || []),
        ...(myAccessGroups.AccessGroupsMember || []),
      ])
    );

    if (currentConvo.ChatType === ChatType.DM) {
      const messages =
        await desoAPI.accessGroup.GetPaginatedMessagesForDmThread({
          UserGroupOwnerPublicKeyBase58Check: appUser.PublicKeyBase58Check,
          UserGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
          PartyGroupOwnerPublicKeyBase58Check:
            currentConvo.firstMessagePublicKey,
          PartyGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
          MaxMessagesToFetch: MESSAGES_ONE_REQUEST_LIMIT,
          StartTimeStamp: new Date().valueOf() * 1e6,
        });

      const decrypted = await decryptAccessGroupMessages(
        messages.ThreadMessages,
        allMyAccessGroups
      );

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
      const messages =
        await desoAPI.accessGroup.GetPaginatedMessagesForGroupChatThread({
          UserPublicKeyBase58Check:
            firstMessage.RecipientInfo.OwnerPublicKeyBase58Check,
          AccessGroupKeyName: firstMessage.RecipientInfo.AccessGroupKeyName,
          StartTimeStamp: firstMessage.MessageInfo.TimestampNanos * 10,
          MaxMessagesToFetch: MESSAGES_ONE_REQUEST_LIMIT,
        });

      const decrypted = await decryptAccessGroupMessages(
        messages.GroupChatMessages,
        allMyAccessGroups
      );

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
        selectedConversation.messages[0].RecipientInfo.OwnerPublicKeyBase58Check
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
    ? Object.keys(chatMembers).reduce(
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
        <div className="py-20">
          <Card className="w-full md:w-[600px] m-auto p-8 bg-blue-900/10 backdrop-blur-xl">
            <CardBody>
              {(autoFetchConversations || isLoadingUser || loading) && (
                <div className="text-center">
                  <span className="font-bold text-white text-xl">
                    Loading Your Chat Experience
                  </span>
                  <br />
                  <ClipLoader
                    color={"#6d4800"}
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
                  <>
                    <div>
                      {appUser ? (
                        <div>
                          <h2 className="text-2xl font-bold mb-3 text-white">
                            Set up your account
                          </h2>
                          <p className="text-lg mb-5 text-blue-300/60">
                            It seems like your account needs more configuration
                            to be able to send messages. Press the button below
                            to set it up automatically
                          </p>
                        </div>
                      ) : (
                        <div>
                          <h2 className="text-2xl font-bold mb-3 text-white">
                            DeSo Chat Protocol
                          </h2>
                          <p className="text-lg mb-3 text-blue-300/60">
                            Censorship-resistant and fully on-chain messaging
                            protocol — with end-to-end encrypted messaging
                            support for direct messages and group chats.
                          </p>
                          <p className="mb-5 text-lg text-blue-300/60">
                            A truly{" "}
                            <strong className="text-blue-200">
                              first-of-its kind.
                            </strong>
                          </p>
                        </div>
                      )}
                    </div>

                    <MessagingSetupButton />
                  </>
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
          <div className="flex h-full">
            <Card className="w-full md:w-[400px] border-r border-blue-800/30 bg-black/40 rounded-none border-solid shrink-0">
              <MessagingConversationAccount
                rehydrateConversation={rehydrateConversation}
                onClick={async (key: string) => {
                  if (key === selectedConversationPublicKey) {
                    return;
                  }
                  setSelectedConversationPublicKey(key);

                  setLoadingConversation(true);

                  try {
                    const { updatedConversations, pubKeyPlusGroupName } =
                      await getConversation(key);
                    setConversations(updatedConversations);
                    setPubKeyPlusGroupName(pubKeyPlusGroupName);
                  } finally {
                    setLoadingConversation(false);
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
                } items-center relative px-5 md:px-4 h-[69px]`}
              >
                <div
                  className="cursor-pointer py-4 pl-0 pr-6 md:hidden"
                  onClick={() => {
                    setSelectedConversationPublicKey("");
                  }}
                >
                  <img src="/assets/left-chevron.png" width={20} alt="back" />
                </div>
                {selectedConversation && selectedConversation.messages[0] && (
                  <div className="text-white font-bold text-lg truncate px-2 md:hidden">
                    {!isGroupChat &&
                    !getCurrentChatName().startsWith(PUBLIC_KEY_PREFIX)
                      ? "@"
                      : ""}
                    {getCurrentChatName()}
                  </div>
                )}
                <div
                  className={`text-blue-300/70 hidden ${
                    isGroupOwner ? "md:block" : "md:hidden"
                  }`}
                >
                  You're the<b> owner of this group</b>
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
                    selectedConversation.messages[0] && (
                      <MessagingDisplayAvatar
                        username={
                          activeChatUsersMap[
                            selectedConversation.messages[0].RecipientInfo
                              .OwnerPublicKeyBase58Check as string
                          ]
                        }
                        publicKey={
                          selectedConversation.messages[0].RecipientInfo
                            .OwnerPublicKeyBase58Check
                        }
                        diameter={40}
                      />
                    )
                  )}
                </div>
              </header>

              <Card
                className={`p-4 pr-2 rounded-none w-[100%] bg-transparent ml-[calc-400px] pb-0 h-[calc(100%-69px)] ${
                  isGroupOwner ? "" : "md:h-full"
                }`}
              >
                <div className="border-none flex flex-col justify-between h-full">
                  <div className="max-h-[calc(100%-130px)] overflow-hidden">
                    {loadingConversation ? (
                      <ClipLoader
                        color={"#6d4800"}
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
