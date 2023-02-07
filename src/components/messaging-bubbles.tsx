import Deso from 'deso-protocol';
import { MessagingDisplayAvatar } from './messaging-display-avatar';
import { FC, useEffect, useRef, useState } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import { getDerivedKeyResponse } from "../utils/store";
import { decryptAccessGroupMessages } from "../services/crypto-utils.service";
import { MESSAGES_ONE_REQUEST_LIMIT } from "../utils/constants";
import {
  ChatType,
  GetPaginatedMessagesForDmThreadResponse,
  GetPaginatedMessagesForGroupChatThreadResponse,
} from "deso-protocol-types";
import { ConversationMap } from "../utils/types";
import { shortenLongWord } from "./search-users";
import { useMobile } from "../hooks/useMobile";

export interface MessagingBubblesProps {
  conversations: ConversationMap;
  conversationPublicKey: string;
  deso: Deso;
  getUsernameByPublicKey: { [k: string]: string };
}

function convertTstampToDateTime(tstampNanos: number) {
  const date = new Date(tstampNanos / 1e6);
  const currentDate = new Date();
  if (
    date.getFullYear() !== currentDate.getFullYear()) {
    const yearsAgo = currentDate.getFullYear() - date.getFullYear();
    if (yearsAgo === 1) {
      return 'a year ago';
    }
    return `${yearsAgo} years ago`;
  }
  if (
    date.getDate() !== currentDate.getDate() ||
    date.getMonth() !== currentDate.getMonth()
  ) {
    return date.toLocaleString("default", {
      month: "short",
      day: "numeric",
    });
  }

  return date.toLocaleString("default", { hour: "numeric", minute: "numeric" });
}

