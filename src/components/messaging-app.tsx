import { Card, CardBody } from "@material-tailwind/react";
import { UserContext } from "contexts/UserContext";
import {
  ChatType,
  DecryptedMessageEntryResponse,
  NewMessageEntryResponse,
  PublicKeyToProfileEntryResponseMap,
} from "deso-protocol-types";
import difference from "lodash/difference";
import { FC, useContext, useEffect, useState } from "react";
import { IoLockClosedOutline } from "react-icons/io5";
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
  DEFAULT_KEY_MESSAGING_GROUP_NAME,
  MAX_MEMBERS_IN_GROUP_SUMMARY_SHOWN,
  MAX_MEMBERS_TO_REQUEST_IN_GROUP,
  MESSAGES_ONE_REQUEST_LIMIT,
  PUBLIC_KEY_LENGTH,
  PUBLIC_KEY_PREFIX,
} from "../utils/constants";
import {
  getChatNameFromConversation,
  hasSetupMessaging,
  scrollContainerToElement,
} from "../utils/helpers";
import { Conversation, ConversationMap } from "../utils/types";
import { ManageMembersDialog } from "./manage-members-dialog";
import { MessagingBubblesAndAvatar } from "./messaging-bubbles";
import {
  MessagingConversationAccount,
  MessagingGroupMembers,
} from "./messaging-conversation-accounts";
import { MessagingConversationButton } from "./messaging-conversation-button";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { MessagingSetupButton } from "./messaging-setup-button";
import { shortenLongWord } from "./search-users";
import { SendMessageButtonAndInput } from "./send-message-button-and-input";

