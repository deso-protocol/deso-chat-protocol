import { FC, useContext, useEffect, useState } from 'react';
import { getDerivedKeyResponse } from '../utils/store';
import { SendMessageButtonAndInput } from './send-message-button-and-input';
import { getConversations } from '../services/conversations.service';
import { MessagingSetupButton } from './messaging-setup-button';
import { MessagingConversationButton } from './messaging-conversation-button';
import { MessagingConversationAccount, MessagingGroupMembers } from './messaging-conversation-accounts';
import { MessagingBubblesAndAvatar } from './messaging-bubbles';
import ClipLoader from 'react-spinners/ClipLoader';
import {
  ChatType,
  DecryptedMessageEntryResponse,
  DerivedPrivateUserInfo,
  NewMessageEntryResponse,
  PublicKeyToProfileEntryResponseMap,
} from 'deso-protocol-types';
import { decryptAccessGroupMessages, encryptAndSendNewMessage } from "../services/crypto-utils.service";
import { ManageMembersDialog } from "./manage-members-dialog";
import { Card, CardBody } from "@material-tailwind/react";
import { DesoContext } from "../contexts/desoContext";
import {
  DEFAULT_KEY_MESSAGING_GROUP_NAME,
  MAX_MEMBERS_IN_GROUP_SUMMARY_SHOWN,
  MAX_MEMBERS_TO_REQUEST_IN_GROUP,
  MESSAGES_ONE_REQUEST_LIMIT,
  PUBLIC_KEY_LENGTH,
  PUBLIC_KEY_PREFIX
} from "../utils/constants";
import difference from "lodash/difference";
import { toast } from "react-toastify";
import { getChatNameFromConversation, scrollContainerToElement } from "../utils/helpers";
import { Conversation, ConversationMap } from "../utils/types";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { useMobile } from "../hooks/useMobile";
import { shortenLongWord } from "./search-users";

