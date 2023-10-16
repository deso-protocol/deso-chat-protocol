import { UserContext } from "contexts/UserContext";
import {
  ChatType,
  DecryptedMessageEntryResponse,
  getPaginatedDMThread,
  getPaginatedGroupChatThread,
  GetPaginatedMessagesForDmThreadResponse,
  GetPaginatedMessagesForGroupChatThreadResponse,
} from "deso-protocol";
import { FC, useContext, useEffect, useRef, useState } from "react";
import InfiniteScroll from "react-infinite-scroll-component";
import ReactLinkify from "react-linkify";
import ClipLoader from "react-spinners/ClipLoader";
import { toast } from "react-toastify";
import { useMobile } from "../hooks/useMobile";
import { decryptAccessGroupMessagesWithRetry } from "../services/conversations.service";
import {
  DEFAULT_KEY_MESSAGING_GROUP_NAME,
  MESSAGES_ONE_REQUEST_LIMIT,
} from "../utils/constants";
import { ConversationMap } from "../utils/types";
import { MessagingDisplayAvatar } from "./messaging-display-avatar";
import { shortenLongWord } from "./search-users";

export interface MessagingBubblesProps {
  conversations: ConversationMap;
  conversationPublicKey: string;
  getUsernameByPublicKey: { [k: string]: string };
  onScroll: (e: Array<DecryptedMessageEntryResponse>) => void;
}