export const MessagingApp: FC = () => {
  const { appUser, isLoadingUser } = useContext(UserContext);
  const [usernameByPublicKeyBase58Check, setUsernameByPublicKeyBase58Check] =
    useState<{ [key: string]: string }>({});
  const [autoFetchConversations, setAutoFetchConversations] = useState(false);
  const [pubKeyPlusGroupName, setPubKeyPlusGroupName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedConversationPublicKey, setSelectedConversationPublicKey] =
    useState("");
  const [conversations, setConversations] = useState<ConversationMap>({});
  const [membersByGroupKey, setMembersByGroupKey] = useState<{
    [groupKey: string]: PublicKeyToProfileEntryResponseMap;
  }>({});
  const { isMobile } = useMobile();

  useEffect(() => {
    if (!appUser) return;
    if (hasSetupMessaging(appUser)) {
      setAutoFetchConversations(true);
      rehydrateConversation("", false, !isMobile, isLoadingUser);
    }
  }, [appUser, isMobile]);

  useEffect(() => {
    if (conversations[selectedConversationPublicKey]) {
      const chatName = getChatNameFromConversation(
        conversations[selectedConversationPublicKey],
        usernameByPublicKeyBase58Check
      );

      if (chatName) {
        document.title = [chatName, "DeSo Chat Protocol"].join(" · ");
      }
    }

    return () => {
      document.title = "DeSo Chat Protocol";
    };
  }, [
    selectedConversationPublicKey,
    conversations,
    usernameByPublicKeyBase58Check,
  ]);

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
    autoScroll: boolean = false,
    selectConversation: boolean = true,
    userChange: boolean = false,
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
    setConversations(conversationsResponse);
    await getConversation(keyToUse, conversationsResponse);
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
    currentConversations = conversations,
    skipLoading: boolean = false
  ) => {
    if (!appUser) {
      toast.error("You must be logged in to use this feature");
      return;
    }

    const currentConvo = currentConversations[pubKeyPlusGroupName];
    if (!currentConvo) {
      return;
    }
    const convo = currentConvo.messages;
    setLoading(!skipLoading);

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

      setConversations(updatedConversations);
      setPubKeyPlusGroupName(pubKeyPlusGroupName);
    } else {
      if (!convo) {
        setPubKeyPlusGroupName(pubKeyPlusGroupName);
        setLoading(false);
        return;
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

      setConversations(updatedConversations);
      setPubKeyPlusGroupName(pubKeyPlusGroupName);
    }

    setLoading(false);
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
    <div className="h-screen flex">
      {(!conversationsReady || !hasSetupMessaging(appUser) || isLoadingUser) && (
        <div className="m-auto relative -top-8">
          <Card className="w-full md:w-[600px] m-auto p-8 bg-blue-900/10 backdrop-blur-xl">
            <CardBody>
              {autoFetchConversations && (
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
              {!autoFetchConversations && !hasSetupMessaging(appUser) && !isLoadingUser && (
                <>
                  <div>
                    {appUser ? (
                      <div>
                        <h2 className="text-2xl font-bold mb-3 text-white">
                          Set up your account
                        </h2>
                        <p className="text-lg mb-6 text-blue-300/60">
                          It seems like your account needs more configuration to
                          be able to send messages. Press the button below to
                          set it up automatically
                        </p>
                      </div>
                    ) : (
                      <div>
                        <h2 className="text-2xl font-bold mb-3 text-white">
                          DeSo Chat Protocol
                        </h2>
                        <p className="text-md mb-5 text-blue-300/60">
                          Censorship-resistant and fully on-chain messaging
                          protocol — with end-to-end encrypted messaging support
                          for direct messages and group chats. Message any wallet on DeSo or Ethereum.
                        </p>
                        <p className="mb-6 text-md text-blue-300/60">
                          A truly{" "}
                          <strong className="text-blue-200">
                            first of its kind.
                          </strong>
                        </p>                                           
                      </div>
                    )}
                  </div>
                  <MessagingSetupButton />
                  <p className="mt-5 text-md text-blue-300/40">
                    This chat framework is open-sourced. It can be found <a target="_blank" className="underline" href="https://github.com/deso-protocol/deso-chat-protocol">on Github</a>
                  </p> 
                  <p className="mt-1 text-md text-blue-300/40">
                    Curious about building on DeSo? <a className="underline" href="https://docs.deso.org">Read our developer docs</a>
                  </p> 
                </>
              )}

              {!autoFetchConversations && hasSetupMessaging(appUser) && (
                <MessagingConversationButton onClick={rehydrateConversation} />
              )}
            </CardBody>
          </Card>
        </div>
      )}
      {(hasSetupMessaging(appUser) && conversationsReady && appUser && !isLoadingUser) && (
        <div className="flex h-full">
          <Card className="w-full md:w-[400px] border-r border-blue-800/30 bg-black/40 rounded-none border-solid shrink-0">
            <MessagingConversationAccount
              rehydrateConversation={rehydrateConversation}
              onClick={async (key: string) => {
                setSelectedConversationPublicKey(key);
                await getConversation(key);
              }}
              membersByGroupKey={membersByGroupKey}
              conversations={conversations}
              getUsernameByPublicKeyBase58Check={usernameByPublicKeyBase58Check}
              selectedConversationPublicKey={selectedConversationPublicKey}
            />
          </Card>

          <div
            className={`w-full md:w-[calc(100vw-400px)] bg-[#050e1d] md:ml-0 md:z-auto ${
              selectedConversationPublicKey ? "ml-[-100%] z-50" : ""
            }`}
          >
            <header
              className={`flex justify-between items-center border-b border-b-blue-200/20 relative px-5 md:px-4 py-2 ${
                !isGroupOwner ? "md:hidden" : ""
              }`}
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
              <div className="text-blue-300/70 items-center text-sm hidden md:block">
                You're the<strong> owner of this group</strong>
              </div>

              <div className="flex justify-end">
                {isGroupOwner ? (
                  <ManageMembersDialog
                    conversation={selectedConversation}
                    onSuccess={rehydrateConversation}
                  />
                ) : selectedConversation && isGroupChat ? (
                  <MessagingGroupMembers
                    membersMap={
                      membersByGroupKey[selectedConversationPublicKey] || {}
                    }
                    maxMembersShown={2}
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
              className={`pr-2 rounded-none w-[100%] bg-transparent ml-[calc-400px] pb-0 h-[calc(100%-40px)] ${
                isGroupOwner ? "" : "md:h-full"
              }`}
            >
              <div className="border-none flex flex-col justify-between h-[calc(100%-60px)]">
                <div className="max-h-[calc(100%-130px)] overflow-hidden">
                  {loading ? (
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
                        OwnerPublicKeyBase58Check: appUser.PublicKeyBase58Check,
                        AccessGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
                      },
                      RecipientInfo: {
                        OwnerPublicKeyBase58Check: recipientPublicKey,
                        AccessGroupKeyName: recipientAccessGroupKeyName,
                      },
                      MessageInfo: {
                        TimestampNanos,
                      },
                    };
                    // Put this new message into the conversations object.
                    const newMessages =
                      conversations[selectedConversationPublicKey].messages;
                    newMessages.unshift(
                      mockMessage as DecryptedMessageEntryResponse
                    );
                    setConversations((prevConversations) => ({
                      ...prevConversations,
                      [selectedConversationPublicKey]: {
                        ...prevConversations[selectedConversationPublicKey],
                        ...{
                          messages: newMessages,
                        },
                      },
                    }));
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
                          ...{
                            messages: newMessages,
                          },
                        },
                      }));
                      toast.error(
                        `An error occurred while sending your message. Error: ${e.toString()}`
                      );
                      // Rethrow the error so that the caller can handle it.
                      return Promise.reject(e);
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