export const MessagingApp: FC = () => {
  const { deso, hasSetupAccount, setHasSetupAccount, setLoggedInPublicKey } = useContext(DesoContext);

  const [usernameByPublicKeyBase58Check, setUsernameByPublicKeyBase58Check] = useState<{ [key: string]: string }>({});
  const [derivedResponse, setDerivedResponse] = useState<Partial<DerivedPrivateUserInfo>>({});
  const [autoFetchConversations, setAutoFetchConversations] = useState(false);
  const [pubKeyPlusGroupName, setPubKeyPlusGroupName] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedConversationPublicKey, setSelectedConversationPublicKey] = useState('');
  const [conversations, setConversations] = useState<ConversationMap>({});
  const [membersByGroupKey, setMembersByGroupKey] = useState<{ [groupKey: string]: PublicKeyToProfileEntryResponseMap }>({});
  const { isMobile } = useMobile();

  useEffect(() => {
    const init = async () => {
      const key = deso.identity.getUserKey();

      if (key) {
        const derivedResponse = getDerivedKeyResponse(key); //have they set a derived key before?
        const hasSetupMessagingAlready = !!derivedResponse.derivedPublicKeyBase58Check;

        setHasSetupAccount(hasSetupMessagingAlready);
        setLoggedInPublicKey(key);

        if (hasSetupMessagingAlready) {
          setAutoFetchConversations(true);
          setDerivedResponse(derivedResponse);
          await rehydrateConversation(undefined, false, !isMobile);
        }
      }
    };

    init();
  }, []);

  useEffect(() => {
    if (conversations[selectedConversationPublicKey]) {
      const chatName = getChatNameFromConversation(conversations[selectedConversationPublicKey], usernameByPublicKeyBase58Check);

      if (chatName) {
        document.title = ([chatName, "DeSo Chat Protocol"].join(" · "));
      }
    }

    return () => {
      document.title = "DeSo Chat Protocol";
    }
  }, [selectedConversationPublicKey, conversations, usernameByPublicKeyBase58Check]);

  const fetchUsersStateless = async (newPublicKeysToGet: Array<string>) => {
    const diff = difference(newPublicKeysToGet, Object.keys(usernameByPublicKeyBase58Check))

    if (diff.length === 0) {
      return Promise.resolve(usernameByPublicKeyBase58Check);
    }

    return await deso.user.getUsersStateless({
      PublicKeysBase58Check: Array.from(newPublicKeysToGet),
      SkipForLeaderboard: true,
    })
      .then((usersStatelessResponse) => {
        const newPublicKeyToUsernames: { [k: string]: string } = {};

        (usersStatelessResponse.UserList || []).forEach((u) => {
          if (u.ProfileEntryResponse?.Username) {
            newPublicKeyToUsernames[u.PublicKeyBase58Check] = u.ProfileEntryResponse.Username;
          }
        });

        setUsernameByPublicKeyBase58Check(state => ({
          ...state,
          ...newPublicKeyToUsernames
        }));
        return usernameByPublicKeyBase58Check;
      })
  }

  const fetchGroupMembers = async (conversation: Conversation) => {
    if (conversation.ChatType !== ChatType.GROUPCHAT) {
      return;
    }

    const { AccessGroupKeyName, OwnerPublicKeyBase58Check } = conversation.messages[0].RecipientInfo;

    const { PublicKeyToProfileEntryResponse } = await deso.accessGroup.GetPaginatedAccessGroupMembers({
      AccessGroupOwnerPublicKeyBase58Check: OwnerPublicKeyBase58Check,
      AccessGroupKeyName,
      MaxMembersToFetch: MAX_MEMBERS_TO_REQUEST_IN_GROUP + MAX_MEMBERS_IN_GROUP_SUMMARY_SHOWN
    });

    setMembersByGroupKey(state => ({
      ...state,
      [`${OwnerPublicKeyBase58Check}${AccessGroupKeyName}`]: PublicKeyToProfileEntryResponse
    }));

    return PublicKeyToProfileEntryResponse;
  }

  const rehydrateConversation = async (selectedKey = '', autoScroll: boolean = false, selectConversation: boolean = true) => {
    const key = deso.identity.getUserKey() as string;
    const [res, publicKeyToProfileEntryResponseMap] = await getConversations(
      // gives us all the conversations
      deso,
      getDerivedKeyResponse(key),
    );
    let conversationsResponse = res || {};
    const keyToUse =
      selectedKey ||
      selectedConversationPublicKey ||
      Object.keys(conversationsResponse)[0];
    if (!conversationsResponse[keyToUse]) {
      // This is just to make the search bar work. we have 0 messages in this thread originally.
      conversationsResponse = {
        [keyToUse]: {
          ChatType: ChatType.DM,
          firstMessagePublicKey: keyToUse.slice(0, PUBLIC_KEY_LENGTH),
          messages: [],
        },
        ...conversationsResponse
      }
    }

    const DMChats = Object.values(conversationsResponse).filter(e => e.ChatType === ChatType.DM);
    const GroupChats = Object.values(conversationsResponse).filter(e => e.ChatType === ChatType.GROUPCHAT);

    const publicKeyToUsername: { [k: string]: string } = {};
    Object.entries(publicKeyToProfileEntryResponseMap).forEach(([publicKey, profileEntryResponse]) => publicKeyToUsername[publicKey] = profileEntryResponse?.Username || '');
    setUsernameByPublicKeyBase58Check(state => ({ ...state, ...publicKeyToUsername }));
    await Promise.all(DMChats.map(e => updateUsernameToPublicKeyMapFromMessages(e.messages, e.firstMessagePublicKey)));
    await Promise.all(GroupChats.map(e => fetchGroupMembers(e)));

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

  const updateUsernameToPublicKeyMapFromMessages = async (messages: NewMessageEntryResponse[], firstMessagePublicKey: string) => {
    const newPublicKeysToGet = new Set<string>([firstMessagePublicKey]);

    messages.forEach((m: NewMessageEntryResponse) => {
      newPublicKeysToGet.add(m.RecipientInfo.OwnerPublicKeyBase58Check);
      newPublicKeysToGet.add(m.SenderInfo.OwnerPublicKeyBase58Check);
    });

    return await fetchUsersStateless(Array.from(newPublicKeysToGet));
  }

  // TODO: add support pagination
  const getConversation = async (
    pubKeyPlusGroupName: string,
    currentConversations = conversations,
    skipLoading: boolean = false,
  ) => {
    const currentConvo = currentConversations[pubKeyPlusGroupName];
    if (!currentConvo) {
      return;
    }
    const convo = currentConvo.messages;
    setLoading(!skipLoading);

    const myAccessGroups = await deso.accessGroup.GetAllUserAccessGroups({
      PublicKeyBase58Check: deso.identity.getUserKey() as string,
    })
    const allMyAccessGroups = Array.from(new Set([...(myAccessGroups.AccessGroupsOwned || []), ...(myAccessGroups.AccessGroupsMember || [])]))
    const derivedKeyResponse = getDerivedKeyResponse(deso.identity.getUserKey() as string);
    if (currentConvo.ChatType === ChatType.DM) {
      const messages = await deso.accessGroup.GetPaginatedMessagesForDmThread({
        UserGroupOwnerPublicKeyBase58Check: deso.identity.getUserKey() as string,
        UserGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
        PartyGroupOwnerPublicKeyBase58Check: currentConvo.firstMessagePublicKey,
        PartyGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
        MaxMessagesToFetch: MESSAGES_ONE_REQUEST_LIMIT,
        StartTimeStamp: new Date().valueOf() * 1e6,
      });

      const decrypted = decryptAccessGroupMessages(
        deso.identity.getUserKey() as string,
        messages.ThreadMessages,
        allMyAccessGroups,
        { decryptedKey: derivedKeyResponse.messagingPrivateKey as string }
      )

      const updatedConversations = {
        ...currentConversations,
        ...{
          [pubKeyPlusGroupName]: {
            firstMessagePublicKey: decrypted.length ? decrypted[0].IsSender ? decrypted[0].RecipientInfo.OwnerPublicKeyBase58Check : decrypted[0].SenderInfo.OwnerPublicKeyBase58Check : currentConvo.firstMessagePublicKey,
            messages: decrypted,
            ChatType: ChatType.DM,
          },
        }
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
      const messages = await deso.accessGroup.GetPaginatedMessagesForGroupChatThread({
        UserPublicKeyBase58Check: firstMessage.RecipientInfo.OwnerPublicKeyBase58Check,
        AccessGroupKeyName: firstMessage.RecipientInfo.AccessGroupKeyName,
        StartTimeStamp: firstMessage.MessageInfo.TimestampNanos * 10,
        MaxMessagesToFetch: MESSAGES_ONE_REQUEST_LIMIT,
      });

      const decrypted = decryptAccessGroupMessages(
        deso.identity.getUserKey() as string,
        messages.GroupChatMessages,
        allMyAccessGroups,
        { decryptedKey: derivedKeyResponse.messagingPrivateKey as string }
      );

      const updatedConversations = {
        ...currentConversations,
        ...{
          [pubKeyPlusGroupName]: {
            firstMessagePublicKey: firstMessage.RecipientInfo.OwnerPublicKeyBase58Check,
            messages: decrypted,
            ChatType: ChatType.GROUPCHAT,
          },
        }
      };

      setConversations(updatedConversations);
      setPubKeyPlusGroupName(pubKeyPlusGroupName);
    }

    setLoading(false);
  }

  const getCurrentChatName = () => {
    if (!selectedConversation || !Object.keys(activeChatUsersMap).length) {
      return "";
    }

    const name = getChatNameFromConversation(selectedConversation, activeChatUsersMap);
    return name || shortenLongWord(selectedConversation.messages[0].RecipientInfo.OwnerPublicKeyBase58Check) || "";
  }

  const conversationsReady = Object.keys(conversations).length > 0;
  const selectedConversation = conversations[selectedConversationPublicKey];
  const isGroupChat = selectedConversation?.ChatType === ChatType.GROUPCHAT;
  const isChatOwner = isGroupChat && selectedConversation?.messages[0]?.RecipientInfo?.OwnerPublicKeyBase58Check === deso.identity.getUserKey() as string;
  const isGroupOwner = isGroupChat && isChatOwner;
  const chatMembers = membersByGroupKey[selectedConversationPublicKey];
  const activeChatUsersMap = isGroupChat
    ? Object.keys(chatMembers).reduce((acc, curr) => ({ ...acc, [curr]: chatMembers[curr]?.Username || "" }), {})
    : usernameByPublicKeyBase58Check;

  return (
    <div className="h-full">
      {!conversationsReady && (
        <div className="py-20">
          <Card className="w-full md:w-[600px] m-auto p-8 bg-blue-900/10 backdrop-blur-xl">
            <CardBody>
              {autoFetchConversations && (
                <div className="text-center">
                  <span className="font-bold text-white text-xl">Loading Your Chat Experience</span>
                  <br /><ClipLoader color={'#6d4800'} loading={true} size={44} className="mt-4" />
                </div>
              )}
              {!autoFetchConversations && !hasSetupAccount && (
                <>
                  <div>
                    {
                      deso.identity.getUserKey()
                        ? (
                          <div>
                            <h2 className="text-2xl font-bold mb-3 text-white">Set up your account</h2>
                            <p className="text-lg mb-5 text-blue-300/60">
                              It seems like your account needs more configuration to be able to send messages.
                              Press the button below to set it up automatically
                            </p>
                          </div>
                        )
                        : (
                          <div>
                            <h2 className="text-2xl font-bold mb-3 text-white">DeSo Chat Protocol</h2>
                            <p className="text-lg mb-3 text-blue-300/60">
                              Censorship-resistant and fully on-chain messaging
                              protocol — with end-to-end encrypted messaging support for direct messages and group
                              chats.
                            </p>
                            <p className="mb-5 text-lg text-blue-300/60">
                              A truly <strong className="text-blue-200">first-of-its kind.</strong>
                            </p>
                          </div>
                        )
                    }

                  </div>

                  <MessagingSetupButton
                    setDerivedResponse={setDerivedResponse}
                  />
                </>
              )}

              {!autoFetchConversations && hasSetupAccount && (
                <MessagingConversationButton
                  onClick={rehydrateConversation}
                />
              )}
            </CardBody>
          </Card>
        </div>
      )}
      {conversationsReady && (
        <div className="flex h-full">
          <Card className="w-full md:w-[400px] border-r border-blue-800/30 bg-black/40 rounded-none border-solid shrink-0">
            <MessagingConversationAccount
              rehydrateConversation={rehydrateConversation}
              onClick={async (key: string) => {
                setSelectedConversationPublicKey(key);
                await getConversation(key);
              }}
              membersByGroupKey={membersByGroupKey}
              deso={deso}
              conversations={conversations}
              getUsernameByPublicKeyBase58Check={
                usernameByPublicKeyBase58Check
              }
              selectedConversationPublicKey={selectedConversationPublicKey}
              derivedResponse={derivedResponse}
            />
          </Card>

          <div className={`w-full md:w-[calc(100vw-400px)] bg-[#050e1d] md:ml-0 md:z-auto ${selectedConversationPublicKey ? 'ml-[-100%] z-50' : ''}`}>

            <header className={`flex justify-between items-center relative px-5 md:px-4 h-[69px] ${!isGroupOwner ? "md:hidden" : ""}`}>
              <div className="cursor-pointer py-4 pl-0 pr-6 md:hidden" onClick={() => {
                setSelectedConversationPublicKey("");
              }}>
                <img src="/assets/left-chevron.png" width={20} alt="back" />
              </div>
              {
                selectedConversation && selectedConversation.messages[0] && (
                  <div className="text-white font-bold text-lg truncate px-2 md:hidden">
                    {!isGroupChat && !getCurrentChatName().startsWith(PUBLIC_KEY_PREFIX) ? "@" : ""}{getCurrentChatName()}
                  </div>
                )
              }
              <div className="text-blue-300/70 hidden md:block">
                You're the<b>{" "}owner of this group</b>
              </div>

              <div className="flex justify-end">
                {
                  isGroupOwner
                    ? (
                      <ManageMembersDialog
                        conversation={selectedConversation}
                        derivedResponse={derivedResponse}
                        onSuccess={rehydrateConversation}
                      />
                    )
                    : (
                      selectedConversation && isGroupChat
                        ? (
                          <MessagingGroupMembers
                            membersMap={membersByGroupKey[selectedConversationPublicKey] || {}}
                            maxMembersShown={2}
                          />
                        )
                        : (selectedConversation && selectedConversation.messages[0] && (
                          <MessagingDisplayAvatar
                            username={activeChatUsersMap[selectedConversation.messages[0].RecipientInfo.OwnerPublicKeyBase58Check]}
                            publicKey={selectedConversation.messages[0].RecipientInfo.OwnerPublicKeyBase58Check}
                            diameter={40}
                          />
                        ))
                    )
                }
              </div>
            </header>

            <Card
              className={`p-4 pr-2 rounded-none w-[100%] bg-transparent ml-[calc-400px] pb-0 h-[calc(100%-69px)] ${isGroupOwner ? '' : 'md:h-full'}`}>
              <div className="border-none flex flex-col justify-between h-full">
                <div className="max-h-[calc(100%-130px)] overflow-hidden">
                  {
                    loading
                      ? <ClipLoader color={'#6d4800'} loading={true} size={44} className="mt-4" />
                      : (
                        <MessagingBubblesAndAvatar
                          deso={deso}
                          conversationPublicKey={pubKeyPlusGroupName}
                          conversations={conversations}
                          getUsernameByPublicKey={activeChatUsersMap}
                        />
                      )
                  }
                </div>

                <SendMessageButtonAndInput
                  key={selectedConversationPublicKey}
                  onClick={async (messageToSend: string) => {
                    // Generate a mock message to display in the UI to give
                    // the user immediate feedback.
                    const TimestampNanos = new Date().getTime() * 1e6;
                    const recipientPublicKey = selectedConversation.ChatType === ChatType.DM ?
                      selectedConversation.firstMessagePublicKey :
                      selectedConversation.messages[0].RecipientInfo.OwnerPublicKeyBase58Check;
                    const recipientAccessGroupKeyName = selectedConversation.ChatType === ChatType.DM ?
                        DEFAULT_KEY_MESSAGING_GROUP_NAME :
                        selectedConversation.messages[0].RecipientInfo.AccessGroupKeyName;
                    const mockMessage = {
                      DecryptedMessage: messageToSend,
                      IsSender: true,
                      SenderInfo: {
                        OwnerPublicKeyBase58Check: deso.identity.getUserKey() as string,
                        AccessGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
                      },
                      RecipientInfo: {
                        OwnerPublicKeyBase58Check: recipientPublicKey,
                        AccessGroupKeyName: recipientAccessGroupKeyName,
                      },
                      MessageInfo: {
                        TimestampNanos,
                      }
                    };
                    // Put this new message into the conversations object.
                    const newMessages = conversations[selectedConversationPublicKey].messages;
                    newMessages.unshift(mockMessage as DecryptedMessageEntryResponse);
                    setConversations((prevConversations) => ({
                      ...prevConversations,
                      [selectedConversationPublicKey]: {
                        ...prevConversations[selectedConversationPublicKey],
                        ...{
                          messages: newMessages,
                        }
                      }
                    }))
                    try {
                      // Try sending the message
                      await encryptAndSendNewMessage(
                        deso,
                        messageToSend,
                        derivedResponse.derivedSeedHex as string,
                        derivedResponse.messagingPrivateKey as string,
                        recipientPublicKey,
                        true,
                        recipientAccessGroupKeyName,
                        DEFAULT_KEY_MESSAGING_GROUP_NAME,
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
                          }
                        }
                      }));
                      toast.error(`An error occurred while sending your message. Error: ${e.toString()}`);
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