export const MessagingBubblesAndAvatar: FC<{
  conversations: ConversationMap;
  conversationPublicKey: string;
  deso: Deso;
  getUsernameByPublicKey: { [k: string]: string };
}> = ({
        conversations,
        conversationPublicKey,
        deso,
        getUsernameByPublicKey,
      }: MessagingBubblesProps) => {
  const messageAreaRef = useRef<HTMLDivElement>(null);

  const conversation = conversations[conversationPublicKey] ?? { messages: [] };
  const [allowScrolling, setAllowScrolling] = useState<boolean>(true);
  const [visibleMessages, setVisibleMessages] = useState(conversation.messages);
  const { isMobile } = useMobile();

  /*
  * In the useEffects below we set overflow to hidden, and when the messages get updated we set it back to auto.
  * This protects us from weird scroll jumps on mobile Safari and Chrome related to
  * reversed flex-direction and InfiniteScrolling
   */
  useEffect(() => {
    if (conversation.messages.length === 0) {
      setAllowScrolling(false);
    }

    if (isMobile) {
      messageAreaRef.current!.classList.remove("overflow-auto");
      messageAreaRef.current!.classList.add("overflow-hidden");
    }

    setVisibleMessages(conversation.messages);
  }, [conversations, conversationPublicKey]);

  useEffect(() => {
    const element = messageAreaRef.current!;

    if (isMobile) {
      messageAreaRef.current!.classList.remove("overflow-hidden");
      messageAreaRef.current!.classList.add("overflow-auto");
    }

    if (isMobile && element.scrollTop !== 0) {
      /*
      * Always scroll to the last message on mobile, desktop browsers update scroller
      * properly if it's staying on the very end
       */
      const scrollerStub = element.querySelector(".scroller-end-stub");
      scrollerStub && scrollerStub.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [visibleMessages]);

  if (Object.keys(conversations).length === 0 || conversationPublicKey === '') {
    return <div></div>;
  }

  const loadMore = async () => {
    if (visibleMessages.length < MESSAGES_ONE_REQUEST_LIMIT) {
      setAllowScrolling(false);
      return;
    }

    const StartTimeStampString = visibleMessages[visibleMessages.length -1].MessageInfo.TimestampNanosString;

    const [myAccessGroups, dmOrGroupChatMessages ] = await Promise.all([
      deso.accessGroup.GetAllUserAccessGroups({
        PublicKeyBase58Check: deso.identity.getUserKey() as string,
      }),
      conversation.ChatType === ChatType.DM ? deso.accessGroup.GetPaginatedMessagesForDmThread({
        UserGroupOwnerPublicKeyBase58Check: deso.identity.getUserKey() as string,
        UserGroupKeyName: 'default-key',
        PartyGroupOwnerPublicKeyBase58Check: (conversation.messages[0].IsSender ? conversation.messages[0].RecipientInfo : conversation.messages[0].SenderInfo).OwnerPublicKeyBase58Check,
        PartyGroupKeyName: 'default-key',
        StartTimeStampString,
        MaxMessagesToFetch: MESSAGES_ONE_REQUEST_LIMIT,
      }) : deso.accessGroup.GetPaginatedMessagesForGroupChatThread({
        UserPublicKeyBase58Check: visibleMessages[visibleMessages.length - 1].RecipientInfo.OwnerPublicKeyBase58Check,
        AccessGroupKeyName: visibleMessages[visibleMessages.length - 1].RecipientInfo.AccessGroupKeyName,
        StartTimeStampString,
        MaxMessagesToFetch: MESSAGES_ONE_REQUEST_LIMIT,
      })
    ])
    const allMyAccessGroups = Array.from(new Set([...(myAccessGroups.AccessGroupsOwned || []), ...(myAccessGroups.AccessGroupsMember || [])]));

    const derivedKeyResponse = getDerivedKeyResponse(deso.identity.getUserKey() as string);

    const messages = conversation.ChatType === ChatType.DM ? (dmOrGroupChatMessages as GetPaginatedMessagesForDmThreadResponse).ThreadMessages : (dmOrGroupChatMessages as GetPaginatedMessagesForGroupChatThreadResponse).GroupChatMessages;

    const publicKeyToProfileEntryResponseMap = dmOrGroupChatMessages.PublicKeyToProfileEntryResponse;
    Object.entries(publicKeyToProfileEntryResponseMap).forEach(([publicKey, profileEntryResponse]) => {
      getUsernameByPublicKey[publicKey] = profileEntryResponse?.Username || "";
    });

    if (messages.length < MESSAGES_ONE_REQUEST_LIMIT) {
      setAllowScrolling(false);
    }

    if (messages.length === 0) {
      return;
    }

    const decrypted = decryptAccessGroupMessages(
      deso.identity.getUserKey() as string,
      messages,
      allMyAccessGroups,
      { decryptedKey: derivedKeyResponse.messagingPrivateKey as string }
    );

    setVisibleMessages(prev => [...prev, ...decrypted]);
  }

  return (
    <div
      className="h-full flex flex-col-reverse custom-scrollbar px-2 md:px-4 md:overflow-y-auto"
      ref={messageAreaRef}
      id="scrollableArea"
    >
      <InfiniteScroll
        dataLength={visibleMessages.length}
        next={loadMore}
        style={{ display: 'flex', flexDirection: 'column-reverse' }}
        inverse={true}
        hasMore={allowScrolling}
        loader={<h4 className="my-4">Loading...</h4>}
        scrollableTarget="scrollableArea"
      >
        <div className="scroller-end-stub"></div>

        {visibleMessages.map((message, i: number) => {
          const messageToShow = message.DecryptedMessage || message.error;
          let senderStyles = 'bg-blue-900/70 text-blue-100';
          // ugh we have to modify "isSender" in here because things are dumb.
          const IsSender = message.IsSender || message.SenderInfo.OwnerPublicKeyBase58Check === deso.identity.getUserKey() as string;

          if (IsSender) {
            senderStyles = 'bg-blue-200/20 text-blue-100';
          }
          if (message.error) {
            senderStyles = 'bg-red-500 text-red-100';
          }

          const timestamp = (
            <div className={`text-xs text-blue-100/30 mt-1 ${IsSender ? 'text-right' : 'text-left'}`}>
              {convertTstampToDateTime(message.MessageInfo.TimestampNanos)}
            </div>
          )

          const messagingDisplayAvatarAndTimestamp = (
            <div className={`flex flex-col ${IsSender ? 'ml-3 md:ml-5' : 'mr-3 md:mr-5'} relative`}>
              <MessagingDisplayAvatar
                username={getUsernameByPublicKey[message.SenderInfo.OwnerPublicKeyBase58Check]}
                publicKey={message.SenderInfo.OwnerPublicKeyBase58Check}
                diameter={40}
                classNames="relative"
              />
              {timestamp}
            </div>
          )

          return (
            <div
              className={`mx-0 last:pt-4 ${
                IsSender ? 'ml-auto justify-end' : 'mr-auto justify-start'
              } max-w-[75%] mb-4 inline-flex items-center text-left`}
              key={`message-${i}`}
            >
              {!IsSender && messagingDisplayAvatarAndTimestamp}
              <div className={`w-full ${IsSender ? 'text-right' : 'text-left'}`}>
                <header className={`flex items-center justify-end mb-[3px] mx-1 ${IsSender ? 'flex-row' : 'flex-row-reverse'}`}>                
                  <span className="mx-1">{" "}</span>
                  <div className="text-sm mb-1">
                    <p className="text-blue-300/80">
                      {getUsernameByPublicKey[message.SenderInfo.OwnerPublicKeyBase58Check]
                        ? `@${getUsernameByPublicKey[message.SenderInfo.OwnerPublicKeyBase58Check]}`
                        : shortenLongWord(message.SenderInfo.OwnerPublicKeyBase58Check)}
                    </p>
                  </div>
                </header>
                <div className={`${senderStyles} mt-auto mb-5 py-2 px-4 rounded-3xl text-white break-words inline-flex text-left relative items-center w-full`}>
                  <div className="text-md break-words">{messageToShow}</div>
                </div>
              </div>
              {IsSender && messagingDisplayAvatarAndTimestamp}
            </div>
          );
        })}
      </InfiniteScroll>
    </div>
  );
};