function convertTstampToDateTime(tstampNanos: number) {
  const date = new Date(tstampNanos / 1e6);
  const currentDate = new Date();
  if (date.getFullYear() !== currentDate.getFullYear()) {
    const yearsAgo = currentDate.getFullYear() - date.getFullYear();
    if (yearsAgo === 1) {
      return "a year ago";
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

export const MessagingBubblesAndAvatar: FC<MessagingBubblesProps> = ({
  conversations,
  conversationPublicKey,
  getUsernameByPublicKey,
  onScroll,
}: MessagingBubblesProps) => {
  const messageAreaRef = useRef<HTMLDivElement>(null);
  const { appUser, allAccessGroups, setAllAccessGroups } =
    useContext(UserContext);
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

    setVisibleMessages(conversation.messages);

    const scrollableArea = messageAreaRef.current;

    if (!scrollableArea) {
      return;
    }

    if (isMobile) {
      scrollableArea.classList.remove("overflow-auto");
      scrollableArea.classList.add("overflow-hidden");
    }

    const hasUnreadMessages =
      visibleMessages.length &&
      visibleMessages[0].MessageInfo.TimestampNanosString !==
        conversation.messages[0].MessageInfo.TimestampNanosString;
    const isLastMessageFromMe =
      conversation.messages.length && conversation.messages[0].IsSender;

    const element = scrollableArea;

    if (isMobile) {
      scrollableArea.classList.remove("overflow-hidden");
      scrollableArea.classList.add("overflow-auto");
    }

    if (
      hasUnreadMessages &&
      isLastMessageFromMe &&
      (isMobile || element.scrollTop !== 0)
    ) {
      // Always scroll to the last message if it's a new message from the current user
      setTimeout(() => {
        const scrollerStub = element.querySelector(".scroller-end-stub");
        scrollerStub &&
          scrollerStub.scrollIntoView({
            behavior: "smooth",
          });
      }, 500);
    }
  }, [conversations, conversationPublicKey, isMobile]);

  if (Object.keys(conversations).length === 0 || conversationPublicKey === "") {
    return <div></div>;
  }

  const loadMore = async () => {
    if (!appUser) {
      toast.error("You must be logged in to load more messages");
      return;
    }

    if (visibleMessages.length < MESSAGES_ONE_REQUEST_LIMIT) {
      setAllowScrolling(false);
      return;
    }

    const StartTimeStampString =
      visibleMessages[visibleMessages.length - 1].MessageInfo
        .TimestampNanosString;

    const dmOrGroupChatMessages = await (conversation.ChatType === ChatType.DM
      ? getPaginatedDMThread({
          UserGroupOwnerPublicKeyBase58Check: appUser.PublicKeyBase58Check,
          UserGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
          PartyGroupOwnerPublicKeyBase58Check: (visibleMessages[0].IsSender
            ? visibleMessages[0].RecipientInfo
            : visibleMessages[0].SenderInfo
          ).OwnerPublicKeyBase58Check,
          PartyGroupKeyName: DEFAULT_KEY_MESSAGING_GROUP_NAME,
          // FIXME:
          StartTimeStampString,
          MaxMessagesToFetch: MESSAGES_ONE_REQUEST_LIMIT,
        })
      : getPaginatedGroupChatThread({
          UserPublicKeyBase58Check:
            visibleMessages[visibleMessages.length - 1].RecipientInfo
              .OwnerPublicKeyBase58Check,
          AccessGroupKeyName:
            visibleMessages[visibleMessages.length - 1].RecipientInfo
              .AccessGroupKeyName,
          StartTimeStampString,
          MaxMessagesToFetch: MESSAGES_ONE_REQUEST_LIMIT,
        }));
    const messages =
      conversation.ChatType === ChatType.DM
        ? (dmOrGroupChatMessages as GetPaginatedMessagesForDmThreadResponse)
            .ThreadMessages
        : (
            dmOrGroupChatMessages as GetPaginatedMessagesForGroupChatThreadResponse
          ).GroupChatMessages;

    const publicKeyToProfileEntryResponseMap =
      dmOrGroupChatMessages.PublicKeyToProfileEntryResponse;
    Object.entries(publicKeyToProfileEntryResponseMap).forEach(
      ([publicKey, profileEntryResponse]) => {
        getUsernameByPublicKey[publicKey] =
          profileEntryResponse?.Username || "";
      }
    );

    if (messages.length < MESSAGES_ONE_REQUEST_LIMIT) {
      setAllowScrolling(false);
    }

    if (messages.length === 0) {
      return;
    }

    const { decrypted, updatedAllAccessGroups } =
      await decryptAccessGroupMessagesWithRetry(
        appUser.PublicKeyBase58Check,
        messages,
        allAccessGroups
      );
    setAllAccessGroups(updatedAllAccessGroups);

    onScroll(decrypted);
  };

  return (
    <div
      className="h-full flex flex-col-reverse custom-scrollbar px-2 md:px-4 md:overflow-y-auto"
      ref={messageAreaRef}
      id="scrollableArea"
    >
      <InfiniteScroll
        dataLength={conversation.messages.length}
        next={loadMore}
        style={{ display: "flex", flexDirection: "column-reverse" }}
        inverse={true}
        hasMore={allowScrolling}
        loader={
          <h4 className="my-4 flex items-center justify-center">
            <ClipLoader
              color={"#0d3679"}
              loading={true}
              size={16}
              className="mr-2"
            />
            Loading...
          </h4>
        }
        scrollableTarget="scrollableArea"
      >
        <div className="scroller-end-stub"></div>

        {visibleMessages.map((message, i: number) => {
          const messageToShow = message.DecryptedMessage || message.error;
          let senderStyles =
            "bg-blue-200/20 text-blue-100 rounded-2xl rounded-tl-none rounded-bl-xl pl-5";
          const IsSender =
            message.IsSender ||
            message.SenderInfo.OwnerPublicKeyBase58Check ===
              appUser?.PublicKeyBase58Check;

          if (IsSender) {
            senderStyles =
              "bg-blue-900/70 text-blue-100 rounded-2xl rounded-tr-none rounded-br-xl pl-5";
          }
          if (message.error) {
            senderStyles = "bg-red-500 text-red-100";
          }

          const timestamp = (
            <div
              className={`whitespace-nowrap text-xs text-blue-100/30 mt-2 ${
                IsSender ? "text-right" : "text-left"
              }`}
            >
              {convertTstampToDateTime(message.MessageInfo.TimestampNanos)}
            </div>
          );

          const messagingDisplayAvatarAndTimestamp = (
            <div
              className={`flex flex-col ${IsSender ? "ml-3" : "mr-3"} relative`}
            >
              <MessagingDisplayAvatar
                username={
                  getUsernameByPublicKey[
                    message.SenderInfo.OwnerPublicKeyBase58Check
                  ]
                }
                publicKey={message.SenderInfo.OwnerPublicKeyBase58Check}
                diameter={40}
                classNames="relative"
              />
              {timestamp}
            </div>
          );

          return (
            <div
              className={`mx-0 last:pt-4 ${
                IsSender ? "ml-auto justify-end" : "mr-auto justify-start"
              } max-w-[75%] mb-4 inline-flex items-start top-[20px] text-left`}
              key={`message-${i}`}
            >
              {!IsSender && messagingDisplayAvatarAndTimestamp}
              <div
                className={`w-full ${IsSender ? "text-right" : "text-left"}`}
              >
                <header
                  className={`flex items-center justify-end mb-[3px] ${
                    IsSender ? "flex-row" : "flex-row-reverse"
                  }`}
                >
                  <span className="mx-1"> </span>
                  <div className="text-sm mb-1">
                    <p className="text-blue-300/80 text-xs">
                      {getUsernameByPublicKey[
                        message.SenderInfo.OwnerPublicKeyBase58Check
                      ]
                        ? `@${
                            getUsernameByPublicKey[
                              message.SenderInfo.OwnerPublicKeyBase58Check
                            ]
                          }`
                        : shortenLongWord(
                            message.SenderInfo.OwnerPublicKeyBase58Check
                          )}
                    </p>
                  </div>
                </header>
                <div
                  className={`${senderStyles} mt-auto mb-2 md:mb-5 py-2 px-2 md:px-4 text-white break-words inline-flex text-left relative items-center`}
                >
                  <div
                    className="text-md break-words whitespace-pre-wrap"
                    id="message-text"
                  >
                    <ReactLinkify>{messageToShow}</ReactLinkify>
                  </div>
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
